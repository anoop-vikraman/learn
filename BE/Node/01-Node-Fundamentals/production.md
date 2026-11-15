# Node.js in production

## 1. Checklist

> **In short:** Everything to have in place before a Node service goes live.

- [ ] Active LTS Node version, pinned in `.nvmrc`, `engines`, Docker image and CI
- [ ] `npm ci` from a committed lock file; dev dependencies excluded from the runtime image
- [ ] `NODE_ENV=production`
- [ ] Config validated at startup; secrets from a secret manager
- [ ] Structured JSON logs to stdout; error tracking; metrics
- [ ] Graceful shutdown on SIGTERM
- [ ] Global handlers for unhandled rejections/exceptions that log and exit
- [ ] Supervised process (container orchestrator, systemd or PM2) with automatic restarts
- [ ] Memory limits and `--max-old-space-size` aligned with the container limit
- [ ] No sync I/O or CPU-heavy work on the request path; event loop lag monitored
- [ ] Dependency auditing and regular updates

## 2. Node versions

> **In short:** Run an LTS release, upgrade before it reaches end of life, and test upgrades in CI first.

- Even-numbered releases become LTS (~30 months of support). Check the Node release schedule and plan upgrades yearly.
- Pin the exact major (and ideally minor) in the Docker base image: `node:24-slim` or a digest.

## 3. Dependencies

> **In short:** Lock, audit and update dependencies regularly; the npm ecosystem is a frequent attack target.

- `npm ci --omit=dev` for production installs.
- `npm audit` / Snyk / Dependabot / Renovate; fix or replace vulnerable packages.
- Prefer popular, maintained packages; review new dependencies (size, maintainers, install scripts).
- Consider `npm ci --ignore-scripts` where possible, since install scripts can run arbitrary code.
- Commit the lock file; never deploy with `npm install` (it can change versions).

## 4. Process management

> **In short:** Something must restart crashed processes and run several of them; in containers that's the orchestrator, otherwise systemd or PM2.

| Environment | Tool |
| --- | --- |
| Kubernetes / ECS / Cloud Run | The platform restarts containers and runs replicas; **one Node process per container** |
| VM | systemd service, or **PM2** (`pm2 start dist/server.js -i max` for cluster mode) |

Don't run PM2 cluster mode inside containers that the orchestrator already scales; it hides crashes and complicates memory limits.

## 5. Graceful shutdown

> **In short:** On SIGTERM, stop accepting new connections, finish in-flight requests, close DB/Redis connections, then exit, within the platform's grace period.

```ts
const server = app.listen(config.PORT);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  const force = setTimeout(() => process.exit(1), 25_000).unref();   // safety net

  server.close(async () => {                 // stops new connections, waits for open ones
    await Promise.allSettled([prisma.$disconnect(), redis.quit(), queue.close()]);
    clearTimeout(force);
    process.exit(0);
  });
  server.closeIdleConnections?.();           // drop idle keep-alive connections
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

- Make readiness checks fail during shutdown so the load balancer stops sending traffic.
- In Docker, use exec-form `CMD ["node", "dist/server.js"]` so Node receives SIGTERM directly (not via npm or a shell).

## 6. Memory

> **In short:** Set V8's heap limit below the container memory limit, watch for leaks, and restart rather than run out of memory.

- In containers, set `NODE_OPTIONS=--max-old-space-size=<~75% of the container limit in MB>`; recent Node versions also detect container limits better.
- Common leaks: growing in-memory caches/maps without limits, listeners never removed, global arrays, closures holding large objects, unclosed timers.
- Investigate with heap snapshots (`--heapsnapshot-signal=SIGUSR2`, Chrome DevTools), `clinic heapprofiler`, or APM memory charts.
- Use bounded caches (`lru-cache`) and Redis for shared caching.

## 7. Logging and observability

> **In short:** Fast JSON logging with request context, error tracking, metrics and traces.

- **pino** for fast structured logs (`pino-http` for request logs); add request IDs via `AsyncLocalStorage`.
- Error tracking: Sentry (`@sentry/node`).
- Metrics: `prom-client` (default metrics include event loop lag, heap, GC) → Prometheus/Grafana, or an APM (Datadog, New Relic, Elastic).
- Traces: OpenTelemetry auto-instrumentation for http, Express, Prisma/pg, ioredis.
- Alert on 5xx rate, p95 latency, event loop lag, memory growth and restarts.

## 8. Performance

> **In short:** Keep the event loop free, scale out with more processes, and profile before optimizing.

- No `*Sync` calls, big synchronous loops or huge JSON operations on the request path.
- Reuse connections (DB pools, HTTP keep-alive agents; `fetch` reuses connections by default via undici).
- Cache hot data; paginate; stream large responses.
- Use all cores: more containers/replicas (or cluster/PM2 on a VM).
- Profile: `node --cpu-prof`, `clinic doctor/flame`, `0x`; load test with `autocannon` or k6.
- Offload CPU-heavy work to worker threads or BullMQ workers.

## 9. Security

> **In short:** Validate input, keep dependencies patched, avoid dangerous APIs, and run with least privilege.

- Validate all input (Zod); limit request body size.
- Never use `eval`, `new Function`, or `child_process.exec` with user input.
- Guard against prototype pollution (don't merge untrusted objects deeply; validate shapes).
- Avoid ReDoS: be careful with complex regexes on user input; set input length limits.
- Use `crypto.randomUUID`/`randomBytes` for tokens and constant-time comparisons for secrets.
- Run as a non-root user; read-only filesystem in containers.
- Consider Node's permission model (`--permission`) to restrict file system and child process access.
- Set timeouts on outbound calls (`AbortSignal.timeout`).

## 10. Maintenance routine

> **In short:** What to do weekly, monthly, quarterly and yearly.

| How often | Task |
| --- | --- |
| Weekly | Review dependency update PRs and audit results; check error tracking |
| Monthly | Review memory and event-loop-lag trends; update minor/patch Node version |
| Quarterly | Load test; review logs and alerts for noise; remove unused dependencies |
| Yearly | Upgrade to the next LTS major |
