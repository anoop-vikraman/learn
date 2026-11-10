# 04 · Effects, refs and fetching data

## 1. What is a side effect?

Rendering must be **pure**: just calculate JSX from props and state. Anything that reaches **outside** React is a **side effect**:

- fetching data from an API
- timers (`setTimeout`, `setInterval`)
- subscribing to events (window resize, WebSocket)
- changing the document title, localStorage
- using a non-React library on a DOM node (charts, maps)

Side effects caused by a **user action** belong in **event handlers**. Side effects that must happen because the component **is on screen** (synchronising with something external) belong in **`useEffect`**.

---

## 2. `useEffect`

```jsx
import { useEffect, useState } from 'react';

function Title({ count }) {
  useEffect(() => {
    document.title = `Clicked ${count} times`;   // runs AFTER React updates the screen
  }, [count]);                                    // dependency array: re-run when count changes

  return <p>{count}</p>;
}
```

### The dependency array controls when it runs

```jsx
useEffect(() => { /* ... */ });           // after EVERY render (rarely what you want)
useEffect(() => { /* ... */ }, []);       // once after the first render (mount)
useEffect(() => { /* ... */ }, [a, b]);   // after the first render AND whenever a or b changes
```

React compares each dependency with its previous value using `Object.is`.

### The dependency rule

**Every value from the component (props, state, functions defined inside it) that the effect uses must be in the array.** Leaving them out causes **stale values** (the effect keeps seeing old data). The ESLint rule `react-hooks/exhaustive-deps` checks this for you, so don't ignore its warnings.

Not needed in the array: state setters (`setCount`), refs (`ref.current`), and values defined outside the component.

### Cleanup

Return a function from the effect to **undo** it. React runs the cleanup **before running the effect again** and **when the component unmounts**.

```jsx
function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);        // cleanup: stop the timer
  }, []);

  return <p>{time.toLocaleTimeString()}</p>;
}

function WindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);   // same function reference
  }, []);

  return <p>Width: {width}px</p>;
}
```

Without cleanup you get **memory leaks** and duplicate listeners or timers. In development, **StrictMode runs every effect twice** (mount → cleanup → mount) to check that your cleanup works. If something breaks or happens twice, your cleanup is missing.

### Effect lifecycle in short

```
first render → screen updated → effect runs
deps change  → re-render → screen updated → cleanup (old) → effect (new)
unmount      → cleanup
```

---

## 3. Fetching data

```jsx
function UserList() {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState('loading');   // 'loading' | 'success' | 'error'
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setStatus('loading');
        const res = await fetch('https://jsonplaceholder.typicode.com/users', { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setUsers(data);
        setStatus('success');
      } catch (err) {
        if (err.name === 'AbortError') return;        // component unmounted: ignore
        setError(err.message);
        setStatus('error');
      }
    }

    load();
    return () => controller.abort();                   // cancel if unmounted
  }, []);

  if (status === 'loading') return <p>Loading…</p>;
  if (status === 'error') return <p role="alert">Error: {error}</p>;
  if (users.length === 0) return <p>No users.</p>;

  return <ul>{users.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

Things to notice:
- ⚠️ The effect callback **can't be `async` itself** (it must return nothing or a cleanup function, not a promise). Define an async function inside and call it.
- Always handle **loading, error and empty** states.
- `fetch` doesn't throw on 404/500, so check `res.ok`.

### Fetching when an input changes (and avoiding race conditions)

```jsx
function UserDetails({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let ignore = false;                       // flag for stale responses
    setUser(null);
    fetch(`/api/users/${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!ignore) setUser(data);           // ignore responses for an old userId
      });
    return () => { ignore = true; };
  }, [userId]);

  return user ? <h2>{user.name}</h2> : <p>Loading…</p>;
}
```

Without the `ignore` flag (or `AbortController`), switching quickly from user 1 to user 2 can show user 1's data if that response arrives last.

### In real apps

Writing fetch logic in effects gets repetitive (caching, refetching, retries, deduplication). Most apps use **TanStack Query** (see [../../04-TanStack-Query/](../../04-TanStack-Query/)) or their framework's data loading:

```jsx
const { data: users, isPending, error } = useQuery({
  queryKey: ['users'],
  queryFn: () => fetch('/api/users').then((r) => r.json()),
});
```

---

## 4. You might not need an effect

Effects are for synchronising with **external** systems. Many beginners overuse them. Common cases where you should **not** use an effect:

### Derived data: calculate during render

```jsx
// ❌
const [fullName, setFullName] = useState('');
useEffect(() => { setFullName(`${first} ${last}`); }, [first, last]);   // extra render, can lag

// ✅
const fullName = `${first} ${last}`;
const visibleTodos = useMemo(() => filterTodos(todos, filter), [todos, filter]); // only if expensive
```

### Responding to a user action: use the event handler

```jsx
// ❌ Effect watching state set by a click
useEffect(() => { if (submitted) postForm(data); }, [submitted]);

// ✅ Do it where it happens
function handleSubmit() { postForm(data); }
```

### Resetting state when a prop changes: use `key`

```jsx
// ❌ useEffect(() => { setComment(''); }, [userId]);
// ✅
<CommentBox key={userId} userId={userId} />
```

**Rule of thumb:** if the effect only sets state based on other state/props, you probably don't need it.

---

## 5. `useRef`

`useRef` gives you a **box** (`{ current: value }`) that **keeps its value between renders**, and **changing it does not cause a re-render**.

```jsx
const ref = useRef(initialValue);
ref.current;          // read
ref.current = 123;    // write (no re-render)
```

### Use 1: accessing DOM elements

```jsx
function SearchBar() {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current.focus();          // focus the input when the component appears
  }, []);

  return (
    <>
      <input ref={inputRef} placeholder="Search…" />
      <button onClick={() => inputRef.current.select()}>Select text</button>
    </>
  );
}
```

`ref.current` is `null` during the first render. It's set after React creates the DOM node, so read it in effects or event handlers, **not during render**.

Other DOM uses: scrolling (`ref.current.scrollIntoView({ behavior: 'smooth' })`), measuring (`getBoundingClientRect()`), playing video (`videoRef.current.play()`), integrating chart/map libraries.

### Use 2: remembering values without re-rendering

```jsx
function Stopwatch() {
  const [time, setTime] = useState(0);
  const intervalRef = useRef(null);        // the interval ID doesn't need to be shown

  function start() {
    if (intervalRef.current) return;       // already running
    intervalRef.current = setInterval(() => setTime((t) => t + 1), 1000);
  }
  function stop() {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }
  useEffect(() => stop, []);               // clear on unmount

  return (
    <>
      <p>{time}s</p>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
    </>
  );
}
```

Other examples: the previous value of a prop, whether the component is mounted, a debounce timer ID, a WebSocket instance.

### State vs ref

| | `useState` | `useRef` |
| --- | --- | --- |
| Changing it re-renders | ✅ | ❌ |
| Value available on next render | ✅ | ✅ |
| Updated | Asynchronously (next render) | Immediately |
| Use for | Anything shown on screen | DOM nodes, timer IDs, values not shown in the UI |

⚠️ If the value is displayed, it must be state. Showing `ref.current` in JSX won't update when it changes.

### Passing a ref to your own component

In **React 19**, `ref` is a normal prop for function components:

```jsx
function TextInput({ ref, ...props }) {
  return <input ref={ref} {...props} />;
}
<TextInput ref={inputRef} />
```

In React 18 and earlier you needed `forwardRef`:

```jsx
const TextInput = forwardRef(function TextInput(props, ref) {
  return <input ref={ref} {...props} />;
});
```

---

## 6. `useLayoutEffect` (rarely needed)

Same as `useEffect`, but runs **before the browser paints**. Use it only when you must measure the DOM and update something before the user sees it (e.g. positioning a tooltip) to avoid a visible flicker. It blocks painting, so prefer `useEffect` by default.

---

## 7. Common mistakes

| Mistake | What happens | Fix |
| --- | --- | --- |
| Missing dependencies | Effect uses stale values | Add them; follow the ESLint rule |
| Object/array/function created in render used as a dependency | Effect runs every render | Move it inside the effect, or memoize with `useMemo`/`useCallback` |
| Setting state an effect depends on, without a condition | Infinite loop | Re-think: usually derive the value instead |
| No cleanup for timers/listeners/subscriptions | Leaks, duplicates | Return a cleanup function |
| `async` effect callback | Warning; cleanup broken | Define an async function inside |
| Fetching without handling races | Old data shown | `ignore` flag or `AbortController` |
| Reading `ref.current` during render | `null` / stale | Read in effects/handlers |

---

## 8. Exercises

1. A `useEffect` that saves a to-do list to localStorage whenever it changes, and lazy-initial state that loads it.
2. Fetch posts from `https://jsonplaceholder.typicode.com/posts?userId=1`, with a user-ID select that refetches. Handle loading, errors and race conditions.
3. A "scroll to top" button that appears after scrolling 300px (listen to `scroll`, clean up).
4. Auto-focus the first invalid field when a form is submitted, using refs.
5. Find the bug: `useEffect(() => { setCount(count + 1); }, [count]);`
