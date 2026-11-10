# JavaScript cheat sheet

Every common built-in: **what it takes, what it returns, whether it changes the original, and the edge cases people forget.**

Legend: ⚠️ = gotcha · 🔁 = mutates the original · ✅ = returns something new · `[x]` = optional argument

---

## Arrays

### Add / remove

| Method | Arguments | Returns | Mutates | Edge cases / remember |
| --- | --- | --- | --- | --- |
| `push(...items)` | 1+ items | **new length** | 🔁 | ⚠️ returns a number, not the array |
| `pop()` | none | removed last item | 🔁 | `undefined` on empty array |
| `unshift(...items)` | 1+ items | new length | 🔁 | Slow on huge arrays (re-indexes everything) |
| `shift()` | none | removed first item | 🔁 | `undefined` on empty array |
| `splice(start, [deleteCount], ...items)` | start index (negative = from end), how many to remove, items to insert | **array of removed items** | 🔁 | Omit `deleteCount` → removes everything from `start`. Don't confuse with `slice` |
| `toSpliced(start, [count], ...items)` | same as splice | new array | ✅ | ES2023 |
| `slice([start], [end])` | start, end (**end excluded**), negatives allowed | new array (shallow copy) | ✅ | `slice()` = copy. `slice(-2)` = last two |
| `concat(...arraysOrValues)` | arrays and/or values | new array | ✅ | Flattens array arguments one level only |
| `with(index, value)` | index (negative ok), value | new array | ✅ | ES2023. `RangeError` if index out of range |
| `fill(value, [start], [end])` | value, range | the same array | 🔁 | ⚠️ `Array(3).fill({})` puts the **same object** in every slot |

### Iterate / transform

All callbacks receive `(element, index, array)`.

| Method | Callback returns | Method returns | Edge cases / remember |
| --- | --- | --- | --- |
| `forEach(cb, [thisArg])` | ignored | `undefined` | ⚠️ Can't `break`/`return` out. ⚠️ Doesn't wait for `async` callbacks. Not chainable |
| `map(cb)` | new value | new array, **same length** | ⚠️ Braced arrow without `return` → `undefined`s. Don't use just for side effects |
| `filter(cb)` | truthy = keep | new array (can be empty) | `filter(Boolean)` removes falsy values (including `0` ⚠️) |
| `reduce(cb(acc, el, i, arr), [initial])` | next accumulator | final accumulator | ⚠️ **Always pass `initial`**: empty array without it → `TypeError`. ⚠️ Must `return acc` |
| `reduceRight(cb, [initial])` | same | same | Goes right to left |
| `flat([depth = 1])` | — | new array | `flat(Infinity)` flattens fully; removes empty slots |
| `flatMap(cb)` | value or array | new array flattened 1 level | Return `[]` to drop an item |

### Search / test

| Method | Arguments | Returns | Edge cases / remember |
| --- | --- | --- | --- |
| `find(cb)` | predicate | first matching **element** or `undefined` | ⚠️ Can't tell "not found" from a found `undefined` element |
| `findIndex(cb)` | predicate | index or **-1** | ⚠️ `if (findIndex(...))` is wrong: index 0 is falsy, -1 is truthy |
| `findLast(cb)` / `findLastIndex(cb)` | predicate | from the end | ES2023 |
| `includes(value, [fromIndex])` | value | boolean | Uses SameValueZero: finds `NaN`. ⚠️ Objects compared by reference |
| `indexOf(value, [from])` | value | index or -1 | ⚠️ Can't find `NaN` (uses `===`) |
| `lastIndexOf(value)` | value | index or -1 | |
| `some(cb)` | predicate | `true` if **any** passes | Stops at first `true`. Empty array → `false` |
| `every(cb)` | predicate | `true` if **all** pass | Stops at first `false`. ⚠️ Empty array → **`true`** |
| `at(index)` | index (negative ok) | element or `undefined` | `at(-1)` = last element |

### Order / convert

| Method | Arguments | Returns | Mutates | Edge cases / remember |
| --- | --- | --- | --- | --- |
| `sort([compare(a, b)])` | compare fn: negative → a first, positive → b first | the same array | 🔁 | ⚠️ **Default sorts as strings**: `[10, 9, 1].sort()` → `[1, 10, 9]`. Numbers: `(a, b) => a - b`. Text: `a.localeCompare(b)`. `undefined` goes last. Stable since ES2019 |
| `toSorted([compare])` | same | new array | ✅ | ES2023 |
| `reverse()` | none | the same array | 🔁 | |
| `toReversed()` | none | new array | ✅ | ES2023 |
| `join([separator = ','])` | separator | string | ✅ | `null`/`undefined` become `''`. `[].join()` → `''` |
| `keys()` / `values()` / `entries()` | none | iterator | ✅ | `for (const [i, v] of arr.entries())` |

### Static / creation

| Function | Arguments | Returns | Edge cases / remember |
| --- | --- | --- | --- |
| `Array.isArray(x)` | anything | boolean | ✅ Use instead of `typeof` (which says `'object'`) |
| `Array.from(iterable, [mapFn])` | iterable or `{ length }`, map | new array | `Array.from({ length: 5 }, (_, i) => i)` → `[0..4]`. Converts NodeList, Set, string |
| `Array.of(...items)` | items | new array | `Array.of(3)` → `[3]`, but `Array(3)` → 3 **empty slots** ⚠️ |
| `new Array(n)` | length | sparse array | ⚠️ Empty slots are **skipped by `map`/`forEach`**: use `Array.from` or `.fill()` first |
| `[...new Set(arr)]` | — | unique values | Objects are unique by reference |
| `Object.groupBy(arr, fn)` | array, key fn | object of arrays | ES2024. `Map.groupBy` for non-string keys |

---

## Strings

Strings are **immutable**: every method returns a new string.

| Method | Arguments | Returns | Edge cases / remember |
| --- | --- | --- | --- |
| `length` | (property) | number | Emoji can count as 2: `'😀'.length === 2`. Use `[...str].length` for characters |
| `at(i)` / `charAt(i)` / `str[i]` | index | character | Out of range: `at`/`[i]` → `undefined`, `charAt` → `''` |
| `includes(sub, [pos])` | substring | boolean | ⚠️ Case-sensitive. `''.includes('')` → true |
| `startsWith(sub, [pos])` / `endsWith(sub, [len])` | substring | boolean | Case-sensitive |
| `indexOf(sub, [from])` / `lastIndexOf` | substring | index or -1 | |
| `slice(start, [end])` | indexes, **negatives ok** | substring | End excluded |
| `substring(start, [end])` | indexes | substring | Negatives → 0; swaps args if start > end. Prefer `slice` |
| `split([separator], [limit])` | string or regex | array | `split('')` → characters. `split()` → `[whole]`. `''.split(',')` → `['']` ⚠️ |
| `trim()` / `trimStart()` / `trimEnd()` | none | string | Removes spaces, tabs, newlines |
| `toUpperCase()` / `toLowerCase()` | none | string | `toLocaleUpperCase('tr')` for language-specific rules |
| `replace(pattern, replacement)` | string/regex, string/function | string | ⚠️ A **string pattern replaces only the first** match. `$&`, `$1` work in replacement strings |
| `replaceAll(pattern, replacement)` | string or **global** regex | string | Regex without `g` → `TypeError` |
| `padStart(len, [fill = ' '])` / `padEnd` | target length, fill | string | `'7'.padStart(2, '0')` → `'07'`. No change if already long enough |
| `repeat(n)` | count | string | Negative → `RangeError` |
| `localeCompare(other, [locale], [options])` | string | -1 / 0 / 1 | Use for sorting. `{ sensitivity: 'base' }` ignores case/accents |
| `match(regex)` | regex | array or **`null`** | ⚠️ Check for `null`. With `g`, returns all matches without groups |
| `matchAll(globalRegex)` | regex with `g` | iterator of matches | Gives groups for every match |
| `search(regex)` | regex | index or -1 | |
| `normalize('NFC')` | form | string | Makes `'é'` (one code point) equal `'é'` (e + accent) |
| `String(x)` / `x.toString()` | value | string | `String(null)` → `'null'`; `null.toString()` throws |

Template literals: `` `Hi ${name}` ``, multi-line allowed, any expression inside `${}`.

---

## Objects

| Function | Arguments | Returns | Edge cases / remember |
| --- | --- | --- | --- |
| `Object.keys(obj)` | object | array of **own enumerable string** keys | Integer-like keys come first, sorted. Skips Symbols |
| `Object.values(obj)` | object | array of values | Same order as keys |
| `Object.entries(obj)` | object | `[key, value][]` | Pair with `for...of` and destructuring |
| `Object.fromEntries(iterable)` | entries / Map | object | Reverse of `entries` |
| `Object.assign(target, ...sources)` | objects | **target** (mutated 🔁) | Shallow. `Object.assign({}, a, b)` to avoid mutation |
| `{ ...a, ...b }` | — | new object | ✅ Shallow. Later keys win. Spreading `null`/`undefined` is fine (ignored) |
| `structuredClone(value)` | value | deep copy | Handles Date, Map, Set, cycles. ⚠️ Throws on functions/DOM nodes; drops class prototypes |
| `Object.freeze(obj)` | object | same object | ⚠️ Shallow. Silently ignores writes outside strict mode |
| `Object.isFrozen(obj)` | object | boolean | |
| `Object.hasOwn(obj, key)` | object, key | boolean | Modern replacement for `obj.hasOwnProperty(key)` |
| `key in obj` | — | boolean | ⚠️ Also true for inherited keys (e.g. `'toString' in {}`) |
| `Object.create(proto)` | prototype or `null` | new object | `Object.create(null)` = no inherited keys (safe dictionary) |
| `Object.getPrototypeOf(obj)` | object | prototype | |
| `Object.defineProperty(obj, key, descriptor)` | | obj | Defaults are `writable/enumerable/configurable: false` ⚠️ |
| `Object.is(a, b)` | two values | boolean | Like `===` but `Object.is(NaN, NaN)` → true and `Object.is(0, -0)` → false. React uses it to compare state |
| `delete obj.key` | — | boolean | Prefer making a new object without the key: `const { key, ...rest } = obj` |

---

## JSON

| Function | Arguments | Returns | Edge cases / remember |
| --- | --- | --- | --- |
| `JSON.stringify(value, [replacer], [space])` | value, array of keys or function, indent (number/string) | string (or `undefined`) | Drops `undefined`, functions and Symbols in objects; they become `null` in arrays. `NaN`/`Infinity` → `null`. `Date` → ISO string. `Map`/`Set` → `{}`. Circular → `TypeError`. Uses `toJSON()` if present. `JSON.stringify(undefined)` → `undefined` |
| `JSON.parse(text, [reviver])` | string, fn | value | ⚠️ Throws `SyntaxError` on bad input: wrap in try/catch. Keys need double quotes; no trailing commas. `JSON.parse(null)` → `null` |

---

## Numbers and Math

| Function | Arguments | Returns | Edge cases / remember |
| --- | --- | --- | --- |
| `Number(x)` | value | number or `NaN` | `Number('')` → 0 ⚠️, `Number(null)` → 0 ⚠️, `Number(undefined)` → NaN, `Number('12px')` → NaN, `Number([])` → 0 |
| `parseInt(str, [radix])` | string, base | integer or NaN | **Always pass radix 10**. Stops at first non-digit: `parseInt('12px', 10)` → 12. ⚠️ `parseInt(0.0000005)` → 5 (goes through '5e-7') |
| `parseFloat(str)` | string | number or NaN | `parseFloat('3.5kg')` → 3.5 |
| `+x` | value | number | Shorthand for `Number(x)` |
| `Number.isNaN(x)` | value | boolean | ✅ Only true for actual NaN. Global `isNaN('abc')` → true ⚠️ |
| `Number.isInteger(x)` / `Number.isSafeInteger(x)` | value | boolean | `isInteger(5.0)` → true |
| `Number.isFinite(x)` | value | boolean | No coercion (global `isFinite('5')` → true) |
| `num.toFixed(digits)` | 0–100 | **string** | ⚠️ Returns a string. ⚠️ `(1.005).toFixed(2)` → `'1.00'` (float precision) |
| `num.toString([radix])` | base | string | `(255).toString(16)` → `'ff'`. `5.toString()` is a syntax error: use `(5).toString()` |
| `num.toLocaleString(locale, options)` | | string | `{ style: 'currency', currency: 'INR' }`, `{ maximumFractionDigits: 2 }` |
| `Intl.NumberFormat(locale, options).format(n)` | | string | Reuse the formatter in loops (faster) |
| `Math.round(x)` | number | integer | ⚠️ `Math.round(-2.5)` → -2 (rounds .5 up toward +∞) |
| `Math.floor(x)` / `Math.ceil(x)` / `Math.trunc(x)` | number | integer | floor(-4.5) → -5, trunc(-4.5) → -4 |
| `Math.max(...nums)` / `Math.min(...nums)` | numbers | number | ⚠️ No args → `-Infinity` / `Infinity`. Any NaN → NaN. Spreading huge arrays can overflow the stack: use `reduce` |
| `Math.random()` | none | 0 ≤ x < 1 | Not cryptographically secure → `crypto.getRandomValues` / `crypto.randomUUID()` |
| `Math.abs`, `Math.sqrt`, `Math.pow(b, e)`, `Math.sign`, `Math.hypot` | | number | `**` operator = `Math.pow` |

Remember: `0.1 + 0.2 !== 0.3`; `Number.MAX_SAFE_INTEGER` is 2⁵³−1 (use `BigInt` beyond, written `123n`; can't mix BigInt and Number in arithmetic).

---

## Dates

| Function | Returns | Edge cases / remember |
| --- | --- | --- |
| `new Date()` | now | |
| `new Date('2026-11-10')` | date | ⚠️ Date-only ISO string = **UTC midnight** (can show as the previous day in some time zones) |
| `new Date('2026-11-10T10:00')` | date | Date + time without `Z` = **local** time |
| `new Date(y, monthIndex, d, h, m, s)` | date | ⚠️ **Month is 0-based** (0 = Jan). Overflow rolls over: `new Date(2026, 0, 32)` → 1 Feb |
| `new Date(ms)` | date | Milliseconds since 1970-01-01 UTC |
| `Date.now()` | number (ms) | Timestamps, measuring time |
| `getFullYear()` / `getMonth()` / `getDate()` / `getDay()` | numbers | ⚠️ `getMonth` 0–11, `getDay` = weekday 0 (Sun)–6. `getYear()` is deprecated |
| `getHours()`… / `getUTCHours()`… | numbers | Local vs UTC versions |
| `setDate(n)`, `setMonth(n)`… | timestamp | 🔁 **Mutates** the date. Copy first: `new Date(d)` |
| `toISOString()` | `'2026-11-10T04:30:00.000Z'` | Always UTC. Throws on Invalid Date |
| `toLocaleDateString(locale, options)` / `toLocaleTimeString` / `toLocaleString` | string | `{ dateStyle: 'medium' }`, `{ weekday: 'long' }` |
| `d2 - d1` | ms difference | Dates convert to numbers when subtracted |
| `isNaN(date)` | boolean | How to detect `Invalid Date` |
| `Intl.DateTimeFormat(locale, options).format(d)` | string | Reusable formatter |
| `Intl.RelativeTimeFormat('en').format(-1, 'day')` | `'1 day ago'` | |

---

## Map and Set

| Map | Returns | Set | Returns |
| --- | --- | --- | --- |
| `new Map([[k, v], ...])` | Map | `new Set(iterable)` | Set |
| `map.set(k, v)` | **the map** (chainable) | `set.add(v)` | the set (chainable) |
| `map.get(k)` | value or `undefined` | `set.has(v)` | boolean |
| `map.has(k)` | boolean | `set.delete(v)` | boolean |
| `map.delete(k)` | boolean | `set.size` | number (property) |
| `map.size` | number (property) | `set.forEach(cb)` | |
| `map.clear()` | undefined | `set.union/intersection/difference(other)` | new Set (ES2025) |
| `map.keys()` / `values()` / `entries()` | iterators | `[...set]` | array |

⚠️ Keys/values compared by reference: `map.get({})` never finds a different `{}`. ⚠️ `JSON.stringify(map)` → `'{}'`: convert with `Object.fromEntries(map)` or `[...map]`. ⚠️ `map['key'] = 1` sets a normal property, not a Map entry: use `.set`.

---

## Promises and async

| Function | Arguments | Returns | Edge cases / remember |
| --- | --- | --- | --- |
| `new Promise((resolve, reject) => {})` | executor | promise | Executor runs **immediately** (synchronously). Throwing inside = reject. Calling resolve twice does nothing |
| `p.then(onFulfilled, [onRejected])` | callbacks | **new** promise | ⚠️ Return the next promise or the chain doesn't wait |
| `p.catch(onRejected)` | callback | new promise | Catches errors from all earlier steps. After catch, the chain continues as fulfilled |
| `p.finally(cb)` | callback (no args) | new promise | Passes the original result/error through |
| `Promise.resolve(v)` / `Promise.reject(err)` | value / error | promise | |
| `Promise.all(iterable)` | promises | promise of **array** (same order) | ⚠️ Rejects on **first** failure (others keep running). Empty array → resolves `[]` |
| `Promise.allSettled(iterable)` | promises | `[{ status: 'fulfilled', value } \| { status: 'rejected', reason }]` | Never rejects |
| `Promise.race(iterable)` | promises | first to **settle** | Empty array → pending forever |
| `Promise.any(iterable)` | promises | first to **fulfill** | All reject → `AggregateError` (`err.errors`) |
| `Promise.withResolvers()` | none | `{ promise, resolve, reject }` | ES2024 |
| `async function` | | always a promise | `return x` → resolves with x; `throw` → rejects |
| `await p` | promise or value | resolved value | Only in async functions / module top level. Throws on rejection → use try/catch. ⚠️ Sequential awaits are slow when independent: use `Promise.all` |
| `setTimeout(fn, [ms], ...args)` | | id (number in browser) | Minimum delay. ⚠️ `setTimeout(fn(), 100)` calls fn immediately |
| `setInterval(fn, ms)` | | id | Always `clearInterval` it |
| `queueMicrotask(fn)` | | undefined | Runs after current code, before timers |

Order: synchronous code → **microtasks** (promises, `await` continuations) → **macrotasks** (`setTimeout`, events).

---

## fetch

```js
const res = await fetch(url, {
  method: 'POST',                         // default 'GET'
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(data),             // string, FormData, Blob, URLSearchParams
  signal: controller.signal,              // for cancelling
  credentials: 'include',                 // send cookies cross-origin
});
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const json = await res.json();
```

| Thing | Remember |
| --- | --- |
| Rejection | ⚠️ Only on **network errors** / CORS / abort. 404 and 500 **resolve**: check `res.ok` (200–299) |
| Body | `res.json()`, `res.text()`, `res.blob()`, `res.formData()`: each returns a promise, and the body can be read **once** (`res.clone()` to read twice) |
| Empty body | `res.json()` throws on 204 / empty responses |
| `FormData` body | ⚠️ Don't set `Content-Type` yourself: the browser adds the boundary |
| GET + body | Not allowed: use query params (`URLSearchParams`) |
| Abort | `err.name === 'AbortError'`. Timeout: `signal: AbortSignal.timeout(5000)` |

---

## DOM quick reference

| API | Returns | Remember |
| --- | --- | --- |
| `document.querySelector(css)` | Element or **null** | First match |
| `document.querySelectorAll(css)` | static NodeList | Has `forEach`; spread for `map` |
| `getElementById(id)` | Element or null | No `#` |
| `el.textContent = s` | | Safe from XSS |
| `el.innerHTML = s` | | ⚠️ XSS risk with user data |
| `el.classList.add/remove/toggle(cls, [force])/contains` | | `toggle('x', bool)` forces add/remove |
| `el.dataset.fooBar` | string | Reads `data-foo-bar` |
| `el.setAttribute(k, v)` / `getAttribute(k)` | | Use properties for live values (`input.value`, `checkbox.checked`) |
| `el.append(...nodes)` / `prepend` / `before` / `after` / `remove()` | | `append` accepts strings too |
| `el.closest(css)` | ancestor or null | Great for event delegation |
| `el.addEventListener(type, fn, [{ once, capture, passive, signal }])` | | Remove with the **same function reference** (or `signal` + `abort()`) |
| `e.preventDefault()` / `e.stopPropagation()` | | Form submit → `preventDefault` or the page reloads |
| `e.target` vs `e.currentTarget` | | Element clicked vs element with the listener |
| `new FormData(form)` | FormData | Inputs need `name`. `Object.fromEntries(fd)` |
| `localStorage.setItem(k, v)` / `getItem(k)` | string / **null** | Strings only: `JSON.stringify`/`parse` |

---

## Operators and syntax you might forget

| Syntax | Meaning | Remember |
| --- | --- | --- |
| `a ?? b` | `b` only if `a` is `null`/`undefined` | Keeps `0`, `''`, `false`. Can't mix with `\|\|`/`&&` without parentheses |
| `a \|\| b` | `b` if `a` is falsy | ⚠️ Replaces `0` and `''` |
| `a && b` | `b` if `a` is truthy, else `a` | In JSX, `0 && <X/>` renders `0` ⚠️ |
| `obj?.a?.b`, `fn?.()`, `arr?.[0]` | Optional chaining | Returns `undefined` instead of throwing. Can't be used on the left of `=` |
| `a ??= b`, `a \|\|= b`, `a &&= b` | Logical assignment | |
| `...` | Spread (in calls/literals) or rest (in params/destructuring) | Rest must be last |
| `const { a = 1, b: renamed, ...rest } = obj` | Object destructuring | Default only applies for `undefined`, not `null` |
| `const [x, , z = 3] = arr` | Array destructuring | Skip with empty commas |
| `===` / `!==` | Strict equality | Always use these. `NaN !== NaN` |
| `typeof x` | type string | `typeof null` → `'object'`, `typeof []` → `'object'`, `typeof undeclaredVar` → `'undefined'` (no error) |
| `x instanceof C` | prototype check | Fails across iframes; use `Array.isArray` for arrays |
| `` tag`text ${x}` `` | Tagged template | Used by styled-components, GraphQL |
| `label: for (...) { break label; }` | Break out of nested loops | Rare |
| `#private` | Private class field | `#x in obj` checks if it exists |
| `static { }` | Static initialization block in a class | |

## Falsy values (all 8)

`false` · `0` · `-0` · `0n` · `''` · `null` · `undefined` · `NaN`. Everything else is truthy, including `'0'`, `'false'`, `[]`, `{}`.

## Coercion quick table

| Expression | Result | Expression | Result |
| --- | --- | --- | --- |
| `'5' + 1` | `'51'` | `'5' - 1` | `4` |
| `true + 1` | `2` | `[] + []` | `''` |
| `null + 1` | `1` | `undefined + 1` | `NaN` |
| `[] == false` | `true` | `null == 0` | `false` |
| `null == undefined` | `true` | `NaN == NaN` | `false` |
| `[1] == 1` | `true` | `'' == 0` | `true` |

## Things people commonly forget

1. `sort()` mutates and sorts **as strings**.
2. `fetch` doesn't reject on HTTP errors.
3. `reduce` needs an initial value.
4. `forEach` can't be stopped and doesn't await.
5. `const` objects/arrays can still be changed inside.
6. Spread / `slice` / `Object.assign` copies are **shallow**.
7. Months in `Date` are 0-based; `getDay()` is the weekday.
8. `toFixed` returns a string.
9. `parseInt` needs radix 10; `Number('')` is `0`.
10. `typeof null === 'object'`; use `Array.isArray` for arrays.
11. Arrow functions don't have their own `this`; methods passed as callbacks lose `this`.
12. `return` followed by a newline returns `undefined`.
13. `0 || x` replaces 0; use `??` for defaults.
14. `replace` with a string replaces only the first match.
15. `JSON.parse` throws: wrap it. `JSON.stringify` drops `undefined` and functions.
16. Event listeners must be removed with the same function reference.
17. `localStorage` stores strings only.
18. Independent `await`s run one after another unless you use `Promise.all`.
