# Redux Toolkit (RTK): how to use it and the core concepts

> **Redux Toolkit** is the official, recommended way to write Redux. It removes the old boilerplate (action-type constants, hand-written action creators, switch reducers, manual immutable updates). Examples use **RTK 2.x** and **react-redux 9.x** with TypeScript.

```bash
npm install @reduxjs/toolkit react-redux
```

---

## Key terms at a glance

| Term | What it means |
| --- | --- |
| **Store** | The single object holding the **whole app state**. Created with `configureStore`. |
| **Action** | A plain object describing **what happened**: `{ type: 'cart/itemAdded', payload: {...} }`. |
| **Action creator** | A function that returns an action: `itemAdded(product)`. `createSlice` generates them for you. |
| **Payload** | The data carried by an action (`action.payload`). |
| **Reducer** | A **pure** function `(state, action) => newState` that decides how state changes for an action. |
| **Dispatch** | Sending an action to the store: `dispatch(itemAdded(p))`. The only way to change state. |
| **Slice** | One feature's part of the state (e.g. `state.cart`) **plus** its reducers and actions, created together with `createSlice`. |
| **`createSlice`** | Generates the action types, action creators and reducer for a slice from one object. |
| **`configureStore`** | Creates the store, combines slice reducers, and adds thunk, DevTools and dev checks automatically. |
| **Immer** | Library inside RTK that lets reducers "mutate" a draft while producing a new immutable state. |
| **`prepare`** | An optional function on a slice action that builds the payload (IDs, dates) before it reaches the reducer. |
| **Thunk** | A function you dispatch instead of an action. It gets `dispatch`/`getState` and can run async code. |
| **`createAsyncThunk`** | Creates a thunk that automatically dispatches `pending` / `fulfilled` / `rejected` actions around an async call. |
| **`extraReducers`** | The part of a slice that responds to actions defined **elsewhere** (thunks, other slices, RTK Query). |
| **Selector** | A function that reads or derives data from state: `s => s.cart.items`. |
| **`createSelector`** | Creates a **memoized** selector that recomputes only when its inputs change. |
| **Normalized state** | Storing collections as `{ ids: [], entities: { id: item } }` instead of arrays. |
| **`createEntityAdapter`** | Gives you ready-made reducers and selectors for normalized collections. |
| **Middleware** | Code that runs between `dispatch` and the reducer (thunk, logger, RTK Query, listeners). |
| **RTK Query** | RTK's built-in data fetching and caching layer (`createApi`), similar to TanStack Query. |
| **Endpoint** | One API operation in RTK Query: a **query** (read) or a **mutation** (write). |
| **Tags** | RTK Query labels: queries *provide* tags, mutations *invalidate* them, and invalidated queries refetch. |
| **Listener middleware** | Runs side effects when specific actions are dispatched ("when X happens, do Y"). |
| **Provider** | `<Provider store={store}>` from react-redux. It makes the store available to hooks in the component tree. |
| **`useSelector` / `useDispatch`** | Hooks to read state and dispatch actions in components (use the typed `useAppSelector` / `useAppDispatch`). |
| **Serializable** | Can be turned into JSON and back: plain objects, arrays, strings, numbers, booleans, null. No `Date`, `Map`, functions or class instances. |

---

## 1. Core Redux concepts (still true with RTK)

> **In short:** State lives in one store and changes only when you **dispatch actions** that **pure reducers** handle. RTK keeps these ideas and removes the boilerplate.

| Concept | Meaning |
| --- | --- |
| **Store** | One object holding the **entire app state** (single source of truth) |
| **Action** | A plain object describing **what happened**: `{ type: 'todos/added', payload: {...} }` |
| **Reducer** | A **pure function** `(state, action) => newState`; never mutates, no side effects |
| **Dispatch** | The only way to change state: `dispatch(action)` |
| **Selector** | A function that reads/derives data from state: `state => state.todos.items` |
| **Middleware** | Code between dispatch and reducer (async logic, logging); thunks are middleware |

**One-way data flow:**

```
   UI ──dispatch(action)──▶ middleware ──▶ reducers ──▶ new state in store
    ▲                                                        │
    └──────────── useSelector re-renders if selected value changed ◀┘
```

**The three principles:** single source of truth · state is read-only (change it only by dispatching actions) · changes are made with pure reducers. This makes every change **traceable** and enables time-travel debugging in Redux DevTools.

**What RTK adds:**

| API | Replaces |
| --- | --- |
| `configureStore` | `createStore` + `combineReducers` + `applyMiddleware` + devtools setup |
| `createSlice` | action types + action creators + switch reducer (with Immer built in) |
| `createAsyncThunk` | hand-written thunks dispatching pending/success/failure actions |
| `createSelector` (Reselect) | memoized selectors |
| `createEntityAdapter` | normalized `{ ids, entities }` CRUD logic |
| **RTK Query** (`createApi`) | data fetching + caching (like TanStack Query) |
| `createListenerMiddleware` | side effects reacting to actions (lighter than redux-saga) |

---

## 2. Setup step by step

> **In short:** Create a slice, register it in the store, make typed hooks, wrap the app in a Provider, then use the hooks in components.

### Step 1: a slice

> **In short:** A **slice** holds one feature's state, its reducers and its generated actions, all created by `createSlice`.

```ts
// features/counter/counterSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface CounterState { value: number }
const initialState: CounterState = { value: 0 };

const counterSlice = createSlice({
  name: 'counter',                 // prefix for action types: 'counter/increment'
  initialState,
  reducers: {
    increment: (state) => { state.value += 1 },          // "mutating" is OK: Immer
    decrement: (state) => { state.value -= 1 },
    incrementByAmount: (state, action: PayloadAction<number>) => {
      state.value += action.payload;
    },
    reset: () => initialState,                           // or return a new value
  },
});

export const { increment, decrement, incrementByAmount, reset } = counterSlice.actions;
export default counterSlice.reducer;
```

`createSlice` generates **action creators** (`increment()` → `{ type: 'counter/increment' }`) and the **reducer** from one object.

### Step 2: the store

> **In short:** `configureStore` combines the slice reducers into the single **store** and sets up thunk and DevTools for you.

```ts
// app/store.ts
import { configureStore } from '@reduxjs/toolkit';
import counterReducer from '../features/counter/counterSlice';
import todosReducer from '../features/todos/todosSlice';

export const store = configureStore({
  reducer: {
    counter: counterReducer,       // state.counter
    todos: todosReducer,           // state.todos
  },
  // devtools, thunk middleware and dev-only checks (mutation + serializability) are on by default
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

### Step 3: typed hooks

> **In short:** **Typed hooks** are `useSelector`/`useDispatch` pre-bound to your `RootState`/`AppDispatch` types, so everything is typed.

```ts
// app/hooks.ts
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
```

Always use these instead of plain `useDispatch`/`useSelector`, so state and thunks are typed.

### Step 4: Provider

> **In short:** The **Provider** puts the store into React context so hooks can reach it.

```tsx
// main.tsx
import { Provider } from 'react-redux';
import { store } from './app/store';

createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <App />
  </Provider>
);
```

### Step 5: use it

> **In short:** Read with `useAppSelector`, change with `dispatch(actionCreator(payload))`.

```tsx
function Counter() {
  const value = useAppSelector((state) => state.counter.value);
  const dispatch = useAppDispatch();

  return (
    <>
      <span>{value}</span>
      <button onClick={() => dispatch(increment())}>+</button>
      <button onClick={() => dispatch(incrementByAmount(5))}>+5</button>
    </>
  );
}
```

---

## 3. Immer: why "mutating" inside `createSlice` is safe

> **In short:** **Immer** gives reducers a draft copy to change; it then builds a new immutable state for you.

RTK reducers are wrapped in **Immer**. You write code that looks like mutation on a **draft**, and Immer produces a new immutable state with structural sharing (unchanged parts keep the same reference).

```ts
reducers: {
  todoAdded: (state, action: PayloadAction<Todo>) => {
    state.items.push(action.payload);                         // ✅ mutate the draft
  },
  todoToggled: (state, action: PayloadAction<string>) => {
    const todo = state.items.find((t) => t.id === action.payload);
    if (todo) todo.done = !todo.done;                         // ✅
  },
  todosCleared: () => {
    return { items: [], filter: 'all' };                      // ✅ or return a brand-new state
  },
}
```

**Rules**
- Either **mutate the draft** *or* **return a new value**, never both in the same reducer.
- `state = newValue` does nothing (it only reassigns the local variable). Use `return newValue`.
- This only works **inside** `createSlice`/`createReducer`. Mutating state anywhere else is still a bug.

---

## 4. Customizing actions with `prepare`

> **In short:** **prepare** builds the action payload (IDs, timestamps) before the reducer runs, so the reducer stays pure.

Use `prepare` to generate IDs/timestamps **outside the reducer**, because reducers must be pure (no `Math.random`, `Date.now`, `crypto.randomUUID`).

```ts
todoAdded: {
  reducer: (state, action: PayloadAction<Todo>) => {
    state.items.push(action.payload);
  },
  prepare: (title: string) => ({
    payload: { id: nanoid(), title, done: false, createdAt: new Date().toISOString() },
  }),
},

// usage: dispatch(todoAdded('Buy milk'))
```

`nanoid` is exported from `@reduxjs/toolkit`. Dates are stored as **ISO strings** because state should be **serializable** (no `Date`, `Map`, class instances, functions or Promises).

---

## 5. Async logic with `createAsyncThunk`

> **In short:** A **thunk** runs async code; `createAsyncThunk` dispatches pending/fulfilled/rejected actions that the slice handles in `extraReducers`.

```ts
// features/vendors/vendorsSlice.ts
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

export const fetchVendors = createAsyncThunk(
  'vendors/fetchAll',                                     // base action type
  async (query: string, { signal, rejectWithValue }) => {
    try {
      const { data } = await api.get<Vendor[]>('/vendors', { params: { q: query }, signal });
      return data;                                        // becomes action.payload of 'fulfilled'
    } catch (err) {
      return rejectWithValue((err as Error).message);     // becomes action.payload of 'rejected'
    }
  }
);

interface VendorsState {
  items: Vendor[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: VendorsState = { items: [], status: 'idle', error: null };

const vendorsSlice = createSlice({
  name: 'vendors',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchVendors.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchVendors.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload;                     // typed as Vendor[]
      })
      .addCase(fetchVendors.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) ?? action.error.message ?? 'Unknown error';
      });
  },
});

export default vendorsSlice.reducer;
```

```tsx
function VendorList() {
  const dispatch = useAppDispatch();
  const { items, status, error } = useAppSelector((s) => s.vendors);

  useEffect(() => {
    const promise = dispatch(fetchVendors(''));
    return () => promise.abort();            // cancels: thunk receives an aborted signal
  }, [dispatch]);

  if (status === 'loading') return <Spinner />;
  if (status === 'failed') return <ErrorMessage text={error!} />;
  return <ul>{items.map((v) => <li key={v.id}>{v.name}</li>)}</ul>;
}
```

**Key points**
- One thunk generates **three action types**: `vendors/fetchAll/pending`, `/fulfilled`, `/rejected`.
- `reducers` = actions this slice **defines**; `extraReducers` = reacting to actions defined **elsewhere** (thunks, other slices, RTK Query).
- `await dispatch(thunk()).unwrap()` returns the payload or **throws**. Useful in a submit handler to show a toast or navigate.
- `condition` option: skip the fetch if data is already loading/loaded.

```ts
try {
  await dispatch(saveVendor(form)).unwrap();
  navigate('/vendors');
} catch (message) {
  toast.error(String(message));
}
```

**Plain thunks** (no lifecycle actions needed):

```ts
export const logoutAndClear = (): AppThunk => (dispatch, getState) => {
  dispatch(logout());
  dispatch(cartCleared());
};
// type AppThunk = ThunkAction<void, RootState, unknown, UnknownAction>;
```

---

## 6. Selectors and memoization

> **In short:** **Selectors** read or derive data from state; `createSelector` **memoizes** derived results so components don't re-render needlessly.

```ts
// features/todos/selectors.ts
import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';

export const selectTodos = (s: RootState) => s.todos.items;
export const selectFilter = (s: RootState) => s.todos.filter;

// Memoized: recomputes only when todos or filter change
export const selectVisibleTodos = createSelector(
  [selectTodos, selectFilter],
  (todos, filter) =>
    filter === 'all' ? todos : todos.filter((t) => (filter === 'done' ? t.done : !t.done))
);

export const selectOpenCount = createSelector([selectTodos], (todos) => todos.filter((t) => !t.done).length);
```

**Why this matters:** `useSelector` re-runs the selector after **every dispatched action** and re-renders when the result changes by **reference** (`===`).

```ts
// ❌ new array on every action → re-renders on every action (dev warning in react-redux 9)
const visible = useAppSelector((s) => s.todos.items.filter((t) => !t.done));

// ✅ memoized → same reference until inputs change
const visible = useAppSelector(selectVisibleTodos);

// ✅ selecting several fields: separate calls, or shallowEqual
import { shallowEqual } from 'react-redux';
const { status, error } = useAppSelector((s) => ({ status: s.vendors.status, error: s.vendors.error }), shallowEqual);
```

**Selectors with arguments:**

```ts
export const selectTodoById = (s: RootState, id: string) => s.todos.items.find((t) => t.id === id);
const todo = useAppSelector((s) => selectTodoById(s, id));
```

**Selectors inside slices (RTK 2):**

```ts
const todosSlice = createSlice({
  name: 'todos',
  initialState,
  reducers: { /* ... */ },
  selectors: {
    selectOpenTodos: (state) => state.items.filter((t) => !t.done),  // state = this slice only
  },
});
export const { selectOpenTodos } = todosSlice.selectors;            // called with RootState
```

**Keep state minimal, derive the rest.** Store `items` and `filter`; don't store `visibleItems` or `count`, which would get out of sync.

---

## 7. Normalized state with `createEntityAdapter`

> **In short:** **Normalized state** stores items by ID (`{ ids, entities }`); the entity adapter gives you CRUD reducers and selectors for it.

For collections, store items **by ID** instead of in arrays: fast lookups, no duplicates, easy updates.

```ts
import { createEntityAdapter, createSlice, EntityState } from '@reduxjs/toolkit';

const vendorsAdapter = createEntityAdapter<Vendor>({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

// state shape: { ids: ['2', '1'], entities: { '1': {...}, '2': {...} }, status: 'idle' }
const initialState = vendorsAdapter.getInitialState({ status: 'idle' as Status });

const vendorsSlice = createSlice({
  name: 'vendors',
  initialState,
  reducers: {
    vendorAdded: vendorsAdapter.addOne,
    vendorUpdated: vendorsAdapter.updateOne,       // payload: { id, changes: { name: 'New' } }
    vendorRemoved: vendorsAdapter.removeOne,
  },
  extraReducers: (builder) => {
    builder.addCase(fetchVendors.fulfilled, (state, action) => {
      state.status = 'succeeded';
      vendorsAdapter.setAll(state, action.payload);
    });
  },
});

export const {
  selectAll: selectAllVendors,
  selectById: selectVendorById,
  selectIds: selectVendorIds,
} = vendorsAdapter.getSelectors((s: RootState) => s.vendors);
```

A common list pattern: the list selects **IDs only**, each row selects its own item by ID, so editing one vendor re-renders one row.

---

## 8. RTK Query: data fetching and caching

> **In short:** **RTK Query** defines API endpoints once and generates hooks that fetch, cache, dedupe and refetch server data, using **tags** for invalidation.

RTK Query is RTK's built-in answer to TanStack Query. If you use Redux, **use RTK Query for server data instead of hand-written thunks**.

```ts
// services/api.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../app/store';

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.token;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ['Vendor'],
  endpoints: (build) => ({
    getVendors: build.query<Vendor[], string>({
      query: (q) => ({ url: '/vendors', params: { q } }),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Vendor' as const, id })), { type: 'Vendor', id: 'LIST' }]
          : [{ type: 'Vendor', id: 'LIST' }],
    }),
    getVendor: build.query<Vendor, string>({
      query: (id) => `/vendors/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Vendor', id }],
    }),
    addVendor: build.mutation<Vendor, Partial<Vendor>>({
      query: (body) => ({ url: '/vendors', method: 'POST', body }),
      invalidatesTags: [{ type: 'Vendor', id: 'LIST' }],          // refetches the list
    }),
    updateVendor: build.mutation<Vendor, Pick<Vendor, 'id'> & Partial<Vendor>>({
      query: ({ id, ...body }) => ({ url: `/vendors/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Vendor', id }],
    }),
  }),
});

export const { useGetVendorsQuery, useGetVendorQuery, useAddVendorMutation, useUpdateVendorMutation } = api;
```

```ts
// app/store.ts
export const store = configureStore({
  reducer: {
    auth: authReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefault) => getDefault().concat(api.middleware),   // caching, polling, invalidation
});
```

```tsx
function Vendors() {
  const [q, setQ] = useState('');
  const { data = [], isLoading, isFetching, error, refetch } = useGetVendorsQuery(q);
  const [addVendor, { isLoading: saving }] = useAddVendorMutation();

  return (
    <>
      <input value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading ? <Spinner /> : <VendorTable rows={data} dimmed={isFetching} />}
      <button disabled={saving} onClick={() => addVendor({ name: 'Acme' }).unwrap()}>Add</button>
    </>
  );
}
```

**Concepts:** cached by endpoint + argument, **deduplicated** requests, `keepUnusedDataFor` (default 60 s, like `gcTime`), **tags** for invalidation (like query keys + `invalidateQueries`), `skip` option (conditional fetching), `pollingInterval`, `refetchOnFocus`/`refetchOnReconnect` (needs `setupListeners(store.dispatch)`), and optimistic updates with `onQueryStarted` + `api.util.updateQueryData`.

**Optimistic update:**

```ts
updateVendor: build.mutation<Vendor, Pick<Vendor, 'id'> & Partial<Vendor>>({
  query: ({ id, ...body }) => ({ url: `/vendors/${id}`, method: 'PATCH', body }),
  async onQueryStarted({ id, ...patch }, { dispatch, queryFulfilled }) {
    const result = dispatch(
      api.util.updateQueryData('getVendor', id, (draft) => { Object.assign(draft, patch); })
    );
    try { await queryFulfilled; } catch { result.undo(); }      // roll back on error
  },
}),
```

---

## 9. Side effects with the listener middleware

> **In short:** The **listener middleware** runs code when certain actions are dispatched: saving to storage, toasts, follow-up requests.

React to actions without putting side effects in components or reducers (a lightweight alternative to redux-saga):

```ts
import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';

export const listener = createListenerMiddleware();

// Save the cart to localStorage whenever it changes
listener.startListening({
  matcher: isAnyOf(itemAdded, itemRemoved, cartCleared),
  effect: (_action, api) => {
    localStorage.setItem('cart', JSON.stringify((api.getState() as RootState).cart));
  },
});

// Show a toast when any save fails
listener.startListening({
  actionCreator: saveVendor.rejected,
  effect: (action) => toast.error(action.error.message ?? 'Save failed'),
});

// store: middleware: (gDM) => gDM().prepend(listener.middleware)
```

*(For persisting the whole store, `redux-persist` is the common library; it needs its action types ignored in the serializability check.)*

---

## 10. Recommended folder structure

> **In short:** Group each feature's slice, selectors and components together ("feature folders"), with the store setup in `app/`.

```
src/
  app/
    store.ts          # configureStore, RootState, AppDispatch
    hooks.ts          # useAppDispatch, useAppSelector
  features/
    auth/authSlice.ts
    cart/
      cartSlice.ts
      selectors.ts
      Cart.tsx
    todos/
      todosSlice.ts
      TodoList.tsx
  services/
    api.ts            # RTK Query createApi
```

"Feature folders" (the "ducks" pattern): the slice, its selectors and its components live together.

---

## 11. Testing

> **In short:** Test reducers as plain functions, and test components with a real store built per test (`makeStore` + `Provider`).

**Reducers are pure functions, so test them directly:**

```ts
import reducer, { incrementByAmount, reset } from './counterSlice';

test('incrementByAmount adds the payload', () => {
  expect(reducer({ value: 2 }, incrementByAmount(3))).toEqual({ value: 5 });
});

test('reset returns initial state', () => {
  expect(reducer({ value: 10 }, reset())).toEqual({ value: 0 });
});
```

**Components: render with a real store** (recommended over mocking `useSelector`):

```tsx
// app/store.ts: export the root reducer so tests can build fresh stores
// export const rootReducer = combineReducers({ counter: counterReducer, todos: todosReducer });

// test-utils.tsx
export function makeStore(preloadedState?: Partial<RootState>) {
  return configureStore({ reducer: rootReducer, preloadedState });
}

export function renderWithStore(ui: ReactElement, { preloadedState, store = makeStore(preloadedState) } = {}) {
  return { store, ...render(<Provider store={store}>{ui}</Provider>) };
}

// test
test('shows the count and increments', async () => {
  renderWithStore(<Counter />, { preloadedState: { counter: { value: 5 } } });
  await userEvent.click(screen.getByRole('button', { name: '+' }));
  expect(screen.getByText('6')).toBeInTheDocument();
});
```

For thunks and RTK Query, mock the **network** with MSW and assert on what the UI shows. A **fresh store per test** prevents leaking state (export a `makeStore` function rather than only a singleton).

---

## 12. Common mistakes

> **In short:** Most bugs come from impure reducers, non-serializable state, unmemoized selectors, or putting everything in Redux.

| Mistake | Problem | Fix |
| --- | --- | --- |
| Mutating state outside `createSlice` | No re-render, corrupt state | Only "mutate" in slice reducers |
| `state = newState` inside a reducer | Does nothing | `return newState` |
| Side effects in reducers (API calls, random IDs, dates) | Not pure, breaks time travel/tests | Thunks, `prepare`, listeners |
| Non-serializable values (`Date`, `Map`, class, Promise, function) | Dev warnings, broken DevTools/persistence | ISO strings, plain objects/arrays |
| Selector returning a new array/object | Re-render on every action | `createSelector`, `shallowEqual` |
| Storing derived data | Gets out of sync | Derive with selectors |
| Putting *all* state in Redux (form inputs, hover) | Noise, extra renders | Keep local UI state in `useState` |
| Hand-written fetch thunks everywhere | Re-inventing caching | RTK Query |
| Untyped `useSelector`/`useDispatch` | No types, thunks typed wrong | `useAppSelector` / `useAppDispatch` |

---

## 13. Interview questions

<details>
<summary>Explain the Redux data flow.</summary>

The UI dispatches an action → middleware (e.g. thunk) can intercept it → the root reducer passes the current state and action to each slice reducer → reducers return new state → the store notifies subscribers → `useSelector` in each component re-runs its selector and re-renders only if the selected value changed (by reference).

</details>

<details>
<summary>Why must reducers be pure, and why must state be immutable?</summary>

Pure reducers (same input → same output, no side effects) make state changes **predictable, testable and replayable** (time-travel debugging). Immutability lets React-Redux detect changes with a cheap **reference comparison** (`===`) instead of deep comparison. If you mutate, the reference stays the same and components don't re-render.

</details>

<details>
<summary>How does RTK let you write mutating code in reducers?</summary>

`createSlice` uses **Immer**. The reducer receives a draft (a Proxy); Immer records the changes and produces a new immutable object, reusing unchanged parts (structural sharing). You must either mutate the draft or return a new value, not both.

</details>

<details>
<summary><code>reducers</code> vs <code>extraReducers</code>?</summary>

`reducers` define new actions owned by the slice (RTK creates action creators for them). `extraReducers` respond to actions defined elsewhere: `createAsyncThunk` lifecycle actions, other slices' actions, RTK Query matchers. They don't create new action creators.

</details>

<details>
<summary>What is a thunk? What does <code>createAsyncThunk</code> do?</summary>

A thunk is a function dispatched instead of an action object; the thunk middleware calls it with `(dispatch, getState)`, so it can run async logic and dispatch actions later. `createAsyncThunk` wraps an async function and automatically dispatches `pending`, `fulfilled` and `rejected` actions, supports cancellation (`signal`, `.abort()`), `rejectWithValue`, `condition`, and `.unwrap()`.

</details>

<details>
<summary>What is <code>createSelector</code> and when do you need it?</summary>

It creates a **memoized** selector (Reselect): it recomputes only when its input selectors return new values, otherwise it returns the cached result (same reference). You need it when a selector **derives** new arrays/objects (filter, map, sort), because otherwise `useSelector` sees a new reference after every action and re-renders.

</details>

<details>
<summary>Why normalize state? What does <code>createEntityAdapter</code> give you?</summary>

Normalized state (`{ ids, entities }`) avoids duplicated data, makes lookup/update by ID O(1), and lets a row component select just its own item. The adapter provides CRUD reducers (`addOne`, `upsertMany`, `updateOne`, `removeOne`, `setAll`), optional sorting and ready-made selectors.

</details>

<details>
<summary>RTK Query vs createAsyncThunk vs TanStack Query?</summary>

`createAsyncThunk` is a building block: you write loading/error state and caching yourself. **RTK Query** is a full data-fetching and caching layer built on RTK: cache per endpoint+args, dedup, tags for invalidation, polling, generated hooks, data visible in Redux DevTools. **TanStack Query** solves the same problem without Redux. If the app already uses Redux, RTK Query fits naturally; if not, TanStack Query (often with Zustand for client state) is the common choice.

</details>

<details>
<summary>Why is serializable state required?</summary>

DevTools, time travel, persistence (redux-persist) and SSR hydration all need state that can be turned into JSON and back. `configureStore` includes a dev-only middleware that warns about non-serializable values in state or actions.

</details>

<details>
<summary>What does <code>configureStore</code> set up for you?</summary>

Combines slice reducers, adds the thunk middleware, enables Redux DevTools, and in development adds checks for accidental mutations and non-serializable values. It accepts `preloadedState`, custom middleware (`middleware: gDM => gDM().concat(...)`), and enhancers.

</details>

<details>
<summary>Where does Redux still make sense today?</summary>

Large apps with lots of shared, frequently-changing client state; many developers who benefit from strict, consistent patterns; complex flows where an action log and time-travel debugging help; existing Redux codebases. For small/medium apps, TanStack Query + Zustand/Context is often enough.

</details>

---

## 14. More interview questions (deeper follow-ups)

<details>
<summary>What is middleware in Redux? Write a simple logger middleware.</summary>

Middleware sits **between `dispatch` and the reducer**. Each one can inspect, change, delay or stop an action, or dispatch others. Thunks, RTK Query and the listener middleware are all middleware.

The signature is three nested functions: `store => next => action => ...`

```ts
import type { Middleware } from '@reduxjs/toolkit';

export const logger: Middleware = (store) => (next) => (action) => {
  console.group((action as { type: string }).type);
  console.log('before', store.getState());
  const result = next(action);             // pass to the next middleware / reducer
  console.log('after', store.getState());
  console.groupEnd();
  return result;
};

// configureStore({ reducer, middleware: (gDM) => gDM().concat(logger) })
```

**How thunk middleware works**, in one line: `if (typeof action === 'function') return action(dispatch, getState); return next(action);`

</details>

<details>
<summary>Thunk vs redux-saga vs listener middleware?</summary>

| | Thunk | Saga | Listener middleware |
| --- | --- | --- | --- |
| Style | async functions | generator functions + effects (`take`, `call`, `put`) | callbacks reacting to actions |
| Good for | most async logic | complex long-running flows, cancellation, race, debounce | reacting to actions, simple workflows |
| Learning curve | low | high | low/medium |
| Status | built into RTK | separate library, less used today | built into RTK, recommended over saga |

Today: **RTK Query for fetching, thunks for one-off async logic, listeners for "when X happens, do Y".**

</details>

<details>
<summary>How does <code>useSelector</code> decide whether to re-render? How is it different from <code>connect</code>?</summary>

After every dispatched action, `useSelector` runs the selector and compares the result with the previous one using **`===`** (or a custom equality function like `shallowEqual`). Different reference → re-render.

`connect(mapStateToProps, mapDispatchToProps)` (the older HOC API) **shallow-compares** the object returned by `mapStateToProps`, so returning `{ a, b }` was fine there. With `useSelector`, returning a new object re-renders every time unless you pass `shallowEqual`. Hooks are the recommended API today; `connect` still works in older codebases.

</details>

<details>
<summary>What does <code>combineReducers</code> do?</summary>

It builds one root reducer from an object of slice reducers. For each action, it calls every slice reducer with **its own part of the state** (`state.todos` → `todosReducer`) and assembles the results into a new root object. If no slice changed, it returns the same root reference. `configureStore({ reducer: { … } })` calls it for you.

</details>

<details>
<summary>Why do action types use strings like <code>'todos/added'</code>?</summary>

Actions must be **serializable** plain objects so they can be logged, replayed (time travel), sent between tabs, or recorded for bug reports. Strings are readable in DevTools. The `slice/event` naming groups them by feature, and the past tense describes **what happened** ("event"), not a setter command, which lets several slices react to the same event.

</details>

<details>
<summary>Where should business logic go: components, thunks or reducers?</summary>

Put as much as possible in **reducers** (pure, easy to test), e.g. "when an item is added and it already exists, increase quantity". Put async logic and logic needing the whole state or several dispatches in **thunks/listeners**. Keep **components** thin: they read with selectors and dispatch events. Avoid "setter" actions like `setItems` that push all the logic into components.

</details>

<details>
<summary>How do you reset all state on logout?</summary>

Option 1: each slice handles the `logout` action:

```ts
extraReducers: (builder) => builder.addCase(logout, () => initialState),
```

Option 2: a root reducer wrapper:

```ts
const appReducer = combineReducers({ auth, cart, todos, [api.reducerPath]: api.reducer });
const rootReducer: typeof appReducer = (state, action) =>
  appReducer(logout.match(action) ? undefined : state, action);   // undefined → every slice's initialState
```

Also clear RTK Query's cache with `dispatch(api.util.resetApiState())` if you don't use option 2.

</details>

<details>
<summary>What is <code>action.meta</code> in <code>createAsyncThunk</code>? How do you handle race conditions?</summary>

`meta` holds `arg` (what you passed in), `requestId` (unique per call) and `requestStatus`. To ignore stale responses (e.g. two searches where the first answers last), store the latest `requestId` on `pending` and only accept `fulfilled` if it matches:

```ts
.addCase(search.pending, (state, action) => { state.currentRequestId = action.meta.requestId })
.addCase(search.fulfilled, (state, action) => {
  if (state.currentRequestId !== action.meta.requestId) return;   // stale
  state.results = action.payload;
})
```

Or abort the previous request with `promise.abort()`. RTK Query handles this for you.

</details>

<details>
<summary>How does RTK Query decide when to refetch? Explain tags.</summary>

Queries **provide** tags (`providesTags: [{ type: 'Vendor', id }]`) and mutations **invalidate** tags (`invalidatesTags: [{ type: 'Vendor', id: 'LIST' }]`). After a mutation succeeds, every active query that provided a matching tag refetches. It also refetches when the hook's argument changes, on `refetch()`, with `pollingInterval`, and on focus/reconnect if `setupListeners` is enabled. Unused data stays cached for `keepUnusedDataFor` (60 s by default).

</details>

<details>
<summary>How do you code-split reducers (load a slice only with its lazy route)?</summary>

RTK 2 has `combineSlices`, which supports **injecting slices later**:

```ts
// store.ts
export const rootReducer = combineSlices(authSlice, api);   // slices known at start

// features/reports/reportsSlice.ts (loaded with the lazy route)
export const reportsSlice = createSlice({ name: 'reports', initialState, reducers: { /* ... */ } });
const injected = reportsSlice.injectInto(rootReducer);       // added when this module loads
```

RTK Query does the same with `api.injectEndpoints({ endpoints: ... })` so each feature can add its own endpoints.

</details>

<details>
<summary>Live coding: implement a tiny <code>createStore</code>.</summary>

```ts
type Reducer<S, A> = (state: S | undefined, action: A) => S;

export function createStore<S, A extends { type: string }>(reducer: Reducer<S, A>) {
  let state = reducer(undefined, { type: '@@INIT' } as A);   // reducers return their initial state
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    dispatch(action: A) {
      state = reducer(state, action);
      listeners.forEach((l) => l());
      return action;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// combineReducers in a few lines
export const combineReducers = (reducers: Record<string, Reducer<any, any>>) =>
  (state: Record<string, any> = {}, action: any) => {
    let changed = false;
    const next: Record<string, any> = {};
    for (const key in reducers) {
      next[key] = reducers[key](state[key], action);
      changed ||= next[key] !== state[key];
    }
    return changed ? next : state;                           // same reference if nothing changed
  };
```

React connects to it with `useSyncExternalStore(store.subscribe, () => selector(store.getState()))`, which is essentially what `useSelector` does.

</details>

<details>
<summary>Spot the bug</summary>

```ts
const todosSlice = createSlice({
  name: 'todos',
  initialState: { items: [] as Todo[] },
  reducers: {
    todoAdded(state, action: PayloadAction<string>) {
      state.items.push({ id: Math.random().toString(), title: action.payload, createdAt: new Date() });
    },
    todosCleared(state) {
      state = { items: [] };
    },
  },
});

function OpenTodos() {
  const open = useAppSelector((s) => s.todos.items.filter((t) => !t.done));
  return <List items={open} />;
}
```

**Answer:**
1. `Math.random()` and `new Date()` inside the reducer make it **impure**. Generate them in a `prepare` callback (with `nanoid()`).
2. `new Date()` is **not serializable**; store `new Date().toISOString()`.
3. `state = { items: [] }` only reassigns the local variable; nothing changes. Use `return { items: [] }` or `state.items = []`.
4. The selector returns a **new array after every action**, so `OpenTodos` re-renders on every dispatch anywhere in the app. Use a memoized `createSelector`.

</details>
