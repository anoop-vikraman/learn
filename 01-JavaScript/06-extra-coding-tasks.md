# Extra JavaScript coding tasks (polyfills and machine coding)

These continue `04-write-it-yourself-polyfills.md`. Practise writing each one in under 5 minutes.

## Promise combinators from scratch

```js
// Promise.allSettled
function allSettled(promises) {
  return Promise.all(
    promises.map((p) =>
      Promise.resolve(p).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason }),
      ),
    ),
  );
}

// Promise.race: first to settle wins (fulfilled OR rejected)
function race(promises) {
  return new Promise((resolve, reject) => {
    promises.forEach((p) => Promise.resolve(p).then(resolve, reject));
  });
}

// Promise.any: first to FULFILL wins; rejects only if all reject
function any(promises) {
  return new Promise((resolve, reject) => {
    const errors = [];
    let rejected = 0;
    if (promises.length === 0) return reject(new AggregateError([], 'All rejected'));
    promises.forEach((p, i) =>
      Promise.resolve(p).then(resolve, (err) => {
        errors[i] = err;
        if (++rejected === promises.length) reject(new AggregateError(errors, 'All rejected'));
      }),
    );
  });
}
```

## Concurrency-limited promise pool (asked a lot at product companies)

Run at most `limit` async tasks at once, and keep results in the original order.

```js
async function promisePool(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const i = next++;            // claim an index synchronously
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// usage
const tasks = [1, 2, 3, 4, 5].map((n) => () => fetch(`/api/items/${n}`).then((r) => r.json()));
promisePool(tasks, 2).then(console.log);
```

## A tiny Promise implementation (stretch goal)

```js
class MyPromise {
  #state = 'pending';
  #value;
  #handlers = [];

  constructor(executor) {
    const settle = (state) => (value) => {
      if (this.#state !== 'pending') return;      // settles only once
      if (value && typeof value.then === 'function') return value.then(this.#resolve, this.#reject);
      this.#state = state;
      this.#value = value;
      this.#handlers.forEach((h) => h());
    };
    this.#resolve = settle('fulfilled');
    this.#reject = settle('rejected');
    try { executor(this.#resolve, this.#reject); } catch (e) { this.#reject(e); }
  }
  #resolve; #reject;

  then(onFul, onRej) {
    return new MyPromise((resolve, reject) => {
      const run = () =>
        queueMicrotask(() => {
          const cb = this.#state === 'fulfilled' ? onFul : onRej;
          if (typeof cb !== 'function') {
            return this.#state === 'fulfilled' ? resolve(this.#value) : reject(this.#value);
          }
          try { resolve(cb(this.#value)); } catch (e) { reject(e); }
        });
      this.#state === 'pending' ? this.#handlers.push(run) : run();
    });
  }
  catch(onRej) { return this.then(undefined, onRej); }
  finally(cb) {
    return this.then(
      (v) => { cb(); return v; },
      (e) => { cb(); throw e; },
    );
  }
}
```

## call / apply polyfills

```js
Function.prototype.myCall = function (ctx, ...args) {
  ctx = ctx ?? globalThis;
  const key = Symbol('fn');
  ctx[key] = this;              // `this` is the function being called
  const result = ctx[key](...args);
  delete ctx[key];
  return result;
};

Function.prototype.myApply = function (ctx, args = []) {
  return this.myCall(ctx, ...args);
};
```

## `new` and `instanceof` from scratch

```js
function myNew(Ctor, ...args) {
  const obj = Object.create(Ctor.prototype);   // 1 + 2: empty object linked to prototype
  const result = Ctor.apply(obj, args);        // 3: run constructor with this = obj
  return result !== null && (typeof result === 'object' || typeof result === 'function')
    ? result                                   // 4: an explicit object return wins
    : obj;
}

function myInstanceOf(obj, Ctor) {
  let proto = Object.getPrototypeOf(obj);
  while (proto) {
    if (proto === Ctor.prototype) return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}
```

## Currying

```js
function curry(fn) {
  return function curried(...args) {
    return args.length >= fn.length
      ? fn.apply(this, args)
      : (...more) => curried.apply(this, [...args, ...more]);
  };
}

const add3 = (a, b, c) => a + b + c;
const c = curry(add3);
c(1)(2)(3); // 6
c(1, 2)(3); // 6

// Infinite currying: sum(1)(2)(3)() === 6
const sum = (a) => (b) => (b === undefined ? a : sum(a + b));
```

## compose and pipe

```js
const compose = (...fns) => (x) => fns.reduceRight((acc, fn) => fn(acc), x);
const pipe = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);

const slugify = pipe(
  (s) => s.trim(),
  (s) => s.toLowerCase(),
  (s) => s.replace(/\s+/g, '-'),
);
slugify('  Hello World  '); // "hello-world"
```

## once and memoize (any arguments)

```js
function once(fn) {
  let called = false, result;
  return function (...args) {
    if (!called) { called = true; result = fn.apply(this, args); }
    return result;
  };
}

function memoize(fn, keyFn = (...args) => JSON.stringify(args)) {
  const cache = new Map();
  return function (...args) {
    const key = keyFn(...args);
    if (!cache.has(key)) cache.set(key, fn.apply(this, args));
    return cache.get(key);
  };
}
```

## Event emitter (pub/sub)

```js
class EventEmitter {
  #events = new Map();

  on(event, listener) {
    if (!this.#events.has(event)) this.#events.set(event, new Set());
    this.#events.get(event).add(listener);
    return () => this.off(event, listener);      // return an unsubscribe function, like React effects
  }
  off(event, listener) { this.#events.get(event)?.delete(listener); }
  once(event, listener) {
    const off = this.on(event, (...args) => { off(); listener(...args); });
    return off;
  }
  emit(event, ...args) {
    this.#events.get(event)?.forEach((l) => l(...args));
  }
}
```

## Deep equal

```js
function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a), keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}
```

## Deep clone that handles cycles, Dates, Maps, Sets

```js
function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value);
  if (value instanceof RegExp) return new RegExp(value);
  if (value instanceof Map) {
    const m = new Map(); seen.set(value, m);
    value.forEach((v, k) => m.set(deepClone(k, seen), deepClone(v, seen)));
    return m;
  }
  if (value instanceof Set) {
    const s = new Set(); seen.set(value, s);
    value.forEach((v) => s.add(deepClone(v, seen)));
    return s;
  }
  const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) copy[key] = deepClone(value[key], seen);
  return copy;
}
// Mention in an interview: modern runtimes have structuredClone() (no functions or DOM nodes, though).
```

## LRU cache (Map keeps insertion order)

```js
class LRUCache {
  constructor(capacity) { this.capacity = capacity; this.map = new Map(); }

  get(key) {
    if (!this.map.has(key)) return -1;
    const value = this.map.get(key);
    this.map.delete(key);          // move to "most recent"
    this.map.set(key, value);
    return value;
  }

  put(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      this.map.delete(this.map.keys().next().value);   // oldest = first key
    }
  }
}
```

## Array utilities interviewers love

```js
// groupBy (also native now: Object.groupBy(arr, fn))
const groupBy = (arr, fn) =>
  arr.reduce((acc, item) => {
    const key = typeof fn === 'function' ? fn(item) : item[fn];
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

// chunk([1,2,3,4,5], 2) -> [[1,2],[3,4],[5]]
const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

// unique by key
const uniqueBy = (arr, key) => [...new Map(arr.map((x) => [x[key], x])).values()];

// Array.prototype.filter polyfill
Array.prototype.myFilter = function (cb, thisArg) {
  const out = [];
  for (let i = 0; i < this.length; i++) {
    if (i in this && cb.call(thisArg, this[i], i, this)) out.push(this[i]);
  }
  return out;
};

// Flatten an object: { a: { b: 1 } } -> { 'a.b': 1 }
function flattenObject(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flattenObject(v, key, out);
    else out[key] = v;
  }
  return out;
}
```

## Get a nested value safely: `get(obj, 'a.b[0].c')`

```js
function get(obj, path, defaultValue) {
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let result = obj;
  for (const k of keys) {
    result = result?.[k];
    if (result === undefined) return defaultValue;
  }
  return result;
}
```

## Debounce with cancel + leading option (an upgrade on the basic version)

```js
function debounce(fn, delay, { leading = false } = {}) {
  let timer = null;
  function debounced(...args) {
    const callNow = leading && !timer;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!leading) fn.apply(this, args);
    }, delay);
    if (callNow) fn.apply(this, args);
  }
  debounced.cancel = () => { clearTimeout(timer); timer = null; };
  return debounced;
}
```

## DOM tasks (vanilla JS rounds)

```js
// Event delegation: one listener for a whole list
document.querySelector('#todo-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="delete"]');
  if (!btn) return;
  btn.closest('li').remove();
});

// Infinite scroll with IntersectionObserver
const sentinel = document.querySelector('#sentinel');
const io = new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting) loadMore();
}, { rootMargin: '200px' });
io.observe(sentinel);

// getElementsByClassName-style DOM traversal (recursion question)
function findByClass(root, cls, out = []) {
  if (root.classList?.contains(cls)) out.push(root);
  for (const child of root.children) findByClass(child, cls, out);
  return out;
}
```
