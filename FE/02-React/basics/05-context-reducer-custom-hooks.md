# 05 · Context, useReducer and custom hooks

## 1. The problem: prop drilling

Passing a prop through many components that don't use it, just to reach a deeply nested child, is called **prop drilling**:

```
App (user) → Layout (user) → Sidebar (user) → Menu (user) → Avatar (uses user)
```

It's fine for 2–3 levels. Beyond that, consider **composition** (pass components as `children`) or **Context**.

---

## 2. Context

**Context** lets a parent make a value available to **every component below it**, without passing props through each level.

### Three steps

```jsx
// 1. Create the context (with a default used when there's no Provider above)
import { createContext, useContext, useState } from 'react';

const ThemeContext = createContext('light');

// 2. Provide a value high in the tree
function App() {
  const [theme, setTheme] = useState('light');
  return (
    <ThemeContext value={{ theme, setTheme }}>     {/* React 19. In React 18: <ThemeContext.Provider value={...}> */}
      <Page />
    </ThemeContext>
  );
}

// 3. Read it anywhere below
function ThemeToggle() {
  const { theme, setTheme } = useContext(ThemeContext);
  return (
    <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      Current: {theme}
    </button>
  );
}
```

### Recommended pattern: a provider component + custom hook

```jsx
// src/context/AuthContext.jsx
import { createContext, useContext, useState, useMemo } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const value = useMemo(
    () => ({
      user,
      login: (userData) => setUser(userData),
      logout: () => setUser(null),
    }),
    [user]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');   // clear error if misused
  return ctx;
}
```

```jsx
// main.jsx
<AuthProvider>
  <App />
</AuthProvider>

// any component
function Navbar() {
  const { user, logout } = useAuth();
  return user ? <button onClick={logout}>Log out {user.name}</button> : <a href="/login">Log in</a>;
}
```

### Things to know about Context

- **Every component using the context re-renders when its value changes.** If the value is a new object on every render (`value={{ user, logout }}`), all consumers re-render every time the provider renders. Memoize the value with `useMemo`, and split unrelated data into separate contexts (e.g. `ThemeContext`, `AuthContext`).
- Context is great for **values that change rarely**: theme, language, logged-in user, feature flags.
- For **frequently changing global state** used by many components (cart, filters), a state library (Zustand, Redux Toolkit) re-renders less. For **server data**, use TanStack Query.
- The closest Provider above the component wins; Providers can be nested and override each other.

---

## 3. `useReducer`

`useReducer` is an alternative to `useState` for **complex state logic**: several related values, or many different ways to update state. All the update logic lives in one **reducer** function.

```jsx
const [state, dispatch] = useReducer(reducer, initialState);
```

- **reducer**: a pure function `(currentState, action) => newState`
- **action**: an object describing what happened, usually `{ type: 'something', ...data }`
- **dispatch(action)**: sends an action to the reducer, which triggers a re-render with the new state

### Example: shopping cart

```jsx
import { useReducer } from 'react';

const initialState = { items: [], coupon: null };

function cartReducer(state, action) {
  switch (action.type) {
    case 'added': {
      const existing = state.items.find((i) => i.id === action.product.id);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) => (i.id === action.product.id ? { ...i, qty: i.qty + 1 } : i)),
        };
      }
      return { ...state, items: [...state.items, { ...action.product, qty: 1 }] };
    }
    case 'removed':
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    case 'couponApplied':
      return { ...state, coupon: action.code };
    case 'cleared':
      return initialState;
    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
}

function Cart() {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const total = state.items.reduce((sum, i) => sum + i.price * i.qty, 0);   // derived

  return (
    <>
      <button onClick={() => dispatch({ type: 'added', product: { id: 1, name: 'Pen', price: 10 } })}>Add pen</button>
      <ul>
        {state.items.map((i) => (
          <li key={i.id}>
            {i.name} × {i.qty}
            <button onClick={() => dispatch({ type: 'removed', id: i.id })}>Remove</button>
          </li>
        ))}
      </ul>
      <p>Total: ₹{total}</p>
      <button onClick={() => dispatch({ type: 'cleared' })}>Clear</button>
    </>
  );
}
```

### Reducer rules

- **Pure**: no API calls, no `Math.random()`, no `Date.now()`; same input → same output.
- **Never mutate** `state`: return a new object.
- Always return a state (handle `default`).
- `dispatch` is stable (never changes), so it's safe to pass down and to leave out of dependency arrays.

### `useState` vs `useReducer`

| Use `useState` when | Use `useReducer` when |
| --- | --- |
| Independent simple values (a boolean, a string) | Several values that change together |
| Few ways to update | Many different update types |
| | Next state depends on complex logic you want to test separately |
| | You want to pass one `dispatch` down instead of many setters |

### Context + useReducer = simple global state

```jsx
const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  return <CartContext value={{ state, dispatch }}>{children}</CartContext>;
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
};

// anywhere
const { state, dispatch } = useCart();
dispatch({ type: 'added', product });
```

---

## 4. Rules of hooks

Hooks are functions starting with `use` (`useState`, `useEffect`, your own hooks). React relies on hooks being called **in the same order on every render**, so:

1. **Only call hooks at the top level** of a component or custom hook: not inside `if`, loops, nested functions, or after an early `return`.
2. **Only call hooks from React functions**: components or custom hooks, not regular JS functions or class components.

```jsx
function Profile({ userId }) {
  if (!userId) return null;          // ❌ early return BEFORE a hook
  const [user, setUser] = useState(null);
}

function Profile2({ userId }) {
  const [user, setUser] = useState(null);   // ✅ hooks first
  if (!userId) return null;                  // then conditions
}

if (isOpen) { useEffect(() => {}); }        // ❌ conditional hook
useEffect(() => { if (isOpen) { /* ... */ } });  // ✅ condition inside the hook
```

(The new `use()` API in React 19 is an exception: it may be called inside conditions.)

---

## 5. Custom hooks

A **custom hook** is a function whose name starts with `use` and that calls other hooks. It lets you **reuse stateful logic** between components. Each component using the hook gets **its own independent state**.

### `useToggle`

```jsx
function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = () => setOn((v) => !v);
  return [on, toggle];
}

function FAQ() {
  const [open, toggleOpen] = useToggle();
  return <button onClick={toggleOpen}>{open ? 'Hide' : 'Show'} answer</button>;
}
```

### `useLocalStorage`

```jsx
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved !== null ? JSON.parse(saved) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

const [theme, setTheme] = useLocalStorage('theme', 'light');
```

### `useDebounce`

```jsx
function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);       // restart the timer on every change
  }, [value, delay]);

  return debounced;
}

function Search() {
  const [text, setText] = useState('');
  const query = useDebounce(text, 400);  // only changes 400 ms after the user stops typing
  // fetch results using `query`
}
```

### `useFetch`

```jsx
function useFetch(url) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, error: null, loading: true });

    fetch(url, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ data: null, error, loading: false });
      });

    return () => controller.abort();
  }, [url]);

  return state;
}

const { data: posts, loading, error } = useFetch('/api/posts');
```

### Custom hook guidelines

- Name starts with `use` (required, so React and ESLint apply the hook rules).
- Return whatever is convenient: a value, a `[value, setter]` array (like `useState`, easy to rename), or an object (`{ data, loading, error }`, self-documenting).
- Custom hooks share **logic**, not **state**. To share state, use Context or a store.
- Extract a hook when the same `useState` + `useEffect` combination appears in several components, or to make a component easier to read.

More examples: [../03-extra-custom-hooks.md](../03-extra-custom-hooks.md).

---

## 6. Exercises

1. Create a `ThemeProvider` + `useTheme` hook; toggle a `dark` class on `<body>`.
2. Rewrite the to-do app's state with `useReducer` (`added`, `toggled`, `deleted`, `filterChanged`).
3. Build a cart with `CartProvider` (Context + `useReducer`), and use it in a `ProductList` and a `CartSummary`.
4. Write `useWindowSize()` returning `{ width, height }`, with cleanup.
5. Write `useOnClickOutside(ref, handler)` and use it to close a dropdown.
