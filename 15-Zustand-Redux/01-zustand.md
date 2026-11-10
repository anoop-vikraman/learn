# Zustand: how to use it and the core concepts

> Zustand ("state" in German) is a small (~1 KB) state-management library for React. A store is a hook. There are no providers, actions, reducers or boilerplate. Examples use **Zustand v5** with TypeScript.

```bash
npm install zustand
```

---

## Key terms at a glance

| Term | What it means |
| --- | --- |
| **Store** | One object holding state **and** the functions that change it. Created with `create()`, which returns a hook. |
| **State** | The data in the store (`count`, `user`, `items`). |
| **Action** | Just a function inside the store that calls `set` (`inc`, `addTodo`). Not an object with a `type` like in Redux. |
| **`set`** | Updates the store. Shallow-merges the object you pass into the current state and notifies subscribers. |
| **`get`** | Reads the current state from inside an action. |
| **Selector** | The function you pass to the hook (`s => s.count`) to pick part of the state. The component re-renders only when that part changes. |
| **`useShallow`** | Wraps a selector that returns an object/array so it is compared key by key instead of by reference. |
| **Subscribe** | Registering a listener that runs on every state change. Used by React under the hood, or by you outside React. |
| **`getState` / `setState`** | Read / write the store **outside** React components (interceptors, sockets, tests). |
| **Middleware** | A wrapper around the store creator that adds features: `persist`, `devtools`, `immer`, `subscribeWithSelector`. |
| **`persist`** | Middleware that saves (some of) the state to localStorage/sessionStorage and loads it back on page load. |
| **`devtools`** | Middleware that connects the store to the Redux DevTools browser extension. |
| **`immer`** | Middleware that lets you write `state.x = y` style updates while keeping state immutable. |
| **Slice** | A piece of one big store (e.g. auth part, UI part) written in its own function and combined into one store. |
| **Vanilla store** | A store created with `createStore` from `zustand/vanilla`: no React, usable anywhere, connected with `useStore` when needed. |
| **Hydration** | Loading persisted state back into the store (or matching server-rendered HTML on the client in SSR). |

---

## 1. The mental model

> **In short:** The store is a hook that lives outside React. Components pick the part they need with a selector and re-render only when that part changes.

- A **store** is an object holding **state + the functions that change it**.
- `create()` returns a **hook**. Components call it with a **selector** to pick the part they need.
- A component **re-renders only when the value its selector returns changes** (compared with `Object.is`).
- The store lives **outside React** (module scope), so you can also read and update it from plain JS: Axios interceptors, WebSocket handlers, utilities.

```
            ┌──────────────── store (outside React) ─────────────────┐
            │  state: { count, user, ... }   actions: { inc, ... }   │
            └───────────────▲──────────────────────────┬─────────────┘
                 set(...)   │                          │ notifies subscribers
                            │                          ▼
   button onClick ── inc() ─┘          useStore(s => s.count) re-renders only if count changed
```

---

## 2. Your first store

> **In short:** Call `create()` with a function that returns initial state plus actions. You get a hook you can use in any component, with no Provider.

```ts
// stores/counterStore.ts
import { create } from 'zustand';

interface CounterState {
  count: number;
  inc: () => void;
  dec: () => void;
  incBy: (n: number) => void;
  reset: () => void;
}

export const useCounterStore = create<CounterState>()((set) => ({
  count: 0,
  inc: () => set((state) => ({ count: state.count + 1 })),   // based on previous state
  dec: () => set((state) => ({ count: state.count - 1 })),
  incBy: (n) => set((state) => ({ count: state.count + n })),
  reset: () => set({ count: 0 }),                             // plain object is fine too
}));
```

```tsx
function Counter() {
  const count = useCounterStore((s) => s.count);
  const inc = useCounterStore((s) => s.inc);
  return <button onClick={inc}>Clicked {count} times</button>;
}

function ResetButton() {
  const reset = useCounterStore((s) => s.reset);   // never re-renders when count changes
  return <button onClick={reset}>Reset</button>;
}
```

**Notes**
- `create<T>()(...)` has **two calls** in TypeScript. This "curried" form is needed so TS can infer the middleware types. Just remember the pattern.
- `set` **merges shallowly** at the top level: `set({ count: 0 })` keeps the other keys. Nested objects are **not** merged (see section 4).
- No `<Provider>` is needed anywhere.

---

## 3. Selectors and re-renders (the most important concept)

> **In short:** A **selector** picks part of the state. Return one value per call, or use `useShallow` when you need several, otherwise the component re-renders too often or loops forever.

```ts
// ✅ Picks one value: re-renders only when count changes
const count = useCounterStore((s) => s.count);

// ⚠️ No selector: subscribes to the WHOLE store, re-renders on any change
const { count, inc } = useCounterStore();

// ❌ Returns a NEW object every time → always "changed"
//    In v5 this causes "Maximum update depth exceeded" (infinite loop)
const { count, inc } = useCounterStore((s) => ({ count: s.count, inc: s.inc }));
```

To select several values at once, use **`useShallow`**. It compares the result's keys/items shallowly:

```ts
import { useShallow } from 'zustand/react/shallow';

const { count, inc } = useCounterStore(
  useShallow((s) => ({ count: s.count, inc: s.inc }))
);

const [count, inc] = useCounterStore(useShallow((s) => [s.count, s.inc]));
```

**Derived values:** compute them in the selector. Returning a primitive is always safe:

```ts
const total = useCartStore((s) => s.items.reduce((sum, i) => sum + i.price * i.qty, 0));
const itemCount = useCartStore((s) => s.items.length);
```

⚠️ A selector that returns a **new array** (`s.items.filter(...)`) has the same problem as returning a new object: in v5 it can loop forever. Wrap it in `useShallow`, or select the raw array and derive with `useMemo` in the component:

```ts
const items = useCartStore((s) => s.items);                        // stable reference
const expensive = useMemo(() => items.filter((i) => i.price > 1000), [items]);
```

**Tip: auto-generated selectors / custom hooks.** Many teams export small hooks so components never subscribe to the whole store:

```ts
export const useCount = () => useCounterStore((s) => s.count);
export const useCounterActions = () => useCounterStore(useShallow((s) => ({ inc: s.inc, reset: s.reset })));
```

---

## 4. Updating state: `set` and `get`

> **In short:** `set` changes state (shallow merge, must be immutable) and `get` reads the current state inside actions.

```ts
interface TodoState {
  todos: Todo[];
  filter: 'all' | 'done' | 'open';
  addTodo: (title: string) => void;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  setFilter: (f: TodoState['filter']) => void;
  openCount: () => number;
}

export const useTodoStore = create<TodoState>()((set, get) => ({
  todos: [],
  filter: 'all',

  addTodo: (title) =>
    set((s) => ({ todos: [...s.todos, { id: crypto.randomUUID(), title, done: false }] })),

  toggle: (id) =>
    set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),

  remove: (id) => set((s) => ({ todos: s.todos.filter((t) => t.id !== id) })),

  setFilter: (filter) => set({ filter }),

  openCount: () => get().todos.filter((t) => !t.done).length,   // get() reads current state
}));
```

**Rules**
- **Never mutate.** `s.todos.push(x); return s` will not trigger re-renders, because the reference didn't change.
- **Nested objects** must be spread by hand:

```ts
set((s) => ({ user: { ...s.user, address: { ...s.user.address, city: 'Kochi' } } }));
```

  ...or use the `immer` middleware (section 7).
- `set(newState, true)` **replaces** the whole state instead of merging. Rarely needed, and it removes the actions too unless you include them.

---

## 5. Async actions

> **In short:** Actions can simply be `async` functions that call `set` before and after `await`. Use TanStack Query instead for server data.

There is nothing special: actions can be `async` and call `set` whenever they want.

```ts
interface VendorState {
  vendors: Vendor[];
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  fetchVendors: () => Promise<void>;
}

export const useVendorStore = create<VendorState>()((set) => ({
  vendors: [],
  status: 'idle',
  error: null,
  fetchVendors: async () => {
    set({ status: 'loading', error: null });
    try {
      const { data } = await api.get<Vendor[]>('/vendors');
      set({ vendors: data, status: 'success' });
    } catch (e) {
      set({ status: 'error', error: (e as Error).message });
    }
  },
}));
```

```tsx
function VendorList() {
  const { vendors, status, fetchVendors } = useVendorStore(
    useShallow((s) => ({ vendors: s.vendors, status: s.status, fetchVendors: s.fetchVendors }))
  );
  useEffect(() => { fetchVendors(); }, [fetchVendors]);   // actions are stable references

  if (status === 'loading') return <Spinner />;
  return <ul>{vendors.map((v) => <li key={v.id}>{v.name}</li>)}</ul>;
}
```

> **Interview point:** this works, but for **server data** prefer **TanStack Query** (caching, dedup, refetching, retries). Use Zustand for **client state**: auth/user, UI, filters, wizard steps, cart.

---

## 6. Using the store outside React

> **In short:** Every store hook has `getState`, `setState` and `subscribe`, so plain JS code (interceptors, sockets) can read and update the store.

Every store hook also has `getState`, `setState` and `subscribe`:

```ts
// Axios interceptor: read the token without a hook
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Logout from a 401 handler
useAuthStore.getState().logout();

// Update from a WebSocket
socket.on('notification', (n) =>
  useNotificationStore.setState((s) => ({ items: [n, ...s.items] })));

// Listen to changes (returns an unsubscribe function)
const unsub = useCounterStore.subscribe((state, prev) => {
  if (state.count !== prev.count) console.log('count changed', prev.count, '→', state.count);
});
```

**Vanilla store** (no React at all, e.g. shared with non-React code):

```ts
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

export const counterStore = createStore<CounterState>()((set) => ({ /* ... */ }));
const count = useStore(counterStore, (s) => s.count);   // use it in React when needed
```

---

## 7. Middleware

> **In short:** **Middleware** wraps the store to add features like persistence, DevTools and Immer, without changing how you use the store.

Middleware wraps the store creator. Order matters: **`devtools` should be the outermost**.

### persist: save to localStorage

> **In short:** **persist** saves the chosen keys to storage and restores them on reload.

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'light',
      sidebarOpen: true,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    {
      name: 'settings',                                   // localStorage key
      storage: createJSONStorage(() => localStorage),     // or sessionStorage
      partialize: (s) => ({ theme: s.theme }),            // only persist some keys
      version: 1,                                         // bump + migrate when shape changes
      migrate: (persisted, version) => persisted as SettingsState,
    }
  )
);
```

⚠️ Don't persist **tokens** in localStorage if you can avoid it (XSS risk). ⚠️ With SSR (Next.js), persisted state only exists on the client, so watch for hydration mismatches (`skipHydration` + `persist.rehydrate()`).

### devtools: Redux DevTools support

> **In short:** **devtools** lets you inspect state changes in the Redux DevTools extension.

```ts
import { devtools } from 'zustand/middleware';

export const useTodoStore = create<TodoState>()(
  devtools(
    (set) => ({
      todos: [],
      addTodo: (title) =>
        set((s) => ({ todos: [...s.todos, newTodo(title)] }), undefined, 'todos/add'), // action name
    }),
    { name: 'TodoStore' }
  )
);
```

### immer: write "mutating" code safely

> **In short:** **immer** lets you write direct assignments (`state.a.b = 1`); Immer turns them into immutable updates.

```bash
npm install immer
```

```ts
import { immer } from 'zustand/middleware/immer';

export const useUserStore = create<UserState>()(
  immer((set) => ({
    user: { name: '', address: { city: '' } },
    setCity: (city) =>
      set((state) => {
        state.user.address.city = city;    // immer makes this an immutable update
      }),
  }))
);
```

### Combining them

> **In short:** Middleware nest inside each other. Put `devtools` on the outside.

```ts
export const useStore = create<State>()(
  devtools(
    persist(
      immer((set) => ({ /* ... */ })),
      { name: 'app' }
    ),
    { name: 'AppStore' }
  )
);
```

---

## 8. Organizing a bigger app

> **In short:** Either use several small stores per domain, or build one store from **slices**.

### Option A: several small stores (recommended default)

> **In short:** One store per domain (auth, UI, filters). This is simple and decoupled.

```
stores/
  authStore.ts      # user, token, roles, login/logout
  uiStore.ts        # sidebar, theme, modals
  filtersStore.ts   # list filters shared across pages
```

Small stores are easy to read and test, and a component only subscribes to what it uses.

### Option B: one store built from slices

> **In short:** A **slice** is a function that creates one part of the store. The slices are spread together into a single store, and they can read and update each other.

```ts
import { create, StateCreator } from 'zustand';

interface AuthSlice { user: User | null; login: (u: User) => void; logout: () => void }
interface UiSlice   { sidebarOpen: boolean; toggleSidebar: () => void }
type AppState = AuthSlice & UiSlice;

const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set) => ({
  user: null,
  login: (user) => set({ user }),
  logout: () => set({ user: null, sidebarOpen: false }),   // a slice can touch other slices
});

const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
});

export const useAppStore = create<AppState>()((...a) => ({
  ...createAuthSlice(...a),
  ...createUiSlice(...a),
}));
```

### Separating actions from state

> **In short:** Group actions under one `actions` key so components can select all of them once, without re-renders.

Actions never change, so some teams group them under one key that components can select once:

```ts
const useBearStore = create<BearState>()((set) => ({
  bears: 0,
  actions: {
    increase: () => set((s) => ({ bears: s.bears + 1 })),
    reset: () => set({ bears: 0 }),
  },
}));
export const useBearActions = () => useBearStore((s) => s.actions);  // stable, no re-renders
```

---

## 9. Store per component tree (Context + store)

> **In short:** Create the store inside a Provider when you need **separate instances** (reusable widgets, SSR, isolated tests) instead of one global store.

A module-level store is a **singleton**. When you need **separate instances** (e.g. two independent editors on one page, per-request stores in SSR, or isolated tests), create the store inside a provider:

```tsx
import { createStore, useStore } from 'zustand';

type EditorStore = ReturnType<typeof createEditorStore>;
const createEditorStore = (initialText: string) =>
  createStore<EditorState>()((set) => ({
    text: initialText,
    setText: (text) => set({ text }),
  }));

const EditorContext = createContext<EditorStore | null>(null);

export function EditorProvider({ initialText, children }: PropsWithChildren<{ initialText: string }>) {
  const [store] = useState(() => createEditorStore(initialText));   // created once per provider
  return <EditorContext.Provider value={store}>{children}</EditorContext.Provider>;
}

export function useEditor<T>(selector: (s: EditorState) => T) {
  const store = useContext(EditorContext);
  if (!store) throw new Error('useEditor must be used inside EditorProvider');
  return useStore(store, selector);
}
```

The context passes the **store reference** (which never changes), so this does **not** have Context's re-render problem. Selectors still decide re-renders.

---

## 10. Testing

> **In short:** The store is a global singleton, so reset it before each test with `setState(initial, true)`, then call actions and check the state or the UI.

**Reset the store between tests.** Because the store is a singleton, state leaks from one test to the next otherwise.

```ts
// Save initial state once, restore before each test
const initial = useCounterStore.getState();
beforeEach(() => useCounterStore.setState(initial, true));

test('inc increases count', () => {
  useCounterStore.getState().inc();
  expect(useCounterStore.getState().count).toBe(1);
});

test('Counter component', async () => {
  render(<Counter />);
  await userEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('button')).toHaveTextContent('Clicked 1 times');
});

// Start a test in a specific state
test('shows open todos', () => {
  useTodoStore.setState({ todos: [{ id: '1', title: 'Write tests', done: false }] });
  render(<TodoList />);
  expect(screen.getByText('Write tests')).toBeInTheDocument();
});
```

*(The Zustand docs also describe a `__mocks__/zustand.ts` file that resets every store automatically after each test.)*

---

## 11. Common mistakes

> **In short:** Most bugs come from bad selectors, mutating state, or keeping server data in the store.

| Mistake | Problem | Fix |
| --- | --- | --- |
| `useStore()` with no selector | Re-renders on every change | Select only what you need |
| Selector returns a new object/array | Infinite loop in v5 / extra re-renders | `useShallow` or separate selectors |
| Mutating state (`s.todos.push`) | No re-render | Return new objects, or use `immer` |
| Forgetting to spread nested objects | Nested data lost | Spread every level, or `immer` |
| Server data in Zustand | Re-inventing caching, refetch, stale data | TanStack Query |
| Singleton store with SSR | State shared across users' requests | Store per request via Context (section 9) |
| No reset in tests | Tests depend on each other | `setState(initial, true)` in `beforeEach` |
| `devtools` not outermost | DevTools miss actions / type errors | `devtools(persist(immer(...)))` |

---

## 12. Interview questions

<details>
<summary>What is Zustand and why would you choose it?</summary>

A small hook-based state library. Choose it for **global client state** when Context causes too many re-renders and Redux feels too heavy: no provider, almost no boilerplate, selective subscriptions via selectors, usable outside React, good TypeScript support, and optional middleware (persist, devtools, immer).

</details>

<details>
<summary>How does Zustand avoid unnecessary re-renders?</summary>

Each component subscribes with a selector. When the store changes, Zustand runs the selector and compares the new result with the previous one using `Object.is`. The component re-renders only if the result changed. Internally it uses React's `useSyncExternalStore`, which also keeps it safe with concurrent rendering (no "tearing").

</details>

<details>
<summary>Why is Context not a state manager? Why can Zustand replace it?</summary>

Context is a **dependency-injection** tool: when its value changes, **every consumer re-renders**, and you can't subscribe to part of it. Splitting contexts and memoizing helps, but it gets messy. Zustand lets each component subscribe to a slice. Context is still fine for values that rarely change (theme, locale, current user).

</details>

<details>
<summary>Why does <code>useStore(s => ({ a: s.a, b: s.b }))</code> cause problems?</summary>

The selector returns a new object every time, so `Object.is` says it changed on every check, so the component re-renders on every store update. In v5 it can loop forever ("Maximum update depth exceeded"). Fix with `useShallow`, or call the hook twice with primitive selectors.

</details>

<details>
<summary>How do you persist Zustand state? What should not be persisted?</summary>

The `persist` middleware with `name`, `storage`, `partialize` (choose keys), and `version` + `migrate` for shape changes. Don't persist tokens/secrets (XSS can read localStorage), large server data (use TanStack Query's cache), or transient UI state like open modals.

</details>

<details>
<summary>How do you access the store outside a component?</summary>

`useStore.getState()`, `useStore.setState()`, `useStore.subscribe()`. Common in Axios interceptors (token), WebSocket handlers and logout on 401.

</details>

<details>
<summary>How do you structure Zustand in a large app?</summary>

Multiple small domain stores (auth, UI, filters), or one store composed from **slices** with `StateCreator`. Export custom hooks with selectors so components don't subscribe to the whole store. Keep server state in TanStack Query.

</details>

<details>
<summary>When would you use the Context + <code>createStore</code> pattern?</summary>

When you need **more than one instance** of the store: reusable components with their own state (two independent editors), SSR (a fresh store per request so users don't share state), or tests that need isolation. The context passes the store reference, so it doesn't cause Context re-renders.

</details>

---

## 13. More interview questions (deeper follow-ups)

<details>
<summary>What is <code>useSyncExternalStore</code>, and what is "tearing"?</summary>

`useSyncExternalStore(subscribe, getSnapshot)` is the React 18 hook for reading from a store that lives **outside React**. Zustand and React-Redux are built on it.

**Tearing:** with concurrent rendering, React can pause a render halfway. If an external store changes during that pause, some components could render with the old value and others with the new one, so the UI "tears" into inconsistent pieces. `useSyncExternalStore` prevents this by forcing a consistent snapshot for the whole render.

</details>

<details>
<summary>How does <code>set</code> merge state? What does <code>set(state, true)</code> do?</summary>

`set` does a **shallow merge** at the top level only, like `Object.assign({}, state, partial)`. `set({ count: 1 })` keeps all other keys, but `set({ user: { name: 'A' } })` **replaces** the whole `user` object, so nested keys are lost unless you spread them.

`set(newState, true)` **replaces** the whole state with no merge. If `newState` doesn't include the actions, they disappear. It's mainly used to reset a store in tests.

</details>

<details>
<summary>How do you reset a Zustand store (e.g. on logout)?</summary>

Keep the initial state in a constant and add a `reset` action:

```ts
const initialState = { items: [], filter: 'all' as const };

export const useTodoStore = create<TodoState>()((set) => ({
  ...initialState,
  addTodo: (title) => set((s) => ({ items: [...s.items, newTodo(title)] })),
  reset: () => set(initialState),      // merge keeps the actions
}));

// logout: reset every store
function logout() {
  useAuthStore.getState().reset();
  useTodoStore.getState().reset();
  useCartStore.getState().reset();
}
```

With `persist`, also call `useCartStore.persist.clearStorage()` if the saved copy should go too.

</details>

<details>
<summary>Do actions cause re-renders when you select them? Why are they stable?</summary>

No. Actions are created **once** when the store is created and are never replaced (unless you `set` them yourself), so `useStore(s => s.inc)` always returns the same function reference and never triggers a re-render. That also makes them safe to put in `useEffect` dependency arrays.

</details>

<details>
<summary>What are "transient updates", and when would you use them?</summary>

Reading frequently-changing state **without re-rendering**, e.g. a mouse position or scroll value driving an animation at 60 fps. Subscribe in an effect and write to a ref or the DOM directly:

```ts
const posRef = useRef(useMouseStore.getState().pos);
useEffect(() => useMouseStore.subscribe((s) => { posRef.current = s.pos; }), []);  // returns unsubscribe
```

The component never re-renders; the animation loop reads `posRef.current`.

</details>

<details>
<summary>What does the <code>subscribeWithSelector</code> middleware add?</summary>

Plain `subscribe` calls your listener on **every** change. `subscribeWithSelector` lets you subscribe to **one slice**, getting the new and previous values, with optional custom equality:

```ts
const useStore = create<State>()(subscribeWithSelector((set) => ({ /* ... */ })));

const unsub = useStore.subscribe(
  (s) => s.theme,
  (theme, prevTheme) => document.documentElement.dataset.theme = theme,
  { fireImmediately: true }
);
```

</details>

<details>
<summary>Why does TypeScript need <code>create&lt;T&gt;()(...)</code> with two calls?</summary>

TypeScript can't partly infer generics: if you pass `T` explicitly, it can't also infer the middleware types. The first call fixes `T`, and the second call lets TS infer everything else (the middleware's mutated types, e.g. `persist` adding `.persist` to the hook). It's a workaround for a TS limitation, not a runtime feature.

</details>

<details>
<summary>How do you use Zustand with Next.js / SSR safely?</summary>

1. **Don't use a module-level store for per-user data on the server.** The module is shared across requests, so one user could see another user's state. Create the store **per request** inside a provider (Context + `createStore`, section 9).
2. **Hydration with `persist`:** localStorage only exists on the client, so the server renders the default state and the client renders the saved state, causing a hydration mismatch. Use `skipHydration: true` and call `useStore.persist.rehydrate()` in an effect, or render persisted values only after mount.
3. Client components only: Zustand hooks can't be used in React Server Components.

</details>

<details>
<summary>How does Zustand compare with Jotai and Recoil?</summary>

- **Zustand:** a **top-down** store (one object; select slices of it). Same mental model as Redux, without the ceremony.
- **Jotai** (same authors): **bottom-up** atoms. Small pieces of state composed into derived atoms; great when state is fine-grained and highly derived.
- **Recoil** (Meta): atom-based like Jotai, but **archived/no longer maintained**, so don't pick it for new projects.

</details>

<details>
<summary>Live coding: implement a tiny version of Zustand.</summary>

```ts
import { useSyncExternalStore } from 'react';

type SetState<T> = (partial: Partial<T> | ((s: T) => Partial<T>)) => void;

export function create<T extends object>(initializer: (set: SetState<T>, get: () => T) => T) {
  let state: T;
  const listeners = new Set<() => void>();

  const getState = () => state;
  const setState: SetState<T> = (partial) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    if (Object.is(next, state)) return;
    state = { ...state, ...next };                  // shallow merge, new reference
    listeners.forEach((l) => l());                  // notify subscribers
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);        // unsubscribe
  };

  state = initializer(setState, getState);

  function useStore<U>(selector: (s: T) => U = (s) => s as unknown as U) {
    // React re-renders only when the selected value changes (Object.is)
    return useSyncExternalStore(subscribe, () => selector(state));
  }

  return Object.assign(useStore, { getState, setState, subscribe });
}

// usage
const useCounter = create<{ count: number; inc: () => void }>((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
}));
```

Points to explain while coding: the state lives in a closure outside React; `setState` creates a **new** object so reference checks work; a `Set` of listeners for subscribe/unsubscribe; `useSyncExternalStore` connects it to React. This also shows why selectors returning new objects loop: `getSnapshot` must return the same value when nothing changed.

</details>

<details>
<summary>Spot the bug</summary>

```tsx
const useStore = create<State>()((set) => ({
  todos: [],
  addTodo: (todo) => set((s) => { s.todos.push(todo); return s; }),
}));

function TodoCount() {
  const { todos } = useStore();
  return <p>{todos.length}</p>;
}
```

**Answer:**
1. `addTodo` **mutates** the array and returns the same state object, so the reference doesn't change and components don't re-render. Fix: `set((s) => ({ todos: [...s.todos, todo] }))`.
2. `useStore()` with no selector subscribes to the **whole store**, so it re-renders on any change. Fix: `const count = useStore((s) => s.todos.length);`, which also returns a primitive, so it re-renders only when the count changes.

</details>
