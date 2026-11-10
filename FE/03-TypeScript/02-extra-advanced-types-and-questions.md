# TypeScript extra: advanced types, React typing patterns, Q&A

## Advanced type features (each with a one-liner to say)

### Conditional types + `infer`

```ts
// "If T is an array, give me its element type"
type ElementOf<T> = T extends (infer U)[] ? U : never;
type A = ElementOf<string[]>; // string

// Unwrap a promise (built-in: Awaited<T>)
type Unwrap<T> = T extends Promise<infer U> ? Unwrap<U> : T;

// Return type of a function (built-in: ReturnType<T>)
type MyReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

// Distributive over unions
type NonNull<T> = T extends null | undefined ? never : T;   // built-in: NonNullable
type X = NonNull<string | null | number>;                    // string | number
```

### Mapped types

```ts
type MyPartial<T> = { [K in keyof T]?: T[K] };
type MyReadonly<T> = { readonly [K in keyof T]: T[K] };
type Mutable<T> = { -readonly [K in keyof T]: T[K] };      // remove modifiers with "-"
type MyRequired<T> = { [K in keyof T]-?: T[K] };

// Key remapping with `as`
type Getters<T> = { [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K] };
type UserGetters = Getters<{ name: string; age: number }>;
// { getName: () => string; getAge: () => number }

// Filter keys by value type
type PickByType<T, V> = { [K in keyof T as T[K] extends V ? K : never]: T[K] };
type StringProps = PickByType<{ a: string; b: number; c: string }, string>; // { a: string; c: string }
```

### Implement the built-in utility types yourself (a common question)

```ts
type MyPick<T, K extends keyof T> = { [P in K]: T[P] };
type MyOmit<T, K extends keyof any> = MyPick<T, Exclude<keyof T, K>>;
type MyExclude<T, U> = T extends U ? never : T;
type MyExtract<T, U> = T extends U ? T : never;
type MyRecord<K extends keyof any, V> = { [P in K]: V };
type MyParameters<T extends (...args: any) => any> = T extends (...args: infer P) => any ? P : never;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};
```

### Template literal types

```ts
type Size = 'sm' | 'md' | 'lg';
type Color = 'primary' | 'danger';
type ButtonClass = `btn-${Color}-${Size}`;  // 6 combinations

type EventName<T extends string> = `on${Capitalize<T>}`;
type ClickHandler = EventName<'click'>;     // "onClick"

// Route params extraction (impressive in interviews)
type Params<S extends string> =
  S extends `${string}:${infer P}/${infer Rest}` ? P | Params<Rest>
  : S extends `${string}:${infer P}` ? P : never;
type R = Params<'/users/:userId/posts/:postId'>; // "userId" | "postId"
```

### Function overloads

```ts
function parse(input: string): number;
function parse(input: number): string;
function parse(input: string | number) {
  return typeof input === 'string' ? Number(input) : String(input);
}
const n = parse('42');  // number
const s = parse(42);    // string
```

### Type guards and assertion functions

```ts
// User-defined type guard
function isUser(x: unknown): x is User {
  return typeof x === 'object' && x !== null && 'id' in x && 'name' in x;
}

// Assertion function: narrows for the rest of the scope
function assertDefined<T>(value: T, msg?: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) throw new Error(msg ?? 'Value is not defined');
}

const el = document.getElementById('root');
assertDefined(el);
el.innerHTML = '';  // el is HTMLElement here
```

### `in`, `instanceof`, discriminants, and exhaustive checks

```ts
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; side: number }
  | { kind: 'rect'; w: number; h: number };

function area(s: Shape): number {
  switch (s.kind) {
    case 'circle': return Math.PI * s.radius ** 2;
    case 'square': return s.side ** 2;
    case 'rect':   return s.w * s.h;
    default: {
      const _exhaustive: never = s;   // compile error if a new kind is added
      return _exhaustive;
    }
  }
}
```

### `enum` vs union of literals vs `as const` object

```ts
enum Status { Idle, Loading }            // emits runtime JS, numeric enums are loosely typed
type Status2 = 'idle' | 'loading';       // zero runtime cost: preferred
const STATUS = { Idle: 'idle', Loading: 'loading' } as const;
type Status3 = (typeof STATUS)[keyof typeof STATUS]; // 'idle' | 'loading', plus a runtime object
```
Say: "I prefer string unions or `as const` objects. Enums generate code, and with `isolatedModules`/`erasableSyntaxOnly` some setups disallow them."

### Branded types (prevent mixing up IDs)

```ts
type UserId = string & { readonly __brand: 'UserId' };
type OrderId = string & { readonly __brand: 'OrderId' };
const toUserId = (s: string) => s as UserId;

function getUser(id: UserId) {}
getUser('abc' as OrderId); // ❌ error
```

### Variance one-liner

Function parameters are checked **contravariantly** under `strictFunctionTypes`: a `(a: Animal) => void` can be used where `(d: Dog) => void` is expected, but not the other way round.

---

## React + TypeScript patterns (beyond the basics)

### Generic component (a list that works for any item type)

```tsx
type ListProps<T> = {
  items: T[];
  getKey: (item: T) => string | number;
  renderItem: (item: T) => React.ReactNode;
  emptyText?: string;
};

export function List<T>({ items, getKey, renderItem, emptyText = 'No items' }: ListProps<T>) {
  if (items.length === 0) return <p>{emptyText}</p>;
  return <ul>{items.map((item) => <li key={getKey(item)}>{renderItem(item)}</li>)}</ul>;
}

// T is inferred as User
<List items={users} getKey={(u) => u.id} renderItem={(u) => u.name} />;
```

### Generic Select with typed onChange

```tsx
type Option<V extends string | number> = { label: string; value: V };

function Select<V extends string | number>({ options, value, onChange }: {
  options: Option<V>[]; value: V; onChange: (v: V) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(options[e.target.selectedIndex].value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
```

### Extending native element props

```tsx
type ButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  variant?: 'primary' | 'ghost';
  loading?: boolean;
};

export function Button({ variant = 'primary', loading, children, ...rest }: ButtonProps) {
  return (
    <button className={`btn btn-${variant}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? 'Loading…' : children}
    </button>
  );
}
// React 19 with ref as a prop: use ComponentProps<'button'> (includes ref)
```

### Polymorphic `as` prop

```tsx
type PolymorphicProps<E extends React.ElementType, P = {}> = P &
  { as?: E } &
  Omit<React.ComponentPropsWithoutRef<E>, keyof P | 'as'>;

function Text<E extends React.ElementType = 'span'>({ as, ...props }: PolymorphicProps<E>) {
  const Component = as ?? 'span';
  return <Component {...props} />;
}

<Text as="a" href="/home">Home</Text>;    // href is allowed because it's an anchor
<Text as="label" htmlFor="x">Label</Text>;
```

### Discriminated union props (mutually exclusive props)

```tsx
type AlertProps =
  | { type: 'success'; message: string }
  | { type: 'error'; message: string; onRetry: () => void };

function Alert(props: AlertProps) {
  return (
    <div role="alert">
      {props.message}
      {props.type === 'error' && <button onClick={props.onRetry}>Retry</button>}
    </div>
  );
}
// <Alert type="error" message="x" />  ❌ onRetry missing
```

### Typed context with a safe hook (no `undefined` checks everywhere)

```tsx
type AuthCtx = { user: User | null; login: (u: User) => void; logout: () => void };
const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;                       // AuthCtx, not AuthCtx | null
}
```

### Typed useReducer

```tsx
type State = { status: 'idle' | 'loading' | 'success' | 'error'; data: Item[]; error?: string };
type Action =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: Item[] }
  | { type: 'FETCH_ERROR'; error: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'FETCH_START':   return { ...state, status: 'loading' };
    case 'FETCH_SUCCESS': return { status: 'success', data: action.payload };
    case 'FETCH_ERROR':   return { ...state, status: 'error', error: action.error };
  }
}
const [state, dispatch] = useReducer(reducer, { status: 'idle', data: [] });
```

### Event types cheat sheet

| Event | Type |
| --- | --- |
| input change | `React.ChangeEvent<HTMLInputElement>` |
| select change | `React.ChangeEvent<HTMLSelectElement>` |
| form submit | `React.FormEvent<HTMLFormElement>` |
| click | `React.MouseEvent<HTMLButtonElement>` |
| key | `React.KeyboardEvent<HTMLInputElement>` |
| handler prop | `React.ChangeEventHandler<HTMLInputElement>` |
| children | `React.ReactNode` |
| style | `React.CSSProperties` |
| ref | `React.RefObject<HTMLDivElement>` / `useRef<HTMLDivElement>(null)` |
| setState prop | `React.Dispatch<React.SetStateAction<number>>` |

### Typing a component's props from another component

```ts
type CardProps = React.ComponentProps<typeof Card>;
type Data = Awaited<ReturnType<typeof fetchUser>>;
```

---

## tsconfig options worth knowing

| Option | Why |
| --- | --- |
| `strict: true` | Turns on `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, etc. |
| `noUncheckedIndexedAccess` | `arr[0]` becomes `T \| undefined`, which catches real bugs |
| `moduleResolution: "bundler"` | Matches Vite/webpack resolution |
| `jsx: "react-jsx"` | New JSX transform, no React import needed |
| `isolatedModules` | Each file must be transpilable alone (required by esbuild/SWC/Babel) |
| `paths` | Aliases like `@/components/*` (also configure them in Vite) |
| `skipLibCheck` | Faster builds; skips checking `.d.ts` files |
| `noEmit` | Let the bundler emit; `tsc` only type-checks (`tsc --noEmit` in CI) |

---

## Extra interview questions

**Q: `type` vs `interface`, the full answer?**
Both describe object shapes. `interface` supports **declaration merging** and `extends`, and gives slightly better error messages for objects. `type` can express **unions, intersections, primitives, tuples, mapped and conditional types**. My rule: `type` by default (or team convention), `interface` for public library APIs that consumers might augment.

**Q: What is declaration merging and module augmentation?**
```ts
interface Window { analytics: Analytics }   // merges with the global Window

declare module '@tanstack/react-query' {     // augment a library
  interface Register { defaultError: AxiosError }
}
```

**Q: `never` vs `void` vs `unknown`?**
`void`: a function returns nothing useful. `never`: it can never happen (throws, infinite loop, exhausted union). `unknown`: could be anything, so you must narrow before using it.

**Q: What is structural typing?**
TypeScript compares **shapes**, not names: any object with the required properties is compatible ("duck typing"). Branded types work around it when you need nominal-like behaviour.

**Q: What is excess property checking?**
Object literals assigned directly to a typed variable can't have extra properties (`const p: Point = { x: 1, y: 2, z: 3 }` errors). That doesn't apply when assigning an existing variable.

**Q: `satisfies` vs type annotation vs `as`?**
```ts
const routes = { home: '/', user: '/user/:id' } satisfies Record<string, string>;
routes.home;  // keeps literal keys: autocompletes 'home' | 'user'

const r2: Record<string, string> = { home: '/' };
r2.anything;  // widened: no key safety

const r3 = {} as Record<string, string>;  // a cast: no checking at all
```

**Q: `keyof typeof obj`, explain.**
`typeof obj` gets the obj's type, and `keyof` gets a union of its keys. Combined with `as const`, it gives you literal unions from runtime objects.

**Q: What does `readonly` do on arrays?**
`readonly string[]` (or `ReadonlyArray<string>`) removes the mutating methods `push`, `splice` and `sort`. That's great for props.

**Q: Abstract class vs interface?**
An abstract class can contain implementation and constructor logic and exists at runtime. An interface is type-only and erased. A class can `implements` many interfaces but `extends` only one class.

**Q: Access modifiers?**
`public` (default), `private` (compile-time only), `protected` (subclasses), `readonly`, and JS `#private` (runtime-enforced). Parameter properties: `constructor(private api: ApiClient) {}`.

**Q: How do you type a third-party JS library with no types?**
Install `@types/lib` if it exists. Otherwise write `declare module 'lib';` in a `.d.ts` for a quick fix, or write proper declarations.

**Q: What is a `.d.ts` file?**
Type declarations only, with no runtime code. They describe the shape of JS code for the compiler.

**Q: Why does `Object.keys` return `string[]`?**
Because of structural typing, an object may have **more** keys at runtime than its type says. To iterate typed keys: `(Object.keys(obj) as (keyof typeof obj)[])`, accepting the risk.

### Type challenges to practise (say the answer aloud)

```ts
// 1. Get the type of the first element of a tuple
type First<T extends any[]> = T extends [infer F, ...any[]] ? F : never;

// 2. Length of a tuple
type Length<T extends readonly any[]> = T['length'];

// 3. Make specific keys optional
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// 4. Value union of an object
type ValueOf<T> = T[keyof T];

// 5. Function that gets a typed property
function getProp<T, K extends keyof T>(obj: T, key: K): T[K] { return obj[key]; }

// 6. Typed groupBy
function groupBy<T, K extends PropertyKey>(arr: T[], fn: (item: T) => K): Record<K, T[]> {
  return arr.reduce((acc, item) => {
    (acc[fn(item)] ??= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}
```
