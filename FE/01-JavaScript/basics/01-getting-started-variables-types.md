# 01 · Getting started, variables and data types

## 1. What is JavaScript?

JavaScript (JS) is the programming language of the web. Browsers run it to make pages interactive, and **Node.js** runs it outside the browser (servers, build tools, scripts). HTML is the structure of a page, CSS is the look, and JavaScript is the behaviour.

## 2. Running JavaScript

**Option 1: the browser console.** Open any page, press `F12` (or `Ctrl+Shift+J`), go to **Console**, type code and press Enter.

**Option 2: an HTML file.**

```html
<!DOCTYPE html>
<html>
  <body>
    <h1 id="title">Hello</h1>
    <script src="app.js"></script>   <!-- put scripts at the end of body, or use defer -->
  </body>
</html>
```

```js
// app.js
console.log('Hello from JavaScript');
```

**Option 3: Node.js.** Install Node from nodejs.org, then run `node app.js` in a terminal.

### Printing output

```js
console.log('Hello');            // normal output
console.log('Sum:', 2 + 3);      // several values, separated by commas
console.error('Something broke');// red error output
console.table([{ a: 1 }, { a: 2 }]); // shows arrays/objects as a table
```

### Comments

```js
// single-line comment

/*
  multi-line
  comment
*/
```

### Statements and semicolons

Each instruction is a **statement**. End statements with `;`. JavaScript can insert missing semicolons automatically, but that sometimes goes wrong, so most teams either always write them or use a formatter (Prettier) that handles it.

---

## 3. Variables

A **variable** is a named box that holds a value.

```js
let age = 25;         // can be reassigned later
age = 26;             // ✅

const name = 'Anoop'; // cannot be reassigned
// name = 'Bob';      // ❌ TypeError: Assignment to constant variable

var old = 'avoid';    // old way: don't use in new code
```

| | `const` | `let` | `var` |
| --- | --- | --- | --- |
| Reassign | ❌ | ✅ | ✅ |
| Scope | block `{ }` | block `{ }` | function |
| Use before declaring | ❌ error (TDZ) | ❌ error (TDZ) | `undefined` (hoisted) |
| Use it? | **Default choice** | When the value must change | Never in new code |

**Rule:** use `const` by default; switch to `let` only if you need to reassign.

⚠️ `const` means the **variable** can't be reassigned, not that the value can't change:

```js
const user = { name: 'Anoop' };
user.name = 'Bob';      // ✅ allowed: changing the object's content
// user = {};           // ❌ not allowed: pointing the variable at a new object

const list = [1, 2];
list.push(3);           // ✅ [1, 2, 3]
```

### Naming rules

- Letters, digits, `_` and `$`; cannot start with a digit.
- Case-sensitive: `age` and `Age` are different.
- Use **camelCase**: `firstName`, `totalPrice`, `isLoggedIn`.
- Constants that never change across the app are often written `UPPER_SNAKE_CASE`: `MAX_RETRIES`.
- Booleans read well with `is`, `has`, `can`: `isOpen`, `hasError`.
- Reserved words can't be names: `let`, `class`, `return`, `if`, `function`…

---

## 4. Data types

JavaScript has **8 types**: 7 **primitive** types and **object**.

| Type | Example | Notes |
| --- | --- | --- |
| `string` | `'hi'`, `"hi"`, `` `hi` `` | Text |
| `number` | `42`, `3.14`, `-1`, `NaN`, `Infinity` | One type for integers and decimals |
| `bigint` | `123n` | Very large integers |
| `boolean` | `true`, `false` | Yes/no |
| `undefined` | `undefined` | "No value assigned yet" |
| `null` | `null` | "Intentionally empty" |
| `symbol` | `Symbol('id')` | Unique identifier (advanced) |
| `object` | `{ a: 1 }`, `[1, 2]`, functions, dates | Everything that isn't primitive |

### Primitives vs objects (very important)

**Primitives are copied by value. Objects are copied by reference.**

```js
let a = 10;
let b = a;   // copies the value 10
b = 20;
console.log(a); // 10  (a is unchanged)

const obj1 = { count: 1 };
const obj2 = obj1;  // copies the REFERENCE: both point to the same object
obj2.count = 99;
console.log(obj1.count); // 99  (same object!)

console.log({ a: 1 } === { a: 1 }); // false: two different objects
console.log(obj1 === obj2);         // true: same object
```

This explains many bugs, and it's why React needs you to create **new** objects/arrays when updating state.

### `typeof`

```js
typeof 'hi'          // 'string'
typeof 42            // 'number'
typeof true          // 'boolean'
typeof undefined     // 'undefined'
typeof 10n           // 'bigint'
typeof Symbol()      // 'symbol'
typeof {}            // 'object'
typeof []            // 'object'   ⚠️ use Array.isArray([]) instead
typeof null          // 'object'   ⚠️ famous historical bug
typeof function(){}  // 'function'
typeof NaN           // 'number'   ⚠️ "Not a Number" is a number
```

### `undefined` vs `null`

```js
let x;             // declared, no value
console.log(x);    // undefined: JS sets this automatically

let user = null;   // YOU set this: "no user on purpose"

null == undefined  // true  (loose equality)
null === undefined // false (different types)
```

---

## 5. Type conversion

JavaScript converts types automatically (**coercion**), which can surprise you. Prefer converting **explicitly**.

### To a string

```js
String(123)       // '123'
(123).toString()  // '123'
`${123}`          // '123'
String(null)      // 'null'
```

### To a number

```js
Number('42')      // 42
Number('42px')    // NaN  (whole string must be numeric)
Number('')        // 0    ⚠️
Number(' 12 ')    // 12   (spaces trimmed)
Number(true)      // 1
Number(null)      // 0    ⚠️
Number(undefined) // NaN
parseInt('42px')  // 42   (reads digits until it can't)
parseInt('px42')  // NaN
parseFloat('3.5kg') // 3.5
+'7'              // 7    (unary plus: short form of Number())
```

### To a boolean: truthy and falsy

There are exactly **8 falsy values**. Everything else is truthy.

```js
// FALSY
false, 0, -0, 0n, '', null, undefined, NaN

// TRUTHY (surprises!)
'0', 'false', ' ', [], {}, function(){}, -1, Infinity

Boolean('')   // false
Boolean('0')  // true
!!'hello'     // true  (double NOT = convert to boolean)
```

### Automatic coercion surprises

```js
'5' + 2     // '52'   + with a string → string concatenation
'5' - 2     // 3      - * / convert to numbers
'5' * '2'   // 10
true + 1    // 2
[] + []     // ''
[] + {}     // '[object Object]'
'b' + 'a' + +'a' + 'a' // 'baNaNa'
```

**Lesson:** use `===`, and convert with `Number()`/`String()` yourself.

---

## 6. Exercises

1. Declare a `const` for your name and a `let` for your age. Increase the age by 1 and print both.
2. Predict, then check: `typeof null`, `typeof []`, `Number('')`, `'3' + 4`, `'3' - 4`, `Boolean('false')`.
3. Create an object, copy it into another variable, change the copy, and explain why the original changed.
4. List the 8 falsy values from memory.
