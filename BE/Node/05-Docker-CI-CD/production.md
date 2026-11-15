# Docker and CI/CD for Node in production

The general guides apply in full: [Docker in production](../../FastAPI/07-Docker/production.md) and [CI/CD in production](../../FastAPI/08-CI-CD/production.md). These are the Node-specific additions.

## 1. Image checklist

> **In short:** A production Node image is small, non-root, built from the lock file, and starts Node directly.

- [ ] Multi-stage build; runtime has only `dist/`, production `node_modules`, generated Prisma client
- [ ] `npm ci --omit=dev`; lock file committed
- [ ] Pinned base image (`node:24-slim` or digest); rebuilt regularly for security patches
- [ ] `USER node`; read-only root filesystem with a writable `/tmp` if needed
- [ ] `CMD ["node", "dist/server.js"]` (exec form); SIGTERM handled in code
- [ ] `NODE_ENV=production`; `NODE_OPTIONS=--max-old-space-size=…` matched to the memory limit
- [ ] No secrets, `.env` files or source maps with secrets in the image
- [ ] Image scanned (Trivy/Scout) in CI; `npm audit` clean of high/critical issues

## 2. Runtime settings

> **In short:** Set memory, CPU, health checks, grace periods and one Node process per container.

| Setting | Recommendation |
| --- | --- |
| Processes per container | One (let the orchestrator scale replicas) |
| Memory limit | Based on measured usage + headroom; heap limit ~75% of it |
| CPU | Requests/limits set; Node mostly uses one core per process |
| Liveness probe | `/health/live` (no dependency checks) |
| Readiness probe | `/health/ready` (DB + Redis), failing during shutdown |
| Grace period | API: > longest request (e.g. 30 s); workers: > longest job |
| Logs | JSON to stdout via pino |

## 3. Release process

> **In short:** Build once, migrate, roll out gradually, verify, and keep rollback one step away.

1. CI builds and scans `api:sha-xxxx` and `api-migrate:sha-xxxx`.
2. Staging: run migrations → deploy API and workers → smoke tests → automated checks.
3. Production approval (or automatic with canary analysis).
4. Production: run migrations (backward compatible) → rolling/canary deploy → watch error rate, latency, event loop lag, queue backlog.
5. Rollback = redeploy the previous image tags (the schema stays compatible thanks to expand/contract).

## 4. Node-specific gotchas in production

> **In short:** Signals, memory, keep-alive timeouts and missing native dependencies cause most incidents.

- `npm start` as the container command → signals not forwarded → abrupt kills. Use `node` directly.
- Heap limit above the container limit → the kernel OOM-kills the process without a JavaScript error.
- Keep-alive timeout shorter than the load balancer's → intermittent 502s (see [../02-Express/production.md](../02-Express/production.md#3-server-timeouts)).
- Native modules or Prisma engines built for the wrong platform/libc → crash at startup; build inside the target image.
- Source maps: enable (`--enable-source-maps`) for readable stack traces, and upload them to Sentry rather than exposing them publicly.

## 5. Routine

> **In short:** Keep images, dependencies and pipelines fresh.

| How often | Task |
| --- | --- |
| Every build | Scan image; audit dependencies; tag with the commit SHA |
| Weekly | Merge dependency PRs; automated base-image rebuild |
| Monthly | Review image size and resource limits vs real usage; clean up old images |
| Quarterly | Rollback drill; update CI action versions; rotate CI/registry credentials |
| Yearly | Move to the next Node LTS (base image + `.nvmrc` + engines) |
