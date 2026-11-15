# 02 · A Dockerfile for FastAPI

## 1. A simple Dockerfile (pip + requirements.txt)

> **In short:** The basic instructions: FROM, ENV, WORKDIR, COPY, RUN, EXPOSE, CMD.

```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /code

# 1. Dependencies first (cached unless requirements change)
COPY requirements.txt .
RUN pip install -r requirements.txt

# 2. Then the source code (changes often)
COPY ./app ./app

EXPOSE 8000
CMD ["fastapi", "run", "app/main.py", "--port", "8000"]
```

| Instruction | Purpose |
| --- | --- |
| `FROM` | Base image. `python:3.12-slim` (Debian, small) is a good default. Alpine is smaller but uses musl, which breaks or slows many Python wheels |
| `ENV` | `PYTHONUNBUFFERED=1` sends logs immediately; `PYTHONDONTWRITEBYTECODE=1` skips `.pyc` files |
| `WORKDIR` | Working directory (created if missing) |
| `COPY` | Copy files from the build context into the image |
| `RUN` | Run a command at **build** time |
| `EXPOSE` | Documents the port (doesn't publish it) |
| `CMD` | Default command at **run** time. Use the JSON (exec) form so signals reach your app |
| `ENTRYPOINT` | Fixed executable; `CMD` then supplies default arguments |

```bash
docker build -t task-api:dev .
docker run --rm -p 8000:8000 --env-file .env task-api:dev
```

## 2. `.dockerignore`

> **In short:** Keep caches, virtualenvs, tests and secrets out of the build context.

Keeps the build context small and secrets out of the image.

```
.git
.venv
__pycache__/
*.pyc
.pytest_cache/
.mypy_cache/
.ruff_cache/
.coverage
htmlcov/
.env
.env.*
!.env.example
tests/
docs/
node_modules/
Dockerfile*
docker-compose*.yml
```

## 3. Production-grade multi-stage Dockerfile with uv

> **In short:** Build dependencies in one stage and copy them into a small, non-root runtime stage.

Multi-stage builds use one stage to **build** (compilers, build tools) and a clean, small stage to **run**.

```dockerfile
# syntax=docker/dockerfile:1

############################
# Stage 1: build dependencies
############################
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# Install dependencies only (cached until pyproject/uv.lock change)
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-dev --no-install-project

# Copy the source and install the project itself
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

############################
# Stage 2: runtime
############################
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

# Runtime-only system packages (e.g. libpq for psycopg non-binary builds); keep minimal
# RUN apt-get update && apt-get install -y --no-install-recommends libpq5 && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd --system app && useradd --system --gid app --home /app app

WORKDIR /app
COPY --from=builder --chown=app:app /app /app

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=2)" || exit 1

CMD ["fastapi", "run", "app/main.py", "--port", "8000", "--workers", "2"]
```

Why each piece matters:

| Technique | Benefit |
| --- | --- |
| Dependencies installed before `COPY . .` | Code changes don't reinstall dependencies → fast rebuilds |
| `--mount=type=cache` | uv/pip download cache reused across builds (BuildKit) |
| `uv sync --frozen` | Installs exactly what's in `uv.lock`; fails if the lock is out of date |
| `--no-dev` | No pytest/mypy in the production image |
| Multi-stage | Build tools and caches don't end up in the final image |
| Non-root `USER` | Limits damage if the app is compromised |
| `HEALTHCHECK` | Docker/Compose know when the app is healthy |
| Pinned tags (`python:3.12-slim`, `uv:0.5`) | Reproducible builds (pin by digest for even stronger guarantees) |

### With pip instead of uv

> **In short:** The same multi-stage idea using a venv and requirements.txt.

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12-slim
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1
RUN useradd --system app
COPY --from=builder /opt/venv /opt/venv
WORKDIR /app
COPY --chown=app:app ./app ./app
USER app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 4. One image, many roles

> **In short:** The same image runs the API, workers, beat, migrations and seeds with different commands.

The API, Celery worker, beat and migration job usually share **one image** with different commands:

```bash
docker run task-api:1.4.0                                              # API (default CMD)
docker run task-api:1.4.0 celery -A app.workers.celery_app worker -l INFO
docker run task-api:1.4.0 celery -A app.workers.celery_app beat -l INFO
docker run task-api:1.4.0 alembic upgrade head                         # migrations
docker run task-api:1.4.0 python -m scripts.seed                       # seeding
```

## 5. Entrypoint scripts (optional)

> **In short:** A startup script that ends with `exec "$@"` so signals reach the app.

```bash
#!/bin/sh
# docker/entrypoint.sh
set -e
# wait for dependencies, print version, etc.
exec "$@"            # exec so the app becomes PID 1 and receives SIGTERM
```

```dockerfile
COPY docker/entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["fastapi", "run", "app/main.py"]
```

⚠️ Avoid running migrations automatically in the entrypoint of every replica (several containers racing). Run them as a separate step (see [../09-Migrations/production.md](../09-Migrations/production.md)).

## 6. Development image: hot reload

> **In short:** A dev image with dev dependencies and auto-reload, used with bind mounts.

```dockerfile
# Dockerfile.dev
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen               # includes dev dependencies
ENV PATH="/app/.venv/bin:$PATH"
CMD ["fastapi", "dev", "app/main.py", "--host", "0.0.0.0", "--port", "8000"]
```

Mount the code with a bind mount in Compose so changes reload instantly (lesson 03). Or use a `target` in one multi-stage Dockerfile (`docker build --target dev`).

## 7. Image size and build tips

> **In short:** Slim bases, fewer layers, binary wheels, inspecting layers and multi-platform builds.

- Use `-slim` bases; remove apt lists (`rm -rf /var/lib/apt/lists/*`) in the same `RUN` that installs packages.
- Combine related `RUN` commands to reduce layers; clean caches in the same layer.
- Check size: `docker images`, and inspect layers with `docker history task-api:1.4.0` or the `dive` tool.
- Prefer binary wheels (`psycopg[binary]`) to avoid compilers in the image; if you need compilers, keep them in the builder stage.
- Build for the target platform: `docker buildx build --platform linux/amd64,linux/arm64 ...` (Apple Silicon vs x86 servers).

---

## 8. Exercises

1. Write the simple Dockerfile, build and run it; then change a source file and observe which layers rebuild.
2. Add a `.dockerignore` and compare the build context size before and after.
3. Convert to the multi-stage uv Dockerfile; compare image sizes.
4. Run the container as non-root and verify with `docker exec api whoami`.
5. Use the same image to run the API and a one-off `alembic upgrade head`.
