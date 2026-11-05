# Higher-Order Components (HOCs)

## What is a HOC?

A **Higher-Order Component is a function that takes a component and returns a new, enhanced component.**

```tsx
const EnhancedComponent = withSomething(WrappedComponent);
```

- `withSomething`: the HOC, a plain function. The `with` prefix is the naming convention.
- `WrappedComponent`: your original component, passed *in*.
- `EnhancedComponent`: the new component that comes *out*. It renders `WrappedComponent` plus extra behaviour.

The name comes from **higher-order functions** in JS, which take or return functions (`map`, `debounce`). A HOC does the same for components. It's the **decorator pattern** applied to React.

**Rules of a good HOC:**
1. **Don't mutate** the wrapped component. Wrap it with composition.
2. **Pass through unrelated props** (`{...props}`).
3. Name it `withX` and set a `displayName` for DevTools.
4. **Create the HOC outside render**, never inside a component.

## The simplest HOC

```tsx
function withLogger<Props extends object>(WrappedComponent: React.ComponentType<Props>) {
  function WithLogger(props: Props) {
    useEffect(() => {
      console.log(`${WrappedComponent.displayName || WrappedComponent.name} mounted`, props);
    }, []);
    return <WrappedComponent {...props} />;   // pass ALL props through
  }
  WithLogger.displayName = `withLogger(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  return WithLogger;
}

const Button = (props: { label: string }) => <button>{props.label}</button>;
const LoggedButton = withLogger(Button);
<LoggedButton label="Save" />;
```

**What the names mean:**
- `Props`: a TypeScript generic standing for *whatever props the wrapped component takes*. `extends object` just means "some props object". This is why `LoggedButton` still requires `label`.
- `WrappedComponent`: the component being enhanced (`Button` here).
- `WithLogger`: the component the HOC returns. It logs on mount, then renders `WrappedComponent` with every prop passed through (`{...props}`).
- `displayName`: the name shown in React DevTools, such as `withLogger(Button)`.
- `LoggedButton`: the result, used exactly like `Button`.

---

## Common use cases with code

### 1. Authentication / route protection: `withAuth`

```tsx
function withAuth<Props extends object>(WrappedComponent: React.ComponentType<Props>) {
  function WithAuth(props: Props) {
    const { user, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) return <Spinner />;
    if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
    return <WrappedComponent {...props} />;
  }
  WithAuth.displayName = `withAuth(${WrappedComponent.displayName || WrappedComponent.name})`;
  return WithAuth;
}

const ProtectedDashboard = withAuth(Dashboard);
// <Route path="/dashboard" element={<ProtectedDashboard />} />
```

- `user`: the logged-in user from your auth hook; `null` when logged out.
- `isLoading`: `true` while the app is still checking whether someone is logged in, so we don't redirect too early.
- `location`: the current URL. It's passed to the login page in `state.from`, so after logging in you return where you were.
- `replace`: replaces the history entry, so the Back button doesn't bounce you to the protected page again.

### 2. Role-based access: a HOC that takes config (a HOC factory)

```tsx
type Role = 'admin' | 'editor' | 'viewer';

const withRole =
  (allowedRoles: Role[]) =>
  <Props extends object>(WrappedComponent: React.ComponentType<Props>) => {
    function WithRole(props: Props) {
      const { user } = useAuth();
      if (!user || !allowedRoles.includes(user.role)) return <p>⛔ You don't have access.</p>;
      return <WrappedComponent {...props} />;
    }
    WithRole.displayName = `withRole(${WrappedComponent.displayName || WrappedComponent.name})`;
    return WithRole;
  };

const AdminPanel = withRole(['admin'])(Panel);
```

- `withRole(allowedRoles)`: a *HOC factory*, a function that takes config and **returns** a HOC. That's why there are two calls: `withRole(['admin'])` then `(Panel)`.
- `allowedRoles`: which roles may see the component.
- `user.role`: the current user's role, checked against the list.

### 3. Injecting props: `withUser` (data injection)

The HOC **provides** a prop, so the outer component's props type **removes** it:

```tsx
type WithUserProps = { user: User };

function withUser<Props extends WithUserProps>(WrappedComponent: React.ComponentType<Props>) {
  function WithUser(props: Omit<Props, keyof WithUserProps>) {
    const { data: user, isPending } = useQuery({ queryKey: ['me'], queryFn: getMe });
    if (isPending) return <Spinner />;
    if (!user) return null;
    return <WrappedComponent {...(props as Props)} user={user} />;
  }
  WithUser.displayName = `withUser(${WrappedComponent.displayName || WrappedComponent.name})`;
  return WithUser;
}

function Greeting({ user, greeting }: { user: User; greeting: string }) {
  return <h1>{greeting}, {user.name}</h1>;
}

const GreetingWithUser = withUser(Greeting);
<GreetingWithUser greeting="Welcome" />;   // ✅ no `user` prop needed: the HOC injects it
```

**What the names mean:**
- `WithUserProps`: the props this HOC *supplies* (`user`).
- `Props extends WithUserProps`: the wrapped component must accept a `user` prop.
- `Omit<Props, keyof WithUserProps>`: the outer component's props are the inner props *minus* `user`, so TypeScript won't ask callers for it.
- `user` / `isPending`: from TanStack Query, the logged-in user and whether it's still loading.
- `props as Props`: a type assertion. We know that once `user` is added back, the props are complete.

### 4. Loading state: `withLoading`

```tsx
function withLoading<Props extends object>(WrappedComponent: React.ComponentType<Props>) {
  return function WithLoading({ isLoading, ...props }: Props & { isLoading: boolean }) {
    if (isLoading) return <Spinner />;
    return <WrappedComponent {...(props as Props)} />;
  };
}

const UserListWithLoading = withLoading(UserList);
<UserListWithLoading isLoading={isPending} users={usersData ?? []} />;
```

- `isLoading`: an *extra* prop the HOC adds. It's pulled out with destructuring (`{ isLoading, ...props }`) so it isn't passed down to `UserList`.
- `props`: everything else, forwarded to the wrapped component.
- `usersData`: the fetched users (`undefined` while loading, hence `?? []`).

### 5. Error boundary as a HOC: `withErrorBoundary`

Error boundaries must be class components, so a HOC is a neat way to apply one to any function component:

```tsx
class ErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { reportToSentry(error, info); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

function withErrorBoundary<Props extends object>(WrappedComponent: React.ComponentType<Props>, fallback: React.ReactNode) {
  function WithErrorBoundary(props: Props) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  }
  WithErrorBoundary.displayName = `withErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name})`;
  return WithErrorBoundary;
}

const SafeChart = withErrorBoundary(RevenueChart, <p>Chart failed to load</p>);
// react-error-boundary ships this as withErrorBoundary(Component, { fallback })
```

- `fallback`: the UI shown if the wrapped component crashes while rendering.
- `hasError`: the boundary's state. It flips to `true` when a child throws.
- `reportToSentry(error, info)`: sends the error and `info.componentStack` (which components it passed through) to monitoring.
- `SafeChart`: `RevenueChart` wrapped in its own boundary, so a chart crash doesn't blank the whole page.

### 6. Analytics / tracking: `withTracking`

```tsx
const withPageView = <Props extends object>(WrappedComponent: React.ComponentType<Props>, pageName: string) =>
  function WithPageView(props: Props) {
    useEffect(() => { analytics.track('page_view', { page: pageName }); }, []);
    return <WrappedComponent {...props} />;
  };

export default withPageView(CheckoutPage, 'checkout');
```

- `pageName`: the name sent to analytics. It's passed as a second argument when the HOC is applied.
- The empty dependency array `[]` means the page view is tracked once, on mount.

### 7. Feature flags: `withFeatureFlag`

```tsx
const withFeatureFlag =
  (flagName: string, FallbackComponent: React.ComponentType = () => null) =>
  <Props extends object>(WrappedComponent: React.ComponentType<Props>) =>
    function WithFeatureFlag(props: Props) {
      const isFlagEnabled = useFeatureFlag(flagName);
      return isFlagEnabled ? <WrappedComponent {...props} /> : <FallbackComponent />;
    };

const NewCheckout = withFeatureFlag('new-checkout', OldCheckout)(CheckoutV2);
```

- `flagName`: which feature flag to check, such as `'new-checkout'`.
- `FallbackComponent`: rendered when the flag is off (the old checkout). It defaults to rendering nothing.
- `isFlagEnabled`: the flag's current value from your feature-flag service.
- `NewCheckout`: shows `CheckoutV2` to users with the flag on, and `OldCheckout` to everyone else.

### 8. Forwarding refs through a HOC

**React 18 and earlier:** HOCs don't pass `ref` automatically (it isn't a prop), so you need `forwardRef`:

```tsx
function withFocusRing<Props extends object>(WrappedComponent: React.ComponentType<Props>) {
  const WithFocusRing = React.forwardRef<HTMLElement, Props>((props, ref) => (
    <div className="focus-ring">
      <WrappedComponent {...props} ref={ref} />
    </div>
  ));
  WithFocusRing.displayName = `withFocusRing(${WrappedComponent.displayName || WrappedComponent.name})`;
  return WithFocusRing;
}
```

- `React.forwardRef<HTMLElement, Props>`: creates a component that receives `ref` as a *second argument* (`(props, ref)`), since before React 19 `ref` wasn't in `props`.
- `ref`: the parent's ref, passed on to the wrapped component so the parent can reach the real DOM node.

**React 19:** `ref` is a regular prop, so `{...props}` passes it through automatically, with no `forwardRef` needed.

---

## Composing multiple HOCs

```tsx
// Nested: hard to read
export default withAuth(withRole(['admin'])(withErrorBoundary(withPageView(AdminPage, 'admin'), <Oops />)));

// With a compose helper: reads top to bottom (outermost first)
const compose = (...hocs: Array<(component: any) => any>) => (BaseComponent: any) =>
  hocs.reduceRight((wrappedSoFar, applyHoc) => applyHoc(wrappedSoFar), BaseComponent);

export default compose(
  withAuth,
  withRole(['admin']),
  (component) => withErrorBoundary(component, <Oops />),
)(AdminPage);
```

- `hocs`: the list of HOCs to apply.
- `BaseComponent`: the original component (`AdminPage`).
- `reduceRight`: applies the HOCs from last to first, so the *first* one in the list ends up outermost.
- `wrappedSoFar`: the component after the HOCs applied so far.
- `applyHoc`: the current HOC being applied.
- `(component) => withErrorBoundary(component, <Oops />)`: a small adapter, because `withErrorBoundary` takes a second argument and `compose` only passes one.

This is **wrapper hell**: DevTools shows `withAuth(withRole(withErrorBoundary(AdminPage)))`, and it's hard to see where each prop comes from.

---

## HOCs you've probably already used

| Library | HOC | Modern hook replacement |
| --- | --- | --- |
| React | `React.memo(Component)` | Still a HOC, still used (or the React Compiler) |
| React | `React.lazy(() => import(...))` | Still used |
| React Router v5 | `withRouter(Component)` | `useNavigate`, `useParams`, `useLocation` |
| Redux | `connect(mapState, mapDispatch)(Component)` | `useSelector`, `useDispatch` |
| MUI (old) | `withStyles(styles)(Component)` | `sx` prop / `styled` |
| react-i18next | `withTranslation()(Component)` | `useTranslation` |
| Apollo (old) | `graphql(QUERY)(Component)` | `useQuery` |

`React.memo` **is** a HOC: it takes a component and returns a memoized one. That's a good thing to point out in an interview.

```tsx
// Redux connect: the classic HOC example
const mapStateToProps = (state: RootState) => ({ todos: state.todos });
const mapDispatchToProps = { addTodo };
export default connect(mapStateToProps, mapDispatchToProps)(TodoList);

// Same thing with hooks
function TodoList() {
  const todos = useSelector((state: RootState) => state.todos);
  const dispatch = useDispatch();
  ...
}
```

- `mapStateToProps`: picks data from the Redux store and passes it in as props (`todos`).
- `mapDispatchToProps`: action creators that become props; calling `props.addTodo()` dispatches the action.
- `connect(...)(TodoList)`: a HOC factory: configure it, then wrap the component.
- `useSelector` / `useDispatch`: the hook equivalents. They read from the store and dispatch directly inside the component.

---

## The same logic three ways: HOC vs render props vs custom hook

Task: track the mouse position.

```tsx
// 1. HOC
function withMouse<Props extends { mousePosition: { x: number; y: number } }>(WrappedComponent: React.ComponentType<Props>) {
  return function WithMouse(props: Omit<Props, 'mousePosition'>) {
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    return (
      <div onMouseMove={(event) => setMousePosition({ x: event.clientX, y: event.clientY })}>
        <WrappedComponent {...(props as Props)} mousePosition={mousePosition} />
      </div>
    );
  };
}
const CursorWithHoc = withMouse(({ mousePosition }) => <p>{mousePosition.x}, {mousePosition.y}</p>);

// 2. Render props
function MouseTracker({ children }: { children: (mousePosition: { x: number; y: number }) => React.ReactNode }) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  return <div onMouseMove={(event) => setMousePosition({ x: event.clientX, y: event.clientY })}>{children(mousePosition)}</div>;
}
<MouseTracker>{({ x, y }) => <p>{x}, {y}</p>}</MouseTracker>;

// 3. Custom hook ✅ (the modern choice)
function useMouse() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => setMousePosition({ x: event.clientX, y: event.clientY });
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);
  return mousePosition;
}
function CursorWithHook() {
  const { x, y } = useMouse();
  return <p>{x}, {y}</p>;
}
```

**What the names mean:**
- `mousePosition`: the cursor's `{ x, y }` coordinates. The same state appears in all three versions.
- `event.clientX` / `event.clientY`: the cursor position relative to the browser window.
- `withMouse` → `CursorWithHoc`: the HOC injects `mousePosition` as a prop. You can't tell from `CursorWithHoc` alone where it came from.
- `MouseTracker`: the render-prop component. `children` is a *function* it calls with `mousePosition`.
- `useMouse` → `CursorWithHook`: the hook simply returns the position. That's the clearest of the three.
- `handleMouseMove`: the window listener in the hook, removed in the cleanup.

| | HOC | Render props | Custom hook |
| --- | --- | --- | --- |
| Shares | Logic + can wrap UI | Logic + caller decides UI | Logic only |
| Extra components in tree | Yes (wrapper hell) | Yes (callback nesting) | **No** |
| Prop origin clear? | ❌ Props appear "magically" | ✅ | ✅ |
| Name collisions | ❌ Two HOCs can inject the same prop name | ✅ | ✅ (you name variables) |
| TypeScript | Tricky (`Omit`, generics) | OK | **Easy** |
| Can wrap/replace rendering (guards, boundaries) | **✅ Good at this** | ✅ | ❌ (a hook can't render a wrapper) |

---

## Problems with HOCs (know these)

1. **Wrapper hell**: deep nesting in DevTools, harder debugging.
2. **Unclear prop origins**: in `withA(withB(withC(Comp)))`, where did `data` come from?
3. **Prop name collisions**: two HOCs inject `loading`, and one silently overwrites the other.
4. **Static methods are lost**: `WrappedComponent.someStatic` isn't copied to the wrapper. Fix with the `hoist-non-react-statics` package.
5. **Refs aren't forwarded** (before React 19): you need `forwardRef`.
6. **Creating a HOC inside render breaks everything**:

```tsx
function Page() {
  const ProtectedProfile = withAuth(Profile);  // ❌ new component type every render, so it remounts and loses state
  return <ProtectedProfile />;
}
// ✅ Create it once, at module level:
const ProtectedProfile = withAuth(Profile);
```

- Inside `Page`, `withAuth(Profile)` runs on every render and returns a *new function* each time. React treats a new function as a different component type, so it unmounts the old one and mounts a fresh one, losing all state.

## When are HOCs still a good choice today?

- **Cross-cutting wrappers that need to control rendering**: auth guards, permission gates, error boundaries, feature flags, Suspense boundaries.
- **Applying the same wrapper to many components** at export time (e.g. `withPageView` on every page).
- **Library APIs** that must support class components.
- `React.memo` and `React.lazy`, which are HOCs built into React.

**Modern alternatives to consider first:** a custom hook for logic, or a **wrapper component with children** for rendering:

```tsx
// Wrapper component instead of withAuth
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}
<Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />;
```

- `RequireAuth`: a normal component that renders its `children` only if there's a `user`; otherwise it redirects. It does the same job as `withAuth`, but you can *see* the wrapping in the JSX.

---

## Testing a HOC

```tsx
it('withAuth redirects when logged out', () => {
  const SecretPage = () => <p>Secret</p>;
  const ProtectedSecretPage = withAuth(SecretPage);
  render(
    <AuthContext.Provider value={{ user: null, isLoading: false }}>
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route path="/secret" element={<ProtectedSecretPage />} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  expect(screen.getByText('Login page')).toBeInTheDocument();
  expect(screen.queryByText('Secret')).not.toBeInTheDocument();
});

it('passes props through', () => {
  const Echo = (props: { message: string }) => <p>{props.message}</p>;
  const EchoWithLogger = withLogger(Echo);
  render(<EchoWithLogger message="hi" />);
  expect(screen.getByText('hi')).toBeInTheDocument();
});
```

- `SecretPage` / `ProtectedSecretPage`: a dummy page and the same page wrapped in `withAuth`.
- `AuthContext.Provider value={{ user: null, … }}`: fakes a logged-out user for the test.
- `MemoryRouter initialEntries={['/secret']}`: a router that lives in memory, starting at `/secret`.
- `Echo` / `EchoWithLogger`: a tiny component that prints its `message` prop, used to prove the HOC passes props through untouched.

---

## Interview questions on HOCs

**Q: What is a HOC? Give an example.**
A function that takes a component and returns a new component with extra behaviour, such as `withAuth(Dashboard)`, which redirects to login when there's no user. `React.memo` and Redux's `connect` are well-known examples.

**Q: Is a HOC a component?**
No. A HOC is a **function**. What it **returns** is a component.

**Q: Why have hooks mostly replaced HOCs?**
Hooks share logic without adding components to the tree. Prop sources are explicit, there are no name collisions, and they're easy to type in TypeScript. HOCs caused wrapper hell and "magic" props.

**Q: When would you still write a HOC today?**
When I need to wrap **rendering**, not just share logic: auth or permission guards, error boundaries, feature flags, or applying the same wrapper to many exported components. Even then, a wrapper component with `children` is often clearer.

**Q: What problems can HOCs cause?**
Wrapper hell, unclear prop origins, prop collisions, lost static methods (use `hoist-non-react-statics`), refs not forwarded before React 19, and remounting if created inside render.

**Q: How do you type a HOC that injects a prop in TypeScript?**
Make it generic over the wrapped props `Props extends InjectedProps`, and have the returned component accept `Omit<Props, keyof InjectedProps>`, so consumers don't pass the injected prop.

**Q: How do you pass a ref through a HOC?**
Before React 19: wrap the inner component in `React.forwardRef` and pass `ref` down. In React 19, `ref` is a normal prop, so spreading props forwards it automatically.

**Q: HOC vs render props vs hooks: one line each?**
A HOC wraps a component and injects props. Render props pass a function that decides what to render. A hook is a function that returns state and logic, with no extra components. Hooks are preferred today. HOCs and render props are still useful for wrapping rendering.

**Q: Why set `displayName` on a HOC?**
So React DevTools and error messages show `withAuth(Dashboard)` instead of an anonymous component, which makes debugging much easier.
