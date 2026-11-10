# 02 · Operators and control flow

## 1. Arithmetic operators

```js
10 + 3   // 13
10 - 3   // 7
10 * 3   // 30
10 / 3   // 3.3333333333333335
10 % 3   // 1   remainder (modulo): useful for "is even?" → n % 2 === 0
2 ** 3   // 8   power
-7 % 3   // -1  ⚠️ sign follows the left side

let n = 5;
n++;     // n = 6 (increment)
n--;     // n = 5 (decrement)
n += 10; // n = n + 10 → 15
n -= 5;  // 10
n *= 2;  // 20
n /= 4;  // 5
```

`x++` vs `++x`: both add 1. `x++` **returns the old value**, `++x` returns the new one:

```js
let a = 1;
console.log(a++); // 1 (then a becomes 2)
console.log(++a); // 3
```

Division by zero doesn't throw: `1 / 0` is `Infinity`, `0 / 0` is `NaN`.

---

## 2. Comparison operators

```js
5 > 3     // true
5 >= 5    // true
5 < 3     // false
5 !== 3   // true
```

### `===` vs `==` (always use `===`)

`===` (**strict**) compares value **and** type. `==` (**loose**) converts types first, with confusing rules.

```js
5 === 5       // true
5 === '5'     // false   different types
5 == '5'      // true    ⚠️ string converted to number
0 == ''       // true    ⚠️
0 == false    // true    ⚠️
null == undefined // true (the only useful case of ==)
NaN === NaN   // false   ⚠️ NaN is not equal to anything, even itself
Number.isNaN(NaN) // true  ← use this to check for NaN
```

Comparing strings is alphabetical by character code: `'apple' < 'banana'` is true, but `'Z' < 'a'` is also true (uppercase codes are smaller) and `'10' < '9'` is true (character by character). Convert to numbers before comparing numbers.

---

## 3. Logical operators

```js
true && false  // false   AND: both must be true
true || false  // true    OR: at least one true
!true          // false   NOT
```

### They return values, not just booleans

- `a || b` returns the **first truthy** value (or the last value).
- `a && b` returns the **first falsy** value (or the last value).

```js
'' || 'default'      // 'default'
'Anoop' || 'default' // 'Anoop'
0 || 10              // 10   ⚠️ 0 is falsy, so it's replaced

user && user.name    // user.name if user exists, otherwise user (null/undefined)
isLoggedIn && showDashboard()  // runs showDashboard only if isLoggedIn is truthy
```

### Nullish coalescing `??`

Like `||`, but only replaces `null` and `undefined`, not `0`, `''` or `false`:

```js
0 ?? 10          // 0     ✅ keeps 0
'' ?? 'default'  // ''
null ?? 'default'      // 'default'
undefined ?? 'default' // 'default'

const pageSize = settings.pageSize ?? 20;  // correct even if pageSize is 0
```

### Optional chaining `?.`

Stops and returns `undefined` if the value before `?.` is `null`/`undefined`, instead of throwing an error:

```js
const user = { profile: null };

user.profile.name     // ❌ TypeError: Cannot read properties of null
user.profile?.name    // undefined ✅
user.getName?.()      // calls only if the method exists
user.tags?.[0]        // safe array/dynamic access

const city = user.address?.city ?? 'Unknown';  // common combination
```

### Logical assignment

```js
a ||= 5;   // a = a || 5   (assign if a is falsy)
a &&= 5;   // a = a && 5   (assign if a is truthy)
a ??= 5;   // a = a ?? 5   (assign if a is null/undefined)
```

---

## 4. Conditional statements

### if / else if / else

```js
const score = 72;

if (score >= 90) {
  console.log('A');
} else if (score >= 70) {
  console.log('B');
} else {
  console.log('C or lower');
}
```

### Ternary operator: a short if/else that returns a value

```js
const label = age >= 18 ? 'Adult' : 'Minor';
```

Keep ternaries short. Nested ternaries are hard to read; use if/else instead.

### Guard clauses (return early)

```js
function getDiscount(user) {
  if (!user) return 0;               // handle the edge case first
  if (!user.isMember) return 0;
  return user.years > 5 ? 20 : 10;   // main logic stays flat
}
```

### switch

```js
switch (status) {
  case 'loading':
    show('Loading...');
    break;              // ⚠️ without break, execution "falls through" to the next case
  case 'error':
  case 'failed':        // two cases sharing one block
    show('Error');
    break;
  default:
    show('Done');
}
```

`switch` compares with `===`. A lookup object is often cleaner:

```js
const messages = { loading: 'Loading...', error: 'Error', done: 'Done' };
show(messages[status] ?? 'Unknown');
```

---

## 5. Loops

### for

```js
for (let i = 0; i < 5; i++) {
  console.log(i);   // 0 1 2 3 4
}
```

Three parts: **start** (`let i = 0`), **condition** (`i < 5`, checked before each run), **step** (`i++`, after each run).

### while and do...while

```js
let count = 3;
while (count > 0) {        // checks the condition first
  console.log(count);
  count--;
}

let input;
do {                        // runs at least once, checks afterwards
  input = prompt('Type yes');
} while (input !== 'yes');
```

⚠️ If the condition never becomes false, you get an **infinite loop** and the page freezes.

### for...of: loop over values (arrays, strings, Maps, Sets)

```js
for (const fruit of ['apple', 'banana']) {
  console.log(fruit);
}
for (const char of 'hi') console.log(char); // 'h', 'i'

// with the index:
for (const [index, fruit] of ['apple', 'banana'].entries()) {
  console.log(index, fruit);
}
```

### for...in: loop over object keys

```js
const user = { name: 'Anoop', age: 25 };
for (const key in user) {
  console.log(key, user[key]);   // 'name' 'Anoop', 'age' 25
}
```

⚠️ Don't use `for...in` on arrays (keys are strings, order isn't guaranteed and inherited properties may appear). Use `for...of` or array methods. For objects, `Object.entries(obj)` with `for...of` is often clearer.

### break and continue

```js
for (const n of [1, 2, 3, 4, 5]) {
  if (n === 2) continue;   // skip this one
  if (n === 4) break;      // stop the loop
  console.log(n);          // 1, 3
}
```

`break`/`continue` don't work inside `forEach`. Use `for...of`, or `some`/`every`/`find` if you need to stop early.

---

## 6. Operator precedence (the short version)

From high to low: `()` → `!`, `++`, unary `+`/`-` → `**` → `*` `/` `%` → `+` `-` → `<` `>` `<=` `>=` → `===` `!==` → `&&` → `||` `??` → `? :` → `=`

When unsure, **use parentheses**. Note: you can't mix `??` with `||`/`&&` without parentheses: `a ?? b || c` is a syntax error.

---

## 7. Exercises

1. Write FizzBuzz: print 1–100, but "Fizz" for multiples of 3, "Buzz" for multiples of 5, "FizzBuzz" for both.
2. Predict: `0 || 'a'`, `0 ?? 'a'`, `'' && 'b'`, `null?.x`, `5 == '5'`, `NaN === NaN`.
3. Use a `while` loop to find the first power of 2 greater than 1000.
4. Rewrite a `switch` with 4 cases as a lookup object.
