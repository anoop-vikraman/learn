# Database migrations

A **migration** is a versioned script that changes the database schema (create a table, add a column, add an index) or transforms data. Migrations are stored in git, applied in order, and tracked in the database, so every environment (your laptop, CI, staging, production) ends up with the same schema.

With SQLAlchemy, the standard tool is **Alembic** (by SQLAlchemy's author).

| # | Lesson | Level | You will learn |
| --- | --- | --- | --- |
| 01 | [Alembic basics](01-alembic-basics.md) | Beginner | Why migrations, setup, configuration with app settings, autogenerate, upgrade/downgrade, history |
| 02 | [Advanced migrations](02-advanced.md) | Intermediate → Advanced | Reviewing autogenerate, data migrations, renames, enums, indexes, branches and merges, testing migrations |
| — | [**Production**](production.md) | — | Running migrations in deploys, zero-downtime patterns (expand/contract), locks and timeouts, large tables, rollbacks |
