# 00 · How Node.js works internally

## 1. What Node.js is

> **In short:** Node.js is a runtime that runs JavaScript outside the browser, built from Google's V8 engine plus libuv (async I/O) plus a standard library of C++ and JS modules.

```
┌──────────────────────────────────────────────────────────┐
│ Your JavaScript (app code, npm packages)                 │
├──────────────────────────────────────────────────────────┤
│ Node.js standard library in JS: fs, http, net, crypto,   │
│ stream, events, path…                                    │
├──────────────────────────────────────────────────────────┤
│ Node bindings (C++): connect JS to the layers below      │
├───────────────────────────┬──────────────────────────────┤
│ V8: runs JavaScript       │ libuv: event loop, async I/O │
│ (parse, compile, JIT, GC) │ thread pool, timers          │
├───────────────────────────┴──────────────────────────────┤
│ Other C/C++ libs: OpenSSL, zlib, llhttp, c-ares, ICU     │
├──────────────────────────────────────────────────────────┤
│ Operating system (epoll / kqueue / IOCP, files, sockets) │
└──────────────────────────────────────────────────────────┘
```

The browser gives JavaScript the DOM and `window`; Node instead gives it files, network sockets, processes and the OS.

## 2. V8: running your JavaScript

> **In short:** V8 parses your code, runs it through an interpreter, and compiles hot functions into optimized machine code; it also manages memory with a garbage collector.

- **Ignition** (interpreter) turns code into bytecode and runs it quickly.
- **Sparkplug/Maglev/TurboFan** (compilers) watch which functions run often ("hot") and compile them into optimized machine code, based on the types they've seen. If the types suddenly change, V8 **deoptimizes** back to bytecode. Consistent object shapes and types help performance.
- **Garbage collector (Orinoco)**: the heap is split into a **young generation** (new objects; collected often and fast) and an **old generation** (long-lived objects; collected less often). The default heap limit can be raised with `--max-old-space-size=4096` (MB).
- V8 also implements the **call stack**: one stack, so JavaScript runs **one thing at a time** on the main thread.

## 3. The single thread and non-blocking I/O

> **In short:** Your JavaScript runs on one main thread; slow operations like network and disk are handed to the OS or libuv, and their callbacks run later when results are ready.

```js
import { readFile } from 'node:fs/promises';

console.log('1: start reading');
const p = readFile('big.txt', 'utf8');     // handed off; JS continues immediately
console.log('2: doing other work');
const text = await p;                       // resumes here when the file is ready
console.log('3: file length', text.length);
```

A web server doesn't wait for one database query before accepting the next request. While request A waits for the DB, Node handles requests B, C and D. This is why **one Node process can serve thousands of concurrent connections** with little memory, as long as the work is I/O-bound.

The flip side: **if your JavaScript does heavy CPU work** (a big loop, JSON parsing of huge payloads, image processing, synchronous crypto), the single thread is busy and **every other request waits**. This is called **blocking the event loop**.

## 4. libuv and the thread pool

> **In short:** libuv uses the OS's native async mechanisms for network I/O, and a small thread pool for work the OS can't do asynchronously (files, DNS lookups, some crypto, compression).

| Work | Handled by |
| --- | --- |
| TCP/UDP sockets, HTTP, pipes | OS async notification (**epoll** on Linux, **kqueue** on macOS, **IOCP** on Windows): no extra threads |
| File system (`fs.*`) | **libuv thread pool** |
| `dns.lookup` | Thread pool |
| `crypto.pbkdf2`, `scrypt`, `randomBytes` (async versions) | Thread pool |
| `zlib` compression (async) | Thread pool |
| Timers | libuv timer heap |

- The thread pool has **4 threads by default** (`UV_THREADPOOL_SIZE`, max 1024). Many concurrent file reads or password hashes can queue up behind those 4 threads.
- Your JavaScript **never** runs on these threads; they only perform the native work, then queue a callback for the main thread.

## 5. The event loop

> **In short:** The event loop is a loop in libuv that repeatedly checks for completed work and runs the matching JavaScript callbacks, in a fixed order of phases.

```
   ┌───────────────────────────┐
┌─▶│           timers          │  setTimeout / setInterval callbacks whose time has come
│  └─────────────┬─────────────┘
│  ┌─────────────▼─────────────┐
│  │     pending callbacks     │  some system-level callbacks deferred from the previous loop
│  └─────────────┬─────────────┘
│  ┌─────────────▼─────────────┐
│  │       idle, prepare       │  internal
│  └─────────────┬─────────────┘
│  ┌─────────────▼─────────────┐
│  │           poll            │  wait for and run I/O callbacks (sockets, files done…)
│  └─────────────┬─────────────┘
│  ┌─────────────▼─────────────┐
│  │           check           │  setImmediate callbacks
│  └─────────────┬─────────────┘
│  ┌─────────────▼─────────────┐
└──┤      close callbacks      │  e.g. socket.on('close')
   └───────────────────────────┘

Between every callback: run process.nextTick queue, then the promise microtask queue.
```

When there's nothing left to do (no timers, sockets or pending work), the loop exits and the process ends. A server keeps a listening socket open, so it keeps running.

### Microtasks and `process.nextTick`

> **In short:** After each callback, Node empties the `process.nextTick` queue first, then the promise microtask queue, before moving on.

```js
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('nextTick'));
console.log('sync');

// sync
// nextTick
// promise
// timeout / immediate (order between these two can vary at the top level;
//                      inside an I/O callback, setImmediate always runs first)
```

| Queue | Filled by | Runs |
| --- | --- | --- |
| `process.nextTick` | `process.nextTick(fn)` | Immediately after the current operation, before promises |
| Microtasks | Promise `.then`, `await` continuations, `queueMicrotask` | After nextTick, before the loop continues |
| Timers phase | `setTimeout`, `setInterval` | When the delay has passed (a minimum, not exact) |
| Check phase | `setImmediate` | After the poll phase |

⚠️ A recursive `process.nextTick` or a never-ending promise chain can **starve** the event loop: I/O never gets a turn.

## 6. What happens when an HTTP request arrives

> **In short:** The OS signals the socket is readable, libuv's poll phase picks it up, Node's HTTP parser builds `req`/`res`, and your handler runs on the main thread.

```
1. Client connects → OS accepts the TCP connection
2. epoll reports data on the socket → libuv poll phase
3. llhttp (C parser) parses the bytes → Node creates IncomingMessage (req) and ServerResponse (res)
4. 'request' event → your handler (e.g. Express) runs on the main thread
5. Handler awaits a DB query → the query is sent over another socket; the handler pauses
6. Event loop handles other requests meanwhile
7. DB response arrives → poll phase → your handler resumes (microtask) → res.end(...)
8. Data is written to the socket
```

## 7. Blocking the event loop

> **In short:** Any long synchronous work freezes all requests; keep handlers fast and move CPU-heavy work to worker threads, child processes or a job queue.

```js
app.get('/slow', (req, res) => {
  const start = Date.now();
  while (Date.now() - start < 5000) {}      // ❌ 5 s busy loop: the whole server is frozen
  res.send('done');
});
```

Common blockers: `fs.readFileSync` and other `*Sync` APIs in request handlers, huge `JSON.parse`/`JSON.stringify`, catastrophic regular expressions (ReDoS), synchronous crypto (`bcrypt.hashSync`), sorting huge arrays, image or PDF processing.

Fixes:
- Use async APIs everywhere in servers.
- Split big work into chunks with `setImmediate` between them.
- Use **worker threads** for CPU-heavy work (section 8).
- Move long jobs to a **queue** (BullMQ) processed by separate worker processes.
- Monitor **event loop lag** (`perf_hooks.monitorEventLoopDelay`).

## 8. Using more than one CPU core

> **In short:** One Node process uses one main thread; use worker threads for CPU tasks, and multiple processes (cluster, PM2 or containers) to use all cores for serving requests.

| Option | What | Use for |
| --- | --- | --- |
| **Worker threads** (`node:worker_threads`) | Extra JS threads inside one process, each with its own V8 isolate and event loop; communicate by messages (or `SharedArrayBuffer`) | CPU-heavy tasks (hashing, image work, parsing) without blocking the main thread |
| **Child processes** (`node:child_process`) | Separate OS processes | Running other programs or scripts |
| **Cluster** (`node:cluster`) / **PM2** | Several copies of your server sharing one port | Using all cores on one machine |
| **Containers / replicas** | Several instances behind a load balancer | The usual production approach (Kubernetes, ECS) |

## 9. Modules and startup

> **In short:** On startup Node loads your entry file, resolves imports (ES modules or CommonJS), runs each module's top-level code once and caches it, then enters the event loop.

- ES modules (`import`) are loaded and linked before running; CommonJS (`require`) loads synchronously on demand.
- Every module runs **once**; later imports get the cached exports. That's why a module-level database client acts like a singleton.

## 10. Node vs Python (FastAPI) at a glance

> **In short:** Both use an event loop for concurrency; Node is async by default everywhere, while Python mixes sync and async code.

| | Node.js | Python + FastAPI |
| --- | --- | --- |
| Concurrency | Event loop (libuv), async by default | asyncio event loop + thread pool for sync code |
| Ecosystem I/O | Almost all libraries are non-blocking | Must choose async libraries for `async def` |
| CPU parallelism | Worker threads / multiple processes | Multiple processes (GIL) |
| Typing | TypeScript (compile-time only) | Type hints + Pydantic (runtime validation) |

## 11. Mental model in one paragraph

> **In short:** A summary of the whole chapter.

Node runs your JavaScript on one thread with V8. Anything slow (network, disk, timers) is handed to the OS or libuv, which notify the event loop when results are ready; the loop then runs your callbacks and promise continuations one at a time, in phases, emptying the nextTick and microtask queues between callbacks. Because waiting doesn't block the thread, one process serves many connections, but CPU-heavy JavaScript blocks everyone, so that work goes to worker threads, other processes or a job queue.

---

## 12. Exercises

1. Predict, then run, the output order of a script mixing `setTimeout`, `setImmediate`, `process.nextTick` and `Promise.then`.
2. Write a tiny HTTP server with a `/block` route that busy-loops for 3 s; call `/` from another tab while it runs.
3. Run 8 concurrent `crypto.pbkdf2` calls, time them with the default thread pool, then with `UV_THREADPOOL_SIZE=8`.
4. Move the busy loop into a worker thread and show the server stays responsive.
5. Use `monitorEventLoopDelay` to print event-loop lag every second while the blocking route runs.
