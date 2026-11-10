# Core concepts

- **Rendering model:** a re-render happens when state changes, when the parent re-renders, or when a consumed context changes. Props changing is not itself a trigger: the parent re-rendering is. Each render is a snapshot: state and props are constant inside it.
- **Render vs commit:** in the render phase React calls your components and diffs the results (it must be pure). In the commit phase it updates the DOM, then runs `useLayoutEffect`, paints, then runs `useEffect`.
- **Reconciliation:** React compares element type and `key`. A different type unmounts the whole subtree. Keys identify list items across renders.
- **Fiber:** the internal architecture that splits rendering into interruptible units. This is what makes concurrent features (`useTransition`, Suspense) possible.
- **Controlled vs uncontrolled inputs:** controlled means React state drives `value`; uncontrolled means the DOM holds the value and you read it via `ref` or `FormData`.
- **Lifting state up vs Context vs external store:** colocate state first, lift it when siblings need it, and use Context for low-frequency global values (theme, auth). Use Zustand, Redux Toolkit or Jotai for frequently changing shared client state, and TanStack Query for server state.
- **Strict Mode (dev only):** double-invokes renders and mounts, unmounts and remounts effects, to expose impure code and missing cleanups.

### Re-renders in depth

**What causes a re-render, and how to control it**

| Trigger | Does it always cause a re-render? | How to optimise / prevent |
| --- | --- | --- |
| `setState` / `dispatch` in the component | No. If the new value is identical (`Object.is`) to the current one, React bails out (it may still call the component once more before bailing out) | Keep state close to where it's used; don't store derived values in state; never set a new object/array when nothing changed |
| Parent re-renders | **Yes**, every child re-renders, even if its props are identical | `React.memo` on the child + stable props; lift content up with `children`; move state down |
| Props change | Only the parent's render matters. A `memo` child re-renders only if a prop changed by reference (`Object.is`) | Pass primitives; keep objects/functions stable with `useMemo`/`useCallback` |
| Context value changes | **Yes**, every consumer re-renders, even if it only uses a small part of the value. `memo` on the consumer does not block it | Split contexts by update frequency; memoize the provider's `value`; use a store with selectors (Zustand, Redux) for fast-changing data |
| External store changes (`useSyncExternalStore`) | Yes, when the selected snapshot changes | Subscribe with a selector so only the needed slice triggers it |
| `key` changes | Not a re-render: the component is **unmounted and remounted** (state is lost) | Use stable keys; change a key on purpose only to reset state |
| Strict Mode (dev only) | Renders twice in development | Nothing to do; it doesn't happen in production |

Not a trigger: changing a `ref` (`.current`) or a plain variable, or mutating state in place. React doesn't know about those.

**The updater (functional update) method**

`setState` has two forms: pass a **value** (`setCount(5)`) or pass an **updater function** (`setCount(previousCount => previousCount + 1)`). React calls the updater with the latest queued state and uses what it returns.

Why it matters: inside one render, `count` is a frozen snapshot. Setting from that snapshot three times just sets the same value three times. The updater form queues three steps, and each step receives the result of the previous one.

```tsx
const [count, setCount] = useState(0);

function addThreeWrong() {
  setCount(count + 1);   // 0 + 1
  setCount(count + 1);   // 0 + 1 (count is still 0 in this render)
  setCount(count + 1);   // 0 + 1  → final result: 1
}

function addThreeRight() {
  setCount(previousCount => previousCount + 1);   // 0 → 1
  setCount(previousCount => previousCount + 1);   // 1 → 2
  setCount(previousCount => previousCount + 1);   // 2 → 3  → final result: 3
}

// Also fixes stale closures: the interval never needs `count` in its deps
useEffect(() => {
  const intervalId = setInterval(() => setCount(previousCount => previousCount + 1), 1000);
  return () => clearInterval(intervalId);
}, []);
```

- `count`: the value from *this* render. It does not change until the next render, even after `setCount` is called.
- `previousCount`: the latest value in React's update queue, not the render's snapshot. This is why the three updates add up.
- Both `addThree…` functions only cause **one** re-render: updates are batched, then React processes the queue.
- The interval version runs once on mount but always increments the *current* value, so no stale closure and no dependency on `count`.

Rules: use the updater form whenever the next state depends on the previous one (counters, toggles `setIsOpen(open => !open)`, appending to arrays `setItems(items => [...items, newItem])`). The updater must be **pure** (no side effects; Strict Mode calls it twice). Don't confuse it with the *lazy initializer* `useState(() => expensive())`, which runs only on the first render.

**Event delegation in React**

Event delegation means attaching **one** listener high up and letting events bubble to it, instead of attaching a listener to every element. React does this for you: it doesn't call `addEventListener` on each button. It attaches one listener per event type on the **root container** (the `#root` element; before React 17 it was `document`). When a click bubbles up to the root, React works out which component's `onClick` was targeted, wraps the native event in a `SyntheticEvent`, and calls your handlers in React-tree order.

```tsx
// You write 1,000 handlers…
{items.map(item => <li key={item.id} onClick={() => select(item.id)}>{item.name}</li>)}
// …but React adds NO listeners to those 1,000 <li> elements; the single root listener handles all of them.

// Doing delegation by hand (rarely needed in React): one handler on the parent
<ul onClick={event => {
  const row = (event.target as HTMLElement).closest('li');
  if (row) select(row.dataset.id!);
}}>
  {items.map(item => <li key={item.id} data-id={item.id}>{item.name}</li>)}
</ul>
```

- Benefits: less memory, no add/remove of listeners as elements mount and unmount, and one consistent cross-browser event object.
- `event.target`: the element actually clicked; `event.currentTarget`: the element the handler is attached to.
- Gotchas: `event.stopPropagation()` in React stops the *React* bubbling, but native listeners you attached on `document` still see the event (the root listener is below `document`). Native listeners on elements *inside* the root fire **before** React handlers. Portals bubble through the React tree, not the DOM tree. Since React 17 there's no event pooling, so you can read `event` asynchronously.

**Context: disadvantages**

- **Every consumer re-renders when the value changes**, even if it only reads one field. There is no built-in selector, and `memo` can't stop it.
- A new object in `value={{ a, b }}` re-renders all consumers on every provider render. You must memoize it.
- **Not built for high-frequency updates** (mouse position, typing, animations): it re-renders the whole consuming subtree.
- **Hidden dependency**: a component that calls `useContext` works only under the right provider, which makes it harder to reuse, test and reason about than explicit props. Without a default value, a missing provider gives `undefined`.
- Provider nesting ("provider hell") grows as you add contexts, and splitting contexts to avoid re-renders adds more of it.
- **No built-in tooling** like Redux DevTools, middleware, time-travel, or async handling. You build all of that yourself.
- It only passes values; it doesn't manage state. You still need `useState`/`useReducer` and have to design the update logic.
- Everything under the provider that consumes it is coupled to it, so refactoring the shape of the value touches many files.

Good fit: low-frequency global values (theme, locale, auth user). For anything else, prefer props, composition, or an external store.

### Hooks cheat sheet

| Hook | Use for | Key point |
| --- | --- | --- |
| `useState` | Local state | Use the functional update `setCount(previousCount => previousCount + 1)` when the next value depends on the previous one |
| `useReducer` | Complex or related state transitions | `dispatch` has a stable identity |
| `useEffect` | Syncing with external systems | Runs after paint; return a cleanup function |
| `useLayoutEffect` | Measuring the DOM before paint | Blocks paint; use sparingly |
| `useRef` | Mutable value or DOM node | Changing `.current` does not re-render |
| `useMemo` | Caching an expensive calculation | A performance hint, not a guarantee |
| `useCallback` | Stable function identity | Only useful when passed to a memoized child or used in deps |
| `useContext` | Reading context | Every consumer re-renders when the value changes |
| `useTransition` / `useDeferredValue` | Marking updates non-urgent | Keeps typing responsive during heavy renders |
| `useId` | SSR-safe unique ids | Use for `htmlFor`/`aria-*`, not for list keys |
| `useImperativeHandle` | Exposing methods via ref | Pair with `forwardRef` (in React 19, `ref` is a regular prop) |
| `useSyncExternalStore` | Subscribing to external stores | What state libraries use internally |

**Rules of hooks:** call them only at the top level (no conditions or loops) and only from components or custom hooks. React tracks hooks by call order.

### `useRef` in depth

`useRef(initial)` returns one object `{ current: initial }` that **stays the same object for the component's whole life**. React never looks inside it, so changing `.current` does **not** cause a re-render.

**Three ways to use it**

```tsx
// 1. A handle to a DOM node: focus, scroll, measure, play/pause
function SearchBox() {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={inputRef} />
      <button onClick={() => inputRef.current?.focus()}>Focus</button>
    </>
  );
}

// 2. A mutable "instance variable" that survives re-renders (timer ids, previous value, flags)
function Stopwatch() {
  const [seconds, setSeconds] = useState(0);
  const intervalIdRef = useRef<number | null>(null);
  const previousSecondsRef = useRef(0);

  useEffect(() => { previousSecondsRef.current = seconds; });   // runs after render: holds the last value

  const start = () => {
    intervalIdRef.current = window.setInterval(() => setSeconds(s => s + 1), 1000);
  };
  const stop = () => {
    if (intervalIdRef.current !== null) clearInterval(intervalIdRef.current);
  };
  return <button onClick={start}>Start</button>;
}

// 3. A callback ref: a function that React calls when the node attaches/detaches.
//    Use it when you must react to the node appearing (it may mount late or change).
function MeasuredBox() {
  const [height, setHeight] = useState(0);
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setHeight(node.getBoundingClientRect().height);
  }, []);
  return <div ref={measureRef}>Height is {height}px</div>;
}
```

- `inputRef`: starts `null`; React fills `.current` with the DOM element after mount (hence `?.`).
- `intervalIdRef`: remembers the timer id between renders so `stop` can clear it. Storing it in state would cause pointless re-renders.
- `previousSecondsRef`: updated in an effect (after render), so during render it still holds the *previous* value. That's the "usePrevious" trick.
- `measureRef`: a callback ref. React calls it with the node on mount and with `null` on unmount (React 19 also lets it return a cleanup function). Wrapped in `useCallback` so React doesn't re-call it every render.

**Passing a ref to a child:** in React 19 `ref` is a normal prop (`function Input({ ref })`); before 19 use `forwardRef`. To expose only specific methods to the parent, use `useImperativeHandle`.

**When to use it**
- Focus, text selection, scroll position, media playback, measuring size, or integrating a non-React library that needs a DOM node.
- Storing values that must persist across renders but should not affect the UI: timer/interval ids, the previous value, "is mounted" flags, an in-flight `AbortController`, a WebSocket instance.
- Keeping the *latest* value of a prop or callback for use inside a long-lived effect without re-subscribing (assign it in an effect).

**When not to use it**
- If the value is displayed on screen, use **state**. Changing a ref won't update the UI.
- Don't read or write `ref.current` **during render** (it makes render impure and unpredictable). Do it in event handlers and effects. The only exception is lazy initialisation (`if (ref.current === null) ref.current = …`).
- Don't use it to manipulate DOM that React also controls (adding/removing children). Setting focus, scroll or measuring is fine.

| | `useState` | `useRef` | Plain `let` variable |
| --- | --- | --- | --- |
| Survives re-renders | Yes | Yes | No (reset every render) |
| Update triggers re-render | Yes | No | No |
| Safe to read during render | Yes | No | Yes (but resets) |
| Use for | Anything the UI shows | DOM nodes, timers, "behind the scenes" values | Temporary values inside one render |

### `useReducer` in depth

`useReducer` is `useState` for state that has **several related fields or many ways to change**. Instead of calling setters all over your components, you describe *what happened* (an **action**) and put all the "how the state changes" logic in one pure function (the **reducer**): `(currentState, action) => nextState`.

**Steps**

1. **Describe the state and the actions** (a discriminated union gives you type safety).
2. **Write the reducer**: a pure function with a `switch` on `action.type`. It never mutates `state`; it returns a new object. No API calls, no `Math.random()`, no `Date.now()` inside it.
3. **Call `useReducer(reducer, initialState)`**. You get `[state, dispatch]`.
4. **Dispatch actions from events**: `dispatch({ type: 'added', text })`. You never change state directly.
5. **Render from `state`**.

```tsx
type Todo = { id: string; text: string; done: boolean };
type State = { todos: Todo[]; filter: 'all' | 'open' };

type Action =
  | { type: 'added'; text: string }
  | { type: 'toggled'; id: string }
  | { type: 'removed'; id: string }
  | { type: 'filterChanged'; filter: State['filter'] };

function todoReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'added':
      return { ...state, todos: [...state.todos, { id: crypto.randomUUID(), text: action.text, done: false }] };
    case 'toggled':
      return { ...state, todos: state.todos.map(todo => todo.id === action.id ? { ...todo, done: !todo.done } : todo) };
    case 'removed':
      return { ...state, todos: state.todos.filter(todo => todo.id !== action.id) };
    case 'filterChanged':
      return { ...state, filter: action.filter };
  }
}

function TodoApp() {
  const [state, dispatch] = useReducer(todoReducer, { todos: [], filter: 'all' });
  return (
    <>
      <button onClick={() => dispatch({ type: 'added', text: 'Learn useReducer' })}>Add</button>
      {state.todos.map(todo => (
        <label key={todo.id}>
          <input type="checkbox" checked={todo.done} onChange={() => dispatch({ type: 'toggled', id: todo.id })} />
          {todo.text}
        </label>
      ))}
    </>
  );
}
```

- `State`: the shape of all the data this component manages.
- `Action`: every event that can change it. `type` names what happened; the other fields are the details (the "payload").
- `todoReducer`: given the current state and an action, returns the **next** state. `...state` copies the unchanged fields, and the changed field is replaced with a new array or object.
- `dispatch`: sends an action to React. React runs the reducer during the next render with the latest state and re-renders if the result is a new reference. `dispatch` has a **stable identity**, so it's safe to pass down without `useCallback`.
- `crypto.randomUUID()` in the reducer is fine here only because Strict Mode double-calling still gives a consistent result *per action*. The safer rule is to generate ids in the event handler and pass them in the action.

Extras: a third argument is a lazy initializer (`useReducer(reducer, initialArg, init)`). Returning the *same* state object from the reducer makes React skip the re-render. Pair with Context (`StateContext` + `DispatchContext`) to share it with a subtree: a "mini Redux".

**Use `useReducer` when:** many fields change together, the next state depends on complex rules, several events trigger the same update, or you want the logic testable on its own (a reducer is a plain function). **Use `useState` when:** it's one independent value (a toggle, an input).

**`useReducer` vs Redux**

| | `useReducer` | Redux (Redux Toolkit) |
| --- | --- | --- |
| Scope | One component (plus its subtree if you add Context) | One global store for the whole app |
| What it is | A React hook | A separate library (store, slices, middleware) |
| Sharing state | Props or Context; Context re-renders all consumers | `useSelector` re-renders only components whose selected slice changed |
| Async / side effects | Not built in: do them in handlers/effects, then dispatch | Middleware (thunks, listeners), RTK Query |
| Dev tools | None | Redux DevTools: action log, time-travel |
| Setup and boilerplate | Tiny | More, though RTK reduces it a lot |
| State lifetime | Gone when the component unmounts | Lives outside React; survives unmounts, can be persisted |
| Reducer style | Must return new objects manually | RTK uses Immer, so you can "mutate" in the reducer |
| Best for | Complex local or feature-level state | Large apps with lots of shared, frequently-changing client state |

They share the same *idea* (actions + pure reducers), so `useReducer` is a good stepping stone: if a feature's state needs to be global, the reducer logic moves to a Redux slice almost unchanged.

### React 18/19 features worth naming

Summary for the interview: **React 18 changed *how* React renders (concurrency). React 19 changed *how you write* data mutations and forms (Actions), and removed a lot of boilerplate.** Each hook has a deeper write-up in [07-new-hooks-react-18-19.md](07-new-hooks-react-18-19.md).

| Version | Feature | One-line pitch |
| --- | --- | --- |
| 18 | `createRoot` | Opts the app into concurrent rendering |
| 18 | Automatic batching | Many `setState` calls become one re-render, even inside `setTimeout`, promises and native events |
| 18 | Concurrent rendering + `useTransition` / `useDeferredValue` | Urgent updates (typing) can interrupt slow ones (filtering a big list) |
| 18 | Suspense on the server + streaming SSR | Send HTML in chunks; hydrate parts of the page independently |
| 18 | `useId`, `useSyncExternalStore`, `useInsertionEffect` | Hooks for SSR-safe ids, external stores and CSS-in-JS libraries |
| 19 | Actions (`<form action={fn}>`, async transitions) | React manages pending state, errors and form reset for async work |
| 19 | `useActionState`, `useFormStatus`, `useOptimistic` | Form result/pending state, the submit button's status, instant UI |
| 19 | `use()` | Read a promise or context during render; can be called conditionally |
| 19 | `ref` as a prop, `<Context>` as provider, ref cleanup functions | Less boilerplate: no `forwardRef`, no `.Provider` |
| 19 | `<title>`, `<meta>`, `<link>` in components | Document metadata is hoisted into `<head>` automatically |
| 19 | Server Components and Server Actions | Components that run only on the server; functions callable from the client (`'use server'`) |
| 19.2 | `<Activity>`, `useEffectEvent` | Hide UI but keep its state; read latest values in effects without re-running them |
| Tooling | React Compiler | Automatic memoization at build time |

#### React 18

**1. `createRoot`: the switch that turns on React 18 features**

```tsx
// React 17 (legacy mode: no concurrent features, no automatic batching in timeouts)
ReactDOM.render(<App />, document.getElementById('root'));

// React 18+
import { createRoot } from 'react-dom/client';
createRoot(document.getElementById('root')!).render(<App />);

// SSR apps hydrate instead
import { hydrateRoot } from 'react-dom/client';
hydrateRoot(document.getElementById('root')!, <App />);
```

- `document.getElementById('root')!`: the empty `<div id="root">` in `index.html` that React takes over. The `!` tells TypeScript "this is definitely not null".
- `createRoot(...)`: creates a React root for that element; `.render(<App />)` draws the app into it.
- `hydrateRoot`: used when the server already sent HTML. React attaches event handlers to the existing markup instead of re-creating it.

**2. Automatic batching:** React groups state updates that happen together into a single re-render. Before 18 this only happened inside React event handlers. Now it happens everywhere.

```tsx
function handleClick() {
  fetch('/api').then(() => {
    setIsLoading(false);
    setStatusText('done');
    // React 17: 2 re-renders (no batching inside promises)
    // React 18: 1 re-render
  });
}

// Rare opt-out: force React to apply an update synchronously (e.g. to measure the DOM right after)
import { flushSync } from 'react-dom';
flushSync(() => setIsOpen(true));
listRef.current!.scrollTop = 0; // DOM is already updated here
```

- `setIsLoading` / `setStatusText`: two separate state setters. Batching means React waits until both have been called, then re-renders once.
- `flushSync`: forces the update inside it to be applied to the DOM immediately, before the next line runs.
- `listRef`: a ref to a scrollable list element; we reset its scroll position after it's shown.

**3. Concurrent rendering with `useTransition`:** rendering can now be *interrupted*. You mark an update as non-urgent and React keeps the old UI interactive while it prepares the new one in the background. If the user types again, React throws away the half-finished render and starts over.

```tsx
function SearchPage() {
  const [inputText, setInputText] = useState('');
  const [filterText, setFilterText] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const typedText = event.target.value;
    setInputText(typedText);                  // urgent: input must update immediately
    startTransition(() => {
      setFilterText(typedText);               // non-urgent: may be interrupted
    });
  }

  return (
    <>
      <input value={inputText} onChange={handleChange} />
      {isPending && <Spinner />}
      <HugeFilteredList filterText={filterText} />    {/* slow to render */}
    </>
  );
}
```

- `inputText`: what's shown in the text box. It updates on every keystroke so typing never lags.
- `filterText`: the value the slow list filters by. It's updated inside a transition, so React may delay it.
- `isPending`: `true` while the transition's render is still in progress (the list is behind the input).
- `startTransition`: wraps state updates to mark them as low priority.
- `typedText`: the input's new value, read once so both setters use the same string.

**4. `useDeferredValue`:** the same idea when you *receive* a value instead of setting it (for example, it comes from props).

```tsx
function Results({ query }: { query: string }) {
  const deferredQuery = useDeferredValue(query);   // lags behind `query` during heavy renders
  const isShowingOldResults = query !== deferredQuery;
  return (
    <div style={{ opacity: isShowingOldResults ? 0.5 : 1 }}>
      <SlowList query={deferredQuery} />           {/* wrap SlowList in memo() for this to help */}
    </div>
  );
}
```

- `query`: the latest value from the parent (for example, the search text).
- `deferredQuery`: a copy of `query` that React lets fall behind while the slow list re-renders.
- `isShowingOldResults`: `true` when the two differ, meaning the list still shows results for an older query. Dimming tells the user an update is coming.

`useTransition` wraps the **state update** (you own the setter). `useDeferredValue` wraps the **value** (you don't). Neither is debouncing: there's no fixed delay, and on a fast device the lag is close to zero.

**5. Suspense for loading states plus streaming SSR:** Suspense lets a component "wait" while a fallback shows. In React 18 it also works on the server. The server streams the page shell first, then streams each Suspense boundary's HTML as its data resolves. Each part hydrates independently (*selective hydration*), and the part the user clicks on is hydrated first.

```tsx
const Comments = lazy(() => import('./Comments'));   // code-splitting: the classic Suspense use

function Post() {
  return (
    <>
      <Article />                                     {/* streamed immediately */}
      <Suspense fallback={<Skeleton />}>
        <Comments />                                  {/* streamed later, hydrated on its own */}
      </Suspense>
    </>
  );
}
```

- `Comments`: created with `lazy`, so its code is downloaded separately the first time it renders.
- `fallback`: the placeholder (`<Skeleton />`) shown until `Comments` is ready.
- `<Article />`: outside the boundary, so it never waits for the comments.

Data fetching with Suspense works through a Suspense-aware source: `use(promise)`, `useSuspenseQuery` (TanStack Query), or framework loaders and Server Components. A plain `useEffect` fetch doesn't suspend.

**6. The new library-level hooks** (good to name, rarely written by hand):

```tsx
// useId: stable unique id that matches between server and client HTML
function Field({ label }: { label: string }) {
  const inputId = useId();    // e.g. ":r1:", identical on server and client
  return (<><label htmlFor={inputId}>{label}</label><input id={inputId} /></>);
}

// useSyncExternalStore: subscribe to something outside React without "tearing"
function subscribeToNetworkStatus(notifyReact: () => void) {
  window.addEventListener('online', notifyReact);
  window.addEventListener('offline', notifyReact);
  return () => {                                     // unsubscribe
    window.removeEventListener('online', notifyReact);
    window.removeEventListener('offline', notifyReact);
  };
}

const isOnline = useSyncExternalStore(
  subscribeToNetworkStatus,
  () => navigator.onLine,     // getSnapshot: read the current value on the client
  () => true,                 // getServerSnapshot: value to use during SSR
);

// useInsertionEffect: only for CSS-in-JS libraries to inject <style> before layout effects read the DOM
```

- `inputId`: a unique id that links the `<label>` to its `<input>`, so clicking the label focuses the input.
- `subscribeToNetworkStatus`: tells the browser to call `notifyReact` whenever the connection changes, and returns a function that stops listening.
- `notifyReact`: a callback React supplies. Calling it means "the store changed, read the snapshot again".
- `isOnline`: the current snapshot value; the component re-renders whenever it changes.

"Tearing" means different parts of the UI showing different versions of the same store during an interruptible render. `useSyncExternalStore` prevents it, which is why Redux and Zustand use it internally.

#### React 19

**7. Actions: async functions that React manages.** A function passed to `startTransition` (now allowed to be async) or to `<form action>` is an *Action*. React tracks its pending state, surfaces errors to error boundaries, and resets uncontrolled forms after a successful submit.

```tsx
// Before React 19: manual pending/error state
function UpdateName() {
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit() {
    setIsPending(true);
    const updateError = await updateName(name);
    setIsPending(false);
    if (updateError) setErrorMessage(updateError);
  }
  // ...
}

// React 19: async transition, pending state for free
function UpdateName() {
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    startTransition(async () => {
      const updateError = await updateName(name);
      if (updateError) setErrorMessage(updateError);
    });
  };
  return <button onClick={handleSubmit} disabled={isPending}>Update</button>;
}
```

- `name`: the text the user typed (bound to an input, not shown).
- `errorMessage`: what to display if saving fails.
- `updateError`: what the API call returned: an error string, or nothing on success.
- `isPending`: in the "before" version you manage it by hand. In the React 19 version `useTransition` sets it to `true` until the async function finishes.

**8. `useActionState`: form result and pending state in one hook**

```tsx
async function signup(previousState: { error?: string }, formData: FormData) {
  const email = formData.get('email') as string;
  const response = await api.signup(email);
  return response.ok ? {} : { error: 'Email already taken' };   // becomes the new state
}

function SignupForm() {
  const [signupState, signupAction, isPending] = useActionState(signup, {});
  return (
    <form action={signupAction}>            {/* no onSubmit, no preventDefault */}
      <input name="email" type="email" required />
      <button disabled={isPending}>{isPending ? 'Signing up…' : 'Sign up'}</button>
      {signupState.error && <p role="alert">{signupState.error}</p>}
    </form>
  );
}
```

- `signup`: the action. React calls it with the previous state and the submitted `formData`; its return value becomes the new state.
- `previousState`: what `signup` returned last time (`{}` initially). Useful for things like counting attempts.
- `signupState`: the latest returned state. Here it holds an optional `error` message.
- `signupAction`: the function to put on `<form action>`. It calls `signup` and tracks pending state.
- `isPending`: `true` while `signup` is running.

**9. `useFormStatus`: a child reads its parent form's status (no prop drilling)**

```tsx
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();      // must be rendered INSIDE a <form>
  return <button disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>;
}
```

- `pending`: `true` while the closest parent `<form>` is submitting. The hook also returns `data` (the submitted `FormData`), `method` and `action`.

**10. `useOptimistic`: show the expected result immediately**

```tsx
function Messages({ messages, sendMessage }: { messages: Message[]; sendMessage: (text: string) => Promise<void> }) {
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (currentMessages, newText: string) => [
      ...currentMessages,
      { id: 'temp', text: newText, isSending: true },
    ],
  );

  async function sendAction(formData: FormData) {
    const messageText = formData.get('text') as string;
    addOptimisticMessage(messageText);   // shows instantly
    await sendMessage(messageText);      // when the action finishes, React swaps back to real `messages`
  }

  return (
    <form action={sendAction}>
      {optimisticMessages.map(message => (
        <p key={message.id} style={{ opacity: message.isSending ? 0.5 : 1 }}>{message.text}</p>
      ))}
      <input name="text" />
    </form>
  );
}
```

- `messages`: the real, confirmed list from the parent (the server's truth).
- `sendMessage`: the async function that actually saves a message.
- `optimisticMessages`: what to render. It equals `messages` plus any optimistic additions while an action is running.
- `addOptimisticMessage`: call it to add a temporary item. It runs the updater function `(currentMessages, newText) => …`.
- `isSending`: a flag on the temporary item so it can be shown faded until it's confirmed.
- `sendAction`: the form action that ties it all together.

If `send` throws, the optimistic item simply disappears when the action ends. There's no manual rollback.

**11. `use()`: read a promise or context during render**

```tsx
// Reading a promise: suspends until it resolves; errors go to the nearest error boundary
function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  const comments = use(commentsPromise);
  return comments.map(comment => <p key={comment.id}>{comment.text}</p>);
}

// The promise must be created OUTSIDE the component (parent, loader, server component)
// or cached. Creating it during render makes a new promise every render → infinite suspend.
<Suspense fallback={<Spinner />}>
  <Comments commentsPromise={commentsPromise} />
</Suspense>

// Reading context conditionally: impossible with useContext
function Banner({ show }: { show: boolean }) {
  if (!show) return null;
  const theme = use(ThemeContext);   // OK after an early return
  return <div className={theme}>Hi</div>;
}
```

- `commentsPromise`: a promise for the comments, started by a parent or loader *before* this component renders.
- `comments`: the resolved array. The component suspends (shows the nearest `fallback`) until it's ready.
- `show`: a prop that decides whether to render at all. Because of the early return, `use` may be skipped, which is allowed for `use` but not for `useContext`.

**12. Less boilerplate: `ref` as a prop, `<Context>` as a provider, ref cleanup**

```tsx
// ref is a normal prop: no forwardRef
function Input({ ref, ...props }: React.ComponentProps<'input'>) {
  return <input ref={ref} {...props} />;
}

// Context object renders as its own provider
<ThemeContext value="dark">{children}</ThemeContext>        // was <ThemeContext.Provider value=…>

// Ref callbacks can return a cleanup function
<div ref={(divElement) => {
  const resizeObserver = new ResizeObserver(() => {/* … */});
  if (divElement) resizeObserver.observe(divElement);
  return () => resizeObserver.disconnect();     // runs on unmount
}} />
```

- `ref` (in `Input`): received like any other prop and passed to the real `<input>`, so the parent can focus it.
- `React.ComponentProps<'input'>`: all the props a normal `<input>` accepts, including `ref`.
- `divElement`: the DOM node React passes to a callback ref once the element is mounted.
- `resizeObserver`: a browser API that reports size changes. The returned cleanup disconnects it.

**13. Document metadata:** render `<title>`, `<meta>` and `<link>` anywhere and React hoists them into `<head>`. For simple cases this replaces `react-helmet`.

```tsx
function BlogPost({ post }: { post: Post }) {
  return (
    <article>
      <title>{post.title}</title>
      <meta name="description" content={post.summary} />
      <h1>{post.title}</h1>
    </article>
  );
}
```

- `post`: the blog post being shown. Its `title` and `summary` end up in the page's `<head>`, which matters for SEO and browser tabs.

**14. Server Components and Server Actions** (used through a framework such as Next.js App Router)

```tsx
// app/products/page.tsx: a Server Component (the default). It runs only on the server,
// can be async, reads the DB directly, and ships ZERO JS for itself to the browser.
export default async function ProductsPage() {
  const products = await db.product.findMany();
  return <ProductList products={products} />;
}

// AddToCart.tsx: a Client Component; needed for state, effects and event handlers
'use client';
export function AddToCart({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  return <button disabled={pending} onClick={() => startTransition(() => addToCart(productId))}>Add</button>;
}

// actions.ts: a Server Action, i.e. a server function the client can call like a normal function
'use server';
export async function addToCart(productId: string) {
  await db.cart.add(productId);
  revalidatePath('/cart');
}
```

- `products`: fetched straight from the database on the server; only the rendered HTML reaches the browser.
- `'use client'`: marks a file whose components run in the browser (and on the server for SSR).
- `'use server'`: marks functions that only run on the server but can be called from client code.
- `pending` / `startTransition`: show a pending state while the server action runs.
- `addToCart`: the server action; `productId` says which product to add.
- `revalidatePath('/cart')`: tells Next.js to throw away the cached `/cart` page so it shows the new item.

Rules worth knowing: Server Components can't use state, effects or browser APIs. Client Components can't import Server Components, but they can receive them as `children`. Props passed from server to client must be serializable (no functions, except Server Actions).

#### React 19.2 and the React Compiler

**15. `<Activity>` and `useEffectEvent`**

```tsx
// <Activity>: hide a subtree without unmounting it. State and DOM are kept; effects are cleaned up while hidden.
<Activity mode={tab === 'settings' ? 'visible' : 'hidden'}>
  <SettingsPanel />            {/* draft form input survives switching tabs */}
</Activity>

// useEffectEvent: read the latest props/state inside an effect without adding them to deps
function ChatRoom({ roomId, theme }: { roomId: string; theme: string }) {
  const onConnected = useEffectEvent(() => showToast('Connected', theme)); // always sees latest theme
  useEffect(() => {
    const connection = connect(roomId);
    connection.on('connected', onConnected);
    return () => connection.disconnect();
  }, [roomId]);                // changing theme no longer reconnects
}
```

- `tab`: which tab is selected. `<Activity mode>` hides `SettingsPanel` instead of unmounting it, so its state survives.
- `roomId`: which chat room to join. It's the only dependency, so only a room change reconnects.
- `theme`: used for styling the toast. It's read through the effect event, so changing it doesn't reconnect.
- `onConnected`: an effect event: a function that always sees the latest props but isn't a dependency.
- `connection`: the chat connection object; the cleanup disconnects it.

**16. React Compiler:** a build-time Babel plugin (v1.0 released Oct 2025) that analyses components and inserts memoization automatically, at a finer grain than you'd write by hand. It means `useMemo`, `useCallback` and `React.memo` are rarely needed in new code. It requires code that follows the Rules of React (pure renders, no mutating props or state). Code that breaks them is skipped, not miscompiled.

```tsx
// You write this…
function TodoList({ todos, statusFilter }: Props) {
  const visibleTodos = todos.filter(todo => todo.status === statusFilter);
  const handleToggle = (todoId: string) => toggleTodo(todoId);
  return <List items={visibleTodos} onToggle={handleToggle} />;
}
// …and the compiler caches `visibleTodos` and `handleToggle` until `todos`/`statusFilter` change,
// as if you had written useMemo/useCallback yourself.
```

- `statusFilter`: which todos to show, such as `'done'` or `'open'`.
- `visibleTodos`: the filtered list. Without the compiler it's a new array every render.
- `handleToggle`: a click handler. Without the compiler it's a new function every render, which would break `memo` on `List`.

Interview line: *"I still understand manual memoization because most existing codebases don't use the compiler yet, but for new projects I'd enable it rather than sprinkle `useMemo` everywhere."*

### Performance toolkit

1. Measure first with the React DevTools Profiler.
2. Move state down or lift content up (pass `children`) so less re-renders.
3. `React.memo` + stable props (`useCallback`/`useMemo`).
4. Split contexts, or memoize the context value object.
5. Virtualize long lists (TanStack Virtual, react-window).
6. Code-split with `React.lazy` + `Suspense`.
7. Use `useTransition` for expensive updates.

### Likely questions

- What is the virtual DOM and why use it? (Answer: a cheap tree you can diff; React applies the minimal DOM changes. It is not inherently "faster than the DOM".)
- Why shouldn't you use the array index as a key?
- How do you prevent unnecessary re-renders?
- What is event delegation in React? (One listener per event type on the root container; React maps it to the right component's handler. See "Re-renders in depth".)
- What is the updater form of `setState` and when do you need it? (See "Re-renders in depth".)
- `useReducer` vs `useState` vs Redux? (See "`useReducer` in depth".)
- When do you use `useRef` instead of state? (See "`useRef` in depth".)
- Custom hook vs utility function vs HOC? (See the table after Q8.)
- `useEffect` vs `useLayoutEffect`?
- How would you fetch data in an effect safely? (Use an AbortController or an ignore flag in the cleanup.)
- What are error boundaries? (Class components with `getDerivedStateFromError`/`componentDidCatch`. They don't catch errors in event handlers, async code or SSR.)
- What are portals for? (Modals and tooltips: rendering outside the parent DOM, while events still bubble through the React tree.)
- What is a HOC vs a custom hook vs render props?
- SSR vs CSR vs SSG vs RSC?

**Model answers (say each in about 30–60 seconds):**

**Q1. What is the virtual DOM and why use it?**

> "The virtual DOM is a lightweight JavaScript description of the UI: the objects that JSX compiles to. When state changes, React renders a new tree, diffs it against the previous one (reconciliation), and applies only the minimal real DOM changes in the commit phase. The point isn't that it's 'faster than the DOM'. Hand-written DOM updates are faster. The point is that it lets us write UI *declaratively* (describe what it should look like for a given state) while React works out the efficient updates. Because rendering is separated from committing, React can also pause, prioritise and interrupt rendering, which is what concurrent features are built on."

```tsx
// JSX…
<button className="primary" onClick={save}>Save</button>
// …is just a function call that returns a plain object, the "virtual DOM" node:
{ type: 'button', props: { className: 'primary', onClick: save, children: 'Save' } }
```

- `type`: what to create: a tag name like `'button'`, or a component function.
- `props`: everything you wrote as attributes, plus `children` (what goes between the tags).

The diffing heuristics that make it O(n) instead of O(n³):
1. Elements of **different types** produce different trees, so React replaces the whole subtree.
2. **Keys** identify which children are the same across renders.

---

**Q2. Why shouldn't you use the array index as a key?**

> "React uses the key to match a list item to its previous render, so it can keep its state and DOM node. With index keys, the key belongs to the *position*, not the item. If you insert, delete or reorder, item A now gets the key that belonged to item B, so React reuses B's state and DOM for A. You see input values or checkboxes 'jump' to the wrong row, plus unnecessary re-renders. Index keys are fine only if the list is static: never reordered, filtered or inserted into. Otherwise, use a stable id from the data."

```tsx
// ❌ Prepend an item: every row's key shifts by one, so typed text stays in the wrong row
{todos.map((todo, index) => <TodoRow key={index} todo={todo} />)}

// ✅ Stable identity travels with the item
{todos.map(todo => <TodoRow key={todo.id} todo={todo} />)}

// ❌ Also wrong: a new key every render remounts every row each time (loses state, slow)
{todos.map(todo => <TodoRow key={Math.random()} todo={todo} />)}
```

- `index`: the item's *position*. It changes when items are inserted, removed or reordered.
- `todo.id`: belongs to the item, so React can follow it wherever it moves.
- `Math.random()`: different on every render, so React thinks every row is brand new and remounts it.

No id from the API? Generate one *when the item is created* (`crypto.randomUUID()`), not during render.

**A worked example, in simple words**

```tsx
function NameList() {
  const [names, setNames] = useState(['Asha', 'Ben', 'Chitra']);
  return (
    <>
      <button onClick={() => setNames(['Zoya', ...names])}>Add Zoya at the top</button>
      {names.map((name, index) => (
        <label key={index}>      {/* ❌ try key={name} to see the fix */}
          {name}: <input />
        </label>
      ))}
    </>
  );
}
```

1. You type "hello" in the box next to **Asha**.
2. You click the button. The list is now `Zoya, Asha, Ben, Chitra`.
3. With index keys, React sees: key `0` was there before and is still there, so it's "the same row; just change the label from Asha to Zoya". Keys `1` and `2` are also "the same rows" with new labels. Only key `3` is new.
4. The `<input>` DOM nodes are reused by position. "hello" stays in the first box, which now says **Zoya**. It looks like the text jumped to the wrong person.
5. With `key={name}` (a stable id), React sees "Asha's row moved down one place", so it moves Asha's row, including its typed text, and creates one new row for Zoya.

Think of the index as a **seat number on a bus**. If a new passenger boards at the front, everyone shifts one seat, but the luggage stays on the seat numbers. The luggage (input text, checked state, focus) ends up with the wrong person. A stable id is a **name tag**: the luggage follows the person.

Controlled inputs hide the bug less than uncontrolled ones, but you still get extra re-renders, wrong animations and wrongly-reused child state (`useState` inside the row). Index keys are safe only for static lists that are never reordered, filtered or inserted into.

---

**Q3. How do you prevent unnecessary re-renders?**

> "First I measure with the React DevTools Profiler, because re-renders are usually cheap and only matter when a component is slow or renders very often. Then I go in this order: fix the structure first, memoize second. Structural fixes are moving state down to where it's used and passing children ('lifting content up') so expensive parts aren't inside the component whose state changes. Then I use `React.memo` on the expensive child, with stable props from `useCallback`/`useMemo`. For Context I split it, or memoize the value. For huge lists I virtualize. On a new project I'd let the React Compiler handle the memoization."

```tsx
// 1. Move state down: typing used to re-render <ExpensiveTree/>; now only <SearchBox/> re-renders
function Page() {
  return (<><SearchBox /><ExpensiveTree /></>);
}
function SearchBox() {
  const [searchText, setSearchText] = useState('');
  return <input value={searchText} onChange={event => setSearchText(event.target.value)} />;
}

// 2. Lift content up: children are created by the parent, so they don't re-render when ScrollTracker's state changes
function ScrollTracker({ children }: { children: React.ReactNode }) {
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  return <div data-scroll-y={scrollY}>{children}</div>;
}
<ScrollTracker><ExpensiveTree /></ScrollTracker>

// 3. memo + stable props: memo is useless if you pass a new function/object every render
const Row = memo(function Row({ item, onSelect }: RowProps) { /* … */ });

function List({ items }: { items: Item[] }) {
  const [selectedId, setSelectedId] = useState<string>();
  const handleSelect = useCallback((itemId: string) => setSelectedId(itemId), []);
  return items.map(item => <Row key={item.id} item={item} onSelect={handleSelect} />);
}

// 4. Memoize the context value so consumers re-render only when it actually changes
const authContextValue = useMemo(() => ({ user, logout }), [user, logout]);
<AuthContext value={authContextValue}>{children}</AuthContext>
```

- `searchText`: state that now lives only in `SearchBox`, so typing doesn't re-render `ExpensiveTree`.
- `scrollY`: the page's scroll position. Changing it re-renders `ScrollTracker`, but `children` is the same element object from the parent, so React skips it.
- `handleScroll`: the scroll listener, named so the cleanup can remove the exact same function.
- `selectedId` / `handleSelect`: `handleSelect` is wrapped in `useCallback` so every `Row` gets the same function and `memo` can skip them.
- `authContextValue`: the object given to the provider. `useMemo` keeps the same object until `user` or `logout` changes.

---

**Q3a. Follow-ups: `useMemo`, `useCallback` and `React.memo`**

*`useMemo`*

> **Follow-up 1: Does `useMemo` guarantee the value is cached?**
> "No. It's a performance hint. React may throw the cache away (for example for offscreen content or to free memory), so the code must still be correct if it recomputes. Never put logic in it that has to run only once."
>
> **Follow-up 2: When is it actually worth using?**
> "In two cases: the calculation is genuinely expensive (measure it, roughly more than a millisecond), or I need a stable object/array reference to pass to a `memo` child or into another hook's dependency array. For cheap work, `useMemo` costs more than it saves, because it still stores the value and compares dependencies every render."
>
> **What happens if we remove it?** The calculation re-runs on every render, and the result is a **new reference** each time. The UI output is the same, only slower. But a `memo` child receiving that object re-renders every time, and an effect with it in the deps re-runs every time (which can even cause an infinite loop if the effect sets state).

*`useCallback`*

> **Follow-up 1: How is it related to `useMemo`?**
> "`useCallback(fn, deps)` is just `useMemo(() => fn, deps)`. It caches the *function itself*, not its result."
>
> **Follow-up 2: Does it stop the function from being created on every render?**
> "No. The inline function is still created each render. `useCallback` only returns the *previous* one if the deps are unchanged. So it helps only when the function is passed to a `memo`-wrapped child or used in a dependency array. Otherwise it's pure overhead."
>
> **What happens if we remove it?** Each render makes a new function. A `memo` child receiving it as a prop sees a changed prop and re-renders, so the `memo` is wasted. An effect that lists the function as a dependency re-runs on every render. Nothing breaks functionally.

*`React.memo`*

> **Follow-up 1: How does it decide whether to skip?**
> "It shallow-compares the old and new props with `Object.is`. If every prop is the same, it reuses the last output. A custom comparison can be passed as the second argument. It doesn't block re-renders caused by the component's *own* state or by a context it consumes."
>
> **Follow-up 2: Why might `memo` seem not to work?**
> "Because a prop is a new reference every render: an inline object `style={{…}}`, an inline arrow function, or JSX passed as `children`. Shallow comparison sees 'changed'. The fix is stable props via `useMemo`/`useCallback`, or moving the value outside the component."
>
> **What happens if we remove it?** The child re-renders every time its parent does, even with identical props. The output is the same, so only performance changes, and only if the child is slow or rendered many times.

```tsx
const Row = memo(function Row({ item, onSelect }: RowProps) { /* … */ });   // skips if item & onSelect are unchanged

function List({ items }: { items: Item[] }) {
  const handleSelect = useCallback((itemId: string) => select(itemId), []);          // same function each render
  const sortedItems = useMemo(() => [...items].sort(byName), [items]);               // recomputed only when items change
  return sortedItems.map(item => <Row key={item.id} item={item} onSelect={handleSelect} />);
}
```

| If you remove… | Correctness | What gets worse |
| --- | --- | --- |
| `useMemo` | Same output | Expensive work repeats; new object/array identity each render |
| `useCallback` | Same output | New function each render, so memoized children and effects see a change |
| `React.memo` | Same output | Child re-renders whenever the parent does |

They work as a team: `memo` is the gate, while `useMemo`/`useCallback` keep the props the same so the gate can work. Using only one of them usually gives no benefit. The React Compiler can add all three automatically.

---

**Q4. `useEffect` vs `useLayoutEffect`?**

> "Both run after React updates the DOM. The difference is *when* relative to the browser painting. `useEffect` runs after paint, asynchronously, so it doesn't block the screen. That's the default for data fetching, subscriptions and logging. `useLayoutEffect` runs synchronously after the DOM mutation but *before* paint, so the browser waits for it. Use it when you need to measure the DOM and adjust layout before the user sees anything, like positioning a tooltip, to avoid a visible flicker. Because it blocks paint, use it sparingly. It also doesn't run on the server, so SSR code should fall back to `useEffect`."

```
render → commit DOM changes → useLayoutEffect → browser paints → useEffect
```

```tsx
function Tooltip({ anchorRect, children }: Props) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipTop, setTooltipTop] = useState(0);

  useLayoutEffect(() => {
    const tooltipHeight = tooltipRef.current!.getBoundingClientRect().height;   // measure
    setTooltipTop(anchorRect.top - tooltipHeight - 8);                         // re-render happens BEFORE paint
  }, [anchorRect]);
  // With useEffect, the tooltip would paint at top=0 first, then jump: a visible flicker.

  return <div ref={tooltipRef} style={{ position: 'fixed', top: tooltipTop }}>{children}</div>;
}
```

- `anchorRect`: the position and size of the element the tooltip points at.
- `tooltipRef`: gives access to the tooltip's DOM node so it can be measured.
- `tooltipHeight`: the measured height of the tooltip.
- `tooltipTop`: where to place the tooltip: above the anchor, with an 8px gap.

---

**Q5. How would you fetch data in an effect safely?**

> "There are two problems to handle: race conditions and updates after unmount. If `id` changes quickly, an older request can resolve after a newer one and overwrite the correct data. I handle that in the effect's cleanup, either by aborting the request with an `AbortController` (which also saves bandwidth) or with an `ignore` flag. I also check `res.ok`, because `fetch` doesn't reject on 404 or 500. In real projects I'd usually reach for TanStack Query or a framework loader, which handle this plus caching and retries."

```tsx
function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    setUser(null);
    setError(null);

    fetch(`/api/users/${userId}`, { signal: abortController.signal })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(setUser)
      .catch(fetchError => {
        if (fetchError.name !== 'AbortError') setError(fetchError);   // aborting is expected, not an error
      });

    return () => abortController.abort();   // runs when userId changes or on unmount
  }, [userId]);

  if (error) return <p>Failed: {error.message}</p>;
  if (!user) return <Spinner />;
  return <h1>{user.name}</h1>;
}
```

The `ignore`-flag version (for APIs that can't be aborted):

```tsx
useEffect(() => {
  let isOutdated = false;
  getUser(userId).then(loadedUser => { if (!isOutdated) setUser(loadedUser); });
  return () => { isOutdated = true; };
}, [userId]);
```

- `userId`: which user to load; a change triggers cleanup of the old effect, then a new fetch.
- `abortController`: cancels the in-flight `fetch` when the cleanup runs.
- `response`: the HTTP response. `response.ok` is `false` for 4xx/5xx, so we throw ourselves.
- `fetchError`: the failure reason. `AbortError` comes from our own cancel, so it's ignored.
- `isOutdated`: set to `true` by the cleanup; a late response from an old request is then ignored.
- `loadedUser`: the result of `getUser`.

In Strict Mode in development the effect runs, cleans up, and runs again. With the abort cleanup you'll see one cancelled request in the Network tab. That's expected, and it proves the cleanup works.

---

**Q6. What are error boundaries?**

> "An error boundary is a component that catches errors thrown while rendering its children (in render, lifecycle methods and constructors) and shows a fallback UI instead of unmounting the whole app to a blank screen. It must be a class component using `static getDerivedStateFromError`, to switch to the fallback, and `componentDidCatch`, to log to something like Sentry. In practice I use the `react-error-boundary` package. It does *not* catch errors in event handlers (use try/catch), in async code like `setTimeout` or promises outside render, in SSR, or in the boundary itself. I place them at several levels: one around the app, and others around independent widgets so one broken widget doesn't take down the page."

```tsx
class ErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };                    // render phase: switch to fallback
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logToSentry(error, info.componentStack);      // commit phase: side effects allowed
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// With react-error-boundary: reset support and hooks
import { ErrorBoundary } from 'react-error-boundary';

<ErrorBoundary
  fallbackRender={({ error, resetErrorBoundary }) => (
    <div role="alert">
      <p>Something went wrong: {error.message}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  )}
  resetKeys={[userId]}              // auto-reset when userId changes
>
  <Profile userId={userId} />
</ErrorBoundary>
```

- `hasError`: the boundary's only state; `true` means "show the fallback".
- `getDerivedStateFromError`: React calls it during render after a child throws; it returns the new state.
- `componentDidCatch(error, info)`: runs afterwards; `info.componentStack` shows which components the error passed through.
- `fallbackRender`: a function that returns the fallback UI. It receives the `error` and `resetErrorBoundary`.
- `resetErrorBoundary`: clears the error so the children render again ("Try again").
- `resetKeys`: if any value in this array changes, the boundary resets automatically.

To send an async or event-handler error to a boundary: `const { showBoundary } = useErrorBoundary();` then `catch (e) { showBoundary(e); }`. Errors thrown by `use(promise)`, `useSuspenseQuery` and transitions do reach boundaries automatically.

**Where should error boundaries be wrapped?**

An error bubbles up to the **nearest** boundary above the component that threw. If there is none, React unmounts the whole tree (a blank screen). So use layers:

1. **Top level (around `<App />` or the root layout):** the last line of defence. Shows a "Something went wrong, reload" page and logs the error.
2. **Route/page level:** a crash on one page keeps the navigation and layout alive. Next.js `error.tsx` and React Router `errorElement` do this per route.
3. **Independent widgets:** a chart, comments section, third-party embed, or a dashboard card, so one broken piece doesn't take down the page.
4. **Around risky or untrusted content:** rich-text/markdown renderers, plugin components, and anything driven by unpredictable API data.

Don't wrap *every* component (noisy and hard to maintain), and don't put a boundary only at the top (any error kills the entire UI). Combine with `Suspense`: put `ErrorBoundary` outside `Suspense` so a failed lazy-load or `use(promise)` shows the error fallback.

```tsx
<ErrorBoundary FallbackComponent={AppCrashPage}>                {/* 1. whole app */}
  <Layout>
    <ErrorBoundary FallbackComponent={PageError} resetKeys={[pathname]}>   {/* 2. per route */}
      <Suspense fallback={<Spinner />}>
        <Page />
      </Suspense>
    </ErrorBoundary>
    <ErrorBoundary fallback={<p>Chart unavailable</p>}>         {/* 3. one widget */}
      <RevenueChart />
    </ErrorBoundary>
  </Layout>
</ErrorBoundary>
```

- `resetKeys={[pathname]}`: navigating to another route clears the error automatically, so the user isn't stuck on the error screen.
- The boundary catches errors from components *below* it, never from itself, so a fallback component should be simple and unlikely to throw.

**What error boundaries do NOT catch**

| Not caught | Why | What to do |
| --- | --- | --- |
| Event handlers (`onClick`, `onChange`) | They don't run during rendering | `try/catch`, then set error state or call `showBoundary(error)` |
| Async code (`setTimeout`, `fetch().then`, `async/await` in an effect) | The error is thrown after render finished | `.catch`/`try/catch`, then `showBoundary` or set state and throw it during render |
| Server-side rendering errors | Boundaries run on the client | Handle in the server framework (streaming SSR error callbacks, `error.tsx`) |
| Errors thrown in the boundary itself | It can only catch errors from its children | Put another boundary above it |
| Errors outside React (global scripts, other libraries' listeners) | React isn't involved | `window.onerror` / `unhandledrejection` handlers, plus Sentry |
| Failed network requests that aren't thrown | `fetch` resolves on 404/500 | Check `response.ok` and handle or throw |

Other points: boundaries catch errors in render, lifecycle methods and constructors of descendants. A boundary can't be written as a function component with hooks (you need `getDerivedStateFromError`), which is why people use `react-error-boundary`. A caught error is logged to the console in development and the dev overlay still shows it. Error boundaries handle *unexpected* bugs; expected failures (a failed form submit, 404 data) should be handled with normal UI states.

---

**Q7. What are portals for?**

> "`createPortal` renders children into a different DOM node, usually `document.body`, while keeping them in the same place in the *React* tree. You use it for modals, tooltips, dropdowns and toasts that would otherwise be clipped by a parent's `overflow: hidden` or trapped by a `z-index` stacking context. The key detail: events still bubble through the React tree, not the DOM tree. A click inside the portal triggers `onClick` on the React parent, and context still works."

```tsx
import { createPortal } from 'react-dom';

function Modal({ open, onClose, children }: ModalProps) {
  if (!open) return null;
  return createPortal(
    <div className="backdrop" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// The modal's DOM lives in <body>, but a click inside it still bubbles to this div's onClick
<div onClick={() => console.log('React parent saw it')} style={{ overflow: 'hidden' }}>
  <Modal open onClose={closeModal}>Hello</Modal>
</div>
```

- `open`: whether the modal is shown; returning `null` renders nothing.
- `onClose`: called when the backdrop is clicked.
- `document.body`: the DOM node the modal is physically placed in, outside the clipping parent.
- `event.stopPropagation()`: stops clicks *inside* the dialog from bubbling to the backdrop and closing it.

For accessibility, also mention focus trapping, Escape to close, and returning focus to the trigger (or using the native `<dialog>` element). More detail is in [08-portals.md](08-portals.md).

---

**Q8. What is a HOC vs a custom hook vs render props?**

> "All three are ways to reuse stateful logic. A **HOC** is a function that takes a component and returns a wrapped component that injects props, like `withAuth(Page)`. A **render prop** is a component that calls a function prop to decide what to render, like `<MouseTracker render={pos => …} />`. A **custom hook** is a function that uses other hooks and returns values. Since hooks arrived, custom hooks are the default: no extra components in the tree, no prop-name collisions, and it's obvious where values come from. I still use HOCs for cross-cutting wrappers like auth guards, or when a library expects them. Render props survive mostly as *children as a function* in headless UI libraries."

```tsx
// Same logic, three ways: track the window width

// 1. HOC: wraps the component and injects a prop
function withWindowWidth<Props>(WrappedComponent: React.ComponentType<Props & { width: number }>) {
  return function WithWindowWidth(props: Props) {
    const width = useWindowWidth();
    return <WrappedComponent {...props} width={width} />;
  };
}
const Header = withWindowWidth(({ width }) => <h1>{width > 768 ? 'Desktop' : 'Mobile'}</h1>);

// 2. Render prop: the consumer decides what to render
function WindowWidth({ children }: { children: (width: number) => React.ReactNode }) {
  const width = useWindowWidth();
  return <>{children(width)}</>;
}
<WindowWidth>{width => <h1>{width > 768 ? 'Desktop' : 'Mobile'}</h1>}</WindowWidth>

// 3. Custom hook: just call it
function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return width;
}
function Header() {
  const width = useWindowWidth();
  return <h1>{width > 768 ? 'Desktop' : 'Mobile'}</h1>;
}
```

- `WrappedComponent`: the component the HOC receives and enhances.
- `Props`: a TypeScript generic for the wrapped component's own props, so they pass through with correct types.
- `WithWindowWidth`: the new component the HOC returns. It renders `WrappedComponent` with an extra `width` prop.
- `children` (render prop): a *function* that receives `width` and returns what to render.
- `width`: the current window width in pixels.
- `handleResize`: the resize listener; the cleanup removes it on unmount.

| | HOC | Render props | Custom hook |
| --- | --- | --- | --- |
| Extra components in tree | Yes ("wrapper hell") | Yes | No |
| Where values come from | Hidden (implicit props) | Explicit | Explicit |
| Prop name collisions | Possible | No | No |
| Value usable in plain logic (effects, handlers) | Only via props | Only inside the render function | Yes, it's just a variable |
| Still used for | Auth guards, `connect`, `memo` | Headless UI, `children` functions | Almost everything |

More detail is in [09-higher-order-components.md](09-higher-order-components.md).

**Custom hook vs utility function vs HOC, and how they relate**

- **Utility function:** a plain function with no React inside it. Same input gives the same output, and it can be called anywhere (components, event handlers, tests, Node scripts). Example: `formatCurrency(amount)`, `debounce(fn)`.
- **Custom hook:** a function whose name starts with `use` and that calls other hooks (`useState`, `useEffect`, …). It reuses **stateful logic**. Each component that calls it gets its **own private copy** of the state. It can only be called from a component or another hook, at the top level.
- **HOC (higher-order component):** a function that takes a *component* and returns a new, wrapped *component*. It reuses logic **and** wraps the UI: it can inject props, guard rendering (auth redirect) or add a wrapper element.

**How they're related:** they are layers of reuse. A utility has the pure logic, a hook adds React state and lifecycle around it, and a HOC delivers that hook's result to components that can't call hooks (class components) or applies it to many components at once. Hooks call utilities; HOCs can be built on hooks (see `withWindowWidth` above, which just calls `useWindowWidth`).

```tsx
// Utility: pure logic, no React
const isMobileWidth = (width: number) => width < 768;

// Custom hook: stateful logic that uses the utility
function useIsMobile() {
  const width = useWindowWidth();           // another hook
  return isMobileWidth(width);              // the utility
}

// HOC: reuses the hook to give any component an `isMobile` prop
function withIsMobile<Props>(Wrapped: React.ComponentType<Props & { isMobile: boolean }>) {
  return function WithIsMobile(props: Props) {
    return <Wrapped {...props} isMobile={useIsMobile()} />;
  };
}
```

- `isMobileWidth`: a pure check; testable without React.
- `useIsMobile`: re-renders the component when the window is resized, because it uses state inside.
- `withIsMobile`: gives class components or ready-made components the same behaviour as a prop, without editing them.

| | Utility function | Custom hook | HOC |
| --- | --- | --- | --- |
| What it is | Plain function | Function that calls hooks (`useX`) | Function: component in, component out |
| Holds React state / effects | No | Yes (each caller gets its own) | Yes, in the wrapper component it returns |
| Where it can be called | Anywhere | Only in components or other hooks, top level | At module level, to create a component |
| Adds a component to the tree | No | No | Yes (the wrapper) |
| Returns | Any value | Any value (state, functions) | A component |
| Can render or change UI | No | No (only returns data) | Yes (wrap, guard, inject props) |
| Typical use | Formatting, math, validation | Data fetching, form state, subscriptions | Auth guards, analytics, `memo`, `connect`; wrapping class components |
| Testing | Plain unit test | `renderHook` | Render the wrapped component |
| Rule | None | Rules of Hooks | Don't create inside render; copy statics; forward refs |

Rule of thumb: no React in it, so a utility. Reuse stateful logic, so a custom hook. Wrap or guard whole components, or support class components, so a HOC.

---

**Q9. SSR vs CSR vs SSG vs RSC?**

> "They differ in *where* and *when* HTML is produced. **CSR** (client-side rendering): the server sends an empty shell plus a JS bundle, and the browser renders everything. That's a slow first paint and weak for SEO, but simple, and good for dashboards behind a login. **SSR** (server-side rendering): the server renders HTML on every request, so content appears fast and SEO is good, then the client *hydrates* it to make it interactive. **SSG** (static site generation): HTML is rendered once at build time and served from a CDN. It's the fastest option, but data is only as fresh as the last build. ISR, which regenerates pages in the background, fills that gap. **RSC** (React Server Components) is a different axis: components that run only on the server and send *zero JS* to the client. They can be combined with SSR, and they reduce bundle size and allow direct DB access. Client Components are only used where interactivity is needed."

| | CSR | SSR | SSG | RSC |
| --- | --- | --- | --- | --- |
| HTML produced | In the browser | On the server, each request | At build time | On the server (per request or at build) |
| First contentful paint | Slow | Fast | Fastest | Fast |
| SEO | Weak | Good | Good | Good |
| Data freshness | Live | Live | Stale until rebuild (or ISR) | Live |
| JS sent to client | All of it | All of it (to hydrate) | All of it (to hydrate) | Only Client Components |
| Server cost | None (static hosting) | High | None (CDN) | Medium |
| Good for | Dashboards, internal apps | Personalised, SEO pages | Blogs, docs, marketing | Data-heavy pages in Next.js App Router |

```tsx
// CSR (Vite SPA): the browser fetches after mount
function Products() {
  const { data } = useQuery({ queryKey: ['products'], queryFn: fetchProducts });
  return <List items={data ?? []} />;
}

// RSC (Next.js App Router): runs on the server, no fetching code or JS shipped to the browser
export default async function ProductsPage() {
  const products = await db.product.findMany();      // direct DB access
  return <List items={products} />;
}

// Next.js caching options decide SSG vs SSR for the same component
export const revalidate = 3600;          // SSG with ISR: rebuild at most once an hour
export const dynamic = 'force-dynamic';  // SSR: render on every request
```

- `data` (CSR): starts `undefined` while the browser fetches, so `?? []` supplies an empty list meanwhile.
- `products` (RSC): already loaded on the server before any HTML is sent.
- `revalidate`: in Next.js, the number of seconds a statically built page stays valid before it's regenerated in the background.
- `dynamic = 'force-dynamic'`: tells Next.js never to cache this page and to render it on every request.

Closing line: *"I choose per page, not per app: static for marketing pages, server-rendered for SEO and personalised pages, client-rendered for highly interactive authenticated screens."*

### Gotchas

- **Stale closures:** an interval or effect captures old state. Fix with a functional update, correct dependencies, or a ref.
- `setState` is asynchronous within a render: `setCount(count + 1)` called twice adds 1, not 2.
- **Object/array dependencies** recreated every render cause effects to run every time.
- `{count && <X/>}` renders `0` when count is 0. Use `count > 0 &&`.
- Mutating state (`arr.push`) doesn't trigger a re-render. Always create new references.
- Index keys with reorderable lists cause state to stick to the wrong item.
- Defining a component inside another component remounts it every render, so it loses state.
- `useEffect` without cleanup leaks subscriptions and timers. Strict Mode exposes this.
- **You might not need an effect:** derive values during render instead of syncing state with effects.
- A context `value={{a, b}}` makes a new object every render, which re-renders every consumer.
- Resetting state: change the component's `key` to remount it.

