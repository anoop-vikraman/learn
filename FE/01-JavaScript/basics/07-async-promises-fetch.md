# 07 · Asynchronous JavaScript

## 1. Synchronous vs asynchronous

JavaScript runs on **one thread**: it does one thing at a time. **Synchronous** code runs line by line, and each line waits for the previous one. Some tasks take time (network requests, timers, reading files). If JS waited for them, the page would freeze. So these tasks are **asynchronous**: JS starts them, keeps running other code, and handles the result later.

```js
console.log('1');
setTimeout(() => console.log('2'), 0);   // scheduled for later, even with 0 ms
console.log('3');
// Output: 1, 3, 2
```

## 2. Timers

```js
const id = setTimeout(() => console.log('once, after 1 s'), 1000);
clearTimeout(id);                       // cancel before it runs

const intervalId = setInterval(() => console.log('every 2 s'), 2000);
clearInterval(intervalId);              // stop repeating

setTimeout((a, b) => console.log(a + b), 500, 2, 3);   // extra args are passed to the callback
```

- The delay is a **minimum**, not exact: the callback runs when the thread is free.
- Always clear intervals you no longer need (in React: in the effect's cleanup), or they keep running and leak memory.

---

## 3. Callbacks (the old way)

A **callback** is a function passed to another function to be called later.

```js
function loadUser(id, callback) {
  setTimeout(() => callback(null, { id, name: 'Anoop' }), 500);
}

loadUser(1, (error, user) => {
  if (error) return console.error(error);
  console.log(user.name);
});
```

Nesting many async steps creates **callback hell** (the "pyramid of doom"), which is hard to read and handle errors in. Promises fix this.

---

## 4. Promises

A **Promise** is an object representing a value that will be available **later**. It's always in one of three states:

- **pending**: still waiting
- **fulfilled**: finished successfully, with a value
- **rejected**: failed, with a reason (usually an `Error`)

Once fulfilled or rejected it's **settled** and never changes again.

### Creating a promise

```js
function wait(ms) {
  return new Promise((resolve, reject) => {
    if (ms < 0) reject(new Error('ms must be positive'));
    setTimeout(() => resolve(`waited ${ms} ms`), ms);
  });
}
```

### Using a promise: `.then`, `.catch`, `.finally`

```js
wait(1000)
  .then((message) => {
    console.log(message);         // 'waited 1000 ms'
    return wait(500);             // returning a promise → the next .then waits for it
  })
  .then((message) => console.log(message))
  .catch((error) => console.error('Failed:', error.message))   // catches errors from ANY step above
  .finally(() => console.log('done either way'));               // cleanup: hide spinner, etc.
```

⚠️ Inside `.then`, **return** the next promise. Forgetting `return` breaks the chain: the next step runs immediately with `undefined`.

### Ready-made promises

```js
Promise.resolve(42);                  // already fulfilled
Promise.reject(new Error('nope'));    // already rejected
```

---

## 5. `async` / `await` (the modern way)

`async`/`await` lets you write promise code that **reads like normal top-to-bottom code**.

```js
async function showUser() {
  try {
    const response = await fetch('/api/users/1');   // pauses THIS function until the promise settles
    const user = await response.json();
    console.log(user.name);
  } catch (error) {
    console.error('Could not load user', error);
  } finally {
    console.log('finished');
  }
}
```

Rules:
- `await` only works inside an `async` function (or at the top level of an ES module).
- An `async` function **always returns a promise**. `return 5` inside it means the caller gets `Promise<5>`.
- `await` pauses only the current function; the rest of the app keeps running.
- Errors from awaited promises are caught with normal `try`/`catch`.

```js
const getNumber = async () => 5;
getNumber();                     // Promise {<fulfilled>: 5}
getNumber().then(console.log);   // 5
const n = await getNumber();     // 5 (inside an async function / module)
```

### Sequential vs parallel

```js
// ❌ Slow: the second request waits for the first (≈ 2 s if each takes 1 s)
const user = await getUser();
const posts = await getPosts();

// ✅ Fast: both start together (≈ 1 s)
const [user2, posts2] = await Promise.all([getUser(), getPosts()]);
```

Only run steps one after another when the second needs the first's result.

### Loops with await

```js
// one at a time, in order
for (const id of ids) {
  const user = await getUser(id);
}

// all at once
const users = await Promise.all(ids.map((id) => getUser(id)));

// ⚠️ forEach does NOT wait for async callbacks
ids.forEach(async (id) => { await getUser(id); });
console.log('this runs before any user is loaded');
```

---

## 6. Combining promises

| Method | Resolves when | Rejects when | Use for |
| --- | --- | --- | --- |
| `Promise.all([...])` | **all** succeed → array of results (same order) | **any one** fails (first error) | Requests that are all required |
| `Promise.allSettled([...])` | all finish (never rejects) → `[{status, value/reason}]` | never | Show partial results |
| `Promise.race([...])` | the **first to settle** (success or failure) | the first to settle is a failure | Timeouts |
| `Promise.any([...])` | the **first success** | all fail (`AggregateError`) | Fastest of several mirrors |

```js
const results = await Promise.allSettled([getA(), getB()]);
results.forEach((r) => {
  if (r.status === 'fulfilled') console.log(r.value);
  else console.error(r.reason);
});

// Timeout pattern
const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms));
await Promise.race([fetch('/slow'), timeout(5000)]);
```

---

## 7. `fetch`: talking to APIs

```js
// GET
async function getUsers() {
  const response = await fetch('https://jsonplaceholder.typicode.com/users');
  if (!response.ok) {                               // ⚠️ fetch does NOT throw for 404/500
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();                           // parse the body (also a promise)
}

// POST with JSON
async function createUser(user) {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),                      // body must be a string (or FormData, Blob...)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// Query parameters
const params = new URLSearchParams({ q: 'pen', page: '2' });
await fetch(`/api/products?${params}`);             // /api/products?q=pen&page=2
```

Things to remember about `fetch`:
- It rejects **only on network failure** (offline, DNS, CORS). For HTTP errors, check `response.ok` (true for status 200–299) or `response.status`.
- The body can be read **once**: `response.json()`, `response.text()` or `response.blob()`.
- `response.json()` throws if the body is empty or not JSON (e.g. a 204 No Content response).
- Cookies are sent for same-origin requests by default; for cross-origin, set `credentials: 'include'`.

### Cancelling a request: `AbortController`

```js
const controller = new AbortController();
fetch('/api/search?q=abc', { signal: controller.signal })
  .then((r) => r.json())
  .catch((err) => {
    if (err.name === 'AbortError') return;   // cancelled on purpose: ignore
    throw err;
  });

controller.abort();                            // cancels the request

// Built-in timeout
fetch('/api/slow', { signal: AbortSignal.timeout(5000) });
```

---

## 8. Error handling summary

```js
// promise chain
doTask().then(handle).catch(handleError);

// async/await
try {
  await doTask();
} catch (err) {
  handleError(err);
}

// ⚠️ An unhandled rejected promise logs "Uncaught (in promise)". Always handle errors.
// ⚠️ try/catch does NOT catch errors from a promise you don't await:
try {
  doTask();          // missing await → rejection escapes the try
} catch {}
```

---

## 9. The event loop (how it all fits)

1. The **call stack** runs synchronous code.
2. Async work (timers, fetch, events) is handled by the browser/Node in the background.
3. When it's done, its callback is queued:
   - **Microtask queue**: promise callbacks (`.then`, code after `await`), `queueMicrotask`
   - **Macrotask (task) queue**: `setTimeout`, `setInterval`, events, I/O
4. When the call stack is empty, the event loop runs **all microtasks first**, then **one macrotask**, then microtasks again, and so on (rendering happens between tasks).

```js
console.log('A');
setTimeout(() => console.log('B'), 0);
Promise.resolve().then(() => console.log('C'));
console.log('D');
// A, D, C, B  (sync first, then microtasks, then macrotasks)
```

More puzzles like this are in [../01-async-event-loop-promises.md](../01-async-event-loop-promises.md).

---

## 10. Exercises

1. Write `wait(ms)` and use it to log "1", wait 1 s, log "2", wait 1 s, log "3" with async/await.
2. Fetch users from `https://jsonplaceholder.typicode.com/users` and log their names. Handle HTTP errors.
3. Fetch users and posts in parallel with `Promise.all`.
4. Write `fetchWithTimeout(url, ms)` that rejects if the request takes longer than `ms`.
5. Predict the output order of a snippet mixing `console.log`, `setTimeout` and `Promise.then`.
