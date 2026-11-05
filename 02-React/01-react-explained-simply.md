## 1. React core (highest priority)

Most interview time goes here. Be ready to explain why a component re-renders and how to stop it.

### Explained simply (read this first)

**A component is just a function that returns UI.** React calls it, looks at what it returns, and updates the screen to match. Every time the component's data changes, React calls the function again (this is a "re-render") and only changes the parts of the screen that are different.

```tsx
function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}</h1>;   // props in -> UI out
}
```

**State is the component's memory.** A normal variable resets every time the function runs. `useState` keeps the value between renders, and calling the setter tells React "something changed, run me again".

```tsx
function Counter() {
  const [count, setCount] = useState(0);
  // let x = 0;  <- would reset to 0 on every render, and changing it never updates the screen
  return <button onClick={() => setCount(c => c + 1)}>Clicked {count} times</button>;
}
```

**Each render is a photo, not a live video.** Inside one render, `count` is a fixed number. Calling `setCount` doesn't change it right away; it schedules the next render.

```tsx
function handleClick() {
  setCount(count + 1);
  setCount(count + 1);
  console.log(count); // still the OLD value, and count only goes up by 1

  // Fix: use the updater function, which always receives the latest value
  setCount(c => c + 1);
  setCount(c => c + 1); // now it goes up by 2
}
```

**Why components re-render (only 3 reasons):**

1. Its own state changed.
2. Its parent re-rendered (children re-render by default, even if their props are the same).
3. A context it reads changed.

**Keys are name tags for list items.** They tell React which item is which when the list changes. If you use the index as the key and delete the first item, every item's "name tag" shifts, and typed input text or checkbox state ends up on the wrong row.

```tsx
// Bad: index changes when items are added, removed or reordered
{todos.map((t, i) => <TodoRow key={i} todo={t} />)}
// Good: a stable id from the data
{todos.map(t => <TodoRow key={t.id} todo={t} />)}
```

**useEffect = "after you've drawn the screen, also do this".** Use it to talk to things outside React: fetching, timers, subscriptions, the DOM. The dependency array says *when* to run it again, and the returned function cleans up.

```tsx
useEffect(() => {
  const id = setInterval(() => setSeconds(s => s + 1), 1000);
  return () => clearInterval(id);    // cleanup: runs before the next effect and on unmount
}, []);                              // [] = run once after mount

// [] -> once on mount | [userId] -> whenever userId changes | no array -> after every render
```

**Safe data fetching in an effect** (avoids showing old results when the user switches quickly):

```tsx
function User({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/users/${id}`, { signal: controller.signal })
      .then(res => { if (!res.ok) throw new Error('Failed'); return res.json(); })
      .then(setUser)
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();   // cancel the old request when id changes
  }, [id]);

  if (error) return <p>{error}</p>;
  if (!user) return <p>Loading...</p>;
  return <h2>{user.name}</h2>;
}
```

**useRef = a box that survives renders but doesn't cause them.** Two uses: grabbing a DOM element, and storing a value you don't want to display (a timer id, the previous value).

```tsx
const inputRef = useRef<HTMLInputElement>(null);
<input ref={inputRef} />
<button onClick={() => inputRef.current?.focus()}>Focus</button>
```

**useMemo, useCallback and React.memo work as a team.** Every render creates new objects and functions. `React.memo` makes a child skip re-rendering if its props look the same, but a new function every render never "looks the same". `useCallback` keeps the same function between renders, so the memo can do its job.

```tsx
const ExpensiveList = React.memo(function ExpensiveList({ items, onSelect }: Props) {
  return <ul>{items.map(i => <li key={i.id} onClick={() => onSelect(i.id)}>{i.name}</li>)}</ul>;
});

function Parent() {
  const [query, setQuery] = useState('');
  const [items] = useState(bigList);
  const filtered = useMemo(() => items.filter(i => i.name.includes(query)), [items, query]); // cached result
  const handleSelect = useCallback((id: string) => console.log(id), []);                       // same function every render
  return <><input value={query} onChange={e => setQuery(e.target.value)} /><ExpensiveList items={filtered} onSelect={handleSelect} /></>;
}
```

Rule of thumb to say in the interview: "I don't memoize everything. I measure with the Profiler first, and memoize when a component is slow or receives props from a parent that re-renders a lot."

**Context = a way to skip passing props through every level.** Good for things many components need and that rarely change (theme, logged-in user).

```tsx
const ThemeContext = createContext<'light' | 'dark'>('light');

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  return <ThemeContext.Provider value={theme}><Page /></ThemeContext.Provider>;
}
function DeepChild() {
  const theme = useContext(ThemeContext); // no prop drilling
  return <div className={theme}>...</div>;
}
```

**Custom hooks = reusable logic.** Any function starting with `use` that calls other hooks. Each component that uses it gets its own separate state.

```tsx
function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);   // user typed again: cancel the old timer
  }, [value, delay]);
  return debounced;
}

// usage
const [search, setSearch] = useState('');
const debouncedSearch = useDebounce(search, 500); // only changes 500ms after typing stops
```

**useReducer = useState for when updates follow rules.** All the "how state changes" logic lives in one pure function.

```tsx
type Action = { type: 'add'; text: string } | { type: 'toggle'; id: number };

function todosReducer(state: Todo[], action: Action): Todo[] {
  switch (action.type) {
    case 'add':    return [...state, { id: Date.now(), text: action.text, done: false }];
    case 'toggle': return state.map(t => t.id === action.id ? { ...t, done: !t.done } : t);
  }
}
const [todos, dispatch] = useReducer(todosReducer, []);
dispatch({ type: 'add', text: 'Learn React' });
```

**Error boundaries catch crashes during rendering** so one broken widget doesn't blank the whole page. They still have to be class components (or use the `react-error-boundary` package).

```tsx
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() { return this.state.hasError ? <p>Something went wrong.</p> : this.props.children; }
}
```

**Lazy loading = only download code when it's needed.**

```tsx
const Settings = React.lazy(() => import('./Settings'));
<Suspense fallback={<Spinner />}><Settings /></Suspense>
```

**Controlled vs uncontrolled inputs in one picture:**

```tsx
// Controlled: React state is the source of truth
const [email, setEmail] = useState('');
<input value={email} onChange={e => setEmail(e.target.value)} />

// Uncontrolled: the DOM keeps the value; read it when you need it
function Form() {
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    console.log(data.get('email'));
  };
  return <form onSubmit={onSubmit}><input name="email" defaultValue="" /><button>Send</button></form>;
}
```

**React 19 forms in one example** (Actions handle the pending state for you):

```tsx
function SignupForm() {
  const [error, submitAction, isPending] = useActionState(async (_prev: string | null, formData: FormData) => {
    const res = await signup(formData.get('email') as string);
    return res.ok ? null : 'Signup failed';
  }, null);
  return (
    <form action={submitAction}>
      <input name="email" />
      <button disabled={isPending}>{isPending ? 'Saving...' : 'Sign up'}</button>
      {error && <p>{error}</p>}
    </form>
  );
}
```

