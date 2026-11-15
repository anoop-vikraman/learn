# 08 · Type hints

Type hints describe what types variables, parameters and return values should have. **Python ignores them at runtime**: they're for your editor, static checkers (mypy, pyright) and libraries like **FastAPI and Pydantic, which read them to validate data**. That's why they matter so much for FastAPI.

## 1. Basics

> **In short:** Annotate variables, parameters and return values; Python itself ignores them at runtime.

```python
name: str = "Anoop"
age: int = 25
price: float = 9.99          # an int is also accepted where float is expected
active: bool = True

def greet(name: str, excited: bool = False) -> str:
    return f"Hello {name}{'!' if excited else '.'}"

def log(msg: str) -> None:   # returns nothing
    print(msg)
```

## 2. Collections (built-in generics, Python 3.9+)

> **In short:** Type the contents of collections (`list[int]`, `dict[str, int]`) and use abstract types for parameters.

```python
ids: list[int] = [1, 2, 3]
point: tuple[float, float] = (1.0, 2.0)
values: tuple[int, ...] = (1, 2, 3)        # any length
scores: dict[str, int] = {"a": 90}
tags: set[str] = {"py"}

from collections.abc import Iterable, Sequence, Mapping, Callable, Iterator

def total(nums: Iterable[float]) -> float:          # accept any iterable (more flexible than list)
    return sum(nums)

def apply(fn: Callable[[int, int], int], a: int, b: int) -> int:
    return fn(a, b)

def count_up() -> Iterator[int]:                     # generators
    yield 1
```

**Tip:** accept general types (`Iterable`, `Sequence`, `Mapping`), return specific types (`list`, `dict`).

## 3. Optional and unions

> **In short:** `X | None` means the value may be None; `A | B` allows either type.

```python
def find_user(user_id: int) -> User | None:     # may return None (Python 3.10+ syntax)
    ...

def parse(value: str | int) -> int: ...

from typing import Optional, Union              # older equivalents
Optional[User]          # == User | None
Union[str, int]         # == str | int

user = find_user(1)
user.name               # ⚠️ checker error: user might be None
if user is not None:
    user.name           # ✅ narrowed
```

⚠️ `Optional[X]` means "X or None", **not** "optional parameter". A parameter is optional only if it has a default: `def f(x: int | None = None)`.

## 4. Literal, Final, type aliases

> **In short:** Restrict to exact values, mark constants, and name complex types.

```python
from typing import Literal, Final

Status = Literal["todo", "in_progress", "done"]
def set_status(s: Status) -> None: ...
set_status("finished")      # ❌ checker error

MAX_RETRIES: Final = 3      # constant: checker errors on reassignment

type UserId = int                         # type alias (Python 3.12 syntax)
type JSON = dict[str, "JSON"] | list["JSON"] | str | int | float | bool | None
```

## 5. TypedDict: typed dictionaries

> **In short:** Describe the keys and value types of plain dictionaries.

```python
from typing import TypedDict, NotRequired

class UserDict(TypedDict):
    id: int
    name: str
    email: NotRequired[str]

u: UserDict = {"id": 1, "name": "A"}
```

## 6. Generics

> **In short:** Type parameters that connect input and output types in reusable functions and classes.

```python
def first[T](items: Sequence[T]) -> T | None:      # Python 3.12 generic syntax
    return items[0] if items else None

first([1, 2])        # inferred int | None

class Repository[T]:
    def __init__(self) -> None:
        self._items: dict[int, T] = {}
    def get(self, id: int) -> T | None:
        return self._items.get(id)
    def add(self, id: int, item: T) -> None:
        self._items[id] = item

users = Repository[User]()

# Pre-3.12 equivalent
from typing import TypeVar, Generic
T = TypeVar("T")
class Repo(Generic[T]): ...
```

Bounded type variables: `def longest[T: Sized](a: T, b: T) -> T` (T must have `len`).

## 7. Protocol: structural typing ("duck typing" with types)

> **In short:** Accept any object with the right methods, without inheritance.

```python
from typing import Protocol

class Notifier(Protocol):
    def send(self, to: str, message: str) -> None: ...

class EmailNotifier:                  # doesn't inherit from Notifier
    def send(self, to: str, message: str) -> None:
        print("email", to, message)

def notify_all(n: Notifier, users: list[str]) -> None:
    for u in users:
        n.send(u, "hi")

notify_all(EmailNotifier(), ["a@b.com"])   # ✅ it has the right method
```

## 8. Other useful typing tools

> **In short:** `Any`, `cast`, `Self`, `TYPE_CHECKING`, `overload` and `Annotated` (used heavily by FastAPI).

```python
from typing import Any, cast, Self, TYPE_CHECKING, overload, Annotated

def f(x: Any) -> Any: ...             # opt out of checking (avoid; prefer object)
n = cast(int, value)                   # tell the checker the type (no runtime effect)

class Builder:
    def set(self, k: str) -> Self:     # returns the same class (works in subclasses)
        return self

if TYPE_CHECKING:                       # import only for type checking (avoids circular imports)
    from app.models import User

Price = Annotated[float, "metadata"]   # attach metadata to a type: FastAPI uses this heavily
```

`Annotated[type, extra]` is important in FastAPI: `Annotated[int, Query(gt=0)]`, `Annotated[Session, Depends(get_db)]`.

---

## 9. Static type checkers

> **In short:** mypy/pyright read your hints and report type errors before the code runs.

```bash
uv add --dev mypy        # or pyright (also used by VS Code's Pylance)
mypy app/
```

```toml
# pyproject.toml
[tool.mypy]
python_version = "3.12"
strict = true
plugins = ["pydantic.mypy"]
```

Add types gradually; start with public functions and data models. Run the checker in CI.

---

## 10. Pydantic: types that validate at runtime

> **In short:** Pydantic uses type hints to validate and convert incoming data; FastAPI is built on it.

Plain type hints don't check anything when the code runs. **Pydantic** uses them to **validate and convert** data, which is exactly what an API needs. FastAPI is built on it.

```python
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator, ValidationError

class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    email: EmailStr                          # needs: pip install "pydantic[email]"
    age: int = Field(ge=0, le=150)
    tags: list[str] = []                     # safe in Pydantic (copied per instance)
    created_at: datetime | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()

u = UserCreate(name=" Anoop ", email="a@b.com", age="25")   # "25" is converted to 25
u.name                       # 'Anoop'
u.model_dump()               # → dict
u.model_dump_json()          # → JSON string
UserCreate.model_validate({"name": "A", "email": "a@b.com", "age": 3})   # from a dict

try:
    UserCreate(name="", email="bad", age=-1)
except ValidationError as e:
    print(e.errors())        # list of every problem, with field locations
```

More Pydantic (settings, `from_attributes`, response models) is covered in the FastAPI lessons.

---

## 11. Exercises

1. Add full type hints to the functions you wrote in lessons 03–06 and run `mypy --strict`.
2. Write a generic `Stack[T]` class with `push`, `pop` and `peek`.
3. Define a `Storage` Protocol with `save(key, data)` / `load(key)` and two implementations (memory, file).
4. Create a Pydantic `Product` model with validation (price > 0, name stripped, optional tags) and test invalid input.
