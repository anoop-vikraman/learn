# 03 · Advanced SQL in PostgreSQL

## 1. CTEs (WITH)

> **In short:** Named subqueries for readable multi-step queries.

```sql
WITH recent AS (
    SELECT * FROM tasks WHERE created_at > now() - interval '30 days'
),
per_user AS (
    SELECT user_id, count(*) AS n FROM recent GROUP BY user_id
)
SELECT u.email, p.n
FROM per_user p JOIN users u ON u.id = p.user_id
ORDER BY p.n DESC;
```

Since PostgreSQL 12, simple CTEs are inlined (optimized like subqueries). Use `WITH x AS MATERIALIZED (...)` to force computing it once.

### Data-modifying CTEs

> **In short:** Combine DELETE/UPDATE/INSERT with RETURNING in one statement, e.g. to move rows.

```sql
WITH archived AS (
    DELETE FROM tasks WHERE done AND created_at < now() - interval '1 year'
    RETURNING *
)
INSERT INTO tasks_archive SELECT * FROM archived;   -- move rows in one statement
```

## 2. Recursive CTEs: trees and hierarchies

> **In short:** Walk parent-child data such as comment threads and category trees.

```sql
-- All replies under comment 1, with depth
WITH RECURSIVE thread AS (
    SELECT id, parent_id, body, 0 AS depth
    FROM comments WHERE id = 1                      -- anchor: starting row(s)
  UNION ALL
    SELECT c.id, c.parent_id, c.body, t.depth + 1
    FROM comments c
    JOIN thread t ON c.parent_id = t.id             -- recursive step
)
SELECT * FROM thread ORDER BY depth;

-- Generate a date series without gaps (for charts)
SELECT d::date AS day, count(t.id)
FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, interval '1 day') AS d
LEFT JOIN tasks t ON t.created_at::date = d::date
GROUP BY 1 ORDER BY 1;
```

Use recursion for category trees, org charts, threaded comments and bill-of-materials. Add a depth limit to guard against cycles.

## 3. Window functions

> **In short:** Compute rankings, running totals and previous/next values without collapsing rows.

Window functions compute values **across related rows without collapsing them** (unlike GROUP BY).

```sql
SELECT
    user_id,
    title,
    created_at,
    row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn,       -- 1, 2, 3… per user
    count(*)     OVER (PARTITION BY user_id)                           AS user_total,
    rank()       OVER (ORDER BY priority)                              AS priority_rank,
    lag(created_at)  OVER (PARTITION BY user_id ORDER BY created_at)   AS previous_task_at,
    lead(created_at) OVER (PARTITION BY user_id ORDER BY created_at)   AS next_task_at
FROM tasks;
```

| Function | Gives |
| --- | --- |
| `row_number()` | 1, 2, 3, 4 (unique) |
| `rank()` | 1, 2, 2, 4 (gaps after ties) |
| `dense_rank()` | 1, 2, 2, 3 |
| `ntile(4)` | Quartile number |
| `lag(col, n)`, `lead(col, n)` | Value from the previous/next row |
| `first_value`, `last_value`, `nth_value` | Value at a position in the window |
| `sum/avg/count/min/max(...) OVER (...)` | Running or group totals |

### Common patterns

> **In short:** Top-N per group, `DISTINCT ON`, running totals and percentages.

```sql
-- Latest task per user ("top-N per group")
SELECT * FROM (
    SELECT t.*, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM tasks t
) x WHERE rn = 1;

-- PostgreSQL shortcut for "first row per group"
SELECT DISTINCT ON (user_id) * FROM tasks ORDER BY user_id, created_at DESC;

-- Running total of revenue by day
SELECT day, revenue,
       sum(revenue) OVER (ORDER BY day) AS running_total,
       avg(revenue) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS moving_avg_7d
FROM daily_revenue;

-- Percentage of total
SELECT category, sales, round(100.0 * sales / sum(sales) OVER (), 1) AS pct FROM category_sales;
```

## 4. Upserts and MERGE

> **In short:** Insert-or-update with `ON CONFLICT`, or sync from a source with `MERGE`.

```sql
INSERT INTO product_stock (product_id, qty) VALUES (1, 5)
ON CONFLICT (product_id) DO UPDATE SET qty = product_stock.qty + EXCLUDED.qty;

-- MERGE (PG 15+): insert/update/delete from a source in one statement
MERGE INTO product_stock s
USING incoming i ON s.product_id = i.product_id
WHEN MATCHED AND i.qty = 0 THEN DELETE
WHEN MATCHED THEN UPDATE SET qty = i.qty
WHEN NOT MATCHED THEN INSERT (product_id, qty) VALUES (i.product_id, i.qty);
```

`ON CONFLICT` needs a unique constraint or index on the conflict columns.

## 5. LATERAL joins

> **In short:** Run a subquery per row, e.g. each user's latest three tasks.

A subquery that can reference columns from tables earlier in the FROM clause: "for each row, run this query".

```sql
-- Each user's 3 most recent tasks
SELECT u.email, t.title, t.created_at
FROM users u
CROSS JOIN LATERAL (
    SELECT title, created_at FROM tasks
    WHERE tasks.user_id = u.id
    ORDER BY created_at DESC
    LIMIT 3
) t;
```

With an index on `(user_id, created_at DESC)` this is very efficient.

## 6. JSON in queries

> **In short:** Build API-shaped JSON in SQL and expand JSON arrays into rows.

```sql
-- Return API-shaped JSON directly from SQL
SELECT jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'tasks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title) ORDER BY t.id)
                       FROM tasks t WHERE t.user_id = u.id), '[]'::jsonb)
) AS user_json
FROM users u WHERE u.id = 1;

-- Expand a JSON array into rows
SELECT e.id, item ->> 'sku' AS sku, (item ->> 'qty')::int AS qty
FROM events e, jsonb_array_elements(e.payload -> 'items') AS item;

-- SQL/JSON path
SELECT * FROM events WHERE payload @? '$.items[*] ? (@.qty > 10)';
```

## 7. Full-text search

> **In short:** Language-aware search with `tsvector`, ranking, GIN indexes and highlighted snippets.

```sql
ALTER TABLE articles ADD COLUMN search tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(body, '')), 'B')
    ) STORED;

CREATE INDEX articles_search_idx ON articles USING gin (search);

SELECT id, title, ts_rank(search, q) AS rank
FROM articles, websearch_to_tsquery('english', 'fastapi -django "dependency injection"') AS q
WHERE search @@ q
ORDER BY rank DESC
LIMIT 20;

SELECT ts_headline('english', body, websearch_to_tsquery('english', 'fastapi'));   -- highlighted snippet
```

- `to_tsvector` normalizes words (stemming: "running" → "run") and removes stop words.
- `websearch_to_tsquery` understands Google-like syntax (quotes, `-`, `or`).
- For typo tolerance and "contains" searches use the `pg_trgm` extension (lesson 05). For advanced search (facets, synonyms, relevance tuning) consider Elasticsearch/OpenSearch/Meilisearch.

## 8. Views and materialized views

> **In short:** Saved queries; materialized views store results and need refreshing.

```sql
-- View: a saved query (always up to date, computed on each use)
CREATE VIEW open_tasks AS
SELECT t.*, u.email FROM tasks t JOIN users u ON u.id = t.user_id WHERE NOT t.done;

SELECT * FROM open_tasks WHERE email = 'a@x.com';

-- Materialized view: stores the result (fast to read, must be refreshed)
CREATE MATERIALIZED VIEW daily_stats AS
SELECT date_trunc('day', created_at) AS day, count(*) AS created, count(*) FILTER (WHERE done) AS done
FROM tasks GROUP BY 1;

CREATE UNIQUE INDEX ON daily_stats (day);
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_stats;   -- no read lock (needs a unique index)
```

Refresh materialized views on a schedule (cron, Celery beat) for dashboards.

## 9. Other handy features

> **In short:** FILTER, ROLLUP, sampling, SKIP LOCKED job queues and LISTEN/NOTIFY.

```sql
-- Conditional aggregates
SELECT count(*) FILTER (WHERE done), count(*) FILTER (WHERE NOT done) FROM tasks;

-- GROUPING SETS / ROLLUP: subtotals
SELECT region, product, sum(sales) FROM sales GROUP BY ROLLUP (region, product);

-- Sampling a big table
SELECT * FROM events TABLESAMPLE SYSTEM (1);       -- ~1% of pages

-- Generate fake data quickly
INSERT INTO tasks (title, user_id, priority, created_at)
SELECT 'Task ' || g, (random() * 999 + 1)::int, (random() * 4 + 1)::int, now() - random() * interval '365 days'
FROM generate_series(1, 1000000) g;

-- RETURNING on any write
UPDATE tasks SET done = true WHERE id = 1 RETURNING id, done, updated_at;

-- Locking for job queues
UPDATE jobs SET status = 'running', started_at = now()
WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
RETURNING *;

-- LISTEN / NOTIFY: lightweight pub/sub
NOTIFY task_events, '{"id": 1, "action": "created"}';
LISTEN task_events;
```

---

## 10. Exercises

1. Find each user's latest task three ways: window function, `DISTINCT ON`, `LATERAL`.
2. Compute a 7-day moving average of tasks created per day, filling missing days with 0.
3. Build a recursive query for a category tree with breadcrumb paths (`'Electronics > Phones > Android'`).
4. Add full-text search to a `posts` table with ranking and highlighted snippets.
5. Return a user with nested tasks as a single JSON object from SQL.
6. Create a materialized view for a dashboard and refresh it concurrently.
