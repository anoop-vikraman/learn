# Python in production

What to do when Python code runs on real servers, serving real users.

## 1. Python version

> **In short:** Use a supported Python version and pin it in every place it's defined.

- Use a **supported** version (each release gets ~5 years of security fixes; check python.org's release status page). Prefer the newest version your dependencies support.
- **Pin the version everywhere**: `requires-python` in `pyproject.toml`, `.python-version` (uv/pyenv), the Docker base image (`python:3.12-slim`), and CI.
- Plan an upgrade each year; test on the new version in CI before switching production.

## 2. Dependencies

> **In short:** Lock exact versions, separate dev dependencies, scan for vulnerabilities and update often.

| Do | Why |
| --- | --- |
| Use a **lock file** (`uv.lock`, `poetry.lock`, or `pip-compile` output) and commit it | Every deploy installs exactly the same versions, including sub-dependencies |
| Install with the lock (`uv sync --frozen --no-dev`, `pip install -r requirements.txt --require-hashes`) | No surprise upgrades at deploy time |
| Separate dev and prod dependencies | Smaller, safer images (no pytest/mypy in production) |
| Scan for vulnerabilities: `pip-audit`, `uv pip audit`, Dependabot/Renovate, Snyk | Known CVEs in dependencies are a top attack vector |
| Update regularly (small, frequent bumps with CI) | Big-bang upgrades break more |
| Prefer well-maintained, popular packages | Fewer abandoned or malicious packages; watch for typosquatting (`reqeusts`) |

## 3. Configuration and secrets

> **In short:** Read config from environment variables, validate it at startup, and keep secrets in a secret manager.

- Follow the **12-factor** approach: configuration comes from **environment variables**, not from code.
- Use a typed settings object (e.g. `pydantic-settings`) that **fails at startup** if a required variable is missing or invalid.
- **Never commit secrets** (`.env` in `.gitignore`; scan with `gitleaks` or GitHub secret scanning). Store them in a secret manager (AWS Secrets Manager, GCP Secret Manager, Vault, Kubernetes secrets) and inject them as env vars.
- Different values per environment (dev/staging/prod), same code.
- Turn off debug features in production (`DEBUG=False`, no auto-reload, no stack traces in responses).

## 4. Logging

> **In short:** Structured JSON logs to stdout, with request context and no secrets.

- Use the `logging` module, never `print`.
- Log to **stdout/stderr**; let the platform (Docker, Kubernetes, systemd) collect logs and ship them to a log system (ELK/OpenSearch, Loki, CloudWatch, Datadog).
- Use **structured (JSON) logs** in production so they can be searched (`python-json-logger`, `structlog`).
- Include context: request ID / trace ID, user ID, endpoint, duration.
- Levels: `INFO` in production, `DEBUG` only temporarily. Don't log in tight loops.
- **Never log secrets or personal data** (passwords, tokens, full card numbers, sometimes emails).

```python
import logging, sys
from pythonjsonlogger.json import JsonFormatter

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
logging.basicConfig(level=logging.INFO, handlers=[handler])
```

## 5. Error tracking and monitoring

> **In short:** Error tracking, metrics, tracing, health checks and alerts on what users actually feel.

- **Error tracking**: Sentry (or similar) captures exceptions with stack traces and context, and alerts you.
- **Metrics**: request rate, error rate, latency (p50/p95/p99), CPU, memory, with Prometheus + Grafana, Datadog, or your cloud's tools.
- **Tracing**: OpenTelemetry to follow a request through services and the database.
- **Health checks**: an endpoint the load balancer/orchestrator can call.
- **Alerts** on symptoms users feel (error rate, latency, downtime), not only on CPU.

## 6. Running the process

> **In short:** Use a production server under a supervisor, shut down gracefully, and don't run as root.

- Never run with development servers (`--reload`, Flask's dev server) in production.
- Use a production server: **Uvicorn** (multiple workers) or **Gunicorn with Uvicorn workers** for ASGI apps like FastAPI.
- Run under a **supervisor** that restarts crashes: Docker/Kubernetes, systemd, or a PaaS.
- Handle **graceful shutdown** (SIGTERM): finish in-flight requests, close DB pools.
- Run as a **non-root user**.
- Set resource limits (memory/CPU) and watch for memory leaks (growing RSS over time).

## 7. Performance

> **In short:** Measure first; most slowness is I/O, so pool, cache and move slow work to background jobs.

- **Measure before optimizing**: profiling (`py-spy`, `cProfile`), APM traces.
- Most slowness is I/O: database queries (indexes, N+1 queries), external API calls, missing caching.
- Use connection pools (DB, HTTP clients) and reuse clients.
- Move slow work out of the request (Celery/background jobs).
- Cache expensive results (Redis).
- Scale horizontally (more processes/containers) once the app is stateless.

## 8. Security checklist

> **In short:** Validate input, never eval untrusted data, use secure randomness, and set timeouts on network calls.

- Validate all input (Pydantic); never build SQL with string formatting (use parameters/ORM).
- Never use `eval`/`exec` or `pickle.loads` on untrusted data; use `yaml.safe_load`, not `yaml.load`.
- Use `secrets` (not `random`) for tokens; hash passwords with **argon2** or **bcrypt**.
- Keep dependencies patched; run `pip-audit` and a static analyzer (`bandit`, Ruff's `S` rules) in CI.
- Set timeouts on every network call (`httpx.get(url, timeout=10)`): no timeout = hung workers.
- Use HTTPS everywhere; verify TLS certificates (never `verify=False`).
- Principle of least privilege for DB users and cloud credentials.

## 9. Code quality gates (in CI)

> **In short:** Format, lint, type-check, test with coverage and audit dependencies on every change.

1. Format + lint: `ruff format --check`, `ruff check`
2. Type check: `mypy` / `pyright`
3. Tests with coverage threshold: `pytest --cov --cov-fail-under=80`
4. Security: `pip-audit`, `bandit`
5. Build the artifact (Docker image) from the locked dependencies

## 10. Maintenance routine

> **In short:** What to check every PR, weekly, monthly, quarterly and yearly.

| How often | Task |
| --- | --- |
| Every PR | CI gates above |
| Weekly | Review dependency update PRs (Renovate/Dependabot) |
| Monthly | Check error-tracking trends and slow endpoints; clean up feature flags |
| Quarterly | Review logs/alerts for noise; test backups and restore; review access |
| Yearly | Upgrade Python minor version; review architecture and costs |
