# 04 · Indexes and performance in PostgreSQL

General indexing concepts: [../03-Database-Concepts/05-indexes-performance.md](../03-Database-Concepts/05-indexes-performance.md).

## 1. Index types

> **In short:** B-tree, hash, GIN, GiST, BRIN and vector indexes, and which queries each speeds up.

| Type | Supports | Example |
| --- | --- | --- |
| **B-tree** (default) | `= < > BETWEEN IN`, sorting, `LIKE 'abc%'` | `CREATE INDEX ON tasks (user_id, created_at DESC);` |
| **Hash** | `=` only | Rarely better than B-tree |
| **GIN** | Contains/overlap: arrays, JSONB, full-text, trigrams | `CREATE INDEX ON events USING gin (payload);` |
| **GiST** | Ranges, geometry, nearest neighbour, exclusion constraints | `CREATE INDEX ON bookings USING gist (during);` |
| **SP-GiST** | Non-balanced structures (IP ranges, quadtrees) | |
| **BRIN** | Huge tables naturally ordered by a column (time) | `CREATE INDEX ON logs USING brin (created_at);` (tiny) |
| pgvector **HNSW/IVFFlat** | Vector similarity | `CREATE INDEX ON docs USING hnsw (embedding vector_cosine_ops);` |

### Index features

> **In short:** Partial, expression, covering, trigram and JSONB-specific indexes.

```sql
CREATE INDEX tasks_open_by_user ON tasks (user_id) WHERE NOT done;                -- partial
CREATE INDEX users_email_lower ON users (lower(email));                           -- expression
CREATE INDEX tasks_user_cover ON tasks (user_id) INCLUDE (title, done);           -- covering
CREATE INDEX events_payload_path ON events USING gin (payload jsonb_path_ops);    -- smaller GIN for @>
CREATE INDEX users_name_trgm ON users USING gin (full_name gin_trgm_ops);         -- fast ILIKE '%anoop%' (pg_trgm)
```

### Create indexes without blocking writes

> **In short:** Use `CONCURRENTLY` on live tables; drop and retry if a build fails.

```sql
CREATE INDEX CONCURRENTLY tasks_user_idx ON tasks (user_id);   -- ✅ production: doesn't lock writes
DROP INDEX CONCURRENTLY tasks_user_idx;
REINDEX INDEX CONCURRENTLY tasks_user_idx;                     -- rebuild a bloated index
```

⚠️ `CONCURRENTLY` can't run inside a transaction block, takes longer, and leaves an **INVALID** index if it fails (drop it and retry). Plain `CREATE INDEX` blocks writes to the table for the whole build.

## 2. EXPLAIN in PostgreSQL

> **In short:** Read costs, estimated vs actual rows, and buffer usage in query plans.

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM tasks WHERE user_id = 42 AND NOT done ORDER BY created_at DESC LIMIT 20;
```

```
Limit  (cost=0.43..12.1 rows=20 width=72) (actual time=0.040..0.090 rows=20 loops=1)
  Buffers: shared hit=24
  ->  Index Scan using tasks_user_open_created on tasks  (cost=... rows=310 ...) (actual ... rows=20 loops=1)
        Index Cond: (user_id = 42)
        Filter: (NOT done)
Planning Time: 0.15 ms
Execution Time: 0.12 ms
```

- **cost**: planner's estimate (startup..total) in arbitrary units.
- **rows** (estimate) vs **actual rows**: large differences mean bad statistics → `ANALYZE tasks;` or raise `default_statistics_target` for that column.
- **Buffers: shared hit** = pages found in memory; **read** = from disk.
- **loops**: multiply per-loop time by loops for the real total.
- Visualize plans with **explain.dalibo.com** or **pgMustard**.

## 3. pg_stat_statements: find the queries that matter

> **In short:** Rank queries by total time to see what to optimize first.

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;   -- also needs shared_preload_libraries = 'pg_stat_statements'

SELECT round(total_exec_time::numeric, 0) AS total_ms,
       calls,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       rows,
       left(query, 100) AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC          -- the biggest total cost, not just the slowest single query
LIMIT 20;
```

A 5 ms query called 1 million times matters more than a 2 s query run once a day.

Also enable `log_min_duration_statement = 500` (log queries slower than 500 ms) and `auto_explain` to log plans of slow queries.

## 4. Useful diagnostic queries

> **In short:** Find unused indexes, sequential scans, cache hit ratio, blocking and large tables.

```sql
-- Unused indexes (candidates to drop: check replicas and rare jobs first)
SELECT relname AS table, indexrelname AS index, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- Tables with many sequential scans (maybe missing an index)
SELECT relname, seq_scan, seq_tup_read, idx_scan, n_live_tup
FROM pg_stat_user_tables
ORDER BY seq_tup_read DESC LIMIT 10;

-- Cache hit ratio (aim for > 99% on OLTP)
SELECT sum(heap_blks_hit) * 100.0 / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) AS hit_pct
FROM pg_statio_user_tables;

-- Who is blocking whom
SELECT blocked.pid AS blocked_pid, blocked.query AS blocked_query,
       blocking.pid AS blocking_pid, blocking.query AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));

-- Largest tables
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
```

## 5. VACUUM, ANALYZE and bloat

> **In short:** Clean up dead rows, refresh statistics, control bloat and prevent wraparound.

Because of MVCC, UPDATE and DELETE leave **dead row versions**. **VACUUM** marks their space reusable; **ANALYZE** refreshes the statistics the planner uses. **Autovacuum** does both automatically; keep it on.

```sql
SELECT relname, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;

VACUUM (VERBOSE, ANALYZE) tasks;     -- manual; doesn't block normal reads/writes
VACUUM FULL tasks;                   -- ⚠️ rewrites the table and LOCKS it completely: avoid in production
```

- **Bloat**: tables/indexes larger than their live data because dead space isn't reused fast enough. Fix with tuning autovacuum, `REINDEX CONCURRENTLY`, or online tools like `pg_repack`.
- **Long-running or idle-in-transaction sessions** block vacuum cleanup everywhere: set `idle_in_transaction_session_timeout`.
- For very busy tables, tune per table: `ALTER TABLE tasks SET (autovacuum_vacuum_scale_factor = 0.02);`.
- **Transaction ID wraparound**: PostgreSQL must "freeze" old rows before 32-bit transaction IDs run out. Autovacuum handles it; monitor `age(datfrozenxid)`. If ignored, the database eventually stops accepting writes.

## 6. Key configuration settings

> **In short:** Memory, connections, planner costs, timeouts and logging settings to tune.

Defaults are conservative. Common starting points (use **PGTune** as a guide; managed services set many of these for you):

| Setting | Meaning | Starting point |
| --- | --- | --- |
| `shared_buffers` | PostgreSQL's own cache | ~25% of RAM |
| `effective_cache_size` | Planner's estimate of total cache (incl. OS) | ~50–75% of RAM |
| `work_mem` | Memory per sort/hash operation (per query node!) | 4–64 MB; raise per session for big reports |
| `maintenance_work_mem` | VACUUM, CREATE INDEX | 256 MB–2 GB |
| `max_connections` | Max client connections | 100–300; use PgBouncer instead of raising it a lot |
| `random_page_cost` | Cost of random reads | 1.1 for SSDs (default 4 assumes spinning disks) |
| `wal_level`, `max_wal_size` | WAL / replication / checkpoints | `replica`; size to avoid frequent checkpoints |
| `statement_timeout` | Kill queries running longer than this | Set per role, e.g. app role 30 s |
| `idle_in_transaction_session_timeout` | Kill sessions idle inside a transaction | 60 s |
| `log_min_duration_statement` | Log slow queries | 250–1000 ms |

```sql
ALTER ROLE app_user SET statement_timeout = '30s';
SHOW work_mem;
SET work_mem = '256MB';            -- this session only
```

## 7. Query-writing tips for PostgreSQL

> **In short:** Habits that keep queries fast: EXISTS, keyset pagination, batching, COPY.

- Use `EXISTS` instead of `count(*) > 0`.
- Keyset pagination instead of large `OFFSET`.
- Avoid `SELECT *` in hot paths; covering indexes enable index-only scans.
- Batch inserts (`INSERT ... VALUES (...), (...)` or `COPY`) instead of one row per statement.
- `COPY` is the fastest way to load big data.
- Avoid functions on indexed columns in WHERE (or index the expression).
- Use `ANY(:ids)` with an array parameter instead of building huge `IN (...)` lists.
- Prepared statements reduce planning time (drivers often do this automatically).

---

## 8. Exercises

1. Enable `pg_stat_statements`, run a workload, and list the top 5 queries by total time.
2. Add a trigram index and compare `ILIKE '%term%'` with and without it.
3. Create an index `CONCURRENTLY` on a 1M-row table while another session inserts rows.
4. Update every row of a large table, check `n_dead_tup`, run `VACUUM ANALYZE`, check again.
5. Create a blocking situation between two sessions and identify it with `pg_blocking_pids`.
