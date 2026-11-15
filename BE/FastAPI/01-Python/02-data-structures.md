# 02 · Data structures

| Type | Literal | Ordered | Mutable | Duplicates | Use for |
| --- | --- | --- | --- | --- | --- |
| `list` | `[1, 2]` | ✅ | ✅ | ✅ | Sequences that change |
| `tuple` | `(1, 2)` | ✅ | ❌ | ✅ | Fixed records, dict keys, returning several values |
| `dict` | `{"a": 1}` | ✅ (insertion order) | ✅ | Keys unique | Key → value lookups |
| `set` | `{1, 2}` | ❌ | ✅ | ❌ | Uniqueness, fast membership tests |
| `frozenset` | `frozenset({1})` | ❌ | ❌ | ❌ | Immutable sets (dict keys) |

---

## 1. Lists

> **In short:** Ordered, changeable sequences: add, remove, index and combine items.

```python
nums = [3, 1, 2]
empty = []

nums[0]          # 3
nums[-1]         # 2
len(nums)        # 3

nums.append(4)           # add to end           → [3, 1, 2, 4]
nums.insert(0, 10)       # insert at index      → [10, 3, 1, 2, 4]
nums.extend([5, 6])      # add many
nums.remove(10)          # remove first matching VALUE (ValueError if missing)
last = nums.pop()        # remove + return last (or nums.pop(i))
del nums[0]              # delete by index
nums.index(2)            # position of value (ValueError if missing)
nums.count(2)
nums.clear()

# Combining
[1, 2] + [3]             # [1, 2, 3]
[0] * 3                  # [0, 0, 0]
```

### Slicing: `list[start:stop:step]`

> **In short:** Take parts of a sequence by position; the stop index is excluded and slicing never raises errors.

```python
x = [0, 1, 2, 3, 4, 5]
x[1:4]     # [1, 2, 3]   stop excluded
x[:3]      # [0, 1, 2]
x[3:]      # [3, 4, 5]
x[-2:]     # [4, 5]
x[::2]     # [0, 2, 4]
x[::-1]    # reversed copy
x[:]       # shallow copy
x[1:3] = ["a", "b"]   # replace a slice
```

Slicing never raises `IndexError`: `x[10:20]` → `[]`.

### Sorting

> **In short:** `list.sort()` sorts in place and returns None; `sorted()` returns a new list; `key=` controls the order.

```python
nums = [3, 1, 2]
nums.sort()                      # in place, returns None ⚠️
nums.sort(reverse=True)
new = sorted(nums)               # returns a NEW list; works on any iterable

users = [{"name": "B", "age": 30}, {"name": "A", "age": 25}]
sorted(users, key=lambda u: u["age"])
sorted(users, key=lambda u: (u["age"], u["name"]))    # tie-breaker
sorted(words, key=str.lower)                           # case-insensitive
```

⚠️ `nums = nums.sort()` sets `nums` to `None`.

---

## 2. Tuples

> **In short:** Ordered, unchangeable sequences, used for fixed records and returning several values.

```python
point = (3, 4)
single = (5,)            # ⚠️ the comma makes a tuple; (5) is just 5
x, y = point             # unpacking
first, *rest = (1, 2, 3, 4)   # first=1, rest=[2, 3, 4]

def min_max(values):
    return min(values), max(values)   # returns a tuple

lo, hi = min_max([4, 1, 9])
```

### Named tuples: tuples with field names

> **In short:** Tuples whose items can also be read by name (`p.x`), which makes them more readable.

```python
from typing import NamedTuple

class Point(NamedTuple):
    x: float
    y: float

p = Point(1.0, 2.0)
p.x            # 1.0
```

---

## 3. Dictionaries

> **In short:** Key → value maps with fast lookup; use `.get()` for safe access and `.items()` to loop.

```python
user = {"name": "Anoop", "age": 25}

user["name"]                 # 'Anoop'
user["email"]                # ❌ KeyError
user.get("email")            # None
user.get("email", "n/a")     # default

user["email"] = "a@b.com"    # add/update
user.update({"age": 26, "city": "Kochi"})
del user["city"]
age = user.pop("age")        # remove + return (KeyError if missing, unless default given)
user.setdefault("tags", []).append("dev")   # get or create

"name" in user               # True (checks KEYS)

for key in user: ...
for value in user.values(): ...
for key, value in user.items(): ...

merged = {**defaults, **overrides}    # merge (later wins)
merged = defaults | overrides         # Python 3.9+
```

Keys must be **hashable** (immutable): str, int, tuple, frozenset; not lists or dicts.

### Handy dict types from `collections`

> **In short:** `defaultdict` creates missing keys automatically; `Counter` counts things.

```python
from collections import defaultdict, Counter

groups = defaultdict(list)            # missing keys get a default value
for word in ["apple", "avocado", "banana"]:
    groups[word[0]].append(word)      # {'a': ['apple', 'avocado'], 'b': ['banana']}

counts = Counter("mississippi")       # Counter({'i': 4, 's': 4, 'p': 2, 'm': 1})
counts.most_common(2)                 # [('i', 4), ('s', 4)]
```

---

## 4. Sets

> **In short:** Unordered collections of unique items with fast membership tests and set maths (union, intersection).

```python
tags = {"python", "fastapi", "python"}   # {'python', 'fastapi'}
empty = set()                            # ⚠️ {} is an empty DICT

tags.add("sql")
tags.discard("java")      # no error if missing (remove() raises KeyError)
"sql" in tags             # O(1) fast lookup

a, b = {1, 2, 3}, {2, 3, 4}
a | b      # union        {1, 2, 3, 4}
a & b      # intersection {2, 3}
a - b      # difference   {1}
a ^ b      # symmetric difference {1, 4}

unique = list(set([3, 1, 3, 2]))   # remove duplicates (order not kept)
unique_ordered = list(dict.fromkeys([3, 1, 3, 2]))   # [3, 1, 2] keeps order
```

---

## 5. Comprehensions

> **In short:** One-line syntax to build lists, dicts and sets from other iterables, with optional filters.

A compact way to build lists, dicts and sets from other iterables.

```python
squares = [n * n for n in range(5)]                    # [0, 1, 4, 9, 16]
evens = [n for n in range(10) if n % 2 == 0]           # with a filter
labels = ["even" if n % 2 == 0 else "odd" for n in range(4)]   # if/else goes BEFORE for

pairs = [(x, y) for x in range(2) for y in range(2)]   # nested loops

name_lengths = {name: len(name) for name in ["Ann", "Bob"]}   # dict comprehension
unique_lengths = {len(w) for w in ["a", "bb", "cc"]}          # set comprehension

total = sum(n * n for n in range(1_000_000))   # generator expression: no list built in memory
```

Keep comprehensions readable; if it needs more than one condition or a nested loop plus logic, use a normal `for` loop.

---

## 6. Copying and mutability

> **In short:** Assignment shares the same object; copies are shallow unless you use `deepcopy`.

```python
a = [1, 2, 3]
b = a            # same list, two names
b.append(4)
a                # [1, 2, 3, 4] ⚠️

c = a.copy()     # shallow copy (also list(a), a[:])

nested = [[1, 2], [3, 4]]
shallow = nested.copy()
shallow[0].append(99)
nested           # [[1, 2, 99], [3, 4]] ⚠️ inner lists shared

import copy
deep = copy.deepcopy(nested)   # fully independent
```

### The mutable default argument trap

> **In short:** A default like `items=[]` is created once and shared between calls; use `None` instead.

```python
def add_item(item, items=[]):      # ⚠️ the same list is reused on every call
    items.append(item)
    return items

add_item(1)   # [1]
add_item(2)   # [1, 2]  ← surprise

def add_item(item, items=None):    # ✅
    if items is None:
        items = []
    items.append(item)
    return items
```

---

## 7. Useful built-ins for collections

> **In short:** `len`, `sum`, `min`/`max`, `any`/`all`, `enumerate`, `zip`, `map`, `filter` and friends.

```python
len(x), min(x), max(x), sum(x)
sorted(x), reversed(x)
any(n > 10 for n in nums)      # True if at least one
all(n > 0 for n in nums)       # True if all (True for empty)
enumerate(x, start=0)
zip(a, b)                      # stops at the shortest; zip(a, b, strict=True) raises if lengths differ
list(map(str.upper, words))
list(filter(None, values))     # remove falsy values
max(users, key=lambda u: u["age"])
```

---

## 8. Exercises

1. Remove duplicates from a list while keeping the original order.
2. Count word frequencies in a paragraph with `Counter` and print the top 3.
3. Group a list of `{"name", "dept"}` dicts by department with `defaultdict`.
4. Given two lists of user IDs, find the IDs in both, in only the first, and in either.
5. Flatten `[[1, 2], [3], [4, 5]]` with a comprehension.
6. Sort a list of tuples `(name, score)` by score descending, then name ascending.
