# 08 · Async, background work, middleware and real-time

## 1. `async def` vs `def` endpoints

> **In short:** Use `async def` only with async libraries; use `def` for blocking code (it runs in a thread pool).

```python
@app.get("/sync")
def sync_endpoint():               # runs in a thread pool (default ~40 threads)
    return requests.get(URL).json()            # blocking is OK here

@app.get("/async")
async def async_endpoint():        # runs on the event loop
    async with httpx.AsyncClient() as client:
        r = await client.get(URL)              # must use async libraries
    return r.json()
```

| Use `async def` when | Use `def` when |
| --- | --- |
| Everything you call inside is async (`httpx.AsyncClient`, async SQLAlchemy, `redis.asyncio`) | You call blocking libraries (`requests`, sync SQLAlchemy, boto3, file I/O) |
| You need high concurrency with many slow I/O calls | You're unsure: it's the safe default |

⚠️ **Never** call blocking code in `async def` (it freezes all requests in that worker). If you must, use `await asyncio.to_thread(fn, ...)` or `fastapi.concurrency.run_in_threadpool`.

CPU-heavy work (image resizing, PDF generation, ML inference) shouldn't run in the request at all: hand it to a worker (**Celery**).

## 2. Background tasks

> **In short:** Run small jobs after the response is sent; use Celery for anything that must be reliable.

`BackgroundTasks` runs a function **after the response is sent**, in the same process. Good for small, quick, non-critical jobs.

```python
from fastapi import BackgroundTasks

def send_welcome_email(email: str) -> None:
    ...   # call the email provider

@app.post("/users", status_code=201)
def register(data: UserCreate, background: BackgroundTasks, db: DbSession):
    user = create_user(db, data)
    background.add_task(send_welcome_email, user.email)   # don't block the response
    return user
```

Limitations: if the process restarts, queued tasks are **lost**; there are no retries, no scheduling, no visibility, and they use the web worker's resources.

| Need | Use |
| --- | --- |
| Tiny fire-and-forget (log, cache warm-up, small email) | `BackgroundTasks` |
| Reliable jobs, retries, long-running, scheduled, scale workers separately | **Celery** (or RQ, Dramatiq, arq) with Redis/RabbitMQ: see [../06-Celery/](../06-Celery/) |

## 3. Middleware

> **In short:** Code that wraps every request: logging, request IDs, CORS, compression, trusted hosts.

Middleware wraps **every request**: runs code before the endpoint and after the response.

```python
import time, uuid, logging
from fastapi import Request

logger = logging.getLogger("app.requests")

@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    start = time.perf_counter()
    response = await call_next(request)            # run the rest of the app
    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    logger.info("request", extra={"method": request.method, "path": request.url.path,
                                  "status": response.status_code, "ms": round(duration_ms, 1),
                                  "request_id": request_id})
    return response
```

Built-in / common middleware:

```python
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)                       # compress responses
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["api.example.com"]) # reject other Host headers
app.add_middleware(CORSMiddleware, allow_origins=[...], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
```

Order: middleware added **last** runs **first** (outermost). For performance-critical middleware, write pure ASGI middleware instead of `@app.middleware("http")`.

## 4. Pagination

> **In short:** Return large lists in pages so responses stay fast and small.

### Offset pagination (simple)

> **In short:** `page` and `size` with a total count; slows down for deep pages.

```python
from pydantic import BaseModel

class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    size: int

@app.get("/tasks", response_model=Page[TaskOut])
def list_tasks(db: DbSession, page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100)):
    base = select(Task)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    items = db.scalars(base.order_by(Task.id).offset((page - 1) * size).limit(size)).all()
    return Page(items=items, total=total, page=page, size=size)
```

⚠️ Large offsets get slow (the DB still walks skipped rows), and rows shift if data changes between pages.

### Cursor (keyset) pagination (scales)

> **In short:** Continue after the last seen ID; fast and stable, good for infinite scroll.

```python
@app.get("/feed")
def feed(db: DbSession, after_id: int | None = None, size: int = 20):
    stmt = select(Task).order_by(Task.id.desc()).limit(size + 1)
    if after_id:
        stmt = stmt.where(Task.id < after_id)
    rows = db.scalars(stmt).all()
    has_more = len(rows) > size
    items = rows[:size]
    return {"items": items, "next_cursor": items[-1].id if has_more else None}
```

Works with infinite scroll; uses an index; stable while data changes.

## 5. Streaming responses

> **In short:** Send data in chunks (CSV exports, Server-Sent Events) instead of all at once.

```python
from fastapi.responses import StreamingResponse
import asyncio

@app.get("/stream")
async def stream():
    async def gen():
        for i in range(5):
            yield f"chunk {i}\n"
            await asyncio.sleep(0.5)
    return StreamingResponse(gen(), media_type="text/plain")

# Server-Sent Events (one-way server → browser updates, e.g. LLM token streaming)
@app.get("/events")
async def events():
    async def gen():
        for i in range(10):
            yield f"data: {{\"progress\": {i * 10}}}\n\n"
            await asyncio.sleep(1)
    return StreamingResponse(gen(), media_type="text/event-stream")
```

## 6. WebSockets

> **In short:** Two-way real-time connections; use Redis pub/sub to share messages across workers.

Two-way, real-time communication (chat, live updates).

```python
from fastapi import WebSocket, WebSocketDisconnect

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []
    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)
    async def broadcast(self, message: str):
        for ws in self.active:
            await ws.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws/{room}")
async def ws_endpoint(ws: WebSocket, room: str, token: str | None = None):
    # authenticate (browsers can't set headers on WebSockets: use a query token or cookie)
    await manager.connect(ws)
    try:
        while True:
            text = await ws.receive_text()
            await manager.broadcast(f"[{room}] {text}")
    except WebSocketDisconnect:
        manager.disconnect(ws)
```

⚠️ This in-memory manager only works with **one process**. With several workers or servers, use **Redis pub/sub** to broadcast between them (see [../05-Redis/](../05-Redis/)).

## 7. Caching responses

> **In short:** Store expensive results in Redis with a TTL and use HTTP caching headers.

```python
@app.get("/stats")
async def stats(request: Request):
    redis = request.app.state.redis
    if cached := await redis.get("stats"):
        return json.loads(cached)
    data = await compute_stats()
    await redis.set("stats", json.dumps(data), ex=60)      # cache for 60 s
    return data
```

Also use HTTP caching headers (`Cache-Control`, `ETag`) for public, rarely-changing data.

## 8. Rate limiting (sketch)

> **In short:** Limit requests per user per time window with a Redis counter, returning 429.

```python
async def rate_limit(request: Request, user: CurrentUser):
    key = f"rl:{user.id}:{int(time.time() // 60)}"        # per user per minute
    redis = request.app.state.redis
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 60)
    if count > 100:
        raise HTTPException(429, "Too many requests", headers={"Retry-After": "60"})

@app.post("/ai/summarize", dependencies=[Depends(rate_limit)])
async def summarize(...): ...
```

Libraries: `slowapi`, `fastapi-limiter`; or do it at the gateway (Nginx, API gateway, Cloudflare).

## 9. Mounting static files and sub-apps

> **In short:** Serve static files or other ASGI apps under a path (prefer a CDN in production).

```python
from fastapi.staticfiles import StaticFiles
app.mount("/static", StaticFiles(directory="static"), name="static")
```

In production, serve static files and the React build from a CDN or Nginx, not Python.

---

## 10. Exercises

1. Add request-ID + timing middleware that logs JSON lines.
2. Send a welcome email via `BackgroundTasks`; then list why you'd move it to Celery.
3. Implement offset pagination with a generic `Page[T]` and cursor pagination for a feed.
4. Stream a large CSV export.
5. Build a WebSocket chat room; open two browser tabs and chat between them.
