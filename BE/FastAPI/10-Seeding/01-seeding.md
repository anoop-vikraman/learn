# 01 · Seeding data

## 1. Three kinds of seed data

> **In short:** Reference data (all environments), bootstrap data (new environments) and fake data (non-production only).

| Kind | Examples | Environments | Where it lives |
| --- | --- | --- | --- |
| **Reference / lookup data** | Roles, permissions, countries, currencies, task statuses, plans | **All**, including production | Migrations or an idempotent "reference seed" |
| **Bootstrap data** | The first admin user/organization | New environments | A one-off command using env vars/secrets |
| **Sample / fake data** | 50 users, 2,000 tasks, demo projects | Local, dev, preview, staging, load tests | Seed scripts with Faker/factories. **Never production** |

Keeping these separate prevents the classic mistake of fake users ending up in production.

## 2. Principles

> **In short:** Idempotent, deterministic, fast, safe and realistic seeds.

- **Idempotent**: running the seed twice gives the same result (no duplicates, no errors). Use upserts or "get or create".
- **Deterministic** where useful: a fixed random seed (`Faker.seed(42)`) produces the same fake data every run, which makes bugs reproducible.
- **Fast**: bulk inserts, one transaction (or batches).
- **Safe**: refuse to run destructive or fake-data seeds in production (check the environment).
- **Uses the current schema**: run after `alembic upgrade head`.
- **Realistic**: realistic sizes and distributions reveal performance problems (pagination, missing indexes) early.

## 3. Reference data with upserts

> **In short:** Insert-or-update by a natural key so the seed can run any number of times.

```python
# scripts/seed_reference.py
from sqlalchemy.dialects.postgresql import insert
from app.db.session import SessionLocal
from app.models import Role, Plan

ROLES = [
    {"code": "admin", "name": "Administrator"},
    {"code": "manager", "name": "Manager"},
    {"code": "member", "name": "Member"},
]

PLANS = [
    {"code": "free", "name": "Free", "max_projects": 3},
    {"code": "pro", "name": "Pro", "max_projects": 100},
]

def upsert(db, model, rows, key: str):
    stmt = insert(model).values(rows)
    update_cols = {c: stmt.excluded[c] for c in rows[0] if c != key}
    db.execute(stmt.on_conflict_do_update(index_elements=[key], set_=update_cols))

def main() -> None:
    with SessionLocal() as db, db.begin():
        upsert(db, Role, ROLES, key="code")
        upsert(db, Plan, PLANS, key="code")
    print("Reference data seeded")

if __name__ == "__main__":
    main()
```

Running it again updates names/limits without duplicates. Use `on_conflict_do_nothing()` if existing rows must never be changed.

## 4. Fake data with Faker

> **In short:** Generate realistic names, emails, text and dates, reproducibly with a fixed seed.

```bash
uv add --dev faker
```

```python
from faker import Faker

fake = Faker("en_IN")          # locale-specific names, addresses, phone numbers
Faker.seed(42)                 # deterministic

fake.name()                    # 'Anoop Vikraman'
fake.unique.email()            # unique within this Faker instance
fake.sentence(nb_words=6)
fake.paragraph()
fake.date_between(start_date="-1y", end_date="today")
fake.date_time_between(start_date="-30d", tzinfo=timezone.utc)
fake.random_int(1, 5)
fake.random_element(["todo", "in_progress", "done"])
fake.company(); fake.city(); fake.phone_number(); fake.url(); fake.uuid4()
```

## 5. A development seed script

> **In short:** A CLI that bulk-inserts users, projects and tasks, with demo accounts and a production guard.

```python
# scripts/seed_dev.py
import random
from datetime import timezone

import typer
from faker import Faker
from sqlalchemy import delete, insert, select, func

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import User, Project, Task

app = typer.Typer()
fake = Faker()

@app.command()
def run(users: int = 20, projects_per_user: int = 3, tasks_per_project: int = 25,
        reset: bool = False, seed: int = 42) -> None:
    if settings.environment == "production":
        raise typer.Exit("Refusing to seed fake data in production")    # safety guard

    Faker.seed(seed)
    random.seed(seed)
    password = hash_password("password123")          # hash once, reuse (hashing is slow on purpose)

    with SessionLocal() as db, db.begin():
        if reset:
            db.execute(delete(Task)); db.execute(delete(Project)); db.execute(delete(User))

        if db.scalar(select(func.count()).select_from(User)) and not reset:
            typer.echo("Users already exist; use --reset to recreate")
            return

        # Well-known accounts for manual testing
        demo_users = [
            {"email": "admin@example.com", "full_name": "Admin", "role": "admin", "hashed_password": password},
            {"email": "member@example.com", "full_name": "Member", "role": "member", "hashed_password": password},
        ]
        fake_users = [
            {"email": fake.unique.email(), "full_name": fake.name(), "role": "member", "hashed_password": password}
            for _ in range(users)
        ]
        user_ids = db.scalars(insert(User).returning(User.id), demo_users + fake_users).all()   # bulk insert

        project_rows = [
            {"name": fake.catch_phrase(), "owner_id": uid}
            for uid in user_ids for _ in range(projects_per_user)
        ]
        project_ids = db.scalars(insert(Project).returning(Project.id), project_rows).all()

        task_rows = []
        for pid in project_ids:
            for _ in range(tasks_per_project):
                task_rows.append({
                    "title": fake.sentence(nb_words=5).rstrip("."),
                    "description": fake.paragraph() if random.random() < 0.6 else None,
                    "done": random.random() < 0.4,
                    "priority": random.choices([1, 2, 3, 4, 5], weights=[5, 15, 50, 20, 10])[0],
                    "project_id": pid,
                    "owner_id": random.choice(user_ids),
                    "created_at": fake.date_time_between(start_date="-180d", tzinfo=timezone.utc),
                })
        for i in range(0, len(task_rows), 5000):                    # batches for big volumes
            db.execute(insert(Task), task_rows[i:i + 5000])

    typer.echo(f"Seeded {len(user_ids)} users, {len(project_ids)} projects, {len(task_rows)} tasks")

if __name__ == "__main__":
    app()
```

```bash
uv run python -m scripts.seed_dev --users 50 --reset
docker compose run --rm api python -m scripts.seed_dev
```

Notes:
- `insert(Model)` with a list of dicts uses SQLAlchemy 2.0 **bulk inserts** (fast). Adding ORM objects one by one with `db.add()` is much slower for thousands of rows.
- Realistic **distributions** (weighted priorities, 40% done, some descriptions missing, dates spread over months) make the UI and queries behave like the real thing.
- For millions of rows, PostgreSQL's `COPY` (psycopg `cursor.copy()`) or `INSERT ... SELECT FROM generate_series(...)` is much faster.

## 6. Factories with factory_boy

> **In short:** Reusable recipes for valid objects, ideal for tests and seeds.

Factories define how to build a valid object once, then create as many as you need, with overrides. They're great for **tests** and reusable in seed scripts.

```bash
uv add --dev factory-boy
```

```python
# tests/factories.py
import factory
from factory.alchemy import SQLAlchemyModelFactory
from app.models import User, Project, Task

class BaseFactory(SQLAlchemyModelFactory):
    class Meta:
        abstract = True
        sqlalchemy_session = None                 # set by a fixture (tests) or the seed script
        sqlalchemy_session_persistence = "flush"

class UserFactory(BaseFactory):
    class Meta:
        model = User
    email = factory.Sequence(lambda n: f"user{n}@example.com")
    full_name = factory.Faker("name")
    role = "member"
    hashed_password = "not-a-real-hash"

class ProjectFactory(BaseFactory):
    class Meta:
        model = Project
    name = factory.Faker("catch_phrase")
    owner = factory.SubFactory(UserFactory)       # creates a user automatically

class TaskFactory(BaseFactory):
    class Meta:
        model = Task
    title = factory.Faker("sentence", nb_words=4)
    done = False
    priority = factory.Faker("random_int", min=1, max=5)
    project = factory.SubFactory(ProjectFactory)
    owner = factory.SelfAttribute("project.owner")

    class Params:
        completed = factory.Trait(done=True)      # TaskFactory(completed=True)
```

```python
# tests/conftest.py
@pytest.fixture(autouse=True)
def bind_factories(db):
    for f in (UserFactory, ProjectFactory, TaskFactory):
        f._meta.sqlalchemy_session = db

# in a test
def test_list_open_tasks(auth_client, user):
    TaskFactory.create_batch(3, owner=user)
    TaskFactory.create_batch(2, owner=user, completed=True)
    r = auth_client.get("/api/v1/tasks?done=false")
    assert len(r.json()) == 3
```

Alternatives: **polyfactory** (builds Pydantic/dataclass/SQLAlchemy objects from type hints), **mimesis** (fast fake data).

## 7. SQL seed files

> **In short:** Plain SQL upserts for simple fixed data, and the Postgres init-scripts caveat.

For simple fixed data, plain SQL works too:

```sql
-- seeds/reference.sql
INSERT INTO roles (code, name) VALUES
  ('admin', 'Administrator'),
  ('member', 'Member')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;
```

```bash
psql "$DATABASE_URL" -f seeds/reference.sql
```

With Docker's Postgres image, `.sql` files mounted in `/docker-entrypoint-initdb.d/` run automatically, but **only on first start with an empty volume**, and before Alembic has created tables, so they're mainly useful for extensions/roles, not app data.

## 8. Where seeding fits in the workflow

> **In short:** Migrate, seed reference data, then seed fake data, and what each environment gets.

```bash
docker compose up -d db redis
uv run alembic upgrade head                 # 1. schema
uv run python -m scripts.seed_reference     # 2. reference data (also runs in prod deploys)
uv run python -m scripts.seed_dev           # 3. fake data (dev only)
```

Provide a single command for new developers (`make dev-setup` or `just setup`) that does all three.

| Context | What to seed |
| --- | --- |
| Local dev | Reference + bootstrap + plenty of fake data |
| Automated tests | Reference data once per session; **each test creates its own data** with factories (don't depend on a shared seed) |
| Preview/staging | Reference + fake or anonymized data, demo accounts |
| Load tests | Large, realistic volumes (production-like counts per table) |
| Production | Reference data and first-admin bootstrap only |

## 9. Seeding via an admin-only API or CLI

> **In short:** Prefer CLI commands; lock down any seeding endpoint.

Expose seeding as a CLI command (Typer/Click) rather than an HTTP endpoint. If you must have an endpoint for preview environments, protect it heavily and disable it in production by configuration.

---

## 10. Exercises

1. Write an idempotent reference seed for roles and plans; run it twice and confirm no duplicates.
2. Write a dev seed with Faker that creates 50 users, 150 projects and 5,000 tasks with realistic distributions, plus `admin@example.com`.
3. Add a production guard and a `--reset` flag.
4. Create factory_boy factories and use them in three API tests.
5. Seed 1,000,000 tasks with `INSERT ... SELECT generate_series` and use them to test pagination performance.
