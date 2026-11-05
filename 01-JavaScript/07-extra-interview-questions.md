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
Same input, same output, no side effects. React render functions must be pure so React can call them any number of times (Strict Mode, concurrent rendering) safely.

**Q: Explain the difference between `==` and `===`, and when you'd use `==`.**
`===` checks type and value. `==` coerces first. The only common acceptable use of `==` is `x == null`, which checks for both `null` and `undefined`.

**Q: What is `Symbol` used for?**
Unique property keys that never clash (library-internal keys), and well-known symbols that customise behaviour: `Symbol.iterator` makes an object iterable.

**Q: What are `Map`/`Set` vs object/array? When are `WeakMap`/`WeakSet` used?**
`Map` takes any key type, keeps insertion order, has `.size`, and is faster for frequent add/remove. `Set` stores unique values. `WeakMap` keys must be objects and are held **weakly**, so they don't prevent garbage collection: use it for caches or private data tied to DOM nodes or objects.

**Q: What is optional chaining and nullish coalescing?**
`a?.b?.c` stops and returns undefined if something in the chain is null or undefined. `a ?? b` falls back only for `null`/`undefined`, unlike `||`, which also falls back for `0`, `''` and `false`. `count ?? 10` keeps a count of 0.

**Q: Spread vs rest?**
They use the same `...` syntax. **Spread** expands (`[...arr]`, `{...obj}`, `fn(...args)`). **Rest** collects (`function f(...args)`, `const { a, ...others } = obj`).

**Q: What is destructuring with defaults and renaming?**
```js
const { data: user = {}, status = 'idle' } = response;
const [first, , third = 0] = arr;
```

**Q: `Object.freeze` vs `const`?**
`const` stops **reassignment** of the variable. `Object.freeze` stops **mutation** of the object, but only shallowly.

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

## Functions and closures

**Q: Function declaration vs expression vs arrow?**
A declaration is hoisted with its body. An expression isn't (the variable is hoisted, the value isn't). Arrow functions have no own `this`, `arguments`, `prototype` or `new`, and are good for callbacks.

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
