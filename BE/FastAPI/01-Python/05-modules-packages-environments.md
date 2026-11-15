# 05 · Modules, packages and environments

## 1. Modules

> **In short:** Each `.py` file is a module; `import` reuses its code, which runs once and is cached.

Every `.py` file is a **module**. Import it to reuse its code.

```python
# utils.py
PI = 3.14159

def area(r: float) -> float:
    return PI * r * r
```

```python
# main.py
import utils
utils.area(2)

from utils import area, PI
from utils import area as circle_area
import utils as u

from utils import *      # ⚠️ avoid: unclear where names come from
```

A module's code runs **once**, the first time it's imported; later imports reuse the cached module (`sys.modules`).

### `if __name__ == "__main__":`

> **In short:** Code under this check runs only when the file is executed directly, not when it's imported.

```python
# report.py
def build_report(): ...

if __name__ == "__main__":     # True only when run directly: python report.py
    build_report()             # not run when another file does `import report`
```

## 2. Packages

> **In short:** Folders of modules (with `__init__.py`); use absolute imports and run with `python -m`.

A **package** is a folder of modules. An `__init__.py` file marks it as a regular package (and runs when the package is imported).

```
app/
  __init__.py
  main.py
  models/
    __init__.py
    user.py
  services/
    __init__.py
    email.py
```

```python
# absolute imports (preferred)
from app.models.user import User
from app.services import email

# relative imports (inside the package only)
from .user import User          # same folder
from ..services.email import send
```

Run a module inside a package with `python -m app.main` (from the project root), so imports resolve correctly. ⚠️ `python app/main.py` changes the import root and often breaks absolute imports.

**Circular imports** (a imports b, b imports a) cause `ImportError` or half-initialized modules. Fix by moving shared code into a third module, or importing inside a function.

---

## 3. The standard library and third-party packages

> **In short:** Python ships with many built-in modules; extra packages come from PyPI.

Python ships with a large **standard library** (`os`, `pathlib`, `json`, `datetime`, `re`, `logging`, `asyncio`, `unittest`…). Third-party packages come from **PyPI** and are installed with `pip` or `uv`.

## 4. Virtual environments (always use one)

> **In short:** An isolated folder of packages per project, so dependency versions don't clash.

A **virtual environment** is an isolated folder with its own Python and packages, so each project has its own dependency versions.

```bash
python3 -m venv .venv               # create
source .venv/bin/activate           # activate (Linux/macOS)
.venv\Scripts\activate              # activate (Windows)
which python                        # now points into .venv
pip install fastapi
pip list
pip freeze > requirements.txt       # pin installed versions
pip install -r requirements.txt     # reproduce elsewhere
deactivate
```

Add `.venv/` to `.gitignore`. Never install project packages into the system Python.

## 5. Modern tooling: `pyproject.toml` and `uv`

> **In short:** `pyproject.toml` describes the project; `uv` manages Python versions, environments, dependencies and lock files.

**`pyproject.toml`** is the standard project file: metadata, dependencies and tool settings.

```toml
[project]
name = "task-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi[standard]>=0.115",
  "sqlalchemy>=2.0",
  "psycopg[binary]>=3.2",
]

[dependency-groups]
dev = ["pytest>=8", "ruff", "mypy"]

[tool.ruff]
line-length = 100

[tool.pytest.ini_options]
testpaths = ["tests"]
```

**uv** (by Astral) is a very fast all-in-one tool replacing pip, venv, pip-tools and pyenv:

```bash
uv init task-api && cd task-api      # new project with pyproject.toml
uv add fastapi sqlalchemy            # add dependencies (updates pyproject + uv.lock)
uv add --dev pytest ruff             # dev dependencies
uv sync                              # create .venv and install exactly what's locked
uv run python main.py                # run inside the project environment
uv run pytest
uv python install 3.12               # install a Python version
```

`uv.lock` (or `poetry.lock`, or a pinned `requirements.txt`) records **exact versions** of every package, including dependencies of dependencies, so every machine and the production server install the same thing. **Commit the lock file.**

Alternatives you'll meet: **Poetry**, **pip-tools** (`pip-compile`), **Pipenv**, **conda** (data science).

## 6. Code quality tools

> **In short:** Ruff (lint/format), mypy/pyright (types), pytest (tests) and pre-commit (run them automatically).

| Tool | Purpose | Command |
| --- | --- | --- |
| **Ruff** | Linter + formatter (replaces flake8, isort, black) | `ruff check . --fix`, `ruff format .` |
| **mypy** / **pyright** | Static type checking | `mypy app` |
| **pytest** | Testing | `pytest` |
| **pre-commit** | Run tools on every commit | `pre-commit install` |

## 7. Style: PEP 8 in brief

> **In short:** The standard Python style: naming, indentation, line length and import order.

- 4 spaces, no tabs; lines ≤ 88–100 characters.
- `snake_case` functions/variables, `PascalCase` classes, `UPPER_CASE` constants.
- Imports at the top: standard library, then third-party, then local, separated by blank lines.
- Two blank lines between top-level functions/classes.

Ruff's formatter applies most of this automatically.

---

## 8. Exercises

1. Create a package `shop/` with `models.py` and `pricing.py`; import between them with absolute imports and run with `python -m`.
2. Create a venv, install `requests`, freeze requirements, delete the venv, recreate it from the file.
3. Start a project with `uv init`, add `httpx`, and run a script that fetches a URL.
4. Configure Ruff in `pyproject.toml` and fix the issues it reports in your code.
