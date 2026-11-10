# 04 · Utility types, type operators, classes, enums and modules

## 1. Type operators

### `keyof`: union of an object type's keys

```ts
interface User { id: number; name: string; email: string }

type UserKey = keyof User;          // 'id' | 'name' | 'email'
```

### `typeof` (in a type position): get the type of a value

```ts
const defaultSettings = { theme: 'light', pageSize: 20, notifications: true };
type Settings = typeof defaultSettings;
// { theme: string; pageSize: number; notifications: boolean }

function createStore() { return { items: [] as string[], add(x: string) {} }; }
type Store = ReturnType<typeof createStore>;
```

⚠️ `typeof` in a **type** position (`type X = typeof value`) is TypeScript. In normal code (`typeof value === 'string'`) it's the JavaScript operator.

### Indexed access: `Type['key']`

```ts
type UserName = User['name'];                 // string
type IdOrName = User['id' | 'name'];          // number | string

interface Order { items: { sku: string; qty: number }[] }
type OrderItem = Order['items'][number];      // { sku: string; qty: number }  ([number] = element type)
```

### Mapped types (how utility types are built)

```ts
type Optional<T> = { [K in keyof T]?: T[K] };       // like Partial
type Flags<T> = { [K in keyof T]: boolean };

type UserFlags = Flags<User>;    // { id: boolean; name: boolean; email: boolean }
```

### Conditional types (basics)

```ts
type IsString<T> = T extends string ? 'yes' : 'no';
type A = IsString<'hi'>;    // 'yes'
type B = IsString<42>;      // 'no'

// infer: pull a type out of another
type ElementType<T> = T extends (infer U)[] ? U : never;
type E = ElementType<string[]>;   // string
```

### Template literal types

```ts
type Size = 'sm' | 'md' | 'lg';
type Color = 'red' | 'blue';
type ClassName = `btn-${Size}-${Color}`;    // 'btn-sm-red' | 'btn-sm-blue' | ... (6 combinations)

type EventName = `on${Capitalize<'click' | 'hover'>}`;   // 'onClick' | 'onHover'
```

---

## 2. Built-in utility types

```ts
interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  role?: 'admin' | 'user';
}
```

| Utility | Result | Typical use |
| --- | --- | --- |
| `Partial<User>` | all properties optional | Update payloads: `updateUser(id, changes: Partial<User>)` |
| `Required<User>` | all properties required | After defaults have been applied |
| `Readonly<User>` | all properties readonly | Immutable data, props |
| `Pick<User, 'id' \| 'name'>` | only `id` and `name` | Public views, list items |
| `Omit<User, 'password'>` | everything except `password` | Safe-to-send user, form values without `id` |
| `Record<K, V>` | object with keys `K` and values `V` | Lookups, dictionaries |
| `Exclude<'a' \| 'b' \| 'c', 'a'>` | `'b' \| 'c'` | Remove members from a **union** |
| `Extract<'a' \| 'b' \| 1, string>` | `'a' \| 'b'` | Keep members matching a type |
| `NonNullable<string \| null \| undefined>` | `string` | Remove null/undefined |
| `ReturnType<typeof fn>` | the function's return type | Types of factory/hook results |
| `Parameters<typeof fn>` | tuple of parameter types | Wrapping functions |
| `Awaited<Promise<User>>` | `User` | Unwrap promises: `Awaited<ReturnType<typeof fetchUser>>` |
| `InstanceType<typeof MyClass>` | instance type | |
| `NoInfer<T>` | blocks inference from that position | Advanced generic APIs (TS 5.4+) |
| `Uppercase` / `Lowercase` / `Capitalize` / `Uncapitalize` | string literal transforms | Template literal types |

### Examples

```ts
type PublicUser = Omit<User, 'password'>;
type NewUser = Omit<User, 'id'>;                       // form data before saving
type UserUpdate = Partial<Omit<User, 'id'>>;           // combine utilities
type UserPreview = Pick<User, 'id' | 'name'>;

function updateUser(id: number, changes: Partial<User>) { /* ... */ }
updateUser(1, { name: 'New name' });                   // ✅ only what changed

const permissions: Record<NonNullable<User['role']>, string[]> = {
  admin: ['read', 'write', 'delete'],
  user: ['read'],
};

async function fetchUser(id: number) { return { id, name: 'A' }; }
type FetchedUser = Awaited<ReturnType<typeof fetchUser>>;   // { id: number; name: string }
```

⚠️ `Omit` doesn't check that the key exists: `Omit<User, 'passwrod'>` silently omits nothing. `Pick` does check.

⚠️ `Partial` and `Readonly` are **shallow**: nested objects keep their original types.

---

## 3. Classes in TypeScript

```ts
class BankAccount {
  // property declarations with types
  public owner: string;
  private balance: number;            // TS-only privacy (erased at runtime)
  protected readonly createdAt: Date; // readonly + visible in subclasses
  #pin: string;                       // real JavaScript private field (enforced at runtime)
  static bankName = 'QBank';

  constructor(owner: string, initial = 0, pin = '0000') {
    this.owner = owner;
    this.balance = initial;
    this.createdAt = new Date();
    this.#pin = pin;
  }

  deposit(amount: number): void {
    if (amount <= 0) throw new Error('Amount must be positive');
    this.balance += amount;
  }

  get currentBalance(): number {
    return this.balance;
  }
}

const acc = new BankAccount('Anoop', 100);
acc.deposit(50);
acc.currentBalance;   // 150
acc.balance;          // ❌ Property 'balance' is private
```

### Parameter properties (shorthand)

```ts
class User {
  constructor(
    public readonly id: number,
    public name: string,
    private password: string
  ) {}                              // declares AND assigns the properties automatically
}
```

⚠️ Parameter properties aren't "erasable" syntax, so some newer setups (Node's built-in TS support, `erasableSyntaxOnly`) don't allow them. Plain property declarations always work.

### Access modifiers

| Modifier | Accessible from |
| --- | --- |
| `public` (default) | anywhere |
| `protected` | the class and subclasses |
| `private` | only the class (compile-time only) |
| `#field` | only the class (enforced by JavaScript at runtime) |
| `readonly` | can only be assigned in the declaration or constructor |

### Implementing interfaces and abstract classes

```ts
interface Shape {
  area(): number;
}

class Circle implements Shape {
  constructor(private radius: number) {}
  area() { return Math.PI * this.radius ** 2; }
}

abstract class Animal {
  constructor(public name: string) {}
  abstract makeSound(): string;               // subclasses must implement
  describe() { return `${this.name} says ${this.makeSound()}`; }
}

class Dog extends Animal {
  makeSound() { return 'Woof'; }
}

new Animal('x');   // ❌ Cannot create an instance of an abstract class
```

`implements` only **checks** the class matches the interface; it doesn't add any code.

In React codebases you'll mostly use functions and plain objects; classes appear in services, error types and libraries.

---

## 4. Enums vs union types

```ts
// Numeric enum
enum Direction { Up, Down, Left, Right }     // Up = 0, Down = 1...
Direction.Up;           // 0
Direction[0];           // 'Up' (reverse mapping)

// String enum
enum Status {
  Active = 'ACTIVE',
  Inactive = 'INACTIVE',
}
function setStatus(s: Status) {}
setStatus(Status.Active);    // ✅
setStatus('ACTIVE');         // ❌ string literal not accepted

// The common alternative: union of literals
type Status2 = 'ACTIVE' | 'INACTIVE';
setStatus2('ACTIVE');        // ✅ simple, no runtime code

// Need the values at runtime too? Use an `as const` object
const STATUS = { Active: 'ACTIVE', Inactive: 'INACTIVE' } as const;
type Status3 = (typeof STATUS)[keyof typeof STATUS];   // 'ACTIVE' | 'INACTIVE'
```

| | `enum` | Union / `as const` object |
| --- | --- | --- |
| Generates JavaScript code | ✅ (an object) | Union: no. Object: yes, plain |
| Accepts plain string values | ❌ (string enums) | ✅ |
| Numeric enums are type-safe | ⚠️ No: any number is assignable in older TS versions | — |
| Works with "erasable syntax only" / Node type stripping | ❌ | ✅ |

**Recommendation:** prefer **union types** (or `as const` objects). Use enums only if your codebase already does.

---

## 5. Modules and type imports

```ts
// types.ts
export interface User { id: number; name: string }
export type Role = 'admin' | 'user';

// user-service.ts
import type { User, Role } from './types';       // type-only import: removed from the JS output
import { type User as U, fetchUser } from './api';   // mix values and types

export function isAdmin(role: Role) { return role === 'admin'; }
```

Use `import type` for things that are only types. It makes the intent clear and avoids loading modules for nothing. With `verbatimModuleSyntax: true` in tsconfig, it's required.

### Declaration files (`.d.ts`)

`.d.ts` files contain **only types**, describing JavaScript code.

- Most libraries ship their own types (look for `"types"` in their package.json).
- For libraries without types, install them from DefinitelyTyped: `npm install -D @types/lodash`.
- If no types exist, declare the module yourself:

```ts
// src/types/global.d.ts
declare module 'some-untyped-lib';                  // treat as any (quick fix)

declare module '*.svg' {                            // importing non-JS files
  const src: string;
  export default src;
}

// Typing Vite env variables
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

// Adding to the global Window
declare global {
  interface Window { analytics?: { track(event: string): void } }
}
export {};    // makes this file a module so `declare global` works
```

---

## 6. Error handling types

```ts
try {
  riskyThing();
} catch (err) {                 // err: unknown (with strict / useUnknownInCatchVariables)
  if (err instanceof Error) {
    console.error(err.message);
  } else {
    console.error('Unknown error', err);
  }
}

// helper
function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
```

You can't annotate the catch variable with a specific type (`catch (e: AxiosError)` is an error); only `unknown` or `any`. Narrow it instead.

---

## 7. Runtime validation (why types aren't enough)

TypeScript can't check data coming from outside (APIs, forms, localStorage). **Zod** defines a schema once and gives you both runtime validation and the TypeScript type:

```ts
import { z } from 'zod';

const UserSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'user']).optional(),
});

type User = z.infer<typeof UserSchema>;    // TS type generated from the schema

const json: unknown = await res.json();
const user = UserSchema.parse(json);       // throws if the shape is wrong; user is typed as User

const result = UserSchema.safeParse(json); // doesn't throw
if (result.success) result.data; else result.error.issues;
```

---

## 8. Exercises

1. From an `Employee` interface, create `EmployeePreview` (Pick), `NewEmployee` (Omit `id`) and `EmployeeUpdate` (Partial, without `id`).
2. Write a mapped type `Nullable<T>` that makes every property `T[K] | null`.
3. Convert an enum `Color { Red = 'RED', Green = 'GREEN' }` to an `as const` object plus a union type.
4. Write a `Stack<T>` class with `push`, `pop`, `peek` and a `size` getter.
5. Write a `.d.ts` that types `import.meta.env.VITE_API_URL`.
6. Write a Zod schema for a product and use `safeParse` on `unknown` data.
