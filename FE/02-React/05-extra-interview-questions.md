# Extra React interview questions, with model answers

These go beyond the "Likely questions" in `02-core-concepts-hooks-performance.md`. They're grouped by difficulty. Practise answering in under 60 seconds.

## Basics (warm-up questions)

**Q: What is JSX? Is it required?**
Syntax sugar that compiles to `jsx('div', props)` calls (`React.createElement` in the old transform). It isn't required, but it's universal. Since React 17's new JSX transform you don't need `import React` in every file.

**Q: What does a React element look like?**
A plain object: `{ type: 'div', props: { className, children }, key, ref }`. Components return elements, and React turns them into fibers and then DOM.

**Q: Props vs state?**
Props are inputs passed from the parent and are read-only. State is memory owned by the component. Both trigger re-renders when they change (props via the parent re-rendering).

**Q: Why must state be immutable?**
React compares old and new state with `Object.is`. Mutating keeps the same reference, so React thinks nothing changed and skips the re-render. Memoization (`React.memo`, deps arrays) also relies on reference changes.

**Q: What is a Fragment and why use it?**
`<>...</>` groups children without adding a DOM node, which keeps the DOM clean and keeps table/flex layouts valid. Use `<Fragment key={id}>` when you need a key in a list.

**Q: How do you conditionally render?**
`&&` (careful with `0`), the ternary, early `return null`, or an object map: `{ loading: <Spinner/>, error: <Error/> }[status]`.

**Q: How does event handling differ from the DOM?**
camelCase names, functions instead of strings, and **synthetic events**: a cross-browser wrapper. Since React 17, listeners are attached to the **root container**, not `document`. Return `false` doesn't prevent default; call `event.preventDefault()`.

**Q: Class component lifecycle → hooks mapping?**
| Class | Hooks |
| --- | --- |
| `constructor` | `useState` initializer |
| `componentDidMount` | `useEffect(() => {...}, [])` |
| `componentDidUpdate` | `useEffect(() => {...}, [deps])` |
| `componentWillUnmount` | cleanup returned from `useEffect` |
| `shouldComponentUpdate` | `React.memo` |
| `getDerivedStateFromError` / `componentDidCatch` | No hook equivalent: still needs a class (or `react-error-boundary`) |

## Intermediate

**Q: What happens when you call `setState`?**
React queues the update and schedules a re-render (batched with other updates in the same tick). On the next render, `useState` returns the new value. The current render's variable doesn't change: **each render is a snapshot**. If the new value is `Object.is` equal to the old one, React may bail out.

**Q: Explain batching with an example.**
```js
const handleClick = () => {
  setCount((previousCount) => previousCount + 1);
  setIsHighlighted((wasHighlighted) => !wasHighlighted);
  // ONE re-render, not two. Since React 18 this also applies inside setTimeout/promises.
};
// Opt out (rarely needed): flushSync(() => setCount(1));
```

- `setCount` / `setIsHighlighted`: two separate pieces of state, updated in one click.
- `previousCount` / `wasHighlighted`: the latest values React passes into each updater function.
- `flushSync`: forces React to apply the update immediately instead of batching it.

**Q: When does `useEffect` run, and in what order with children?**
After the browser paints. Child effects run **before** parent effects (bottom-up), because children commit first. On a re-render: the previous cleanup runs, then the new effect runs.

**Q: What does the dependency array actually compare?**
Each dep with `Object.is` against the previous render. Objects or functions created during render are new every time, so the effect re-runs every render. Fix: move them inside the effect, memoize them, or depend on primitives (`user.id` instead of `user`).

**Q: How do you share logic between components?**
Custom hooks (preferred), then composition (children or slots), then HOCs and render props (legacy, still used in some libraries).

**Q: What is prop drilling and how do you solve it?**
Passing props through components that don't need them. Solutions: **composition** (pass components as `children` so the intermediate layers don't see the data), Context, or a state library.

**Q: When does Context cause performance issues, and how do you fix it?**
Every consumer re-renders when the provider's `value` changes. Fixes:
```tsx
// 1. Memoize the value
const authContextValue = useMemo(() => ({ user, login, logout }), [user, login, logout]);
// 2. Split state and dispatch into two contexts (dispatch never changes)
<TodosStateContext.Provider value={todosState}>
  <TodosDispatchContext.Provider value={dispatch}>…
// 3. Use a store with selectors (Zustand / Redux) for high-frequency updates
```

- `authContextValue`: the object every consumer receives. Without `useMemo` it's a new object each render, so every consumer re-renders.
- `todosState`: the data. It changes often, and only components that *display* it subscribe to it.
- `dispatch`: from `useReducer`. It never changes identity, so components that only *send* actions (like an "Add" button) don't re-render when the data changes.

**Q: `useMemo` vs `useCallback` vs `React.memo`?**
`useMemo(() => compute(), deps)` caches a **value**. `useCallback(fn, deps)` caches a **function** (it's `useMemo(() => fn, deps)`). `React.memo(Component)` skips re-rendering a **component** if its props are shallowly equal. They only help together: `useCallback` is pointless unless the receiver is memoized or uses the function as a dep.

**Q: When should you NOT memoize?**
For cheap calculations, or for components that re-render with new props anyway. Memoization has a cost (memory plus comparing deps) and adds complexity. Measure first. The React Compiler is making manual memoization less necessary.

**Q: Controlled component: how do you handle many inputs?**
One state object and one handler with `name`: `setFormValues(previousValues => ({ ...previousValues, [event.target.name]: event.target.value }))`. Here `event.target.name` is the input's `name` attribute (`"email"`), used as a computed key, so one handler updates whichever field changed. For big forms, use React Hook Form (uncontrolled plus refs, so fewer re-renders).

**Q: What is `key` beyond lists?**
A way to **reset** a component. `<Profile key={userId} />` remounts with fresh state when `userId` changes, which is cleaner than an effect that resets state.

**Q: How do refs differ from state? Give 3 uses for refs.**
Updating a ref doesn't re-render, and the value persists across renders. Uses: DOM access (focus, measure, scroll), storing timer or interval IDs, keeping the latest value or callback to avoid stale closures, and holding previous values.

**Q: `forwardRef`: why, and what changed in React 19?**
Function components didn't receive `ref` as a prop, so `forwardRef` was needed to pass a ref down to a DOM node. In React 19, `ref` is a regular prop: `function Input({ ref, ...props }) { return <input ref={ref} {...props} /> }`.

**Q: What are portals and how do events behave?**
`createPortal(child, domNode)` renders outside the parent DOM hierarchy (modals, tooltips, to escape `overflow: hidden` or `z-index`). Events **bubble through the React tree**, not the DOM tree, so a click in the modal reaches the React parent's `onClick`.

**Q: How do you handle errors in event handlers, since error boundaries don't catch them?**
`try/catch` in the handler, then set error state, or rethrow during render: `const [, setState] = useState(); setState(() => { throw error; })`. That pushes the error into the nearest boundary (`react-error-boundary`'s `showBoundary` does this).

## Advanced

**Q: Explain reconciliation and the diffing heuristics.**
Comparing full trees would be O(n³). React uses an O(n) heuristic: (1) elements of **different types** produce different trees, so React unmounts and rebuilds; (2) **keys** match children across renders. Same type: keep the DOM node or instance and update the props.

**Q: What is Fiber?**
React's reconciler (since v16). Each element becomes a fiber node, a unit of work linked as a tree (child/sibling/return pointers). React can **pause, resume, prioritise and discard** work, which enables time-slicing, Suspense and transitions. It double-buffers: the `current` tree and the `workInProgress` tree.

**Q: What is concurrent rendering?**
Rendering is interruptible. React can prepare a new UI in the background while keeping the current one interactive, and it abandons stale renders. You opt in through features: `startTransition`, `useDeferredValue`, Suspense.

**Q: `useTransition` vs `useDeferredValue`?**
```tsx
// useTransition: you control the state update
const [isPending, startTransition] = useTransition();
const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
  setInputText(event.target.value);                         // urgent: the input stays snappy
  startTransition(() => setFilterText(event.target.value)); // non-urgent: heavy list can lag
};

// useDeferredValue: you only receive the value (e.g. via props)
const deferredQuery = useDeferredValue(query);
const filteredResults = useMemo(() => filterLargeList(allItems, deferredQuery), [allItems, deferredQuery]);
const isShowingOldResults = query !== deferredQuery;
```

- `inputText`: what the text box shows, updated immediately.
- `filterText`: what the heavy list filters by, updated at low priority.
- `isPending`: `true` while the low-priority render hasn't finished.
- `query` / `deferredQuery`: the latest value, and a copy that's allowed to lag behind it.
- `filteredResults`: recomputed only when `deferredQuery` changes, not on every keystroke.
- `isShowingOldResults`: `true` while the list still reflects an older query. Use it to dim the list.
Neither one debounces. They render at lower priority and get interrupted when new input arrives.

**Q: How does Suspense work?**
A component "suspends" by throwing a promise (or calling `use(promise)`). The nearest `<Suspense fallback>` shows the fallback until the promise resolves, then React retries rendering. It's used for `React.lazy`, data libraries (`useSuspenseQuery`) and streaming SSR.

**Q: What are React Server Components?**
Components that run **only on the server** (at build or request time). They can be `async`, can access the DB or file system directly, and send **zero JS** to the client. They can't use state, effects or browser APIs. Interactive parts are marked `'use client'`. Server Actions (`'use server'`) are functions the client can call, like an RPC, typically for form submissions.

**Q: SSR vs SSG vs CSR vs ISR vs RSC?**
| | When HTML is built | Pros | Cons |
| --- | --- | --- | --- |
| CSR | In the browser | Simple hosting, rich interactivity | Slow first paint, weaker SEO |
| SSR | Per request on the server | Fast FCP, SEO, fresh data | Server cost, TTFB, hydration cost |
| SSG | At build time | Fastest, CDN-cacheable | Stale until rebuild |
| ISR | SSG + background re-generation | SSG speed + freshness | Framework-specific |
| RSC | Server, component-level | Less client JS | New mental model, framework needed |

**Q: What is hydration and what is a hydration mismatch?**
Hydration means React attaches event listeners and state to server-rendered HTML instead of recreating it. A mismatch happens when the client's first render differs from the server HTML (`Date.now()`, `Math.random()`, `window` checks, locale formatting). Fix: render the same thing on both, then update in `useEffect`, or use `useSyncExternalStore` with a server snapshot. `suppressHydrationWarning` is for unavoidable text differences.

**Q: What's new in React 19? (one sentence each)**
- **Actions**: async functions in transitions, with automatic pending, error and optimistic handling. `<form action={fn}>`.
- **`useActionState`**: `[state, formAction, isPending]` for form actions.
- **`useFormStatus`**: a child reads its parent form's pending state (no prop drilling).
- **`useOptimistic`**: shows an optimistic value while the action runs, and reverts automatically on error.
- **`use()`**: reads a promise (suspends) or context, and may be called conditionally.
- **`ref` as a prop**, so `forwardRef` is no longer needed. Ref callbacks can return a cleanup.
- **`<Context>` as provider** directly (`<ThemeContext value="dark">`).
- **Document metadata**: `<title>`, `<meta>` and `<link>` anywhere get hoisted to `<head>`.
- Better hydration error messages, stylesheet precedence, and preloading APIs (`preload`, `preinit`).

```tsx
// useOptimistic example
function LikeButton({ likeCount, saveLike }: { likeCount: number; saveLike: () => Promise<void> }) {
  const [optimisticLikeCount, addOptimisticLikes] = useOptimistic(
    likeCount,
    (currentCount, increment: number) => currentCount + increment,
  );
  return (
    <form action={async () => { addOptimisticLikes(1); await saveLike(); }}>
      <button>❤️ {optimisticLikeCount}</button>
    </form>
  );
}
```

- `likeCount`: the real count from the server.
- `saveLike`: the async call that records the like.
- `optimisticLikeCount`: what's displayed. It's `likeCount + 1` while saving, then the real `likeCount` again when the action ends.
- `addOptimisticLikes(1)`: applies the updater `(currentCount, increment) => currentCount + increment` right away.

**Q: What is the React Compiler?**
A build-time Babel plugin that automatically memoizes components and values, so most `useMemo`, `useCallback` and `React.memo` become unnecessary. It requires code that follows the Rules of React (pure renders, no mutation of props or state).

**Q: How would you optimise a list of 10,000 rows?**
Virtualization (TanStack Virtual or react-window) renders only the visible rows. Add memoized row components with stable callbacks, pagination or infinite loading instead of fetching everything, and `useDeferredValue` for filtering.

**Q: How do you find why a component re-renders?**
React DevTools Profiler ("Highlight updates when components render", plus "Why did this render?" in the profiler settings). The `why-did-you-render` library works too. Then check for parent renders, context value identity, and inline objects or functions passed as props.

**Q: Explain `useLayoutEffect` with a real use case.**
Measuring a tooltip's size and repositioning it **before paint**, so the user never sees it jump. It runs synchronously after DOM mutations and blocks paint. On the server it does nothing and warns, so use `useEffect` or an isomorphic layout effect there.

**Q: `useImperativeHandle` example?**
```tsx
type PlayerControls = { play: () => void; pause: () => void };

function VideoPlayer({ ref, videoUrl }: { ref: React.Ref<PlayerControls>; videoUrl: string }) {
  const videoElementRef = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => ({
    play: () => videoElementRef.current?.play(),
    pause: () => videoElementRef.current?.pause(),
  }), []);
  return <video ref={videoElementRef} src={videoUrl} />;
}

// Parent
const playerControlsRef = useRef<PlayerControls>(null);
<VideoPlayer ref={playerControlsRef} videoUrl="/intro.mp4" />
<button onClick={() => playerControlsRef.current?.play()}>Play</button>
```

- `PlayerControls`: the small API the parent is allowed to use.
- `ref` (prop): the parent's ref. `useImperativeHandle` decides what the parent sees in `ref.current`.
- `videoElementRef`: this component's private ref to the real `<video>` element.
- `playerControlsRef`: in the parent, it holds `{ play, pause }`, *not* the raw DOM node, so the parent can't mess with the video in other ways.

**Q: What is the "lifting content up" (children) optimisation?**
```tsx
// Slow: ExpensiveTree re-renders on every mouse move
function App() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  return (
    <div onMouseMove={(event) => setMousePosition({ x: event.clientX, y: event.clientY })}>
      <ExpensiveTree />
    </div>
  );
}

// Fast: ExpensiveTree is created by the parent, so its element reference is stable
function MouseTracker({ children }: { children: React.ReactNode }) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  return (
    <div onMouseMove={(event) => setMousePosition({ x: event.clientX, y: event.clientY })}>
      {children}
    </div>
  );
}
<MouseTracker><ExpensiveTree /></MouseTracker>;
```

- `mousePosition`: the cursor's `{ x, y }`, which changes many times per second.
- `event.clientX` / `event.clientY`: the cursor position relative to the browser window.
- `children`: the `<ExpensiveTree />` element, created by whoever renders `MouseTracker`. When `MouseTracker` re-renders, `children` is the same object as before, so React skips re-rendering `ExpensiveTree`.

**Q: How do you manage state in a large app? (architecture answer)**
- **Server state** → TanStack Query (caching, sync).
- **URL state** (filters, pagination, tabs) → the router's search params, which makes views shareable and bookmarkable.
- **Form state** → React Hook Form.
- **Global client state** (theme, auth user, UI prefs) → Context (low-frequency) or Zustand/Redux Toolkit (high-frequency).
- **Local UI state** → `useState`, colocated.

**Q: Redux Toolkit vs Zustand vs Context?**
Context is built in, but has no selectors (every consumer re-renders). Zustand is tiny, hook-based, uses selectors, has no providers, and is minimal. Redux Toolkit is opinionated, with DevTools time travel, middleware and RTK Query, and suits large teams that need strict patterns.

**Q: How do you secure a React app?**
React escapes JSX output by default (XSS-safe), but `dangerouslySetInnerHTML` needs sanitizing (DOMPurify). Watch out for `href={userInput}` (a `javascript:` URL). Keep tokens in HttpOnly cookies and protect against CSRF. Never put secrets in env variables shipped to the client. Add a CSP header and keep dependencies audited.

**Q: How do you make React apps accessible?**
Semantic HTML first (`button`, not `div onClick`), labels for inputs, `alt` text, keyboard navigation, focus management for modals and route changes, ARIA only when semantics aren't enough, colour contrast, `aria-live` for async updates. Test with eslint-plugin-jsx-a11y, axe and a screen reader.

## Scenario questions

**Q: A page is slow when typing in a search box. Walk me through it.**
1. Profile with React DevTools to see what renders and how long it takes.
2. If the whole page re-renders, move the input state down into its own component.
3. If the list filtering is heavy, use `useMemo` plus `useDeferredValue` or `useTransition`.
4. If the list is long, virtualize it.
5. If each keystroke fetches, debounce and cancel stale requests (or let TanStack Query handle it).

**Q: A user sees another user's data briefly after switching profiles. Why?**
A race condition or stale state: the old request resolved after the new one, or the state wasn't reset. Fix: abort in the cleanup or use an ignore flag, include the id in the query key, and reset with `key={userId}`.

**Q: Your effect runs twice in development. Is it a bug?**
That's Strict Mode intentionally mounting, unmounting and remounting to test cleanup. Production runs it once. If running twice breaks something, the effect is missing its cleanup (or should be an event handler instead).

**Q: How would you structure folders in a large React app?**
Feature-based (`features/auth/{components,hooks,api,types}.ts`) over type-based (`components/`, `hooks/`). Shared UI goes in `components/ui`, cross-cutting helpers in `lib/`, and routes in `app/` or `pages/`. Each feature exposes a public `index.ts`.
