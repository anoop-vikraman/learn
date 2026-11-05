# Spot the bug: React debugging drills

Interviewers love "what's wrong with this code?" Read each snippet, find the bug(s), then open the answer.

---

### Bug 1

```tsx
function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCount(count + 1), 1000);
  }, []);
  return <p>{count}</p>;
}
```

<details><summary>Answer</summary>

1. **Stale closure**: `count` is always 0, so the display gets stuck at 1. Use `setCount(c => c + 1)`.
2. **No cleanup**, which leaks the interval (two intervals in Strict Mode). Add `return () => clearInterval(id);`.
</details>

---

### Bug 2

```tsx
function List({ items }) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={index}><input defaultValue={item.name} /></li>
      ))}
    </ul>
  );
}
// items can be reordered / deleted
```

<details><summary>Answer</summary>

Index as key: when an item is deleted or reordered, the input's DOM state sticks to the wrong row. Use `key={item.id}`.
</details>

---

### Bug 3

```tsx
function Profile({ userId }) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetch(`/api/users/${userId}`).then((r) => r.json()).then(setUser);
  }, []);
  return <h1>{user.name}</h1>;
}
```

<details><summary>Answer</summary>

1. Missing `userId` in deps, so it never refetches when the id changes.
2. A race condition: no abort or ignore flag.
3. `user.name` crashes on the first render (`user` is null). Use `user?.name` or a loading state.
4. No `res.ok` check and no error handling.
</details>

---

### Bug 4

```tsx
function Todos() {
  const [todos, setTodos] = useState([]);
  const add = (text) => {
    todos.push({ id: Date.now(), text });
    setTodos(todos);
  };
  ...
}
```

<details><summary>Answer</summary>

Mutation: same array reference, so React bails out and nothing re-renders. Use `setTodos(prev => [...prev, { id: crypto.randomUUID(), text }])`.
</details>

---

### Bug 5

```tsx
function Parent() {
  const [count, setCount] = useState(0);
  function Child() {
    const [text, setText] = useState('');
    return <input value={text} onChange={(e) => setText(e.target.value)} />;
  }
  return <><button onClick={() => setCount(count + 1)}>{count}</button><Child /></>;
}
```

<details><summary>Answer</summary>

`Child` is defined **inside** `Parent`, so it's a new component type on every render. React unmounts and remounts it, the input loses its text and focus. Move `Child` outside.
</details>

---

### Bug 6

```tsx
function Cart({ items }) {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setTotal(items.reduce((s, i) => s + i.price, 0));
  }, [items]);
  return <p>Total: {total}</p>;
}
```

<details><summary>Answer</summary>

Not a crash, but an anti-pattern: **derived state in an effect** causes an extra render and a frame with the wrong total. Compute it during render: `const total = items.reduce(...)` (with `useMemo` if it's expensive).
</details>

---

### Bug 7

```tsx
function Notifications({ count }) {
  return <div>{count && <Badge count={count} />}</div>;
}
```

<details><summary>Answer</summary>

When `count` is `0`, React renders the text **"0"**. Use `count > 0 && …` or a ternary.
</details>

---

### Bug 8

```tsx
const ThemeContext = createContext();
function App() {
  const [theme, setTheme] = useState('light');
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <ExpensiveTree />
    </ThemeContext.Provider>
  );
}
```

<details><summary>Answer</summary>

The `value` is a new object on every `App` render, so every consumer re-renders even when the theme didn't change. Use `useMemo(() => ({ theme, setTheme }), [theme])`. (Also: give `createContext` a default or a typed `null`, plus a guard hook.)
</details>

---

### Bug 9

```tsx
function Search() {
  const [query, setQuery] = useState('');
  const handleChange = (e) => {
    setQuery(e.target.value);
    fetchResults(query);
  };
  ...
}
```

<details><summary>Answer</summary>

`query` is the **old** value (state is a snapshot). Use `e.target.value` directly, and debounce the fetch (better still, derive it from state with an effect or TanStack Query).
</details>

---

### Bug 10

```tsx
function Form() {
  const [form, setForm] = useState({ name: '', email: '' });
  return (
    <input
      value={form.name}
      onChange={(e) => setForm({ name: e.target.value })}
    />
  );
}
```

<details><summary>Answer</summary>

`useState` doesn't merge like class `setState` did, so `email` is lost. Use `setForm(f => ({ ...f, name: e.target.value }))`.
</details>

---

### Bug 11

```tsx
function Clicker() {
  const [n, setN] = useState(0);
  const handleClick = () => {
    setN(n + 1);
    setN(n + 1);
    setN(n + 1);
  };
  return <button onClick={handleClick}>{n}</button>;
}
// Expect +3 per click
```

<details><summary>Answer</summary>

It adds 1, because all three calls read the same snapshot `n`. Use `setN(prev => prev + 1)` three times.
</details>

---

### Bug 12

```tsx
function Chat({ roomId }) {
  useEffect(() => {
    const conn = createConnection(roomId);
    conn.connect();
  }, [roomId]);
}
```

<details><summary>Answer</summary>

No cleanup, so connections pile up when `roomId` changes. Add `return () => conn.disconnect();`.
</details>

---

### Bug 13

```tsx
const MemoRow = React.memo(Row);
function Table({ rows }) {
  const [selected, setSelected] = useState(null);
  return rows.map((r) => (
    <MemoRow key={r.id} row={r} style={{ padding: 8 }} onSelect={() => setSelected(r.id)} />
  ));
}
```

<details><summary>Answer</summary>

`React.memo` is useless: `style={{...}}` and the inline arrow are new on every render. Hoist the style to a constant, and pass `onSelect={setSelected}` (stable) plus `id`, or use `useCallback`.
</details>

---

### Bug 14

```tsx
function Timer() {
  const [seconds, setSeconds] = useState(0);
  if (seconds > 10) {
    useEffect(() => alert('Over 10!'), []);
  }
  ...
}
```

<details><summary>Answer</summary>

A hook called conditionally breaks the Rules of Hooks (React tracks hooks by call order). Put the condition **inside** the effect: `useEffect(() => { if (seconds > 10) alert(...) }, [seconds]);`.
</details>

---

### Bug 15

```tsx
useEffect(async () => {
  const data = await fetchData();
  setData(data);
}, []);
```

<details><summary>Answer</summary>

An effect callback must return nothing or a cleanup function, but an async function returns a promise. Define the async function inside and call it:
```tsx
useEffect(() => {
  let ignore = false;
  (async () => { const d = await fetchData(); if (!ignore) setData(d); })();
  return () => { ignore = true; };
}, []);
```
</details>

---

### Bug 16

```tsx
function Input() {
  const [value, setValue] = useState();
  return <input value={value} onChange={(e) => setValue(e.target.value)} />;
}
```

<details><summary>Answer</summary>

The value starts as `undefined`, so the input begins **uncontrolled** and switches to controlled, which triggers a warning. Initialise with `useState('')`.
</details>

---

### Bug 17

```tsx
function Users() {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}><UserList /></QueryClientProvider>;
}
```

<details><summary>Answer</summary>

A new `QueryClient` on every render throws away the whole cache. Create it outside the component or with `const [qc] = useState(() => new QueryClient())`.
</details>

---

### Bug 18

```tsx
function Modal({ onClose }) {
  useEffect(() => {
    window.addEventListener('keydown', (e) => e.key === 'Escape' && onClose());
    return () => window.removeEventListener('keydown', (e) => e.key === 'Escape' && onClose());
  }, [onClose]);
}
```

<details><summary>Answer</summary>

The cleanup passes a **different function** reference, so the listener is never removed. Store the handler in a variable and pass that same reference to both calls.
</details>
