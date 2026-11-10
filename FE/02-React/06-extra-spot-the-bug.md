# Spot the bug: React debugging drills

Interviewers love "what's wrong with this code?" Read each snippet, find the bug(s), then open the answer. Each snippet has a **Names** line explaining its variables, and each answer shows the fixed code.

---

### Bug 1

```tsx
function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const intervalId = setInterval(() => setCount(count + 1), 1000);
  }, []);
  return <p>{count}</p>;
}
```

**Names:** `count` is the number shown. `intervalId` is the id the browser returns from `setInterval`, needed to stop the timer.

<details><summary>Answer</summary>

1. **Stale closure**: the effect runs once, so the interval callback always sees `count = 0` and the display gets stuck at 1. Use the updater form.
2. **No cleanup**, which leaks the interval (two intervals in Strict Mode).

```tsx
useEffect(() => {
  const intervalId = setInterval(() => setCount(previousCount => previousCount + 1), 1000);
  return () => clearInterval(intervalId);
}, []);
```

`previousCount` is the latest value React passes in, so the closure never goes stale.
</details>

---

### Bug 2

```tsx
function EditableList({ items }) {
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

**Names:** `items` is the array of rows. `item` is one row. `index` is its position in the array (0, 1, 2…).

<details><summary>Answer</summary>

Index as key: when an item is deleted or reordered, the input's DOM state sticks to the wrong row, because the key follows the *position*, not the item.

```tsx
{items.map(item => <li key={item.id}><input defaultValue={item.name} /></li>)}
```
</details>

---

### Bug 3

```tsx
function Profile({ userId }) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetch(`/api/users/${userId}`).then((response) => response.json()).then(setUser);
  }, []);
  return <h1>{user.name}</h1>;
}
```

**Names:** `userId` is which user to show. `user` is the loaded data (`null` until loaded). `response` is the raw HTTP response.

<details><summary>Answer</summary>

1. Missing `userId` in deps, so it never refetches when the id changes.
2. A race condition: no abort or ignore flag.
3. `user.name` crashes on the first render (`user` is null). Use `user?.name` or a loading state.
4. No `response.ok` check and no error handling.

```tsx
useEffect(() => {
  const abortController = new AbortController();
  fetch(`/api/users/${userId}`, { signal: abortController.signal })
    .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
    .then(setUser)
    .catch(fetchError => { if (fetchError.name !== 'AbortError') setError(fetchError); });
  return () => abortController.abort();
}, [userId]);

if (!user) return <p>Loading…</p>;
return <h1>{user.name}</h1>;
```
</details>

---

### Bug 4

```tsx
function Todos() {
  const [todos, setTodos] = useState([]);
  const addTodo = (todoText) => {
    todos.push({ id: Date.now(), text: todoText });
    setTodos(todos);
  };
  ...
}
```

**Names:** `todos` is the list in state. `addTodo` adds one item. `todoText` is the text typed for the new todo.

<details><summary>Answer</summary>

Mutation: `push` changes the existing array, so `setTodos` receives the **same reference**. React compares with `Object.is`, sees no change, and skips the re-render.

```tsx
const addTodo = (todoText) =>
  setTodos(previousTodos => [...previousTodos, { id: crypto.randomUUID(), text: todoText }]);
```
</details>

---

### Bug 5

```tsx
function Parent() {
  const [clickCount, setClickCount] = useState(0);
  function TextField() {
    const [text, setText] = useState('');
    return <input value={text} onChange={(event) => setText(event.target.value)} />;
  }
  return <><button onClick={() => setClickCount(clickCount + 1)}>{clickCount}</button><TextField /></>;
}
```

**Names:** `clickCount` is the button's counter. `TextField` is a child component. `text` is what's typed in its input.

<details><summary>Answer</summary>

`TextField` is defined **inside** `Parent`, so every `Parent` render creates a brand-new component function. React sees a different component type, unmounts the old one and mounts a new one: the input loses its text and focus on every click. Move `TextField` to the top level of the file.
</details>

---

### Bug 6

```tsx
function Cart({ cartItems }) {
  const [totalPrice, setTotalPrice] = useState(0);
  useEffect(() => {
    setTotalPrice(cartItems.reduce((runningTotal, cartItem) => runningTotal + cartItem.price, 0));
  }, [cartItems]);
  return <p>Total: {totalPrice}</p>;
}
```

**Names:** `cartItems` is the products in the cart. `totalPrice` is their summed price. In `reduce`, `runningTotal` is the sum so far and `cartItem` is the current product.

<details><summary>Answer</summary>

Not a crash, but an anti-pattern: **derived state in an effect** causes an extra render and a frame with the wrong total. Compute it during render instead:

```tsx
const totalPrice = cartItems.reduce((runningTotal, cartItem) => runningTotal + cartItem.price, 0);
// wrap in useMemo only if the list is huge
```
</details>

---

### Bug 7

```tsx
function Notifications({ unreadCount }) {
  return <div>{unreadCount && <Badge count={unreadCount} />}</div>;
}
```

**Names:** `unreadCount` is how many unread notifications there are.

<details><summary>Answer</summary>

When `unreadCount` is `0`, `0 && …` evaluates to `0`, and React renders the text **"0"**. Use `unreadCount > 0 && …` or a ternary.
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

**Names:** `ThemeContext` shares the theme with any component below. `theme` is `'light'` or `'dark'`. `setTheme` changes it.

<details><summary>Answer</summary>

The `value` is a new object on every `App` render, so every consumer re-renders even when the theme didn't change. Also give `createContext` a default or a typed `null`, plus a guard hook.

```tsx
const themeContextValue = useMemo(() => ({ theme, setTheme }), [theme]);
<ThemeContext.Provider value={themeContextValue}>…
```
</details>

---

### Bug 9

```tsx
function Search() {
  const [searchText, setSearchText] = useState('');
  const handleChange = (event) => {
    setSearchText(event.target.value);
    fetchResults(searchText);
  };
  ...
}
```

**Names:** `searchText` is the text in the search box. `event.target.value` is the new text just typed.

<details><summary>Answer</summary>

`searchText` is still the **old** value inside this handler (state is a snapshot), so you always search one keystroke behind. Use `event.target.value` directly, and debounce the fetch. Better still, derive it from state with an effect or TanStack Query:

```tsx
const handleChange = (event) => setSearchText(event.target.value);
const debouncedSearchText = useDebounce(searchText, 300);
useQuery({ queryKey: ['search', debouncedSearchText], queryFn: () => fetchResults(debouncedSearchText) });
```
</details>

---

### Bug 10

```tsx
function ContactForm() {
  const [formValues, setFormValues] = useState({ name: '', email: '' });
  return (
    <input
      value={formValues.name}
      onChange={(event) => setFormValues({ name: event.target.value })}
    />
  );
}
```

**Names:** `formValues` holds every field of the form in one object.

<details><summary>Answer</summary>

The `useState` setter **replaces** the value; it doesn't merge like class `setState` did. So `email` is lost.

```tsx
onChange={(event) => setFormValues(previousValues => ({ ...previousValues, name: event.target.value }))}
```
</details>

---

### Bug 11

```tsx
function Clicker() {
  const [clickCount, setClickCount] = useState(0);
  const handleClick = () => {
    setClickCount(clickCount + 1);
    setClickCount(clickCount + 1);
    setClickCount(clickCount + 1);
  };
  return <button onClick={handleClick}>{clickCount}</button>;
}
// Expect +3 per click
```

**Names:** `clickCount` is the number shown on the button.

<details><summary>Answer</summary>

It adds 1, because all three calls read the same snapshot of `clickCount` (say 0), so each one asks for "0 + 1".

```tsx
setClickCount(previousCount => previousCount + 1);   // ×3 → each call sees the result of the previous one
```
</details>

---

### Bug 12

```tsx
function ChatRoom({ roomId }) {
  useEffect(() => {
    const connection = createConnection(roomId);
    connection.connect();
  }, [roomId]);
}
```

**Names:** `roomId` is which chat room to join. `connection` is the live connection object.

<details><summary>Answer</summary>

No cleanup, so connections pile up every time `roomId` changes (and double up in Strict Mode).

```tsx
useEffect(() => {
  const connection = createConnection(roomId);
  connection.connect();
  return () => connection.disconnect();
}, [roomId]);
```
</details>

---

### Bug 13

```tsx
const MemoizedRow = React.memo(Row);
function Table({ rows }) {
  const [selectedRowId, setSelectedRowId] = useState(null);
  return rows.map((row) => (
    <MemoizedRow key={row.id} row={row} style={{ padding: 8 }} onSelect={() => setSelectedRowId(row.id)} />
  ));
}
```

**Names:** `rows` is the table data. `row` is one entry. `selectedRowId` is the id of the clicked row. `MemoizedRow` is `Row` wrapped in `React.memo`.

<details><summary>Answer</summary>

`React.memo` is useless here: `style={{...}}` and the inline arrow function are **new objects on every render**, so the shallow props comparison always fails.

```tsx
const ROW_STYLE = { padding: 8 };   // created once, outside the component

<MemoizedRow key={row.id} row={row} style={ROW_STYLE} onSelect={setSelectedRowId} />
// inside Row: onClick={() => onSelect(row.id)}
```

`setSelectedRowId` is a state setter, and React guarantees setters never change identity.
</details>

---

### Bug 14

```tsx
function Timer() {
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  if (secondsElapsed > 10) {
    useEffect(() => alert('Over 10!'), []);
  }
  ...
}
```

**Names:** `secondsElapsed` is how long the timer has run.

<details><summary>Answer</summary>

A hook called conditionally breaks the Rules of Hooks: React tracks hooks by call order, and that order changes once the condition becomes true. Put the condition **inside** the effect:

```tsx
useEffect(() => {
  if (secondsElapsed > 10) alert('Over 10!');
}, [secondsElapsed]);
```
</details>

---

### Bug 15

```tsx
useEffect(async () => {
  const dashboardData = await fetchDashboardData();
  setDashboardData(dashboardData);
}, []);
```

**Names:** `dashboardData` is the fetched result being saved into state.

<details><summary>Answer</summary>

An effect callback must return nothing or a cleanup function, but an `async` function always returns a promise. Define the async function inside and call it:

```tsx
useEffect(() => {
  let isOutdated = false;
  async function loadDashboard() {
    const dashboardData = await fetchDashboardData();
    if (!isOutdated) setDashboardData(dashboardData);
  }
  loadDashboard();
  return () => { isOutdated = true; };   // ignore the result if we unmounted meanwhile
}, []);
```

`isOutdated` becomes `true` in the cleanup, so a late response is ignored.
</details>

---

### Bug 16

```tsx
function NameInput() {
  const [name, setName] = useState();
  return <input value={name} onChange={(event) => setName(event.target.value)} />;
}
```

**Names:** `name` is the text in the input.

<details><summary>Answer</summary>

`name` starts as `undefined`, so the input begins **uncontrolled**, then switches to controlled on the first keystroke, which triggers a warning. Initialise with `useState('')`.
</details>

---

### Bug 17

```tsx
function App() {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}><UserList /></QueryClientProvider>;
}
```

**Names:** `queryClient` is TanStack Query's cache and its settings.

<details><summary>Answer</summary>

A new `QueryClient` on every render throws away the whole cache. Create it once:

```tsx
const queryClient = new QueryClient();          // module level, outside the component
// or, inside the component:
const [queryClient] = useState(() => new QueryClient());   // the lazy initializer runs once
```
</details>

---

### Bug 18

```tsx
function Modal({ onClose }) {
  useEffect(() => {
    window.addEventListener('keydown', (event) => event.key === 'Escape' && onClose());
    return () => window.removeEventListener('keydown', (event) => event.key === 'Escape' && onClose());
  }, [onClose]);
}
```

**Names:** `onClose` is the parent's function to close the modal. `event.key` is the name of the key pressed.

<details><summary>Answer</summary>

The cleanup passes a **different function** (a new arrow function), so `removeEventListener` finds nothing to remove and the listener leaks. Store the handler in a variable and pass that same reference to both calls:

```tsx
useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [onClose]);
```
</details>
