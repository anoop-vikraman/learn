# 05 · Indexes and query performance

## 1. What is an index?

> **In short:** A sorted structure that lets the database find rows without scanning the whole table.

Without an index, finding `WHERE email = 'a@x.com'` means reading **every row** (a **sequential scan**). An **index** is a separate, sorted data structure, like a book's index, that points to the rows, so the database can jump straight to them.

```sql
CREATE INDEX idx_tasks_user_id ON tasks (user_id);
CREATE UNIQUE INDEX idx_users_email ON users (email);   -- also enforces uniqueness
DROP INDEX idx_tasks_user_id;
```

PRIMARY KEY and UNIQUE constraints create indexes automatically. **Foreign keys do NOT** (in PostgreSQL): index FK columns you join or filter on.

## 2. How a B-tree index works

> **In short:** A balanced tree that finds a value in a few page reads; good for equality, ranges and sorting.

The default index type is a **B-tree**: a balanced tree of sorted keys. Finding a value takes O(log n) steps: about 3–4 page reads even for millions of rows.

```
                 [  M  ]
              /           \
        [ D  H ]         [ R  W ]
       /   |   \        /   |   \
   [A-C][E-G][I-L]  [N-Q][S-V][X-Z]  → leaf pages point to table rows
```

B-trees support: `=`, `<`, `>`, `BETWEEN`, `IN`, `ORDER BY`, `LIKE 'prefix%'`, `IS NULL`.

They **don't** help with: `LIKE '%suffix'`, functions on the column (`lower(email) = ...`) unless you index that expression, or negations like `<>`.

## 3. The cost of indexes

> **In short:** Faster reads, but slower writes and extra storage: index only what queries need.

| Benefit | Cost |
| --- | --- |
| Much faster reads/filters/sorts/joins | Every INSERT/UPDATE/DELETE must update every index on the table |
| Enforce uniqueness | Disk space and memory |
| | The planner has more options to consider |

So: **index what your queries actually need**, not every column.

## 4. Composite (multi-column) indexes

> **In short:** Column order matters (leftmost prefix): equality columns first, then ranges/sorting.

```sql
CREATE INDEX idx_tasks_user_done_created ON tasks (user_id, done, created_at DESC);
```

Column order matters (the **leftmost prefix rule**). This index helps:

```sql
WHERE user_id = 1                                         -- ✅ leftmost column
WHERE user_id = 1 AND done = false                        -- ✅
WHERE user_id = 1 AND done = false ORDER BY created_at DESC   -- ✅ even avoids a sort
WHERE done = false                                        -- ❌ skips the first column (mostly not used)
```

Guidelines for column order: **equality filters first**, then range filters or sort columns. A composite index on `(a, b)` usually makes a separate index on `(a)` redundant.

## 5. Other index kinds

> **In short:** Partial, expression, covering, hash, GIN, GiST and BRIN indexes for special cases.

| Kind | Use |
| --- | --- |
| **Unique** | Enforce uniqueness |
| **Partial** | Index only some rows: `CREATE INDEX ... ON tasks (user_id) WHERE done = false;` (smaller, faster). Also for "unique among non-deleted rows" |
| **Expression** | `CREATE INDEX ... ON users (lower(email));` for `WHERE lower(email) = ...` |
| **Covering** | `CREATE INDEX ... ON tasks (user_id) INCLUDE (title);` lets the query be answered from the index alone (index-only scan) |
| **Hash** | Equality only |
| **GIN** (PostgreSQL) | Arrays, JSONB, full-text search |
| **GiST / SP-GiST** | Geometric, ranges, nearest-neighbour, full-text |
| **BRIN** | Huge, naturally ordered tables (time-series): tiny index |

PostgreSQL details: [../04-PostgreSQL/04-indexes-performance.md](../04-PostgreSQL/04-indexes-performance.md).

## 6. Selectivity

> **In short:** Indexes help most when a filter matches a small fraction of rows.

An index helps most when a filter matches **a small fraction of rows** (high selectivity). `WHERE email = ...` (1 row) is ideal. `WHERE is_active = true` when 95% of rows are active is useless: reading the whole table is faster, and the planner will ignore the index. (A partial index on the rare value can help.)

## 7. Reading query plans

> **In short:** `EXPLAIN (ANALYZE)` shows how a query runs and where the time goes.

Ask the database **how** it runs a query:

```sql
EXPLAIN SELECT * FROM tasks WHERE user_id = 42;                 -- estimated plan
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM tasks WHERE user_id = 42;   -- actually runs it, real timings
```

```
Index Scan using idx_tasks_user_id on tasks  (cost=0.43..8.45 rows=5 width=64) (actual time=0.03..0.05 rows=4 loops=1)
  Index Cond: (user_id = 42)
Planning Time: 0.1 ms
Execution Time: 0.08 ms
```

| Node | Meaning |
| --- | --- |
| `Seq Scan` | Reads the whole table: fine for small tables, a red flag for big ones with selective filters |
| `Index Scan` | Uses an index, then fetches rows from the table |
| `Index Only Scan` | Answers from the index alone (best) |
| `Bitmap Heap Scan` | Collects many matching rows via an index, then reads them in page order |
| `Nested Loop` | For each row on one side, look up matches (great with an index and few rows) |
| `Hash Join` | Builds a hash table from one side (good for big unsorted joins) |
| `Merge Join` | Joins two sorted inputs |
| `Sort` | Sorting (check if it spills to disk: "external merge") |

What to look for: big **Seq Scans** with filters, **estimated vs actual rows** far apart (stale statistics: run `ANALYZE`), sorts spilling to disk, nested loops over many rows.

⚠️ `EXPLAIN ANALYZE` really executes the statement: wrap writes in `BEGIN; ... ROLLBACK;`.

## 8. Common performance problems and fixes

> **In short:** Missing indexes, functions on columns, N+1, deep offsets and more, with their fixes.

| Problem | Fix |
| --- | --- |
| Missing index on a filter/join/FK column | Add the right (composite) index |
| Function on an indexed column (`WHERE date(created_at) = ...`) | Rewrite as a range (`created_at >= '2026-11-10' AND created_at < '2026-11-11'`) or index the expression |
| `SELECT *` returning big columns | Select only what you need |
| **N+1 queries** from the ORM | Eager loading / one query with a join |
| Large `OFFSET` pagination | Keyset (cursor) pagination: `WHERE id < :last_id ORDER BY id DESC LIMIT 20` |
| `LIKE '%term%'` on big tables | Trigram index (`pg_trgm`) or full-text search |
| Counting huge tables exactly (`count(*)`) | Estimates, cached counters, or avoid showing exact totals |
| Too many indexes slowing writes | Remove unused/duplicate indexes |
| Lock contention on hot rows | Shorter transactions, queue work, redesign counters |
| Stale statistics → bad plans | `ANALYZE` (autovacuum usually handles it) |
| Implicit type casts preventing index use | Compare with the column's type (`WHERE id = 42`, not `'42'` on some DBs) |

## 9. A process for slow queries

> **In short:** Find → reproduce → explain → fix → verify → monitor.

1. **Find** them: slow query log / `pg_stat_statements` / APM traces.
2. **Reproduce** with real parameters and production-like data volume.
3. **EXPLAIN ANALYZE** and find the expensive node.
4. **Fix**: index, rewrite, reduce data, cache, or change the design.
5. **Verify** the plan and timing improved, and that write performance is still fine.
6. **Monitor** after deploying.

---

## 10. Exercises

1. Insert 1,000,000 tasks (`INSERT ... SELECT FROM generate_series(1, 1000000)`) and time `WHERE user_id = 42` before and after adding an index.
2. Create a composite index for "a user's open tasks, newest first" and confirm the plan has no Sort step.
3. Show that `WHERE lower(email) = ...` ignores a plain index; fix it with an expression index.
4. Compare `OFFSET 900000` with keyset pagination using EXPLAIN ANALYZE.
5. Create a partial unique index to keep emails unique among non-deleted users.
