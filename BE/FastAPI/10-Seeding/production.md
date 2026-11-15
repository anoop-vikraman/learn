# Seeding in production

## 1. Checklist

> **In short:** Rules for what may be seeded in production and how.

- [ ] Only **reference data** and **bootstrap** data ever reach production; fake-data scripts refuse to run there
- [ ] Reference data is idempotent (upserts) and versioned in git
- [ ] Reference data that the code depends on is applied automatically in the deploy (migration or post-migration step)
- [ ] First admin created from secrets/env vars, with a forced password change or invite flow; no default passwords
- [ ] Production data copied to other environments only after **anonymization**
- [ ] Seed runs are logged and auditable

## 2. Reference data: migration or seed script?

> **In short:** Required data in migrations, changeable catalogues in idempotent seeds.

| Option | Pros | Cons | Use for |
| --- | --- | --- | --- |
| **Data migration** (Alembic `op.bulk_insert` / SQL in a migration) | Runs automatically in order with schema changes; versioned; the code can rely on it | Changing values means new migrations | Data the code **requires** (status codes, permission names, enum-like lookups) |
| **Idempotent reference seed** run after migrations in each deploy | Easy to update (edit the list, redeploy) | Needs to be wired into the pipeline | Larger catalogues that change occasionally (countries, plans, feature flags defaults) |
| **Admin UI** | Business users manage it | Not in git; differs between environments | Business-owned data (product categories, content) |

```python
# A data migration for required permissions
from alembic import op
import sqlalchemy as sa

permissions = sa.table("permissions", sa.column("code", sa.Text), sa.column("description", sa.Text))

def upgrade() -> None:
    op.bulk_insert(permissions, [
        {"code": "tasks:read", "description": "Read tasks"},
        {"code": "tasks:write", "description": "Create and edit tasks"},
        {"code": "users:admin", "description": "Manage users"},
    ])

def downgrade() -> None:
    op.execute("DELETE FROM permissions WHERE code IN ('tasks:read', 'tasks:write', 'users:admin')")
```

Rules:
- Use **stable natural keys** (`code`) to identify reference rows, not auto-increment IDs (IDs differ between environments).
- Never delete reference rows that existing data still points to; deactivate them (`is_active = false`).
- Keep reference seeds **upsert-only**; avoid "delete all and reinsert" in production (breaks foreign keys, causes downtime).

## 3. Bootstrapping the first admin

> **In short:** A one-off idempotent command using secrets, with no default passwords.

```python
# scripts/create_admin.py
import os, sys
from app.db.session import SessionLocal
from app.models import User
from app.core.security import hash_password
from sqlalchemy import select

def main() -> None:
    email = os.environ["BOOTSTRAP_ADMIN_EMAIL"]
    password = os.environ["BOOTSTRAP_ADMIN_PASSWORD"]          # from the secret manager, one-time
    with SessionLocal() as db, db.begin():
        if db.scalars(select(User).where(User.role == "admin")).first():
            print("An admin already exists; nothing to do")
            return
        db.add(User(email=email, hashed_password=hash_password(password), role="admin",
                    must_change_password=True))
    print(f"Admin {email} created")

if __name__ == "__main__":
    main()
```

- Run once as a one-off job; it's idempotent (does nothing if an admin exists).
- **No default credentials** in code (`admin/admin` is a classic breach). Better still: send an invite link instead of setting a password.
- Remove/rotate the bootstrap secret after use; require MFA for admin accounts.
- With an external identity provider (Keycloak, Auth0, Cognito), bootstrap the admin there and map roles.

## 4. Running seeds in the deploy pipeline

> **In short:** Migrate, seed reference data, then roll out, failing the deploy on errors.

```
1. alembic upgrade head          (schema + required data migrations)
2. python -m scripts.seed_reference   (idempotent upserts)
3. roll out the application
```

- Run with the **same image** as the release, as a one-off job, with a role that can write reference tables.
- Fail the deploy if seeding fails.
- Log what changed (rows inserted/updated) for auditing.

## 5. Guard rails against fake data in production

> **In short:** Environment checks, no dev tools in the image, separate credentials.

```python
if settings.environment == "production":
    raise SystemExit("Refusing to run the development seed in production")
```

Also:
- Don't ship dev seed scripts or Faker in the production image (`--no-dev` dependencies), so they can't run there.
- Production DB credentials aren't available to developers' machines or to preview environments.
- Demo/test accounts never exist in production; if a "demo tenant" is needed there, create it deliberately through normal product flows, with real passwords.

## 6. Using production data in other environments

> **In short:** Prefer synthetic data, or anonymize copies before using them.

Realistic data is valuable for staging and debugging, but copying production data is a **privacy and security risk** (and may be illegal under GDPR/DPDP without safeguards).

| Approach | Notes |
| --- | --- |
| Synthetic data (Faker at production volumes) | Safest; may miss real-world edge cases |
| **Anonymized/masked copy** | Replace names, emails, phones, addresses, free text, tokens; keep structure, volume and distributions |
| Subset + anonymize | Smaller copies with referential integrity (tools: Tonic, Neosync, Greenmask, pg_anonymizer, Replibyte) |
| Raw copy | ❌ Avoid. Only in tightly controlled cases with legal approval |

Masking guidelines:
- Emails → `user{id}@example.test`; names → Faker names; phone numbers → fake; free-text fields → lorem text or removed.
- Remove password hashes, API keys, tokens, payment data, sessions entirely.
- Keep IDs and foreign keys consistent so the app still works.
- Automate the pipeline (scheduled job) instead of ad-hoc dumps; restrict who can access the masked copy; delete old copies.

## 7. Seeding for load and performance tests

> **In short:** Production-like volumes in a dedicated environment, loaded fast.

- Generate production-like **volumes and distributions** (some users with 10,000 tasks, most with 20) in a dedicated environment.
- Use `COPY` or `INSERT ... SELECT generate_series` for speed.
- Run `ANALYZE` after loading so the planner has correct statistics.
- Tear down or reset the environment afterwards; never load-test against production data stores.

## 8. Routine

> **In short:** Per-deploy, monthly and quarterly seeding tasks.

| When | Task |
| --- | --- |
| Every deploy | Data migrations + reference seed run automatically |
| When reference data changes | Update the seed list/migration in a PR; review for removals that would orphan data |
| Monthly | Refresh anonymized staging data (if used); verify no real personal data leaked into non-production environments |
| Quarterly | Review admin accounts and bootstrap secrets; remove unused reference rows (deactivate, don't delete) |
