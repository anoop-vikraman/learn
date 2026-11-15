# FastAPI: from scratch to advanced

FastAPI is a modern Python web framework for building APIs. It uses **type hints** to validate requests, serialize responses and generate interactive API docs automatically. It's built on **Starlette** (web layer) and **Pydantic** (data validation), and runs on an ASGI server such as **Uvicorn**.

Prerequisites: Python lessons 01–08 ([../01-Python/](../01-Python/)), especially type hints and Pydantic. Basic SQL helps for lesson 05 ([../03-Database-Concepts/](../03-Database-Concepts/)).

| # | Lesson | You will learn |
| --- | --- | --- |
| 00 | [How FastAPI works internally](00-how-fastapi-works.md) | The layers (Uvicorn → ASGI → Starlette → FastAPI → Pydantic), startup analysis, the life of a request, dependency resolution, sync vs async, how docs are generated |
| 01 | [Introduction and first app](01-intro-first-app.md) | What an API is, HTTP basics, installing, first endpoints, automatic docs |
| 02 | [Path, query, body and Pydantic models](02-requests-pydantic.md) | Path/query parameters, request bodies, validation, nested models, headers, cookies, forms, files |
| 03 | [Responses, status codes and errors](03-responses-errors.md) | `response_model`, status codes, `HTTPException`, custom exception handlers, response types |
| 04 | [Dependency injection](04-dependency-injection.md) | `Depends`, `Annotated`, yield dependencies, class dependencies, sub-dependencies, global deps |
| 05 | [Databases with SQLAlchemy](05-database-sqlalchemy.md) | SQLAlchemy 2.0 models, sessions, CRUD, relationships, async, avoiding N+1 |
| 06 | [Authentication and security](06-auth-security.md) | Password hashing, JWT (OAuth2 password flow), current user, roles, CORS |
| 07 | [Project structure and configuration](07-structure-config.md) | `APIRouter`, layered architecture, `pydantic-settings`, lifespan, versioning |
| 08 | [Async, background work and real-time](08-async-background-middleware.md) | async vs sync endpoints, `BackgroundTasks`, middleware, WebSockets, streaming, pagination |
| 09 | [Testing](09-testing.md) | `TestClient`, `httpx.AsyncClient`, dependency overrides, test databases |
| — | [**Production**](production.md) | Servers and workers, deployment, security, performance, observability, maintenance |
