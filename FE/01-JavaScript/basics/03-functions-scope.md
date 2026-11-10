# 03 · Functions and scope

A **function** is a reusable block of code. You **define** it once and **call** it as often as you like. It can take inputs (**parameters**) and give back an output (**return value**).

## 1. Three ways to write a function

```js
// 1. Function declaration
function add(a, b) {
  return a + b;
}

// 2. Function expression (a function stored in a variable)
const subtract = function (a, b) {
  return a - b;
};

// 3. Arrow function (short syntax, very common in modern code and React)
const multiply = (a, b) => {
  return a * b;
};

add(2, 3);      // 5  ← calling the function
```

### Arrow function short forms

```js
const double = (n) => n * 2;        // one expression → implicit return (no braces, no return)
const double2 = n => n * 2;         // one parameter → parentheses optional
const getOne = () => 1;             // no parameters → empty parentheses required
const makeUser = (name) => ({ name }); // returning an object → wrap it in ( )

const broken = (name) => { name };  // ⚠️ returns undefined: { } is read as a function body
```

### Declaration vs expression vs arrow

| | Declaration | Expression | Arrow |
| --- | --- | --- | --- |
| Can call before it's defined (hoisted) | ✅ | ❌ | ❌ |
| Own `this` | ✅ | ✅ | ❌ (uses outer `this`) |
| `arguments` object | ✅ | ✅ | ❌ |
| Can be used with `new` | ✅ | ✅ | ❌ |
| Typical use | Top-level helpers | Rare today | Callbacks, React components, short helpers |

---

## 2. Parameters and arguments

**Parameters** are the names in the definition; **arguments** are the values you pass when calling.

```js
function greet(name, greeting) {   // parameters
  return `${greeting}, ${name}!`;
}
greet('Anoop', 'Hello');           // arguments → 'Hello, Anoop!'
```

### Missing and extra arguments

```js
greet('Anoop');          // 'undefined, Anoop!'  missing → undefined
greet('A', 'Hi', 'x');   // extra arguments are ignored
```

### Default parameters

```js
function greet(name, greeting = 'Hello') {
  return `${greeting}, ${name}!`;
}
greet('Anoop');              // 'Hello, Anoop!'
greet('Anoop', undefined);   // 'Hello, Anoop!'  undefined → default is used
greet('Anoop', null);        // 'null, Anoop!'   ⚠️ null does NOT trigger the default
```

### Rest parameters: any number of arguments as an array

```js
function sum(...numbers) {        // must be the last parameter
  return numbers.reduce((total, n) => total + n, 0);
}
sum(1, 2, 3, 4);   // 10
```

### Destructuring parameters (very common in React)

```js
function createUser({ name, age = 18, role = 'user' }) {
  return `${name} (${age}) - ${role}`;
}
createUser({ name: 'Anoop', age: 25 });

// ⚠️ createUser() with no argument throws. Give the whole object a default:
function createUser2({ name, age } = {}) { /* ... */ }
```

Using an options object instead of many positional parameters means callers don't have to remember the order.

---

## 3. Return values

```js
function isAdult(age) {
  return age >= 18;         // return ends the function immediately
  console.log('never runs');
}

function logOnly(msg) {
  console.log(msg);         // no return → returns undefined
}
```

⚠️ A line break right after `return` returns `undefined` (automatic semicolon insertion):

```js
function bad() {
  return       // ← JS inserts ; here
    { ok: true };
}
bad(); // undefined
```

To return several values, return an object or array: `return { min, max };` / `return [value, setValue];`.

---

## 4. Functions are values ("first-class")

You can store functions in variables, pass them to other functions, and return them from functions.

```js
// Passing a function as an argument = a "callback"
[1, 2, 3].map((n) => n * 2);            // [2, 4, 6]
setTimeout(() => console.log('later'), 1000);
button.addEventListener('click', handleClick);   // pass the function, don't call it

// ⚠️ Common mistake
button.addEventListener('click', handleClick()); // calls it NOW and passes its return value

// Returning a function
function multiplier(factor) {
  return (n) => n * factor;
}
const triple = multiplier(3);
triple(5); // 15
```

A function that takes or returns a function is called a **higher-order function** (`map`, `filter`, `setTimeout`, `multiplier`).

---

## 5. Scope: where a variable is visible

```js
const globalVar = 'everywhere';           // global scope

function outer() {
  const outerVar = 'inside outer';        // function scope
  if (true) {
    const blockVar = 'inside the block';  // block scope (let/const)
    var functionVar = 'whole function';   // var ignores blocks
    console.log(globalVar, outerVar, blockVar); // ✅ inner code sees outer variables
  }
  console.log(functionVar);   // ✅ var leaks out of the block
  // console.log(blockVar);   // ❌ ReferenceError
}
// console.log(outerVar);     // ❌ ReferenceError: outer code can't see inner variables
```

**Rule:** inner scopes can see outer variables; outer scopes can't see inner ones. JavaScript looks for a variable in the current scope, then the parent, then the grandparent, up to global (the **scope chain**).

**Shadowing:** an inner variable with the same name hides the outer one:

```js
const name = 'outer';
function show() {
  const name = 'inner';
  console.log(name); // 'inner'
}
```

---

## 6. Hoisting

Before running code, JavaScript registers declarations in each scope.

```js
sayHi();                    // ✅ works: function declarations are fully hoisted
function sayHi() { console.log('hi'); }

console.log(a);             // undefined: var is hoisted but its value isn't
var a = 1;

console.log(b);             // ❌ ReferenceError: let/const are in the
let b = 2;                  //    "temporal dead zone" until this line

greet();                    // ❌ ReferenceError: const is in the TDZ,
const greet = () => {};     //    so the function isn't available yet

hello();                    // ❌ TypeError: hello is not a function
var hello = function () {}; //    (var is hoisted as undefined)
```

Practical rule: **declare things before you use them**.

---

## 7. Closures

A **closure** is a function that **remembers the variables of the place where it was created**, even after that outer function has finished.

```js
function createCounter() {
  let count = 0;                 // private: nothing outside can touch it directly
  return {
    increment: () => ++count,
    getCount: () => count,
  };
}

const counter = createCounter();
counter.increment();   // 1
counter.increment();   // 2
counter.getCount();    // 2
// count is not accessible here, only through the returned functions
```

Uses: private state, function factories (`multiplier` above), event handlers and callbacks that remember values, and in React every hook relies on closures.

### The classic loop bug

```js
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 100);   // 3 3 3: one shared var i
}
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 100);   // 0 1 2: a new i for each iteration
}
```

---

## 8. `this` (the basics)

`this` refers to the object **calling** the function. It's decided **when the function is called**, not when it's written (except for arrow functions).

```js
const user = {
  name: 'Anoop',
  greet() {
    return `Hi, I'm ${this.name}`;   // this = user (called as user.greet())
  },
};
user.greet();             // "Hi, I'm Anoop"

const fn = user.greet;
fn();                     // ⚠️ this is undefined (strict mode) or window → broken

// Arrow functions don't have their own this; they use the surrounding one
const team = {
  name: 'FE',
  members: ['A', 'B'],
  list() {
    return this.members.map((m) => `${m} in ${this.name}`);   // ✅ arrow keeps this = team
  },
};
```

| How it's called | `this` is |
| --- | --- |
| `obj.method()` | `obj` |
| `fn()` (plain call) | `undefined` in strict mode / modules, `window` otherwise |
| `new Fn()` | the new object |
| `fn.call(x, a, b)` / `fn.apply(x, [a, b])` | `x` |
| `fn.bind(x)` | returns a new function with `this` fixed to `x` |
| Arrow function | `this` of the surrounding code |
| DOM event listener (regular function) | the element |

---

## 9. Other things to know

### IIFE (Immediately Invoked Function Expression)

```js
(function () {
  const secret = 1;     // private scope, runs once
})();
```

Mostly replaced by modules and block scope today, but you'll see it in older code.

### Recursion: a function calling itself

```js
function factorial(n) {
  if (n <= 1) return 1;        // base case: stops the recursion
  return n * factorial(n - 1);
}
factorial(5); // 120
```

Without a base case you get `RangeError: Maximum call stack size exceeded`.

### Pure functions

A **pure function** returns the same output for the same input and changes nothing outside itself (no side effects). They're easy to test and are required for React components and reducers.

```js
const add = (a, b) => a + b;                 // pure
let total = 0;
const addToTotal = (n) => { total += n; };   // impure: changes outside state
```

---

## 10. Exercises

1. Write `max(a, b)` three ways: declaration, expression and arrow.
2. Write `average(...nums)` using rest parameters. What should it return for no arguments?
3. Write `createBankAccount(initial)` returning `deposit`, `withdraw` and `getBalance`, using a closure so the balance is private.
4. Explain why `const f = obj.method; f();` loses `this`, and fix it two ways (`bind` and an arrow wrapper).
