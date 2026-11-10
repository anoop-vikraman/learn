# 06 · Performance, routing, styling and project structure

## 1. Performance basics

By default, **when a component re-renders, all of its children re-render too**. That's usually fine: React is fast, and it only changes the real DOM where needed. Optimize only when you **measure** a problem (React DevTools → Profiler, or "Highlight updates when components render").

**First fixes (no special APIs):**
- **Move state down**: keep state in the smallest component that needs it, so fewer components re-render.
- **Pass components as `children`**: children created by a parent don't re-render when a wrapper's state changes.
- Use stable **keys**.
- Don't do heavy work during render that you could do once.

### `React.memo`: skip re-rendering if props didn't change

```jsx
import { memo } from 'react';

const ProductRow = memo(function ProductRow({ product, onSelect }) {
  console.log('render', product.name);
  return <li onClick={() => onSelect(product.id)}>{product.name}</li>;
});
```

`memo` compares each prop with its previous value (shallow, `Object.is`). ⚠️ It's useless if you pass a **new object, array or function** every render, because those are always "different". That's why `memo` is usually combined with `useCallback`/`useMemo`.

### `useCallback`: keep the same function between renders

```jsx
const handleSelect = useCallback((id) => {
  setSelectedId(id);
}, []);                  // same function until the dependencies change

<ProductRow product={p} onSelect={handleSelect} />   // memo now works
```

### `useMemo`: cache a calculated value

```jsx
const visibleProducts = useMemo(
  () => products.filter((p) => p.name.includes(search)).toSorted(byPrice),
  [products, search]     // recompute only when these change
);

const style = useMemo(() => ({ color: theme.primary }), [theme.primary]);  // stable object prop
```

| API | Caches | Use when |
| --- | --- | --- |
| `memo(Component)` | the rendered component | A component re-renders often with the same props and is slow |
| `useCallback(fn, deps)` | a function | Passing a callback to a `memo` child, or using it as an effect dependency |
| `useMemo(() => value, deps)` | a computed value | Expensive calculations, or stable objects/arrays passed to `memo` children/effects |

`useCallback(fn, deps)` is the same as `useMemo(() => fn, deps)`.

⚠️ **Don't wrap everything.** Memoization costs memory and comparisons, and makes code harder to read. **React Compiler** (opt-in, React 19 era) can add memoization automatically.

### Other performance tools

- **Lazy loading / code splitting**: load a component's code only when it's needed (section 4).
- **Virtualization** for long lists (thousands of rows): render only visible rows (`@tanstack/react-virtual`, `react-window`).
- **`useTransition` / `useDeferredValue`**: keep typing responsive while a slow list updates (see [../07-new-hooks-react-18-19.md](../07-new-hooks-react-18-19.md)).
- **Debounce** search inputs before fetching.

---

## 2. Routing with React Router

A single-page app (SPA) has one HTML page; a **router** shows different components for different URLs without reloading the page.

```bash
npm install react-router
```

*(React Router v7 is imported from `react-router`; v6 used `react-router-dom`, and the APIs below are the same.)*

### Setup

```jsx
// main.jsx
import { BrowserRouter } from 'react-router';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
```

```jsx
// App.jsx
import { Routes, Route, Link, NavLink } from 'react-router';

export default function App() {
  return (
    <>
      <nav>
        <NavLink to="/" end>Home</NavLink>          {/* adds class "active" when matched */}
        <NavLink to="/products">Products</NavLink>
        <Link to="/about">About</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<ProductList />} />
        <Route path="/products/:id" element={<ProductDetail />} />   {/* URL parameter */}
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />                     {/* anything else */}
      </Routes>
    </>
  );
}
```

⚠️ Use `<Link to>` instead of `<a href>` for internal links: `<a>` reloads the whole page and loses state.

### Reading URL parameters and query strings

```jsx
import { useParams, useSearchParams } from 'react-router';

function ProductDetail() {
  const { id } = useParams();                  // /products/42 → id = '42' (always a string)
  // fetch product by id...
}

function ProductList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') ?? 1);            // /products?page=2
  return <button onClick={() => setSearchParams({ page: String(page + 1) })}>Next</button>;
}
```

Keeping filters, pagination and tabs in the URL means they survive refresh and can be shared.

### Navigating in code

```jsx
import { useNavigate } from 'react-router';

function LoginForm() {
  const navigate = useNavigate();
  async function handleSubmit(e) {
    e.preventDefault();
    await login();
    navigate('/dashboard', { replace: true });   // replace: Back button won't return to the login page
  }
  // navigate(-1) goes back
}
```

### Nested routes and layouts

```jsx
import { Outlet } from 'react-router';

function DashboardLayout() {
  return (
    <div className="dashboard">
      <Sidebar />
      <main><Outlet /></main>          {/* child route renders here */}
    </div>
  );
}

<Route path="/dashboard" element={<DashboardLayout />}>
  <Route index element={<Overview />} />              {/* /dashboard */}
  <Route path="settings" element={<Settings />} />    {/* /dashboard/settings */}
</Route>
```

### Protected routes

```jsx
import { Navigate, Outlet, useLocation } from 'react-router';

function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

<Route element={<RequireAuth />}>
  <Route path="/dashboard" element={<Dashboard />} />
</Route>
```

⚠️ Hiding pages in the frontend is for user experience only. The **server must check permissions** for every API request.

**Deployment note:** with `BrowserRouter`, the server must return `index.html` for every URL (an "SPA fallback"), or refreshing `/products/42` gives a 404.

---

## 3. Styling options

| Option | How | Pros | Cons |
| --- | --- | --- | --- |
| Plain CSS | `import './App.css'`, `className="card"` | Simple | Global: class names can clash |
| **CSS Modules** | `Button.module.css` → `import styles from ...`, `className={styles.button}` | Scoped automatically, plain CSS | Dynamic styles are a bit clunky |
| **Tailwind CSS** | `className="px-4 py-2 rounded bg-blue-600"` | Fast to build, consistent design tokens, tiny CSS output | Long class lists |
| CSS-in-JS (styled-components, Emotion) | `const Btn = styled.button\`...\`` | Styles next to components, dynamic from props | Runtime cost; issues with Server Components |
| Component libraries (MUI, Chakra, shadcn/ui) | Ready-made components | Very fast, accessible | Learning their API; customizing |
| Inline `style={{ }}` | Object with camelCase keys | Truly dynamic values | No hover/media queries; hard to maintain |
| SASS/SCSS | `.scss` files, variables, nesting | Powerful CSS | Extra build step |

### CSS Modules example

```css
/* Button.module.css */
.button { padding: 0.5rem 1rem; border-radius: 6px; }
.primary { background: #4f46e5; color: white; }
```

```jsx
import styles from './Button.module.css';

export function Button({ variant = 'primary', children, ...rest }) {
  return (
    <button className={`${styles.button} ${styles[variant]}`} {...rest}>
      {children}
    </button>
  );
}
```

---

## 4. Lazy loading (code splitting)

Load parts of the app only when they're needed, so the first page loads faster.

```jsx
import { lazy, Suspense } from 'react';

const Reports = lazy(() => import('./pages/Reports'));     // separate file in the build

function App() {
  return (
    <Suspense fallback={<p>Loading…</p>}>                   {/* shown while the code downloads */}
      <Routes>
        <Route path="/reports" element={<Reports />} />
      </Routes>
    </Suspense>
  );
}
```

⚠️ The lazily imported file must have a **default export**. Declare `lazy()` at the top level of a module, never inside a component.

---

## 5. Error boundaries

If a component throws during rendering, React removes the **whole app** from the screen (a blank page). An **error boundary** catches errors in its children and shows a fallback instead. Error boundaries must be **class components** (or use the `react-error-boundary` package).

```jsx
import { Component } from 'react';

class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };             // show the fallback on the next render
  }

  componentDidCatch(error, info) {
    console.error(error, info.componentStack);   // send to a logging service (e.g. Sentry)
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? <p>Something went wrong.</p>;
    return this.props.children;
  }
}

<ErrorBoundary fallback={<p>Could not load the chart.</p>}>
  <SalesChart />
</ErrorBoundary>
```

They do **not** catch errors in event handlers, async code (`setTimeout`, promises) or the boundary itself. Use `try/catch` there.

With the package: `<ErrorBoundary FallbackComponent={Fallback} onReset={...}>` from `react-error-boundary`.

---

## 6. Portals (quick mention)

`createPortal(children, domNode)` renders children into a different DOM node (e.g. `document.body`) while keeping them in the React tree. It's used for modals, tooltips and toasts, so they aren't clipped by `overflow: hidden` or z-index. See [../08-portals.md](../08-portals.md).

---

## 7. Project structure

For small apps, a flat structure is fine. As apps grow, **group by feature**:

```
src/
  main.jsx
  App.jsx
  routes/                 # route definitions or page components
  components/             # shared, reusable UI (Button, Modal, Card)
    Button/
      Button.jsx
      Button.module.css
      Button.test.jsx
  features/               # one folder per feature: its components, hooks, api, state
    cart/
      CartPage.jsx
      CartItem.jsx
      useCart.js
      cartApi.js
    auth/
  hooks/                  # shared custom hooks (useDebounce, useLocalStorage)
  context/                # app-wide providers
  lib/ or utils/          # pure helpers (formatCurrency, dates)
  api/                    # fetch/axios setup
  assets/                 # images, fonts
```

Guidelines:
- Components: **PascalCase** file and function names (`ProductCard.jsx`). Hooks: `useSomething.js`.
- Keep business logic out of JSX: move it into pure functions and custom hooks, which are easier to test.
- Avoid deep relative imports (`../../../`): configure an alias like `@/components/Button` in Vite.

---

## 8. Testing (a first look)

The standard tools are **Vitest** (or Jest) + **React Testing Library**. Test what the user sees and does, not implementation details.

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Counter from './Counter';

test('increments when clicked', async () => {
  render(<Counter />);
  await userEvent.click(screen.getByRole('button', { name: '+1' }));
  expect(screen.getByText('You clicked 1 times')).toBeInTheDocument();
});
```

More in [../../05-Testing/](../../05-Testing/).

---

## 9. Where to go next

- **TypeScript with React**: [../../03-TypeScript/basics/05-typescript-with-react.md](../../03-TypeScript/basics/05-typescript-with-react.md)
- **Server data**: TanStack Query ([../../04-TanStack-Query/](../../04-TanStack-Query/))
- **Global state**: Zustand / Redux Toolkit ([../../15-Zustand-Redux/](../../15-Zustand-Redux/))
- **Forms**: React Hook Form + Zod
- **React 18/19 features**: [../07-new-hooks-react-18-19.md](../07-new-hooks-react-18-19.md)
- **Frameworks**: Next.js / React Router framework mode (server rendering, file-based routing)

---

## 10. Exercises

1. Build a 3-page app (Home, Products, Product detail) with React Router, a NotFound page and a shared layout.
2. Keep the product search text and page number in the URL with `useSearchParams`.
3. Add a protected `/account` route that redirects to `/login`.
4. Profile a list of 2,000 items with React DevTools, then use `memo` + `useCallback` and compare.
5. Wrap a component that throws in an error boundary and show a friendly fallback.
