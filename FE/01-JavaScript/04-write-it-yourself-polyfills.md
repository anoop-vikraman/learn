# Write it yourself (common live-coding tasks)

**Debounce:** run only after calls stop for `delay` ms (search input).

```js
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);                              // cancel the previous scheduled call
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
const onSearch = debounce(q => console.log('search', q), 300);
```

**Throttle:** run at most once per `interval` ms (scroll).

```js
function throttle(fn, interval) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= interval) {
      last = now;
      fn.apply(this, args);
    }
  };
}
```

**Promise.all:**

```js
function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    const results = [];
    let done = 0;
    if (promises.length === 0) return resolve(results);
    promises.forEach((p, i) => {
      Promise.resolve(p)                 // also accepts plain values
        .then(value => {
          results[i] = value;            // keep original order
          if (++done === promises.length) resolve(results);
        })
        .catch(reject);                  // first rejection wins
    });
  });
}
```

**sleep and retry with backoff:**

```js
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retry(fn, retries = 3, delay = 500) {
  try {
    return await fn();
  } catch (err) {
    if (retries === 0) throw err;
    await sleep(delay);
    return retry(fn, retries - 1, delay * 2);   // exponential backoff
  }
}
```

**Function.prototype.bind:**

```js
Function.prototype.myBind = function (context, ...preset) {
  const fn = this;
  return function (...later) {
    return fn.apply(context, [...preset, ...later]);
  };
};
```

**Array.prototype.map and reduce:**

```js
Array.prototype.myMap = function (callback) {
  const result = [];
  for (let i = 0; i < this.length; i++) result.push(callback(this[i], i, this));
  return result;
};

const total = [1, 2, 3].reduce((sum, n) => sum + n, 0);              // 6
const byId = users.reduce((acc, u) => ({ ...acc, [u.id]: u }), {});  // array -> lookup object
```

**Flatten a nested array and deep clone:**

```js
const flatten = (arr) => arr.reduce((acc, x) => acc.concat(Array.isArray(x) ? flatten(x) : x), []);
flatten([1, [2, [3, [4]]]]);   // [1, 2, 3, 4]   (built-in: arr.flat(Infinity))

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  const copy = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) copy[key] = deepClone(obj[key]);
  return copy;
}
```

**Memoised fetch with a closure + promises (combines several topics):**

```js
const cache = new Map();
function cachedFetch(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then(r => r.json()).catch(err => { cache.delete(url); throw err; }));
  }
  return cache.get(url);   // concurrent callers share the same in-flight promise
}
```

### JavaScript checklist

- [ ] Draw the event loop and explain microtask vs macrotask order
- [ ] Callbacks vs promises vs async/await, and why each replaced the last
- [ ] `Promise.all` vs `allSettled` vs `race` vs `any`
- [ ] Sequential vs parallel `await`; why `forEach` + async is a bug
- [ ] Closures with a real use case; the `var` loop puzzle
- [ ] Hoisting and the TDZ; `var`/`let`/`const`
- [ ] Four rules of `this` + arrow functions; `call`/`apply`/`bind`
- [ ] Prototype chain; what `new` does; classes as sugar
- [ ] `==` vs `===`, falsy values, reference vs value, shallow vs deep copy
- [ ] Write debounce, throttle and `Promise.all` from memory

