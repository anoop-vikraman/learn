# FastAPI in production

## 1. Production checklist (summary)

> **In short:** Everything to tick off before an API goes live.

- [ ] Run with a production server and several workers; no `--reload`
- [ ] Behind a reverse proxy / load balancer with HTTPS
- [ ] Settings from environment variables, validated at startup; secrets in a secret manager
- [ ] Database migrations run as a separate deploy step
- [ ] Connection pools sized for workers × instances (and within the DB's limits)
- [ ] Health (liveness) and readiness endpoints
- [ ] Structured JSON logs with request IDs; error tracking (Sentry); metrics and alerts
- [ ] CORS restricted to real origins; docs disabled or protected if the API is private
- [ ] Rate limiting on auth and expensive endpoints
- [ ] Timeouts on every outbound call
- [ ] Graceful shutdown
- [ ] Load-tested before launch; autoscaling rules defined
- [ ] Backups and a tested rollback plan

---

## 2. Running the server

> **In short:** Run several Uvicorn/Gunicorn workers with proxy headers, timeouts and no reload.

```bash
# Uvicorn with multiple worker processes
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 --proxy-headers --forwarded-allow-ips="*"

# FastAPI CLI (wraps uvicorn)
fastapi run app/main.py --workers 4

# Gunicorn as process manager with Uvicorn workers (classic setup)
gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8000 \
  --timeout 60 --graceful-timeout 30 --max-requests 1000 --max-requests-jitter 100
```

| Setting | Guidance |
| --- | --- |
| Workers | Start with **(2 × CPU cores) + 1** on a VM. In **Kubernetes/containers**, often **1 worker per container** and scale the number of containers (pods) instead |
| `--proxy-headers` | Trust `X-Forwarded-*` from your proxy so client IPs and `https` URLs are correct. Restrict `--forwarded-allow-ips` to the proxy's IPs when possible |
| `--max-requests` | Restart workers periodically to contain memory leaks |
| Timeouts | Keep request timeouts reasonable; long work goes to Celery |
| `--reload` | ❌ Never in production |

Each worker is a separate process with its **own memory**: in-memory caches, rate limits or WebSocket lists aren't shared. Use Redis for shared state.

## 3. Architecture

> **In short:** Stateless API containers behind a load balancer, with managed Postgres, Redis, workers and object storage.

```
Internet → CDN / WAF → Load balancer (TLS) → Reverse proxy (optional: Nginx/Traefik)
        → N × FastAPI containers (stateless) → PostgreSQL (primary + replica)
                                            → Redis (cache, rate limits, Celery broker)
        → Celery workers (separate containers) ← Redis/RabbitMQ
        → Object storage (S3) for files
```

- **Stateless app servers**: no local files or in-memory sessions, so any instance can serve any request and you can scale horizontally.
- Serve the React build from a CDN/static host, not from FastAPI.
- Deployment targets: containers on Kubernetes (EKS/GKE/AKS), ECS/Fargate, Cloud Run, App Runner, Fly.io, Render, Railway, or VMs with Docker + systemd.

## 4. Configuration and secrets

> **In short:** Validated env-var config, secrets from a manager, and production-only toggles.

- All config via env vars, validated by `pydantic-settings` (app refuses to start if wrong).
- Secrets from AWS Secrets Manager / GCP Secret Manager / Vault / Kubernetes Secrets, injected at runtime, never baked into images or committed.
- `ENVIRONMENT=production` toggles: `debug=False`, docs off/protected, JSON logs, strict CORS.
- Rotate secrets (JWT signing keys, DB passwords) periodically and immediately on leaks; support key rotation (e.g. accept old + new JWT keys during a transition via `kid`).

## 5. Database in production

> **In short:** Migrations as a separate step, sized connection pools, timeouts and query monitoring.

- Run **migrations as a separate step** before/while deploying (a CI job, Kubernetes Job or init container), not inside app startup with many replicas racing.
- **Pool sizing:** total connections = instances × workers × (pool_size + max_overflow). Keep it below PostgreSQL's `max_connections`; use **PgBouncer** when you have many instances.
- `pool_pre_ping=True`, `pool_recycle` below any idle timeout set by the DB/proxy.
- Statement timeouts (`options=-c statement_timeout=5000`) so runaway queries don't pile up.
- Watch slow queries (`pg_stat_statements`), add indexes, fix N+1 queries.
- Read replicas for heavy read traffic (route reports/analytics there).
- Details: [../04-PostgreSQL/production.md](../04-PostgreSQL/production.md).

## 6. Health checks

> **In short:** Liveness (process alive) and readiness (can serve traffic) endpoints for the orchestrator.

```python
@app.get("/health/live", include_in_schema=False)
def live():
    return {"status": "ok"}                # process is up (no dependencies checked)

@app.get("/health/ready", include_in_schema=False)
def ready(db: DbSession):
    db.execute(text("SELECT 1"))           # can we serve traffic? (DB reachable, etc.)
    return {"status": "ready"}
```

- **Liveness**: is the process alive? If it fails, restart the container. Keep it cheap and independent of the DB (a DB outage shouldn't restart every app pod).
- **Readiness**: can it handle traffic now? If it fails, the load balancer stops sending requests.

## 7. Observability

> **In short:** Logs, error tracking, metrics and tracing, with alerts on user-facing symptoms.

| Pillar | Tools | What |
| --- | --- | --- |
| Logs | JSON to stdout → Loki/ELK/CloudWatch/Datadog | Request logs with request_id, user_id, path, status, duration. No secrets/PII |
| Errors | **Sentry** (`sentry-sdk[fastapi]`) | Exceptions with stack trace, request and user context, release version |
| Metrics | Prometheus (`prometheus-fastapi-instrumentator`) + Grafana, or APM | Request rate, error rate, latency p50/p95/p99, DB pool usage, worker saturation |
| Traces | **OpenTelemetry** (`opentelemetry-instrumentation-fastapi`, SQLAlchemy, httpx) → Jaeger/Tempo/Datadog | Where time goes in a request across services and queries |

```python
import sentry_sdk
sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.environment,
                traces_sample_rate=0.1, release=settings.version)
```

**Alerts** on what users feel: 5xx rate, p95 latency, health-check failures, queue backlog; plus saturation: DB connections, CPU/memory.

## 8. Performance

> **In short:** Measure, fix the database first, cache, reuse clients, offload slow work and scale out.

1. **Measure**: APM traces, `pg_stat_statements`, load tests (**Locust**, k6) with realistic data.
2. Fix the database first: indexes, N+1, select only needed columns, pagination.
3. Cache hot reads in Redis; use HTTP caching headers for public data.
4. Reuse clients (one `httpx.AsyncClient`, one engine) and set timeouts.
5. Move slow/CPU-heavy work to Celery.
6. Use async drivers if you have very high concurrency with lots of I/O waits.
7. `ORJSONResponse` or Pydantic's fast serialization for big JSON payloads; compress with GZip at the proxy.
8. Scale horizontally; autoscale on CPU/latency/requests.

## 9. Security in production

> **In short:** HTTPS, strict CORS, authorization checks, rate limits, scanning and hidden internals.

- HTTPS only (HSTS); TLS terminated at the load balancer.
- Strict CORS origins; `TrustedHostMiddleware` with your domain.
- Auth on every non-public endpoint; ownership checks (BOLA); least-privilege roles.
- Rate limits and request body size limits (at the proxy: `client_max_body_size` in Nginx).
- Security headers at the proxy (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, CSP for any HTML).
- Dependency and image scanning in CI (`pip-audit`, Trivy); patch regularly.
- Hide internals: generic 500 messages, no stack traces, `docs_url=None` for private APIs.
- Audit log for sensitive actions (logins, role changes, deletions).
- Run containers as non-root with read-only filesystems where possible.

## 10. Deployments

> **In short:** Build once, roll out gradually, keep changes backward compatible, shut down gracefully and roll back fast.

- **Build once, deploy the same image** to staging and production (config differs, image doesn't).
- Strategies: **rolling** (replace instances gradually), **blue/green** (switch traffic between two environments), **canary** (small % of traffic first). See [../08-CI-CD/production.md](../08-CI-CD/production.md).
- **Backward-compatible** API and DB changes, so old and new versions can run side by side during a rollout (expand → migrate → contract: [../09-Migrations/production.md](../09-Migrations/production.md)).
- **Graceful shutdown**: on SIGTERM, stop accepting new connections and finish in-flight requests (Uvicorn handles this; set Kubernetes `terminationGracePeriodSeconds` higher than your longest request; close pools in lifespan shutdown).
- Keep a fast **rollback**: redeploy the previous image tag.

## 11. Maintenance

> **In short:** Regular tasks after deploys and every week, month and quarter.

| How often | Task |
| --- | --- |
| Every deploy | Watch error rate and latency dashboards for 15–30 minutes; roll back on regressions |
| Weekly | Dependency update PRs; review Sentry issues; check slow-query reports |
| Monthly | Review alerts (remove noisy ones), capacity (CPU/memory/DB connections), costs |
| Quarterly | Load test; restore a DB backup to verify it; rotate secrets; review access and API keys; update FastAPI/Pydantic/SQLAlchemy |
| On incidents | Write a blameless post-mortem with action items |

Keep API docs and the OpenAPI schema versioned, deprecate endpoints with notice, and communicate breaking changes to frontend teams early.
