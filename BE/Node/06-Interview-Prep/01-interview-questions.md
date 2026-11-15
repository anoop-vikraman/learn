# Node.js + Express interview questions

---

## A. Node internals

<details>
<summary>How does Node.js work?</summary>

Node runs JavaScript in **V8** on a single main thread, with **libuv** providing the event loop and asynchronous I/O. Slow operations are handed to the OS (epoll/kqueue/IOCP for sockets) or to libuv's **thread pool** (file system, DNS, some crypto, zlib — 4 threads by default). When they complete, their callbacks are queued and the event loop runs them on the main thread.

That's why one process handles thousands of concurrent connections cheaply — and why CPU-heavy JavaScript blocks everything.

</details>

<details>
<summary>Explain the event loop phases.</summary>

Per iteration: **timers** (`setTimeout`/`setInterval`) → pending callbacks → idle/prepare → **poll** (wait for and run I/O callbacks) → **check** (`setImmediate`) → close callbacks.

Between **every** callback, Node drains the `process.nextTick` queue first, then the **promise microtask** queue.

```js
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('nextTick'));
console.log('sync');
// sync → nextTick → promise → timeout/immediate
```

Inside an I/O callback, `setImmediate` always fires before `setTimeout(…, 0)`. A recursive `nextTick` can starve the loop entirely.

</details>

<details>
<summary>What does "blocking the event loop" mean, and how do you avoid it?</summary>

Any long synchronous JavaScript — a busy loop, a huge `JSON.parse`, `fs.readFileSync`, `bcrypt.hashSync`, a catastrophic regex — occupies the single thread, so **no other request is served** until it finishes.

Avoid it with async APIs everywhere, chunking long work with `setImmediate`, **worker threads** for CPU-heavy tasks, a job queue (BullMQ) for long work, and streaming instead of loading whole files. Monitor with `perf_hooks.monitorEventLoopDelay` and alert on lag.

</details>

<details>
<summary>How do you use more than one CPU core?</summary>

One Node process uses one main thread, so:
- **Worker threads** for CPU-bound work inside a process (separate V8 isolates, message passing).
- **Cluster / PM2** to fork several server processes sharing a port on one machine.
- **Containers/replicas** behind a load balancer — the usual production answer, one Node process per container, scaled by the orchestrator.

Don't stack PM2 cluster mode inside an orchestrator that already scales — it hides crashes and confuses memory limits.

</details>

<details>
<summary>CommonJS vs ES modules?</summary>

CJS (`require`/`module.exports`) loads synchronously at runtime; ESM (`import`/`export`) is the standard, statically analysable, supports top-level `await` and tree shaking. ESM is enabled with `"type": "module"` or `.mjs`, needs file extensions in relative imports, and uses `import.meta.dirname` instead of `__dirname`. Modern Node can `require()` ESM in most cases, so mixed codebases mostly work.

</details>

<details>
<summary>What happens on an unhandled promise rejection?</summary>

Since Node 15 it **terminates the process** by default — which is correct, because the app may be in an unknown state. Handle rejections where they occur, and add last-resort `unhandledRejection` / `uncaughtException` handlers that **log and exit**, letting your supervisor restart cleanly. Never swallow them and continue.

</details>

<details>
<summary>What are streams and why use them?</summary>

Streams process data in chunks instead of loading it all into memory: Readable, Writable, Duplex and Transform. They're how Node handles large files, uploads and HTTP bodies efficiently.

Always use `pipeline()` (from `stream/promises`) rather than `.pipe()` — it propagates errors and closes everything. **Backpressure** is the key concept: when the writable side is slower, the readable side pauses automatically, so memory stays bounded.

</details>

---

## B. Express

<details>
<summary>How does Express work internally?</summary>

An Express app is a `(req, res)` function handed to Node's `http` server. Internally it's an ordered **array of layers** — each with a path matcher and a handler (middleware, route or sub-router). For each request it walks the array in registration order; each layer either sends a response or calls `next()`.

Errors (thrown, passed to `next(err)`, or — in Express 5 — a rejected promise) skip ahead to handlers with **four** parameters. `req`/`res` are Node's objects with Express's prototypes layered on top, which is where `res.json()`, `req.params` and friends come from.

</details>

<details>
<summary>What is middleware? Give the categories.</summary>

Functions `(req, res, next)` that run in order for matching requests. Categories: application-level (`app.use`), router-level, route-level, **error-handling** (four args), built-in (`express.json`, `express.static`) and third-party (`cors`, `helmet`, `pino-http`, `express-rate-limit`).

Rules: respond **or** call `next()`, never both and never neither (the request hangs). Order matters — middleware registered after your routes never runs for them.

</details>

<details>
<summary>How do you handle errors in Express?</summary>

Throw typed domain errors (`NotFoundError`, `ConflictError`) from services, and register **one** error-handling middleware last that maps them to a consistent JSON shape, logs unexpected ones and returns a generic 500. Add a 404 handler before it.

In **Express 5**, async handlers that reject are forwarded to the error handler automatically; in Express 4 you needed `try/catch` + `next(err)` or `express-async-errors`. Keep the unused `next` parameter — Express identifies error handlers by arity.

</details>

<details>
<summary>How do you secure an Express API?</summary>

Helmet for security headers, strict CORS origins (never `*` with credentials), `express.json({ limit })` for body size, Zod validation on every input (stripping unknown fields to prevent mass assignment), authentication middleware plus **ownership checks in the query**, rate limiting with a shared Redis store, `app.set('trust proxy', n)` so client IPs are right, parameterised queries (Prisma), secrets in env/secret manager, generic error messages, and dependency auditing in CI.

</details>

<details>
<summary>Express vs Fastify vs NestJS?</summary>

**Express** — minimal, middleware-based, the largest ecosystem, lowest learning curve. **Fastify** — plugin/hook architecture, schema-based validation and serialization, notably faster routing and JSON output. **NestJS** — opinionated, Angular-style modules with decorators and DI, good for large teams who want enforced structure (and it runs on Express or Fastify underneath).

The concepts transfer; I'd choose Express for simplicity, Fastify for throughput and built-in schemas, NestJS for a large team wanting conventions.

</details>

---

## C. Data layer

<details>
<summary>What does Prisma give you, and what are its trade-offs?</summary>

A typed schema generates a client, so queries and results are type-checked and autocomplete works; Prisma Migrate turns schema changes into reviewable SQL migrations.

Trade-offs: generated SQL isn't always optimal for complex queries (drop to `$queryRaw` with tagged templates), the client adds startup/bundle weight, raw SQL power is reduced, and `migrate dev` generates **drop+add for renames** — you must edit the SQL (`--create-only`) or lose data. Alternatives: Drizzle (closer to SQL), Kysely (query builder), raw `pg`.

</details>

<details>
<summary>How do you manage database connections in a Node app?</summary>

**One client instance per process** (Prisma or a `pg` Pool) reused across requests — creating one per request exhausts the database. Total connections = instances × pool size, which must stay under PostgreSQL's `max_connections`; use **PgBouncer** (or a managed pooler) when you have many instances or serverless functions, and use a direct connection URL for migrations. Disconnect on shutdown.

</details>

<details>
<summary>How do transactions work in Prisma?</summary>

A batch array (`prisma.$transaction([...])`) for independent operations, or an interactive callback (`prisma.$transaction(async (tx) => { … })`) when you need logic between queries — throwing inside rolls everything back. Use `tx`, not `prisma`, inside the callback, keep transactions short (no HTTP calls), and retry on serialization conflicts (`P2034`) if you use Serializable isolation.

</details>

---

## D. Redis and jobs

<details>
<summary>How does BullMQ work?</summary>

Queues are Redis data structures; producers `queue.add(name, data, opts)` and separate **worker processes** consume them. Jobs move through waiting → delayed → active → completed/failed, with workers holding a renewed **lock** on active jobs; if a worker dies the lock expires and the job is marked **stalled** and retried.

Key configuration: `attempts` + exponential `backoff`, `removeOnComplete/removeOnFail` to bound Redis memory, `concurrency` per worker, rate limiters, and job schedulers for cron-like repeats. Delivery is at-least-once, so **jobs must be idempotent**.

</details>

<details>
<summary>What Redis settings matter for a queue?</summary>

`maxmemory-policy noeviction` (a cache policy would silently evict queued jobs) and persistence (AOF) so a restart doesn't lose them. Workers need `maxRetriesPerRequest: null`. Keep the queue instance **separate from the cache instance**, since they want opposite eviction behaviour.

</details>

<details>
<summary>When would you use BullMQ instead of just doing the work in the request?</summary>

When the work is slow (reports, image/video processing), unreliable (third-party APIs needing retries), scheduled (nightly cleanup), CPU-heavy (would block the event loop), or must survive a crash. The API then returns **202 with a job ID**, stores status in the database, and the client polls or gets pushed updates.

</details>

---

## E. Testing and operations

<details>
<summary>How do you test an Express API?</summary>

Vitest/Jest + **Supertest** calling the exported `app` (no listening port), against a **real PostgreSQL** test database — each test wrapped in a transaction that's rolled back, or tables truncated between tests. Factories create data; `MSW`/`nock` mock outbound HTTP; auth is handled by overriding the auth middleware for most tests plus one real login flow end to end.

Cover: happy paths, validation (422), 401/403/404, ownership (user B can't read user A's data), and business rules as unit tests.

</details>

<details>
<summary>How do you deploy a Node app and shut it down cleanly?</summary>

A multi-stage Docker image (`npm ci --omit=dev`, compiled `dist/`, non-root `USER node`), started with **exec-form `CMD ["node", "dist/server.js"]`** so Node is PID 1 and receives SIGTERM.

On SIGTERM: stop accepting new connections (`server.close()`), let in-flight requests finish, close DB/Redis/queue connections, then exit — with a forced-exit timer as a backstop and a grace period longer than your longest request. Fail readiness checks during shutdown so the load balancer drains you.

Also: align `server.keepAliveTimeout` above the load balancer's idle timeout, or you'll see intermittent 502s.

</details>

<details>
<summary>How do you debug a memory leak in Node?</summary>

Confirm it with metrics (RSS/heap climbing over hours, restarts from OOM). Take **heap snapshots** at intervals (`--heapsnapshot-signal=SIGUSR2`, or Chrome DevTools) and compare retained objects between them. Usual causes: event listeners never removed, growing Maps/caches without bounds, timers, closures capturing large objects, and global arrays.

Mitigations: bounded caches (`lru-cache`), always remove listeners, and set `--max-old-space-size` below the container limit so V8 GCs rather than getting OOM-killed.

</details>

---

## F. Scenario questions

<details>
<summary>"Your API's p95 latency doubled. Walk me through debugging."</summary>

Scope it (which routes, when, after what change), then check in order: **event loop lag** (something synchronous got added), **database** (new slow query, missing index, pool saturation, lock waits), **external calls** (a dependency got slower and has no timeout), **memory/GC pressure**, and **traffic shape** (more users, bigger payloads, a hot tenant).

Traces make this fast — APM showing the breakdown per span. Mitigate first (roll back, feature flag, add an index), then fix and add an alert for that specific symptom.

</details>

<details>
<summary>"One endpoint occasionally takes 30 seconds and blocks everything. Why?"</summary>

Something synchronous on the event loop — most likely a large `JSON.parse`/`stringify`, a synchronous crypto or file call, or a catastrophic regular expression on user input (ReDoS). The tell is that *all* endpoints slow down simultaneously, not just that one.

Confirm with event-loop-lag metrics and a CPU profile (`--cpu-prof`, `clinic flame`), then move the work to a worker thread or a queue, bound the input size, and fix the regex.

</details>

<details>
<summary>"How do you handle a third-party API that's slow and flaky?"</summary>

Timeouts on every call (`AbortSignal.timeout`), retries with **exponential backoff and jitter** for transient errors only (never blind retries of non-idempotent POSTs — use an idempotency key), a **circuit breaker** so a dead dependency fails fast instead of piling up requests, a **bulkhead** (separate pool/queue) so it can't exhaust all workers, caching of responses where allowed, and **graceful degradation** — serve stale or partial data and tell the user.

If it's not needed for the response, move the call into a background job entirely.

</details>

<details>
<summary>"Users report they were briefly logged in as someone else." What could cause that?</summary>

Shared mutable state across requests — the classic Node bug. Examples: storing the current user on a module-level variable or on the `app`/`global` object instead of per request, a misconfigured cache keyed without the user ID, a proxy caching an authenticated response (`Cache-Control: private, no-store` missing), or reusing a database/Redis connection with session state in PgBouncer transaction mode.

Fix: keep request state in `req`/`AsyncLocalStorage`, never module scope; include the user/tenant in every cache key; set correct cache headers on authenticated responses.

</details>

---

## G. Rapid fire

<details>
<summary>Short answers</summary>

- **`npm ci` vs `npm install`** — exact, clean install from the lock file (use in CI/Docker) vs resolve and possibly update.
- **`dependencies` vs `devDependencies`** — runtime vs build/test only (`--omit=dev` in production).
- **`process.nextTick` vs `setImmediate`** — before promises, after the current operation vs the check phase after poll.
- **`Buffer`** — raw binary data.
- **`AsyncLocalStorage`** — request-scoped context (request IDs in logs) without threading it through every function.
- **`cluster`** — fork processes sharing a port.
- **`UV_THREADPOOL_SIZE`** — libuv pool size (default 4); affects fs/DNS/crypto concurrency.
- **pino over winston** — much faster, JSON-first; `redact` for secrets.
- **Why not `console.log` in production** — unstructured, synchronous to stdout in some cases, no levels.
- **Helmet** — sets security headers.
- **`trust proxy`** — makes `req.ip`/`req.protocol` correct behind a load balancer; don't set it blindly to `true`.
- **Zod** — runtime validation + inferred TypeScript types from one schema.
- **`tsx` vs `tsc`** — run TS fast without type-checking vs compile and type-check (run both; `tsc --noEmit` in CI).
- **ESM `.js` extensions in TS imports** — required with `NodeNext` because that's the file at runtime.

</details>

---

## H. Questions to ask them

- Express, Fastify or Nest — and why?
- How do you handle background jobs, and are they idempotent?
- What's your event-loop-lag and p95 latency, and are they alerted on?
- How do you run migrations, and have you had a locking incident?
- TypeScript strict? Is `tsc --noEmit` in CI?
- How much of the test suite runs against a real database?
