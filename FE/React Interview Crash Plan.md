# React Interview Crash Plan

Nov 4, 2026 · @Anoop VIkraman

## Study schedule (tonight + tomorrow morning)

You have about 5 hours tonight and 1.5 hours tomorrow morning, so spend them on what's asked most: React and TypeScript first, then data fetching and testing, then the tooling topics. For each block, read the concepts, say the answers to the questions out loud, and memorize the gotchas.

| Time (IST) | Block | Goal |
| --- | --- | --- |
| 19:30–21:00 | JavaScript + React core | First 30 min: section 0 (event loop, promises, async/await, puzzles). Then explain rendering, hooks, keys and memoization without notes |
| 21:00–21:45 | TypeScript | Type props, events, generics, utility types, narrowing |
| 21:45–22:00 | Break | — |
| 22:00–22:40 | TanStack Query + testing | Query keys, staleTime vs gcTime, mutations; RTL query priority, mocking |
| 22:40–23:15 | Design patterns + SOLID | One React example per SOLID letter |
| 23:15–23:45 | Build tools + SASS + Web Components | One-liners for each "what/why/difference" question |
| 23:45–00:15 | Docker + GitLab CI | Write a Dockerfile and a .gitlab-ci.yml from memory |
| 00:15 | Sleep | Sleep beats one more hour of cramming |
| Morning, 60 min | Re-read every Gotchas list + final checklist | Fast recall |
| Morning, 30 min | Rehearse 2 project stories + "tell me about yourself" | Smooth delivery |

If the interview has a live coding round, swap the SASS/Web Components block for coding drills: a debounced search input, a todo list with filter, a fetch-with-loading-and-error component, and a custom `useFetch` or `useLocalStorage` hook.

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

### Part B: How JavaScript works internally

**How code runs: execution context in two phases.** Before running any function (or the whole script), the engine first scans it:

1. **Creation phase:** sets up memory for variables and functions (this is where "hoisting" comes from), the scope chain, and `this`.
2. **Execution phase:** runs the code line by line.

Each function call pushes a new execution context onto the **call stack**; when it returns, it's popped off. Infinite recursion fills the stack and gives "Maximum call stack size exceeded".

**The engine (V8, in Chrome and Node)** parses code into an AST, interprets it quickly into bytecode (Ignition), and compiles frequently run ("hot") code into optimised machine code (TurboFan): JIT, just-in-time compilation. Objects with the same shape share "hidden classes", which makes property access fast, so consistently shaped objects are faster.

### var, let, const and hoisting

|  | `var` | `let` | `const` |
| --- | --- | --- | --- |
| Scope | Function | Block `{ }` | Block `{ }` |
| Hoisted? | Yes, initialised to `undefined` | Yes, but uninitialised (TDZ) | Yes, but uninitialised (TDZ) |
| Re-declare | Allowed | Error | Error |
| Re-assign | Allowed | Allowed | Error (but object contents can change) |

```js
console.log(a);   // undefined   (var is hoisted with value undefined)
var a = 1;

console.log(b);   // ReferenceError: Cannot access 'b' before initialization
let b = 2;        // the time between the start of the block and this line = Temporal Dead Zone (TDZ)

sayHi();          // works: function declarations are hoisted completely
function sayHi() { console.log('hi'); }

sayBye();         // TypeError: sayBye is not a function (var hoisted as undefined)
var sayBye = function () {};

const user = { name: 'Ann' };
user.name = 'Bob';   // fine: const stops re-assignment, not mutation
user = {};           // TypeError
```

### Scope and closures

**Scope = where a variable can be seen.** JS uses **lexical scope**: a function can see variables from where it was **written**, not where it's called. If a variable isn't found locally, JS looks outward through the **scope chain** up to global.

**A closure = a function that remembers the variables around it, even after the outer function has finished.**

```js
function makeCounter() {
  let count = 0;                    // private: nothing outside can touch it directly
  return {
    increment: () => ++count,
    get: () => count,
  };
}
const counter = makeCounter();
counter.increment();
counter.increment();
console.log(counter.get());   // 2: count lives on inside the closure
```

**Where closures are used:** data privacy (module pattern), function factories, memoisation, event handlers, `debounce`/`throttle`, and every React hook (`useState` setters and effects close over the render's values; that's why stale closures happen).

**The classic closure-in-a-loop question:**

```js
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 100);
}
// 3, 3, 3: one shared function-scoped i, which is 3 by the time the timers run

for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 100);
}
// 0, 1, 2: let creates a NEW i for every loop iteration
```

**Memoisation with a closure:**

```js
function memoize(fn) {
  const cache = new Map();
  return (n) => {
    if (cache.has(n)) return cache.get(n);
    const result = fn(n);
    cache.set(n, result);
    return result;
  };
}
```

### The `this` keyword

**`this` is decided by HOW a function is called**, not where it's written. Arrow functions are the exception: they have no own `this` and use the surrounding one.

| How it's called | `this` is |
| --- | --- |
| `obj.method()` | `obj` (whatever is left of the dot) |
| `fn()` plain call | `undefined` in strict mode / modules, `window` in sloppy mode |
| `new Fn()` | the new object being created |
| `fn.call(x)`, `fn.apply(x)`, `fn.bind(x)` | `x` (explicit) |
| Arrow function | `this` of the surrounding code (lexical) |
| DOM event handler (`function`) | the element |

```js
const user = {
  name: 'Ann',
  regular() { return this.name; },
  arrow: () => this?.name,                    // arrow: `this` is from the outer (module) scope -> undefined
  delayed() {
    setTimeout(function () { console.log(this?.name); }, 0);  // undefined: plain call
    setTimeout(() => console.log(this.name), 0);              // 'Ann': arrow keeps delayed's this
  },
};

user.regular();            // 'Ann'
const fn = user.regular;
fn();                      // undefined: lost the object ("losing this")
const bound = user.regular.bind(user);
bound();                   // 'Ann'
```

**call vs apply vs bind:**

```js
function greet(greeting, punct) { return `${greeting}, ${this.name}${punct}`; }
const ann = { name: 'Ann' };

greet.call(ann, 'Hi', '!');          // call: arguments one by one, runs now
greet.apply(ann, ['Hi', '!']);       // apply: arguments as an Array, runs now
const later = greet.bind(ann, 'Hi'); // bind: returns a NEW function, runs later
later('?');                          // 'Hi, Ann?'
```

### Prototypes and inheritance

**Every object has a hidden link to another object, its prototype.** When you read a property that isn't on the object, JS follows the link up the **prototype chain** until it finds it or reaches `null`. That's how `[].map` works: `map` lives on `Array.prototype`, not on your array.

```js
const animal = { eats: true, walk() { return 'walking'; } };
const dog = Object.create(animal);   // dog's prototype = animal
dog.barks = true;

dog.barks;      // true  (own property)
dog.eats;       // true  (found on the prototype)
dog.hasOwnProperty('eats');          // false
Object.getPrototypeOf(dog) === animal; // true
```

**Classes are syntax sugar over prototypes:**

```js
class Person {
  constructor(name) { this.name = name; }   // own property on each instance
  greet() { return `Hi, ${this.name}`; }      // stored ONCE on Person.prototype, shared
}
class Dev extends Person {
  code() { return `${this.name} codes`; }
}

const d = new Dev('Ann');
// prototype chain: d -> Dev.prototype -> Person.prototype -> Object.prototype -> null
typeof Person;                                    // 'function'
d.greet === new Dev('Bob').greet;                 // true (shared method)
```

**What `new` does, in four steps:** creates an empty object, sets its prototype to `Fn.prototype`, runs `Fn` with `this` = the new object, and returns it (unless `Fn` returns another object).

### Types, equality and coercion

- **Primitives** (copied by value): `string`, `number`, `bigint`, `boolean`, `undefined`, `null`, `symbol`. **Objects** (copied by reference): objects, arrays, functions.
- `typeof null === 'object'` is a historical bug. `typeof []` is `'object'`; use `Array.isArray`.
- `==` converts types before comparing; `===` doesn't. Always use `===` (except `x == null`, which checks for both null and undefined).
- **Falsy values:** `false`, `0`, `-0`, `0n`, `''`, `null`, `undefined`, `NaN`. Everything else is truthy, including `[]`, `{}` and `'0'`.
- `NaN !== NaN`; use `Number.isNaN`. `0.1 + 0.2 !== 0.3` (floating point).
- `??` falls back only on `null`/`undefined`; `||` falls back on any falsy value (`0 || 10` is `10`, `0 ?? 10` is `0`).

```js
const a = { x: 1 };
const b = a;           // same reference
b.x = 2;
console.log(a.x);      // 2

{ x: 1 } === { x: 1 }  // false: two different objects

// Copies
const shallow = { ...a };                 // nested objects are still shared
const deep = structuredClone(a);          // real deep copy (modern browsers / Node 17+)

'5' + 1     // '51'   (+ with a string concatenates)
'5' - 1     // 4      (- converts to number)
[] + []     // ''
[] == false // true   (why you use ===)
```

### Memory and garbage collection

- JS frees memory automatically with **mark-and-sweep**: starting from roots (globals, the current stack), anything that can't be reached is collected.
- **Common memory leaks:** forgotten `setInterval`s, event listeners never removed, closures holding big objects, detached DOM nodes still referenced, ever-growing caches or global arrays.
- `WeakMap`/`WeakSet` hold keys weakly, so they don't prevent garbage collection, which makes them good for caching data about objects.

### Other frequently asked topics (one line each)

- **Event delegation:** one listener on a parent handles events from many children via bubbling (`e.target.closest('li')`).
- **Bubbling vs capturing:** events travel down (capture), then up (bubble). `stopPropagation` stops the travel; `preventDefault` stops the browser's default action.
- **Debounce vs throttle:** debounce waits until calls *stop* (search input); throttle runs at most once per interval (scroll, resize).
- **ES modules vs CommonJS:** `import/export` (static, tree-shakable, async-capable) vs `require/module.exports` (dynamic, synchronous, Node legacy).
- **map / filter / reduce:** `map` transforms each item, `filter` keeps some, `reduce` combines into one value. None of them mutate the original.
- **Mutating vs non-mutating array methods:** `push`, `pop`, `splice`, `sort` and `reverse` mutate. `map`, `filter`, `slice`, `concat`, `toSorted` and `toReversed` don't, which matters for React state.
- **Generators:** `function*` with `yield` can pause and resume; they're the idea behind async/await.
- **Storage:** `localStorage` persists, `sessionStorage` lasts one tab session, cookies are sent to the server with each request (`HttpOnly` for auth tokens).

### Part C: "What does this print?" puzzles

Cover the answer, predict the output, then check. Say your reasoning out loud: interviewers care about the *why*.

**Puzzle 1: the event loop (the most asked one)**

```js
console.log('start');
setTimeout(() => console.log('timeout'), 0);
Promise.resolve()
  .then(() => console.log('p1'))
  .then(() => console.log('p2'));
(async () => {
  console.log('async start');
  await null;
  console.log('async end');
})();
console.log('end');
```

Answer: `start, async start, end, p1, async end, p2, timeout`. Sync code runs first (the async function runs synchronously until its first `await`). Then microtasks in queue order: p1 (which queues p2), async end, p2. The macrotask (timeout) runs last.

**Puzzle 2: microtasks run between macrotasks**

```js
setTimeout(() => {
  console.log('t1');
  Promise.resolve().then(() => console.log('micro inside t1'));
}, 0);
setTimeout(() => console.log('t2'), 0);
```

Answer: `t1, micro inside t1, t2`. After each macrotask, all microtasks are drained before the next macrotask.

**Puzzle 3: hoisting inside a function**

```js
var x = 1;
function f() {
  console.log(x);
  var x = 2;
}
f();
```

Answer: `undefined`. The local `var x` is hoisted to the top of `f` and shadows the global one.

**Puzzle 4: catch recovers the chain**

```js
Promise.reject(new Error('boom'))
  .then(() => console.log('a'))
  .catch(() => { console.log('b'); return 1; })
  .then(v => console.log('c', v));
```

Answer: `b, c 1`. The rejection skips `.then`; `.catch` handles it, and its return value continues the chain as a success.

**Puzzle 5: a promise settles only once**

```js
new Promise((resolve, reject) => {
  resolve(1);
  resolve(2);
  reject(new Error('x'));
}).then(v => console.log(v)).catch(() => console.log('caught'));
```

Answer: `1`. Only the first settle counts; later calls are ignored.

**Puzzle 6: async functions return promises**

```js
async function getNum() { return 42; }
console.log(getNum());
getNum().then(n => console.log(n));
```

Answer: `Promise {<fulfilled>: 42}`, then `42`. You need `await` or `.then` to get the value.

**Puzzle 7: `this` with arrow functions inside methods**

```js
const obj = {
  n: 10,
  regular() { return this.n; },
  arrowInside() { return (() => this.n)(); },
  arrowProp: () => this?.n,
};
console.log(obj.regular(), obj.arrowInside(), obj.arrowProp());
```

Answer: `10 10 undefined`. The arrow inside a method borrows the method's `this` (obj). The arrow as a property borrows the module's `this` (undefined).

**Puzzle 8: references**

```js
let a = { v: 1 };
let b = a;
b.v = 2;
b = { v: 3 };
console.log(a.v, b.v);
```

Answer: `2 3`. `b.v = 2` changes the shared object. `b = {...}` points `b` at a new object without touching `a`.

**Puzzle 9: closures share variables**

```js
function createFns() {
  const fns = [];
  for (var i = 0; i < 3; i++) fns.push(() => i);
  return fns;
}
console.log(createFns().map(fn => fn()));
```

Answer: `[3, 3, 3]`. Change `var` to `let` to get `[0, 1, 2]`.

**Puzzle 10: coercion**

```js
console.log(1 + '2', '3' * '4', true + 1, [] == 0, null == undefined, null === undefined, typeof NaN);
```

Answer: `'12' 12 2 true true false 'number'`.

### Write it yourself (common live-coding tasks)

**Debounce:** run only after calls stop for `delay` ms (search input).

```js
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);                              // cancel the previous scheduled call
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
const onSearch = debounce(q => console.log('search', q), 300);
```

**Throttle:** run at most once per `interval` ms (scroll).

```js
function throttle(fn, interval) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= interval) {
      last = now;
      fn.apply(this, args);
    }
  };
}
```

**Promise.all:**

```js
function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    const results = [];
    let done = 0;
    if (promises.length === 0) return resolve(results);
    promises.forEach((p, i) => {
      Promise.resolve(p)                 // also accepts plain values
        .then(value => {
          results[i] = value;            // keep original order
          if (++done === promises.length) resolve(results);
        })
        .catch(reject);                  // first rejection wins
    });
  });
}
```

**sleep and retry with backoff:**

```js
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retry(fn, retries = 3, delay = 500) {
  try {
    return await fn();
  } catch (err) {
    if (retries === 0) throw err;
    await sleep(delay);
    return retry(fn, retries - 1, delay * 2);   // exponential backoff
  }
}
```

**Function.prototype.bind:**

```js
Function.prototype.myBind = function (context, ...preset) {
  const fn = this;
  return function (...later) {
    return fn.apply(context, [...preset, ...later]);
  };
};
```

**Array.prototype.map and reduce:**

```js
Array.prototype.myMap = function (callback) {
  const result = [];
  for (let i = 0; i < this.length; i++) result.push(callback(this[i], i, this));
  return result;
};

const total = [1, 2, 3].reduce((sum, n) => sum + n, 0);              // 6
const byId = users.reduce((acc, u) => ({ ...acc, [u.id]: u }), {});  // array -> lookup object
```

**Flatten a nested array and deep clone:**

```js
const flatten = (arr) => arr.reduce((acc, x) => acc.concat(Array.isArray(x) ? flatten(x) : x), []);
flatten([1, [2, [3, [4]]]]);   // [1, 2, 3, 4]   (built-in: arr.flat(Infinity))

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  const copy = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) copy[key] = deepClone(obj[key]);
  return copy;
}
```

**Memoised fetch with a closure + promises (combines several topics):**

```js
const cache = new Map();
function cachedFetch(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then(r => r.json()).catch(err => { cache.delete(url); throw err; }));
  }
  return cache.get(url);   // concurrent callers share the same in-flight promise
}
```

### JavaScript checklist

- [ ] Draw the event loop and explain microtask vs macrotask order
- [ ] Callbacks vs promises vs async/await, and why each replaced the last
- [ ] `Promise.all` vs `allSettled` vs `race` vs `any`
- [ ] Sequential vs parallel `await`; why `forEach` + async is a bug
- [ ] Closures with a real use case; the `var` loop puzzle
- [ ] Hoisting and the TDZ; `var`/`let`/`const`
- [ ] Four rules of `this` + arrow functions; `call`/`apply`/`bind`
- [ ] Prototype chain; what `new` does; classes as sugar
- [ ] `==` vs `===`, falsy values, reference vs value, shallow vs deep copy
- [ ] Write debounce, throttle and `Promise.all` from memory

## 1. React core (highest priority)

Most interview time goes here. Be ready to explain why a component re-renders and how to stop it.

### Explained simply (read this first)

**A component is just a function that returns UI.** React calls it, looks at what it returns, and updates the screen to match. Every time the component's data changes, React calls the function again (this is a "re-render") and only changes the parts of the screen that are different.

```tsx
function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}</h1>;   // props in -> UI out
}
```

**State is the component's memory.** A normal variable resets every time the function runs. `useState` keeps the value between renders, and calling the setter tells React "something changed, run me again".

```tsx
function Counter() {
  const [count, setCount] = useState(0);
  // let x = 0;  <- would reset to 0 on every render, and changing it never updates the screen
  return <button onClick={() => setCount(c => c + 1)}>Clicked {count} times</button>;
}
```

**Each render is a photo, not a live video.** Inside one render, `count` is a fixed number. Calling `setCount` doesn't change it right away; it schedules the next render.

```tsx
function handleClick() {
  setCount(count + 1);
  setCount(count + 1);
  console.log(count); // still the OLD value, and count only goes up by 1

  // Fix: use the updater function, which always receives the latest value
  setCount(c => c + 1);
  setCount(c => c + 1); // now it goes up by 2
}
```

**Why components re-render (only 3 reasons):**

1. Its own state changed.
2. Its parent re-rendered (children re-render by default, even if their props are the same).
3. A context it reads changed.

**Keys are name tags for list items.** They tell React which item is which when the list changes. If you use the index as the key and delete the first item, every item's "name tag" shifts, and typed input text or checkbox state ends up on the wrong row.

```tsx
// Bad: index changes when items are added, removed or reordered
{todos.map((t, i) => <TodoRow key={i} todo={t} />)}
// Good: a stable id from the data
{todos.map(t => <TodoRow key={t.id} todo={t} />)}
```

**useEffect = "after you've drawn the screen, also do this".** Use it to talk to things outside React: fetching, timers, subscriptions, the DOM. The dependency array says *when* to run it again, and the returned function cleans up.

```tsx
useEffect(() => {
  const id = setInterval(() => setSeconds(s => s + 1), 1000);
  return () => clearInterval(id);    // cleanup: runs before the next effect and on unmount
}, []);                              // [] = run once after mount

// [] -> once on mount | [userId] -> whenever userId changes | no array -> after every render
```

**Safe data fetching in an effect** (avoids showing old results when the user switches quickly):

```tsx
function User({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/users/${id}`, { signal: controller.signal })
      .then(res => { if (!res.ok) throw new Error('Failed'); return res.json(); })
      .then(setUser)
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();   // cancel the old request when id changes
  }, [id]);

  if (error) return <p>{error}</p>;
  if (!user) return <p>Loading...</p>;
  return <h2>{user.name}</h2>;
}
```

**useRef = a box that survives renders but doesn't cause them.** Two uses: grabbing a DOM element, and storing a value you don't want to display (a timer id, the previous value).

```tsx
const inputRef = useRef<HTMLInputElement>(null);
<input ref={inputRef} />
<button onClick={() => inputRef.current?.focus()}>Focus</button>
```

**useMemo, useCallback and React.memo work as a team.** Every render creates new objects and functions. `React.memo` makes a child skip re-rendering if its props look the same, but a new function every render never "looks the same". `useCallback` keeps the same function between renders, so the memo can do its job.

```tsx
const ExpensiveList = React.memo(function ExpensiveList({ items, onSelect }: Props) {
  return <ul>{items.map(i => <li key={i.id} onClick={() => onSelect(i.id)}>{i.name}</li>)}</ul>;
});

function Parent() {
  const [query, setQuery] = useState('');
  const [items] = useState(bigList);
  const filtered = useMemo(() => items.filter(i => i.name.includes(query)), [items, query]); // cached result
  const handleSelect = useCallback((id: string) => console.log(id), []);                       // same function every render
  return <><input value={query} onChange={e => setQuery(e.target.value)} /><ExpensiveList items={filtered} onSelect={handleSelect} /></>;
}
```

Rule of thumb to say in the interview: "I don't memoize everything. I measure with the Profiler first, and memoize when a component is slow or receives props from a parent that re-renders a lot."

**Context = a way to skip passing props through every level.** Good for things many components need and that rarely change (theme, logged-in user).

```tsx
const ThemeContext = createContext<'light' | 'dark'>('light');

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  return <ThemeContext.Provider value={theme}><Page /></ThemeContext.Provider>;
}
function DeepChild() {
  const theme = useContext(ThemeContext); // no prop drilling
  return <div className={theme}>...</div>;
}
```

**Custom hooks = reusable logic.** Any function starting with `use` that calls other hooks. Each component that uses it gets its own separate state.

```tsx
function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);   // user typed again: cancel the old timer
  }, [value, delay]);
  return debounced;
}

// usage
const [search, setSearch] = useState('');
const debouncedSearch = useDebounce(search, 500); // only changes 500ms after typing stops
```

**useReducer = useState for when updates follow rules.** All the "how state changes" logic lives in one pure function.

```tsx
type Action = { type: 'add'; text: string } | { type: 'toggle'; id: number };

function todosReducer(state: Todo[], action: Action): Todo[] {
  switch (action.type) {
    case 'add':    return [...state, { id: Date.now(), text: action.text, done: false }];
    case 'toggle': return state.map(t => t.id === action.id ? { ...t, done: !t.done } : t);
  }
}
const [todos, dispatch] = useReducer(todosReducer, []);
dispatch({ type: 'add', text: 'Learn React' });
```

**Error boundaries catch crashes during rendering** so one broken widget doesn't blank the whole page. They still have to be class components (or use the `react-error-boundary` package).

```tsx
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() { return this.state.hasError ? <p>Something went wrong.</p> : this.props.children; }
}
```

**Lazy loading = only download code when it's needed.**

```tsx
const Settings = React.lazy(() => import('./Settings'));
<Suspense fallback={<Spinner />}><Settings /></Suspense>
```

**Controlled vs uncontrolled inputs in one picture:**

```tsx
// Controlled: React state is the source of truth
const [email, setEmail] = useState('');
<input value={email} onChange={e => setEmail(e.target.value)} />

// Uncontrolled: the DOM keeps the value; read it when you need it
function Form() {
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    console.log(data.get('email'));
  };
  return <form onSubmit={onSubmit}><input name="email" defaultValue="" /><button>Send</button></form>;
}
```

**React 19 forms in one example** (Actions handle the pending state for you):

```tsx
function SignupForm() {
  const [error, submitAction, isPending] = useActionState(async (_prev: string | null, formData: FormData) => {
    const res = await signup(formData.get('email') as string);
    return res.ok ? null : 'Signup failed';
  }, null);
  return (
    <form action={submitAction}>
      <input name="email" />
      <button disabled={isPending}>{isPending ? 'Saving...' : 'Sign up'}</button>
      {error && <p>{error}</p>}
    </form>
  );
}
```

### Core concepts

- **Rendering model:** a re-render happens when state changes, when the parent re-renders, or when a consumed context changes. Props changing is not itself a trigger: the parent re-rendering is. Each render is a snapshot: state and props are constant inside it.
- **Render vs commit:** in the render phase React calls your components and diffs the results (it must be pure). In the commit phase it updates the DOM, then runs `useLayoutEffect`, paints, then runs `useEffect`.
- **Reconciliation:** React compares element type and `key`. A different type unmounts the whole subtree. Keys identify list items across renders.
- **Fiber:** the internal architecture that splits rendering into interruptible units. This is what makes concurrent features (`useTransition`, Suspense) possible.
- **Controlled vs uncontrolled inputs:** controlled means React state drives `value`; uncontrolled means the DOM holds the value and you read it via `ref` or `FormData`.
- **Lifting state up vs Context vs external store:** colocate state first, lift it when siblings need it, and use Context for low-frequency global values (theme, auth). Use Zustand, Redux Toolkit or Jotai for frequently changing shared client state, and TanStack Query for server state.
- **Strict Mode (dev only):** double-invokes renders and mounts, unmounts and remounts effects, to expose impure code and missing cleanups.

### Hooks cheat sheet

| Hook | Use for | Key point |
| --- | --- | --- |
| `useState` | Local state | Use the functional update `setX(prev => prev + 1)` when the next value depends on the previous one |
| `useReducer` | Complex or related state transitions | `dispatch` has a stable identity |
| `useEffect` | Syncing with external systems | Runs after paint; return a cleanup function |
| `useLayoutEffect` | Measuring the DOM before paint | Blocks paint; use sparingly |
| `useRef` | Mutable value or DOM node | Changing `.current` does not re-render |
| `useMemo` | Caching an expensive calculation | A performance hint, not a guarantee |
| `useCallback` | Stable function identity | Only useful when passed to a memoized child or used in deps |
| `useContext` | Reading context | Every consumer re-renders when the value changes |
| `useTransition` / `useDeferredValue` | Marking updates non-urgent | Keeps typing responsive during heavy renders |
| `useId` | SSR-safe unique ids | Use for `htmlFor`/`aria-*`, not for list keys |
| `useImperativeHandle` | Exposing methods via ref | Pair with `forwardRef` (in React 19, `ref` is a regular prop) |
| `useSyncExternalStore` | Subscribing to external stores | What state libraries use internally |

**Rules of hooks:** call them only at the top level (no conditions or loops) and only from components or custom hooks. React tracks hooks by call order.

### React 18/19 features worth naming

- Automatic batching (18): all state updates are batched, including ones inside promises and timeouts.
- `createRoot`, concurrent rendering, Suspense for data fetching, streaming SSR.
- React 19: Actions, `useActionState`, `useFormStatus`, `useOptimistic`, the `use()` hook (read a promise or context, and it may be called conditionally), `ref` as a prop, document metadata tags, Server Components and Server Actions (via frameworks like Next.js).
- React Compiler: automatic memoization at build time, which reduces the need for manual `useMemo`/`useCallback`.

### Performance toolkit

1. Measure first with the React DevTools Profiler.
2. Move state down or lift content up (pass `children`) so less re-renders.
3. `React.memo` + stable props (`useCallback`/`useMemo`).
4. Split contexts, or memoize the context value object.
5. Virtualize long lists (TanStack Virtual, react-window).
6. Code-split with `React.lazy` + `Suspense`.
7. Use `useTransition` for expensive updates.

### Likely questions

- What is the virtual DOM and why use it? (Answer: a cheap tree you can diff; React applies the minimal DOM changes. It is not inherently "faster than the DOM".)
- Why shouldn't you use the array index as a key?
- How do you prevent unnecessary re-renders?
- `useEffect` vs `useLayoutEffect`?
- How would you fetch data in an effect safely? (Use an AbortController or an ignore flag in the cleanup.)
- What are error boundaries? (Class components with `getDerivedStateFromError`/`componentDidCatch`. They don't catch errors in event handlers, async code or SSR.)
- What are portals for? (Modals and tooltips: rendering outside the parent DOM, while events still bubble through the React tree.)
- What is a HOC vs a custom hook vs render props?
- SSR vs CSR vs SSG vs RSC?

### Gotchas

- **Stale closures:** an interval or effect captures old state. Fix with a functional update, correct dependencies, or a ref.
- `setState` is asynchronous within a render: `setCount(count + 1)` called twice adds 1, not 2.
- **Object/array dependencies** recreated every render cause effects to run every time.
- `{count && <X/>}` renders `0` when count is 0. Use `count > 0 &&`.
- Mutating state (`arr.push`) doesn't trigger a re-render. Always create new references.
- Index keys with reorderable lists cause state to stick to the wrong item.
- Defining a component inside another component remounts it every render, so it loses state.
- `useEffect` without cleanup leaks subscriptions and timers. Strict Mode exposes this.
- **You might not need an effect:** derive values during render instead of syncing state with effects.
- A context `value={{a, b}}` makes a new object every render, which re-renders every consumer.
- Resetting state: change the component's `key` to remount it.

## 2. TypeScript

Expect questions on typing React code and on the type system itself: `type` vs `interface`, generics, narrowing and utility types.

### Explained simply (read this first)

**TypeScript is JavaScript with labels.** You label what kind of value something is, and the editor warns you *before running* if you use it wrong. The labels are deleted when the code is compiled, so they don't exist in the browser.

```ts
let age: number = 30;
age = 'thirty';            // Error: string is not assignable to number

function add(a: number, b: number): number { return a + b; }
add(1, '2');               // Error caught while typing, not in production
```

**Describing objects: `type` and `interface` mostly do the same job.**

```ts
interface User { id: number; name: string; email?: string }   // ? = optional
type Product = { id: number; title: string; price: number };

// Only `type` can do unions ("one of these")
type Status = 'idle' | 'loading' | 'success' | 'error';

// Only `interface` merges when declared twice
interface Window { myGlobal: string }   // adds to the built-in Window type

// Both can extend
interface Admin extends User { permissions: string[] }
type Admin2 = User & { permissions: string[] };   // & = intersection ("both")
```

**`any` vs `unknown`:** `any` means "stop checking" (dangerous). `unknown` means "I don't know yet, so check before using it" (safe).

```ts
const a: any = JSON.parse(text);
a.foo.bar();               // no error... crashes at runtime

const u: unknown = JSON.parse(text);
u.foo;                     // Error: must narrow first
if (typeof u === 'object' && u !== null && 'foo' in u) { /* now allowed */ }
```

**Narrowing = TypeScript follows your if-checks.** After a check, it knows the more specific type.

```ts
function format(value: string | number) {
  if (typeof value === 'string') return value.toUpperCase(); // here: string
  return value.toFixed(2);                                   // here: number
}
```

**Discriminated unions = the best way to model UI states.** A shared field (`status`) tells TypeScript which shape you have, so you can't read `data` while loading.

```ts
type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: User[] };

function render(s: State) {
  switch (s.status) {
    case 'loading': return 'Loading...';
    case 'error':   return s.message;       // TS knows message exists here
    case 'success': return s.data.length;   // and data exists here
    default: {
      const _never: never = s;              // compile error if you add a status and forget it
      return _never;
    }
  }
}
```

**Generics = a type parameter, like a function argument but for types.** Write once, works for any type, and still keeps the exact type.

```ts
function first<T>(arr: T[]): T | undefined { return arr[0]; }
const n = first([1, 2, 3]);       // n: number
const s = first(['a', 'b']);      // s: string

// Constraint: T must have an id
function findById<T extends { id: number }>(items: T[], id: number) {
  return items.find(i => i.id === id);
}

// A generic API helper
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<T>;
}
const users = await getJson<User[]>('/api/users');
```

**Utility types = ready-made type transformers.**

```ts
interface User { id: number; name: string; email: string; password: string }

type UserUpdate  = Partial<User>;                 // all fields optional (for PATCH)
type PublicUser  = Omit<User, 'password'>;         // remove a field
type UserPreview = Pick<User, 'id' | 'name'>;      // keep only some fields
type ById        = Record<number, User>;           // { [id: number]: User }
type Frozen      = Readonly<User>;                 // can't reassign fields

function getUser() { return { id: 1, name: 'A' }; }
type FromFn = ReturnType<typeof getUser>;          // { id: number; name: string }
```

**`keyof` and `as const`:**

```ts
type UserKey = keyof User;                 // 'id' | 'name' | 'email' | 'password'
function getField(u: User, key: keyof User) { return u[key]; }

const ROLES = ['admin', 'editor', 'viewer'] as const;   // readonly tuple of literals
type Role = typeof ROLES[number];                       // 'admin' | 'editor' | 'viewer'
```

**`satisfies`:** checks a value matches a type but keeps the precise inferred type.

```ts
const routes = { home: '/', profile: '/profile' } satisfies Record<string, string>;
routes.home;      // still known as a key; typos like routes.hom are errors
```

### Typing React components step by step

```tsx
// 1. Props
type CardProps = {
  title: string;
  subtitle?: string;                 // optional
  children: React.ReactNode;         // anything renderable
  onClose: () => void;               // a function with no args
};
function Card({ title, subtitle, children, onClose }: CardProps) { /* ... */ }

// 2. State that starts empty
const [user, setUser] = useState<User | null>(null);
const [items, setItems] = useState<string[]>([]);      // without <string[]> it'd be never[]

// 3. Events
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value);
const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => e.preventDefault();
const handleClick  = (e: React.MouseEvent<HTMLButtonElement>) => {};

// 4. Refs
const inputRef = useRef<HTMLInputElement>(null);

// 5. Extending a native element's props (so all <button> props work)
type ButtonProps = React.ComponentProps<'button'> & { variant?: 'primary' | 'secondary' };
function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  return <button className={`btn btn-${variant} ${className ?? ''}`} {...rest} />;
}

// 6. A custom hook with a typed return
function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn(o => !o), []);
  return [on, toggle] as const;     // as const -> tuple [boolean, () => void], not (boolean | fn)[]
}

// 7. Typed context with a safe hook
const AuthContext = createContext<{ user: User | null } | undefined>(undefined);
function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
```

**Validating API data at runtime with Zod** (because TS types vanish at runtime):

```ts
import { z } from 'zod';
const UserSchema = z.object({ id: z.number(), name: z.string(), email: z.string().email() });
type User = z.infer<typeof UserSchema>;          // one source of truth for type + validation

const user = UserSchema.parse(await res.json()); // throws if the API sends garbage
```

### Core concepts

- **`type` vs `interface`:** both describe object shapes. Interfaces can be merged by redeclaring them and extended with `extends`. Types support unions, intersections, mapped types and conditional types. A common rule: interfaces for public object contracts, types for everything else.
- **`any` vs `unknown` vs `never`:** `any` turns off checking. `unknown` must be narrowed before use, so it's the safe choice for external data. `never` is the type of something that can't happen, which makes it useful for exhaustive checks.
- **Narrowing:** `typeof`, `instanceof`, `in`, discriminated unions (a shared `kind` field), and user-defined type guards (`function isUser(x): x is User`).
- **Generics:** `function first<T>(arr: T[]): T`, with constraints like `<T extends { id: string }>`.
- **Utility types:** `Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`, `ReturnType`, `Parameters`, `Awaited`, `NonNullable`, `Extract`, `Exclude`.
- **Advanced:** `keyof`, `typeof` on values, indexed access `T['key']`, mapped types, conditional types with `infer`, template literal types, `as const`, and `satisfies` (checks a value against a type while keeping the narrower inferred type).
- **Enums vs union literals:** many teams prefer `type Size = 'sm' | 'md'` because enums generate runtime code.

### TypeScript in React

```tsx
type ButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  variant?: 'primary' | 'ghost';
};

function Button({ variant = 'primary', ...rest }: ButtonProps) {
  return <button data-variant={variant} {...rest} />;
}

const [user, setUser] = useState<User | null>(null);
const inputRef = useRef<HTMLInputElement>(null);
const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {};

// Generic component
function List<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  return <ul>{items.map(render)}</ul>;
}
```

- `children: React.ReactNode` is the type for anything renderable.
- Many teams avoid `React.FC`: it adds little, and older versions added implicit `children`.
- Discriminated union props: `{ status: 'loading' } | { status: 'error'; error: Error } | { status: 'ok'; data: T }`.

### Likely questions

- `type` vs `interface`?
- `unknown` vs `any`?
- How do you type an API response you don't trust? (Use `unknown` + runtime validation with Zod.)
- Write a generic function or hook.
- What does `strict` mode enable? (`strictNullChecks`, `noImplicitAny`, and more.)

### Gotchas

- Types are erased at runtime, so TypeScript can't validate API data. Use Zod or Valibot for that.
- `as` casts lie to the compiler. Prefer narrowing.
- The non-null assertion `!` hides real null bugs.
- `Object.keys(obj)` returns `string[]`, not `(keyof T)[]`.
- Exhaustive `switch`: put `const _exhaustive: never = x;` in `default` to catch unhandled cases.
- Using `{}` as a type means "any non-null value", not "empty object".

## 3. TanStack Query (v5)

The main idea: TanStack Query manages **server state** (async data you don't own: caching, deduping, background refetching). It is not a replacement for client state like a modal's open flag.

### Explained simply (read this first)

**Think of TanStack Query as a smart cache between your components and your API.** You ask for data by a name (the query key). If it's already in the cache, you get it instantly. If it's old ("stale"), you still get the cached copy right away while it quietly refetches in the background.

**The problem it solves.** Without it, every component that fetches needs this boilerplate, and it still has no caching:

```tsx
// Without TanStack Query
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);
useEffect(() => {
  let ignore = false;
  fetch('/api/todos').then(r => r.json())
    .then(d => { if (!ignore) setData(d); })
    .catch(e => { if (!ignore) setError(e); })
    .finally(() => { if (!ignore) setLoading(false); });
  return () => { ignore = true; };
}, []);

// With TanStack Query: same result + caching, dedupe, retries, refetch on focus
const { data, isPending, error } = useQuery({ queryKey: ['todos'], queryFn: fetchTodos });
```

**Setup (once, at the top of the app):**

```tsx
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },  // data is "fresh" for 30s
});

createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
```

**A typical fetch function:**

```ts
async function fetchTodos(): Promise<Todo[]> {
  const res = await fetch('/api/todos');
  if (!res.ok) throw new Error('Failed to fetch todos'); // important: fetch doesn't throw on 404/500
  return res.json();
}
```

**Reading data in a component:**

```tsx
function TodoList() {
  const { data: todos, isPending, isError, error, isFetching } = useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  });

  if (isPending) return <p>Loading...</p>;            // first load, nothing cached
  if (isError)   return <p>Error: {error.message}</p>;
  return (
    <>
      {isFetching && <small>Refreshing...</small>}     {/* background refetch */}
      <ul>{todos.map(t => <li key={t.id}>{t.title}</li>)}</ul>
    </>
  );
}
```

**Query keys work like dependency arrays.** Put every variable the fetch uses in the key. When the key changes, it fetches the new data, and each key is cached separately.

```tsx
function Todo({ id }: { id: number }) {
  const { data } = useQuery({
    queryKey: ['todos', id],                         // ['todos', 1], ['todos', 2] cached separately
    queryFn: () => fetch(`/api/todos/${id}`).then(r => r.json()),
    enabled: !!id,                                   // don't run until we have an id
  });
}
```

**staleTime vs gcTime, with an analogy.** Think of milk in the fridge:

- `staleTime` = the "best before" date. Before it, the data is fresh and is used without refetching. After it, the data is still shown, but React Query refetches it in the background.
- `gcTime` = how long the milk stays in the fridge after nobody is using it. After 5 minutes (default) with no component reading that key, it's thrown out of memory.

**Changing data: mutations + invalidation.** After you create, update or delete something, tell the cache "the todos list is out of date", and every component showing it refetches automatically.

```tsx
function AddTodo() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (title: string) =>
      fetch('/api/todos', { method: 'POST', body: JSON.stringify({ title }), headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });  // marks ['todos'] AND ['todos', id] stale
    },
  });

  return (
    <button onClick={() => mutation.mutate('New todo')} disabled={mutation.isPending}>
      {mutation.isPending ? 'Adding...' : 'Add'}
    </button>
  );
}
```

**Optimistic update = update the screen first, fix it if the server says no.**

```tsx
useMutation({
  mutationFn: toggleTodo,
  onMutate: async (id: number) => {
    await queryClient.cancelQueries({ queryKey: ['todos'] });          // 1. stop in-flight refetches
    const previous = queryClient.getQueryData<Todo[]>(['todos']);      // 2. save a backup
    queryClient.setQueryData<Todo[]>(['todos'], old =>                 // 3. update the cache now
      old?.map(t => t.id === id ? { ...t, done: !t.done } : t));
    return { previous };
  },
  onError: (_err, _id, context) => {
    queryClient.setQueryData(['todos'], context?.previous);           // 4. roll back on failure
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: ['todos'] }), // 5. resync with server
});
```

**Pagination without flashing a spinner on each page:**

```tsx
const [page, setPage] = useState(1);
const { data, isPlaceholderData } = useQuery({
  queryKey: ['todos', page],
  queryFn: () => fetchTodosPage(page),
  placeholderData: keepPreviousData,   // keep showing page 1 while page 2 loads
});
<button disabled={isPlaceholderData || !data?.hasMore} onClick={() => setPage(p => p + 1)}>Next</button>
```

**Infinite scroll:**

```tsx
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchFeed(pageParam),
  initialPageParam: 0,
  getNextPageParam: lastPage => lastPage.nextCursor ?? undefined, // undefined = no more pages
});
const allItems = data?.pages.flatMap(p => p.items) ?? [];
```

**Reusable, type-safe query definitions** (a pattern interviewers like):

```ts
export const todoQueries = {
  all:    () => queryOptions({ queryKey: ['todos'], queryFn: fetchTodos }),
  detail: (id: number) => queryOptions({ queryKey: ['todos', id], queryFn: () => fetchTodo(id) }),
};

useQuery(todoQueries.detail(5));
queryClient.prefetchQuery(todoQueries.detail(6));   // e.g. on hover, before the user clicks
```

### Core concepts

- **Query key:** an array that uniquely identifies the data, such as `['todos', { status, page }]`. When the key changes, the data is refetched. Everything the query function uses should be in the key.
- **`staleTime`** (default 0): how long data counts as fresh. Fresh data is served from cache with no refetch.
- **`gcTime`** (renamed from `cacheTime` in v5, default 5 min): how long an *unused* query stays in memory before it's garbage collected.
- **Automatic refetch** of stale queries on mount, on window focus and on reconnect. All configurable.
- **Statuses:** `status` is `pending | error | success` (v5 renamed `loading` to `pending`). `fetchStatus` is `fetching | paused | idle`. `isLoading` = pending and fetching for the first time.
- **Mutations:** `useMutation` + `queryClient.invalidateQueries({ queryKey: ['todos'] })` in `onSuccess`/`onSettled`.
- **Optimistic updates:** in `onMutate`, cancel queries, snapshot the old data, `setQueryData`; roll back in `onError`; invalidate in `onSettled`.
- Other features: `enabled` (dependent queries), `select` (transform or subscribe to a slice), `placeholderData: keepPreviousData` (pagination), `useInfiniteQuery`, `prefetchQuery`, `useSuspenseQuery`, `retry` (3 by default, with exponential backoff).

```tsx
const todosQuery = (status: string) => queryOptions({
  queryKey: ['todos', status],
  queryFn: ({ signal }) => fetch(`/api/todos?status=${status}`, { signal }).then(r => r.json()),
  staleTime: 60_000,
});

const { data, isPending, error } = useQuery(todosQuery('open'));

const qc = useQueryClient();
const addTodo = useMutation({
  mutationFn: createTodo,
  onSuccess: () => qc.invalidateQueries({ queryKey: ['todos'] }),
});
```

### Likely questions

- Why use TanStack Query instead of `useEffect` + `useState`? (It handles caching, deduping, race conditions, retries, background updates and loading/error state, and lets you delete a lot of Redux code.)
- `staleTime` vs `gcTime`?
- How do you implement optimistic updates?
- How do you handle pagination or infinite scroll?
- How do you share a query between components? (Use the same key: it's deduped and fetched once.)

### Gotchas

- `fetch` doesn't reject on 4xx/5xx. Throw in `queryFn` when `!res.ok`, or the query reports success.
- With the default `staleTime` of 0, data refetches on every mount and window focus, which surprises people.
- Leaving variables out of the query key gives you stale or wrong cached data.
- Copying query data into `useState` creates two sources of truth.
- Create the `QueryClient` once (outside the component, or in `useState`), not on every render.
- In tests: a new `QueryClient` per test, with `retry: false`.

## 4. Testing: Jest, Vitest, Testing Library

The philosophy to quote: "The more your tests resemble the way your software is used, the more confidence they give you." Test behaviour, not implementation details.

### Explained simply (read this first)

**Three tools, three jobs:**

- **Jest or Vitest = the test runner.** It finds `*.test.ts` files, runs them, and gives you `describe`, `test`, `expect` and mocking. Vitest is basically "Jest, but built on Vite" with almost the same API.
- **jsdom = a fake browser** inside Node, so components can render without a real browser.
- **React Testing Library (RTL) = how you interact with components** in tests, the way a user would: find a button by its text, click it, check what appears.

**The shape of every test: Arrange, Act, Assert.**

```ts
// sum.ts
export const sum = (a: number, b: number) => a + b;

// sum.test.ts
import { describe, test, expect } from 'vitest';   // with Jest these are globals
import { sum } from './sum';

describe('sum', () => {
  test('adds two numbers', () => {
    const a = 2, b = 3;            // Arrange
    const result = sum(a, b);      // Act
    expect(result).toBe(5);        // Assert
  });
});
```

**Common matchers:** `toBe` (exact, for primitives), `toEqual` (deep equality, for objects/arrays), `toBeTruthy`, `toContain`, `toThrow`, `toHaveBeenCalledWith`, `toHaveLength`. `toBe({a:1})` fails because two objects are never the same reference; use `toEqual`.

**Vitest setup for React:**

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,                     // use describe/test/expect without importing
    setupFiles: './src/setupTests.ts',
  },
});

// src/setupTests.ts
import '@testing-library/jest-dom/vitest';   // adds toBeInTheDocument, etc.
```

**Your first component test:**

```tsx
// Counter.tsx
export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </>
  );
}

// Counter.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('increments the count when clicked', async () => {
  const user = userEvent.setup();
  render(<Counter />);

  expect(screen.getByText('Count: 0')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /increment/i }));
  expect(screen.getByText('Count: 1')).toBeInTheDocument();
});
```

**Why `getByRole`?** It finds elements the way screen readers do (button, textbox, heading, checkbox), so your test also checks accessibility. If you can't find something by role, real users with assistive tech probably can't either.

**Which query to use, simplified:**

| You want to... | Use | If not found |
| --- | --- | --- |
| Get something that should be there now | `getBy...` | Throws an error (test fails) |
| Check something is NOT there | `queryBy...` | Returns `null` |
| Wait for something to appear (after a fetch) | `await findBy...` | Rejects after \~1s timeout |

```tsx
expect(screen.queryByText('Error')).not.toBeInTheDocument();  // absence
expect(await screen.findByText('Loaded!')).toBeInTheDocument(); // async
```

**Testing forms:**

```tsx
test('submits the email', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();                         // a fake function that records calls
  render(<LoginForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText(/email/i), 'a@b.com');
  await user.click(screen.getByRole('button', { name: /log in/i }));

  expect(onSubmit).toHaveBeenCalledWith({ email: 'a@b.com' });
  expect(onSubmit).toHaveBeenCalledTimes(1);
});
```

**Mocking, explained.** A mock replaces a real thing (an API, a module, a timer) with a fake you control, so tests are fast and predictable.

```ts
// 1. Mock a function
const callback = vi.fn().mockReturnValue(42);

// 2. Mock a whole module (hoisted to the top of the file automatically)
vi.mock('./api', () => ({ fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'Ann' }) }));

// 3. Spy on an existing method
const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

// 4. Fake timers (for debounce, setTimeout)
vi.useFakeTimers();
search('re');
vi.advanceTimersByTime(500);   // jump 500ms forward instantly
expect(fetchResults).toHaveBeenCalledWith('re');
vi.useRealTimers();
```

**Testing a component that fetches data, with MSW.** MSW intercepts network requests and returns fake responses, so your component code runs exactly as in production.

```tsx
// mocks/server.ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
export const server = setupServer(
  http.get('/api/users', () => HttpResponse.json([{ id: 1, name: 'Ann' }])),
);

// setupTests.ts
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// UserList.test.tsx
test('shows users', async () => {
  renderWithClient(<UserList />);
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
  expect(await screen.findByText('Ann')).toBeInTheDocument();
});

test('shows an error', async () => {
  server.use(http.get('/api/users', () => new HttpResponse(null, { status: 500 })));
  renderWithClient(<UserList />);
  expect(await screen.findByText(/error/i)).toBeInTheDocument();
});
```

**A render helper for providers** (TanStack Query, Router):

```tsx
export function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); // fresh per test, no retries
  return render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}
```

**Testing a custom hook:**

```tsx
import { renderHook, act } from '@testing-library/react';

test('useToggle flips the value', () => {
  const { result } = renderHook(() => useToggle());
  expect(result.current[0]).toBe(false);
  act(() => result.current[1]());          // act = "apply this state update"
  expect(result.current[0]).toBe(true);
});
```

### Jest vs Vitest

|  | Jest | Vitest |
| --- | --- | --- |
| Engine | Own runner, transforms with Babel or ts-jest | Built on Vite, reuses vite.config, native ESM + TS |
| Speed | Slower on big TS/ESM projects | Usually faster, with an instant watch mode |
| API | `jest.fn`, `jest.mock`, `jest.spyOn` | Jest-compatible: `vi.fn`, `vi.mock`, `vi.spyOn` |
| Environment | jsdom via config | `environment: 'jsdom'` or `'happy-dom'`; also has browser mode |
| Use when | Legacy, CRA, Webpack projects | Vite projects |

### React Testing Library

- **Query priority:** `getByRole` (with `{ name }`) > `getByLabelText` > `getByPlaceholderText` > `getByText` > `getByTestId` as a last resort.
- **Query variants:** `getBy` throws if missing; `queryBy` returns null (use it to assert absence); `findBy` returns a promise and waits (use it for async UI).
- **`userEvent` over `fireEvent`:** `userEvent` simulates real interactions (focus, keydown, input). Always `await user.click(...)` after `const user = userEvent.setup()`.
- **Assertions** come from `@testing-library/jest-dom`: `toBeInTheDocument`, `toHaveTextContent`, `toBeDisabled`.
- **Async:** `await screen.findByText(...)` or `await waitFor(() => expect(...))`.
- **Mocking the network:** prefer MSW (Mock Service Worker) over mocking `fetch` or axios directly.
- **Hooks:** `renderHook` from `@testing-library/react`.
- Wrap providers (QueryClientProvider, Router, Theme) in a custom `render` helper.

```tsx
test('adds a todo', async () => {
  const user = userEvent.setup();
  render(<TodoApp />);
  await user.type(screen.getByRole('textbox', { name: /new todo/i }), 'Buy milk');
  await user.click(screen.getByRole('button', { name: /add/i }));
  expect(await screen.findByText('Buy milk')).toBeInTheDocument();
});
```

### Mocking essentials

- `vi.fn()` / `jest.fn()`: spy functions; check with `toHaveBeenCalledWith`.
- `vi.mock('./api')`: mocks a whole module. Mocks are hoisted above imports.
- `vi.spyOn(obj, 'method').mockReturnValue(...)`: wraps a single method.
- Fake timers: `vi.useFakeTimers()` + `vi.advanceTimersByTime(500)` for debounce tests.
- Reset between tests: `mockClear` (clears calls), `mockReset` (also clears the implementation), `mockRestore` (restores the original).

### Likely questions

- Unit vs integration vs E2E? (Testing pyramid or "testing trophy". E2E tools: Playwright, Cypress.)
- Why avoid testing implementation details?
- How do you test a component that fetches data?
- `getBy` vs `queryBy` vs `findBy`?
- What is snapshot testing, and its downside? (Brittle diffs that people approve without reading.)

### Gotchas

- "not wrapped in act(...)" warnings: you didn't await an async update. Use `findBy` or `waitFor`.
- Don't put side effects inside `waitFor`; only assertions.
- Forgetting `await` with `userEvent` v14.
- Shared mock state leaking between tests. Use `restoreMocks` / `clearMocks` in config.
- Testing internal state or class names instead of what the user sees.

## 5. Build tools: Webpack, Babel, Vite

The one-line distinction: **Babel transforms code** (syntax), a **bundler** (Webpack, or Rollup/Rolldown inside Vite) combines modules into optimized files, and **Vite is a dev server + build tool** that skips bundling during development.

### Explained simply (read this first)

**Why do we need build tools at all?** Browsers don't understand JSX or TypeScript, older browsers don't understand the newest JS, and loading 2,000 small files is slow. Build tools fix all three:

1. **Translate** JSX/TS/new JS into plain JS browsers understand (Babel, SWC, esbuild).
2. **Bundle** many files into a few optimized ones (Webpack, Rollup).
3. **Optimize:** minify, remove unused code, split into chunks, add hashes for caching.

**Babel in one example: it translates syntax.**

```js
// You write:
const greet = (name) => <h1>Hi {name}</h1>;
const city = user?.address?.city ?? 'Unknown';

// Babel outputs (roughly):
var greet = function (name) { return _jsx('h1', { children: ['Hi ', name] }); };
var city = (_user$address = user == null ? void 0 : user.address) == null ? void 0 : ... ;
```

```json
// babel.config.json
{
  "presets": [
    ["@babel/preset-env", { "useBuiltIns": "usage", "corejs": 3 }],
    ["@babel/preset-react", { "runtime": "automatic" }],
    "@babel/preset-typescript"
  ]
}
```

Think of a **preset** as a playlist of plugins. `browserslist` (in package.json, for example `"> 0.5%, not dead"`) tells Babel which browsers to support, so it only translates what's needed.

**Webpack in one picture:** start at the entry file, follow every `import` to build a dependency graph, run each file through the right loader, then output bundles.

```js
// webpack.config.js
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  mode: 'production',                         // minify + tree shake
  entry: './src/index.tsx',                   // where to start
  output: {
    path: __dirname + '/dist',
    filename: '[name].[contenthash].js',      // hash changes only when content changes -> cache busting
    clean: true,
  },
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: {
    rules: [                                  // LOADERS: transform one file type each
      { test: /\.tsx?$/, use: 'babel-loader', exclude: /node_modules/ },
      { test: /\.s[ac]ss$/, use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'] }, // runs right-to-left
      { test: /\.(png|svg)$/, type: 'asset' },
    ],
  },
  plugins: [                                  // PLUGINS: act on the whole build
    new HtmlWebpackPlugin({ template: './public/index.html' }),
    new MiniCssExtractPlugin(),
  ],
  optimization: { splitChunks: { chunks: 'all' } }, // separate vendor code into its own chunk
  devServer: { hot: true, historyApiFallback: true },
};
```

**Loader vs plugin, the easy way to remember:** a loader is a translator for *one file at a time* ("turn this .scss into CSS"). A plugin is a manager for *the whole build* ("generate index.html", "extract all CSS into one file").

Note the order: `sass-loader` runs first (SCSS to CSS), then `css-loader` (resolves `@import`/`url()`), then the extract or style loader.

**Vite: why it feels instant.** Webpack bundles your whole app before the dev server starts. Vite doesn't bundle in dev: the browser asks for files one by one via native `import`, and Vite translates only the file requested. A 2,000-file app starts as fast as a 10-file app.

```ts
// vite.config.ts: usually this short
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': '/src' } },
  server: {
    port: 3000,
    proxy: { '/api': 'http://localhost:4000' },   // avoids CORS in dev
  },
  build: { sourcemap: true },
});
```

```ts
// Environment variables in Vite
// .env:  VITE_API_URL=https://api.example.com
const url = import.meta.env.VITE_API_URL;   // only VITE_* are exposed to the browser
```

**Tree shaking = shaking the tree so dead leaves fall off.** If you import one function from a library, unused exports are removed from the bundle. It only works with ES modules (`import`/`export`), not CommonJS (`require`).

```js
import { debounce } from 'lodash-es';   // good: only debounce is bundled
import _ from 'lodash';                  // bad: the whole library (CommonJS)
```

**Code splitting = load code only when needed:**

```tsx
const AdminPage = lazy(() => import('./AdminPage'));  // becomes a separate file, loaded on visit
```

**Source maps** map the minified production code back to your original files, so error stack traces and DevTools show real line numbers.

### Babel

- A transpiler: converts modern JS, JSX and TS syntax into code your target browsers support.
- **Presets** are bundles of plugins: `@babel/preset-env` (driven by `browserslist`), `preset-react`, `preset-typescript`.
- **Syntax vs polyfills:** Babel rewrites syntax (arrow functions, optional chaining). Missing APIs (`Promise`, `Array.prototype.flat`) need polyfills via core-js (`useBuiltIns: 'usage'`).
- Babel's TypeScript preset strips types without checking them. Run `tsc --noEmit` separately.
- Faster alternatives: SWC and esbuild.

### Webpack

- **Entry:** the starting file. **Output:** where the bundles go.
- **Loaders** transform individual files: `babel-loader`, `ts-loader`, `css-loader`, `sass-loader`, `style-loader`.
- **Plugins** work on the whole build: `HtmlWebpackPlugin`, `MiniCssExtractPlugin`, `DefinePlugin`.
- **Mode:** `development` or `production` (production enables minification and tree shaking).
- **Code splitting:** dynamic `import()` creates separate chunks; `SplitChunksPlugin` extracts vendor code.
- **Tree shaking:** removes unused exports. Needs ES modules and `sideEffects: false` in package.json.
- **Cache busting:** `[contenthash]` in filenames. **HMR:** hot module replacement.
- **Module Federation:** loads code from separately deployed apps at runtime (micro-frontends).

### Vite

- **Dev:** serves native ES modules straight to the browser and transforms files on request, so startup is near-instant regardless of app size. Dependencies are pre-bundled with esbuild.
- **Build:** a production bundle with Rollup (newer versions use Rolldown, a Rust port of Rollup).
- Fast HMR, built-in TS/JSX/CSS/SASS support (just install `sass`), plugins compatible with Rollup.
- Environment variables: `import.meta.env.VITE_*` (only variables with the `VITE_` prefix are exposed to the client).

### Likely questions

- Why is Vite faster than Webpack in development?
- Loader vs plugin in Webpack?
- What is tree shaking and what breaks it? (CommonJS `require`, and modules with side effects.)
- How do you reduce bundle size? (Code splitting, lazy routes, tree shaking, analyze the bundle with `rollup-plugin-visualizer` or `webpack-bundle-analyzer`, replace heavy libraries.)
- What is a source map?

### Gotchas

- Vite's dev mode (unbundled ESM) and build (Rollup) can behave differently. Always test `vite build && vite preview`.
- `process.env` doesn't exist in Vite client code. Use `import.meta.env`.
- Env variables are inlined at build time: anything exposed to the client is public. Never put secrets there.
- Babel transpiling does not equal polyfilling.

## 6. SASS / SCSS

SASS is a CSS preprocessor: variables, nesting, mixins and functions compile down to plain CSS. SCSS is its CSS-like syntax and the one everyone uses.

### Explained simply (read this first)

**SASS is CSS with programming features**, written in `.scss` files and compiled to normal `.css`. The browser never sees SASS.

**1. Variables: write a value once, reuse it.**

```scss
$primary: #2563eb;
$radius: 8px;

.button { background: $primary; border-radius: $radius; }
.link   { color: $primary; }
```

**2. Nesting: write CSS in the same shape as your HTML.** `&` means "the parent selector".

```scss
.card {
  padding: 16px;

  &:hover { box-shadow: 0 2px 8px rgba(0,0,0,.1); }   // .card:hover
  &__title { font-size: 1.25rem; }                    // .card__title  (BEM element)
  &--active { border-color: $primary; }               // .card--active (BEM modifier)
  .icon { width: 16px; }                              // .card .icon
}
```

**3. Mixins: reusable chunks of CSS, like functions that output styles.**

```scss
@mixin flex-center($direction: row) {
  display: flex;
  flex-direction: $direction;
  align-items: center;
  justify-content: center;
}

.modal { @include flex-center(column); }
.badge { @include flex-center; }
```

**4. Responsive mixin (very common in real projects):**

```scss
@use 'sass:map';
$breakpoints: (sm: 640px, md: 768px, lg: 1024px);

@mixin respond($size) {
  @media (min-width: map.get($breakpoints, $size)) { @content; }  // @content = the block you pass in
}

.sidebar {
  display: none;
  @include respond(md) { display: block; }
}
```

**5. Functions and loops: generate CSS.**

```scss
@use 'sass:math';
@function rem($px) { @return math.div($px, 16) * 1rem; }

h1 { font-size: rem(32); }   // 2rem

// Generate .mt-1 ... .mt-4 spacing utilities
@for $i from 1 through 4 {
  .mt-#{$i} { margin-top: #{$i * 4}px; }
}

// Loop over a map to make theme classes
$colors: (primary: #2563eb, danger: #dc2626, success: #16a34a);
@each $name, $color in $colors {
  .btn-#{$name} { background: $color; }
}
```

**6. Splitting files: partials + `@use`.** A file starting with `_` is a partial (only imported, never compiled alone).

```scss
// styles/_tokens.scss
$primary: #2563eb;
@mixin card { border-radius: 8px; padding: 16px; }

// components/Button.module.scss
@use '../styles/tokens' as t;      // namespaced: no global name clashes
.button { background: t.$primary; @include t.card; }
```

**`@use` vs `@import`, in one line:** `@import` dumps everything into one global space and can duplicate CSS; `@use` loads a file once and namespaces it (`t.$primary`). `@import` is deprecated.

**SASS variables vs CSS variables:**

```scss
// SASS variable: replaced at compile time, gone in the browser
$brand: #2563eb;

// CSS variable: lives in the browser, can change at runtime (themes)
:root { --brand: #{$brand}; }               // seed the CSS var from the SASS token
[data-theme='dark'] { --brand: #60a5fa; }
.button { background: var(--brand); }       // switches automatically with the theme
```

**Using SCSS with React (CSS Modules):**

```tsx
// Button.module.scss -> .primary { ... }
import styles from './Button.module.scss';
<button className={styles.primary}>Save</button>   // compiled to a unique name like Button_primary__x7f2
```

CSS Modules give each component its own class names, so styles never accidentally clash across components.

### Core concepts

- **Variables:** `$primary: #3b82f6;` are compile-time. CSS custom properties (`--primary`) are runtime: they can change with themes and be read by JS. A good answer: use both, SASS for build-time tokens and CSS variables for theming.
- **Nesting + `&`:** `&:hover`, `&--active` (BEM modifiers). Keep nesting at 3 levels or fewer.
- **Mixins vs placeholders:** `@mixin`/`@include` copy declarations and accept arguments. `%placeholder` + `@extend` group selectors, which can produce selector bloat and doesn't work across media queries.
- **Functions + control flow:** `@function`, `@if`, `@each`, `@for`, maps (`map.get($breakpoints, md)`).
- **Module system:** `@use 'tokens' as t;` and `@forward` replace the deprecated `@import`. `@use` namespaces members and loads each file once.
- **Partials:** `_buttons.scss` files aren't compiled on their own.
- Dart Sass is the current implementation (LibSass and node-sass are deprecated).

```scss
@use 'sass:map';
$breakpoints: (sm: 640px, md: 768px, lg: 1024px);

@mixin up($bp) {
  @media (min-width: map.get($breakpoints, $bp)) { @content; }
}

.card {
  padding: 1rem;
  &__title { font-weight: 600; }
  &--featured { border: 2px solid var(--primary); }
  @include up(md) { padding: 2rem; }
}
```

### Styling architecture questions

- BEM naming, CSS Modules (`styles.module.scss`, locally scoped class names), CSS-in-JS (styled-components, which has runtime cost) vs Tailwind (utility classes, zero runtime).
- How do you scope styles in a component library? (CSS Modules, Shadow DOM, or a prefix convention.)

### Gotchas

- `@import` is deprecated and causes duplicated CSS. Use `@use`.
- Deep nesting produces highly specific selectors that are hard to override.
- `@extend` across files or media queries behaves unexpectedly. Prefer mixins.
- SASS variables can't change at runtime (for dark mode, use CSS variables).
- Native CSS now has nesting, `:has()`, container queries and `@layer`, so be ready to say what SASS still adds (mixins, loops, maps, modules).

## 7. Web Components, Stencil, shadcn/ui

This combination usually means the team has a framework-agnostic design system (Web Components built with Stencil) alongside React apps. Be ready to explain how they fit together.

### Explained simply (read this first)

**Web Components = your own HTML tags, built into the browser.** Just like `<video>` or `<select>` are tags with built-in behaviour, you can create `<user-card>` and use it in React, Angular, Vue or plain HTML. No framework needed.

**A complete Web Component from scratch (vanilla JS):**

```js
class UserCard extends HTMLElement {
  static observedAttributes = ['name'];          // which attributes to watch

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });          // private DOM + private styles
  }

  connectedCallback() { this.render(); }          // like "componentDidMount"
  disconnectedCallback() { /* cleanup */ }        // like "unmount"
  attributeChangedCallback() { this.render(); }   // an observed attribute changed

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; border: 1px solid #ddd; padding: 12px; }  /* the <user-card> itself */
        h3 { color: var(--card-title-color, navy); }                     /* themable from outside */
      </style>
      <h3>${this.getAttribute('name') ?? 'Anonymous'}</h3>
      <slot></slot>                     <!-- children go here, like React's {children} -->
      <button part="action">Follow</button>
    `;
    this.shadowRoot.querySelector('button').onclick = () =>
      this.dispatchEvent(new CustomEvent('follow', {
        detail: { name: this.getAttribute('name') },
        bubbles: true,
        composed: true,                 // lets the event escape the shadow DOM
      }));
  }
}
customElements.define('user-card', UserCard);   // name must contain a hyphen
```

```html
<user-card name="Ann">
  <p>Frontend developer</p>
</user-card>

<style>
  user-card { --card-title-color: crimson; }   /* CSS variables pass through */
  user-card::part(action) { background: black; color: white; }  /* style an exposed part */
  h3 { color: red; }                           /* does NOT affect the h3 inside the shadow DOM */
</style>
```

**Shadow DOM, explained:** a private mini-document inside the element. Page styles can't get in and the component's styles can't leak out. The only ways in are CSS variables, inherited properties (font, color) and `::part()`.

**Attributes vs properties (a classic interview point):** attributes are always strings, set in HTML. Properties are JS values on the element object and can hold arrays and objects.

```js
el.setAttribute('name', 'Ann');            // attribute: string only
el.items = [{ id: 1 }, { id: 2 }];         // property: any JS value
```

**Using a Web Component in React:**

```tsx
// React 19: works naturally, including objects and custom events
<user-card name="Ann" items={items} onfollow={(e: CustomEvent) => console.log(e.detail)} />

// React 18 and earlier: props became string attributes, so use a ref
function UserCardWrapper({ items, onFollow }: Props) {
  const ref = useRef<HTMLElement & { items?: Item[] }>(null);
  useEffect(() => {
    const el = ref.current!;
    el.items = items;                                      // set as a property
    const handler = (e: Event) => onFollow((e as CustomEvent).detail);
    el.addEventListener('follow', handler);
    return () => el.removeEventListener('follow', handler); // cleanup
  }, [items, onFollow]);
  return <user-card ref={ref} name="Ann" />;
}
```

**Stencil = write Web Components the React way.** Stencil is a compiler: you write TSX with decorators, and it outputs standard Web Components (plus optional React/Angular/Vue wrappers).

```tsx
import { Component, Prop, State, Event, EventEmitter, Watch, h, Host } from '@stencil/core';

@Component({
  tag: 'ds-counter',
  styleUrl: 'ds-counter.scss',
  shadow: true,
})
export class DsCounter {
  @Prop() label = 'Count';                // input from outside (like React props)
  @Prop() start = 0;
  @State() count = 0;                     // internal state; changing it re-renders (like useState)
  @Event() countChanged: EventEmitter<number>;   // custom event out (like an onChange callback)

  componentWillLoad() { this.count = this.start; }   // before first render

  @Watch('start')                          // runs when the start prop changes
  onStartChange(newValue: number) { this.count = newValue; }

  private increment = () => {
    this.count++;
    this.countChanged.emit(this.count);
  };

  render() {
    return (
      <Host>
        <span>{this.label}: {this.count}</span>
        <button onClick={this.increment}>+</button>
        <slot />
      </Host>
    );
  }
}
```

**Stencil vs React mapping (easy to remember):**

| React | Stencil |
| --- | --- |
| props | `@Prop()` |
| `useState` | `@State()` |
| `onSomething` callback prop | `@Event()` + `.emit()` |
| `useEffect` on a prop | `@Watch('prop')` |
| `useRef` to the host element | `@Element()` |
| `useImperativeHandle` | `@Method()` (must be async) |
| mount / unmount | `componentDidLoad` / `disconnectedCallback` |

**Using the Stencil component from React with the generated wrapper:**

```tsx
import { DsCounter } from 'my-design-system-react';   // generated by the React output target
<DsCounter label="Clicks" start={5} onCountChanged={e => console.log(e.detail)} />
```

**shadcn/ui = copy-paste components you own.** Instead of `npm install some-ui-library`, you run a CLI that puts the component's source code in your project. You can change anything.

```bash
npx shadcn@latest init
npx shadcn@latest add button dialog
# creates src/components/ui/button.tsx, dialog.tsx in YOUR repo
```

```tsx
// What a shadcn component looks like inside (simplified)
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';   // cn = clsx + tailwind-merge (merges classes, later ones win)

const buttonVariants = cva('inline-flex items-center rounded-md text-sm font-medium', {
  variants: {
    variant: { default: 'bg-primary text-white', outline: 'border bg-transparent' },
    size:    { sm: 'h-8 px-3', lg: 'h-11 px-8' },
  },
  defaultVariants: { variant: 'default', size: 'sm' },
});

export function Button({ className, variant, size, ...props }:
  React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

// Usage
<Button variant="outline" size="lg">Cancel</Button>
```

The complex parts (focus traps in dialogs, keyboard navigation, ARIA) come from **Radix UI** primitives underneath; the looks come from **Tailwind**.

### Web Components

Three browser standards:

1. **Custom Elements:** `class MyEl extends HTMLElement`, registered with `customElements.define('my-el', MyEl)`. The name must contain a hyphen. Lifecycle: `constructor`, `connectedCallback`, `disconnectedCallback`, `attributeChangedCallback` (with `static observedAttributes`), `adoptedCallback`.
2. **Shadow DOM:** `this.attachShadow({ mode: 'open' })` encapsulates the DOM and styles. Outside CSS doesn't leak in, except inherited properties (color, font) and CSS custom properties. Style from outside with `::part()` and CSS variables; style slotted content inside with `::slotted()` and the host with `:host`.
3. **HTML templates + slots:** `<template>`, `<slot>` and named slots for content projection (like React `children`).

**Using them in React:** React 19 fully supports custom elements (passes properties, supports custom events). React 18 and earlier passed everything as string attributes and couldn't listen to custom events declaratively, so you needed refs and `addEventListener`, or generated React wrappers.

### Stencil

- A compiler (by the Ionic team) that outputs standard Web Components, with a React-like developer experience: TSX, decorators, a virtual DOM, lazy loading.
- Decorators: `@Component({ tag, styleUrl, shadow: true })`, `@Prop()` (public input), `@State()` (internal state that re-renders), `@Event()` + `EventEmitter` (custom events), `@Listen()`, `@Watch('prop')`, `@Method()` (public async method), `@Element()` (host element).
- Lifecycle: `componentWillLoad`, `componentDidLoad`, `componentShouldUpdate`, `componentWillUpdate`, `componentDidUpdate`, `disconnectedCallback`.
- **Output targets** generate framework wrappers (`@stencil/react-output-target`) so React apps get typed props and `onMyEvent` handlers.
- Props should be immutable inside the component (use `mutable: true` only deliberately). Objects and arrays must be passed as properties, not attributes.

```tsx
@Component({ tag: 'ds-button', styleUrl: 'ds-button.scss', shadow: true })
export class DsButton {
  @Prop() variant: 'primary' | 'ghost' = 'primary';
  @State() pressed = false;
  @Event() dsClick: EventEmitter<void>;
  render() {
    return <button class={this.variant} onClick={() => this.dsClick.emit()}><slot /></button>;
  }
}
```

### shadcn/ui

- **Not a component library you install as a dependency.** A CLI (`npx shadcn add button`) copies component source code into your repo, so you own and modify it.
- Built on Radix UI primitives (accessibility, keyboard handling, focus management) + Tailwind CSS. Variants use `cva` (class-variance-authority); classes are merged with a `cn()` helper (`clsx` + `tailwind-merge`).
- Pros: full control, no version lock-in, accessible defaults. Cons: you maintain the code, and upstream fixes don't arrive automatically.

### Likely questions

- Web Components vs React components? (Web Components are a browser standard that works in any framework, with style encapsulation. React offers richer state, ecosystem and SSR.)
- How do you pass complex data and handle events between React and a Web Component?
- Open vs closed shadow root?
- Why would a company use Stencil? (One design system shared across React, Angular, Vue and plain HTML apps.)
- How is shadcn different from MUI?

### Gotchas

- SSR with Shadow DOM is hard (Declarative Shadow DOM helps), and there can be a flash of unstyled content before definition (use `:not(:defined)`).
- Global styles and Tailwind don't reach inside Shadow DOM.
- Forms: custom elements don't join native forms unless they use `ElementInternals` (`static formAssociated = true`).
- Custom events must use `composed: true` to cross the shadow boundary (Stencil events are composed by default).
- `aria` references (`aria-labelledby`) don't cross shadow roots.

## 8. Design patterns, clean code, OOP, SOLID

The winning move is translating each principle into a concrete React or TypeScript example. Interviewers want to hear that you apply these ideas, not just define them.

### Explained simply (read this first)

**SOLID = five rules that make code easy to change without breaking other things.** Here is each one as a before/after.

**S: Single Responsibility. One component or function = one job.**

```tsx
// Before: fetching + filtering + rendering all mixed together
function UserPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { fetch('/api/users').then(r => r.json()).then(setUsers); }, []);
  const visible = users.filter(u => u.name.toLowerCase().includes(q.toLowerCase()));
  return <>{/* input + big list markup */}</>;
}

// After: each piece has one reason to change
function useUsers() { return useQuery({ queryKey: ['users'], queryFn: fetchUsers }); } // data
const filterUsers = (users: User[], q: string) =>                                     // logic (easy to unit test)
  users.filter(u => u.name.toLowerCase().includes(q.toLowerCase()));
function UserList({ users }: { users: User[] }) { /* only rendering */ }              // UI

function UserPage() {
  const { data = [] } = useUsers();
  const [q, setQ] = useState('');
  return <><SearchInput value={q} onChange={setQ} /><UserList users={filterUsers(data, q)} /></>;
}
```

**O: Open/Closed. Add new behaviour without editing existing code.**

```tsx
// Before: every new alert type means editing this component
function Alert({ type }: { type: string }) {
  if (type === 'success') return <div className="green">✓ Done</div>;
  if (type === 'error') return <div className="red">✗ Failed</div>;
  // ...keeps growing
}

// After: extend through props/composition; the component never changes
function Alert({ icon, tone, children }: { icon: React.ReactNode; tone: string; children: React.ReactNode }) {
  return <div className={`alert alert-${tone}`}>{icon}{children}</div>;
}
<Alert tone="warning" icon={<WarnIcon />}>Disk almost full</Alert>   // new case, no edits
```

**L: Liskov Substitution. A specialised version must work anywhere the general one does.**

```tsx
// IconButton can replace a <button> anywhere, because it accepts and forwards all button props
type IconButtonProps = React.ComponentProps<'button'> & { icon: React.ReactNode };
function IconButton({ icon, children, ...buttonProps }: IconButtonProps) {
  return <button {...buttonProps}>{icon}{children}</button>;   // onClick, disabled, type... all still work
}
// Violation: an IconButton that ignores `disabled` or `onClick` breaks code expecting a normal button.
```

**I: Interface Segregation. Don't make components depend on data they don't use.**

```tsx
// Before: needs a whole User just to show an avatar, so it's hard to reuse and test
function Avatar({ user }: { user: User }) { return <img src={user.avatarUrl} alt={user.name} />; }

// After: asks only for what it needs
function Avatar({ src, alt }: { src: string; alt: string }) { return <img src={src} alt={alt} />; }
<Avatar src={user.avatarUrl} alt={user.name} />
<Avatar src={team.logo} alt={team.title} />     // now reusable for teams too
```

**D: Dependency Inversion. Depend on an interface, not a specific implementation.**

```tsx
// The component doesn't know if data comes from fetch, axios, or a fake
interface UserService { getUsers(): Promise<User[]> }

const ServiceContext = createContext<UserService>(httpUserService);

function UserList() {
  const service = useContext(ServiceContext);
  const { data } = useQuery({ queryKey: ['users'], queryFn: () => service.getUsers() });
  // ...
}

// In tests, inject a fake. No network, no mocking libraries needed.
const fakeService: UserService = { getUsers: async () => [{ id: 1, name: 'Ann' }] };
render(<ServiceContext.Provider value={fakeService}><UserList /></ServiceContext.Provider>);
```

### OOP in TypeScript, with one example covering all four pillars

```ts
interface Shape { area(): number }                          // ABSTRACTION: what, not how

abstract class BaseShape implements Shape {
  constructor(protected readonly name: string) {}
  abstract area(): number;
  describe() { return `${this.name}: ${this.area().toFixed(2)}`; }
}

class Circle extends BaseShape {                            // INHERITANCE
  #radius: number;                                          // ENCAPSULATION: truly private field
  constructor(radius: number) { super('Circle'); this.#radius = radius; }
  area() { return Math.PI * this.#radius ** 2; }
}

class Square extends BaseShape {
  constructor(private side: number) { super('Square'); }
  area() { return this.side ** 2; }
}

const shapes: Shape[] = [new Circle(2), new Square(3)];
shapes.forEach(s => console.log(s.area()));                 // POLYMORPHISM: same call, different behaviour
```

**Composition over inheritance, the React way:** instead of `class AdminButton extends Button`, you wrap or pass pieces in.

```tsx
function Dialog({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return <div role="dialog"><h2>{title}</h2>{children}<footer>{footer}</footer></div>;
}
const ConfirmDialog = (p: { onYes: () => void }) => (
  <Dialog title="Are you sure?" footer={<button onClick={p.onYes}>Yes</button>}>This can't be undone.</Dialog>
);
```

### React patterns with code

**Compound components:** parts that share hidden state, like `<select>` and `<option>`.

```tsx
const TabsContext = createContext<{ active: string; setActive: (v: string) => void } | null>(null);

function Tabs({ defaultValue, children }: { defaultValue: string; children: React.ReactNode }) {
  const [active, setActive] = useState(defaultValue);
  return <TabsContext.Provider value={{ active, setActive }}>{children}</TabsContext.Provider>;
}
function Tab({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = useContext(TabsContext)!;
  return <button aria-selected={ctx.active === value} onClick={() => ctx.setActive(value)}>{children}</button>;
}
function Panel({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = useContext(TabsContext)!;
  return ctx.active === value ? <div>{children}</div> : null;
}
Tabs.Tab = Tab; Tabs.Panel = Panel;

// Usage: clean and flexible
<Tabs defaultValue="profile">
  <Tabs.Tab value="profile">Profile</Tabs.Tab>
  <Tabs.Tab value="settings">Settings</Tabs.Tab>
  <Tabs.Panel value="profile">...</Tabs.Panel>
  <Tabs.Panel value="settings">...</Tabs.Panel>
</Tabs>
```

**Higher-order component (HOC):** a function that takes a component and returns an enhanced one. Mostly replaced by hooks now.

```tsx
function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function Protected(props: P) {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" />;
    return <Component {...props} />;
  };
}
export default withAuth(Dashboard);
```

**Render props:** pass a function that decides what to render.

```tsx
function MouseTracker({ render }: { render: (pos: { x: number; y: number }) => React.ReactNode }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return <div onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}>{render(pos)}</div>;
}
<MouseTracker render={({ x, y }) => <p>{x}, {y}</p>} />
// Modern version: a useMousePosition() hook
```

### Classic design patterns in frontend code

```ts
// SINGLETON: one shared instance
export const apiClient = axios.create({ baseURL: '/api' });

// FACTORY: create the right object from input
function createNotifier(kind: 'email' | 'sms'): Notifier {
  return kind === 'email' ? new EmailNotifier() : new SmsNotifier();
}

// STRATEGY: swap the algorithm
const sorters = {
  name:  (a: User, b: User) => a.name.localeCompare(b.name),
  date:  (a: User, b: User) => +new Date(b.createdAt) - +new Date(a.createdAt),
};
users.sort(sorters[sortBy]);

// ADAPTER: convert API shape -> UI shape (keeps API changes out of components)
const toUser = (dto: UserDTO): User => ({ id: dto.user_id, name: `${dto.first_name} ${dto.last_name}` });

// OBSERVER: subscribe to changes
class EventBus {
  private listeners = new Map<string, Set<(data: unknown) => void>>();
  on(evt: string, fn: (d: unknown) => void) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt)!.add(fn);
    return () => this.listeners.get(evt)!.delete(fn);   // unsubscribe
  }
  emit(evt: string, data?: unknown) { this.listeners.get(evt)?.forEach(fn => fn(data)); }
}
```

### Clean code: before and after

```ts
// Before
function p(d: any) {
  if (d) { if (d.items.length > 0) { if (d.user.age >= 18) { return d.items.filter((x: any) => x.s === 1); } } }
  return [];
}

// After: clear names, early returns, no magic numbers, typed
const ADULT_AGE = 18;
const STATUS_ACTIVE = 1;

function getActiveItemsForAdult(order: Order | null): Item[] {
  if (!order || order.items.length === 0) return [];
  if (order.user.age < ADULT_AGE) return [];
  return order.items.filter(item => item.status === STATUS_ACTIVE);
}
```

### SOLID with frontend examples

| Principle | Meaning | React / TS example |
| --- | --- | --- |
| **S**ingle Responsibility | One reason to change | Split a component that fetches, transforms and renders into a `useUsers()` hook + a presentational `UserList` |
| **O**pen/Closed | Open for extension, closed for modification | A `Button` that accepts `variant`, `icon` and `children` instead of editing it for each new case; render props and slots |
| **L**iskov Substitution | Subtypes usable wherever the base type is | `<IconButton>` accepts every prop `<button>` does (extends `ComponentProps<'button'>`), so it works anywhere a button would |
| **I**nterface Segregation | Don't force unused dependencies | Pass `onSelect` and `name`, not the whole `user` object; small, focused prop types |
| **D**ependency Inversion | Depend on abstractions | Components call an injected `api` service or hook (via props or Context), so tests can swap in a fake |

### OOP pillars (in TypeScript)

- **Encapsulation:** `private`/`#private` fields, exposing only methods.
- **Abstraction:** interfaces and abstract classes hide the details.
- **Inheritance:** `extends`. Favour **composition over inheritance**, which is exactly React's model (the React docs recommend composition).
- **Polymorphism:** different classes implementing the same interface (`PaymentProvider.pay()`).

### Design patterns that come up

- **React patterns:** container/presentational, custom hooks (the modern container), compound components (`<Tabs><Tabs.List/><Tabs.Panel/></Tabs>` sharing state via Context), render props, HOCs (`withAuth`), controlled/uncontrolled, provider pattern, state reducer, headless components (Radix, TanStack Table).
- **Gang of Four patterns in the frontend:**
  - Observer: event emitters, store subscriptions, RxJS.
  - Singleton: one `QueryClient`, an API client module.
  - Factory: creating components or services from config.
  - Strategy: swappable validation or sorting functions.
  - Adapter: mapping API DTOs to UI models.
  - Decorator: HOCs, Stencil decorators.
  - Facade: a simple `api.users.get()` over fetch details.
  - Module: ES modules.
- **Architecture:** feature-based folders (`features/cart/{components,hooks,api}`), separating domain logic from UI, atomic design for component libraries, micro-frontends.

### Clean code checklist

- Meaningful names; small, single-purpose functions; early returns over nested ifs.
- DRY, but avoid the wrong abstraction ("duplication is cheaper than the wrong abstraction"). KISS, YAGNI.
- Pure functions and immutability; no magic numbers (use named constants).
- Consistent formatting via ESLint + Prettier, type safety, tests as documentation.
- Code review: readability first, small merge requests.

### Likely questions

- Explain SOLID with an example from your own code.
- Composition vs inheritance in React?
- How do you structure a large React app?
- What is a compound component? Build a simple `Accordion`.
- How do you refactor a 600-line component? (Extract hooks, split by responsibility, add tests first.)

### Gotchas

- Don't claim React class inheritance is a good idea. React recommends composition.
- Over-abstracting too early is itself a clean-code smell.
- HOCs and render props are mostly replaced by hooks; know why (wrapper hell, unclear prop origins).

## 9. GitLab (Git + CI/CD)

For a frontend role, expect workflow questions (branching, merge requests, rebase) and the ability to read or write a basic `.gitlab-ci.yml`.

### Explained simply (read this first)

**Git = save points for your code. GitLab = where the team shares those save points**, reviews them (Merge Requests) and runs automatic checks (CI/CD pipelines).

**A typical daily workflow:**

```bash
git checkout main && git pull                 # get latest
git checkout -b feat/login-form               # new branch for your work
# ...edit files...
git add .
git commit -m "feat: add login form validation"
git push -u origin feat/login-form            # then open a Merge Request in GitLab

# main moved on while you worked? update your branch:
git fetch origin
git rebase origin/main                        # replay your commits on top of latest main
# fix conflicts -> git add <file> -> git rebase --continue
git push --force-with-lease                   # safer than --force: refuses if someone else pushed
```

**Merge vs rebase, with a picture in words:**

- **Merge** ties the two branches together with a new "merge commit". History shows exactly what happened, but looks like a tangle.
- **Rebase** picks up your commits and replays them on top of the latest main, as if you started from there. History is a straight line, but commits get new ids.
- **Golden rule:** never rebase a branch other people are working on.

**Undoing things (frequently asked):**

```bash
git restore file.ts             # throw away uncommitted changes in a file
git commit --amend              # fix the last commit message or add a forgotten file
git reset --soft HEAD~1         # undo last commit, keep changes staged
git reset --hard HEAD~1         # undo last commit and DELETE the changes (careful)
git revert abc123               # new commit that undoes abc123 (safe on shared branches)
git stash / git stash pop       # park unfinished work, bring it back later
git reflog                      # list of everywhere HEAD has been: recover "lost" commits
git cherry-pick abc123          # copy one commit onto the current branch
```

**Resolving a merge conflict:** Git marks the clash in the file. Pick or combine the code, delete the markers, then `git add` and continue.

```text
<<<<<<< HEAD
const limit = 10;
=======
const limit = 20;
>>>>>>> feat/pagination
```

**GitLab CI/CD, explained simply.** On every push, GitLab reads `.gitlab-ci.yml` and runs your commands on a server (a **runner**) inside a Docker container. If any step fails, the Merge Request shows a red X.

- A **job** = a list of shell commands (e.g. run tests).
- A **stage** = a group of jobs. Stages run one after another; jobs in the same stage run at the same time.
- A **pipeline** = all the stages for one push.

**Smallest useful pipeline:**

```yaml
image: node:22-alpine           # every job runs inside this Docker image

stages: [test, build]

test:
  stage: test
  script:
    - npm ci
    - npm run lint
    - npm test

build:
  stage: build
  script:
    - npm ci
    - npm run build
  artifacts:
    paths: [dist/]               # save the build output so later jobs (or you) can download it
```

**Running jobs only when needed with `rules`:**

```yaml
deploy_staging:
  stage: deploy
  script: ./deploy.sh staging
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      when: never                                 # don't deploy from MRs
    - if: $CI_COMMIT_BRANCH == "develop"            # deploy automatically from develop

deploy_prod:
  stage: deploy
  script: ./deploy.sh production
  environment: production
  rules:
    - if: $CI_COMMIT_TAG                            # only for tags like v1.2.0
      when: manual                                  # someone clicks "play" to release
```

**Reusing config (keeps YAML DRY):**

```yaml
.node_job:                      # names starting with . are templates, not run on their own
  image: node:22-alpine
  before_script: [npm ci]

unit_tests:
  extends: .node_job
  script: npm test

typecheck:
  extends: .node_job
  script: npx tsc --noEmit
```

**Building and pushing a Docker image in CI:**

```yaml
docker_build:
  stage: build
  image: docker:27
  services: [docker:27-dind]     # Docker-in-Docker so the job can run docker commands
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA
```

Variables like `$CI_COMMIT_BRANCH`, `$CI_COMMIT_SHORT_SHA` and `$CI_REGISTRY_IMAGE` are predefined by GitLab. Your own secrets go in Settings, then CI/CD, then Variables (masked).

### Git essentials

- `merge` keeps history and adds a merge commit. `rebase` rewrites commits onto a new base for a linear history. Never rebase shared or pushed branches others use.
- `git rebase -i` squashes or rewords commits; `cherry-pick` applies one commit elsewhere; `revert` makes an undo commit (safe on shared branches); `reset --soft/--mixed/--hard`; `stash`; `reflog` recovers "lost" commits.
- Branching strategies: GitFlow vs trunk-based development (short-lived branches + feature flags). Conventional Commits (`feat:`, `fix:`).
- GitLab terms: **Merge Request** (MR, the equivalent of a GitHub PR), approvals, protected branches, CODEOWNERS, issues and boards.

### GitLab CI/CD

- Pipelines are defined in `.gitlab-ci.yml` at the repo root and run by **GitLab Runners**.
- **Stages** run in order; **jobs** within a stage run in parallel. `needs:` creates a DAG so jobs can start early.
- Keywords: `image`, `script`, `before_script`, `rules` (replaces `only/except`), `variables`, `cache` (dependencies, speed), `artifacts` (files passed to later jobs or downloaded), `environment`, `when: manual`, `extends`, `include`.
- Secrets go in CI/CD variables (masked, protected) in project settings, never in the repo.

```yaml
stages: [install, test, build, deploy]

default:
  image: node:22-alpine
  cache:
    key:
      files: [package-lock.json]
    paths: [.npm/]

install:
  stage: install
  script: npm ci --cache .npm --prefer-offline
  artifacts: { paths: [node_modules/], expire_in: 1h }

lint_test:
  stage: test
  script:
    - npm run lint
    - npm run test -- --coverage
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'

build:
  stage: build
  script: npm run build
  artifacts: { paths: [dist/] }

deploy_prod:
  stage: deploy
  script: ./deploy.sh
  environment: production
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual
```

### Likely questions

- `cache` vs `artifacts`? (Cache speeds up repeated jobs, is best-effort and can be shared across pipelines. Artifacts are the outputs of a job, guaranteed to pass to later stages in the same pipeline.)
- Merge vs rebase?
- How would you set up CI for a React app? (Install, then lint + typecheck + tests in parallel, then build, then deploy, with MR pipelines.)
- How do you resolve a merge conflict?

### Gotchas

- Use `npm ci`, not `npm install`, in CI (reproducible, respects the lockfile).
- Mixing `rules` with `only/except` in the same job isn't allowed.
- Duplicate pipelines for branch + MR events: use `workflow: rules`.

## 10. Docker and Docker Compose

For a frontend role, the classic question is "how would you containerize a React app?" The answer: a multi-stage build, Node to build, then Nginx to serve the static files.

### Explained simply (read this first)

**Docker solves "it works on my machine".** It packs your app plus everything it needs (the right Node version, OS libraries, config) into one box that runs the same on any computer or server.

- **Dockerfile** = the recipe.
- **Image** = the cake baked from the recipe (read-only, shareable).
- **Container** = a slice being eaten: a running copy of the image. You can run many containers from one image.
- **Docker Compose** = a menu that starts several containers together (frontend + API + database) with one command.

**A simple Dockerfile, line by line:**

```dockerfile
FROM node:22-alpine         # start from an image that already has Node (alpine = small Linux)
WORKDIR /app                # all following commands run in /app inside the container
COPY package*.json ./       # copy ONLY the dependency files first...
RUN npm ci                  # ...and install. This layer is cached until package.json changes
COPY . .                    # now copy the rest of the source code
EXPOSE 5173                 # documents which port the app uses (doesn't actually open it)
CMD ["npm", "run", "dev", "--", "--host"]   # the command that runs when the container starts
```

**Why copy package.json first? Layer caching.** Each line creates a layer, and Docker reuses a layer if nothing it depends on has changed. You change source code all the time but dependencies rarely, so installing first means rebuilds skip the slow `npm ci` step.

**Production React app: multi-stage build.** Stage 1 has Node and all the build tools (about 1 GB). Stage 2 copies *only* the built static files into a tiny Nginx web server (about 50 MB). Node isn't even in the final image.

```dockerfile
# ---------- Stage 1: build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL                      # passed with --build-arg, baked into the JS bundle
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build                     # outputs /app/dist

# ---------- Stage 2: serve ----------
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```nginx
# nginx.conf: the SPA fallback means /profile/123 serves index.html, and React Router takes over
server {
  listen 80;
  root /usr/share/nginx/html;
  location / {
    try_files $uri $uri/ /index.html;
  }
  location /assets/ {
    expires 1y;                       # hashed filenames, so cache forever
    add_header Cache-Control "public, immutable";
  }
}
```

```text
# .dockerignore: keeps the build fast and stops secrets leaking into the image
node_modules
dist
.git
.env
*.log
```

**Commands you should know:**

```bash
docker build -t my-app .                         # build an image from the Dockerfile in this folder
docker build --build-arg VITE_API_URL=https://api.x.com -t my-app .
docker run -d -p 8080:80 --name web my-app       # run it; open http://localhost:8080
                                                 # -p HOST:CONTAINER, -d = in the background
docker ps                                        # list running containers
docker logs -f web                               # follow its logs
docker exec -it web sh                           # open a shell inside the running container
docker stop web && docker rm web                 # stop and remove
docker images / docker rmi my-app                # list / remove images
```

**Docker Compose: the whole stack in one file.**

```yaml
# compose.yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:5173"
    volumes:
      - ./frontend:/app          # bind mount: edit code on your laptop, changes appear live in the container
      - /app/node_modules        # but keep the container's own node_modules
    environment:
      - VITE_API_URL=http://localhost:4000
    depends_on:
      - api

  api:
    build: ./api
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=postgres://app:secret@db:5432/app   # "db" = the service name below, not localhost
    depends_on:
      db:
        condition: service_healthy                        # wait until Postgres is actually ready

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data                   # named volume: data survives restarts
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 5

volumes:
  pgdata:
```

```bash
docker compose up -d --build     # build and start everything
docker compose logs -f api       # logs for one service
docker compose exec db psql -U app   # run a command in a service
docker compose down              # stop and remove containers (data in volumes is kept)
docker compose down -v           # ...and delete volumes too (wipes the database)
```

**How containers talk to each other:** Compose puts all services on one private network, where each service's name works as its hostname. The API reaches Postgres at `db:5432`. The browser, which runs on your laptop and not in Docker, reaches the API through the published port, `localhost:4000`.

### Core concepts

- **Image vs container:** an image is a read-only template built in layers; a container is a running instance of an image.
- **Dockerfile instructions:** `FROM`, `WORKDIR`, `COPY`, `RUN` (build time), `CMD`/`ENTRYPOINT` (run time), `ENV`, `ARG` (build-time only), `EXPOSE` (documentation only), `USER`.
- **Layer caching:** copy `package*.json` and install *before* copying the source, so the dependency layer is reused when only code changes.
- **Multi-stage builds:** the final image contains only what it needs, so it's small and more secure.
- **`.dockerignore`:** exclude `node_modules`, `.git`, `dist` and `.env`.
- **Volumes** (persistent data, or bind mounts for live code in dev), **networks** (containers reach each other by service name), port mapping `-p 8080:80` (host:container).
- Commands: `docker build -t app .`, `docker run -p 8080:80 app`, `docker ps`, `docker logs -f`, `docker exec -it <id> sh`, `docker compose up -d --build`, `docker compose down -v`.

```dockerfile
# Stage 1: build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```yaml
# compose.yaml
services:
  web:
    build: ./web
    ports: ["3000:80"]
    depends_on:
      api:
        condition: service_healthy
  api:
    build: ./api
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/app
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
  db:
    image: postgres:16
    environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: secret }
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  pgdata:
```

### Likely questions

- Docker vs a virtual machine? (Containers share the host kernel: lighter and faster to start. VMs run a full guest OS.)
- How do you keep images small? (Alpine or distroless base images, multi-stage builds, `.dockerignore`, fewer layers.)
- `CMD` vs `ENTRYPOINT`? `ARG` vs `ENV`? `COPY` vs `ADD`?
- What does Docker Compose add? (Multi-container apps defined in one file: shared network, volumes, startup order.)

### Gotchas

- SPA routing in Nginx needs `try_files $uri /index.html;` or refreshing a deep link returns 404.
- `VITE_*`/`REACT_APP_*` variables are baked in at build time. The same image can't change them per environment unless you inject a runtime `config.js`.
- `depends_on` only orders startup. It doesn't wait for readiness unless you use `condition: service_healthy`.
- Inside a container, `localhost` is the container itself. Use the service name (`api:4000`).
- Bind-mounting the project over `/app` hides the container's `node_modules`. Add an anonymous volume for it.
- Run as a non-root `USER` in production images.

## 11. Behavioral prep and final checklist

Prepare two project stories in STAR format (Situation, Task, Action, Result) with a number in the result. Most behavioral questions can be answered with one of them.

### Stories to have ready

- A performance problem you found and fixed (what you measured, what changed, by how much).
- A refactor or architecture decision you drove, and the trade-off you accepted.
- A disagreement in code review and how it was resolved.
- A production bug: how you debugged it and what you changed to prevent it.
- Your questions for them: team structure, how the design system is shared (Stencil + React?), testing culture, CI/CD and release frequency.

### Can you explain these without notes? (tick off tomorrow morning)

- [ ] What triggers a re-render, and three ways to prevent unnecessary ones
- [ ] Why keys matter; why index keys break
- [ ] Stale closure: cause and fix
- [ ] `useEffect` cleanup + race-condition-safe fetch
- [ ] `useMemo` vs `useCallback` vs `React.memo`
- [ ] React 19 features in one sentence each
- [ ] `type` vs `interface`; `unknown` vs `any`; a generic component
- [ ] `staleTime` vs `gcTime`; invalidation after a mutation; optimistic update steps
- [ ] RTL query priority; `getBy`/`queryBy`/`findBy`; MSW
- [ ] Jest vs Vitest; why Vite is fast in development
- [ ] Loader vs plugin; tree shaking
- [ ] `@use` vs `@import`; SASS variables vs CSS variables
- [ ] Shadow DOM encapsulation; Stencil decorators; what shadcn actually is
- [ ] SOLID with one React example each
- [ ] `cache` vs `artifacts` in GitLab CI; merge vs rebase
- [ ] Multi-stage Dockerfile for a React app + the Nginx SPA fallback

### Live coding warm-ups (if there's a coding round)

1. `useDebounce(value, delay)` hook + a search input that fetches.
2. A fetch component with loading, error and empty states (then the same with TanStack Query).
3. A todo list: add, toggle, delete, filter; then write one RTL test for it.
4. A compound `Tabs` or `Accordion` component.
5. Fix a buggy component: missing key, stale closure in `setInterval`, missing effect cleanup.

In the interview, think out loud, ask about requirements before coding, and mention trade-offs. Saying "I'd measure first" or "it depends on X; here's how I'd decide" scores well.
