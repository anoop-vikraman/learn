# 05 · Security, functions, triggers and extensions

## 1. Roles and privileges

> **In short:** Separate migrator, app and read-only roles with only the privileges they need.

```sql
-- A group role that owns nothing and can't log in
CREATE ROLE app_readwrite NOLOGIN;
CREATE ROLE app_readonly NOLOGIN;

GRANT CONNECT ON DATABASE tasks TO app_readwrite, app_readonly;
GRANT USAGE ON SCHEMA public TO app_readwrite, app_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_readwrite;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_readwrite;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;

-- Apply to tables created later by the migration role
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_readwrite;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
    GRANT SELECT ON TABLES TO app_readonly;

-- Login roles that inherit from groups
CREATE ROLE api LOGIN PASSWORD '...' IN ROLE app_readwrite;
CREATE ROLE analyst LOGIN PASSWORD '...' IN ROLE app_readonly;
CREATE ROLE migrator LOGIN PASSWORD '...';         -- owns tables, runs DDL in migrations

-- Remove the default ability for everyone to create objects in public (older versions)
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
```

**Recommended setup:**

| Role | Can | Used by |
| --- | --- | --- |
| `migrator` (owner) | DDL: create/alter/drop | Migration job in CI/CD |
| `api` | SELECT/INSERT/UPDATE/DELETE | The application |
| `analyst` / `readonly` | SELECT (preferably on a replica) | BI tools, debugging |
| `postgres` (superuser) | Everything | Emergency only |

Authentication methods are configured in `pg_hba.conf` (host, database, user, method). Use **`scram-sha-256`** passwords (not `md5`/`trust`) and require SSL for remote connections (`hostssl`). Managed services offer IAM-based authentication.

## 2. Row-level security (RLS)

> **In short:** Database-enforced row filters, e.g. tenant isolation.

RLS adds automatic filters per row, enforced by the database. Common for **multi-tenant** apps.

```sql
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tasks
    USING (tenant_id = current_setting('app.tenant_id')::bigint)              -- rows visible
    WITH CHECK (tenant_id = current_setting('app.tenant_id')::bigint);        -- rows allowed to write

-- The app sets the tenant at the start of each transaction:
BEGIN;
SET LOCAL app.tenant_id = '42';
SELECT * FROM tasks;          -- only tenant 42's rows, even without a WHERE
COMMIT;
```

- Table owners and superusers bypass RLS unless you `ALTER TABLE ... FORCE ROW LEVEL SECURITY`; the app should use a non-owner role.
- With connection pooling, use `SET LOCAL` (transaction-scoped) so the setting doesn't leak to the next user of that connection.
- RLS is a strong safety net against forgotten `WHERE tenant_id = ...` filters, but it has a performance cost: index `tenant_id`.

## 3. Functions

> **In short:** Reusable SQL and PL/pgSQL logic inside the database.

```sql
CREATE OR REPLACE FUNCTION task_completion_rate(p_user_id BIGINT)
RETURNS NUMERIC
LANGUAGE sql
STABLE                                   -- doesn't modify data; same result within a statement
AS $$
    SELECT round(100.0 * count(*) FILTER (WHERE done) / nullif(count(*), 0), 1)
    FROM tasks WHERE user_id = p_user_id;
$$;

SELECT email, task_completion_rate(id) FROM users;
```

PL/pgSQL for procedural logic:

```sql
CREATE OR REPLACE FUNCTION transfer(from_id BIGINT, to_id BIGINT, amount NUMERIC)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    current_balance NUMERIC;
BEGIN
    SELECT balance INTO current_balance FROM accounts WHERE id = from_id FOR UPDATE;
    IF current_balance < amount THEN
        RAISE EXCEPTION 'Insufficient funds: % < %', current_balance, amount
            USING ERRCODE = 'check_violation';
    END IF;
    UPDATE accounts SET balance = balance - amount WHERE id = from_id;
    UPDATE accounts SET balance = balance + amount WHERE id = to_id;
END;
$$;
```

- Volatility: `IMMUTABLE` (same input → same output forever: needed for expression indexes), `STABLE`, `VOLATILE` (default).
- `SECURITY DEFINER` runs with the owner's privileges: useful but dangerous; always set `search_path` inside it.
- **Procedures** (`CREATE PROCEDURE`, called with `CALL`) can commit transactions internally.

**Where should business logic live?** Usually in the application (easier to test, version, deploy). Use database functions for data-integrity rules, performance-critical set operations, or logic shared by several apps.

## 4. Triggers

> **In short:** Run functions automatically on writes, e.g. for `updated_at` and audit logs.

A trigger runs a function automatically on INSERT/UPDATE/DELETE.

```sql
-- Keep updated_at current
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_set_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Audit log
CREATE TABLE audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name TEXT, op TEXT, row_id BIGINT, old_data JSONB, new_data JSONB,
    changed_by TEXT DEFAULT current_setting('app.user_id', true), changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO audit_log (table_name, op, row_id, old_data, new_data)
    VALUES (TG_TABLE_NAME, TG_OP, COALESCE(NEW.id, OLD.id),
            CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
            CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER tasks_audit AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION audit();
```

| Timing | Use |
| --- | --- |
| `BEFORE` row trigger | Modify `NEW` (defaults, normalization) or reject the change |
| `AFTER` row trigger | Side effects: audit, denormalized counters |
| Statement-level (`FOR EACH STATEMENT`) | Once per statement |

⚠️ Triggers are "invisible" logic: they slow down writes and surprise developers. Use them sparingly and document them.

## 5. Extensions

> **In short:** Add capabilities like query stats, trigram search, PostGIS and pgvector.

```sql
SELECT * FROM pg_available_extensions ORDER BY name;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
\dx
```

| Extension | Use |
| --- | --- |
| `pg_stat_statements` | Query statistics (essential in production) |
| `pg_trgm` | Similarity search, fast `ILIKE '%x%'`, typo-tolerant search (`similarity()`, `%` operator) |
| `citext` | Case-insensitive text type (emails) |
| `pgcrypto` | Hashing/encryption functions (`crypt`, `digest`); `gen_random_uuid` is now built in |
| `unaccent` | Remove accents for search |
| `btree_gist` / `btree_gin` | Mix normal columns in GiST/GIN indexes (exclusion constraints) |
| `postgis` | Geospatial data and queries (distance, within area) |
| `pgvector` | Vector embeddings + similarity search for AI/RAG |
| `timescaledb` | Time-series (hypertables, compression, continuous aggregates) |
| `pg_partman` | Automatic partition management |
| `pg_cron` | Schedule SQL jobs inside the database |
| `postgres_fdw` | Query tables in other PostgreSQL databases |
| `auto_explain` | Log plans of slow queries |
| `pg_repack` | Remove bloat online |

### pgvector example

> **In short:** Store embeddings and find the most similar documents.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE documents (id BIGSERIAL PRIMARY KEY, content TEXT, embedding vector(1536));
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);

SELECT id, content
FROM documents
ORDER BY embedding <=> $1      -- cosine distance to the query embedding
LIMIT 5;
```

### Trigram search example

> **In short:** Typo-tolerant search with `pg_trgm`.

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX products_name_trgm ON products USING gin (name gin_trgm_ops);
SELECT name, similarity(name, 'iphon') AS score
FROM products WHERE name % 'iphon'          -- similar enough (typo-tolerant)
ORDER BY score DESC LIMIT 10;
```

Managed services only allow a list of approved extensions: check before relying on one.

## 6. Data protection

> **In short:** Encryption in transit and at rest, column encryption and masking copies of data.

- Encryption in transit: `sslmode=require` (or `verify-full` with the CA certificate) in connection strings.
- Encryption at rest: disk/volume encryption (default on managed services).
- Column-level encryption for very sensitive fields (encrypt in the app with a key from a KMS; the DB only sees ciphertext).
- Hash passwords in the app (argon2/bcrypt), never in SQL with fast hashes.
- Mask production data before copying it to staging (`pg_dump` + anonymization scripts, or tools like `pg_anonymizer`).

---

## 7. Exercises

1. Create `migrator`, `api` and `readonly` roles with the right privileges and default privileges; verify `api` can't `DROP TABLE`.
2. Add RLS to a multi-tenant `projects` table and prove a tenant can't see another's rows.
3. Write an `updated_at` trigger and an audit trigger, and inspect the audit log after some updates.
4. Write a SQL function returning a user's completion rate and use it in a query.
5. Install `pg_trgm` and build a typo-tolerant product search.
