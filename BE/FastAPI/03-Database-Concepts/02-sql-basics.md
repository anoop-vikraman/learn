# 02 · SQL basics

Examples use PostgreSQL syntax; most of it is standard SQL. Keywords are case-insensitive (uppercase is just a convention). End statements with `;`.

## 1. Creating tables

> **In short:** `CREATE TABLE` with column types and constraints; `ALTER`/`DROP` change or remove tables.

```sql
CREATE TABLE users (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- auto-incrementing id
    email       TEXT NOT NULL UNIQUE,
    full_name   TEXT,
    age         INTEGER CHECK (age >= 0),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title       TEXT NOT NULL,
    done        BOOLEAN NOT NULL DEFAULT false,
    priority    SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    due_date    DATE,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Common types: `INTEGER`/`BIGINT`, `NUMERIC(10,2)` (exact decimals: money), `TEXT`/`VARCHAR(n)`, `BOOLEAN`, `DATE`, `TIMESTAMPTZ` (timestamp with time zone), `UUID`, `JSONB`. More in [../04-PostgreSQL/02-data-types-constraints.md](../04-PostgreSQL/02-data-types-constraints.md).

Changing and removing tables:

```sql
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ALTER COLUMN full_name SET NOT NULL;
ALTER TABLE users RENAME COLUMN full_name TO name;
ALTER TABLE users DROP COLUMN phone;
DROP TABLE tasks;                       -- deletes the table and all its data ⚠️
TRUNCATE tasks;                         -- deletes all rows, keeps the table (fast)
```

In real projects, schema changes go through **migrations** ([../09-Migrations/](../09-Migrations/)).

## 2. Inserting

> **In short:** Add rows with `INSERT`, get generated values with `RETURNING`, and upsert with `ON CONFLICT`.

```sql
INSERT INTO users (email, full_name, age) VALUES ('anoop@example.com', 'Anoop', 25);

INSERT INTO users (email, full_name) VALUES             -- several rows at once
    ('bina@example.com', 'Bina'),
    ('chen@example.com', 'Chen');

INSERT INTO tasks (title, user_id) VALUES ('Write docs', 1)
RETURNING id, created_at;                               -- PostgreSQL: get generated values back

-- Insert or update if it already exists ("upsert")
INSERT INTO users (email, full_name) VALUES ('anoop@example.com', 'Anoop V')
ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO users (email) VALUES ('anoop@example.com')
ON CONFLICT (email) DO NOTHING;
```

Strings use **single quotes**; double quotes are for identifiers (`"Column Name"`). Escape a quote by doubling it: `'It''s'`.

## 3. Selecting

> **In short:** Read data with `SELECT`, choosing columns, expressions, aliases and distinct values.

```sql
SELECT * FROM users;                                  -- all columns (avoid in app code)
SELECT id, email FROM users;                          -- specific columns
SELECT email AS login, age + 1 AS next_age FROM users;   -- aliases and expressions
SELECT DISTINCT user_id FROM tasks;                   -- unique values
SELECT count(*) FROM users;
```

### Filtering with WHERE

> **In short:** Keep only matching rows using comparisons, `AND`/`OR`, `IN`, `BETWEEN`, `LIKE` and `IS NULL`.

```sql
SELECT * FROM tasks WHERE done = false;
SELECT * FROM tasks WHERE priority >= 4 AND done = false;
SELECT * FROM tasks WHERE priority = 1 OR due_date < CURRENT_DATE;
SELECT * FROM tasks WHERE NOT done;
SELECT * FROM tasks WHERE priority IN (1, 2);
SELECT * FROM tasks WHERE priority BETWEEN 2 AND 4;            -- inclusive
SELECT * FROM users WHERE email LIKE '%@example.com';          -- % any chars, _ one char
SELECT * FROM users WHERE full_name ILIKE 'an%';               -- case-insensitive (PostgreSQL)
SELECT * FROM tasks WHERE due_date IS NULL;
SELECT * FROM tasks WHERE created_at >= now() - interval '7 days';
```

Comparison operators: `=`, `<>` or `!=`, `<`, `<=`, `>`, `>=`.

### Sorting and limiting

> **In short:** `ORDER BY` sets the order; `LIMIT`/`OFFSET` return a page of rows.

```sql
SELECT * FROM tasks ORDER BY priority DESC, created_at ASC;
SELECT * FROM tasks ORDER BY due_date NULLS LAST;
SELECT * FROM tasks ORDER BY created_at DESC LIMIT 10 OFFSET 20;   -- page 3 of 10
```

⚠️ Without `ORDER BY`, row order is **not guaranteed**. Always sort when you paginate.

## 4. NULL: the missing value

> **In short:** NULL means unknown: compare with `IS NULL`, replace with `COALESCE`, and watch out for `NOT IN`.

`NULL` means "unknown / no value". It is **not** zero or an empty string, and it behaves specially:

```sql
SELECT NULL = NULL;          -- NULL (not true!)
SELECT * FROM tasks WHERE due_date = NULL;     -- ❌ returns nothing
SELECT * FROM tasks WHERE due_date IS NULL;    -- ✅
SELECT * FROM tasks WHERE due_date IS NOT NULL;

SELECT COALESCE(full_name, 'Anonymous') FROM users;   -- first non-NULL value
SELECT NULLIF(age, 0) FROM users;                     -- NULL if age = 0

-- NOT IN with a NULL in the list returns no rows ⚠️
SELECT * FROM t WHERE x NOT IN (1, NULL);   -- always empty; use NOT EXISTS instead
```

Any arithmetic with NULL gives NULL (`5 + NULL` → NULL). Aggregate functions like `sum` and `avg` **ignore** NULLs; `count(*)` counts rows, `count(column)` counts non-NULL values. `IS DISTINCT FROM` compares treating NULLs as equal values.

Use `NOT NULL` on columns unless "unknown" is a real possibility.

## 5. Updating and deleting

> **In short:** Change or remove rows; always use a `WHERE` and test risky changes in a transaction.

```sql
UPDATE tasks SET done = true WHERE id = 10;
UPDATE tasks SET priority = priority + 1, done = false WHERE user_id = 1 AND due_date < CURRENT_DATE;
UPDATE users SET is_active = false WHERE id = 2 RETURNING id, email;

DELETE FROM tasks WHERE id = 11;
DELETE FROM tasks WHERE done = true AND created_at < now() - interval '1 year';
```

⚠️ **`UPDATE` or `DELETE` without `WHERE` changes every row.** Run the same `WHERE` as a `SELECT` first, and do risky changes inside a transaction so you can `ROLLBACK`:

```sql
BEGIN;
DELETE FROM tasks WHERE user_id = 2;    -- check the reported row count
ROLLBACK;                               -- or COMMIT if it's right
```

## 6. Useful functions

> **In short:** Built-in functions for text, numbers, dates and type casting.

```sql
-- Text
SELECT lower(email), upper(full_name), length(full_name), trim('  x  '),
       concat(full_name, ' <', email, '>'), full_name || '!',     -- || concatenates
       substring(email FROM 1 FOR 5), replace(email, '@', ' at '), split_part(email, '@', 2)
FROM users;

-- Numbers
SELECT round(12.345, 2), ceil(4.2), floor(4.8), abs(-3), 7 / 2 AS int_div, 7 / 2.0 AS real_div, 7 % 2;

-- Dates
SELECT now(), CURRENT_DATE, created_at::date, date_trunc('month', created_at),
       extract(year FROM created_at), age(now(), created_at), created_at + interval '1 day'
FROM users;

-- Conversion (cast)
SELECT '42'::int, CAST('2026-11-10' AS date), 42::text;
```

⚠️ Integer division truncates: `7 / 2` = `3`.

## 7. Comments and formatting

> **In short:** Comment syntax and a readable layout for queries.

```sql
-- single-line comment
/* multi-line
   comment */

SELECT t.id,
       t.title
FROM   tasks AS t
WHERE  t.done = false
ORDER  BY t.created_at DESC;
```

## 8. SQL execution order (why aliases sometimes don't work)

> **In short:** Clauses run FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT.

You write: `SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY … LIMIT`

The database logically runs: **FROM/JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT/OFFSET**

So a column alias defined in `SELECT` can't be used in `WHERE` (it doesn't exist yet), but can be used in `ORDER BY`.

## 9. Parameters (from application code)

> **In short:** Pass values as parameters, never by string formatting, to prevent SQL injection.

Never put user input into SQL with string formatting:

```python
cur.execute(f"SELECT * FROM users WHERE email = '{email}'")          # ❌ SQL injection
cur.execute("SELECT * FROM users WHERE email = %s", (email,))         # ✅ psycopg parameter
```

With input like `' OR '1'='1`, the first version returns every user.

---

## 10. Exercises

Using the `users` and `tasks` tables:

1. Insert 3 users and 10 tasks with different priorities and due dates.
2. List undone tasks ordered by priority (high first), then due date (NULLs last).
3. Find users whose email ends with `@example.com` and who have no `full_name`.
4. Mark all overdue tasks as priority 1, returning their ids.
5. Delete done tasks older than 30 days inside a transaction; check the count; roll back.
6. Show each task's title with its age in days.
