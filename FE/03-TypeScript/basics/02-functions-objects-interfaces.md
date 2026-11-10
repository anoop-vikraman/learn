# 02 · Functions, objects, type aliases and interfaces

## 1. Typing functions

```ts
// Parameters must be typed; the return type is inferred (here: number)
function add(a: number, b: number) {
  return a + b;
}

// Explicit return type: helps catch mistakes inside the function
function greet(name: string): string {
  return `Hello, ${name}`;
}

// Arrow functions
const multiply = (a: number, b: number): number => a * b;

// Async functions return Promise<T>
async function fetchUser(id: number): Promise<User> {
  const res = await fetch(`/api/users/${id}`);
  return res.json();      // ⚠️ res.json() returns Promise<any>: TS trusts you here
}

add(1, '2');   // ❌ Argument of type 'string' is not assignable to parameter of type 'number'
add(1);        // ❌ Expected 2 arguments, but got 1
```

### Optional and default parameters

```ts
function createUser(name: string, age?: number) {       // age: number | undefined
  return age === undefined ? name : `${name} (${age})`;
}
createUser('Anoop');        // ✅
createUser('Anoop', 25);    // ✅

function connect(url: string, timeout = 5000) {         // inferred: number, optional
  /* ... */
}
```

Optional parameters must come **after** required ones.

### Rest parameters

```ts
function sum(...nums: number[]): number {
  return nums.reduce((total, n) => total + n, 0);
}
```

### Object parameters (destructured)

```ts
function createButton({ label, size = 'md' }: { label: string; size?: 'sm' | 'md' | 'lg' }) {
  /* ... */
}

// Cleaner with a named type
type ButtonOptions = { label: string; size?: 'sm' | 'md' | 'lg' };
function createButton2({ label, size = 'md' }: ButtonOptions) { /* ... */ }
```

### Function types (for callbacks and props)

```ts
type MathOp = (a: number, b: number) => number;
const subtract: MathOp = (a, b) => a - b;          // a and b are inferred from MathOp

function applyToAll(nums: number[], fn: (n: number) => number): number[] {
  return nums.map(fn);
}

type OnChange = (value: string) => void;           // callback that returns nothing
```

**`void` in callback types** means "the return value is ignored", so a function that returns something can still be passed:

```ts
const log: (msg: string) => void = (msg) => msg.length;   // ✅ allowed
```

### Overloads (when output type depends on input)

```ts
function parse(value: string): number;
function parse(value: number): string;
function parse(value: string | number) {
  return typeof value === 'string' ? Number(value) : String(value);
}
parse('5');   // number
parse(5);     // string
```

Overloads are an advanced feature; union types or generics are usually simpler.

---

## 2. Object types

```ts
// Inline object type
let user: { name: string; age: number } = { name: 'Anoop', age: 25 };

user.email = 'x';     // ❌ Property 'email' does not exist
user = { name: 'B' }; // ❌ Property 'age' is missing
```

### Type aliases: give a type a name

```ts
type User = {
  id: number;
  name: string;
  email: string;
};

const u: User = { id: 1, name: 'Anoop', email: 'a@b.com' };
```

### Interfaces: another way to name an object shape

```ts
interface Product {
  id: number;
  title: string;
  price: number;
}

const p: Product = { id: 1, title: 'Pen', price: 10 };
```

### Optional and readonly properties

```ts
interface Profile {
  readonly id: number;        // can't be changed after creation
  name: string;
  bio?: string;               // optional: string | undefined
  avatarUrl?: string | null;
}

const me: Profile = { id: 1, name: 'Anoop' };   // ✅ bio omitted
me.id = 2;                                      // ❌ Cannot assign to 'id' because it is a read-only property
me.bio.toUpperCase();                           // ❌ 'me.bio' is possibly 'undefined'
me.bio?.toUpperCase();                          // ✅
```

`readonly` is shallow and compile-time only: nested objects can still be changed.

### Methods in object types

```ts
interface Counter {
  count: number;
  increment(): void;                 // method syntax
  add: (n: number) => void;          // property-with-function syntax (stricter checking, preferred)
}
```

### Nested objects and arrays of objects

```ts
interface Order {
  id: string;
  customer: { name: string; email: string };
  items: { productId: number; qty: number }[];
  status: 'pending' | 'paid' | 'shipped';
}

// Often clearer as separate named types
interface Customer { name: string; email: string }
interface OrderItem { productId: number; qty: number }
interface Order2 { id: string; customer: Customer; items: OrderItem[] }
```

---

## 3. Excess property checks

When you assign an **object literal directly**, TypeScript rejects unknown properties, which catches typos:

```ts
interface Options { color?: string; width?: number }

const o1: Options = { colour: 'red' };     // ❌ Object literal may only specify known properties. Did you mean 'color'?

const temp = { colour: 'red', width: 10 };
const o2: Options = temp;                   // ✅ no error (not a fresh literal)
```

**Structural typing:** TypeScript checks the **shape**, not the name. Any object with at least the required properties fits:

```ts
interface Named { name: string }
const dog = { name: 'Rex', breed: 'Lab' };
const n: Named = dog;      // ✅ dog has a name, extra properties are fine here
```

---

## 4. `type` vs `interface`

Both describe object shapes and are mostly interchangeable.

```ts
// Extending
interface Animal { name: string }
interface Dog extends Animal { breed: string }

type Animal2 = { name: string };
type Dog2 = Animal2 & { breed: string };     // intersection: has both

// Interfaces can extend types and vice versa
interface Cat extends Animal2 { indoor: boolean }
```

| | `interface` | `type` |
| --- | --- | --- |
| Object shapes | ✅ | ✅ |
| Unions (`A \| B`), primitives, tuples, function types | ❌ | ✅ |
| Mapped/conditional types | ❌ | ✅ |
| Extend | `extends` | `&` (intersection) |
| **Declaration merging** (declare twice → combined) | ✅ | ❌ (error) |
| Error messages | Shows the interface name | Can show the expanded shape |

```ts
// Declaration merging: useful to extend library types, surprising otherwise
interface Window { myGlobal: string }    // adds to the built-in Window type
```

**Practical rule:** pick one style for object shapes and be consistent (many teams use `interface` for objects and `type` for everything else; others use `type` everywhere). Use `type` whenever you need unions or other type operations.

---

## 5. Index signatures and `Record`

For objects with **unknown keys** but known value types (dictionaries/lookups):

```ts
interface Scores {
  [studentName: string]: number;
}
const scores: Scores = { anoop: 90, bina: 85 };
scores['new'] = 70;      // ✅

// Same thing with the Record utility type (more common)
const prices: Record<string, number> = { pen: 10, book: 250 };

// Record with a union of keys: every key is required
type Status = 'todo' | 'doing' | 'done';
const labels: Record<Status, string> = { todo: 'To do', doing: 'In progress', done: 'Done' };
// missing a key → ❌ error
```

⚠️ With an index signature, `scores.missing` has type `number`, but it's `undefined` at runtime. `noUncheckedIndexedAccess` makes it `number | undefined`. A `Map<string, number>` is another option.

---

## 6. Intersection types (`&`)

Combine several types into one that has **all** their properties:

```ts
type Timestamps = { createdAt: string; updatedAt: string };
type WithId = { id: string };

type Post = WithId & Timestamps & { title: string; body: string };
// Post has id, createdAt, updatedAt, title, body
```

⚠️ Intersecting incompatible properties gives `never`: `{ a: string } & { a: number }` → `a: never`.

---

## 7. Typing `this` and `object` methods (brief)

```ts
const counter = {
  count: 0,
  inc() {
    this.count++;        // TS infers this = typeof counter
  },
};
```

Arrow functions take `this` from outside, as in JavaScript. Classes are covered in lesson 04.

---

## 8. Exercises

1. Write a `User` interface with `id` (readonly), `name`, optional `email`, and `roles` (array of `'admin' | 'editor' | 'viewer'`).
2. Write `formatPrice(amount: number, currency = 'INR'): string` using `Intl.NumberFormat`.
3. Type a callback parameter: `retry(fn: () => Promise<T>, times: number)` (use `unknown` for now instead of `T`).
4. Create `Record<'small' | 'medium' | 'large', number>` for sizes, then remove one key and read the error.
5. Model an `Order` with nested `Customer` and `OrderItem[]`, and write `getOrderTotal(order: Order): number`.
