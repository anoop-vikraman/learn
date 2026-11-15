# 04 · Dependency injection

## 1. What is it?

> **In short:** Endpoints declare what they need, and FastAPI creates and passes it in.

A **dependency** is something an endpoint needs: a database session, the current user, settings, pagination parameters, a service object. Instead of creating these inside every endpoint, you **declare** them, and FastAPI **creates and passes them in** (injects them).

Benefits: shared logic in one place, automatic validation and docs for dependency parameters, easy cleanup, and easy replacement in tests.

## 2. Basic dependency

> **In short:** A function used with `Depends()` whose own parameters are parsed from the request.

```python
from typing import Annotated
from fastapi import Depends, FastAPI, Query

app = FastAPI()

def pagination(
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    return {"offset": (page - 1) * size, "limit": size}

Pagination = Annotated[dict, Depends(pagination)]        # reusable alias

@app.get("/tasks")
def list_tasks(p: Pagination):
    return {"offset": p["offset"], "limit": p["limit"]}

@app.get("/projects")
def list_projects(p: Pagination):                         # same logic, no duplication
    ...
```

- `Depends(pagination)`: pass the function, **don't call it**.
- The dependency's own parameters (`page`, `size`) are parsed from the request like any endpoint parameter, and appear in `/docs`.
- The `Annotated[..., Depends(...)]` alias style is recommended.

## 3. Dependencies with `yield`: setup and cleanup

> **In short:** Code before `yield` runs first, code after runs at the end: ideal for DB sessions.

Code before `yield` runs before the endpoint; code after runs after the response is ready. Perfect for database sessions.

```python
from sqlalchemy.orm import Session

def get_db():
    db = SessionLocal()
    try:
        yield db                 # value injected into the endpoint
    finally:
        db.close()               # always runs, even if the endpoint raised

DbSession = Annotated[Session, Depends(get_db)]

@app.get("/tasks/{task_id}")
def get_task(task_id: int, db: DbSession):
    return db.get(Task, task_id)
```

Wrap commit/rollback around it if you want a transaction per request:

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
```

## 4. Sub-dependencies (dependencies of dependencies)

> **In short:** Dependencies can depend on others (token → user → admin); each runs once per request.

```python
def get_token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    return authorization.removeprefix("Bearer ")

def get_current_user(token: Annotated[str, Depends(get_token)], db: DbSession) -> User:
    user = decode_and_load_user(token, db)
    if not user:
        raise HTTPException(401, "Invalid token")
    return user

def get_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Admins only")
    return user

CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(get_admin)]

@app.get("/me")
def me(user: CurrentUser):
    return user

@app.delete("/users/{user_id}")
def delete_user(user_id: int, admin: AdminUser): ...
```

FastAPI resolves the whole tree. **Within one request, each dependency runs once** and its result is cached and shared (here `get_db` runs once even though two dependencies use it). Use `Depends(fn, use_cache=False)` to opt out.

## 5. Class dependencies and services

> **In short:** Classes can be dependencies too, which keeps business logic in testable service objects.

Any callable works, including classes:

```python
class TaskService:
    def __init__(self, db: DbSession):           # FastAPI injects db into the constructor
        self.db = db

    def list(self, owner_id: int) -> list[Task]:
        return self.db.scalars(select(Task).where(Task.owner_id == owner_id)).all()

    def create(self, owner_id: int, data: TaskCreate) -> Task:
        task = Task(owner_id=owner_id, **data.model_dump())
        self.db.add(task)
        self.db.flush()
        return task

TaskSvc = Annotated[TaskService, Depends()]       # Depends() with no argument = use the annotated class

@app.get("/tasks")
def list_tasks(svc: TaskSvc, user: CurrentUser):
    return svc.list(user.id)
```

This keeps endpoints thin (HTTP concerns only) and business logic in testable services.

### Parameterized dependencies (callable instances)

> **In short:** Instances with `__call__` make configurable dependencies such as `RequireRole("admin")`.

```python
class RequireRole:
    def __init__(self, *roles: str):
        self.roles = roles

    def __call__(self, user: CurrentUser) -> User:
        if user.role not in self.roles:
            raise HTTPException(403, "Forbidden")
        return user

@app.post("/reports")
def create_report(user: Annotated[User, Depends(RequireRole("admin", "manager"))]): ...
```

## 6. Dependencies without using the value

> **In short:** Run checks on an endpoint, router or the whole app via `dependencies=[...]`.

```python
def verify_api_key(x_api_key: Annotated[str, Header()]):
    if x_api_key != settings.api_key:
        raise HTTPException(401, "Invalid API key")

@app.get("/internal/stats", dependencies=[Depends(verify_api_key)])    # on one endpoint
def stats(): ...

router = APIRouter(prefix="/admin", dependencies=[Depends(get_admin)])  # on a whole router
app = FastAPI(dependencies=[Depends(log_request)])                       # on every endpoint
```

## 7. Settings as a dependency

> **In short:** Provide cached settings through a dependency so they're easy to override.

```python
from functools import lru_cache

@lru_cache                      # create once, reuse
def get_settings() -> Settings:
    return Settings()

SettingsDep = Annotated[Settings, Depends(get_settings)]

@app.get("/info")
def info(settings: SettingsDep):
    return {"env": settings.environment}
```

(Settings are covered in [07-structure-config.md](07-structure-config.md).)

## 8. Overriding dependencies in tests

> **In short:** Swap the database, auth or services in tests with `app.dependency_overrides`.

```python
app.dependency_overrides[get_db] = get_test_db
app.dependency_overrides[get_current_user] = lambda: User(id=1, email="t@t.com", role="admin")
# ... run tests ...
app.dependency_overrides.clear()
```

This is a major reason to use dependencies: you can swap the database, auth or external services without touching endpoint code. See [09-testing.md](09-testing.md).

## 9. Gotchas

> **In short:** Common mistakes: calling the dependency, blocking in async ones, and timing of code after `yield`.

- `Depends(get_db)` ✅ vs `Depends(get_db())` ❌.
- Sync (`def`) dependencies run in the thread pool; async ones on the event loop. Don't block in `async def` dependencies.
- In yield dependencies, code after `yield` runs once the endpoint has finished. It can't change the response anymore. Exactly when it runs relative to sending the response has changed between FastAPI versions, so don't rely on that timing.
- Background tasks run after the response. Don't reuse the request's yield-dependency DB session inside them; open a new session in the task.
- An exception caught in a yield dependency must be **re-raised** (`except ...: ...; raise`). Swallowing it hides errors.

---

## 10. Exercises

1. Write a `pagination` dependency and a `sorting` dependency (field + direction) and use both.
2. Create `get_db` (yield), `get_current_user` (from a fake token header), and `get_admin`.
3. Move task logic into a `TaskService` class dependency.
4. Protect a router with an API-key dependency via `dependencies=[...]`.
5. Write `RequireRole("admin")` as a callable class dependency.
