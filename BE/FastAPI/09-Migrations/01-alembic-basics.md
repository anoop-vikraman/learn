# 01 · Alembic basics

## 1. Why migrations?

> **In short:** Versioned, reviewed schema changes that keep every environment identical.

Without migrations, schema changes are run by hand ("did anyone add the `due_date` column on staging?"). Environments drift, deploys break, and nobody knows the exact schema history.

With migrations:
- Every schema change is a **file in git**, reviewed like code.
- The database records which migrations have been applied (`alembic_version` table).
- `alembic upgrade head` brings any database to the latest schema, in order.
- New developers and CI create the schema from scratch with one command.

⚠️ Don't use `Base.metadata.create_all()` for real environments: it creates missing tables but never alters existing ones.

## 2. Setup

> **In short:** Install Alembic and generate its config, `env.py` and `versions/` folder.

```bash
uv add alembic
alembic init alembic                    # sync template
# or: alembic init -t async alembic     # for async engines
```

Creates:

```
alembic.ini              # config (logging, script location)
alembic/
  env.py                 # connects Alembic to your DB and models
  script.py.mako         # template for new migration files
  versions/              # migration files live here
```

## 3. Configure `env.py` to use your settings and models

> **In short:** Read the DB URL from settings and point autogenerate at your models' metadata.

```python
# alembic/env.py (key parts)
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

from app.core.config import settings
from app.db.base import Base
import app.models  # noqa: F401  ← import all models so they're registered on Base.metadata

config = context.config
config.set_main_option("sqlalchemy.url", str(settings.database_url))   # don't hard-code URLs in alembic.ini

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata          # what autogenerate compares against

def run_migrations_offline() -> None:
    context.configure(url=config.get_main_option("sqlalchemy.url"),
                      target_metadata=target_metadata, literal_binds=True,
                      compare_type=True)
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    connectable = engine_from_config(config.get_section(config.config_ini_section, {}),
                                     prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata,
                          compare_type=True,            # detect column type changes
                          compare_server_default=True)  # detect server default changes
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### Consistent constraint names (do this early)

> **In short:** A naming convention makes constraint names predictable for later migrations.

Give SQLAlchemy a naming convention so constraints and indexes get predictable names. Migrations can then reliably drop or alter them later.

```python
# app/db/base.py
from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
```

Optional nice file names in `alembic.ini`:

```ini
file_template = %%(year)d_%%(month).2d_%%(day).2d_%%(hour).2d%%(minute).2d-%%(rev)s_%%(slug)s
```

## 4. Creating migrations

> **In short:** Generate a draft from model changes or write one by hand.

### Autogenerate (compare models with the database)

> **In short:** Alembic diffs models against the DB and writes upgrade/downgrade code for you to review.

```bash
# 1. change your SQLAlchemy models (e.g. add Task.due_date)
# 2. generate a migration
alembic revision --autogenerate -m "add due_date to tasks"
```

```python
# alembic/versions/2026_11_10_1030-a1b2c3d4e5f6_add_due_date_to_tasks.py
"""add due_date to tasks

Revision ID: a1b2c3d4e5f6
Revises: 9f8e7d6c5b4a
Create Date: 2026-11-10 10:30:00
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "9f8e7d6c5b4a"       # the previous migration: forms a chain
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("tasks", sa.Column("due_date", sa.Date(), nullable=True))
    op.create_index("ix_tasks_due_date", "tasks", ["due_date"])

def downgrade() -> None:
    op.drop_index("ix_tasks_due_date", table_name="tasks")
    op.drop_column("tasks", "due_date")
```

⚠️ **Always read and edit autogenerated migrations.** Autogenerate is a helpful draft, not a guarantee (see lesson 02 for what it misses).

### Empty migration (write it yourself)

> **In short:** Start a blank migration for custom changes or data.

```bash
alembic revision -m "backfill task priorities"
```

## 5. Common operations

> **In short:** Create/alter/drop tables, columns, indexes and constraints, and run raw SQL.

```python
# Tables
op.create_table(
    "projects",
    sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
    sa.Column("name", sa.Text(), nullable=False),
    sa.Column("owner_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
)
op.drop_table("projects")
op.rename_table("old_name", "new_name")

# Columns
op.add_column("tasks", sa.Column("priority", sa.SmallInteger(), server_default="3", nullable=False))
op.drop_column("tasks", "legacy_flag")
op.alter_column("tasks", "title", existing_type=sa.String(100), type_=sa.Text())
op.alter_column("tasks", "title", new_column_name="name")              # rename
op.alter_column("users", "full_name", existing_type=sa.Text(), nullable=False)

# Constraints and indexes
op.create_index("ix_tasks_owner_id", "tasks", ["owner_id"])
op.create_unique_constraint("uq_users_email", "users", ["email"])
op.create_foreign_key("fk_tasks_project_id_projects", "tasks", "projects", ["project_id"], ["id"], ondelete="SET NULL")
op.create_check_constraint("ck_tasks_priority_range", "tasks", "priority BETWEEN 1 AND 5")
op.drop_constraint("uq_users_email", "users", type_="unique")

# Raw SQL when needed
op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
```

## 6. Applying and inspecting

> **In short:** Upgrade, downgrade, check the current revision and history, print SQL, stamp.

```bash
alembic upgrade head            # apply all pending migrations
alembic upgrade +1              # apply the next one
alembic downgrade -1            # undo the last one
alembic downgrade a1b2c3d4e5f6  # go to a specific revision
alembic downgrade base          # undo everything (⚠️ drops tables)

alembic current                 # which revision is the DB at?
alembic history --verbose       # list migrations
alembic heads                   # latest revision(s): should be ONE
alembic check                   # exit non-zero if models differ from migrations (use in CI)
alembic upgrade head --sql      # print the SQL without running it (offline mode, for review/DBAs)
alembic stamp head              # mark the DB as up to date WITHOUT running migrations (adopting an existing DB)
```

## 7. Workflow

> **In short:** Model change → generate → review → apply → test → commit together → CI check → deploy.

1. Change the SQLAlchemy model.
2. `alembic revision --autogenerate -m "short description"`.
3. **Review and edit** the generated file.
4. `alembic upgrade head` locally; run the app and tests.
5. Test `alembic downgrade -1` then `upgrade head` again (catches broken downgrades).
6. Commit the model change **and** the migration in the same PR.
7. CI runs `alembic upgrade head` on a fresh DB and `alembic check`.
8. Deploy: migrations run as a separate step before the new code takes traffic ([production.md](production.md)).

## 8. Rules

> **In short:** Never edit shared migrations, don't import app models, and keep migrations working from empty.

- **Never edit a migration that has been applied anywhere shared** (staging/production, or merged to `main`). Create a new migration instead.
- One logical change per migration; descriptive messages.
- Migrations must work on an **empty** database and on the **current production** database.
- Don't import app models into migration files (models change over time; old migrations would break). Use `op` and `sa` directly, or define minimal table stubs inside the migration.
- Keep `downgrade()` working for development, but plan production rollbacks as roll-forwards.

---

## 9. Exercises

1. Set up Alembic with your settings and models; generate the initial migration for `users` and `tasks`.
2. Add a `projects` table with an FK from `tasks`; autogenerate, review, apply, downgrade, re-apply.
3. Add the naming convention and see how generated constraint names change.
4. Add `alembic check` to your test command and make it fail by changing a model without a migration.
5. Print the SQL for all migrations with `--sql` and read it.
