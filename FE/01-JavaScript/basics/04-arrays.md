# 04 · Arrays

An **array** is an ordered list of values. Each value has a numbered position called an **index**, starting at **0**.

## 1. Creating and reading

```js
const fruits = ['apple', 'banana', 'cherry'];
const mixed = [1, 'two', true, null, { a: 1 }, [5, 6]];  // any types, even nested arrays
const empty = [];

fruits[0];                  // 'apple'
fruits[2];                  // 'cherry'
fruits[10];                 // undefined (no error)
fruits.length;              // 3
fruits[fruits.length - 1];  // 'cherry' (last item)
fruits.at(-1);              // 'cherry' (modern: negative index counts from the end)

fruits[1] = 'blueberry';    // change an item

Array.isArray(fruits);      // true  (typeof gives 'object', so use this)
```

Other ways to create arrays:

```js
Array.from({ length: 3 }, (_, i) => i * 2);  // [0, 2, 4]
Array.from('abc');                           // ['a', 'b', 'c']
Array(3).fill(0);                            // [0, 0, 0]
Array.of(7);                                 // [7]   (Array(7) would be 7 empty slots!)
```

---

## 2. Mutating vs non-mutating methods (important)

Some methods **change the original array** (mutate). Others **return a new array** and leave the original alone. In React you must not mutate state, so this matters a lot.

| Mutates the original ⚠️ | Returns something new ✅ |
| --- | --- |
| `push`, `pop`, `shift`, `unshift` | `concat`, `slice`, spread `[...arr]` |
| `splice` | `toSpliced` (ES2023) |
| `sort` | `toSorted` (ES2023) |
| `reverse` | `toReversed` (ES2023) |
| `fill`, `copyWithin` | `with(index, value)` (ES2023) |
| | `map`, `filter`, `reduce`, `flat`, `flatMap` |

---

## 3. Adding and removing items

```js
const nums = [1, 2, 3];

nums.push(4);        // add to end     → nums = [1, 2, 3, 4], returns new length 4
nums.pop();          // remove last    → returns 4,  nums = [1, 2, 3]
nums.unshift(0);     // add to start   → nums = [0, 1, 2, 3], returns 4
nums.shift();        // remove first   → returns 0,  nums = [1, 2, 3]
```

### `splice(start, deleteCount, ...itemsToInsert)`: remove/insert anywhere (mutates)

```js
const letters = ['a', 'b', 'c', 'd'];
letters.splice(1, 2);           // removes 'b','c' → returns ['b','c'], letters = ['a','d']
letters.splice(1, 0, 'x', 'y'); // inserts at 1   → letters = ['a','x','y','d']
letters.splice(-1, 1);          // removes the last item
```

### Immutable versions (use these for React state)

```js
const list = [1, 2, 3];

const added    = [...list, 4];                   // add to end
const prepend  = [0, ...list];                   // add to start
const removed  = list.filter((n) => n !== 2);    // remove by value/condition
const without1 = list.toSpliced(1, 1);           // remove by index (ES2023)
const replaced = list.map((n) => (n === 2 ? 20 : n)); // replace one item
const changed  = list.with(0, 100);              // replace by index (ES2023)
const inserted = [...list.slice(0, 1), 1.5, ...list.slice(1)]; // insert at index 1
```

---

## 4. Looping and transforming

### `forEach`: do something for each item (returns nothing)

```js
['a', 'b'].forEach((item, index, array) => {
  console.log(index, item);
});
```

Every callback receives `(item, index, array)`. You usually only need the first one or two.

### `map`: transform every item → new array of the same length

```js
const prices = [100, 200, 300];
const withTax = prices.map((p) => p * 1.18);          // [118, 236, 354]
const users = [{ name: 'A' }, { name: 'B' }];
const names = users.map((u) => u.name);               // ['A', 'B']
```

⚠️ Forgetting `return` in a braced callback gives `[undefined, undefined, …]`:

```js
prices.map((p) => { p * 2 });          // [undefined, undefined, undefined]
prices.map((p) => { return p * 2; });  // ✅
prices.map((p) => p * 2);              // ✅
```

### `filter`: keep items that pass a test → new, possibly shorter array

```js
const nums = [1, 2, 3, 4, 5, 6];
nums.filter((n) => n % 2 === 0);              // [2, 4, 6]
users.filter((u) => u.isActive);
['a', '', null, 'b'].filter(Boolean);         // ['a', 'b']  removes falsy values
```

### `reduce`: combine all items into one value

```js
const nums = [1, 2, 3, 4];
const total = nums.reduce((accumulator, current) => accumulator + current, 0); // 10
//                         ^ running result   ^ this item          initial value ^

// Group by a property
const people = [{ name: 'A', city: 'Kochi' }, { name: 'B', city: 'Pune' }, { name: 'C', city: 'Kochi' }];
const byCity = people.reduce((groups, person) => {
  (groups[person.city] ??= []).push(person);
  return groups;                                   // ⚠️ always return the accumulator
}, {});
// { Kochi: [A, C], Pune: [B] }

// Modern alternative for grouping:
Object.groupBy(people, (p) => p.city);
```

⚠️ **Always pass an initial value.** Without it, `reduce` uses the first item, and on an **empty array it throws** `TypeError: Reduce of empty array with no initial value`.

### Chaining

```js
const totalActiveSpend = orders
  .filter((o) => o.status === 'paid')
  .map((o) => o.amount)
  .reduce((sum, a) => sum + a, 0);
```

---

## 5. Searching

```js
const users = [
  { id: 1, name: 'Anoop', age: 25 },
  { id: 2, name: 'Bina', age: 17 },
];

users.find((u) => u.id === 2);        // { id: 2, ... }  first match, or undefined
users.findIndex((u) => u.id === 2);   // 1, or -1 if not found
users.findLast((u) => u.age > 18);    // searches from the end
users.some((u) => u.age < 18);        // true   at least one matches
users.every((u) => u.age >= 18);      // false  all must match
[].every((x) => false);               // true   ⚠️ empty array → every is true

const nums = [10, 20, 30, NaN];
nums.includes(20);    // true
nums.indexOf(20);     // 1  (-1 if missing)
nums.includes(NaN);   // true
nums.indexOf(NaN);    // -1  ⚠️ indexOf uses ===, which fails for NaN
```

`includes`/`indexOf` compare with `===`, so they **don't find objects by content**: use `find`/`some` with a condition.

---

## 6. Sorting (watch out)

`sort()` **mutates** the array and by default sorts as **strings**:

```js
[10, 1, 5, 100].sort();                // [1, 10, 100, 5]  ⚠️ string order!
[10, 1, 5, 100].sort((a, b) => a - b); // [1, 5, 10, 100]  ascending
[10, 1, 5, 100].sort((a, b) => b - a); // [100, 10, 5, 1]  descending

// Strings, correctly for any language and case
names.sort((a, b) => a.localeCompare(b));

// Objects by property
users.sort((a, b) => a.age - b.age);

// Without mutating
const sorted = users.toSorted((a, b) => a.age - b.age);   // or [...users].sort(...)
```

The compare function returns: **negative** → `a` first, **positive** → `b` first, **0** → keep order.

---

## 7. Other useful methods

```js
[1, 2, 3, 4, 5].slice(1, 3);      // [2, 3]   (start, end) end NOT included; doesn't mutate
[1, 2, 3].slice(-2);              // [2, 3]
[1, 2, 3].slice();                // shallow copy

['a', 'b', 'c'].join('-');        // 'a-b-c'
['a', 'b'].join();                // 'a,b'   default separator is a comma
'a-b-c'.split('-');               // ['a', 'b', 'c']   (string → array)

[1, [2, [3, [4]]]].flat();        // [1, 2, [3, [4]]]  one level by default
[1, [2, [3, [4]]]].flat(Infinity);// [1, 2, 3, 4]
['a b', 'c'].flatMap((s) => s.split(' ')); // ['a', 'b', 'c']

[1, 2].concat([3], 4);            // [1, 2, 3, 4]
[...new Set([1, 1, 2, 3, 3])];    // [1, 2, 3]  remove duplicates
```

---

## 8. Spread and destructuring

### Spread `...` expands an array into separate values

```js
const a = [1, 2];
const b = [3, 4];
const all = [...a, ...b];        // [1, 2, 3, 4]
const copy = [...a];             // shallow copy
Math.max(...[5, 9, 2]);          // 9
```

### Destructuring: unpack values into variables

```js
const [first, second] = ['red', 'green', 'blue'];   // first='red', second='green'
const [, , third] = ['red', 'green', 'blue'];       // skip items → third='blue'
const [head, ...rest] = [1, 2, 3, 4];               // head=1, rest=[2, 3, 4]
const [x = 10, y = 20] = [1];                       // defaults → x=1, y=20

// Swap two variables
let p = 1, q = 2;
[p, q] = [q, p];

// React's useState uses array destructuring
const [count, setCount] = useState(0);
```

---

## 9. Shallow copy vs deep copy

```js
const original = [{ n: 1 }, { n: 2 }];
const shallow = [...original];
shallow[0].n = 99;
console.log(original[0].n);   // 99 ⚠️ the objects inside are shared

const deep = structuredClone(original);   // real deep copy
deep[0].n = 1;
console.log(original[0].n);   // still 99
```

Spread, `slice`, `concat` and `Array.from` all make **shallow** copies: only the outer array is new.

---

## 10. Exercises

Given `const products = [{ name: 'Pen', price: 10, inStock: true }, { name: 'Book', price: 250, inStock: false }, { name: 'Bag', price: 900, inStock: true }]`:

1. Get the names of products in stock.
2. Get the total price of all products with `reduce`.
3. Find the first product over 100.
4. Sort by price, descending, **without** changing `products`.
5. Check whether any product costs less than 20.
6. Add a new product immutably, and remove 'Book' immutably.
