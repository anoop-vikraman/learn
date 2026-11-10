# 03 · Unions, narrowing and generics

## 1. Union types: "this OR that"

```ts
let id: string | number;
id = 101;       // ✅
id = 'abc';     // ✅
id = true;      // ❌

type Status = 'idle' | 'loading' | 'success' | 'error';   // union of literal types
let status: Status = 'idle';
```

With a union, you can only use what is **common to all members** until you narrow it:

```ts
function printId(id: string | number) {
  id.toUpperCase();        // ❌ Property 'toUpperCase' does not exist on type 'number'
  console.log(id.toString());   // ✅ both have toString
}
```

---

## 2. Narrowing

**Narrowing** means checking a value so TypeScript knows its more specific type inside that branch.

### `typeof`: for primitives

```ts
function format(value: string | number) {
  if (typeof value === 'string') {
    return value.toUpperCase();     // value: string
  }
  return value.toFixed(2);          // value: number (the only option left)
}
```

### Truthiness and equality

```ts
function greet(name?: string | null) {
  if (!name) return 'Hello, stranger';   // handles undefined, null and ''
  return `Hello, ${name}`;               // name: string
}

function compare(a: string | number, b: string | boolean) {
  if (a === b) {
    a;   // string: the only type they share
  }
}

if (value != null) { /* excludes both null and undefined */ }
```

### `in`: check for a property

```ts
type Fish = { swim: () => void };
type Bird = { fly: () => void };

function move(animal: Fish | Bird) {
  if ('swim' in animal) animal.swim();   // Fish
  else animal.fly();                     // Bird
}
```

### `instanceof`: for classes

```ts
function logError(err: unknown) {
  if (err instanceof Error) {
    console.error(err.message);          // Error
  } else {
    console.error(String(err));
  }
}

function handle(date: Date | string) {
  return date instanceof Date ? date.toISOString() : date;
}
```

### `Array.isArray`

```ts
function toList(input: string | string[]) {
  return Array.isArray(input) ? input : [input];
}
```

### Custom type guards (`value is Type`)

```ts
interface User { id: number; name: string }

function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value && typeof value.id === 'number' &&
    'name' in value && typeof value.name === 'string'
  );
}

const data: unknown = await res.json();
if (isUser(data)) {
  data.name;      // ✅ User
}

// Useful with filter: removes null/undefined AND narrows the type
const names = ['a', null, 'b', undefined].filter((x): x is string => x != null);  // string[]
```

⚠️ A type guard is only as correct as your check. If the function returns `true` wrongly, TypeScript believes it.

*(Newer TypeScript versions (5.5+) infer simple guards like `filter(x => x !== null)` automatically.)*

### Assertion functions

```ts
function assertIsDefined<T>(value: T, msg?: string): asserts value is NonNullable<T> {
  if (value == null) throw new Error(msg ?? 'Value is not defined');
}

const el = document.getElementById('root');
assertIsDefined(el);
el.textContent = 'ok';     // el: HTMLElement (not null)
```

---

## 3. Discriminated unions (very important)

Give every member of a union a common property with a **unique literal value** (the **discriminant**, often `type`, `kind` or `status`). Checking it narrows to the exact member.

```ts
type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: User[] }
  | { status: 'error'; error: string };

function render(state: RequestState) {
  switch (state.status) {
    case 'idle':
      return 'Not started';
    case 'loading':
      return 'Loading…';
    case 'success':
      return `${state.data.length} users`;   // ✅ data exists only here
    case 'error':
      return `Error: ${state.error}`;        // ✅ error exists only here
  }
}
```

This makes **impossible states impossible**: you can't have `data` and `error` at the same time, or `data` while loading. Compare with `{ isLoading: boolean; data?: User[]; error?: string }`, which allows nonsense combinations.

### Exhaustiveness check with `never`

```ts
function render2(state: RequestState): string {
  switch (state.status) {
    case 'idle': return 'Not started';
    case 'loading': return 'Loading…';
    case 'success': return 'Done';
    case 'error': return 'Failed';
    default: {
      const _exhaustive: never = state;    // ❌ compile error if a new status is added and not handled
      return _exhaustive;
    }
  }
}
```

If someone adds `{ status: 'cancelled' }` to the union, this line errors until the new case is handled.

---

## 4. `as const` and deriving types from values

```ts
const sizes = ['sm', 'md', 'lg'];               // string[]
const sizes2 = ['sm', 'md', 'lg'] as const;     // readonly ['sm', 'md', 'lg']

type Size = (typeof sizes2)[number];            // 'sm' | 'md' | 'lg'

const config = { api: '/v1', retries: 3 } as const;
// { readonly api: '/v1'; readonly retries: 3 }

const ROLES = { ADMIN: 'admin', EDITOR: 'editor' } as const;
type Role = (typeof ROLES)[keyof typeof ROLES];  // 'admin' | 'editor'
```

`as const` makes everything `readonly` and keeps **literal** types. This lets you write a list once and get both the runtime array (for dropdowns) and the type.

### `satisfies`: check a value against a type without widening it

```ts
type Settings = Record<string, string | number>;

const annotated: Settings = { theme: 'dark', pageSize: 20 };
annotated.pageSize.toFixed(0);   // ❌ type is string | number (specifics lost)
annotated.typo;                  // no error: any string key is allowed

const checked = { theme: 'dark', pageSize: 20 } satisfies Settings;   // ✅ still validated against Settings
checked.pageSize.toFixed(0);     // ✅ type is number
checked.typo;                    // ❌ Property 'typo' does not exist
```

Difference from an annotation: `const t: Settings = {...}` makes `t` exactly `Settings` and loses the details. `satisfies` checks the value but keeps its precise inferred type.

---

## 5. Generics

**Generics** are type parameters: placeholders for types, filled in when the function/type is used. They let you write reusable code that still keeps exact types.

### The problem

```ts
function firstAny(arr: any[]): any { return arr[0]; }
const x = firstAny([1, 2]);        // any: type information lost

function firstNumber(arr: number[]): number | undefined { return arr[0]; }
// would need one function per type
```

### Generic function

```ts
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

const n = first([1, 2, 3]);          // T = number → number | undefined
const s = first(['a', 'b']);         // T = string
const u = first<User>(users);        // explicit (usually unnecessary)
```

`T` is just a name (convention: `T`, `U`, `K` for keys, `V` for values, or descriptive names like `TItem`).

```ts
// Arrow function syntax (in .tsx files write <T,> to avoid confusion with JSX)
const last = <T,>(arr: T[]): T | undefined => arr[arr.length - 1];

// Multiple type parameters
function pair<K, V>(key: K, value: V): [K, V] {
  return [key, value];
}
pair('age', 25);    // [string, number]
```

### Generic types and interfaces

```ts
interface ApiResponse<T> {
  data: T;
  error: string | null;
  status: number;
}

type UserResponse = ApiResponse<User>;
type ListResponse<T> = ApiResponse<T[]>;

interface Page<T> {
  items: T[];
  total: number;
  page: number;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;      // ⚠️ no runtime check: validate with Zod for untrusted data
}

const page = await getJson<Page<Product>>('/api/products');
page.items[0]?.price;    // number
```

### Constraints: `extends`

Limit what `T` can be, so you can use its properties:

```ts
function getLength<T extends { length: number }>(value: T): number {
  return value.length;            // ✅ guaranteed to exist
}
getLength('hello');     // ✅
getLength([1, 2]);      // ✅
getLength(42);          // ❌ number has no length

function byId<T extends { id: number }>(items: T[], id: number): T | undefined {
  return items.find((item) => item.id === id);
}
```

### `keyof` with generics: type-safe property access

```ts
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { name: 'Anoop', age: 25 };
getProperty(user, 'name');    // string
getProperty(user, 'age');     // number
getProperty(user, 'email');   // ❌ Argument of type '"email"' is not assignable to parameter of type '"name" | "age"'

function sortBy<T>(items: T[], key: keyof T): T[] {
  return [...items].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
}
```

### Default type parameters

```ts
interface Box<T = string> { value: T }
const b: Box = { value: 'hi' };          // T defaults to string
```

### Generics you already use

```ts
Array<number>              // number[]
Promise<User>
Map<string, number>
Set<string>
Record<string, number>
useState<User | null>(null)
useRef<HTMLInputElement>(null)
```

**Tip:** if a type parameter appears only once in a signature, you probably don't need it. Generics are for **connecting** types: input type → output type.

---

## 6. Exercises

1. Write `formatValue(v: string | number | Date): string` using narrowing.
2. Model a `Shape` discriminated union (`circle` with `radius`, `rect` with `width`/`height`, `triangle` with `base`/`height`) and an exhaustive `area(shape)` function.
3. Create `const STATUSES = ['draft', 'published', 'archived'] as const` and derive a `Status` type from it.
4. Write a generic `groupBy<T, K extends string>(items: T[], getKey: (item: T) => K): Record<K, T[]>`.
5. Write `isNonEmptyString(x: unknown): x is string` and use it with `filter`.
6. Write a generic `ApiResult<T>` discriminated union (`{ ok: true; data: T } | { ok: false; error: string }`) and a function that handles it.
