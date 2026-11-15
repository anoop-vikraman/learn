# Python + FastAPI interview questions

Open the Markdown preview, answer out loud, then expand to compare.

---

## A. Python language

<details>
<summary>Mutable vs immutable types — and why it matters.</summary>

Immutable: `int`, `float`, `str`, `tuple`, `frozenset`, `bytes`. Mutable: `list`, `dict`, `set`, most objects.

It matters because names are **references**: `b = a` doesn't copy. Mutating through one name is visible through the other. It's also why only immutable (hashable) objects can be dict keys or set members, and why the mutable-default-argument bug exists:

```python
def add(item, items=[]):     # ❌ the same list is reused across calls
def add(item, items=None):   # ✅
    items = [] if items is None else items
```

</details>

<details>
<summary>What is the GIL and how do you work around it?</summary>

CPython's **Global Interpreter Lock** allows only one thread to execute Python bytecode at a time, which makes reference counting thread-safe without per-object locks.

Consequences: threads **don't** speed up CPU-bound Python, but they **do** help I/O-bound work because the GIL is released during blocking I/O (and by C extensions like NumPy).

Workarounds: `multiprocessing`/`ProcessPoolExecutor` for CPU work, `asyncio` for high-concurrency I/O, native extensions, or a task queue like Celery. Python 3.13+ has an experimental free-threaded build without the GIL.

</details>

<details>
<summary>Explain decorators. Write one with arguments.</summary>

A decorator is a function that takes a function and returns a replacement, usually wrapping it. `@d` above `def f` means `f = d(f)`.

```python
import functools, time

def retry(times=3, exceptions=(Exception,)):
    def decorator(fn):
        @functools.wraps(fn)                  # preserve __name__/__doc__
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions:
                    if attempt == times:
                        raise
                    time.sleep(2 ** attempt)
        return wrapper
    return decorator

@retry(times=5, exceptions=(ConnectionError,))
def call_api(): ...
```

</details>

<details>
<summary>Generators vs lists — when and why?</summary>

A generator produces values lazily, one at a time, holding only the current item in memory; a list materialises everything.

```python
sum(n * n for n in range(10**8))     # constant memory
sum([n * n for n in range(10**8)])   # ~GBs, likely an OOM
```

Use generators for large or infinite sequences, streaming files and pipelines. Caveats: single-use (once exhausted, they're empty) and no `len()` or indexing.

</details>

<details>
<summary>What does a context manager do? Write one.</summary>

Guarantees setup and cleanup around a block, even if an exception occurs — `__enter__`/`__exit__`, or the `@contextmanager` decorator.

```python
from contextlib import contextmanager

@contextmanager
def transaction(conn):
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
```

Used for files, locks, DB transactions, temporary directories, and FastAPI's lifespan.

</details>

<details>
<summary>`is` vs `==`, and `__eq__` vs `__hash__`.</summary>

`==` compares **values** (via `__eq__`); `is` compares **identity** (the same object). Always use `is` for `None`, `True`, `False`.

If you define `__eq__`, Python sets `__hash__` to `None` (making instances unhashable) unless you also define `__hash__` — because two equal objects must have equal hashes to work in sets and dict keys.

</details>

<details>
<summary>What are type hints good for if Python ignores them?</summary>

They're for the **editor**, **static checkers** (mypy/pyright) and **libraries that read them at runtime**. FastAPI and Pydantic are the prime example: a type hint drives request parsing, validation, serialization and the OpenAPI schema.

Types don't validate data at runtime by themselves — for untrusted input you need Pydantic or explicit checks.

</details>

---

## B. Async Python

<details>
<summary>How does asyncio work?</summary>

A single-threaded **event loop** runs coroutines. `async def` defines a coroutine; calling it returns a coroutine object that does nothing until awaited or scheduled as a task. At each `await` on I/O, the coroutine suspends and the loop runs another task; when the OS signals the I/O is ready (epoll/kqueue), the task resumes.

That's how one process serves thousands of concurrent connections — concurrency through cooperative suspension, not parallelism.

</details>

<details>
<summary>What's wrong with calling `requests.get()` inside an `async def` endpoint?</summary>

It's a **blocking** call on the event loop thread, so the loop can't run any other task until it returns. One slow request freezes every concurrent request in that worker.

Fixes: use an async client (`httpx.AsyncClient`), offload with `await asyncio.to_thread(...)`, or make the endpoint a plain `def` so FastAPI runs it in its thread pool.

</details>

<details>
<summary>In FastAPI, when do you use `async def` vs `def`?</summary>

`async def` when everything inside is async-aware (httpx, async SQLAlchemy, redis.asyncio). Plain `def` when you use blocking libraries — FastAPI automatically runs those in a thread pool (~40 threads), so they can't block the loop.

The dangerous combination is `async def` + blocking code. If unsure, plain `def` is the safe choice.

</details>

<details>
<summary>Threads vs processes vs asyncio?</summary>

| | Best for | Why |
| --- | --- | --- |
| `asyncio` | Thousands of concurrent I/O operations | One thread, no context-switch cost; needs async libraries |
| Threads | I/O with blocking libraries | GIL released during I/O; simple to retrofit |
| Processes | **CPU-bound** work | Real parallelism; each has its own GIL |

For long-running or CPU-heavy work in a web app, the real answer is usually a **task queue** (Celery), not any of the three in-process.

</details>

---

## C. FastAPI

<details>
<summary>How does FastAPI work internally?</summary>

It's a layer over **Starlette** (routing, middleware, requests/responses) and **Pydantic** (validation/serialization), run by an ASGI server like **Uvicorn**.

At import time, decorators register routes and FastAPI **inspects each endpoint's signature** to build a dependency tree and parameter plan. Per request: middleware → route match → resolve dependencies → parse and validate inputs with Pydantic → run the endpoint (on the loop if `async def`, in a thread pool if `def`) → validate/filter the result against the response model → serialize → response. The OpenAPI schema is generated from the same type information.

</details>

<details>
<summary>How does dependency injection work, and why is it useful?</summary>

You declare what an endpoint needs (`db: Annotated[Session, Depends(get_db)]`) and FastAPI creates and passes it. Dependencies can have their own parameters and sub-dependencies, forming a tree resolved per request; results are **cached within a request**, so a dependency used twice runs once.

`yield` dependencies give setup/teardown (DB sessions). The big practical win is `app.dependency_overrides` — swapping the database or current user in tests without touching endpoint code.

</details>

<details>
<summary>What does `response_model` actually do?</summary>

It validates and **filters** the returned data against a Pydantic model, so fields not in the model (like `hashed_password`) are stripped before serialization. It also documents the response in OpenAPI. Returning a `Response` object directly bypasses it.

</details>

<details>
<summary>How do you handle errors consistently?</summary>

Raise `HTTPException` for simple cases; for anything larger, define domain exceptions (`NotFoundError`, `ConflictError`) in the service layer and register `@app.exception_handler(...)` to map them to one JSON error shape. Add a handler for `RequestValidationError` to reshape 422s, and a catch-all that logs the exception and returns a generic 500 — never a stack trace.

</details>

<details>
<summary>What are the security concerns with FastAPI endpoints?</summary>

Authenticate and authorise **inside** the endpoint or its dependencies, never relying on the UI. Check ownership of every object (BOLA/IDOR is the top API vulnerability — return 404, not 403). Validate everything with Pydantic. Use short-lived JWTs with PKCE-based flows or server sessions; hash passwords with argon2/bcrypt. Restrict CORS origins, rate-limit auth endpoints, set security headers, keep secrets in a secret manager, and disable `/docs` for private APIs.

</details>

<details>
<summary>How do you run FastAPI in production?</summary>

Uvicorn with multiple workers (or Gunicorn + Uvicorn workers) behind a reverse proxy/load balancer with TLS, in containers. No `--reload`. Workers ≈ 2×CPU+1 on a VM, or one worker per container in Kubernetes. Add `--proxy-headers`, graceful shutdown, liveness/readiness endpoints, structured JSON logs, Sentry, metrics and tracing. Migrations run as a separate job before rollout. Details: [../02-FastAPI/production.md](../02-FastAPI/production.md).

</details>

---

## D. Databases and SQLAlchemy

<details>
<summary>What is the N+1 query problem and how do you fix it?</summary>

Loading a list and then lazily accessing a relationship per item fires one query per row: 1 + N. With 100 tasks you get 101 queries.

Fix by eager loading: `selectinload` (a second `WHERE id IN (...)` query — good for one-to-many) or `joinedload` (a JOIN — good for many-to-one). Set `lazy="raise"` in development so accidental lazy loads fail loudly. In async SQLAlchemy lazy loading raises anyway.

</details>

<details>
<summary>Explain ACID and isolation levels.</summary>

**Atomicity** (all or nothing), **Consistency** (constraints hold), **Isolation** (concurrent transactions don't corrupt each other), **Durability** (committed data survives crashes).

Isolation levels trade safety for concurrency: Read Committed (PostgreSQL's default — no dirty reads, but non-repeatable reads possible), Repeatable Read (one snapshot; conflicting writes fail), Serializable (as if run one at a time; may need retries). Anomalies to name: dirty read, non-repeatable read, phantom, lost update, write skew.

</details>

<details>
<summary>Two users update the same row. How do you prevent a lost update?</summary>

1. **Atomic update** — do the arithmetic in SQL: `UPDATE products SET stock = stock - 1 WHERE id = ? AND stock > 0`, then check the row count.
2. **Pessimistic lock** — `SELECT ... FOR UPDATE` inside a transaction; others wait.
3. **Optimistic lock** — a `version` column: `UPDATE ... WHERE id = ? AND version = ?`; 0 rows means someone else won → return 409.
4. **Constraints** — let a unique index make "check then insert" race-free.

Use optimistic locking when there's human think-time; pessimistic when conflicts are frequent and transactions are short.

</details>

<details>
<summary>How do you find and fix a slow query?</summary>

Find it with `pg_stat_statements` ordered by **total** time (a 5 ms query called a million times matters more than a 2 s nightly one) or the slow-query log. Reproduce with real parameters, run `EXPLAIN (ANALYZE, BUFFERS)`, and look for sequential scans with selective filters, estimated-vs-actual row mismatches (stale statistics), sorts spilling to disk, and nested loops over many rows.

Then: add the right (composite) index, rewrite the query, avoid functions on indexed columns, fix N+1, or change the data model. Verify the plan changed and monitor after deploying.

</details>

<details>
<summary>How do composite indexes work?</summary>

A B-tree on `(a, b, c)` is sorted by `a`, then `b`, then `c`, so it serves queries using a **leftmost prefix**: `a`, `a+b`, `a+b+c`, but not `b` alone. Put equality columns first, then range or sort columns — `(user_id, done, created_at DESC)` can satisfy filter + ordering with no separate sort step.

Indexes cost write performance and storage, so index what your queries actually use.

</details>

<details>
<summary>How do you do a zero-downtime schema change?</summary>

**Expand → migrate → contract**, so old and new code both work during the rollout:
1. Add the new nullable column (expand).
2. Deploy code that writes both old and new.
3. Backfill in batches.
4. Deploy code that reads the new column.
5. Drop the old column in a later release (contract).

Also: `CREATE INDEX CONCURRENTLY`, add constraints `NOT VALID` then `VALIDATE`, set a `lock_timeout` so DDL waiting on a lock fails fast instead of queuing all traffic behind it, and run migrations as a separate deploy step.

</details>

---

## E. Redis and Celery

<details>
<summary>What do you use Redis for?</summary>

Caching (cache-aside with TTLs), sessions, rate limiting, distributed locks, pub/sub for cross-instance broadcasts, leaderboards (sorted sets), idempotency keys, and as a broker for Celery.

Key operational point: a cache instance should evict (`allkeys-lru`), but a **queue instance must not** (`noeviction` + persistence), so they shouldn't share an instance.

</details>

<details>
<summary>Explain cache-aside and its pitfalls.</summary>

Read the cache; on a miss read the DB, store with a TTL, return. On writes, **delete** the key (simpler and safer than updating it).

Pitfalls: **stampede** (many requests rebuild the same expired hot key — fix with a lock/single-flight or stale-while-revalidate), **penetration** (repeated misses for non-existent keys — cache the negative result briefly), **stale data** (always set a TTL as a backstop and invalidate on every write path), and **leaking data between users** (include the user/tenant in the key).

</details>

<details>
<summary>How does Celery work, and what makes a task safe?</summary>

The API calls `task.delay(...)`, which serialises a message to a broker (Redis/RabbitMQ); separate worker processes consume and execute it, with retries on failure.

A safe task: takes **IDs, not objects** (arguments are JSON); opens its own DB session; is **idempotent** (it can run twice — late acks, crashes and retries all cause redelivery); has **time limits**; and sets timeouts on network calls. Enqueue **after** the transaction commits, or use the outbox pattern.

</details>

<details>
<summary>Why might a Celery task run twice?</summary>

With `acks_late=True`, a worker that crashes mid-task doesn't acknowledge, so the message is redelivered. With Redis, a task running longer than the **visibility timeout** is re-delivered to another worker *while still running*. Retries and duplicate beat schedulers also cause it.

That's why idempotency is non-negotiable: check a status flag, use upserts and unique constraints, or a Redis `SET NX` processed key.

</details>

---

## F. Scenario questions

<details>
<summary>"The API got slow after a release. How do you investigate?"</summary>

1. **Scope it:** which endpoints, when did it start, correlates with the deploy?
2. **Layer:** APM/traces to see whether time is in the app, the DB, or an external call.
3. **Database first** (it usually is): `pg_stat_statements` for new slow queries, lock waits, connection pool saturation, missing index on a new column.
4. **App:** blocking calls in async endpoints, N+1 introduced by a new serializer, a new synchronous third-party call without a timeout.
5. **Infra:** CPU/memory, worker count, cache hit ratio drop.
6. **Mitigate** (roll back, feature flag, add an index), then fix properly and add monitoring for the specific regression.

</details>

<details>
<summary>"Users report duplicate charges. What happened and how do you fix it?"</summary>

Almost certainly a retry without idempotency: the client (or a proxy) retried a POST that had already succeeded, or a queued task was redelivered.

Fix: an `Idempotency-Key` header stored with the result under a unique constraint, so the second request returns the first response instead of charging again; idempotent workers (check a `charged_at` flag inside the transaction); and never retrying non-idempotent POSTs blindly. Then reconcile and refund the duplicates.

</details>

<details>
<summary>"How would you add search to an existing Postgres app?"</summary>

Start **in Postgres**: `tsvector` + GIN index with `websearch_to_tsquery` and `ts_rank` handles a surprising amount, and `pg_trgm` adds typo tolerance and `ILIKE '%x%'` performance. No new infrastructure, no sync problem.

Move to OpenSearch/Elasticsearch/Meilisearch when you need facets, complex relevance tuning, synonyms, multi-language analysis or very large scale — and then accept the cost of keeping two stores in sync (CDC or an outbox-driven indexer).

</details>

<details>
<summary>"The database is the bottleneck. What do you do, in order?"</summary>

1. **Measure** — slow queries, locks, saturation.
2. **Fix queries and indexes** (usually the 10× win).
3. **Cache** hot reads in Redis; add HTTP caching for public data.
4. **Connection pooling** (PgBouncer) if connections, not CPU, are exhausted.
5. **Scale up** the instance (cheap and effective for a long time).
6. **Read replicas** for read-heavy traffic (accept replication lag).
7. **Partition** large tables by time.
8. **Shard** — last resort, big complexity.

Saying "shard it" first is a red flag; saying "measure first" is the answer.

</details>

<details>
<summary>"How do you design for 10× traffic?"</summary>

Make the app **stateless** so it scales horizontally; cache aggressively with a clear invalidation story; move slow work into queues; add read replicas and pooling; paginate everything; set timeouts, retries with backoff, and circuit breakers so one slow dependency doesn't cascade; autoscale on latency/queue depth, not just CPU; and load-test to find the real breaking point rather than guessing.

Then name what you'd monitor and what you'd sacrifice first (e.g. degrade recommendations before checkout).

</details>

---

## G. Rapid fire

<details>
<summary>Short answers</summary>

- **WSGI vs ASGI** — sync vs async server interface; ASGI supports WebSockets and streaming.
- **`@staticmethod` vs `@classmethod`** — no implicit arg vs receives the class (alternative constructors).
- **`__init__` vs `__new__`** — initialise vs allocate (rarely overridden).
- **Shallow vs deep copy** — `copy()` shares nested objects; `deepcopy()` doesn't.
- **`list.sort()` vs `sorted()`** — in place returning `None` vs a new list.
- **Pydantic vs dataclass** — runtime validation/coercion vs plain data container.
- **`Optional[X]`** — `X | None`, not "optional parameter".
- **`uv`/`poetry` lock file** — exact versions of the whole dependency tree; commit it.
- **`SELECT *` in production code** — avoid; fetch what you need.
- **`TIMESTAMPTZ` over `TIMESTAMP`** — store real moments in UTC.
- **`NUMERIC` over `FLOAT` for money** — exact decimal arithmetic.
- **`COUNT(*)` on a huge table** — slow; use estimates or counters.
- **PgBouncer transaction mode** — share server connections; no session state, careful with prepared statements.
- **VACUUM** — reclaims dead tuples from MVCC; autovacuum must keep up or tables bloat.
- **Alembic `autogenerate`** — a draft; it turns renames into drop+add (data loss) unless you fix it.
- **Docker: why one process per container?** — the orchestrator handles restarts and scaling; logs and signals stay simple.

</details>

---

## H. Questions to ask them

- What does the service architecture look like — monolith, modular, or services?
- How do you run migrations, and have you had a locking incident?
- What's your p95 latency and error budget, and who watches them?
- How are background jobs handled, and are they idempotent?
- What does on-call look like, and what was the last incident?
- How much of the test suite runs against a real database?
