# Express in production

Node runtime concerns (versions, memory, process management) are in [../01-Node-Fundamentals/production.md](../01-Node-Fundamentals/production.md).

## 1. Checklist

> **In short:** What an Express API needs before going live.

- [ ] `NODE_ENV=production`; `x-powered-by` disabled
- [ ] Helmet, strict CORS, body size limits, rate limiting (Redis-backed with several instances)
- [ ] `trust proxy` set correctly behind the load balancer
- [ ] Validation on every input; centralized error handler with generic 500s
- [ ] Auth on all non-public routes; ownership checks in queries
- [ ] pino JSON logs with request IDs and redaction; error tracking; metrics
- [ ] Health (live/ready) endpoints
- [ ] Server timeouts tuned; graceful shutdown
- [ ] Stateless instances (sessions/cache/rate limits in Redis, files in object storage)
- [ ] Load-tested; autoscaling configured
- [ ] OpenAPI docs published (internal) and versioned API

## 2. Behind a proxy or load balancer

> **In short:** Tell Express how many proxies sit in front of it so client IPs, protocol and secure cookies work correctly.

```ts
app.set('trust proxy', 1);   // exactly one proxy hop (e.g. the cloud load balancer)
```

- Without it, `req.ip` is the load balancer's IP: rate limiting and logs treat every user as one client.
- ⚠️ Don't use `trust proxy: true` blindly: clients could spoof `X-Forwarded-For`. Use the hop count or the proxy's IP ranges.
- Terminate TLS at the load balancer; set `secure: true` cookies (Express needs `trust proxy` to know the original request was HTTPS).

## 3. Server timeouts

> **In short:** Align keep-alive and request timeouts with your load balancer to avoid random 502 errors and hung requests.

```ts
server.keepAliveTimeout = 65_000;   // must exceed the LB idle timeout (e.g. AWS ALB: 60 s)
server.headersTimeout = 66_000;     // slightly above keepAliveTimeout
server.requestTimeout = 30_000;     // cap slow requests
```

A Node keep-alive timeout shorter than the load balancer's causes intermittent 502s when the LB reuses a connection Node just closed.

## 4. Security hardening

> **In short:** Layer protections: headers, CORS, limits, validation, auth, safe errors, patched dependencies.

- Helmet defaults + a Content Security Policy if you serve HTML.
- CORS with an exact origin list per environment.
- `express.json({ limit })`, upload limits, and request timeouts.
- Rate limits: global per IP, stricter on login/password reset/expensive endpoints; shared store (Redis).
- Validate and strip unknown fields (prevents mass assignment).
- Never expose stack traces; log them instead.
- Audit dependencies in CI; update Express and middleware promptly.
- Protect internal docs and metrics endpoints (auth, private network).

## 5. Performance

> **In short:** Keep handlers async and light, cache and paginate, compress at the edge, and scale horizontally.

- Avoid sync and CPU-heavy work in handlers (worker threads or BullMQ instead).
- Fix database N+1 queries and add indexes; paginate everything.
- Cache hot reads in Redis; use HTTP caching headers (`Cache-Control`, ETag) for public data.
- Compression: do it at the proxy/CDN if possible (it's CPU work); otherwise `compression()`.
- Watch middleware cost: every middleware runs on every matching request.
- If you need much higher raw throughput, consider Fastify (same concepts, faster router and serialization).
- Load test (k6, autocannon) with realistic data before launch and after big changes.

## 6. Observability

> **In short:** Logs, errors, metrics and traces, with alerts on user-facing symptoms and event loop health.

| Pillar | Tooling |
| --- | --- |
| Logs | pino + pino-http → stdout → Loki/ELK/CloudWatch/Datadog |
| Errors | `@sentry/node` with Express integration (`Sentry.setupExpressErrorHandler(app)`) |
| Metrics | `prom-client` + an HTTP metrics middleware (request count, duration histogram by route and status), default Node metrics (event loop lag, heap) |
| Traces | OpenTelemetry auto-instrumentation (`@opentelemetry/auto-instrumentations-node`) for http, express, pg/Prisma, ioredis |

Alerts: 5xx rate, p95/p99 latency per route, event loop lag, memory growth, restarts, health-check failures.

## 7. Deployment

> **In short:** Ship the compiled app in a slim, non-root Docker image, run migrations as a separate step, and roll out gradually with health checks.

- Build TypeScript in CI; the runtime image contains `dist/`, production `node_modules` and nothing else ([../05-Docker-CI-CD/01-docker-node.md](../05-Docker-CI-CD/01-docker-node.md)).
- Start with `node dist/server.js` (not `npm start`) so signals reach Node.
- Migrations (`prisma migrate deploy`) run once per deploy, before rollout, and must be backward compatible.
- Rolling or canary deploys gated by readiness checks; quick rollback to the previous image.

## 8. Maintenance

> **In short:** Recurring tasks to keep the API healthy.

| How often | Task |
| --- | --- |
| Every deploy | Watch error rate, latency and logs for 15–30 minutes |
| Weekly | Dependency PRs; Sentry triage; slow endpoint review |
| Monthly | Review rate-limit and timeout settings vs real traffic; prune unused routes and feature flags |
| Quarterly | Load test; security review (OWASP API Top 10); secret rotation; Express/middleware major updates |
