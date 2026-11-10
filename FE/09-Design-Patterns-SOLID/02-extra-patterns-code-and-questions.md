# Design patterns extra: more patterns in React/TS code + Q&A

## Container / Presentational (split data from UI)

```tsx
// Presentational: pure, easy to test and to put in Storybook
function UserListView({ users, onSelect }: { users: User[]; onSelect: (id: string) => void }) {
  return <ul>{users.map((u) => <li key={u.id} onClick={() => onSelect(u.id)}>{u.name}</li>)}</ul>;
}

// Container: in modern React, a custom hook takes this role
function UserListContainer() {
  const { data = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers });
  const navigate = useNavigate();
  return <UserListView users={data} onSelect={(id) => navigate(`/users/${id}`)} />;
}
```

## Provider pattern (dependency injection in React)

```tsx
interface Logger { log(msg: string): void; error(e: unknown): void }

const LoggerContext = createContext<Logger>(console as Logger);
export const useLogger = () => useContext(LoggerContext);

// Production
<LoggerContext.Provider value={sentryLogger}><App /></LoggerContext.Provider>
// Tests
<LoggerContext.Provider value={{ log: vi.fn(), error: vi.fn() }}><Component /></LoggerContext.Provider>
```
This is the **D** in SOLID: components depend on the `Logger` interface, not on Sentry.

## Strategy pattern (swap algorithms without if/else chains)

```ts
type SortStrategy<T> = (a: T, b: T) => number;

const sortStrategies: Record<'name' | 'price' | 'newest', SortStrategy<Product>> = {
  name: (a, b) => a.name.localeCompare(b.name),
  price: (a, b) => a.price - b.price,
  newest: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
};

const sorted = products.toSorted(sortStrategies[sortBy]);  // add a new sort = add a key (Open/Closed)
```

Also useful for validation rules, payment methods and export formats.

## Factory pattern (create the right object or component from data)

```tsx
const fieldComponents = {
  text: TextField,
  select: SelectField,
  checkbox: CheckboxField,
  date: DateField,
} satisfies Record<string, React.ComponentType<FieldProps>>;

function FormField({ field }: { field: FieldConfig }) {
  const Component = fieldComponents[field.type];
  return <Component {...field} />;
}

// Dynamic forms built from JSON config: a classic interview example
const schema: FieldConfig[] = [
  { type: 'text', name: 'name', label: 'Name' },
  { type: 'select', name: 'role', label: 'Role', options: ['dev', 'pm'] },
];
schema.map((f) => <FormField key={f.name} field={f} />);
```

## Adapter pattern (normalise the API shape for the UI)

```ts
// The API returns snake_case and nested data; the UI wants a clean model
type ApiUser = { user_id: number; first_name: string; last_name: string; profile: { avatar_url: string | null } };
type User = { id: number; fullName: string; avatar: string };

export const toUser = (u: ApiUser): User => ({
  id: u.user_id,
  fullName: `${u.first_name} ${u.last_name}`,
  avatar: u.profile.avatar_url ?? '/default-avatar.png',
});

// queryFn: () => api.get<ApiUser[]>('/users').then((list) => list.map(toUser))
```
When the backend changes, only the adapter changes, not 40 components.

## Facade pattern (a simple API over a complex subsystem)

```ts
// One API client hides fetch details: base URL, auth, errors, JSON parsing
class ApiClient {
  constructor(private baseUrl: string, private getToken: () => string | null) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...init.headers,
      },
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.status === 204 ? (undefined as T) : res.json();
  }

  get<T>(path: string, signal?: AbortSignal) { return this.request<T>(path, { signal }); }
  post<T>(path: string, body: unknown) { return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) }); }
  delete(path: string) { return this.request<void>(path, { method: 'DELETE' }); }
}

export const api = new ApiClient(import.meta.env.VITE_API_URL, () => localStorage.getItem('token'));
```

## Observer / Pub-Sub (decoupled communication)

```ts
type Listener<T> = (payload: T) => void;

function createEventBus<Events extends Record<string, unknown>>() {
  const listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};
  return {
    on<K extends keyof Events>(event: K, fn: Listener<Events[K]>) {
      (listeners[event] ??= new Set()).add(fn);
      return () => listeners[event]!.delete(fn);
    },
    emit<K extends keyof Events>(event: K, payload: Events[K]) {
      listeners[event]?.forEach((fn) => fn(payload));
    },
  };
}

const bus = createEventBus<{ 'toast:show': { message: string }; 'cart:updated': { count: number } }>();

// In React
useEffect(() => bus.on('toast:show', ({ message }) => setToasts((t) => [...t, message])), []);
```
Where you see it: DOM events, Redux/Zustand subscriptions, RxJS, `useSyncExternalStore`, WebSockets.

## Singleton (via ES modules)

```ts
// queryClient.ts: a module is evaluated once, so every import gets the same instance
export const queryClient = new QueryClient();
```
Caveat: singletons make testing harder (shared state) and break SSR (state shared between requests). Prefer creating one per request or per test where it matters.

## State machine with useReducer (impossible states become impossible)

```tsx
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: Data }
  | { status: 'error'; error: string };

type Event = { type: 'FETCH' } | { type: 'RESOLVE'; data: Data } | { type: 'REJECT'; error: string } | { type: 'RETRY' };

function machine(state: State, event: Event): State {
  switch (state.status) {
    case 'idle':    return event.type === 'FETCH' ? { status: 'loading' } : state;
    case 'loading':
      if (event.type === 'RESOLVE') return { status: 'success', data: event.data };
      if (event.type === 'REJECT') return { status: 'error', error: event.error };
      return state;                     // ignore FETCH while loading: no double submits
    case 'error':   return event.type === 'RETRY' ? { status: 'loading' } : state;
    case 'success': return state;
  }
}
```
Compare with `isLoading`, `isError` and `data` as three separate booleans, where `isLoading && isError` is possible. Mention XState for complex flows.

## Decorator / middleware (wrap behaviour)

```ts
// Function decorator: add logging/timing to any async function
const withTiming = <A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>) =>
  async (...args: A): Promise<R> => {
    const t = performance.now();
    try { return await fn(...args); }
    finally { console.debug(`${name} took ${(performance.now() - t).toFixed(1)}ms`); }
  };

const getUsersTimed = withTiming('getUsers', getUsers);
```
HOCs are the React version of the decorator pattern (`withAuth(Component)`).

## Render-props → hook migration (shows why hooks won)

```tsx
// Old: render props
<MousePosition>{({ x, y }) => <Cursor x={x} y={y} />}</MousePosition>

// New: hook
const { x, y } = useMousePosition();
return <Cursor x={x} y={y} />;
```

## Slots / composition pattern (avoids prop explosion)

```tsx
// ❌ Prop explosion
<Card title="..." subtitle="..." icon={...} actionLabel="..." onAction={...} footerText="..." />

// ✅ Composition
<Card>
  <Card.Header icon={<UserIcon />}>Profile</Card.Header>
  <Card.Body>...</Card.Body>
  <Card.Footer><Button>Save</Button></Card.Footer>
</Card>
```

---

## Clean code principles (quick definitions)

- **DRY**: don't repeat knowledge (but duplication is cheaper than the wrong abstraction: wait for the rule of three).
- **KISS**: the simplest thing that works.
- **YAGNI**: don't build for imagined future requirements.
- **Separation of concerns**: UI, state, data fetching and business logic live in different places.
- **Law of Demeter**: don't reach through objects (`user.company.address.city` across many layers).
- **Colocation**: keep code close to where it's used (styles, tests, hooks next to the component).
- **Pure functions + immutability**: predictable, testable.
- **Meaningful names**: `isLoading`, `hasError`, `handleSubmit`, `onSubmit` (prop) vs `handleSubmit` (implementation).
- **Early returns** instead of deep nesting.
- **Small functions and components** with one level of abstraction each.

## Refactoring a 600-line component: the answer structure

1. **Add tests first** (characterization tests on current behaviour).
2. **Extract pure helpers** (formatting, calculations) into `utils.ts`, and unit test them.
3. **Extract custom hooks** for data fetching and state logic (`useOrders`, `useOrderFilters`).
4. **Split UI** into presentational subcomponents by section.
5. **Replace boolean soup** with a discriminated union or reducer.
6. **Move server state** to TanStack Query and delete manual loading/error state.
7. Ship in small MRs and verify nothing changed.

---

## Extra interview questions

**Q: Composition vs inheritance: why does React prefer composition?**
Components get specialised by **props and children**, not by subclassing. Inheritance creates tight coupling and fragile hierarchies. Composition (children, slots, hooks) is more flexible: you can combine behaviours freely. Meta has thousands of components and never needed inheritance hierarchies.

**Q: What is coupling and cohesion?**
Coupling: how much modules depend on each other (aim **low**). Cohesion: how related the things inside one module are (aim **high**). A feature folder with its components, hooks and API together has high cohesion.

**Q: How do you apply Open/Closed in a React component library?**
Variants via config maps (`cva`), render slots and `children`, `asChild`/polymorphic `as` props, and className passthrough. Consumers can extend without you editing the component.

**Q: Give an example of Liskov violation in React.**
A custom `<Input>` that wraps `<input>` but ignores `onBlur`, or requires a prop the native one doesn't. Code expecting input behaviour breaks. Fix: spread the remaining native props (`...rest`) and keep the contract.

**Q: How do you structure a large React app? (detailed)**
```
src/
  app/            routes, providers, layout
  features/
    orders/
      api/        queries, mutations, adapters
      components/
      hooks/
      types.ts
      index.ts    public API: other features import only from here
  components/ui/  design-system primitives (shadcn)
  lib/            api client, utils, query client
  hooks/          shared generic hooks
  styles/
  test/           test utils, MSW handlers
```
Rules: features don't import each other's internals, shared code moves down to `lib`/`components`, and an ESLint import-boundaries rule enforces it.

**Q: Explain MVC/MVVM in the context of React.**
React is the **V** (view). With hooks, a custom hook acts like a ViewModel: it exposes state and actions to a dumb view. The Model is the server state (TanStack Query) plus domain logic.

**Q: What's a code smell? Name five in React.**
Huge components, `useEffect` used to sync derived state, prop drilling 5+ levels, many booleans for one status, copy-pasted fetch logic, `any` everywhere, deeply nested ternaries in JSX, an index as key in dynamic lists.
