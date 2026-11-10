# 06 · Strings, numbers, dates, Map and Set

## 1. Strings

```js
const single = 'Hello';
const double = "Hello";
const name = 'Anoop';
const template = `Hello, ${name}! 2 + 2 = ${2 + 2}`;   // template literal: backticks + ${expression}

const multiLine = `Line 1
Line 2`;                                                // backticks allow real line breaks

'It\'s here';     // escape a quote with \
'Tab:\tNew line:\n';
```

**Strings are immutable**: methods never change the original; they return a new string.

```js
let s = 'hello';
s[0] = 'H';          // silently ignored
s = 'H' + s.slice(1); // ✅ create a new string → 'Hello'
```

### Reading characters

```js
const word = 'JavaScript';
word.length;          // 10
word[0];              // 'J'
word.at(-1);          // 't'   (last character)
word.charAt(100);     // ''    (word[100] gives undefined)
```

### Common string methods

```js
const s = '  Hello World  ';

s.trim();                     // 'Hello World'  (also trimStart / trimEnd)
s.toUpperCase();              // '  HELLO WORLD  '
s.toLowerCase();

'Hello World'.includes('World');    // true   (case-sensitive)
'Hello'.startsWith('He');           // true
'Hello'.endsWith('lo');             // true
'Hello'.indexOf('l');               // 2   (first match, -1 if not found)
'Hello'.lastIndexOf('l');           // 3

'Hello World'.slice(0, 5);          // 'Hello'   (start, end) end not included
'Hello World'.slice(-5);            // 'World'
'Hello World'.substring(6);         // 'World'   (like slice, but no negative indexes)

'a,b,c'.split(',');                 // ['a', 'b', 'c']
'hello'.split('');                  // ['h', 'e', 'l', 'l', 'o']
'a b  c'.split(' ');                // ['a', 'b', '', 'c']  ⚠️ empty strings for double spaces
'a b  c'.split(/\s+/);              // ['a', 'b', 'c']

'ha'.repeat(3);                     // 'hahaha'
'5'.padStart(3, '0');               // '005'   (great for times/IDs)
'5'.padEnd(3, '*');                 // '5**'

'a-b-c'.replace('-', '+');          // 'a+b-c'   ⚠️ only the FIRST match
'a-b-c'.replaceAll('-', '+');       // 'a+b+c'
'a-b-c'.replace(/-/g, '+');         // 'a+b+c'   (regex with g flag)
```

### Useful snippets

```js
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const reverse = (s) => [...s].reverse().join('');
const isPalindrome = (s) => { const c = s.toLowerCase().replace(/[^a-z0-9]/g, ''); return c === reverse(c); };
const countWords = (s) => s.trim().split(/\s+/).filter(Boolean).length;

// Case-insensitive search
'Hello'.toLowerCase().includes('hell'.toLowerCase());

// Comparing / sorting text properly
'é'.localeCompare('e');   // sorts accents correctly
```

---

## 2. Numbers

JavaScript has one `number` type for both integers and decimals (64-bit floating point).

### Floating-point precision

```js
0.1 + 0.2;                 // 0.30000000000000004 ⚠️
0.1 + 0.2 === 0.3;         // false
(0.1 + 0.2).toFixed(2);    // '0.30' (a string!)
Math.abs(0.1 + 0.2 - 0.3) < Number.EPSILON;  // true: compare with a tolerance
```

For money, work in whole units (paise/cents) or use a decimal library.

### Special numbers

```js
1 / 0;              // Infinity
-1 / 0;             // -Infinity
0 / 0;              // NaN
Number('abc');      // NaN
NaN === NaN;        // false

Number.isNaN(NaN);       // true   ✅ use this
isNaN('abc');            // true   ⚠️ global isNaN converts first ('abc' → NaN)
Number.isNaN('abc');     // false  (it's a string, not NaN)
Number.isFinite(10);     // true
Number.isInteger(5.0);   // true
Number.MAX_SAFE_INTEGER; // 9007199254740991 (above this, integers lose precision → use BigInt)
```

### Formatting and rounding

```js
const n = 1234.5678;

n.toFixed(2);                // '1234.57'  rounds, returns a STRING
Math.round(n);               // 1235
Math.floor(n);               // 1234 (down)
Math.ceil(n);                // 1235 (up)
Math.trunc(-4.7);            // -4   (remove decimals)
Math.floor(-4.7);            // -5   ⚠️ floor goes down, even for negatives
Math.round(n * 100) / 100;   // 1234.57 (a number)

n.toLocaleString('en-IN');   // '1,234.568'
new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n); // '₹1,234.57'

1_000_000;                   // numeric separator: same as 1000000, easier to read
```

### Math helpers

```js
Math.max(3, 9, 1);          // 9
Math.max(...[3, 9, 1]);     // 9
Math.max();                 // -Infinity ⚠️ (empty)
Math.min(3, 9, 1);          // 1
Math.abs(-5);               // 5
Math.sqrt(16);              // 4
Math.pow(2, 10);            // 1024 (same as 2 ** 10)
Math.random();              // 0 ≤ x < 1

// random integer between min and max (both included)
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
```

---

## 3. Dates

```js
const now = new Date();                       // current date and time
const d1 = new Date('2026-11-10');            // ⚠️ date-only strings are parsed as UTC
const d2 = new Date('2026-11-10T09:30:00');   // date+time without Z → local time
const d3 = new Date(2026, 10, 10);            // ⚠️ months are 0-based: 10 = November
const fromMs = new Date(0);                   // 1 Jan 1970 UTC (the "epoch")

now.getFullYear();   // 2026
now.getMonth();      // 0–11 ⚠️
now.getDate();       // 1–31 (day of the month)
now.getDay();        // 0–6, 0 = Sunday ⚠️ (not getDate!)
now.getHours(); now.getMinutes(); now.getSeconds();
now.getTime();       // milliseconds since epoch
Date.now();          // same, without creating an object

now.toISOString();   // '2026-11-10T04:00:00.000Z' (UTC, good for APIs)
now.toLocaleDateString('en-IN');   // '10/11/2026'
now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); // '10 Nov 2026'

// Date arithmetic: work in milliseconds or use setDate
const tomorrow = new Date(now);
tomorrow.setDate(now.getDate() + 1);          // handles month ends automatically

const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));  // subtracting dates gives ms

new Date('nonsense');               // Invalid Date
isNaN(new Date('nonsense'));        // true: how to check for an invalid date
```

Dates are **mutable** objects (`setDate` changes the original), and time zones cause many bugs. In real apps, a library like **date-fns** or **dayjs** is common. Store and send dates as **ISO strings in UTC**; format them in the user's local time only for display.

---

## 4. Map

A `Map` is a key–value collection like an object, but **any type can be a key** (objects, numbers, functions), it **remembers insertion order**, and it has a `size`.

```js
const map = new Map();
map.set('name', 'Anoop');
map.set(42, 'the answer');
const userObj = { id: 1 };
map.set(userObj, 'metadata');   // object as a key

map.get('name');       // 'Anoop'
map.get(userObj);      // 'metadata'
map.has(42);           // true
map.size;              // 3   (property, not a method)
map.delete(42);
map.clear();

const scores = new Map([['A', 90], ['B', 75]]);   // from an array of pairs
for (const [key, value] of scores) console.log(key, value);
[...scores.keys()];    // ['A', 'B']
Object.fromEntries(scores);   // { A: 90, B: 75 }
new Map(Object.entries({ x: 1 }));
```

**Map vs object:** use a Map for frequent add/remove, non-string keys, or when order and size matter. Use an object for fixed-shape records and JSON. ⚠️ `JSON.stringify(map)` gives `'{}'`.

## 5. Set

A `Set` stores **unique values**: duplicates are ignored.

```js
const tags = new Set(['js', 'react', 'js']);   // Set { 'js', 'react' }
tags.add('ts');
tags.has('react');    // true  (much faster than array.includes for big lists)
tags.delete('js');
tags.size;            // 2

const unique = [...new Set([1, 2, 2, 3])];    // [1, 2, 3]

// Set operations (new built-in methods, ES2025)
const a = new Set([1, 2, 3]), b = new Set([2, 3, 4]);
a.union(b);          // {1, 2, 3, 4}
a.intersection(b);   // {2, 3}
a.difference(b);     // {1}
```

⚠️ Uniqueness uses `===` (with NaN treated as equal), so two objects with the same content are **both** kept.

**WeakMap / WeakSet:** keys must be objects and don't stop garbage collection. Used to attach private data to objects without memory leaks (advanced).

---

## 6. Exercises

1. Write `formatDuration(seconds)` → `'02:05'` for 125 using `padStart`.
2. Write `slugify('Hello World  Again!')` → `'hello-world-again'`.
3. Write `daysUntil(dateString)` returning the number of days from today.
4. Count how many times each word appears in a sentence using a `Map`.
5. Given two arrays of user IDs, find IDs in both using a `Set`.
