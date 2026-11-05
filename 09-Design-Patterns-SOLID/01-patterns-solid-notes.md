## 8. Design patterns, clean code, OOP, SOLID

The winning move is translating each principle into a concrete React or TypeScript example. Interviewers want to hear that you apply these ideas, not just define them.

### Explained simply (read this first)

**SOLID = five rules that make code easy to change without breaking other things.** Here is each one as a before/after.

**S: Single Responsibility. One component or function = one job.**

```tsx
// Before: fetching + filtering + rendering all mixed together
function UserPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { fetch('/api/users').then(r => r.json()).then(setUsers); }, []);
  const visible = users.filter(u => u.name.toLowerCase().includes(q.toLowerCase()));
  return <>{/* input + big list markup */}</>;
}

// After: each piece has one reason to change
function useUsers() { return useQuery({ queryKey: ['users'], queryFn: fetchUsers }); } // data
const filterUsers = (users: User[], q: string) =>                                     // logic (easy to unit test)
  users.filter(u => u.name.toLowerCase().includes(q.toLowerCase()));
function UserList({ users }: { users: User[] }) { /* only rendering */ }              // UI

function UserPage() {
  const { data = [] } = useUsers();
  const [q, setQ] = useState('');
  return <><SearchInput value={q} onChange={setQ} /><UserList users={filterUsers(data, q)} /></>;
}
```

**O: Open/Closed. Add new behaviour without editing existing code.**

```tsx
// Before: every new alert type means editing this component
function Alert({ type }: { type: string }) {
  if (type === 'success') return <div className="green">✓ Done</div>;
  if (type === 'error') return <div className="red">✗ Failed</div>;
  // ...keeps growing
}

// After: extend through props/composition; the component never changes
function Alert({ icon, tone, children }: { icon: React.ReactNode; tone: string; children: React.ReactNode }) {
  return <div className={`alert alert-${tone}`}>{icon}{children}</div>;
}
<Alert tone="warning" icon={<WarnIcon />}>Disk almost full</Alert>   // new case, no edits
```

**L: Liskov Substitution. A specialised version must work anywhere the general one does.**

```tsx
// IconButton can replace a <button> anywhere, because it accepts and forwards all button props
type IconButtonProps = React.ComponentProps<'button'> & { icon: React.ReactNode };
function IconButton({ icon, children, ...buttonProps }: IconButtonProps) {
  return <button {...buttonProps}>{icon}{children}</button>;   // onClick, disabled, type... all still work
}
// Violation: an IconButton that ignores `disabled` or `onClick` breaks code expecting a normal button.
```

**I: Interface Segregation. Don't make components depend on data they don't use.**

```tsx
// Before: needs a whole User just to show an avatar, so it's hard to reuse and test
function Avatar({ user }: { user: User }) { return <img src={user.avatarUrl} alt={user.name} />; }

// After: asks only for what it needs
function Avatar({ src, alt }: { src: string; alt: string }) { return <img src={src} alt={alt} />; }
<Avatar src={user.avatarUrl} alt={user.name} />
<Avatar src={team.logo} alt={team.title} />     // now reusable for teams too
```

**D: Dependency Inversion. Depend on an interface, not a specific implementation.**

```tsx
// The component doesn't know if data comes from fetch, axios, or a fake
interface UserService { getUsers(): Promise<User[]> }

const ServiceContext = createContext<UserService>(httpUserService);

function UserList() {
  const service = useContext(ServiceContext);
  const { data } = useQuery({ queryKey: ['users'], queryFn: () => service.getUsers() });
  // ...
}

// In tests, inject a fake. No network, no mocking libraries needed.
const fakeService: UserService = { getUsers: async () => [{ id: 1, name: 'Ann' }] };
render(<ServiceContext.Provider value={fakeService}><UserList /></ServiceContext.Provider>);
```

### OOP in TypeScript, with one example covering all four pillars

```ts
interface Shape { area(): number }                          // ABSTRACTION: what, not how

abstract class BaseShape implements Shape {
  constructor(protected readonly name: string) {}
  abstract area(): number;
  describe() { return `${this.name}: ${this.area().toFixed(2)}`; }
}

class Circle extends BaseShape {                            // INHERITANCE
  #radius: number;                                          // ENCAPSULATION: truly private field
  constructor(radius: number) { super('Circle'); this.#radius = radius; }
  area() { return Math.PI * this.#radius ** 2; }
}

class Square extends BaseShape {
  constructor(private side: number) { super('Square'); }
  area() { return this.side ** 2; }
}

const shapes: Shape[] = [new Circle(2), new Square(3)];
shapes.forEach(s => console.log(s.area()));                 // POLYMORPHISM: same call, different behaviour
```

**Composition over inheritance, the React way:** instead of `class AdminButton extends Button`, you wrap or pass pieces in.

```tsx
function Dialog({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return <div role="dialog"><h2>{title}</h2>{children}<footer>{footer}</footer></div>;
}
const ConfirmDialog = (p: { onYes: () => void }) => (
  <Dialog title="Are you sure?" footer={<button onClick={p.onYes}>Yes</button>}>This can't be undone.</Dialog>
);
```

### React patterns with code

**Compound components:** parts that share hidden state, like `<select>` and `<option>`.

```tsx
const TabsContext = createContext<{ active: string; setActive: (v: string) => void } | null>(null);

function Tabs({ defaultValue, children }: { defaultValue: string; children: React.ReactNode }) {
  const [active, setActive] = useState(defaultValue);
  return <TabsContext.Provider value={{ active, setActive }}>{children}</TabsContext.Provider>;
}
function Tab({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = useContext(TabsContext)!;
  return <button aria-selected={ctx.active === value} onClick={() => ctx.setActive(value)}>{children}</button>;
}
function Panel({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = useContext(TabsContext)!;
  return ctx.active === value ? <div>{children}</div> : null;
}
Tabs.Tab = Tab; Tabs.Panel = Panel;

// Usage: clean and flexible
<Tabs defaultValue="profile">
  <Tabs.Tab value="profile">Profile</Tabs.Tab>
  <Tabs.Tab value="settings">Settings</Tabs.Tab>
  <Tabs.Panel value="profile">...</Tabs.Panel>
  <Tabs.Panel value="settings">...</Tabs.Panel>
</Tabs>
```

**Higher-order component (HOC):** a function that takes a component and returns an enhanced one. Mostly replaced by hooks now.

```tsx
function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function Protected(props: P) {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" />;
    return <Component {...props} />;
  };
}
export default withAuth(Dashboard);
```

**Render props:** pass a function that decides what to render.

```tsx
function MouseTracker({ render }: { render: (pos: { x: number; y: number }) => React.ReactNode }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return <div onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}>{render(pos)}</div>;
}
<MouseTracker render={({ x, y }) => <p>{x}, {y}</p>} />
// Modern version: a useMousePosition() hook
```

### Classic design patterns in frontend code

```ts
// SINGLETON: one shared instance
export const apiClient = axios.create({ baseURL: '/api' });

// FACTORY: create the right object from input
function createNotifier(kind: 'email' | 'sms'): Notifier {
  return kind === 'email' ? new EmailNotifier() : new SmsNotifier();
}

// STRATEGY: swap the algorithm
const sorters = {
  name:  (a: User, b: User) => a.name.localeCompare(b.name),
  date:  (a: User, b: User) => +new Date(b.createdAt) - +new Date(a.createdAt),
};
users.sort(sorters[sortBy]);

// ADAPTER: convert API shape -> UI shape (keeps API changes out of components)
const toUser = (dto: UserDTO): User => ({ id: dto.user_id, name: `${dto.first_name} ${dto.last_name}` });

// OBSERVER: subscribe to changes
class EventBus {
  private listeners = new Map<string, Set<(data: unknown) => void>>();
  on(evt: string, fn: (d: unknown) => void) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt)!.add(fn);
    return () => this.listeners.get(evt)!.delete(fn);   // unsubscribe
  }
  emit(evt: string, data?: unknown) { this.listeners.get(evt)?.forEach(fn => fn(data)); }
}
```

### Clean code: before and after

```ts
// Before
function p(d: any) {
  if (d) { if (d.items.length > 0) { if (d.user.age >= 18) { return d.items.filter((x: any) => x.s === 1); } } }
  return [];
}

// After: clear names, early returns, no magic numbers, typed
const ADULT_AGE = 18;
const STATUS_ACTIVE = 1;

function getActiveItemsForAdult(order: Order | null): Item[] {
  if (!order || order.items.length === 0) return [];
  if (order.user.age < ADULT_AGE) return [];
  return order.items.filter(item => item.status === STATUS_ACTIVE);
}
```

### SOLID with frontend examples

| Principle | Meaning | React / TS example |
| --- | --- | --- |
| **S**ingle Responsibility | One reason to change | Split a component that fetches, transforms and renders into a `useUsers()` hook + a presentational `UserList` |
| **O**pen/Closed | Open for extension, closed for modification | A `Button` that accepts `variant`, `icon` and `children` instead of editing it for each new case; render props and slots |
| **L**iskov Substitution | Subtypes usable wherever the base type is | `<IconButton>` accepts every prop `<button>` does (extends `ComponentProps<'button'>`), so it works anywhere a button would |
| **I**nterface Segregation | Don't force unused dependencies | Pass `onSelect` and `name`, not the whole `user` object; small, focused prop types |
| **D**ependency Inversion | Depend on abstractions | Components call an injected `api` service or hook (via props or Context), so tests can swap in a fake |

### OOP pillars (in TypeScript)

- **Encapsulation:** `private`/`#private` fields, exposing only methods.
- **Abstraction:** interfaces and abstract classes hide the details.
- **Inheritance:** `extends`. Favour **composition over inheritance**, which is exactly React's model (the React docs recommend composition).
- **Polymorphism:** different classes implementing the same interface (`PaymentProvider.pay()`).

### Design patterns that come up

- **React patterns:** container/presentational, custom hooks (the modern container), compound components (`<Tabs><Tabs.List/><Tabs.Panel/></Tabs>` sharing state via Context), render props, HOCs (`withAuth`), controlled/uncontrolled, provider pattern, state reducer, headless components (Radix, TanStack Table).
- **Gang of Four patterns in the frontend:**
  - Observer: event emitters, store subscriptions, RxJS.
  - Singleton: one `QueryClient`, an API client module.
  - Factory: creating components or services from config.
  - Strategy: swappable validation or sorting functions.
  - Adapter: mapping API DTOs to UI models.
  - Decorator: HOCs, Stencil decorators.
  - Facade: a simple `api.users.get()` over fetch details.
  - Module: ES modules.
- **Architecture:** feature-based folders (`features/cart/{components,hooks,api}`), separating domain logic from UI, atomic design for component libraries, micro-frontends.

### Clean code checklist

- Meaningful names; small, single-purpose functions; early returns over nested ifs.
- DRY, but avoid the wrong abstraction ("duplication is cheaper than the wrong abstraction"). KISS, YAGNI.
- Pure functions and immutability; no magic numbers (use named constants).
- Consistent formatting via ESLint + Prettier, type safety, tests as documentation.
- Code review: readability first, small merge requests.

### Likely questions

- Explain SOLID with an example from your own code.
- Composition vs inheritance in React?
- How do you structure a large React app?
- What is a compound component? Build a simple `Accordion`.
- How do you refactor a 600-line component? (Extract hooks, split by responsibility, add tests first.)

### Gotchas

- Don't claim React class inheritance is a good idea. React recommends composition.
- Over-abstracting too early is itself a clean-code smell.
- HOCs and render props are mostly replaced by hooks; know why (wrapper hell, unclear prop origins).

