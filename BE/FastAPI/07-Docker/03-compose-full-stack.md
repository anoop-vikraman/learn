# 03 · Docker Compose for the full stack

Compose describes all services in one YAML file and starts them together with networking, volumes and environment variables.

## 1. The development stack

> **In short:** A Compose file for the API, migrations, worker, beat, Postgres, Redis and Flower.

```yaml
# compose.yaml (or docker-compose.yml)
name: task-api

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.dev
    command: fastapi dev app/main.py --host 0.0.0.0 --port 8000
    ports:
      - "8000:8000"
    env_file: .env
    environment:
      DATABASE_URL: postgresql+psycopg://app:secret@db:5432/tasks     # "db" = service name
      REDIS_URL: redis://redis:6379/0
      CELERY_BROKER_URL: redis://redis:6379/1
    volumes:
      - ./app:/app/app                      # live code reload
    depends_on:
      db:
        condition: service_healthy          # wait until Postgres accepts connections
      redis:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully

  migrate:
    build:
      context: .
      dockerfile: Dockerfile.dev
    command: alembic upgrade head
    environment:
      DATABASE_URL: postgresql+psycopg://app:secret@db:5432/tasks
    depends_on:
      db:
        condition: service_healthy

  worker:
    build:
      context: .
      dockerfile: Dockerfile.dev
    command: celery -A app.workers.celery_app worker --loglevel=INFO --concurrency=2
    env_file: .env
    environment:
      DATABASE_URL: postgresql+psycopg://app:secret@db:5432/tasks
      CELERY_BROKER_URL: redis://redis:6379/1
    volumes:
      - ./app:/app/app
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  beat:
    build:
      context: .
      dockerfile: Dockerfile.dev
    command: celery -A app.workers.celery_app beat --loglevel=INFO --schedule=/tmp/celerybeat-schedule
    environment:
      CELERY_BROKER_URL: redis://redis:6379/1
    depends_on:
      redis:
        condition: service_healthy

  db:
    image: postgres:17
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: tasks
    ports:
      - "5432:5432"                         # expose for local tools (psql, DBeaver)
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d tasks"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 10

  flower:
    image: mher/flower:2.0
    command: celery --broker=redis://redis:6379/1 flower --port=5555
    ports:
      - "5555:5555"
    depends_on: [redis]
    profiles: ["tools"]                     # only started with --profile tools

volumes:
  pgdata:
  redisdata:
```

## 2. Everyday commands

> **In short:** Start, rebuild, view logs, exec, run one-off commands and tear down.

```bash
docker compose up -d                      # start everything in the background
docker compose up -d --build              # rebuild images first
docker compose ps                         # status (incl. health)
docker compose logs -f api worker         # follow logs of some services
docker compose exec api bash              # shell in a running service
docker compose exec db psql -U app -d tasks
docker compose run --rm api pytest        # one-off command in a new container
docker compose run --rm api alembic revision --autogenerate -m "add tags"
docker compose restart worker
docker compose --profile tools up -d      # include optional services (flower)
docker compose stop                       # stop, keep containers
docker compose down                       # stop and remove containers + network
docker compose down -v                    # ⚠️ also remove volumes (deletes DB data)
docker compose config                     # show the final merged config (debug env vars)
```

## 3. `depends_on` and health checks

> **In short:** Wait for healthy dependencies and completed migration jobs.

- `depends_on` alone only controls **start order**, not readiness: Postgres may still be starting.
- `condition: service_healthy` waits for the dependency's healthcheck to pass.
- `condition: service_completed_successfully` waits for a one-off job (migrations) to finish.
- Apps should still **retry connections** at startup; in production there's no Compose to wait for you.

## 4. Environment variables and `.env`

> **In short:** Load env files and substitute variables; never commit real secrets.

- `env_file: .env` loads variables into the container.
- Compose also reads a `.env` file in the project directory for **variable substitution in the YAML** (`image: task-api:${TAG:-dev}`).
- Commit `.env.example`; never commit `.env`.
- Precedence: `environment:` in the file overrides `env_file:` values.

## 5. Override files: dev vs CI vs prod

> **In short:** Layer Compose files per environment instead of duplicating them.

```yaml
# compose.yaml: shared base
# compose.override.yaml: automatically merged in development (bind mounts, ports, dev commands)
# compose.prod.yaml: production-like settings
```

```bash
docker compose up -d                                          # base + override (dev)
docker compose -f compose.yaml -f compose.prod.yaml up -d     # base + prod
```

Production-like override example:

```yaml
# compose.prod.yaml
services:
  api:
    image: registry.example.com/task-api:${TAG}
    build: !reset null
    command: fastapi run app/main.py --workers 4
    volumes: !reset []
    restart: unless-stopped
    deploy:
      resources:
        limits: { cpus: "1.0", memory: 512M }
  db:
    ports: !reset []              # don't expose the DB publicly
```

## 6. Running tests with Compose

> **In short:** Run the test suite against a throwaway in-memory Postgres.

```yaml
# compose.test.yaml
services:
  test-db:
    image: postgres:17
    environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: secret, POSTGRES_DB: tasks_test }
    tmpfs: /var/lib/postgresql/data          # in-memory: fast, thrown away
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d tasks_test"]
      interval: 2s
      retries: 20
  tests:
    build: { context: ., dockerfile: Dockerfile.dev }
    command: pytest -q
    environment:
      DATABASE_URL: postgresql+psycopg://app:secret@test-db:5432/tasks_test
    depends_on:
      test-db: { condition: service_healthy }
```

```bash
docker compose -f compose.test.yaml run --rm tests
```

## 7. Useful patterns

> **In short:** Seeding, init scripts, watch mode, project names and platform settings.

- **Seed data**: `docker compose run --rm api python -m scripts.seed` (see [../10-Seeding/](../10-Seeding/)).
- **Init SQL scripts**: files in `/docker-entrypoint-initdb.d/` of the Postgres image run **only when the volume is empty** (first start).
- **Watch mode** (`docker compose watch` with a `develop.watch` section) syncs files or rebuilds on changes as an alternative to bind mounts.
- **Named projects**: `name:` at the top keeps container/volume names predictable.
- **Apple Silicon**: add `platform: linux/amd64` only if an image lacks arm64 support.

## 8. Troubleshooting

> **In short:** Fixes for connection, port, reload, env var and stale data problems.

| Problem | Check |
| --- | --- |
| API can't reach the DB | Use the service name (`db`), not `localhost`; is `db` healthy? `docker compose ps` |
| Port already in use | Another local Postgres/Redis; change the host port (`"5433:5432"`) |
| Code changes not picked up | Bind mount path correct? Server running with reload? Rebuild if dependencies changed |
| Env var not set | `docker compose config` shows the resolved values |
| Old data / schema | Volumes persist: `docker compose down -v` to reset (deletes data) |
| Permission errors on mounted files | Container user UID vs host files; adjust ownership or user |

---

## 9. Exercises

1. Write the full Compose file and start the stack; open `/docs`, Flower, and connect to Postgres from your host.
2. Add the `migrate` one-off service and make `api` wait for it.
3. Create a `compose.prod.yaml` override without bind mounts or exposed DB ports.
4. Run the test suite against a tmpfs Postgres with a test Compose file.
5. Break the DB healthcheck and observe how `depends_on` behaves.
