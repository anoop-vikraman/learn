# Redis and BullMQ in production

Redis server operations (persistence, eviction, HA, security, monitoring) are covered in [../../FastAPI/05-Redis/production.md](../../FastAPI/05-Redis/production.md). This page adds Node- and BullMQ-specific points.

## 1. Checklist

> **In short:** What to configure before relying on Redis and BullMQ in production.

- [ ] Separate Redis (or at least separate logical setup) for **cache** (evicts) and **queues** (must not evict)
- [ ] Queue Redis: `maxmemory-policy noeviction` + AOF persistence + replica/failover
- [ ] Workers run as separate processes/containers from the API, scaled independently
- [ ] Jobs idempotent; attempts + backoff set; `UnrecoverableError` for permanent failures
- [ ] `removeOnComplete` / `removeOnFail` set so Redis memory stays bounded
- [ ] Graceful shutdown (`worker.close()`) with a long enough grace period
- [ ] Monitoring: queue depth, failed jobs, processing time, stalled jobs, Redis memory
- [ ] Bull Board (or similar) protected behind admin auth
- [ ] Client timeouts and retries configured; the API degrades gracefully if the cache is down

## 2. Redis configuration for BullMQ

> **In short:** BullMQ stores jobs in Redis, so evicting keys means losing jobs; use `noeviction` and persistence.

- `maxmemory-policy noeviction`: BullMQ warns if it isn't set.
- AOF persistence (`appendonly yes`, `appendfsync everysec`) so a Redis restart doesn't drop queued jobs.
- Managed options: ElastiCache/MemoryDB, Memorystore, Upstash (check BullMQ compatibility and command limits), Redis Cloud.
- Redis Cluster: put all keys of a queue in one slot with a prefix hash tag (`prefix: '{bull}'`).

## 3. Connections

> **In short:** Workers need `maxRetriesPerRequest: null`; reuse connections, and plan connection counts per process.

- Each `Queue`, `Worker` and `QueueEvents` uses Redis connections (workers use a blocking connection too). Count them per process × replicas against your Redis connection limit.
- Use TLS (`rediss://`) and ACL credentials.
- Handle `error` events on every connection to avoid unhandled exceptions.

## 4. Deploying and scaling workers

> **In short:** Run workers from the same image as the API with a different command; scale them on queue depth, per queue.

```yaml
# docker compose (sketch)
worker-emails:
  image: registry.example.com/task-api:${TAG}
  command: ["node", "dist/jobs/worker.js", "--queues=emails"]
  stop_grace_period: 120s
worker-reports:
  image: registry.example.com/task-api:${TAG}
  command: ["node", "dist/jobs/worker.js", "--queues=reports"]
  stop_grace_period: 600s
```

- Tune `concurrency`: high for I/O-bound jobs (emails, API calls), low (or sandboxed processors) for CPU-bound jobs.
- Autoscale workers on queue length (KEDA's Redis scaler in Kubernetes).
- Protect downstream systems: the `limiter` option, DB pool sizes per worker, partner API rate limits.

### Graceful shutdown

> **In short:** `worker.close()` stops taking new jobs and waits for active ones; give the platform enough grace time.

If a worker is killed mid-job, the job becomes **stalled** and is retried by another worker after the lock expires, which is another reason jobs must be idempotent.

### Deploying job changes

> **In short:** Old and new code may process the same jobs during a rollout, so keep job data backward compatible.

- Add new optional fields; don't rename or remove fields in one release.
- Deploy workers that understand a new job name **before** the API starts adding it.

## 5. Monitoring

> **In short:** Alert on growing queues, failure spikes, stalled jobs and Redis memory.

| Metric | Source | Alert when |
| --- | --- | --- |
| Waiting/delayed counts, oldest waiting job age | `queue.getJobCounts()`, exporters, Bull Board | Backlog grows / jobs wait too long |
| Failed jobs rate | `failed` events, metrics | Spike |
| Processing duration | Worker metrics (time in processor) | p95 regression |
| Stalled jobs | `stalled` events | Any recurring stalls (worker crashes, blocked event loop) |
| Redis memory, evictions | Redis `INFO` | Approaching `maxmemory`; any eviction |

Export metrics with `prom-client` (job counts per state, durations) or use an APM. Send job errors to Sentry with the job name, ID and attempt (scrub sensitive data).

## 6. Failure handling

> **In short:** Record failures in your own data, make retries safe, and have a way to replay failed jobs.

- Persist business status (e.g. `report.status = 'failed'`, `errorMessage`) so users and support can see it.
- Provide an admin action (or Bull Board) to retry failed jobs after a fix.
- Avoid retry storms after outages: exponential backoff with jitter, and limiters.
- Poison jobs that always crash a worker: cap attempts and alert.

## 7. Caching in production

> **In short:** The cache is an optimization: the app must keep working (slower) if Redis is unavailable.

- Wrap cache reads/writes in try/catch and fall back to the database.
- Short client timeouts (`commandTimeout`) so a slow Redis doesn't slow every request.
- Version cache keys when data shapes change between releases.
- Monitor hit rate; remove caches that don't help.

## 8. Routine

> **In short:** Regular tasks for queues and Redis.

| How often | Task |
| --- | --- |
| Continuously | Alerts on backlog, failures, stalls, Redis memory |
| Weekly | Review failed jobs; slowest job types |
| Monthly | Tune concurrency and worker counts; check job retention settings; update BullMQ/ioredis |
| Quarterly | Test Redis failover and worker restarts; review job idempotency for new job types |
