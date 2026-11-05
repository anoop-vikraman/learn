# Extra "What does this print?" puzzles (11–30)

These continue the 10 puzzles in `03-output-puzzles.md`. Cover the answer, predict, then check. Always explain *why*.

---

### Puzzle 11: nested microtasks and macrotasks

```js
console.log('A');
setTimeout(() => {
  console.log('B');
  Promise.resolve().then(() => console.log('C'));
}, 0);
Promise.resolve().then(() => {
  console.log('D');
  setTimeout(() => console.log('E'), 0);
});
console.log('F');
```

<details><summary>Answer</summary>

`A F D B C E`

Sync first (A, F). Then the microtask queue empties (D, which schedules timer E). Next macrotask is B's timer, and its microtask C runs straight after it, before the next macrotask E.
</details>

---

### Puzzle 12: async/await ordering

```js
async function a() {
  console.log('1');
  await b();
  console.log('2');
}
async function b() { console.log('3'); }

console.log('4');
a();
console.log('5');
```

<details><summary>Answer</summary>

`4 1 3 5 2`

Everything before the first `await` runs synchronously, including the call to `b()`. The code after `await` becomes a microtask, so `5` prints first.
</details>

---

### Puzzle 13: the `var` loop fixed three ways

```js
for (var i = 0; i < 3; i++) setTimeout(() => console.log(i));
for (let j = 0; j < 3; j++) setTimeout(() => console.log(j));
```

<details><summary>Answer</summary>

`3 3 3` then `0 1 2`.
`var` has one function-scoped `i`, while `let` creates a new binding for each iteration. Other fixes for the `var` version: an IIFE `(i => setTimeout(() => console.log(i)))(i)`, or `setTimeout(console.log, 0, i)`.
</details>

---

### Puzzle 14: TDZ

```js
console.log(typeof x);
console.log(typeof y);
let y = 1;
```

<details><summary>Answer</summary>

`"undefined"`, then **ReferenceError**. `typeof` is safe for undeclared variables, but a `let` in its TDZ throws even with `typeof`.
</details>

---

### Puzzle 15: function vs var hoisting priority

```js
console.log(foo);
var foo = 'bar';
function foo() {}
console.log(foo);
```

<details><summary>Answer</summary>

`[Function: foo]` then `'bar'`. Function declarations are hoisted with their body and win over `var` during creation. The assignment then overwrites it at runtime.
</details>

---

### Puzzle 16: losing `this`

```js
const user = {
  name: 'Anoop',
  greet() { return `Hi ${this.name}`; },
};
const greet = user.greet;
console.log(user.greet());
console.log(greet());
```

<details><summary>Answer</summary>

`Hi Anoop`, then `Hi undefined`, or a TypeError in strict mode or modules, where `this` is `undefined`. The function was detached from its object. Fix with `user.greet.bind(user)`.
</details>

---

### Puzzle 17: `this` inside setTimeout

```js
const obj = {
  count: 10,
  regular() { setTimeout(function () { console.log(this.count); }); },
  arrow()   { setTimeout(() => console.log(this.count)); },
};
obj.regular();
obj.arrow();
```

<details><summary>Answer</summary>

`undefined` then `10`. A regular callback has its own `this` (the global object or undefined). An arrow function inherits `this` from `arrow()`, which is `obj`.
</details>

---

### Puzzle 18: Promise constructor runs synchronously

```js
console.log(1);
new Promise((resolve) => {
  console.log(2);
  resolve();
  console.log(3);
}).then(() => console.log(4));
console.log(5);
```

<details><summary>Answer</summary>

`1 2 3 5 4`. The executor runs synchronously, and `resolve()` doesn't stop execution. `.then` is a microtask.
</details>

---

### Puzzle 19: throwing in then

```js
Promise.resolve(1)
  .then((x) => { throw new Error('boom'); })
  .then(() => console.log('skipped'))
  .catch((e) => { console.log(e.message); return 2; })
  .then((v) => console.log(v))
  .finally(() => console.log('done'));
```

<details><summary>Answer</summary>

`boom`, `2`, `done`. The error skips the `.then` handlers until a `.catch`, which returns a value and recovers the chain.
</details>

---

### Puzzle 20: Promise.all fails fast

```js
const p1 = new Promise((r) => setTimeout(() => r('one'), 100));
const p2 = Promise.reject(new Error('two'));
Promise.all([p1, p2]).then(console.log).catch((e) => console.log(e.message));
Promise.allSettled([p1, p2]).then((r) => console.log(r.map((x) => x.status)));
```

<details><summary>Answer</summary>

`two` (immediately), then `['fulfilled', 'rejected']` after 100 ms.
</details>

---

### Puzzle 21: object keys are strings

```js
const a = {};
const b = { key: 'b' };
const c = { key: 'c' };
a[b] = 123;
a[c] = 456;
console.log(a[b]);
```

<details><summary>Answer</summary>

`456`. Both objects stringify to `"[object Object]"`, so they're the same key. Use a `Map` for object keys.
</details>

---

### Puzzle 22: array tricks

```js
console.log([1, 2, 3] + [4, 5]);
console.log([] + {});
console.log([10, 1, 3].sort());
console.log(['1', '7', '11'].map(parseInt));
console.log(Array(3).length, [, , ,].length);
```

<details><summary>Answer</summary>

- `"1,2,34,5"`: arrays are converted to strings, then concatenated.
- `"[object Object]"`
- `[1, 10, 3]`: the default sort compares strings. Use `.sort((a, b) => a - b)`.
- `[1, NaN, 3]`: `parseInt('7', 1)` has an invalid radix, and `parseInt('11', 2)` is 3.
- `3 3`
</details>

---

### Puzzle 23: equality

```js
console.log(NaN === NaN, Object.is(NaN, NaN));
console.log(0 === -0, Object.is(0, -0));
console.log(null == undefined, null === undefined);
console.log(null == 0, null >= 0);
console.log('' == 0, '0' == false, [] == false);
```

<details><summary>Answer</summary>

- `false true`
- `true false`
- `true false`
- `false true`: relational operators convert `null` to 0, but `==` has a special rule for null.
- `true true true`
</details>

---

### Puzzle 24: closure counter

```js
function makeCounter() {
  let count = 0;
  return { inc: () => ++count, get: () => count };
}
const c1 = makeCounter();
const c2 = makeCounter();
c1.inc(); c1.inc(); c2.inc();
console.log(c1.get(), c2.get());
```

<details><summary>Answer</summary>

`2 1`. Each call creates a separate closure scope.
</details>

---

### Puzzle 25: shallow copy

```js
const original = { a: 1, nested: { b: 2 } };
const copy = { ...original };
copy.a = 100;
copy.nested.b = 200;
console.log(original.a, original.nested.b);
```

<details><summary>Answer</summary>

`1 200`. Spread is shallow, so `nested` is still shared. For a deep copy use `structuredClone(original)`.
</details>

---

### Puzzle 26: default params and arguments

```js
function f(a, b = a * 2) { return [a, b, arguments.length]; }
console.log(f(2));
console.log(f(2, undefined));
console.log(f(2, null));
```

<details><summary>Answer</summary>

`[2, 4, 1]`, `[2, 4, 2]`, `[2, null, 2]`. Defaults only apply for `undefined`, not `null`.
</details>

---

### Puzzle 27: getter on prototype chain

```js
function Person(name) { this.name = name; }
Person.prototype.greet = function () { return 'hi ' + this.name; };
const p = new Person('A');
Person.prototype.greet = function () { return 'hello ' + this.name; };
console.log(p.greet());
console.log(p.hasOwnProperty('greet'), 'greet' in p);
```

<details><summary>Answer</summary>

`hello A`: the lookup happens at call time through the prototype link. Then `false true`.
</details>

---

### Puzzle 28: `await` with non-promise and thenable

```js
(async () => {
  const v = await 42;
  console.log(v);
  const t = await { then: (res) => res('thenable!') };
  console.log(t);
})();
console.log('sync');
```

<details><summary>Answer</summary>

`sync`, `42`, `thenable!`. `await` wraps any value in a promise and adopts thenables.
</details>

---

### Puzzle 29: forEach with async

```js
const delays = [300, 100, 200];
delays.forEach(async (d) => {
  await new Promise((r) => setTimeout(r, d));
  console.log(d);
});
console.log('end');
```

<details><summary>Answer</summary>

`end`, `100`, `200`, `300`. `forEach` doesn't await, so all three run in parallel. Use `for...of` with `await` for sequential runs, or `Promise.all(delays.map(...))` for parallel ones.
</details>

---

### Puzzle 30: React-flavoured stale closure (in plain JS)

```js
function createComponent() {
  let state = 0;
  const setState = (v) => (state = v);
  const render = () => {
    const snapshot = state;
    return () => console.log(snapshot);
  };
  return { setState, render };
}
const comp = createComponent();
const log = comp.render();
comp.setState(5);
log();
comp.render()();
```

<details><summary>Answer</summary>

`0` then `5`. The first callback closed over the old snapshot, which is exactly how a stale closure happens in a React `setInterval`.
</details>
