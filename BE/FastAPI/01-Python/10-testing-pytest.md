# 10 · Testing with pytest

## 1. Setup and first test

> **In short:** Write `test_*` functions with plain `assert` and run them with `pytest`.

```bash
uv add --dev pytest pytest-cov
```

```python
# app/pricing.py
def apply_discount(price: float, percent: float) -> float:
    if not 0 <= percent <= 100:
        raise ValueError("percent must be between 0 and 100")
    return round(price * (1 - percent / 100), 2)
```

```python
# tests/test_pricing.py
import pytest
from app.pricing import apply_discount

def test_apply_discount():
    assert apply_discount(100, 10) == 90

def test_invalid_percent_raises():
    with pytest.raises(ValueError, match="between 0 and 100"):
        apply_discount(100, 150)

def test_float_result():
    assert apply_discount(10, 33) == pytest.approx(6.7)
```

```bash
pytest                    # finds test_*.py files and test_* functions
pytest -v                 # verbose
pytest -k discount        # only tests whose name matches
pytest -x                 # stop at first failure
pytest --lf               # re-run last failures
pytest --cov=app --cov-report=term-missing   # coverage
```

Plain `assert` is all you need; pytest shows detailed diffs on failure.

## 2. Parametrize: one test, many cases

> **In short:** Run the same test with many input/expected-output pairs.

```python
@pytest.mark.parametrize(
    ("price", "percent", "expected"),
    [
        (100, 0, 100),
        (100, 50, 50),
        (100, 100, 0),
        (19.99, 15, 16.99),
    ],
)
def test_discounts(price, percent, expected):
    assert apply_discount(price, percent) == expected
```

## 3. Fixtures: reusable setup

> **In short:** Fixtures provide test data and resources, with setup and teardown, shared via `conftest.py`.

```python
# tests/conftest.py: fixtures here are available to every test file
import pytest

@pytest.fixture
def sample_user():
    return {"id": 1, "name": "Anoop", "email": "a@b.com"}

@pytest.fixture
def temp_db(tmp_path):                    # tmp_path: built-in fixture, a fresh temp folder
    db = Database(tmp_path / "test.db")
    db.create_tables()
    yield db                              # code after yield = teardown
    db.close()

def test_user_has_email(sample_user):     # request a fixture by naming it as a parameter
    assert "@" in sample_user["email"]
```

Scopes: `@pytest.fixture(scope="session")` creates it once for the whole run (e.g. a DB engine); default `"function"` creates it for every test.

Useful built-in fixtures: `tmp_path`, `monkeypatch`, `capsys` (captured output), `caplog` (captured logs).

## 4. Mocking

> **In short:** Replace slow or external dependencies with fakes; patch where the name is used.

Replace slow or external dependencies (HTTP APIs, email, time) in tests.

```python
# app/weather.py
import httpx

def get_temperature(city: str) -> float:
    r = httpx.get(f"https://api.example.com/weather/{city}", timeout=5)
    r.raise_for_status()
    return r.json()["temp"]
```

```python
from unittest.mock import patch, MagicMock

def test_get_temperature():
    fake = MagicMock()
    fake.json.return_value = {"temp": 31.5}
    with patch("app.weather.httpx.get", return_value=fake) as mock_get:   # patch where it's USED
        assert get_temperature("Kochi") == 31.5
        mock_get.assert_called_once()

def test_env(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")       # undone automatically after the test
    monkeypatch.setattr("app.weather.get_temperature", lambda c: 20.0)
```

⚠️ Patch the name **where it's looked up** (`app.weather.httpx.get`), not where it's defined. Libraries like `respx` (httpx) or `responses` (requests) mock HTTP more cleanly.

## 5. Testing async code

> **In short:** Run `async def` tests with pytest-asyncio or AnyIO's plugin.

```bash
uv add --dev pytest-asyncio     # or anyio's pytest plugin
```

```python
import pytest

@pytest.mark.asyncio
async def test_fetch_user():
    user = await fetch_user(1)
    assert user["id"] == 1
```

FastAPI testing (TestClient, overriding dependencies, a test database) is in [../02-FastAPI/09-testing.md](../02-FastAPI/09-testing.md).

## 6. What makes a good test

> **In short:** Independent, fast, behaviour-focused tests that cover edge cases.

- **Arrange, Act, Assert**: set up, do one thing, check the result.
- Test **behaviour**, not implementation details.
- Each test is **independent** (no shared state, any order).
- Fast: mock the network; use a real database only in integration tests.
- Name tests by what they check: `test_withdraw_more_than_balance_raises`.
- Test edge cases: empty input, zero, negative, None, very large values, invalid types.

| Test type | Scope | Speed |
| --- | --- | --- |
| Unit | One function/class, dependencies mocked | Very fast |
| Integration | Several parts together (API + real test DB) | Slower |
| End-to-end | The whole system as a user sees it | Slowest |

## 7. Configuration

> **In short:** Configure pytest and coverage in `pyproject.toml`, including markers and thresholds.

```toml
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-ra --strict-markers"
markers = ["slow: slow tests", "integration: needs database"]

[tool.coverage.run]
source = ["app"]
branch = true

[tool.coverage.report]
fail_under = 80
show_missing = true
```

Run only fast tests: `pytest -m "not slow"`.

## 8. Exercises

1. Write parametrized tests for a `slugify()` function, including edge cases.
2. Write a fixture that creates a temporary JSON file of users, and test a function that loads it.
3. Mock an HTTP call and test both success and a 500 error.
4. Reach 100% branch coverage on a small module and look at the coverage report.
