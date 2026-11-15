# 09 · Concurrency and async

## 1. Concepts

> **In short:** Concurrency vs parallelism, I/O-bound vs CPU-bound, and which tool fits each.

- **Concurrency**: dealing with many things at once by switching between them (one cook juggling several dishes).
- **Parallelism**: doing many things at the same moment on several CPU cores (several cooks).
- **I/O-bound** work waits on the network, disk or database. Most web backends are I/O-bound.
- **CPU-bound** work keeps the processor busy (image processing, heavy calculations).

| Tool | Runs | Good for | Notes |
| --- | --- | --- | --- |
| `threading` | Threads in one process | I/O-bound, blocking libraries | Limited by the GIL for CPU work |
| `multiprocessing` / `ProcessPoolExecutor` | Separate processes | **CPU-bound** | Real parallelism; more memory; data must be picklable |
| `asyncio` | One thread, an event loop | **Lots of I/O** (thousands of connections) | Needs async libraries; one blocking call stalls everything |

### The GIL

> **In short:** CPython runs one thread of Python code at a time; threads help with I/O, not CPU-heavy work.

CPython's **Global Interpreter Lock** lets only one thread execute Python bytecode at a time. Threads still help for I/O (the GIL is released while waiting), but not for CPU-heavy Python code. Python 3.13+ has an experimental **free-threaded** build without the GIL; most deployments still use the standard one.

---

## 2. Threads and processes with `concurrent.futures`

> **In short:** Thread pools for I/O work and process pools for CPU work, through one simple API.

```python
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
import httpx

urls = [f"https://httpbin.org/delay/1?i={i}" for i in range(10)]

def fetch(url: str) -> int:
    return httpx.get(url, timeout=10).status_code

with ThreadPoolExecutor(max_workers=10) as pool:       # ~1 s total instead of ~10 s
    results = list(pool.map(fetch, urls))

def heavy(n: int) -> int:
    return sum(i * i for i in range(n))

if __name__ == "__main__":                              # required for multiprocessing on Windows/macOS
    with ProcessPoolExecutor() as pool:
        futures = [pool.submit(heavy, 10_000_000) for _ in range(4)]
        for f in as_completed(futures):
            print(f.result())
```

⚠️ Threads share memory: protect shared mutable data with `threading.Lock`, or better, avoid sharing.

---

## 3. asyncio basics

> **In short:** Coroutines (`async def`) run on an event loop and pause at `await` so others can run.

```python
import asyncio

async def say_after(delay: float, msg: str) -> str:   # coroutine function
    await asyncio.sleep(delay)                        # non-blocking wait: other tasks run meanwhile
    return msg

async def main() -> None:
    # Sequential: ~3 s
    a = await say_after(1, "a")
    b = await say_after(2, "b")

    # Concurrent: ~2 s
    a, b = await asyncio.gather(say_after(1, "a"), say_after(2, "b"))

asyncio.run(main())                                   # entry point: starts the event loop
```

- `async def` defines a **coroutine function**. Calling it returns a coroutine object; **nothing runs until it's awaited** (or scheduled as a task).
- `await` pauses the current coroutine until the awaited thing finishes, letting the event loop run others.
- `await` only works inside `async def`.

⚠️ Forgetting `await` gives a "coroutine was never awaited" warning, and the work never happens.

### Tasks and TaskGroups

> **In short:** Run coroutines concurrently; TaskGroups cancel the rest if one fails.

```python
async def main():
    task = asyncio.create_task(say_after(1, "background"))   # starts running now
    ...                                                      # do other things
    result = await task

    # Structured concurrency (3.11+): if one fails, the others are cancelled
    async with asyncio.TaskGroup() as tg:
        t1 = tg.create_task(fetch_user(1))
        t2 = tg.create_task(fetch_orders(1))
    user, orders = t1.result(), t2.result()
```

### Timeouts, limits and cancellation

> **In short:** `asyncio.timeout`, semaphores to limit concurrency, and cancelling tasks.

```python
async with asyncio.timeout(5):              # 3.11+: raises TimeoutError after 5 s
    data = await slow_call()

sem = asyncio.Semaphore(10)                 # at most 10 at a time
async def limited_fetch(client, url):
    async with sem:
        return await client.get(url)

task.cancel()                               # raises CancelledError inside the task
```

### Async HTTP with httpx

> **In short:** Make many HTTP requests concurrently with one shared `AsyncClient`.

```python
import httpx

async def fetch_all(urls: list[str]) -> list[int]:
    async with httpx.AsyncClient(timeout=10) as client:     # reuse one client (connection pool)
        responses = await asyncio.gather(*(client.get(u) for u in urls))
        return [r.status_code for r in responses]
```

### Async iteration and context managers

> **In short:** `async for` and `async with` for async generators and resources.

```python
async def stream_rows():
    for i in range(3):
        await asyncio.sleep(0.1)
        yield i                        # async generator

async def main():
    async for row in stream_rows():
        print(row)
    async with httpx.AsyncClient() as client:
        ...
```

---

## 4. Never block the event loop

> **In short:** Blocking calls inside `async def` freeze everything; use async libraries or `to_thread`.

Inside `async def`, a blocking call (`time.sleep`, `requests.get`, a sync DB driver, heavy CPU work) **freezes every other request** on that event loop.

```python
async def bad():
    time.sleep(2)                 # ❌ blocks everything
    requests.get(url)             # ❌ blocking HTTP library

async def good():
    await asyncio.sleep(2)                          # ✅
    async with httpx.AsyncClient() as c: await c.get(url)   # ✅ async library
    result = await asyncio.to_thread(blocking_fn, arg)       # ✅ run blocking code in a thread
```

For CPU-heavy work use a process pool (`loop.run_in_executor(ProcessPoolExecutor(), fn)`) or a task queue like **Celery**.

### In FastAPI

> **In short:** `async def` endpoints run on the event loop; plain `def` endpoints run in a thread pool.

- `async def` endpoints run on the event loop: use only async libraries inside them.
- Plain `def` endpoints run in a **thread pool** automatically, so blocking libraries are safe there.
- If unsure, a plain `def` is the safer choice.

---

## 5. Choosing

> **In short:** A quick guide to threads, processes, asyncio or a task queue for each situation.

| Situation | Use |
| --- | --- |
| Web API calling DB/HTTP, many concurrent users | `asyncio` (FastAPI async + async drivers) or sync `def` endpoints |
| Script downloading 100 files | `ThreadPoolExecutor` or `asyncio` + `httpx` |
| Crunching numbers on all cores | `ProcessPoolExecutor` |
| Long jobs that shouldn't block a request (emails, reports) | Background task queue (**Celery**, see [../06-Celery/](../06-Celery/)) |

---

## 6. Exercises

1. Download 20 URLs sequentially, with threads, and with asyncio + httpx; compare the times.
2. Use a `Semaphore` to limit concurrent requests to 5.
3. Use `asyncio.timeout` to cancel a slow call and handle the `TimeoutError`.
4. Compute something CPU-heavy on 4 cores with `ProcessPoolExecutor` and compare with a single loop.
5. Find the bug: an `async def` FastAPI endpoint that calls `requests.get`.
