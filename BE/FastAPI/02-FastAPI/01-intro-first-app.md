# 01 · Introduction and first app

## 1. What is an API?

> **In short:** A web API receives HTTP requests and returns (usually JSON) responses that frontends and other programs use.

An **API** (Application Programming Interface) lets programs talk to each other. A **web API** (often **REST** or **HTTP** API) receives **HTTP requests** and returns **responses**, usually in JSON. Your React frontend calls it to read and change data.

```
React app  ──  GET /tasks?done=false  ──▶  FastAPI  ──▶  PostgreSQL
           ◀──  200 OK  [{"id": 1, ...}] ──
```

### HTTP in one page

> **In short:** Methods, paths, query strings, headers, bodies and status codes: the parts of every request and response.

| Part | Example | Meaning |
| --- | --- | --- |
| Method | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` | What to do |
| Path | `/tasks/42` | Which resource |
| Query string | `?done=false&page=2` | Filters/options |
| Headers | `Authorization: Bearer …`, `Content-Type: application/json` | Metadata |
| Body | `{"title": "Write docs"}` | Data sent (POST/PUT/PATCH) |
| Status code | `200`, `201`, `404` | Result of the request |

| Method | Use | Idempotent* |
| --- | --- | --- |
| `GET` | Read | ✅ |
| `POST` | Create / actions | ❌ |
| `PUT` | Replace a whole resource | ✅ |
| `PATCH` | Update part of a resource | Usually not |
| `DELETE` | Delete | ✅ |

*Idempotent: repeating the same request has the same effect as doing it once.

| Status | Meaning |
| --- | --- |
| `200 OK`, `201 Created`, `204 No Content` | Success |
| `301/302/307/308` | Redirects |
| `400 Bad Request`, `401 Unauthorized` (not logged in), `403 Forbidden` (not allowed), `404 Not Found`, `409 Conflict`, `422 Unprocessable Content` (validation failed), `429 Too Many Requests` | Client errors |
| `500 Internal Server Error`, `502 Bad Gateway`, `503 Service Unavailable`, `504 Gateway Timeout` | Server errors |

### REST resource design

> **In short:** Model URLs as plural nouns (`/tasks/{id}`) and use HTTP methods for the action.

```
GET    /tasks           list tasks
POST   /tasks           create a task
GET    /tasks/{id}      get one task
PATCH  /tasks/{id}      update part of a task
DELETE /tasks/{id}      delete a task
GET    /projects/{id}/tasks   tasks of one project
```

Use plural nouns, not verbs (`/tasks`, not `/getTasks`).

---

## 2. Why FastAPI?

> **In short:** Type hints give you validation, serialization and interactive docs automatically, with high performance.

- **Fast to write**: type hints define validation, conversion and docs at once.
- **Fast to run**: async support, one of the fastest Python frameworks.
- **Automatic docs**: Swagger UI and ReDoc generated from your code (OpenAPI).
- **Editor support**: autocomplete everywhere thanks to types.
- **Standards-based**: OpenAPI, JSON Schema, OAuth2.

---

## 3. Installing

> **In short:** Install `fastapi[standard]`, which includes Uvicorn and the `fastapi` CLI.

```bash
mkdir task-api && cd task-api
uv init && uv add "fastapi[standard]"        # includes uvicorn, httpx, pydantic extras, the fastapi CLI
# or: python -m venv .venv && source .venv/bin/activate && pip install "fastapi[standard]"
```

## 4. First app

> **In short:** Create `FastAPI()`, add path operations with decorators, and run with `fastapi dev`.

```python
# main.py
from fastapi import FastAPI

app = FastAPI(title="Task API", version="0.1.0")

@app.get("/")
def root():
    return {"message": "Hello, FastAPI"}

@app.get("/health")
def health():
    return {"status": "ok"}
```

```bash
fastapi dev main.py          # development server with auto-reload on http://127.0.0.1:8000
# equivalent: uvicorn main:app --reload
```

- `app = FastAPI()` creates the application.
- `@app.get("/")` is a **path operation decorator**: "when a GET request arrives at `/`, call this function".
- The function is the **path operation function** (endpoint). Whatever it returns (dict, list, Pydantic model) is converted to JSON.

### The automatic docs

> **In short:** Swagger UI (`/docs`), ReDoc (`/redoc`) and the OpenAPI schema are generated from your code.

- **http://127.0.0.1:8000/docs**: Swagger UI. Try every endpoint in the browser.
- **http://127.0.0.1:8000/redoc**: ReDoc.
- **http://127.0.0.1:8000/openapi.json**: the raw OpenAPI schema (used to generate typed frontend clients, e.g. with `openapi-typescript`).

---

## 5. Adding a few endpoints (in-memory)

> **In short:** A small CRUD API using path/query parameters, a Pydantic body and `HTTPException`.

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

class TaskCreate(BaseModel):
    title: str
    done: bool = False

class Task(TaskCreate):
    id: int

tasks: dict[int, Task] = {}
next_id = 1

@app.get("/tasks")
def list_tasks(done: bool | None = None) -> list[Task]:         # query parameter ?done=true
    items = list(tasks.values())
    return [t for t in items if done is None or t.done == done]

@app.get("/tasks/{task_id}")
def get_task(task_id: int) -> Task:                               # path parameter, converted to int
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]

@app.post("/tasks", status_code=201)
def create_task(payload: TaskCreate) -> Task:                     # JSON body validated by Pydantic
    global next_id
    task = Task(id=next_id, **payload.model_dump())
    tasks[next_id] = task
    next_id += 1
    return task

@app.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int) -> None:
    if tasks.pop(task_id, None) is None:
        raise HTTPException(status_code=404, detail="Task not found")
```

Try it:

```bash
curl -X POST localhost:8000/tasks -H "Content-Type: application/json" -d '{"title": "Learn FastAPI"}'
curl localhost:8000/tasks
curl localhost:8000/tasks/abc        # 422: task_id must be an integer
```

Notice what FastAPI did for you: converted `task_id` to `int`, validated the JSON body, returned a clear **422** error for bad input, and documented everything at `/docs`.

---

## 6. How a request flows

> **In short:** Server → middleware → routing → dependencies → validation → your function → response model → JSON.

```
HTTP request
  → Uvicorn (ASGI server) parses it
  → middleware (CORS, logging…)
  → router finds the matching path operation
  → dependencies run (DB session, current user…)
  → parameters are parsed and validated (path, query, body, headers)
  → your function runs
  → return value is validated/filtered by the response model and serialized to JSON
  → response goes back through middleware
```

## 7. ASGI, Uvicorn and Starlette

> **In short:** The standard interface, the server and the toolkit that FastAPI is built on.

- **ASGI** (Asynchronous Server Gateway Interface) is the standard between Python async web apps and servers (the async successor to WSGI, used by Flask/Django).
- **Uvicorn** is an ASGI server: it handles sockets and HTTP and calls your app.
- **Starlette** is the lightweight ASGI toolkit FastAPI is built on (routing, requests, responses, middleware, WebSockets).

---

## 8. Exercises

1. Create the in-memory task API above and test every endpoint in `/docs`.
2. Add `PUT /tasks/{task_id}` (replace) and `PATCH /tasks/{task_id}` (toggle `done`).
3. Add a `GET /tasks/stats` endpoint returning total and done counts. ⚠️ Declare it **before** `/tasks/{task_id}` and see why order matters.
4. Open `/openapi.json` and find your models in `components.schemas`.
