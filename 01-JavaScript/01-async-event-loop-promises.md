## 0. JavaScript fundamentals (asked before React)

Most React interviews open with 10–15 minutes of plain JavaScript. The favourites: the event loop, promises vs async/await, closures, `this`, and "what does this code print?" puzzles.

### Part A: Asynchronous JavaScript and the event loop

**JavaScript is single-threaded:** it can do one thing at a time. So how does it wait for a network request without freezing the page? It hands slow work to the browser (or Node), keeps running other code, and gets called back when the result is ready.

**The event loop in plain words.** There are four pieces:

1. **Call stack:** the function running right now. JS only works on what's on top of the stack.
2. **Web APIs:** the browser does slow work outside JS (timers, `fetch`, DOM events).
3. **Queues:** finished work waits here.
   - **Microtask queue (VIP line):** promise callbacks (`.then`, `await` continuation), `queueMicrotask`, `MutationObserver`.
   - **Macrotask / task queue (normal line):** `setTimeout`, `setInterval`, DOM events, I/O.
4. **Event loop:** when the call stack is empty, it runs **all** microtasks first, then the browser may render, then it takes **one** macrotask. Repeat.

The key rule: **synchronous code first, then all microtasks, then one macrotask.** That's why a promise callback runs before a `setTimeout(fn, 0)`.

```js
console.log('1: sync');

setTimeout(() => console.log('2: timeout (macrotask)'), 0);

Promise.resolve().then(() => console.log('3: promise (microtask)'));

queueMicrotask(() => console.log('4: microtask'));

console.log('5: sync');

// Output: 1, 5, 3, 4, 2
```

`setTimeout(fn, 0)` means "at least 0 ms, after the current code and all microtasks", not "immediately". A long-running loop delays every timer.

**In Node.js** the order also includes `process.nextTick` (runs before promise microtasks) and `setImmediate` (the check phase, after I/O). Node's loop has phases: timers, pending callbacks, poll (I/O), check (`setImmediate`), close callbacks.

### Callbacks

A callback is a function you pass to another function to be called later.

```js
function getUser(id, callback) {
  setTimeout(() => callback(null, { id, name: 'Ann' }), 500);  // Node style: (error, result)
}

getUser(1, (err, user) => {
  if (err) return console.error(err);
  console.log(user.name);
});
```

**Problems with callbacks:**

- **Callback hell (pyramid of doom):** nested callbacks for steps that depend on each other.
- **Inversion of control:** you trust the other function to call your callback exactly once, with the right arguments.
- Error handling has to be repeated at every level; `try/catch` doesn't catch errors thrown inside async callbacks.

```js
getUser(1, (err, user) => {
  getOrders(user.id, (err, orders) => {
    getOrderDetails(orders[0].id, (err, details) => {
      // deeper and deeper...
    });
  });
});
```

### Promises

**A promise is an IOU for a future value.** It starts **pending**, then becomes **fulfilled** (with a value) or **rejected** (with an error). Once settled, it never changes.

```js
const wait = (ms) => new Promise((resolve, reject) => {
  if (ms < 0) reject(new Error('Negative time'));
  setTimeout(() => resolve(`Waited ${ms}ms`), ms);
});

wait(500)
  .then(msg => { console.log(msg); return wait(200); })   // return a promise to chain it
  .then(msg => console.log(msg))
  .catch(err => console.error(err))                       // catches errors from ANY step above
  .finally(() => console.log('done'));                    // runs either way
```

**The same callback hell, flattened with promises:**

```js
getUser(1)
  .then(user => getOrders(user.id))
  .then(orders => getOrderDetails(orders[0].id))
  .then(details => console.log(details))
  .catch(handleError);       // one place for all errors
```

**Things to know about `.then`:**

- `.then` always returns a **new** promise. Whatever you return becomes the next value; return a promise and the chain waits for it.
- Throwing inside `.then` rejects the next promise, which jumps to the nearest `.catch`.
- Forgetting `return` inside `.then` breaks the chain: the next step gets `undefined` and doesn't wait.
- The executor function in `new Promise(executor)` runs **synchronously**, right away.

```js
console.log('A');
new Promise(resolve => { console.log('B'); resolve(); }).then(() => console.log('D'));
console.log('C');
// A, B, C, D   <- B runs immediately; only .then is async
```

**Promise combinators (very common question):**

| Method | Resolves when | Rejects when | Use for |
| --- | --- | --- | --- |
| `Promise.all` | All fulfil (array of values, in order) | **Any** one rejects (fails fast) | Parallel requests that all must succeed |
| `Promise.allSettled` | All settle (array of `{status, value/reason}`) | Never | Parallel requests where some may fail |
| `Promise.race` | The **first** to settle fulfils | The first to settle rejects | Timeouts |
| `Promise.any` | The **first** to fulfil | All reject (`AggregateError`) | Fastest of several mirrors |

```js
// Parallel: total time = slowest request, not the sum
const [user, posts] = await Promise.all([fetchUser(1), fetchPosts(1)]);

// Timeout with race
const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms));
const data = await Promise.race([fetch('/api/slow'), timeout(3000)]);

// Some may fail
const results = await Promise.allSettled([fetchA(), fetchB()]);
results.forEach(r => r.status === 'fulfilled' ? console.log(r.value) : console.warn(r.reason));
```

**Turning a callback API into a promise ("promisify"):**

```js
function getUserAsync(id) {
  return new Promise((resolve, reject) => {
    getUser(id, (err, user) => (err ? reject(err) : resolve(user)));
  });
}
```

### async / await

**async/await is promise code written to look synchronous.** It's the same mechanism underneath.

- An `async` function **always returns a promise**. `return 5` becomes `Promise.resolve(5)`; throwing becomes a rejected promise.
- `await` pauses **only that function** until the promise settles; the rest of the program keeps running. The code after `await` resumes as a microtask.
- Use `try/catch` for errors.

```js
async function loadDashboard(userId) {
  try {
    const user = await getUser(userId);           // waits
    const orders = await getOrders(user.id);      // waits for the previous one (dependent)
    return { user, orders };
  } catch (err) {
    console.error('Failed:', err);
    throw err;                                     // re-throw so the caller knows
  } finally {
    hideSpinner();
  }
}

loadDashboard(1).then(data => console.log(data));  // it returns a promise
```

**Sequential vs parallel: the most common async/await mistake.**

```js
// Slow: 2 seconds total (each await waits before the next starts)
const a = await fetchA();   // 1s
const b = await fetchB();   // 1s

// Fast: 1 second total (both start immediately, then wait together)
const [a2, b2] = await Promise.all([fetchA(), fetchB()]);

// Also parallel: start first, await later
const pA = fetchA(), pB = fetchB();
const a3 = await pA, b3 = await pB;
```

**await inside loops:**

```js
// Sequential (one after another): fine when order matters or to avoid hammering an API
for (const id of ids) {
  const user = await fetchUser(id);
}

// Parallel
const users = await Promise.all(ids.map(id => fetchUser(id)));

// Bug: forEach does NOT wait for async callbacks
ids.forEach(async id => { await fetchUser(id); });
console.log('done');   // logs before any fetch finishes
```

**How await works internally.** An `async` function is roughly a generator + promises. At each `await`, the function's state is saved and it returns to the caller. When the promise settles, the rest of the function is scheduled as a microtask.

```js
async function f() {
  console.log('2');
  await null;            // everything below becomes a microtask
  console.log('4');
}
console.log('1');
f();
console.log('3');
// 1, 2, 3, 4
```

**Callbacks vs promises vs async/await in one line each:**

- **Callbacks:** the simplest, but they nest badly and you can't `return` or `try/catch` across them.
- **Promises:** chainable values with one `.catch`, and combinators for parallel work.
- **async/await:** promise logic that reads top-to-bottom with normal `try/catch`. This is the default today.

**Cancelling async work: AbortController.**

```js
const controller = new AbortController();
fetch('/api/search?q=re', { signal: controller.signal })
  .catch(err => { if (err.name === 'AbortError') console.log('cancelled'); });
controller.abort();   // e.g. when the user types again or the component unmounts
```

### Async gotchas

- Unhandled rejections: a promise without `.catch` (or an un-awaited async call) fails silently in older code and crashes Node.
- `await` only works inside `async` functions (or at the top level of ES modules).
- `fetch` only rejects on network failure. Check `res.ok` for 404/500.
- `try/catch` around a promise you didn't `await` won't catch its error.
- `return await` inside `try` matters: without `await`, the `catch` in that function won't catch the rejection.
- An infinite chain of microtasks blocks rendering just like a `while(true)` loop.

