# 03 · Functions

## 1. Defining and calling

> **In short:** Define with `def`, document with a docstring, and return a value (or None).

```python
def greet(name):
    """Return a greeting for name."""          # docstring: shown by help(greet)
    return f"Hello, {name}!"

greet("Anoop")        # 'Hello, Anoop!'

def log(msg):
    print(msg)        # no return → returns None
```

## 2. Parameters

> **In short:** Positional, keyword, default, `*args`, `**kwargs`, keyword-only and positional-only parameters.

```python
def connect(host, port=5432, *, timeout=10, ssl=True):
    ...

connect("localhost")                         # positional, defaults for the rest
connect("localhost", 6543)                   # positional
connect(host="db", port=5432)                # keyword arguments (any order)
connect("db", timeout=5)                     # after *, arguments are KEYWORD-ONLY
connect("db", 5432, 5)                       # ❌ TypeError: timeout must be passed by name
```

| Syntax | Meaning |
| --- | --- |
| `def f(a, b)` | positional-or-keyword |
| `def f(a, b=2)` | default value (⚠️ evaluated once: never use a mutable default) |
| `def f(*args)` | any number of extra positional args → tuple |
| `def f(**kwargs)` | any number of extra keyword args → dict |
| `def f(a, *, b)` | `b` is keyword-only |
| `def f(a, /, b)` | `a` is positional-only |

```python
def total(*numbers):
    return sum(numbers)
total(1, 2, 3)        # numbers = (1, 2, 3)

def build_user(name, **extra):
    return {"name": name, **extra}
build_user("A", age=25, city="Kochi")   # {'name': 'A', 'age': 25, 'city': 'Kochi'}

# Unpacking when calling
args = [1, 2, 3]
total(*args)
options = {"timeout": 5, "ssl": False}
connect("db", **options)
```

Typical order: `def f(positional, /, normal, *args, keyword_only, **kwargs)`.

---

## 3. Return values

> **In short:** `return` ends the function; return a tuple to send back several values.

```python
def divide(a, b):
    if b == 0:
        return None          # early return
    return a / b

def stats(nums):
    return min(nums), max(nums), sum(nums) / len(nums)   # tuple

lo, hi, avg = stats([1, 2, 3])
```

---

## 4. Scope (LEGB)

> **In short:** Names are looked up Local → Enclosing → Global → Built-in; `global`/`nonlocal` are needed to reassign outer names.

Python looks up names in this order: **L**ocal → **E**nclosing function → **G**lobal (module) → **B**uilt-in.

```python
count = 0                 # global

def increment():
    global count          # needed to ASSIGN to a global (avoid in real code)
    count += 1

def outer():
    total = 0
    def inner():
        nonlocal total    # needed to assign to the enclosing function's variable
        total += 1
    inner()
    return total
```

⚠️ Assigning to a name anywhere in a function makes it local to that function, which causes `UnboundLocalError` if you read it before assigning:

```python
x = 1
def f():
    print(x)   # ❌ UnboundLocalError: x is local because of the next line
    x = 2
```

Unlike JavaScript, `if`/`for` blocks **don't** create a new scope: a variable set inside a loop is visible after it.

---

## 5. Functions are objects

> **In short:** Functions can be stored, passed as arguments and returned, which is what makes closures possible.

```python
def shout(text):
    return text.upper()

say = shout              # assign
say("hi")                # 'HI'

def apply(fn, value):    # pass as an argument
    return fn(value)
apply(shout, "hey")

def multiplier(factor):  # return a function
    def multiply(n):
        return n * factor     # closure: remembers factor
    return multiply

double = multiplier(2)
double(5)                # 10
```

### Lambda: small anonymous functions

> **In short:** One-expression functions, mostly used as short `key=` arguments.

```python
square = lambda n: n * n            # single expression only
sorted(users, key=lambda u: u["age"])
```

Use lambdas for short `key=` functions; use `def` for anything else (better names and tracebacks).

### Closure loop gotcha (late binding)

> **In short:** Closures look up loop variables when called, not when created; bind the value with a default argument.

```python
funcs = [lambda: i for i in range(3)]
[f() for f in funcs]               # [2, 2, 2] ⚠️ i is looked up when called

funcs = [lambda i=i: i for i in range(3)]   # bind the current value as a default
[f() for f in funcs]               # [0, 1, 2]
```

---

## 6. Recursion

> **In short:** A function calling itself needs a base case; Python limits recursion depth, so prefer loops for deep work.

```python
def factorial(n: int) -> int:
    if n <= 1:                     # base case
        return 1
    return n * factorial(n - 1)
```

Python's default recursion limit is about 1000 calls (`RecursionError` beyond that) and it has no tail-call optimization. Prefer loops for deep recursion.

---

## 7. Useful built-in functions

> **In short:** The everyday built-ins: maths, sorting, iteration helpers, type checks and introspection.

| Function | Does |
| --- | --- |
| `len`, `min`, `max`, `sum`, `abs`, `round(x, n)` | Basics. ⚠️ `round(2.5)` → 2 (rounds half to even) |
| `sorted(iterable, key=, reverse=)` | New sorted list |
| `enumerate`, `zip`, `range`, `reversed` | Looping helpers |
| `map(fn, it)`, `filter(fn, it)` | Lazy iterators (wrap in `list()` to see them) |
| `any`, `all` | Boolean tests |
| `isinstance(x, (int, float))` | Type check (accepts a tuple of types) |
| `getattr(obj, "name", default)`, `hasattr`, `setattr` | Dynamic attribute access |
| `dir(x)`, `help(x)`, `type(x)`, `id(x)` | Inspecting objects |
| `open`, `print`, `input` | I/O |
| `divmod(a, b)` | `(a // b, a % b)` |

---

## 8. Writing good functions

> **In short:** Keep them small, named with verbs, returning values, with keyword-only options and type hints.

- Do **one thing**; name it with a verb (`calculate_total`, `send_email`).
- Prefer returning values over printing or changing globals.
- Avoid mutating arguments unless that's the function's clear purpose.
- Use keyword-only arguments (`*`) for flags and options: `send(email, *, urgent=False)`.
- Add type hints and a docstring for anything public (lesson 08).

---

## 9. Exercises

1. Write `average(*nums)` that returns `None` for no arguments.
2. Write `make_counter()` that returns a function; each call returns the next number (use `nonlocal`).
3. Write `format_name(first, last, *, upper=False)`.
4. Write a recursive `flatten(nested)` for arbitrarily nested lists.
5. Sort a list of dicts by two keys using a `lambda`.
