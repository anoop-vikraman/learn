# 04 · Object-oriented programming

## 1. Classes and instances

> **In short:** A class is a blueprint; `__init__` sets up each instance; methods receive `self`.

```python
class User:
    platform = "TaskApp"                 # class attribute: shared by all instances

    def __init__(self, name: str, email: str):   # constructor (initializer)
        self.name = name                 # instance attributes
        self.email = email
        self.active = True

    def deactivate(self) -> None:        # method: first parameter is always self
        self.active = False

    def __repr__(self) -> str:           # developer-friendly representation
        return f"User(name={self.name!r}, email={self.email!r})"

u = User("Anoop", "a@b.com")             # no `new` keyword
u.name                                   # 'Anoop'
u.deactivate()
u                                        # User(name='Anoop', email='a@b.com')
```

- `self` is the instance, passed automatically: `u.deactivate()` is `User.deactivate(u)`.
- ⚠️ A **mutable class attribute** (e.g. `tags = []` at class level) is shared by every instance. Create mutable attributes in `__init__`.

## 2. Encapsulation by convention

> **In short:** Python has no `private`; a leading `_` means internal, and `__` triggers name mangling.

Python has no `private` keyword:

```python
class Account:
    def __init__(self, balance: float):
        self._balance = balance      # _single underscore: "internal, please don't touch"
        self.__pin = "1234"          # __double: name-mangled to _Account__pin (avoid clashes in subclasses)
```

## 3. Properties: computed or validated attributes

> **In short:** `@property` lets you validate or compute values while keeping simple attribute syntax.

```python
class Product:
    def __init__(self, name: str, price: float):
        self.name = name
        self.price = price            # goes through the setter below

    @property
    def price(self) -> float:
        return self._price

    @price.setter
    def price(self, value: float) -> None:
        if value < 0:
            raise ValueError("price must be non-negative")
        self._price = value

    @property
    def price_with_tax(self) -> float:   # read-only computed attribute
        return round(self._price * 1.18, 2)

p = Product("Pen", 10)
p.price_with_tax        # 11.8 (no parentheses)
p.price = -1            # ❌ ValueError
```

## 4. Class methods and static methods

> **In short:** `@classmethod` receives the class (alternative constructors); `@staticmethod` is a plain helper.

```python
class User:
    def __init__(self, name, email):
        self.name, self.email = name, email

    @classmethod
    def from_dict(cls, data: dict) -> "User":     # alternative constructor; cls = the class
        return cls(data["name"], data["email"])

    @staticmethod
    def is_valid_email(email: str) -> bool:       # utility: no self or cls
        return "@" in email

User.from_dict({"name": "A", "email": "a@b.com"})
User.is_valid_email("x")
```

---

## 5. Inheritance

> **In short:** Subclasses reuse and override parent behaviour; `super()` calls the parent; prefer composition for big hierarchies.

```python
class Animal:
    def __init__(self, name: str):
        self.name = name

    def speak(self) -> str:
        return "..."

class Dog(Animal):
    def __init__(self, name: str, breed: str):
        super().__init__(name)          # call the parent initializer
        self.breed = breed

    def speak(self) -> str:             # override
        return f"{self.name}: Woof"

d = Dog("Rex", "Lab")
isinstance(d, Animal)    # True
issubclass(Dog, Animal)  # True
```

Python supports **multiple inheritance** (`class C(A, B)`); the method lookup order (MRO) is shown by `C.__mro__`. Use it mainly for small **mixins** (`class TimestampMixin:`), and prefer **composition** (an object holding other objects) over deep inheritance trees.

## 6. Abstract base classes

> **In short:** `ABC` + `@abstractmethod` define an interface that subclasses must implement.

```python
from abc import ABC, abstractmethod

class Notifier(ABC):
    @abstractmethod
    def send(self, to: str, message: str) -> None: ...

class EmailNotifier(Notifier):
    def send(self, to: str, message: str) -> None:
        print(f"Email to {to}: {message}")

Notifier()           # ❌ TypeError: can't instantiate abstract class
EmailNotifier().send("a@b.com", "hi")
```

---

## 7. Dunder (magic) methods

> **In short:** Special `__methods__` make your objects work with `print`, `==`, `+`, `len`, `in`, `with` and more.

Special methods with double underscores let your objects work with Python syntax.

| Method | Enables |
| --- | --- |
| `__init__` | Construction |
| `__repr__` | `repr(obj)`, shown in the REPL/debugger. Should look like code |
| `__str__` | `str(obj)`, `print(obj)`. Human-friendly (falls back to `__repr__`) |
| `__eq__`, `__lt__`, … | `==`, `<` (use `functools.total_ordering` to fill in the rest) |
| `__hash__` | Use in sets/dict keys (⚠️ defining `__eq__` sets `__hash__` to None unless you define it) |
| `__len__`, `__getitem__`, `__contains__`, `__iter__` | `len()`, `obj[i]`, `in`, `for` loops |
| `__add__`, `__mul__`… | `+`, `*` |
| `__call__` | `obj()` |
| `__enter__` / `__exit__` | `with obj:` (lesson 07) |
| `__bool__` | Truthiness |

```python
class Money:
    def __init__(self, paise: int):
        self.paise = paise

    def __add__(self, other: "Money") -> "Money":
        return Money(self.paise + other.paise)

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Money) and self.paise == other.paise

    def __repr__(self) -> str:
        return f"Money({self.paise})"

    def __str__(self) -> str:
        return f"₹{self.paise / 100:.2f}"

print(Money(150) + Money(250))   # ₹4.00
```

---

## 8. Dataclasses: classes for holding data

> **In short:** `@dataclass` generates `__init__`, `__repr__` and `__eq__` for data-holding classes.

`@dataclass` generates `__init__`, `__repr__` and `__eq__` from type-annotated fields.

```python
from dataclasses import dataclass, field, asdict

@dataclass
class Task:
    title: str
    priority: int = 3
    tags: list[str] = field(default_factory=list)   # ✅ mutable default done right
    done: bool = False

    def complete(self) -> None:
        self.done = True

t = Task("Write docs", tags=["docs"])
t                    # Task(title='Write docs', priority=3, tags=['docs'], done=False)
asdict(t)            # dict

@dataclass(frozen=True, slots=True)   # immutable (hashable) and memory-efficient
class Point:
    x: float
    y: float
```

Other options: `order=True` (comparison operators), `kw_only=True`, and `__post_init__` for validation.

**Dataclass vs Pydantic model:** dataclasses don't validate types. Use **Pydantic** (FastAPI's models) when data comes from outside and must be validated/parsed.

### Enums

> **In short:** A fixed set of named constants; `StrEnum` values behave like strings.

```python
from enum import Enum, StrEnum, auto

class Status(StrEnum):           # values are strings (Python 3.11+)
    TODO = "todo"
    DONE = "done"

Status.TODO == "todo"            # True
Status("done")                   # Status.DONE
[s.value for s in Status]        # ['todo', 'done']
```

---

## 9. Duck typing

> **In short:** Python cares about what an object can do, not its class.

Python cares about **what an object can do**, not its class: "if it walks like a duck…". Any object with a `.read()` method can be used where a file is expected. Type hints can express this with `Protocol` (lesson 08).

---

## 10. Exercises

1. Write a `BankAccount` class with deposit/withdraw (raise on overdraft), a read-only `balance` property and `__repr__`.
2. Subclass it as `SavingsAccount` with `add_interest(rate)`.
3. Make a `Notifier` ABC with `EmailNotifier` and `SmsNotifier`, and a function that sends using any notifier.
4. Convert a plain class with `__init__`/`__repr__`/`__eq__` into a `@dataclass`.
5. Create a `Vector` class supporting `+`, `*` (by a number), `==`, `abs()` and `repr`.
