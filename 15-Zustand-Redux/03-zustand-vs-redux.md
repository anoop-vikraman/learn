# Zustand vs Redux Toolkit

> Both are **external stores for global client state**: state lives outside React, and components subscribe to parts of it with selectors. They differ in **how much structure** they enforce.

---

## 1. Quick comparison

| | **Zustand** | **Redux Toolkit** |
| --- | --- | --- |
| Size | ~1 KB | ~13–15 KB (RTK + react-redux), more with RTK Query |
| Provider needed | ❌ No | ✅ `<Provider store={store}>` |
| Number of stores | Many small stores (or one with slices) | **One** store, split into slices |
| How state changes | Call a function: `inc()` → `set(...)` | `dispatch(action)` → reducer |
| Actions | Just functions in the store | Plain objects with a `type`, created by `createSlice` |
| Immutability | By hand (spread), or optional `immer` middleware | Immer **built in** |
| Async | Any `async` function calling `set` | `createAsyncThunk`, listeners, or RTK Query |
| Server data | Not included → use TanStack Query | **RTK Query** included |
| DevTools | Optional `devtools` middleware | Built in, with full action log + time travel |
| Selectors | Inline; `useShallow` for multiple values | `useSelector`; `createSelector` for memoized derived data |
| Use outside React | `useStore.getState()/setState()` | `store.getState()/dispatch()` |
| Boilerplate | Very little | More (slice, store, typed hooks, provider), but far less than old Redux |
| Structure / conventions | Flexible, you decide | Opinionated, consistent across the team |
| Middleware ecosystem | persist, devtools, immer, subscribeWithSelector | Thunk, listener, RTK Query, redux-persist, saga, and many more |
| Learning curve | Minutes | Hours to days (actions, reducers, thunks, Immer, selectors) |
| Under the hood | `useSyncExternalStore` | `useSyncExternalStore` |

---

## 2. The same feature in both

A cart with add, remove and a total.

### Zustand: one file

```ts
// stores/cartStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CartItem { id: string; name: string; price: number; qty: number }
interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'qty'>) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) =>
        set((s) => {
          const existing = s.items.find((i) => i.id === item.id);
          return {
            items: existing
              ? s.items.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i))
              : [...s.items, { ...item, qty: 1 }],
          };
        }),
      removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'cart' }
  )
);

export const useCartTotal = () =>
  useCartStore((s) => s.items.reduce((sum, i) => sum + i.price * i.qty, 0));
```

```tsx
function CartSummary() {
  const total = useCartTotal();
  const clear = useCartStore((s) => s.clear);
  return <p>Total: ₹{total} <button onClick={clear}>Clear</button></p>;
}

function AddButton({ product }: { product: Product }) {
  const addItem = useCartStore((s) => s.addItem);
  return <button onClick={() => addItem(product)}>Add</button>;
}

// No Provider needed in main.tsx
```

### Redux Toolkit: slice + store + hooks + provider

```ts
// features/cart/cartSlice.ts
import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';

interface CartState { items: CartItem[] }
const initialState: CartState = { items: [] };

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    itemAdded: (state, action: PayloadAction<Omit<CartItem, 'qty'>>) => {
      const existing = state.items.find((i) => i.id === action.payload.id);
      if (existing) existing.qty += 1;                       // Immer: "mutation" is fine
      else state.items.push({ ...action.payload, qty: 1 });
    },
    itemRemoved: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((i) => i.id !== action.payload);
    },
    cartCleared: (state) => { state.items = [] },
  },
});

export const { itemAdded, itemRemoved, cartCleared } = cartSlice.actions;
export default cartSlice.reducer;

export const selectCartItems = (s: RootState) => s.cart.items;
export const selectCartTotal = createSelector([selectCartItems], (items) =>
  items.reduce((sum, i) => sum + i.price * i.qty, 0)
);
```

```ts
// app/store.ts
export const store = configureStore({ reducer: { cart: cartReducer } });
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// app/hooks.ts
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
```

```tsx
function CartSummary() {
  const total = useAppSelector(selectCartTotal);
  const dispatch = useAppDispatch();
  return <p>Total: ₹{total} <button onClick={() => dispatch(cartCleared())}>Clear</button></p>;
}

function AddButton({ product }: { product: Product }) {
  const dispatch = useAppDispatch();
  return <button onClick={() => dispatch(itemAdded(product))}>Add</button>;
}

// main.tsx
<Provider store={store}><App /></Provider>
```

*(Persistence in Redux would need `redux-persist` or a listener writing to localStorage. In Zustand it was one middleware call.)*

**What the comparison shows:**
- Zustand: **less code**, everything in one place, and you call functions directly.
- RTK: more files, but every change is a **named action** (`cart/itemAdded`) visible in DevTools, reducers are pure and easy to test, and the structure is the same in every feature.

---

## 3. Key differences explained

### 3.1 Calling functions vs dispatching actions

```ts
// Zustand: the function IS the change
useCartStore.getState().addItem(product);

// Redux: describe what happened; the reducer decides how state changes
store.dispatch(itemAdded(product));   // { type: 'cart/itemAdded', payload: product }
```

Why Redux's indirection can help: **many slices can react to one action**. For example, `logout` can clear the cart, the user and the filters, each in its own slice, without the logout code knowing about them:

```ts
// in cartSlice, userSlice, filtersSlice...
extraReducers: (builder) => builder.addCase(logout, () => initialState),
```

In Zustand you'd call each store's reset from the logout function, or subscribe to the auth store.

### 3.2 One store vs many stores

- **Redux:** one store, one state tree, one DevTools timeline. Easy to see and reason about the whole app state; cross-slice logic is natural.
- **Zustand:** usually several independent stores. Simple and decoupled, but logic spanning stores must be coordinated by hand.

### 3.3 Re-render behaviour

Both re-render a component only when its **selected value** changes. The traps are similar:

| | Zustand | Redux |
| --- | --- | --- |
| Pick one value | `useStore(s => s.count)` ✅ | `useAppSelector(s => s.counter.value)` ✅ |
| Pick several values | `useShallow(s => ({ a: s.a, b: s.b }))` | `useSelector(fn, shallowEqual)` or separate calls |
| Derived arrays | `useShallow`, or select raw + `useMemo` | `createSelector` |
| No selector | `useStore()` subscribes to everything ⚠️ | Not possible: a selector is required |

### 3.4 Immutability

```ts
// Zustand (default): spread by hand
set((s) => ({ user: { ...s.user, address: { ...s.user.address, city } } }));

// Zustand + immer middleware / Redux Toolkit
state.user.address.city = city;
```

### 3.5 Async and server data

```ts
// Zustand
fetchVendors: async () => {
  set({ status: 'loading' });
  const data = await api.getVendors();
  set({ vendors: data, status: 'success' });
},

// RTK: createAsyncThunk with pending/fulfilled/rejected reducers (more code, but traceable),
// or RTK Query: useGetVendorsQuery() with caching and invalidation built in
```

**The modern recommendation for both:** don't keep server data in your client store by hand. Use **TanStack Query** (with Zustand) or **RTK Query** (with Redux).

### 3.6 Debugging

- **Redux:** every change is an action with a type and payload; DevTools shows the full timeline, state diffs and time travel by default.
- **Zustand:** with the `devtools` middleware you get a timeline too, but actions show as "anonymous" unless you pass a name to `set(…, undefined, 'cart/addItem')`.

### 3.7 Testing

```ts
// Redux: pure reducer, no setup at all
expect(cartReducer({ items: [] }, itemAdded(p))).toEqual({ items: [{ ...p, qty: 1 }] });

// Zustand: call the action, read the state; reset the singleton between tests
beforeEach(() => useCartStore.setState({ items: [] }));
useCartStore.getState().addItem(p);
expect(useCartStore.getState().items).toHaveLength(1);
```

Component tests: Redux renders with a fresh `<Provider store={makeStore(preloaded)}>`; Zustand sets state directly with `setState` (no wrapper needed).

---

## 4. Where Context and TanStack Query fit

| Tool | Best for |
| --- | --- |
| `useState` / `useReducer` | State used by one component or a small subtree |
| **Context** | Values that rarely change: theme, locale, current user, DI of services |
| **Zustand** | Global client state with frequent updates; small/medium apps; low ceremony |
| **Redux Toolkit** | Large apps, big teams, complex shared state, need for strict patterns and an action log |
| **TanStack Query / RTK Query** | **Server state**: fetching, caching, invalidation, refetching |
| URL (search params) | Filters, pagination, tabs that should survive refresh and be shareable |
| React Hook Form | Form state |

A very common modern stack: **TanStack Query (server) + Zustand (client) + RHF (forms) + URL state (filters)**.

---

## 5. How to decide

```
Is it data from the server?
  └─ yes → TanStack Query (or RTK Query if you're on Redux)
  └─ no  → Is it used by one component/subtree?
             └─ yes → useState / useReducer (lift state, or Context if it rarely changes)
             └─ no  → Global client state:
                        Small/medium app, small team, want minimal code   → Zustand
                        Large app, many devs, complex cross-feature flows,
                        need action log/time travel, existing Redux code  → Redux Toolkit
```

**Choose Zustand when:** you want simple global state quickly, the app is small/medium, you already use TanStack Query for server data, or you need state outside React with little setup.

**Choose Redux Toolkit when:** the team is large and needs enforced conventions, many features react to the same events, you want a full action history for debugging, you want an all-in-one solution including RTK Query, or the codebase already uses Redux.

---

## 6. Migrating between them

**Redux → Zustand** (common in simplification efforts):
1. Move server data to TanStack Query first; often most of the Redux store disappears.
2. Move each remaining slice to a small Zustand store, one feature at a time. Both can run side by side.
3. Replace `useSelector(s => s.x.y)` with `useXStore(s => s.y)` and `dispatch(action(p))` with `action(p)`.

**Zustand → Redux:** usually when the app and team have grown. Map each store to a slice, each store function to a reducer (or thunk, if async), and add the provider and typed hooks.

---

## 7. Interview questions

<details>
<summary>What's the main difference between Zustand and Redux?</summary>

Both are external stores with selector-based subscriptions. Redux (RTK) is **opinionated**: one store, changes only through dispatched actions handled by pure reducers, a provider, built-in Immer, DevTools and RTK Query. Zustand is **minimal**: a store is a hook, you change state by calling functions, no provider, and you add middleware only if you need it. Redux trades more code for structure and traceability; Zustand trades structure for simplicity.

</details>

<details>
<summary>Why would you choose Zustand over Redux for a new project?</summary>

If server data is handled by TanStack Query, the remaining client state is usually small (auth, UI, filters). Zustand covers it with very little code, no provider, good TypeScript support and fine-grained re-renders. Redux's ceremony pays off mainly for large, complex shared state and big teams.

</details>

<details>
<summary>When is Redux the better choice?</summary>

Large apps with lots of interconnected client state, many developers who benefit from one enforced pattern, flows where several features must react to the same event (an action handled by many slices), a need for a full action log and time-travel debugging, or an existing Redux codebase. RTK Query also gives an integrated caching solution.

</details>

<details>
<summary>Is Redux dead? Is Redux still relevant?</summary>

No. Redux Toolkit is actively maintained and widely used, especially in large enterprise codebases. What changed is that **server state** moved to dedicated tools (RTK Query, TanStack Query), so many apps need much less global client state, which makes lighter tools like Zustand enough for them.

</details>

<details>
<summary>How do both avoid unnecessary re-renders compared to Context?</summary>

Context re-renders every consumer when its value changes. Both Zustand and React-Redux use `useSyncExternalStore` with **selectors**: after a change, each component's selector runs and the component re-renders only if its selected value changed (`Object.is` / `===`). Both require care with selectors that return new objects/arrays (`useShallow` in Zustand, `createSelector`/`shallowEqual` in Redux).

</details>

<details>
<summary>How would you handle logout clearing several stores in each library?</summary>

**Redux:** dispatch one `logout` action; each slice handles it in `extraReducers` and returns its initial state. **Zustand:** a `logout` function calls each store's `reset()` (or `useXStore.setState(initial, true)`), or the other stores `subscribe` to the auth store and reset themselves.

</details>

<details>
<summary>Have you used Zustand? How? (You list it on your CV.)</summary>

Answer from your real usage: which project, which state (e.g. auth/user + permissions, UI state, shared filters), why not Context (re-renders) or Redux (boilerplate), and one detail: `persist` with `partialize`, `useShallow`, reading the token with `getState()` in an Axios interceptor, or resetting the store in tests.

</details>
