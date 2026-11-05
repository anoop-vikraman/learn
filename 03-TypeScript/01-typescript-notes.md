## 2. TypeScript

Expect questions on typing React code and on the type system itself: `type` vs `interface`, generics, narrowing and utility types.

### Explained simply (read this first)

**TypeScript is JavaScript with labels.** You label what kind of value something is, and the editor warns you *before running* if you use it wrong. The labels are deleted when the code is compiled, so they don't exist in the browser.

```ts
let age: number = 30;
age = 'thirty';            // Error: string is not assignable to number

function add(a: number, b: number): number { return a + b; }
add(1, '2');               // Error caught while typing, not in production
```

**Describing objects: `type` and `interface` mostly do the same job.**

```ts
interface User { id: number; name: string; email?: string }   // ? = optional
type Product = { id: number; title: string; price: number };

// Only `type` can do unions ("one of these")
type Status = 'idle' | 'loading' | 'success' | 'error';

// Only `interface` merges when declared twice
interface Window { myGlobal: string }   // adds to the built-in Window type

// Both can extend
interface Admin extends User { permissions: string[] }
type Admin2 = User & { permissions: string[] };   // & = intersection ("both")
```

**`any` vs `unknown`:** `any` means "stop checking" (dangerous). `unknown` means "I don't know yet, so check before using it" (safe).

```ts
const a: any = JSON.parse(text);
a.foo.bar();               // no error... crashes at runtime

const u: unknown = JSON.parse(text);
u.foo;                     // Error: must narrow first
if (typeof u === 'object' && u !== null && 'foo' in u) { /* now allowed */ }
```

**Narrowing = TypeScript follows your if-checks.** After a check, it knows the more specific type.

```ts
function format(value: string | number) {
  if (typeof value === 'string') return value.toUpperCase(); // here: string
  return value.toFixed(2);                                   // here: number
}
```

**Discriminated unions = the best way to model UI states.** A shared field (`status`) tells TypeScript which shape you have, so you can't read `data` while loading.

```ts
type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: User[] };

function render(s: State) {
  switch (s.status) {
    case 'loading': return 'Loading...';
    case 'error':   return s.message;       // TS knows message exists here
    case 'success': return s.data.length;   // and data exists here
    default: {
      const _never: never = s;              // compile error if you add a status and forget it
      return _never;
    }
  }
}
```

**Generics = a type parameter, like a function argument but for types.** Write once, works for any type, and still keeps the exact type.

```ts
function first<T>(arr: T[]): T | undefined { return arr[0]; }
const n = first([1, 2, 3]);       // n: number
const s = first(['a', 'b']);      // s: string

// Constraint: T must have an id
function findById<T extends { id: number }>(items: T[], id: number) {
  return items.find(i => i.id === id);
}

// A generic API helper
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<T>;
}
const users = await getJson<User[]>('/api/users');
```

**Utility types = ready-made type transformers.**

```ts
interface User { id: number; name: string; email: string; password: string }

type UserUpdate  = Partial<User>;                 // all fields optional (for PATCH)
type PublicUser  = Omit<User, 'password'>;         // remove a field
type UserPreview = Pick<User, 'id' | 'name'>;      // keep only some fields
type ById        = Record<number, User>;           // { [id: number]: User }
type Frozen      = Readonly<User>;                 // can't reassign fields

function getUser() { return { id: 1, name: 'A' }; }
type FromFn = ReturnType<typeof getUser>;          // { id: number; name: string }
```

**`keyof` and `as const`:**

```ts
type UserKey = keyof User;                 // 'id' | 'name' | 'email' | 'password'
function getField(u: User, key: keyof User) { return u[key]; }

const ROLES = ['admin', 'editor', 'viewer'] as const;   // readonly tuple of literals
type Role = typeof ROLES[number];                       // 'admin' | 'editor' | 'viewer'
```

**`satisfies`:** checks a value matches a type but keeps the precise inferred type.

```ts
const routes = { home: '/', profile: '/profile' } satisfies Record<string, string>;
routes.home;      // still known as a key; typos like routes.hom are errors
```

### Typing React components step by step

```tsx
// 1. Props
type CardProps = {
  title: string;
  subtitle?: string;                 // optional
  children: React.ReactNode;         // anything renderable
  onClose: () => void;               // a function with no args
};
function Card({ title, subtitle, children, onClose }: CardProps) { /* ... */ }

// 2. State that starts empty
const [user, setUser] = useState<User | null>(null);
const [items, setItems] = useState<string[]>([]);      // without <string[]> it'd be never[]

// 3. Events
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value);
const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => e.preventDefault();
const handleClick  = (e: React.MouseEvent<HTMLButtonElement>) => {};

// 4. Refs
const inputRef = useRef<HTMLInputElement>(null);

// 5. Extending a native element's props (so all <button> props work)
type ButtonProps = React.ComponentProps<'button'> & { variant?: 'primary' | 'secondary' };
function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  return <button className={`btn btn-${variant} ${className ?? ''}`} {...rest} />;
}

// 6. A custom hook with a typed return
function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn(o => !o), []);
  return [on, toggle] as const;     // as const -> tuple [boolean, () => void], not (boolean | fn)[]
}

// 7. Typed context with a safe hook
const AuthContext = createContext<{ user: User | null } | undefined>(undefined);
function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
```

**Validating API data at runtime with Zod** (because TS types vanish at runtime):

```ts
import { z } from 'zod';
const UserSchema = z.object({ id: z.number(), name: z.string(), email: z.string().email() });
type User = z.infer<typeof UserSchema>;          // one source of truth for type + validation

const user = UserSchema.parse(await res.json()); // throws if the API sends garbage
```

### Core concepts

- **`type` vs `interface`:** both describe object shapes. Interfaces can be merged by redeclaring them and extended with `extends`. Types support unions, intersections, mapped types and conditional types. A common rule: interfaces for public object contracts, types for everything else.
- **`any` vs `unknown` vs `never`:** `any` turns off checking. `unknown` must be narrowed before use, so it's the safe choice for external data. `never` is the type of something that can't happen, which makes it useful for exhaustive checks.
- **Narrowing:** `typeof`, `instanceof`, `in`, discriminated unions (a shared `kind` field), and user-defined type guards (`function isUser(x): x is User`).
- **Generics:** `function first<T>(arr: T[]): T`, with constraints like `<T extends { id: string }>`.
- **Utility types:** `Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`, `ReturnType`, `Parameters`, `Awaited`, `NonNullable`, `Extract`, `Exclude`.
- **Advanced:** `keyof`, `typeof` on values, indexed access `T['key']`, mapped types, conditional types with `infer`, template literal types, `as const`, and `satisfies` (checks a value against a type while keeping the narrower inferred type).
- **Enums vs union literals:** many teams prefer `type Size = 'sm' | 'md'` because enums generate runtime code.

### TypeScript in React

```tsx
type ButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  variant?: 'primary' | 'ghost';
};

function Button({ variant = 'primary', ...rest }: ButtonProps) {
  return <button data-variant={variant} {...rest} />;
}

const [user, setUser] = useState<User | null>(null);
const inputRef = useRef<HTMLInputElement>(null);
const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {};

// Generic component
function List<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  return <ul>{items.map(render)}</ul>;
}
```

- `children: React.ReactNode` is the type for anything renderable.
- Many teams avoid `React.FC`: it adds little, and older versions added implicit `children`.
- Discriminated union props: `{ status: 'loading' } | { status: 'error'; error: Error } | { status: 'ok'; data: T }`.

### Likely questions

- `type` vs `interface`?
- `unknown` vs `any`?
- How do you type an API response you don't trust? (Use `unknown` + runtime validation with Zod.)
- Write a generic function or hook.
- What does `strict` mode enable? (`strictNullChecks`, `noImplicitAny`, and more.)

### Gotchas

- Types are erased at runtime, so TypeScript can't validate API data. Use Zod or Valibot for that.
- `as` casts lie to the compiler. Prefer narrowing.
- The non-null assertion `!` hides real null bugs.
- `Object.keys(obj)` returns `string[]`, not `(keyof T)[]`.
- Exhaustive `switch`: put `const _exhaustive: never = x;` in `default` to catch unhandled cases.
- Using `{}` as a type means "any non-null value", not "empty object".

