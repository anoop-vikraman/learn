# Part B: How JavaScript works internally

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

