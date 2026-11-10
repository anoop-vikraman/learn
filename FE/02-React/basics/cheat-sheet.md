# React cheat sheet

Every hook and core API: **what it takes, what it returns, when to use it, and the edge cases people forget.** Covers React 18 and 19.

Legend: ⚠️ = gotcha · 🆕 = React 19

---

## JSX

| Rule | Example | Remember |
| --- | --- | --- |
| One root element | `<>...</>` or `<div>` | `<Fragment key={id}>` when a key is needed |
| Close all tags | `<img />`, `<input />` | |
| camelCase attributes | `className`, `htmlFor`, `onClick`, `tabIndex`, `autoFocus` | `aria-*` and `data-*` stay kebab-case |
| Expressions in `{}` | `{user.name}`, `{a ? b : c}`, `{list.map(...)}` | No `if`/`for` statements inside JSX |
| Inline styles | `style={{ marginTop: 8, color: 'red' }}` | Object; numbers mean `px` for most properties |
| Comments | `{/* comment */}` | |
| Renders nothing | `true`, `false`, `null`, `undefined` | ⚠️ `0` and `NaN` DO render |
| Can't render | plain objects | "Objects are not valid as a React child": render a property instead |
| Raw HTML | `dangerouslySetInnerHTML={{ __html: html }}` | ⚠️ XSS risk: sanitize with DOMPurify |
| Component names | `<MyButton />` | Must start with a capital letter |

---

## Hooks: state

### `useState`

```jsx
const [value, setValue] = useState(initialValue);
const [value, setValue] = useState(() => expensiveInit());   // lazy initializer
setValue(newValue);
setValue((prev) => next);                                      // updater function
```

| Detail | Remember |
| --- | --- |
| `initialValue` | Used **only on the first render**. Later changes to it are ignored |
| Lazy init | Pass the **function** (`useState(fn)`), not its result (`useState(fn())`), for expensive work |
| Storing a function in state | `useState(() => myFn)`, since passing `myFn` directly treats it as an initializer |
| Setter timing | ⚠️ Doesn't update the variable immediately; the new value appears on the **next render** |
| Batching | Multiple sets in one event (or in timeouts/promises, React 18+) → one re-render |
| Updater | Use `prev => ...` when the new value depends on the old (counters, toggles, arrays) |
| Same value | `Object.is(old, new)` true → render skipped |
| Objects/arrays | ⚠️ Never mutate; always set a **new** object/array |
| Setter identity | Stable: safe to omit from dependency arrays |
| Resetting state | Change the component's `key` |

### `useReducer`

```jsx
const [state, dispatch] = useReducer(reducer, initialArg, [init]);
// reducer: (state, action) => newState
dispatch({ type: 'added', payload });
```

| Detail | Remember |
| --- | --- |
| `init` (3rd arg) | Optional: `init(initialArg)` computes the initial state lazily |
| Reducer | Must be **pure**: no fetch, random, dates or mutation. Throw on unknown actions |
| `dispatch` | Stable identity. The new state shows on the next render (like a setter) |
| When | Many related values or many update types; logic you want to test in isolation |

---

## Hooks: effects

### `useEffect`

```jsx
useEffect(() => {
  // side effect
  return () => { /* cleanup */ };
}, [dep1, dep2]);
```

| Dependency array | Runs |
| --- | --- |
| omitted | After **every** render |
| `[]` | Once after mount (+ cleanup on unmount) |
| `[a, b]` | After mount and when `a` or `b` changes (`Object.is`) |

| Detail | Remember |
| --- | --- |
| Timing | After the browser paints (doesn't block the screen) |
| Cleanup | Runs before the next effect and on unmount. Clear timers, listeners, subscriptions; abort fetches |
| StrictMode (dev) | ⚠️ Mount → cleanup → mount, so effects run **twice**. Not a bug: it checks your cleanup |
| `async` | ⚠️ The callback can't be async: define `async function load()` inside and call it |
| Dependencies | Include **every** prop/state/function used inside. Objects/functions created during render change every time → move them inside the effect or memoize |
| Infinite loop | Setting state that's also a dependency, without a condition |
| Race conditions | `let ignore = false; return () => { ignore = true }` or `AbortController` |
| Don't use for | Derived values (compute in render), reacting to clicks (use handlers), resetting state on prop change (use `key`) |

### `useLayoutEffect`

Same signature as `useEffect`, but runs **synchronously after DOM changes, before paint**. Only for measuring layout to avoid flicker (tooltips, positioning). ⚠️ Blocks painting; warns on the server.

### `useInsertionEffect`

For CSS-in-JS libraries to insert `<style>` tags before layout effects. You'll almost never use it.

---

## Hooks: refs

### `useRef`

```jsx
const ref = useRef(initialValue);   // { current: initialValue }
<input ref={ref} />                 // ref.current = the DOM node after mount
```

| Detail | Remember |
| --- | --- |
| Changing `ref.current` | ⚠️ Does **not** re-render. If it's shown in the UI, use state |
| DOM refs | `null` during the first render. Read them in effects/handlers, not during render |
| Uses | DOM access (focus, scroll, measure), timer IDs, previous values, mutable instance data |
| Ref callbacks | `ref={(node) => { ... }}`. 🆕 Can return a cleanup function |
| Passing to children | 🆕 `ref` is a normal prop in function components. React ≤18: `forwardRef((props, ref) => ...)` |
| Initial value | `useRef(new Thing())` creates `new Thing()` every render (ignored): lazily init with `if (!ref.current) ref.current = new Thing()` |

### `useImperativeHandle`

```jsx
function FancyInput({ ref }) {
  const inputRef = useRef(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current.focus(), clear: () => { inputRef.current.value = ''; } }), []);
  return <input ref={inputRef} />;
}
```

Exposes a **custom, limited API** to the parent instead of the raw DOM node. Rarely needed.

---

## Hooks: performance

| Hook | Signature | Returns | Remember |
| --- | --- | --- | --- |
| `useMemo` | `useMemo(() => value, deps)` | cached value | Recomputes only when deps change. For expensive calculations or stable object/array props. ⚠️ It's a performance hint, not a guarantee |
| `useCallback` | `useCallback(fn, deps)` | the same function between renders | Useful only when passed to `memo` children or used as an effect dependency. = `useMemo(() => fn, deps)` |
| `memo` | `memo(Component, [arePropsEqual])` | memoized component | Skips re-render if props are shallow-equal. ⚠️ Defeated by new object/function props and by `children` JSX. Still re-renders on its own state/context changes |
| `useTransition` | `const [isPending, startTransition] = useTransition()` | flag + function | Mark state updates as **non-urgent** so typing stays responsive. 🆕 `startTransition` accepts async functions (Actions) |
| `useDeferredValue` | `useDeferredValue(value, [initialValue])` | a lagging copy of value | Render a slow list with the deferred value while the input uses the real value |

---

## Hooks: context and others

| Hook | Signature | Returns | Remember |
| --- | --- | --- | --- |
| `useContext` | `useContext(MyContext)` | the nearest Provider's value | Default value (from `createContext(default)`) only when there's **no Provider** above. ⚠️ All consumers re-render when the value changes → memoize the value, split contexts |
| `useId` | `useId()` | unique stable string like `':r0:'` | For `htmlFor`/`aria-*` IDs. ⚠️ **Not** for list keys. Same on server and client |
| `useSyncExternalStore` | `useSyncExternalStore(subscribe, getSnapshot, [getServerSnapshot])` | current store value | For subscribing to external stores (browser APIs, state libraries). `getSnapshot` must return the same value if nothing changed |
| `useDebugValue` | `useDebugValue(value)` | — | Label shown for a custom hook in DevTools |

### 🆕 React 19 hooks and APIs

| API | Signature | Remember |
| --- | --- | --- |
| `use` | `use(promise)` / `use(context)` | Reads a promise (suspends until resolved → needs `<Suspense>`) or a context. ⚠️ **Can** be called in conditions/loops. The promise must be created outside render (cached), or it loops |
| `useActionState` | `const [state, formAction, isPending] = useActionState(actionFn, initialState)` | `actionFn(prevState, formData)`, can be async. Use with `<form action={formAction}>` |
| `useFormStatus` | `const { pending, data, method, action } = useFormStatus()` | From `react-dom`. ⚠️ Must be used in a component **inside** the `<form>` |
| `useOptimistic` | `const [optimistic, addOptimistic] = useOptimistic(state, (current, update) => next)` | Shows a temporary value during an async action; reverts automatically when it finishes |
| `<form action={fn}>` | | Function actions: React calls `fn(formData)` and resets uncontrolled fields after success |
| `<Context value>` | | Use the context directly as the provider (`.Provider` still works) |
| Document metadata | `<title>`, `<meta>`, `<link>` inside components | Hoisted to `<head>` automatically |

More detail: [../07-new-hooks-react-18-19.md](../07-new-hooks-react-18-19.md).

---

## Rules of hooks

1. Call hooks **only at the top level**: not in conditions, loops, nested functions, or after an early `return`. (`use()` is the exception.)
2. Call hooks **only from components or custom hooks** (functions named `useSomething`).
3. Custom hooks share **logic**, not state: each call has its own state.

---

## Core APIs

| API | Signature | Remember |
| --- | --- | --- |
| `createRoot` | `createRoot(domNode).render(<App />)` | From `react-dom/client`. `root.unmount()` to remove |
| `hydrateRoot` | `hydrateRoot(domNode, <App />)` | For server-rendered HTML |
| `createContext` | `createContext(defaultValue)` | Default is used **only** without a Provider |
| `createPortal` | `createPortal(children, domNode, [key])` | From `react-dom`. Renders elsewhere in the DOM; events still bubble through the **React** tree |
| `lazy` | `lazy(() => import('./Page'))` | Needs a **default export**. Declare at module level. Wrap usage in `<Suspense>` |
| `<Suspense fallback>` | `<Suspense fallback={<Spinner />}>` | Shows the fallback while children load (lazy code, `use(promise)`, Suspense-enabled data libraries) |
| `<StrictMode>` | wrap the app | Dev only: double render + double effects to find impure code and missing cleanup |
| `<Profiler id onRender>` | | Measure render timing in code |
| `flushSync` | `flushSync(() => setX(1))` | From `react-dom`. Forces an immediate DOM update. Rarely needed |
| `startTransition` | `startTransition(() => setX(1))` | Like `useTransition` without the pending flag |
| `cloneElement`, `Children.map` | | Legacy patterns; prefer explicit props or context |

---

## Events

| Event prop | Fires on | Remember |
| --- | --- | --- |
| `onClick` | click | Pass a function: `onClick={fn}` or `onClick={() => fn(id)}`. ⚠️ `onClick={fn()}` runs during render |
| `onChange` | **every keystroke** in inputs | Different from HTML's `change`. Text: `e.target.value` (always a string). Checkbox: `e.target.checked` |
| `onInput` | every input | Same as onChange for text in React |
| `onSubmit` | form submit | ⚠️ `e.preventDefault()` unless you use form actions |
| `onKeyDown` | key pressed | `e.key === 'Enter'`. `onKeyPress` is deprecated |
| `onFocus` / `onBlur` | focus changes | In React they **bubble** (unlike the DOM) |
| `onMouseEnter` / `onMouseLeave` | hover | Don't bubble |
| `onScroll` | scroll | Doesn't bubble in React 17+ |
| `on…Capture` | capture phase | e.g. `onClickCapture` |

The event object: `e.target`, `e.currentTarget`, `e.preventDefault()`, `e.stopPropagation()`, `e.nativeEvent`. The handler's return value is ignored (`return false` doesn't prevent default).

---

## Forms

| Input | Controlled props | Read the value |
| --- | --- | --- |
| text / email / password / textarea | `value` + `onChange` | `e.target.value` |
| number / range | `value` + `onChange` | ⚠️ `e.target.value` is a **string** → `Number(...)`, or `e.target.valueAsNumber` |
| checkbox | `checked` + `onChange` | `e.target.checked` |
| radio | `checked={sel === v}` + `value` + `onChange`, same `name` | `e.target.value` |
| select | `value` on `<select>` | `e.target.value`; multiple: `[...e.target.selectedOptions].map(o => o.value)` |
| file | ⚠️ always uncontrolled | `e.target.files[0]` |
| uncontrolled | `defaultValue` / `defaultChecked` + `name` | `new FormData(form)` or a ref |

| Gotcha | Fix |
| --- | --- |
| `value` without `onChange` | Read-only warning → add `onChange`, use `readOnly`, or `defaultValue` |
| `value={undefined}` then a string | "Changing an uncontrolled input to be controlled" → initialize with `''`, never `undefined`/`null` |
| Page reloads on submit | `e.preventDefault()` |
| Buttons inside a form submit it | Use `type="button"` for non-submit buttons |
| Label not linked | `<label htmlFor="id">` + `<input id="id">` (or `useId()`) |

---

## Lists and keys

| Rule | Remember |
| --- | --- |
| `key` on the element returned by `map` | Not inside the child component |
| Unique among **siblings**, **stable** across renders | Use data IDs |
| ⚠️ Index as key | Only for static lists (no reorder/insert/delete/filter) |
| ⚠️ `key={Math.random()}` / UUID in render | Remounts every item each render (lost state and focus, slow) |
| `key` isn't a prop | `props.key` is `undefined`: pass `id` separately |
| Changing `key` | Resets the component's state (remount) |

---

## Conditional rendering

```jsx
if (loading) return <Spinner />;                  // early return
{isOpen ? <Open /> : <Closed />}                  // either/or
{error && <Error msg={error} />}                  // something or nothing
{items.length > 0 && <List items={items} />}      // ⚠️ not {items.length && ...} (renders 0)
return null;                                      // render nothing
```

---

## Component patterns

| Pattern | Example | Use for |
| --- | --- | --- |
| `children` | `<Card><p>…</p></Card>` | Wrappers, layouts |
| Slots (JSX props) | `<Layout header={<H />} sidebar={<S />} />` | Several insertion points |
| Lifting state up | State in common parent, pass value + callback | Sibling communication |
| Controlled component | `value` + `onChange` props | Parent owns state |
| Compound components | `<Tabs><Tabs.List/><Tabs.Panel/></Tabs>` with context | Related components sharing state |
| Custom hooks | `useFetch`, `useDebounce` | Reusing stateful logic |
| Render props | `<DataLoader render={(data) => …} />` | Older pattern; hooks usually replace it |
| HOC | `withAuth(Component)` | Older pattern; see [../09-higher-order-components.md](../09-higher-order-components.md) |
| Error boundary | Class with `getDerivedStateFromError` | Catch render errors |

---

## When does a component re-render?

1. Its **state** changes (to a different value by `Object.is`).
2. Its **parent** re-renders (even if props are the same, unless it's wrapped in `memo`).
3. A **context** it reads changes.

Props changing alone doesn't trigger a render; it happens because the parent re-rendered.

---

## Things people commonly forget

1. State updates are **not immediate**: `console.log` after `setX` shows the old value.
2. Use the **updater** form (`setX(prev => ...)`) when the new value depends on the old one.
3. **Never mutate** state: `push`, `sort`, `splice`, `obj.x = …` don't trigger re-renders reliably.
4. `{count && <X />}` renders `0`.
5. `onClick={fn()}` calls the function during render.
6. Effects run **twice** in development StrictMode: write cleanup.
7. Effect callbacks can't be `async`.
8. Missing effect dependencies → stale values; objects/functions as dependencies → effect runs every render.
9. Don't use effects for derived data or for reacting to events.
10. `ref.current` changes don't re-render; DOM refs are `null` during the first render.
11. Keys must be stable and unique among siblings; avoid index keys for dynamic lists.
12. Don't define components inside other components.
13. Hooks can't be conditional or come after an early return.
14. Input values are strings, even for `type="number"`.
15. Initialize controlled inputs with `''`, not `undefined`.
16. Context re-renders every consumer when its value object changes: memoize it.
17. `memo` is useless if you pass new objects/functions every render.
18. `useState(initial)` ignores later changes to `initial`; copying props into state is usually a bug.
19. `<a href>` reloads the page in an SPA: use the router's `<Link>`.
20. Error boundaries don't catch errors in event handlers or async code.
21. Hiding UI for unauthorized users isn't security: the server must check.
