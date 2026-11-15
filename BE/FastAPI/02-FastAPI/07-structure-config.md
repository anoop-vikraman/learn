# 07 · Project structure and configuration

## 1. Splitting the app with `APIRouter`

> **In short:** Group endpoints into routers per feature and include them with a prefix like `/api/v1`.

```python
# app/api/routes/tasks.py
from fastapi import APIRouter

router = APIRouter(prefix="/tasks", tags=["tasks"])

@router.get("")
def list_tasks(): ...

@router.get("/{task_id}")
def get_task(task_id: int): ...
```

```python
# app/api/router.py
from fastapi import APIRouter
from app.api.routes import auth, tasks, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(tasks.router)
```

```python
# app/main.py
from fastapi import FastAPI
from app.api.router import api_router

app = FastAPI(title="Task API")
app.include_router(api_router, prefix="/api/v1")      # all routes under /api/v1
```

## 2. A layered project layout

> **In short:** Separate routes, services, repositories, schemas and models so each layer has one job.

```
task-api/
  pyproject.toml
  uv.lock
  .env.example              # documented variables, no real secrets
  alembic.ini
  alembic/                  # migrations
  app/
    __init__.py
    main.py                 # create app, middleware, routers, lifespan
    core/
      config.py             # Settings
      security.py           # hashing, JWT
      logging.py
    db/
      base.py               # DeclarativeBase
      session.py            # engine, SessionLocal, get_db
    models/                 # SQLAlchemy models
      user.py
      task.py
    schemas/                # Pydantic models (request/response)
      user.py
      task.py
    repositories/           # DB queries (optional layer)
      task.py
    services/               # business logic
      task.py
      email.py
    api/
      deps.py               # shared dependencies (DbSession, CurrentUser)
      router.py
      routes/
        auth.py
        tasks.py
        users.py
    workers/                # Celery tasks
  tests/
    conftest.py
    api/
    services/
  scripts/
    seed.py
  Dockerfile
  docker-compose.yml
```

**Responsibilities:**

| Layer | Does | Doesn't |
| --- | --- | --- |
| `api/routes` | HTTP: parse input, call a service, choose status codes | Business rules, SQL |
| `services` | Business rules, orchestration, transactions | Know about HTTP requests |
| `repositories` | Queries | Business decisions |
| `schemas` | API contracts (Pydantic) | DB mapping |
| `models` | DB tables (SQLAlchemy) | Validation of API input |

Alternative for larger apps: organise **by feature** (`app/tasks/{router,service,models,schemas}.py`), similar to feature folders in a React app.

## 3. Configuration with `pydantic-settings`

> **In short:** Typed settings read from env vars/`.env`, validated at startup, with secrets hidden.

```bash
uv add pydantic-settings
```

```python
# app/core/config.py
from functools import lru_cache
from typing import Literal
from pydantic import PostgresDsn, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["local", "staging", "production"] = "local"
    debug: bool = False
    database_url: PostgresDsn                     # required: app fails to start if missing
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: SecretStr                         # hidden when printed/logged
    access_token_minutes: int = 30
    cors_origins: list[str] = ["http://localhost:5173"]   # env: CORS_ORIGINS='["https://app.example.com"]'

    @field_validator("jwt_secret")
    @classmethod
    def long_secret(cls, v: SecretStr) -> SecretStr:
        if len(v.get_secret_value()) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters")
        return v

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
```

```bash
# .env (local only; never commit it)
DATABASE_URL=postgresql+psycopg://app:secret@localhost:5432/tasks
JWT_SECRET=change-me-to-a-long-random-string-of-at-least-32-chars
```

- Environment variables override `.env` values; names are case-insensitive by default.
- Validation at startup means a missing or malformed setting fails **immediately and clearly**, not at 3 a.m. on the first request that needs it.
- Use `settings.jwt_secret.get_secret_value()` to read a `SecretStr`.
- Commit a `.env.example` listing every variable with fake values.

## 4. Lifespan: startup and shutdown

> **In short:** Create shared resources (HTTP clients, Redis) at startup and close them at shutdown.

```python
# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
import httpx

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    app.state.http = httpx.AsyncClient(timeout=10)     # shared client (connection pooling)
    app.state.redis = redis_from_url(settings.redis_url)
    yield
    # shutdown
    await app.state.http.aclose()
    await app.state.redis.aclose()
    engine.dispose()

app = FastAPI(title="Task API", lifespan=lifespan,
              docs_url=None if settings.environment == "production" else "/docs")
```

Access shared resources in endpoints with `request.app.state.http` (or wrap them in a dependency). `@app.on_event("startup")` is the old, deprecated way.

## 5. Versioning

> **In short:** Version the API in the URL and add fields instead of making breaking changes.

- **URL prefix**: `/api/v1/...` (simple, visible, most common). When you need breaking changes, add `/api/v2` routers alongside v1 and deprecate v1 later.
- Avoid breaking changes when possible: add new optional fields instead of renaming/removing.
- Mark old endpoints `deprecated=True` so they're flagged in the docs.

## 6. Conventions that help the frontend

> **In short:** Consistent naming, errors, pagination and dates, plus generated TypeScript clients.

- Consistent naming: JSON in `snake_case` or `camelCase` (with Pydantic aliases: `alias_generator=to_camel`, `populate_by_name=True`, and serialize with aliases). Pick one.
- A consistent error format (lesson 03).
- Pagination format, e.g. `{"items": [...], "total": 120, "page": 2, "size": 20}`.
- ISO 8601 UTC timestamps.
- Publish the OpenAPI schema and generate typed TS clients (`openapi-typescript`, `orval`).

```python
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

class TaskOut(CamelModel):
    id: int
    due_date: str | None        # serialized as "dueDate" (FastAPI uses aliases in responses by default)
```

---

## 7. Exercises

1. Restructure the task API into the layout above with routers under `/api/v1`.
2. Move configuration into `Settings`; make the app refuse to start without `DATABASE_URL`.
3. Add a lifespan that creates a shared `httpx.AsyncClient` and closes it on shutdown.
4. Add a generic `Page[T]` Pydantic model for paginated responses.
5. Switch the API's JSON to camelCase with an alias generator.
