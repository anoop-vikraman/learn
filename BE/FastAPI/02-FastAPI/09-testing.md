# 09 · Testing FastAPI apps

```bash
uv add --dev pytest pytest-cov httpx
```

## 1. TestClient basics

> **In short:** Call your app in tests without running a server, and check status codes and JSON.

`TestClient` calls your app directly (no server needed) with a `requests`-like API.

```python
# tests/test_health.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}

def test_validation_error():
    r = client.post("/api/v1/tasks", json={"title": ""})
    assert r.status_code == 422
```

Use `with TestClient(app) as client:` so **lifespan** startup/shutdown runs.

## 2. A test database

> **In short:** Use real PostgreSQL in tests and roll back a transaction after each test so tests stay isolated.

Use a **real database of the same kind as production** (PostgreSQL) for integration tests: SQLite behaves differently (types, constraints, JSON, locking). Run it locally with Docker or with Testcontainers.

```python
# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.main import app
from app.db.base import Base
from app.api.deps import get_db

TEST_DATABASE_URL = "postgresql+psycopg://app:secret@localhost:5433/tasks_test"

engine = create_engine(TEST_DATABASE_URL)
TestingSession = sessionmaker(bind=engine, expire_on_commit=False)

@pytest.fixture(scope="session", autouse=True)
def create_schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)       # or run Alembic migrations: alembic upgrade head
    yield
    Base.metadata.drop_all(engine)

@pytest.fixture
def db() -> Session:
    """Each test runs inside a transaction that is rolled back: tests don't affect each other."""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSession(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def client(db: Session):
    app.dependency_overrides[get_db] = lambda: db       # endpoints use the test session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

`join_transaction_mode="create_savepoint"` lets your code call `commit()` while the outer test transaction still rolls everything back at the end.

### Testcontainers (no manual database setup)

> **In short:** Start a throwaway PostgreSQL container automatically for the test session.

```python
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def pg_url():
    with PostgresContainer("postgres:17") as pg:
        yield pg.get_connection_url(driver="psycopg")
```

## 3. Factories for test data

> **In short:** Small helper functions that create valid users and tasks for each test.

```python
# tests/factories.py
from app.models import User, Task
from app.core.security import hash_password

def make_user(db, email="user@test.com", password="secret123", role="user") -> User:
    user = User(email=email, hashed_password=hash_password(password), role=role)
    db.add(user)
    db.flush()
    return user

def make_task(db, owner: User, **overrides) -> Task:
    task = Task(title=overrides.pop("title", "Test task"), owner_id=owner.id, **overrides)
    db.add(task)
    db.flush()
    return task
```

(`factory_boy` + `Faker` is a popular library for this: see [../10-Seeding/](../10-Seeding/).)

## 4. Testing authenticated endpoints

> **In short:** Override `get_current_user` in most tests, and test the real login flow once end to end.

```python
# tests/conftest.py (continued)
from app.api.deps import get_current_user
from tests.factories import make_user

@pytest.fixture
def user(db):
    return make_user(db)

@pytest.fixture
def auth_client(client, user):
    app.dependency_overrides[get_current_user] = lambda: user    # skip real JWT in most tests
    return client
```

```python
# tests/api/test_tasks.py
from tests.factories import make_user, make_task

def test_create_task(auth_client):
    r = auth_client.post("/api/v1/tasks", json={"title": "Write tests"})
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "Write tests"
    assert body["done"] is False

def test_list_only_my_tasks(auth_client, db, user):
    other = make_user(db, email="other@test.com")
    make_task(db, user, title="mine")
    make_task(db, other, title="theirs")
    r = auth_client.get("/api/v1/tasks")
    titles = [t["title"] for t in r.json()]
    assert titles == ["mine"]

def test_cannot_read_others_task(auth_client, db):
    other = make_user(db, email="other@test.com")
    task = make_task(db, other)
    assert auth_client.get(f"/api/v1/tasks/{task.id}").status_code == 404
```

Also test the **real login flow** once, end to end:

```python
def test_login_and_me(client, db):
    make_user(db, email="a@test.com", password="pw123456")
    r = client.post("/auth/token", data={"username": "a@test.com", "password": "pw123456"})  # form data
    token = r.json()["access_token"]
    me = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["email"] == "a@test.com"

def test_wrong_password(client, db):
    make_user(db, email="a@test.com", password="pw123456")
    r = client.post("/auth/token", data={"username": "a@test.com", "password": "nope"})
    assert r.status_code == 401
```

## 5. Async tests

> **In short:** Use `httpx.AsyncClient` with `ASGITransport` for async apps.

For async endpoints with async dependencies (async DB), use `httpx.AsyncClient` with `ASGITransport`:

```python
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app

@pytest.mark.anyio
async def test_list_tasks_async():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get("/api/v1/tasks")
    assert r.status_code == 200
```

(`pytest.mark.anyio` comes with AnyIO, already a FastAPI dependency; `pytest-asyncio` also works.)

## 6. Mocking external services

> **In short:** Replace email senders and third-party APIs with fakes, ideally through dependencies.

```python
from app.services import email

def test_register_sends_email(client, monkeypatch):
    sent = []
    monkeypatch.setattr(email, "send_welcome_email", lambda to: sent.append(to))
    client.post("/auth/register", json={"email": "n@test.com", "password": "pw123456"})
    assert sent == ["n@test.com"]
```

Better design: make the email sender a **dependency** and override it with a fake. Mock HTTP APIs with `respx` (for httpx). Run Celery tasks eagerly or mock `.delay()` in API tests.

## 7. What to test

> **In short:** Happy paths, validation, auth (401/403/404), business rules and edge cases.

- Happy path for every endpoint (status code + body shape).
- Validation errors (422) for important rules.
- Auth: 401 without a token, 403 for the wrong role, 404 for other users' objects.
- Business rules in services (unit tests, no HTTP).
- Edge cases: empty lists, pagination boundaries, duplicates (409), not found (404).

## 8. Running in CI

> **In short:** Run pytest with coverage and a PostgreSQL service container on every change.

```bash
pytest -q --cov=app --cov-report=term-missing --cov-fail-under=80
```

With a PostgreSQL **service container** in CI (see [../08-CI-CD/](../08-CI-CD/)).

---

## 9. Exercises

1. Set up the transactional test database fixtures and write CRUD tests for tasks.
2. Write auth tests: register, login, `/me`, wrong password, expired token.
3. Prove a user can't update or delete another user's task.
4. Make the email sender a dependency and override it in tests.
5. Reach 85%+ coverage and add the coverage gate to your test command.
