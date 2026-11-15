# 01 · Setup and psql

## 1. Running PostgreSQL

> **In short:** Ways to get a PostgreSQL server running locally.

### With Docker (recommended for development)

> **In short:** One command (or a Compose service) with a persistent volume and a pinned version.

```bash
docker run -d --name pg \
  -e POSTGRES_USER=app -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=tasks \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  postgres:17
```

- `-v pgdata:...` stores data in a named volume, so it survives container restarts.
- Pin a major version (`postgres:17`), never `latest`.
- In `docker-compose.yml` (see [../07-Docker/](../07-Docker/)):

```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: tasks
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d tasks"]
      interval: 5s
      retries: 10
volumes:
  pgdata:
```

### Native install

> **In short:** Install packages directly on macOS, Linux or Windows.

- macOS: Postgres.app or `brew install postgresql@17`
- Ubuntu: `sudo apt install postgresql` (or the official PGDG apt repository for newer versions)
- Windows: the EDB installer

## 2. Connecting

> **In short:** Connect with psql or a GUI using host, port, user, database, or a connection URL.

```bash
psql -h localhost -p 5432 -U app -d tasks          # asks for the password
psql "postgresql://app:secret@localhost:5432/tasks" # connection URL
docker exec -it pg psql -U app -d tasks             # inside the container
```

Connection URL format (used by apps and SQLAlchemy):

```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
postgresql+psycopg://...      # SQLAlchemy with psycopg 3
postgresql+asyncpg://...      # SQLAlchemy async
```

Avoid typing passwords on the command line: use `~/.pgpass` or the `PGPASSWORD` environment variable for scripts.

GUI tools: **DBeaver**, **pgAdmin**, **TablePlus**, **DataGrip**, VS Code extensions.

## 3. psql meta-commands

> **In short:** Backslash commands to list, describe, time, import and export from the psql shell.

Commands starting with `\` are handled by psql itself (no semicolon needed).

| Command | Does |
| --- | --- |
| `\l` | List databases |
| `\c dbname` | Connect to another database |
| `\dn` | List schemas |
| `\dt` / `\dt+` | List tables (+ sizes) |
| `\d tasks` | Describe a table: columns, indexes, constraints, FKs |
| `\di` | List indexes |
| `\dv`, `\dm` | Views, materialized views |
| `\df` | Functions |
| `\du` | Roles/users |
| `\dx` | Installed extensions |
| `\x` | Toggle expanded output (one column per line: great for wide rows) |
| `\timing` | Show how long each query takes |
| `\e` | Edit the last query in your editor |
| `\i file.sql` | Run a SQL file |
| `\copy tasks TO 'tasks.csv' CSV HEADER` | Export to a CSV on **your** machine |
| `\copy tasks FROM 'tasks.csv' CSV HEADER` | Import from CSV |
| `\conninfo` | Current connection details |
| `\?` / `\h SELECT` | Help for meta-commands / SQL syntax |
| `\q` | Quit |

Run a single command from the shell: `psql -d tasks -c "SELECT count(*) FROM tasks;"`.

## 4. Databases, schemas and objects

> **In short:** A server holds databases; each database holds schemas, which hold tables and other objects.

```
PostgreSQL server (cluster)
 ├── database: tasks
 │    ├── schema: public       (default)
 │    │    ├── tables, views, sequences, functions
 │    └── schema: reporting
 └── database: analytics
```

- A **cluster** is one server instance with many **databases**.
- A connection is to **one** database; you can't join tables across databases (use schemas instead, or `postgres_fdw`).
- A **schema** is a namespace inside a database. `public` is the default. Tables are referenced as `schema.table`.

```sql
CREATE DATABASE tasks_test;
CREATE SCHEMA reporting;
CREATE TABLE reporting.daily_stats (...);
SET search_path TO reporting, public;        -- where unqualified names are looked up
DROP DATABASE tasks_test;                    -- can't drop the database you're connected to
```

## 5. Roles (users) basics

> **In short:** Users and groups are roles; grant only the privileges an app needs.

In PostgreSQL, users and groups are both **roles**.

```sql
CREATE ROLE app_user LOGIN PASSWORD 'strong-password';
GRANT CONNECT ON DATABASE tasks TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
```

More in lesson 05. ⚠️ Applications should **never** connect as the `postgres` superuser.

## 6. Your first session

> **In short:** Create a table, insert rows with RETURNING, and query them.

```sql
CREATE TABLE notes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO notes (body) VALUES ('hello'), ('postgres') RETURNING *;
SELECT * FROM notes ORDER BY created_at DESC;
\d notes
```

### Generating test data

> **In short:** `generate_series` creates large data sets for practice and performance tests.

```sql
INSERT INTO notes (body, created_at)
SELECT 'note ' || g, now() - (random() * interval '365 days')
FROM generate_series(1, 100000) AS g;
```

`generate_series` is perfect for creating large data sets to test performance.

## 7. Useful system queries

> **In short:** Check version, sizes and running queries, and cancel or kill sessions.

```sql
SELECT version();
SELECT current_database(), current_user, now();
SHOW timezone;                                    -- keep servers in UTC
SELECT pg_size_pretty(pg_database_size(current_database()));
SELECT pg_size_pretty(pg_total_relation_size('notes'));     -- table + indexes

-- What's running right now?
SELECT pid, usename, state, now() - query_start AS runtime, left(query, 80)
FROM pg_stat_activity
WHERE state <> 'idle'
ORDER BY runtime DESC;

SELECT pg_cancel_backend(12345);      -- cancel a query
SELECT pg_terminate_backend(12345);   -- kill the connection
```

---

## 8. Exercises

1. Start PostgreSQL with Docker Compose and connect with psql and a GUI tool.
2. Create a `reporting` schema and a table in it; query it with and without `search_path`.
3. Generate 1M rows with `generate_series` and check the table size.
4. Export a table to CSV with `\copy` and import it into a new table.
5. Create a limited `app_user` role and confirm it can't `DROP TABLE`.
