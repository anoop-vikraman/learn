# 00 · How FastAPI works internally

Read this first for the big picture, then come back to it after lesson 04: it will make much more sense once you've used the features it explains.

## 1. The layers

> **In short:** FastAPI is a thin layer of developer-friendly features on top of Starlette (web toolkit) and Pydantic (validation), run by an ASGI server like Uvicorn.

```
┌──────────────────────────────────────────────────────────────┐
│ Your code: path operations, dependencies, Pydantic models    │
├──────────────────────────────────────────────────────────────┤
│ FastAPI: reads type hints → parameter parsing, validation,   │
│          dependency injection, response models, OpenAPI docs │
├──────────────────────────────────────────────────────────────┤
│ Starlette: routing, Request/Response, middleware, WebSockets,│
│            background tasks, thread pool helpers              │
├──────────────────────────────────────────────────────────────┤
│ Pydantic (pydantic-core in Rust): validation + serialization │
├──────────────────────────────────────────────────────────────┤
│ ASGI interface: async def app(scope, receive, send)          │
├──────────────────────────────────────────────────────────────┤
│ Uvicorn: sockets, HTTP parsing (httptools/h11), event loop   │
│          (uvloop/asyncio), worker processes                   │
├──────────────────────────────────────────────────────────────┤
│ Python runtime (CPython) + operating system                   │
└──────────────────────────────────────────────────────────────┘
```

`class FastAPI(Starlette)`: a FastAPI app **is** a Starlette app with extra features. Anything Starlette can do, FastAPI can do.

## 2. ASGI: the contract between server and app

> **In short:** ASGI defines your whole app as one async function that receives connection info (`scope`) and talks to the server through `receive` and `send` messages.

```python
# The smallest possible ASGI app (no framework at all)
async def app(scope, receive, send):
    assert scope["type"] == "http"
    await send({"type": "http.response.start", "status": 200,
                "headers": [(b"content-type", b"text/plain")]})
    await send({"type": "http.response.body", "body": b"Hello from raw ASGI"})

# run it: uvicorn module:app
```

| Piece | What it is |
| --- | --- |
| `scope` | A dict describing the connection: type (`http`, `websocket`, `lifespan`), method, path, query string, headers, client address |
| `receive()` | Await it to get incoming messages: request body chunks, WebSocket messages, disconnects |
| `send(message)` | Send outgoing messages: response start (status + headers), body chunks, WebSocket frames |

Everything FastAPI does is ultimately a nicer way of producing these `send` calls. ASGI replaced **WSGI** (used by Flask/Django), which is synchronous: one request blocks one worker thread for its whole duration, and long-lived connections such as WebSockets aren't supported.

There's also a `lifespan` scope: the server sends `startup` and `shutdown` messages, which is how your `lifespan` function runs.

## 3. Uvicorn: the server

> **In short:** Uvicorn accepts TCP connections, parses HTTP bytes into an ASGI `scope`, calls your app on an asyncio event loop, and turns your `send` messages back into HTTP bytes.

1. A **socket** listens on a port (e.g. 8000).
2. For each connection, a fast HTTP parser (`httptools`, or `h11`) turns raw bytes into method, path and headers.
3. Uvicorn builds the `scope`, then calls `await app(scope, receive, send)` as a task on the **event loop** (using `uvloop` if installed, a faster drop-in replacement for asyncio's loop).
4. While your code `await`s I/O (database, HTTP calls), the event loop runs other requests. This is how **one process handles many concurrent requests**.
5. With `--workers N`, Uvicorn (or Gunicorn) starts **N separate processes**, each with its own event loop and memory, sharing the listening socket. That's how you use several CPU cores, since the GIL limits one process to one core for Python code.

## 4. Starting the app: what happens at import time

> **In short:** When Python imports `main.py`, the decorators register routes, and FastAPI analyses each endpoint's signature once, building a plan for parsing, validation and dependencies.

```python
app = FastAPI()

@app.get("/tasks/{task_id}")
def get_task(task_id: int, q: str | None = None, db: Session = Depends(get_db)) -> TaskOut:
    ...
```

`@app.get(...)` creates an **`APIRoute`** and adds it to the app's router. At this point FastAPI **inspects the function signature** (`inspect.signature` + type hints) and builds a **`Dependant`**, a tree describing:

| Parameter | Detected as | Because |
| --- | --- | --- |
| `task_id: int` | Path parameter | Its name appears in the path `{task_id}` |
| `q: str \| None = None` | Optional query parameter | Simple type, not in the path, has a default |
| `db = Depends(get_db)` | Sub-dependency | `Depends` marker; FastAPI inspects `get_db`'s signature recursively |
| `payload: TaskCreate` (if present) | JSON body | It's a Pydantic model |
| `-> TaskOut` | Response model | Return annotation |

It also prepares **Pydantic validators** (via pydantic-core) for these fields and for the response model. All this analysis happens **once at startup**, not on every request, which is part of why FastAPI is fast.

The path is compiled into a regular expression (`^/tasks/(?P<task_id>[^/]+)$`) with a convertor.

## 5. The life of a request, step by step

> **In short:** Middleware → router match → resolve dependencies → validate inputs → call your function (on the loop or in a thread) → validate/serialize output → send the response back through middleware.

```
HTTP bytes ─▶ Uvicorn ─▶ ASGI app(scope, receive, send)
   │
   ▼
1. Middleware stack (outermost first): ServerErrorMiddleware → your middleware (CORS, GZip…) → ExceptionMiddleware
   │
   ▼
2. Router: try each route's regex in order, first match wins → 404/405 if none
   │
   ▼
3. Request handler for the route:
   a. read the body (if needed) and parse JSON / form data
   b. solve the dependency tree (sub-dependencies first; each one runs once per request, results cached)
   c. extract path/query/header/cookie/body values and validate them with Pydantic
      → if anything fails, collect ALL errors and raise RequestValidationError (→ 422)
   d. call your function:
        async def → awaited directly on the event loop
        def       → run in a worker thread (anyio thread pool) so it can't block the loop
   e. validate and filter the return value with the response model, convert to JSON-compatible data
   f. build a JSONResponse (or use the Response you returned)
   │
   ▼
4. Response travels back out through the middleware, then yield-dependency cleanup and background tasks run
   │
   ▼
Uvicorn writes HTTP bytes to the socket
```

### Route order

> **In short:** Routes are checked in the order they were added, so specific paths must come before generic ones.

`/users/me` declared after `/users/{user_id}` never matches: `{user_id}` captures `"me"` first and then fails int validation.

### Exceptions

> **In short:** `HTTPException` and your custom exceptions are caught by exception-handling middleware and turned into responses; anything unhandled becomes a 500.

`ExceptionMiddleware` looks up a handler by exception class (your `@app.exception_handler(...)`, or the defaults for `HTTPException` and `RequestValidationError`). `ServerErrorMiddleware`, the outermost layer, turns unexpected errors into a 500 response (with a traceback page only in debug mode).

## 6. Dependency injection internally

> **In short:** Dependencies form a tree solved recursively for each request; results are cached per request, and yield dependencies are entered like context managers and closed at the end.

- For each `Depends(fn)`, FastAPI inspects `fn`'s parameters the same way as an endpoint's, so dependencies can have query params, headers and their own dependencies.
- `solve_dependencies()` walks the tree depth-first and calls each dependency with the values it needs.
- A dependency used several times in one request runs **once**: the result is cached under the key `(function, scopes)` (unless `use_cache=False`).
- A **yield dependency** is wrapped in a context manager and entered on an `AsyncExitStack`. After the endpoint finishes, the stack unwinds in reverse order, running the code after each `yield`. That's how DB sessions get closed.
- `app.dependency_overrides` is just a dict consulted while solving: if `get_db` is a key, its replacement is called instead. That's why overriding in tests is so easy.

## 7. Pydantic's role

> **In short:** Pydantic compiles your models into fast validators (written in Rust); FastAPI uses them to parse inputs, report every error at once, and serialize outputs.

- Pydantic v2's core (`pydantic-core`) is written in **Rust**, so validation and JSON serialization are fast.
- **Input:** values from the path/query (always strings in HTTP) are **coerced** to the declared types (`"42"` → `42`), and bodies are validated against models. All errors are collected with their location (`["body", "title"]`) for the 422 response.
- **Output:** the return value is validated against the response model, which also **filters out** fields not in the model, then serialized to JSON.
- **OpenAPI:** each model generates a JSON Schema, reused in the docs.

## 8. Sync vs async endpoints internally

> **In short:** `async def` runs on the event loop and must never block; plain `def` is automatically sent to a thread pool, so blocking code is safe there.

- `async def` endpoint: FastAPI `await`s it directly on the event loop. If it calls `time.sleep()` or a blocking library, **the whole worker freezes** for every request.
- `def` endpoint (and `def` dependencies): FastAPI calls `run_in_threadpool` (AnyIO), which runs it in a worker thread from a pool of **40 threads** by default. The event loop stays free, but if 40 slow sync requests are running, the 41st waits for a free thread.
- So: async code → `async def`; blocking code → `def`; never mix blocking calls into `async def`.

## 9. How the docs are generated

> **In short:** On the first request to `/openapi.json`, FastAPI walks every route, combines parameter info and Pydantic JSON Schemas into an OpenAPI document, and caches it; `/docs` is an HTML page that loads Swagger UI with that schema.

- `app.openapi()` builds the schema from routes, parameters, models, `responses=`, tags, summaries and docstrings, and caches it in `app.openapi_schema`.
- `/docs` and `/redoc` return small HTML pages that load Swagger UI/ReDoc from a CDN and point them at `/openapi.json`.
- Because docs come from the same type hints that drive validation, they can't drift out of date.

## 10. Middleware internally

> **In short:** Middleware wraps the ASGI app like layers of an onion; each layer can act before passing the request inward and after the response comes back.

`app.add_middleware(X)` wraps the existing app: `X(app=previous_app)`. The stack is built once, at the first request. The last middleware added is the **outermost**, so it runs first. `@app.middleware("http")` uses Starlette's `BaseHTTPMiddleware`, which is convenient but adds overhead. Pure ASGI middleware (a class with `async def __call__(self, scope, receive, send)`) is faster.

## 11. Background tasks and lifespan

> **In short:** Background tasks run in the same process right after the response is sent; lifespan code runs once per worker process at startup and shutdown.

- `BackgroundTasks` are attached to the response; Starlette runs them after the body has been sent (sync ones in the thread pool). If the process dies, they're lost, which is why reliable jobs need Celery.
- The `lifespan` context manager runs when the server sends ASGI `lifespan` startup/shutdown events, **once per worker process** (4 workers = 4 startups, 4 sets of clients).

## 12. Why it's fast (and its limits)

> **In short:** Async I/O, startup-time analysis, Rust-powered Pydantic and lightweight Starlette make it fast; but CPU-heavy work, blocking calls and a slow database still slow it down.

| Fast because | Still limited by |
| --- | --- |
| One process serves many concurrent I/O-bound requests | The GIL: CPU-heavy Python code uses one core per process |
| Route/dependency analysis done once at startup | Blocking calls in `async def` freeze the loop |
| Pydantic core in Rust | The database is usually the real bottleneck |
| uvloop + httptools in Uvicorn | Thread pool size for `def` endpoints |

## 13. Mental model in one paragraph

> **In short:** A summary of the whole chapter.

Uvicorn turns HTTP into ASGI calls on an event loop. Your FastAPI app is a Starlette app whose routes were analysed at startup. For each request, middleware runs, the router finds the route, the dependency tree is solved, inputs are validated by Pydantic, and your function runs (on the loop if async, in a thread if not). The result is validated and serialized by the response model, sent back through middleware, and then cleanup and background tasks run. The same type hints drive validation, editor support and the docs.

---

## 14. Exercises

1. Write and run the raw ASGI app from section 2 with Uvicorn.
2. Add `print` statements to a yield dependency, a middleware and an endpoint, and observe the order of execution for one request.
3. Put `time.sleep(5)` in an `async def` endpoint and call it from two browser tabs at once; then change it to `def` and compare.
4. Use the same dependency twice in one endpoint and confirm it runs only once.
5. Print `app.routes` and `app.openapi()["paths"]` to see what FastAPI registered.
