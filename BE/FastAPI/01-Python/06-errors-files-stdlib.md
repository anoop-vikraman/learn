# 06 · Errors, files and the standard library

## 1. Exceptions

> **In short:** `try`/`except`/`else`/`finally` handle errors without crashing the program.

```python
try:
    value = int(input("Number: "))
    result = 10 / value
except ValueError:
    print("Not a number")
except ZeroDivisionError as e:
    print("Cannot divide by zero:", e)
except (TypeError, KeyError):          # several types
    print("Something else")
else:
    print("Runs only if no exception:", result)
finally:
    print("Always runs (cleanup)")
```

### Common built-in exceptions

> **In short:** The errors you'll see most often and what usually causes each one.

| Exception | When |
| --- | --- |
| `ValueError` | Right type, wrong value (`int("abc")`) |
| `TypeError` | Wrong type (`"a" + 1`) |
| `KeyError` | Missing dict key |
| `IndexError` | List index out of range |
| `AttributeError` | Object has no such attribute |
| `FileNotFoundError` | File missing (subclass of `OSError`) |
| `ZeroDivisionError` | Division by zero |
| `ImportError` / `ModuleNotFoundError` | Import failed |
| `NotImplementedError` | Method meant to be overridden |
| `StopIteration` | Iterator exhausted |
| `TimeoutError`, `ConnectionError` | I/O problems |

### Raising and custom exceptions

> **In short:** `raise` your own exception classes to signal specific problems clearly.

```python
class AppError(Exception):
    """Base class for this app's errors."""

class NotFoundError(AppError):
    def __init__(self, resource: str, id: int):
        super().__init__(f"{resource} {id} not found")
        self.resource = resource
        self.id = id

def get_task(task_id: int):
    if task_id not in db:
        raise NotFoundError("Task", task_id)
    return db[task_id]

try:
    get_task(42)
except NotFoundError as e:
    print(e, e.id)
```

### Rules

> **In short:** Catch specific exceptions, re-raise what you can't handle, and chain errors with `from`.

- **Catch specific exceptions.** ⚠️ A bare `except:` or `except Exception:` that does nothing hides bugs.
- **Re-raise** what you can't handle: `except SomeError: log(); raise`.
- **Chain** to keep the original cause: `raise AppError("save failed") from e`.
- **EAFP** ("easier to ask forgiveness than permission") is idiomatic: try the operation and catch the error, rather than checking everything first.
- Python 3.11+: `ExceptionGroup` and `except*` handle several errors at once (used with `asyncio.TaskGroup`).

---

## 2. Files

> **In short:** Open files with `with` so they're always closed; choose the right mode and encoding.

Always open files with `with`: the file is closed automatically, even if an error happens.

```python
with open("notes.txt", "w", encoding="utf-8") as f:      # write (creates/overwrites)
    f.write("first line\n")

with open("notes.txt", "a", encoding="utf-8") as f:      # append
    f.write("second line\n")

with open("notes.txt", encoding="utf-8") as f:           # read (default mode "r")
    content = f.read()                                   # whole file as a string

with open("notes.txt", encoding="utf-8") as f:
    for line in f:                                       # line by line (memory-efficient)
        print(line.rstrip("\n"))
```

Modes: `"r"` read, `"w"` write (truncate), `"a"` append, `"x"` create (fails if it exists), add `"b"` for binary (`"rb"`, `"wb"`). Always pass `encoding="utf-8"` for text.

### `pathlib`: modern paths

> **In short:** `Path` objects build, check, read and write file paths in an OS-independent way.

```python
from pathlib import Path

base = Path(__file__).parent            # folder of this file
data = base / "data" / "users.json"     # join with /
data.exists(); data.is_file(); data.suffix   # '.json'
data.parent.mkdir(parents=True, exist_ok=True)
data.write_text('{"a": 1}', encoding="utf-8")
text = data.read_text(encoding="utf-8")
for p in base.glob("*.py"): print(p.name)
Path.home(); Path.cwd()
```

---

## 3. JSON and CSV

> **In short:** `json` converts between Python objects and JSON text; `csv` reads and writes spreadsheet-style files.

```python
import json

data = {"name": "Anoop", "skills": ["python", "react"]}
text = json.dumps(data, indent=2)          # dict → str
obj = json.loads(text)                     # str → dict

with open("data.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)           # write to file
with open("data.json", encoding="utf-8") as f:
    obj = json.load(f)                     # read from file
```

⚠️ `json` can't serialize `datetime`, `Decimal`, sets or custom objects by default: convert them (`default=str`) or use Pydantic.

```python
import csv

with open("users.csv", newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):          # each row is a dict keyed by the header
        print(row["email"])

with open("out.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["name", "email"])
    writer.writeheader()
    writer.writerow({"name": "A", "email": "a@b.com"})
```

---

## 4. Dates and times

> **In short:** Use timezone-aware datetimes (UTC) with `datetime`, `timedelta` and `zoneinfo`.

```python
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo

now = datetime.now(timezone.utc)                  # ✅ timezone-aware UTC
local = now.astimezone(ZoneInfo("Asia/Kolkata"))
today = date.today()
tomorrow = today + timedelta(days=1)

now.isoformat()                                   # '2026-11-10T08:30:00+00:00'
datetime.fromisoformat("2026-11-10T08:30:00+00:00")
now.strftime("%d %b %Y %H:%M")                    # '10 Nov 2026 08:30'
datetime.strptime("10/11/2026", "%d/%m/%Y")       # parse a custom format

(datetime(2026, 12, 25) - datetime(2026, 11, 10)).days   # 45
```

⚠️ `datetime.now()` and `datetime.utcnow()` return **naive** datetimes (no timezone), a common source of bugs. Store and compare times in **UTC with tzinfo**; convert to local time only for display. (`utcnow()` is deprecated.)

---

## 5. Logging (use instead of print in real apps)

> **In short:** The `logging` module gives levels, formatting and per-module loggers.

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)      # one logger per module

logger.debug("details for debugging")    # hidden at INFO level
logger.info("user %s logged in", user_id) # ✅ lazy formatting with %s
logger.warning("disk almost full")
logger.error("payment failed")
try:
    1 / 0
except ZeroDivisionError:
    logger.exception("calculation failed")   # ERROR + full traceback
```

Levels: `DEBUG < INFO < WARNING < ERROR < CRITICAL`. Production logging (JSON format, levels per environment) is covered in [production.md](production.md).

---

## 6. Other standard-library modules worth knowing

> **In short:** A tour of handy built-in modules: `os`, `re`, `collections`, `secrets`, `subprocess` and more.

| Module | Use |
| --- | --- |
| `os`, `sys` | Environment variables (`os.environ.get("DB_URL")`), process info, `sys.argv` |
| `re` | Regular expressions: `re.search`, `re.findall`, `re.sub`, `re.compile` |
| `collections` | `Counter`, `defaultdict`, `deque` (fast queue), `namedtuple`, `OrderedDict` |
| `itertools`, `functools` | Iteration tools, caching, partial functions (lesson 07) |
| `math`, `statistics`, `random`, `decimal`, `fractions` | Numbers. Use `decimal.Decimal` for money |
| `secrets`, `hashlib`, `hmac`, `uuid` | Secure tokens (`secrets.token_urlsafe()`), hashes, UUIDs. ⚠️ `random` isn't secure |
| `subprocess` | Run other programs |
| `argparse` | Command-line interfaces (or the third-party `typer`) |
| `shutil` | Copy/move/delete folders |
| `tempfile` | Temporary files and folders |
| `time` | `time.perf_counter()` for measuring durations, `time.sleep` |
| `concurrent.futures`, `asyncio`, `threading` | Concurrency (lesson 09) |
| `sqlite3` | Built-in SQLite database |

```python
import re
re.findall(r"\d+", "order 12 has 3 items")         # ['12', '3']
re.sub(r"\s+", " ", "too    many   spaces")        # 'too many spaces'
m = re.match(r"(?P<user>\w+)@(?P<domain>[\w.]+)", "anoop@example.com")
m.group("domain")                                  # 'example.com'
```

---

## 7. Exercises

1. Read a CSV of products, compute the total price, and write the result to a JSON file.
2. Write `safe_divide(a, b)` raising a custom `DivisionError` chained from `ZeroDivisionError`.
3. List all `.py` files under a folder recursively with `Path.rglob` and print their line counts.
4. Parse a log file and count lines per level with `re` and `Counter`.
5. Convert `"2026-11-10 14:30"` (Asia/Kolkata) into an aware UTC datetime.
