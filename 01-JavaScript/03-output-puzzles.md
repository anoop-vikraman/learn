# Part C: "What does this print?" puzzles

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

