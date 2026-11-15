# 07 · Advanced Python

## 1. Iterables and iterators

> **In short:** Iterables can be looped over; iterators produce values one at a time and are single-use.

- An **iterable** is anything you can loop over (list, str, dict, file, range). It has `__iter__`.
- An **iterator** produces values one at a time with `next()`, and raises `StopIteration` when done.

```python
nums = [1, 2, 3]
it = iter(nums)
next(it)    # 1
next(it)    # 2
next(it)    # 3
next(it)    # ❌ StopIteration
```

`for` loops call `iter()` and `next()` for you. ⚠️ Iterators are **single-use**: once exhausted, they stay empty (e.g. `map`, `zip`, generators, file objects).

## 2. Generators

> **In short:** Functions with `yield` produce values lazily, saving memory for large or infinite sequences.

A function with `yield` returns a **generator**: a lazy iterator that computes values only when asked. It pauses at each `yield` and resumes from there.

```python
def countdown(n: int):
    while n > 0:
        yield n
        n -= 1

for x in countdown(3):
    print(x)        # 3, 2, 1

def read_large_file(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            yield line.strip()          # one line in memory at a time

def batched(items, size):
    batch = []
    for item in items:
        batch.append(item)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch
# (Python 3.12 has itertools.batched built in)

squares = (n * n for n in range(10**9))    # generator expression: no huge list
next(squares)
```

`yield from other_generator` delegates to another generator. Generators are ideal for **pipelines** over big data, streaming responses and pagination.

---

## 3. Decorators

> **In short:** Functions that wrap other functions to add behaviour (timing, logging, retries).

A **decorator** is a function that takes a function and returns a new function that adds behaviour. `@decorator` above a `def` is shorthand for `func = decorator(func)`.

```python
import functools
import time

def timer(func):
    @functools.wraps(func)                 # keep the original name/docstring
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        print(f"{func.__name__} took {time.perf_counter() - start:.3f}s")
        return result
    return wrapper

@timer
def slow_add(a, b):
    time.sleep(0.5)
    return a + b

slow_add(1, 2)   # prints the time, returns 3
```

### Decorators with arguments (one more level)

> **In short:** A decorator factory takes options and returns the actual decorator.

```python
def retry(times: int = 3, exceptions=(Exception,)):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions:
                    if attempt == times:
                        raise
                    time.sleep(2 ** attempt)     # exponential backoff
        return wrapper
    return decorator

@retry(times=5, exceptions=(ConnectionError,))
def call_api(): ...
```

Decorators you'll see everywhere: `@property`, `@staticmethod`, `@classmethod`, `@dataclass`, `@functools.cache`, and in FastAPI: `@app.get("/")`.

---

## 4. Context managers (`with`)

> **In short:** Guarantee setup and cleanup code runs, via `__enter__`/`__exit__` or `@contextmanager`.

They guarantee setup and cleanup code runs, even on errors: files, locks, DB transactions, timers.

```python
# Class-based
class Timer:
    def __enter__(self):
        self.start = time.perf_counter()
        return self                       # value bound by `as`
    def __exit__(self, exc_type, exc, tb):
        self.elapsed = time.perf_counter() - self.start
        return False                      # False = don't swallow exceptions

with Timer() as t:
    do_work()
print(t.elapsed)

# Generator-based (simpler)
from contextlib import contextmanager

@contextmanager
def transaction(conn):
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise

with transaction(conn) as c:
    c.execute("...")
```

Other helpers: `contextlib.suppress(FileNotFoundError)`, `ExitStack`, and async versions (`async with`, `@asynccontextmanager`, used by FastAPI's lifespan).

---

## 5. `functools` and `itertools`

> **In short:** Built-in tools for caching, partial functions and efficient iteration patterns.

```python
from functools import cache, lru_cache, partial, reduce

@cache                                   # memoize (unbounded); lru_cache(maxsize=128) for bounded
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)

int_from_binary = partial(int, base=2)   # pre-fill arguments
int_from_binary("101")                   # 5

reduce(lambda acc, x: acc * x, [1, 2, 3, 4], 1)   # 24
```

```python
import itertools as it

list(it.chain([1, 2], [3]))                    # [1, 2, 3]
list(it.islice(it.count(10), 3))               # [10, 11, 12]
list(it.product("ab", [1, 2]))                 # [('a',1), ('a',2), ('b',1), ('b',2)]
list(it.combinations([1, 2, 3], 2))            # [(1,2), (1,3), (2,3)]
list(it.permutations("ab"))
for key, group in it.groupby(sorted(words, key=len), key=len): ...   # ⚠️ input must be sorted by key
list(it.accumulate([1, 2, 3]))                 # [1, 3, 6]
list(it.pairwise([1, 2, 3]))                   # [(1,2), (2,3)]
```

⚠️ `@cache` on methods keeps `self` alive forever (memory leak); use `functools.cached_property` for per-instance caching.

---

## 6. Unpacking, walrus and other syntax

> **In short:** Star-unpacking, the `:=` operator and other compact syntax.

```python
first, *middle, last = [1, 2, 3, 4, 5]
a, (b, c) = 1, (2, 3)

if (n := len(items)) > 10:              # walrus: assign inside an expression
    print(f"{n} items is too many")

while (line := f.readline()):
    process(line)

def f(**kwargs): ...
f(**{"a": 1})

[*range(3), *"ab"]                      # [0, 1, 2, 'a', 'b']
{**a, **b}
```

---

## 7. The data model: how objects work

> **In short:** Everything is an object, names are references, and mutability decides what can change in place.

- **Everything is an object**: functions, classes, modules, integers.
- Names are **references**: assignment never copies.
- **Mutable** objects (list, dict, set, most classes) can change in place; **immutable** ones (int, str, tuple, frozenset) can't.
- Arguments are passed **by object reference**: a function can mutate a list you pass, but reassigning the parameter doesn't affect the caller.

```python
def add(lst):
    lst.append(1)      # caller sees this
    lst = [99]         # caller does NOT see this

a = 256; b = 256; a is b      # True (small ints are cached: implementation detail, don't rely on it)
```

### `__slots__`

> **In short:** Fixes a class's attributes to save memory and speed up attribute access.

```python
class Point:
    __slots__ = ("x", "y")      # no per-instance __dict__: less memory, faster attributes
    def __init__(self, x, y):
        self.x, self.y = x, y
```

### Descriptors and metaclasses (awareness)

> **In short:** The machinery behind properties, ORM fields and custom class creation.

`@property` is built on **descriptors** (objects with `__get__`/`__set__`), which is also how SQLAlchemy columns and Pydantic fields work. **Metaclasses** customize class creation (`class Meta(type)`): powerful but rarely needed in application code. `__init_subclass__` covers most use cases.

---

## 8. Performance tips

> **In short:** Profile first, then pick better data structures, built-ins, caching or more processes.

- Measure first: `python -m cProfile -s cumtime script.py`, `timeit`, or `py-spy`.
- Use the right structure: `set`/`dict` lookups are O(1), `list` search is O(n); `collections.deque` for queues.
- Built-ins and comprehensions are faster than manual loops.
- `"".join(parts)` instead of `+=` in loops for strings.
- Cache expensive pure functions (`@cache`).
- For CPU-heavy work: multiprocessing, NumPy, or moving hot code to a compiled extension.

---

## 9. Exercises

1. Write a generator that yields Fibonacci numbers forever; take the first 20 with `itertools.islice`.
2. Write a `@log_calls` decorator that logs arguments and return values.
3. Write a `@retry` decorator with arguments and exponential backoff; test it with a function that fails randomly.
4. Write a context manager `cd(path)` that changes directory and changes back on exit.
5. Process a large CSV lazily with a generator pipeline: read → parse → filter → batch of 100.
