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
  return <button onClick={() => setCount(previousCount => previousCount + 1)}>Clicked {count} times</button>;
}
```

- `count`: the current value React remembered for this component (starts at `0`).
- `setCount`: the function you call to ask for a new value; React re-renders with it.
- `previousCount`: the latest value React has, passed into the updater function.

**Each render is a photo, not a live video.** Inside one render, `count` is a fixed number. Calling `setCount` doesn't change it right away; it schedules the next render.

```tsx
function handleClick() {
  setCount(count + 1);
  setCount(count + 1);
  console.log(count); // still the OLD value, and count only goes up by 1

  // Fix: use the updater function, which always receives the latest value
  setCount(latestCount => latestCount + 1);
  setCount(latestCount => latestCount + 1); // now it goes up by 2
}
```

- `count`: frozen for this render, like a photo. Both `count + 1` calls compute the same number.
- `latestCount`: React passes in the value *including* earlier queued updates, so the second call sees the result of the first.

**Why components re-render (only 3 reasons):**

1. Its own state changed.
2. Its parent re-rendered (children re-render by default, even if their props are the same).
3. A context it reads changed.

**Keys are name tags for list items.** They tell React which item is which when the list changes. If you use the index as the key and delete the first item, every item's "name tag" shifts, and typed input text or checkbox state ends up on the wrong row.

```tsx
// Bad: index changes when items are added, removed or reordered
{todos.map((todo, index) => <TodoRow key={index} todo={todo} />)}
// Good: a stable id from the data
{todos.map(todo => <TodoRow key={todo.id} todo={todo} />)}
```

- `todo`: one item from the `todos` array.
- `index`: its position in the array (0, 1, 2…), which changes when items move.
- `todo.id`: a unique id that belongs to the item itself, so it never changes.

**useEffect = "after you've drawn the screen, also do this".** Use it to talk to things outside React: fetching, timers, subscriptions, the DOM. The dependency array says *when* to run it again, and the returned function cleans up.

```tsx
useEffect(() => {
  const intervalId = setInterval(() => setSeconds(previousSeconds => previousSeconds + 1), 1000);
  return () => clearInterval(intervalId);    // cleanup: runs before the next effect and on unmount
}, []);                                      // [] = run once after mount

// [] -> once on mount | [userId] -> whenever userId changes | no array -> after every render
```

- `intervalId`: the number the browser returns from `setInterval`; you need it to stop the timer.
- `setSeconds`: the state setter for a `seconds` counter declared with `useState`.
- `previousSeconds`: the latest counter value. Using the updater avoids a stale closure, because the effect only runs once.

**Safe data fetching in an effect** (avoids showing old results when the user switches quickly):

```tsx
function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    fetch(`/api/users/${userId}`, { signal: abortController.signal })
      .then(response => { if (!response.ok) throw new Error('Failed'); return response.json(); })
      .then(setUser)
      .catch(fetchError => { if (fetchError.name !== 'AbortError') setErrorMessage(fetchError.message); });
    return () => abortController.abort();   // cancel the old request when userId changes
  }, [userId]);

  if (errorMessage) return <p>{errorMessage}</p>;
  if (!user) return <p>Loading...</p>;
  return <h2>{user.name}</h2>;
}
```

- `userId`: which user to load. It's in the dependency array, so a new id means a new fetch.
- `user`: the loaded data; `null` means "not loaded yet".
- `errorMessage`: text to show if the request fails; `null` means no error.
- `abortController`: a browser object that can cancel a `fetch`. Its `signal` is handed to `fetch`, and `abort()` cancels it.
- `response`: the raw HTTP response; `response.ok` is `false` for 4xx/5xx statuses.
- `fetchError`: whatever went wrong. `AbortError` means *we* cancelled it, so it's ignored.

**useRef = a box that survives renders but doesn't cause them.** Two uses: grabbing a DOM element, and storing a value you don't want to display (a timer id, the previous value).

```tsx
const inputRef = useRef<HTMLInputElement>(null);
<input ref={inputRef} />
<button onClick={() => inputRef.current?.focus()}>Focus</button>
```

- `inputRef`: a box `{ current: … }`. React puts the real `<input>` DOM element in `inputRef.current` after mounting (it's `null` before that).

**useMemo, useCallback and React.memo work as a team.** Every render creates new objects and functions. `React.memo` makes a child skip re-rendering if its props look the same, but a new function every render never "looks the same". `useCallback` keeps the same function between renders, so the memo can do its job.

```tsx
const ExpensiveList = React.memo(function ExpensiveList({ items, onSelect }: Props) {
  return <ul>{items.map(item => <li key={item.id} onClick={() => onSelect(item.id)}>{item.name}</li>)}</ul>;
});

function SearchPage() {
  const [query, setQuery] = useState('');
  const [allItems] = useState(bigList);
  const filteredItems = useMemo(
    () => allItems.filter(item => item.name.includes(query)),
    [allItems, query],
  );                                                                  // cached result
  const handleSelect = useCallback((itemId: string) => console.log(itemId), []); // same function every render
  return (
    <>
      <input value={query} onChange={event => setQuery(event.target.value)} />
      <ExpensiveList items={filteredItems} onSelect={handleSelect} />
    </>
  );
}
```

- `query`: what the user typed in the search box.
- `allItems`: the full, unfiltered list.
- `filteredItems`: the items matching `query`. `useMemo` only recomputes it when `allItems` or `query` change.
- `handleSelect`: the click handler passed to the list. `useCallback` keeps it the *same function object* every render, so `React.memo` sees unchanged props.
- `event.target.value`: the text currently in the input.

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

- `ThemeContext`: the "channel" components read from. `'light'` is the default used if there's no Provider above.
- `theme` (in `App`): the real value, held in state and broadcast through `value={theme}`.
- `theme` (in `DeepChild`): the value read from the nearest Provider above it in the tree.

**Custom hooks = reusable logic.** Any function starting with `use` that calls other hooks. Each component that uses it gets its own separate state.

```tsx
function useDebounce<T>(value: T, delayMs = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timeoutId);   // user typed again: cancel the old timer
  }, [value, delayMs]);
  return debouncedValue;
}

// usage
const [searchText, setSearchText] = useState('');
const debouncedSearchText = useDebounce(searchText, 500); // only changes 500ms after typing stops
```

- `value`: the fast-changing input (updates on every keystroke).
- `delayMs`: how long the value must stay unchanged before it's accepted, in milliseconds.
- `debouncedValue`: the "settled" copy that the hook returns. It lags behind `value`.
- `timeoutId`: the pending timer; clearing it on each change restarts the wait.
- `debouncedSearchText`: use this (not `searchText`) to trigger API calls.

**useReducer = useState for when updates follow rules.** All the "how state changes" logic lives in one pure function.

```tsx
type Action = { type: 'add'; text: string } | { type: 'toggle'; id: number };

function todosReducer(currentTodos: Todo[], action: Action): Todo[] {
  switch (action.type) {
    case 'add':    return [...currentTodos, { id: Date.now(), text: action.text, done: false }];
    case 'toggle': return currentTodos.map(todo => todo.id === action.id ? { ...todo, done: !todo.done } : todo);
  }
}
const [todos, dispatch] = useReducer(todosReducer, []);
dispatch({ type: 'add', text: 'Learn React' });
```

- `Action`: every kind of change allowed. `type` says which one; the other fields carry its data.
- `todosReducer`: a pure function: (current state, action) → new state. It never mutates `currentTodos`.
- `todos`: the current state the component renders.
- `dispatch`: the function you call with an action; React runs the reducer and re-renders.

**Error boundaries catch crashes during rendering** so one broken widget doesn't blank the whole page. They still have to be class components (or use the `react-error-boundary` package).

```tsx
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() { return this.state.hasError ? <p>Something went wrong.</p> : this.props.children; }
}
```

- `hasError`: flips to `true` when any child throws while rendering; the boundary then shows the fallback.
- `getDerivedStateFromError`: React calls it with the error and uses the returned object as the new state.
- `componentDidCatch`: the place for side effects such as logging the error.

**Lazy loading = only download code when it's needed.**

```tsx
const SettingsPage = React.lazy(() => import('./Settings'));
<Suspense fallback={<Spinner />}><SettingsPage /></Suspense>
```

- `SettingsPage`: a placeholder component; its code file is downloaded the first time it renders.
- `fallback`: what `Suspense` shows while that download is in progress.

**Controlled vs uncontrolled inputs in one picture:**

```tsx
// Controlled: React state is the source of truth
const [email, setEmail] = useState('');
<input value={email} onChange={event => setEmail(event.target.value)} />

// Uncontrolled: the DOM keeps the value; read it when you need it
function NewsletterForm() {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();                               // stop the full-page reload
    const formData = new FormData(event.currentTarget);   // reads every named input in the form
    console.log(formData.get('email'));
  };
  return <form onSubmit={handleSubmit}><input name="email" defaultValue="" /><button>Send</button></form>;
}
```

- `email`: (controlled) the input's text, stored in React state and updated on every keystroke.
- `event.currentTarget`: the `<form>` element the handler is attached to.
- `formData`: a snapshot of the form's fields, keyed by each input's `name` attribute.
- `defaultValue`: the starting text for an uncontrolled input. After that, the DOM owns the value.

**React 19 forms in one example** (Actions handle the pending state for you):

```tsx
function SignupForm() {
  const [errorMessage, submitAction, isPending] = useActionState(
    async (_previousError: string | null, formData: FormData) => {
      const response = await signup(formData.get('email') as string);
      return response.ok ? null : 'Signup failed';   // the returned value becomes errorMessage
    },
    null,                                            // initial errorMessage
  );
  return (
    <form action={submitAction}>
      <input name="email" />
      <button disabled={isPending}>{isPending ? 'Saving...' : 'Sign up'}</button>
      {errorMessage && <p>{errorMessage}</p>}
    </form>
  );
}
```

- `errorMessage`: whatever the action returned last time (`null` on success or before any submit).
- `submitAction`: the wrapped function you give to `<form action>`. React calls it with the form's data on submit.
- `isPending`: `true` while the async action is running; use it to disable the button.
- `_previousError`: the previous state, passed in automatically. The underscore means "not used here".
- `formData`: the submitted form fields, read by input `name`.

