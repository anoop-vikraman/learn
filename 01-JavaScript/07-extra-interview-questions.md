# Extra JavaScript interview questions, with model answers

Say each answer out loud in 30–60 seconds. **Bold** marks the keyword the interviewer is listening for.

## Fundamentals

**Q: What are the data types in JavaScript?**
Seven primitives: `string`, `number`, `bigint`, `boolean`, `undefined`, `null`, `symbol`. Everything else is an `object` (arrays, functions, dates). Primitives are **immutable and copied by value**. Objects are **copied by reference**.

**Q: Why is `typeof null === 'object'`?**
It's a bug from the first JS engine (null had the object type tag 0), kept for backward compatibility. Check null with `x === null`.

**Q: `null` vs `undefined`?**
`undefined` = the variable exists but was never assigned (the engine's default). `null` = an intentional "no value" set by the developer.

**Q: What is a pure function, and why does React care?**
A pure function follows two rules:

1. **Same input → same output**, every time.
2. **No side effects:** it doesn't change anything outside itself or its inputs.

Side effects include changing an outer variable, mutating an argument, network calls, `localStorage`, logging, touching the DOM, timers, and reading `Date.now()` or `Math.random()`.

React render functions must be pure so React can call them any number of times (Strict Mode, concurrent rendering) safely.

```js
// Pure
const add = (a, b) => a + b;
const withTax = (price, rate) => price * (1 + rate);
const addItem = (cart, item) => [...cart, item];            // returns a NEW array, input untouched
const fullName = (user) => `${user.first} ${user.last}`;

// Impure
let total = 0;
const addToTotal = (n) => (total += n);                     // changes an outside variable
const addItemBad = (cart, item) => { cart.push(item); return cart; };  // mutates its argument
const stamp = (msg) => `${Date.now()}: ${msg}`;             // different output for the same input
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const save = (user) => localStorage.setItem('user', JSON.stringify(user));  // writes to storage
const getUser = (id) => fetch(`/api/users/${id}`);          // network call
const log = (x) => console.log(x);                          // I/O
```

**Why pure functions are preferred:** they're predictable, easy to test (no mocks needed), safe to memoise, and safe to run in any order or more than once.

**Impure code isn't bad; it's necessary** (an app that never saves or fetches anything is useless). Keep it at the edges: event handlers, `useEffect`, API layers, and keep the logic in between pure.

```jsx
// Impure component: mutates a variable outside it during render. Strict Mode renders twice, so the count is wrong.
let renders = 0;
function Bad() { renders++; return <p>{renders}</p>; }

// Impure component: mutates props
function AlsoBad({ items }) { items.sort(); return <List items={items} />; }

// Pure: derives new data and leaves props alone
function Good({ items }) { const sorted = items.toSorted(); return <List items={sorted} />; }
```

**Q: Explain the difference between `==` and `===`, and when you'd use `==`.**
`===` checks type and value. `==` coerces first. The only common acceptable use of `==` is `x == null`, which checks for both `null` and `undefined`.

**Q: What is `Symbol` used for?**
A symbol is a primitive value that is **guaranteed unique**. It's used for:

- property keys that never clash with anyone else's (library-internal keys),
- keys hidden from normal iteration,
- **well-known symbols** that customise built-in behaviour: `Symbol.iterator` makes an object iterable.

```js
const id = Symbol('id');           // 'id' is just a label for debugging
Symbol('id') === Symbol('id');     // false: every symbol is unique

const user = { name: 'Ann', [id]: 123 };
user[id];                          // 123
Object.keys(user);                 // ['name']: symbol keys are skipped by keys, for...in, JSON.stringify
JSON.stringify(user);              // '{"name":"Ann"}'
Object.getOwnPropertySymbols(user); // [Symbol(id)]: you can still get them on purpose

// A library can attach data without clashing with your keys
const META = Symbol('meta');
user[META] = { cachedAt: Date.now() };   // no clash, even if user already has a 'meta' key

// Unique constants (enum-like): can't be confused with a plain string
const Status = Object.freeze({ LOADING: Symbol('loading'), DONE: Symbol('done') });

// Global registry: the same symbol across files and iframes
Symbol.for('app.theme') === Symbol.for('app.theme');   // true

// Well-known symbols change how built-in operations treat your object
const price = {
  amount: 42,
  [Symbol.toPrimitive](hint) { return hint === 'number' ? this.amount : `$${this.amount}`; },
};
+price;       // 42
`${price}`;   // '$42'
```

React marks its elements with `$$typeof: Symbol.for('react.element')`. JSON can't contain symbols, so a malicious JSON response can't pretend to be a React element.

**Q: What are `Map`/`Set` vs object/array? When are `WeakMap`/`WeakSet` used?**
`Map` takes any key type, keeps insertion order, has `.size`, and is faster for frequent add/remove. `Set` stores unique values. `WeakMap` keys must be objects and are held **weakly**, so they don't prevent garbage collection: use it for caches or private data tied to DOM nodes or objects.

| | Keys / values | Iterable, `.size` | Holds keys strongly? | Typical use |
| --- | --- | --- | --- | --- |
| Object | String / symbol keys | No (use `Object.keys`) | Yes | Fixed-shape records, JSON |
| `Map` | **Any** key (objects, functions, numbers) | Yes | Yes | Dictionaries with frequent add/delete, non-string keys |
| `Set` | Unique values of any type | Yes | Yes | De-duplicating, "have I seen this?" checks |
| `WeakMap` | **Object** keys only | **No** | **No** (weak) | Caches / private data tied to an object's lifetime |
| `WeakSet` | **Objects** only | **No** | **No** (weak) | Tagging objects ("visited", "processed") |

```js
// Map: any key type, keeps insertion order
const visits = new Map();
const ann = { id: 1 };
visits.set(ann, 3).set('guest', 1).set(42, 'answer');   // set() returns the map, so you can chain
visits.get(ann);          // 3: an object as a key, impossible with a plain object
visits.has('guest');      // true
visits.size;              // 3
visits.delete(42);
for (const [key, value] of visits) console.log(key, value);
const fromObject = new Map(Object.entries({ a: 1, b: 2 }));   // object -> Map
const toObject = Object.fromEntries(fromObject);              // Map -> object (string keys)
```

```js
// Set: unique values
const tags = new Set(['js', 'react', 'js']);
tags.size;                // 2: the duplicate 'js' was dropped
tags.add('css');
tags.has('react');        // true (much faster than array.includes for big lists)
tags.delete('js');
const unique = [...new Set([1, 2, 2, 3, 3])];   // [1, 2, 3]: the classic de-duplicate trick

// Newer Set methods (in modern browsers)
const a = new Set([1, 2, 3]), b = new Set([2, 3, 4]);
a.union(b);          // Set {1, 2, 3, 4}
a.intersection(b);   // Set {2, 3}
a.difference(b);     // Set {1}
```

```js
// WeakMap: data that should disappear when the object does
const cache = new WeakMap();
function getStats(report) {
  if (!cache.has(report)) cache.set(report, expensiveCalculation(report));
  return cache.get(report);
}
let report = { rows: [/* ... */] };
getStats(report);
report = null;   // the report AND its cache entry can now be garbage-collected
// With a Map, the cache would keep the report alive forever: a memory leak.

// WeakMap for private data per instance (the pattern used before #private fields)
const secrets = new WeakMap();
class User {
  constructor(password) { secrets.set(this, { password }); }
  check(pw) { return secrets.get(this).password === pw; }
}

// WeakMap for metadata on DOM nodes: removed nodes don't leak
const tooltipData = new WeakMap();
tooltipData.set(document.querySelector('#save'), { text: 'Save changes' });
```

```js
// WeakSet: mark objects without keeping them alive
const visited = new WeakSet();
function walk(obj) {
  if (obj === null || typeof obj !== 'object' || visited.has(obj)) return;  // stops infinite loops on circular refs
  visited.add(obj);
  Object.values(obj).forEach(walk);
}

const clickedOnce = new WeakSet();
button.addEventListener('click', (e) => {
  if (clickedOnce.has(e.currentTarget)) return;   // ignore repeat clicks
  clickedOnce.add(e.currentTarget);
  submit();
});
```

**Why weak collections can't be iterated:** garbage collection can remove an entry at any moment, so `.size` or a loop would give unpredictable results. You can only `get` / `set` / `has` / `delete` with a key you already hold.

**Q: What is optional chaining and nullish coalescing?**
`a?.b?.c` stops and returns undefined if something in the chain is null or undefined. `a ?? b` falls back only for `null`/`undefined`, unlike `||`, which also falls back for `0`, `''` and `false`. `count ?? 10` keeps a count of 0.

**Q: Spread vs rest?**
They use the same `...` syntax. **Spread** expands (`[...arr]`, `{...obj}`, `fn(...args)`). **Rest** collects (`function f(...args)`, `const { a, ...others } = obj`).

A quick way to tell them apart: `...` on the **right** of `=` or in a function **call** spreads. On the **left** of `=` or in a function **definition**, it collects (rest).

**Spread: expand an array, object or string into individual items.**

```js
// Arrays
const a = [1, 2], b = [3, 4];
const copy = [...a];                  // [1, 2]: a new array (shallow copy)
const merged = [...a, ...b, 5];       // [1, 2, 3, 4, 5]
Math.max(...a);                       // 2: an array spread into separate arguments
[...'hey'];                           // ['h', 'e', 'y']: works on any iterable
[...new Set([1, 1, 2])];              // [1, 2]

// Objects
const defaults = { theme: 'light', lang: 'en' };
const prefs = { theme: 'dark' };
const settings = { ...defaults, ...prefs };   // { theme: 'dark', lang: 'en' }: later keys win
const updated = { ...user, name: 'Bob' };     // copy with one field changed (React state updates)

// Shallow only: nested objects are still shared
const original = { info: { age: 30 } };
const clone = { ...original };
clone.info.age = 99;
original.info.age;                    // 99: same nested object
```

**Rest: collect the remaining items into an array or object.**

```js
// In function parameters: any number of arguments, as a real array
function sum(...nums) { return nums.reduce((t, n) => t + n, 0); }
sum(1, 2, 3);                         // 6
function log(level, ...messages) { console[level](...messages); }   // rest in, spread out

// In destructuring
const [first, ...others] = [1, 2, 3, 4];        // first = 1, others = [2, 3, 4]
const { password, ...safeUser } = user;         // remove a field without mutating user

// Rest must be LAST
// const [...start, last] = arr;      // SyntaxError
```

Rest parameters replaced the old `arguments` object. `arguments` is array-like (no `.map`), arrow functions don't have it, and it always includes every argument.

**Q: What is destructuring? Show defaults, renaming and nesting.**
Destructuring unpacks values from arrays (**by position**) or objects (**by name**) into variables.

```js
const { data: user = {}, status = 'idle' } = response;
const [first, , third = 0] = arr;
```

```js
// Objects: by property name
const person = { name: 'Ann', age: 30, address: { city: 'Pune' } };

const { name, age } = person;                       // name = 'Ann', age = 30
const { name: fullName } = person;                  // rename: fullName = 'Ann'
const { role = 'user' } = person;                   // default when the property is undefined
const { name: n = 'Anon' } = person;                // rename + default together
const { address: { city } } = person;               // nested: city = 'Pune' (no `address` variable is created)
const { address: { zip } = {} } = {};               // default {} stops "cannot read properties of undefined"

// Arrays: by position
const [x, y] = [10, 20];
const [, second] = [1, 2, 3];                       // skip items with commas
const [p = 5, q = 7] = [1];                         // p = 1, q = 7
let m = 1, k = 2;
[m, k] = [k, m];                                    // swap without a temp variable

// Function parameters (everywhere in React props)
function Card({ title, subtitle = '', onClick }) { /* ... */ }
function connect({ host = 'localhost', port = 5432 } = {}) { /* ... */ }  // = {} allows connect()

// In loops
for (const [key, value] of Object.entries(person)) console.log(key, value);
const [count, setCount] = useState(0);              // array destructuring: you choose the names
```

Gotcha: **defaults apply only for `undefined`, not `null`**. With `const { a = 1 } = { a: null }`, `a` is `null`.

**Q: `Object.freeze` vs `const`?**
`const` stops **reassignment** of the variable. `Object.freeze` stops **mutation** of the object, but only shallowly.

```js
'use strict';
const config = Object.freeze({ api: '/v1', retry: { count: 3 } });

config.api = '/v2';          // TypeError in strict mode (silently ignored in sloppy mode)
config.timeout = 500;        // TypeError: can't add properties
delete config.api;           // TypeError: can't delete properties
config.retry.count = 5;      // WORKS: freeze is shallow, nested objects aren't frozen
Object.isFrozen(config);     // true
config = {};                 // TypeError, but that's const's doing, not freeze's

const list = Object.freeze([1, 2]);
list.push(3);                // TypeError, even in sloppy mode
```

**Deep freeze** (freeze every nested object too):

```js
function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);  // isFrozen check avoids loops
  }
  return Object.freeze(obj);
}
```

| | Add properties | Delete properties | Change values |
| --- | --- | --- | --- |
| `Object.preventExtensions` | No | Yes | Yes |
| `Object.seal` | No | No | Yes |
| `Object.freeze` | No | No | No |

**When to use it:**

- constants and enums: `const ROLES = Object.freeze({ ADMIN: 'admin' })`,
- config objects,
- catching accidental mutation in development. Immer and Redux Toolkit freeze state in development so a mutation throws immediately.

Freezing doesn't make anything faster, and it can't be undone (to change it, make a copy).

**Q: What are getters/setters?**
```js
const temp = {
  _c: 0,
  get f() { return this._c * 9 / 5 + 32; },
  set f(v) { this._c = (v - 32) * 5 / 9; },
};
```

**Q: What is an IIFE and is it still useful?**
An Immediately Invoked Function Expression `(() => {...})()` creates a private scope. ES modules mostly replaced it, but it's still handy for top-level async: `(async () => { await ... })()`.

```js
(function () { console.log('runs right away'); })();
(() => { console.log('arrow version'); })();
(function greet(name) { console.log(`Hi ${name}`); })('Ann');   // can take arguments

// function () {}();    // SyntaxError: a line starting with `function` is read as a DECLARATION
// The wrapping ( ) makes it an EXPRESSION, which can be called immediately.
```

**What it's used for:**

```js
// 1. Private scope: keep variables out of the global scope (essential before ES modules)
(function () {
  const apiKey = 'abc';          // not visible to other scripts on the page
  window.app = { start() { /* uses apiKey */ } };
})();

// 2. The module pattern: private state plus a public API (a closure)
const counterModule = (function () {
  let count = 0;                         // private
  return {
    increment: () => ++count,
    get: () => count,
  };
})();
counterModule.increment();               // 1
counterModule.count;                     // undefined: truly private

// 3. Fixing the var-in-a-loop closure bug (before let existed)
for (var i = 0; i < 3; i++) {
  (function (j) {                        // each call gets its own j
    setTimeout(() => console.log(j), 100);
  })(i);
}
// 0, 1, 2

// 4. Using await where top-level await isn't allowed (CommonJS, classic scripts)
(async () => {
  const res = await fetch('/api/config');
  console.log(await res.json());
})();

// 5. Computing a const with several steps
const config = (() => {
  const env = location.hostname === 'localhost' ? 'dev' : 'prod';
  return { env, apiUrl: env === 'dev' ? 'http://localhost:3000' : 'https://api.example.com' };
})();
```

Gotcha: if the previous line has no semicolon, the `(` is read as a function call:

```js
const a = 1
(function () {})()     // TypeError: 1 is not a function
```

Start the IIFE with `;` if you don't use semicolons.

## Functions and closures

**Q: Function declaration vs expression vs arrow?**
A declaration is hoisted with its body. An expression isn't (the variable is hoisted, the value isn't). Arrow functions have no own `this`, `arguments`, `prototype` or `new`, and are good for callbacks.

**Q: What is variable shadowing?**
When a variable in an inner scope has the **same name** as one in an outer scope, the inner one **shadows** (hides) the outer one within that scope. Variable lookup stops at the first match in the scope chain, so the outer variable can't be reached by that name inside, and it isn't changed.

```js
const name = 'global';

function greet() {
  const name = 'function';       // shadows the global name inside greet
  console.log(name);             // 'function'

  if (true) {
    const name = 'block';        // shadows again, only inside this block
    console.log(name);           // 'block'
  }

  console.log(name);             // 'function': the block's variable is gone
}

greet();
console.log(name);               // 'global': never touched
```

**Parameters shadow outer variables too:**

```js
let user = { name: 'Ann' };
function reset(user) {
  user = null;                   // changes the PARAMETER, not the outer user
}
reset(user);
console.log(user);               // { name: 'Ann' }
```

**Legal vs illegal shadowing:**

```js
var a = 1;
{
  let a = 2;     // fine: let creates a new block-scoped variable
}

let b = 1;
{
  var b = 2;     // SyntaxError: 'b' has already been declared
}                // var ignores blocks, so it would re-declare b in the SAME scope as the let

function f(x) {
  let x = 2;     // SyntaxError: x is already declared as a parameter in this scope
}
```

**A gotcha: the TDZ with shadowing.**

```js
let count = 0;
function increment() {
  let count = count + 1;   // ReferenceError: the inner count shadows the outer one from the start
}                          // of the function, and it's still in the TDZ when the right side runs
```

**Why it matters:** shadowing is often an accidental bug, for example `const [data, setData] = useState()` followed by `.then(data => ...)` inside the same component. Then you read the wrong variable. ESLint's `no-shadow` rule warns about it.

**Q: Give a real-world closure bug and fix.**
A stale closure in React: `setInterval(() => setCount(count + 1), 1000)` inside `useEffect(..., [])` always sees `count = 0`. Fix: `setCount(c => c + 1)`.

**Q: What is a higher-order function?**
A function that takes or returns a function: `map`, `debounce`, HOCs, middleware.

**Q: What is memory leak risk with closures?**
A closure keeps its whole outer scope alive. An event listener or interval that's never removed keeps big objects referenced. Fix: remove listeners or clear timers (React effect cleanup), and use `WeakMap` for caches.

## Async

**Q: Explain the event loop in 4 sentences.**
JS runs one call stack. Async work (timers, fetch, I/O) is handed to the browser or Node APIs. When it's done, its callback goes into a queue: promise callbacks into the **microtask** queue, timers and events into the **macrotask** queue. Whenever the stack is empty, the loop drains **all** microtasks, may render, and then takes **one** macrotask.

**Q: Where does `requestAnimationFrame` fit?**
It runs before the next repaint (about 60 times a second), after microtasks, and it's ideal for animations. `requestIdleCallback` runs when the browser is idle.

**Q: Can microtasks starve rendering?**
Yes. A recursive `Promise.resolve().then(loop)` never lets the loop reach rendering, and the page freezes. A recursive `setTimeout` doesn't freeze the page.

**Q: How do you handle errors in async/await vs promises?**
`try/catch/finally` around `await`, or `.catch()` on chains. An unhandled rejection fires `unhandledrejection` in browsers and can crash Node.

**Q: How do you add a timeout to fetch?**
```js
const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
// or race:
const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), ms))]);
```

**Q: What are Web Workers?**
Real background threads for CPU-heavy work (parsing, image processing). They communicate via `postMessage` and have no DOM access.

## Objects, classes and prototypes

**Q: Prototypal vs classical inheritance?**
JS objects inherit directly from other objects through the prototype chain. `class` is syntax sugar over constructor functions and prototypes, with no copying of methods.

**Q: What are private class fields?**
`#field` is truly private (enforced by the engine), unlike a `_field` convention or TypeScript's `private`, which is compile-time only.

**Q: `Object.create(null)`, why?**
It creates an object with no prototype: a clean dictionary without inherited keys like `toString`.

**Q: Shallow vs deep copy methods?**
Shallow: spread, `Object.assign`, `Array.from`, `slice`. Deep: `structuredClone`. `JSON.parse(JSON.stringify(x))` loses dates, `undefined`, functions, Maps and cycles.

**Q: What is the difference between `for...in` and `for...of`?**
`for...in` iterates **keys** (including inherited enumerable ones), meant for objects. `for...of` iterates **values** of iterables (arrays, strings, Maps, Sets).

**Q: How would you make an object iterable?**
```js
const range = {
  from: 1, to: 3,
  *[Symbol.iterator]() { for (let i = this.from; i <= this.to; i++) yield i; },
};
[...range]; // [1, 2, 3]
```

## Browser and DOM

**Q: What happens when you type a URL and press Enter?** (short version)
DNS lookup, then a TCP + TLS handshake, then an HTTP request. The server responds with HTML. The browser parses HTML into the DOM and CSS into the CSSOM, combines them into the render tree, then does layout, paint and composite. JS can block parsing unless it's `defer`/`async`/`type="module"`.

**Q: `async` vs `defer` on script tags?**
Both download in parallel. `async` runs as soon as it has downloaded, in any order, and blocks parsing at that moment. `defer` runs in order after HTML parsing finishes. Module scripts are deferred by default.

```
Plain <script src>:
  HTML parsing ████████▌ (stopped) ...................... ▐█████████████
  script                ▐── download ──▐── execute ──▌

<script async src>:
  HTML parsing ████████████████▌ (stopped) ▐█████████████████
  script       ▐── download ───▐─ execute ─▌

<script defer src>:
  HTML parsing ████████████████████████████████▌ done
  script       ▐── download ───▌               ▐─ execute ─▌ → DOMContentLoaded
```

| | Plain `<script>` | `async` | `defer` | `type="module"` |
| --- | --- | --- | --- | --- |
| Blocks HTML parsing while downloading | **Yes** | No | No | No |
| When it runs | Immediately, as soon as it's downloaded | As soon as it's downloaded (parsing pauses) | **After** HTML parsing is finished | Like `defer` (or like `async` if marked `async`) |
| Order between scripts | In document order | **Any order**: whichever downloads first | **In document order** | In document order |
| Relative to `DOMContentLoaded` | Before | Before **or** after | **Before** (the event waits for deferred scripts) | Before |
| Can safely use the DOM | Only elements above it | Not guaranteed | **Yes**, the whole DOM is parsed | Yes |
| Use for | Rarely needed now | Independent scripts: analytics, ads | **Your app code**, scripts that depend on each other or on the DOM | Modern app code |

```html
<head>
  <!-- Downloads in parallel and runs after parsing, in this order: vendor first, then app -->
  <script defer src="/vendor.js"></script>
  <script defer src="/app.js"></script>

  <!-- Doesn't depend on anything and nothing depends on it, so it can run whenever -->
  <script async src="https://analytics.example.com/tag.js"></script>
</head>
```

**Things to know about `defer`:**

- Put `defer` scripts in the `<head>`: they start downloading early and still don't block the page. That's better than the old trick of putting scripts at the end of `<body>`, where downloading only starts once the parser reaches them.
- `defer` and `async` work only on **external** scripts (with `src`). On an inline classic script they're ignored.
- Scripts added with JavaScript (`document.createElement('script')`) behave like `async` by default.
- Vite and other bundlers output `<script type="module">`, which is deferred automatically.

**Q: Reflow vs repaint?**
Reflow (layout) recalculates sizes and positions, which is expensive: it's triggered by changing width or reading `offsetHeight` after writes. Repaint redraws pixels (colour changes). `transform`/`opacity` animations skip both: they're **compositor-only**.

**Q: What is layout thrashing?**
Alternating DOM reads and writes in a loop, which forces synchronous reflows. Fix: batch all reads, then all writes (or use `requestAnimationFrame`).

**Q: `e.target` vs `e.currentTarget`?**
`target` = the element that was actually clicked. `currentTarget` = the element the listener is attached to.

**Q: localStorage limits and security?**
About 5 MB, synchronous, strings only, readable by any JS on the origin (so XSS can steal it). Store auth tokens in `HttpOnly` cookies instead.

## Quick-fire one-liners

| Question | Answer |
| --- | --- |
| `Array.isArray` vs `instanceof Array` | `isArray` works across iframes/realms |
| `slice` vs `splice` | `slice` copies (non-mutating); `splice` removes/inserts (mutates) |
| `Number('')`, `Number(null)`, `Number(undefined)` | `0`, `0`, `NaN` |
| `0.1 + 0.2 === 0.3` | `false` (floating point); compare with `Math.abs(a - b) < Number.EPSILON` |
| `[] instanceof Object` | `true` |
| Strict mode does what? | Throws on silent errors, `this` is undefined in plain calls, no accidental globals |
| `Object.keys` vs `Object.entries` | Keys vs `[key, value]` pairs; both own enumerable string keys only |
| `at(-1)` | Last element of array/string |
| `Array.from({length: 3}, (_, i) => i)` | `[0, 1, 2]` |
| Tagged template | `` tag`hello ${x}` `` calls `tag(strings, ...values)` (used by styled-components) |
