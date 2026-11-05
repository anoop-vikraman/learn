# Core concepts

- **Rendering model:** a re-render happens when state changes, when the parent re-renders, or when a consumed context changes. Props changing is not itself a trigger: the parent re-rendering is. Each render is a snapshot: state and props are constant inside it.
- **Render vs commit:** in the render phase React calls your components and diffs the results (it must be pure). In the commit phase it updates the DOM, then runs `useLayoutEffect`, paints, then runs `useEffect`.
- **Reconciliation:** React compares element type and `key`. A different type unmounts the whole subtree. Keys identify list items across renders.
- **Fiber:** the internal architecture that splits rendering into interruptible units. This is what makes concurrent features (`useTransition`, Suspense) possible.
- **Controlled vs uncontrolled inputs:** controlled means React state drives `value`; uncontrolled means the DOM holds the value and you read it via `ref` or `FormData`.
- **Lifting state up vs Context vs external store:** colocate state first, lift it when siblings need it, and use Context for low-frequency global values (theme, auth). Use Zustand, Redux Toolkit or Jotai for frequently changing shared client state, and TanStack Query for server state.
- **Strict Mode (dev only):** double-invokes renders and mounts, unmounts and remounts effects, to expose impure code and missing cleanups.

### Hooks cheat sheet

| Hook | Use for | Key point |
| --- | --- | --- |
| `useState` | Local state | Use the functional update `setX(prev => prev + 1)` when the next value depends on the previous one |
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

### React 18/19 features worth naming

- Automatic batching (18): all state updates are batched, including ones inside promises and timeouts.
- `createRoot`, concurrent rendering, Suspense for data fetching, streaming SSR.
- React 19: Actions, `useActionState`, `useFormStatus`, `useOptimistic`, the `use()` hook (read a promise or context, and it may be called conditionally), `ref` as a prop, document metadata tags, Server Components and Server Actions (via frameworks like Next.js).
- React Compiler: automatic memoization at build time, which reduces the need for manual `useMemo`/`useCallback`.

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
- `useEffect` vs `useLayoutEffect`?
- How would you fetch data in an effect safely? (Use an AbortController or an ignore flag in the cleanup.)
- What are error boundaries? (Class components with `getDerivedStateFromError`/`componentDidCatch`. They don't catch errors in event handlers, async code or SSR.)
- What are portals for? (Modals and tooltips: rendering outside the parent DOM, while events still bubble through the React tree.)
- What is a HOC vs a custom hook vs render props?
- SSR vs CSR vs SSG vs RSC?

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

