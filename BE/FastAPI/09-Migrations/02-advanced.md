# 02 · Advanced migrations

## 1. What autogenerate gets wrong or misses

> **In short:** Renames, NOT NULL columns, enums, functions and more need manual fixes.

| Situation | What autogenerate does | What you must do |
| --- | --- | --- |
| **Renaming a column/table** | Drop old + add new (⚠️ **data loss**) | Replace with `op.alter_column(..., new_column_name=...)` / `op.rename_table` |
| Adding a `NOT NULL` column to a table with rows | `add_column(nullable=False)` → fails on existing rows | Add nullable or with a server default, backfill, then set NOT NULL |
| Changing column types | Detected with `compare_type=True`, but may need a `USING` clause | `op.alter_column(..., type_=..., postgresql_using="col::integer")` |
| PostgreSQL ENUM types | Often creates but doesn't alter/drop types correctly | Write `ALTER TYPE ... ADD VALUE` manually |
| Server defaults, check constraints, some indexes | May be missed | Check and add by hand |
| Functions, triggers, views, extensions, RLS policies | Not detected | `op.execute(...)` manually |
| Tables not in your models (other apps') | May try to drop them | Filter with `include_object` / `include_name` in env.py |
| Concurrent index creation | Not used | Write `postgresql_concurrently=True` manually (lesson below) |

**Always review the generated file line by line.**

## 2. Data migrations

> **In short:** Transform existing rows with SQL inside migrations.

Schema migrations change structure; **data migrations** change rows (backfills, splitting columns, fixing data).

```python
"""split full_name into first_name/last_name"""
from alembic import op
import sqlalchemy as sa

def upgrade() -> None:
    op.add_column("users", sa.Column("first_name", sa.Text()))
    op.add_column("users", sa.Column("last_name", sa.Text()))

    # Use SQL (or lightweight table stubs), NOT your app's ORM models
    op.execute("""
        UPDATE users
        SET first_name = split_part(full_name, ' ', 1),
            last_name  = NULLIF(substr(full_name, length(split_part(full_name, ' ', 1)) + 2), '')
    """)

def downgrade() -> None:
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
```

### Using table stubs for Python-side logic

> **In short:** Lightweight table definitions instead of app models, for row-by-row logic.

```python
from sqlalchemy.sql import table, column

users = table("users", column("id", sa.BigInteger), column("email", sa.Text))

def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.select(users.c.id, users.c.email)).all()
    for user_id, email in rows:
        conn.execute(users.update().where(users.c.id == user_id).values(email=email.strip().lower()))
```

Why not import `app.models.User`? The model reflects the **latest** schema; when someone runs this old migration a year later, the model may have columns that don't exist yet at this point in history, and the migration breaks.

### Large backfills

> **In short:** Update in batches, or move huge backfills out of migrations.

Updating millions of rows in one statement holds locks and generates huge WAL. Batch it:

```python
def upgrade() -> None:
    conn = op.get_bind()
    while True:
        result = conn.execute(sa.text("""
            UPDATE tasks SET priority = 3
            WHERE id IN (SELECT id FROM tasks WHERE priority IS NULL LIMIT 5000)
        """))
        if result.rowcount == 0:
            break
```

For very large tables, run backfills **outside** the migration (a script or Celery task that runs after deploy), and keep the migration itself fast. See [production.md](production.md).

## 3. Adding a NOT NULL column safely

> **In short:** Add nullable → backfill → enforce NOT NULL.

```python
def upgrade() -> None:
    # 1. add as nullable (instant)
    op.add_column("tasks", sa.Column("status", sa.Text(), nullable=True))
    # 2. backfill
    op.execute("UPDATE tasks SET status = CASE WHEN done THEN 'done' ELSE 'todo' END")
    # 3. enforce
    op.alter_column("tasks", "status", nullable=False, server_default="todo")
```

In PostgreSQL 11+, `ADD COLUMN ... NOT NULL DEFAULT 'todo'` with a **constant** default is instant (no table rewrite), so for simple cases you can do it in one step.

## 4. Enums in PostgreSQL

> **In short:** Create, add values to and drop PostgreSQL enum types in migrations.

```python
from sqlalchemy.dialects import postgresql

status_enum = postgresql.ENUM("todo", "in_progress", "done", name="task_status")

def upgrade() -> None:
    status_enum.create(op.get_bind(), checkfirst=True)
    op.add_column("tasks", sa.Column("status", status_enum, nullable=False, server_default="todo"))

def downgrade() -> None:
    op.drop_column("tasks", "status")
    status_enum.drop(op.get_bind(), checkfirst=True)

# Adding a value later
def upgrade() -> None:
    op.execute("ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'archived'")
```

Removing or renaming enum values requires creating a new type and converting the column. This is one reason many teams prefer `TEXT` + `CHECK` constraints.

## 5. Indexes without locking (PostgreSQL)

> **In short:** Use `autocommit_block` to create indexes concurrently.

`CREATE INDEX CONCURRENTLY` can't run inside a transaction, and Alembic wraps migrations in one by default.

```python
def upgrade() -> None:
    with op.get_context().autocommit_block():          # step outside the transaction
        op.create_index(
            "ix_tasks_owner_created", "tasks", ["owner_id", "created_at"],
            postgresql_concurrently=True, if_not_exists=True,
        )

def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index("ix_tasks_owner_created", table_name="tasks",
                      postgresql_concurrently=True, if_exists=True)
```

If a concurrent build fails, it leaves an INVALID index: drop it and re-run.

## 6. Multiple heads, branches and merges

> **In short:** Merge diverging migration histories and prevent them in CI.

When two developers create migrations from the same parent on different branches, you end up with **two heads**:

```bash
alembic heads
# 1a2b3c (head)   add projects
# 4d5e6f (head)   add tags

alembic merge -m "merge projects and tags" 1a2b3c 4d5e6f   # creates a merge migration with two parents
alembic upgrade head
```

Prevent surprises: make CI fail if `alembic heads` shows more than one head, and rebase/merge before merging PRs.

## 7. Migrations with async SQLAlchemy

> **In short:** The async template runs migrations through `run_sync`.

Use the async template (`alembic init -t async alembic`). `env.py` runs migrations through `connection.run_sync(do_run_migrations)`. Migration files themselves stay synchronous (`op.*`).

## 8. Multiple schemas, tenants and databases

> **In short:** Options for several schemas, schema-per-tenant and several databases.

- **Multiple schemas**: set `include_schemas=True` and `version_table_schema` in `context.configure`.
- **Schema-per-tenant**: loop over tenant schemas in `env.py`, setting `search_path` for each; or use a tool that supports it.
- **Several databases**: Alembic's multi-database template, or separate Alembic environments.

## 9. Squashing old migrations

> **In short:** Replace a long history with a new baseline, carefully.

After hundreds of migrations, a fresh setup gets slow. You can **squash**: create a new baseline migration representing the current schema, for new environments. Existing databases are stamped at the baseline. Do it rarely, carefully, and only when all environments are past the squashed point.

## 10. Testing migrations

> **In short:** Test upgrade/downgrade cycles, single head and data migrations.

```python
# tests/test_migrations.py
from alembic import command
from alembic.config import Config

def test_upgrade_downgrade_cycle(empty_db_url):
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", empty_db_url)
    command.upgrade(cfg, "head")       # all migrations apply on an empty DB
    command.downgrade(cfg, "base")     # all downgrades work
    command.upgrade(cfg, "head")       # and apply again
```

- **pytest-alembic** provides ready-made tests: single head, upgrade/downgrade round trips, model/migration consistency.
- Test data migrations with a fixture that inserts "old shape" rows before upgrading to the revision, then asserts the new shape.
- In staging, run migrations against a **copy of production data** to catch slow or failing migrations before production.

---

## 11. Exercises

1. Rename `tasks.title` to `tasks.name` correctly (fix the autogenerated drop/add).
2. Add a NOT NULL `status` column to a table with existing rows using the three-step pattern.
3. Write a batched data migration that normalizes all emails to lowercase.
4. Create an index concurrently inside an Alembic migration.
5. Create two migration heads on separate branches and merge them.
6. Add pytest tests that run upgrade → downgrade → upgrade on an empty database.
