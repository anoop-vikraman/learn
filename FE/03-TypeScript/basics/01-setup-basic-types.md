# 01 · Setup and basic types

## 1. Why TypeScript?

```js
// JavaScript: this bug only shows up when the code runs
function getTotal(items) {
  return items.reduce((sum, item) => sum + item.prise, 0);   // typo: prise → NaN at runtime
}
```

```ts
// TypeScript: the editor underlines the mistake immediately
interface Item { name: string; price: number }

function getTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.prise, 0);
  //                                            ~~~~~ Property 'prise' does not exist on type 'Item'. Did you mean 'price'?
}
```

Benefits:
- **Catches bugs early**: typos, wrong argument types, missing properties, possibly-`undefined` values.
- **Better editor help**: autocomplete, go-to-definition, safe renaming.
- **Documentation**: types show what a function expects and returns.
- **Safer refactoring**: change a type and the compiler lists every place to update.

Important: **types exist only at compile time**. They're erased from the output; TypeScript never checks data at runtime (e.g. API responses). For runtime validation you need a library like **Zod**.

---

## 2. Installing and running

### In a new React project (most common)

```bash
npm create vite@latest my-app -- --template react-ts
```

Files use `.ts` (no JSX) and `.tsx` (with JSX). Vite strips types quickly; run `npx tsc --noEmit` (or the template's `build` script) to actually **type-check**.

### Standalone

```bash
npm install -D typescript
npx tsc --init            # creates tsconfig.json
npx tsc                   # type-check and compile .ts → .js
npx tsc --noEmit          # type-check only
npx tsc --watch           # re-check on every save
```

Run TypeScript directly with Node: recent Node versions can run `.ts` files that only use erasable syntax (`node file.ts`), or use `npx tsx file.ts`.

### `tsconfig.json`: the important options

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",             // JS version to output
    "module": "ESNext",             // module system for output
    "moduleResolution": "bundler",  // how imports are found (use "bundler" with Vite)
    "lib": ["ES2022", "DOM", "DOM.Iterable"],  // built-in type definitions available
    "jsx": "react-jsx",             // for React
    "strict": true,                 // ✅ ALWAYS: turns on all strict checks
    "noUncheckedIndexedAccess": true, // arr[i] is T | undefined (safer)
    "noEmit": true,                 // let Vite build; tsc only checks
    "skipLibCheck": true,           // don't type-check node_modules .d.ts files (faster)
    "esModuleInterop": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }   // import aliases (also configure Vite)
  },
  "include": ["src"]
}
```

`"strict": true` enables, among others, **`strictNullChecks`** (`null`/`undefined` must be handled) and **`noImplicitAny`** (no silent `any`). Always use it; TypeScript is much less useful without it.

---

## 3. Type annotations and inference

An **annotation** tells TypeScript the type explicitly with `: Type`.

```ts
let userName: string = 'Anoop';
let age: number = 25;
let isAdmin: boolean = false;
```

But usually TypeScript **infers** types from the value, so you don't need to write them:

```ts
let userName = 'Anoop';     // inferred: string
let age = 25;               // inferred: number
userName = 42;              // ❌ Type 'number' is not assignable to type 'string'

const role = 'admin';       // inferred: 'admin' (a literal type: const can't change)
let role2 = 'admin';        // inferred: string
```

**When to write annotations:**
- Function **parameters** (always: they can't be inferred).
- Function **return types** for exported/public functions (optional but helpful).
- Variables declared **without a value**: `let result: number;`
- Empty arrays/objects whose type can't be guessed: `const ids: number[] = [];`
- When inference gives something too wide or too narrow.

**When not to:** simple variables with an obvious value. Let inference work.

---

## 4. Primitive types

```ts
const s: string = 'hello';
const n: number = 3.14;              // integers and decimals
const big: bigint = 100n;
const b: boolean = true;
const nothing: null = null;
const notSet: undefined = undefined;
const id: symbol = Symbol('id');
```

⚠️ Use lowercase `string`, `number`, `boolean`, not `String`, `Number`, `Boolean` (those are wrapper object types).

### `null` and `undefined` with strict mode

```ts
let middleName: string = undefined;          // ❌ error in strict mode
let middleName2: string | undefined;         // ✅ "string or undefined"
let selectedId: number | null = null;        // ✅ common for "nothing selected yet"
```

---

## 5. Arrays and tuples

```ts
const scores: number[] = [90, 85, 77];
const names: Array<string> = ['A', 'B'];   // same thing, generic syntax
const matrix: number[][] = [[1, 2], [3, 4]];
const mixed: (string | number)[] = [1, 'two', 3];

scores.push('100');   // ❌ Argument of type 'string' is not assignable to parameter of type 'number'

const readonlyList: readonly number[] = [1, 2, 3];
readonlyList.push(4); // ❌ Property 'push' does not exist on type 'readonly number[]'
```

⚠️ Empty arrays: `const items = [];` is inferred as `any[]` (or evolves as you push). Annotate it: `const items: Item[] = [];`.

⚠️ Index access: `scores[10]` has type `number`, but its value is `undefined` at runtime. Enable `noUncheckedIndexedAccess` to make it `number | undefined`.

### Tuples: fixed length, a type per position

```ts
const point: [number, number] = [10, 20];
const entry: [string, number] = ['age', 25];
const [key, value] = entry;                       // key: string, value: number

const rgb: [r: number, g: number, b: number] = [255, 0, 0];   // labelled (for readability)
const optional: [string, number?] = ['only name'];            // optional element

// useState returns a tuple
const [count, setCount] = useState(0);            // [number, Dispatch<SetStateAction<number>>]
```

---

## 6. Special types

### `any`: turns type checking OFF

```ts
let data: any = 'hello';
data = 42;
data.foo.bar.baz();   // no error at compile time 💥 crash at runtime
```

`any` spreads silently: anything you get from an `any` is also `any`. **Avoid it.** It's sometimes used temporarily while migrating JS to TS.

### `unknown`: the safe "could be anything"

```ts
let input: unknown = JSON.parse(text);
input.name;               // ❌ 'input' is of type 'unknown'

if (typeof input === 'object' && input !== null && 'name' in input) {
  console.log(input.name);   // ✅ after checking
}
```

You **must narrow** `unknown` before using it. Use it for API responses, `JSON.parse` results, `catch` errors and user input.

| | `any` | `unknown` |
| --- | --- | --- |
| Assign anything to it | ✅ | ✅ |
| Use it without checks | ✅ (unsafe) | ❌ must narrow first |
| Assign it to other types | ✅ (unsafe) | ❌ only to `unknown`/`any` |

### `void`: a function returns nothing useful

```ts
function logMessage(msg: string): void {
  console.log(msg);
}
```

### `never`: a value that can never exist

```ts
function fail(message: string): never {
  throw new Error(message);          // never returns normally
}
```

`never` is used for exhaustiveness checks (lesson 03) and appears when TypeScript has ruled out every possibility.

### `object`

`object` means "any non-primitive". It's rarely useful; describe the actual shape instead (lesson 02).

---

## 7. Type assertions (`as`)

An **assertion** tells TypeScript "trust me, I know the type better". It does **not** convert or check anything at runtime.

```ts
const input = document.getElementById('email') as HTMLInputElement;
input.value;               // ✅ without the assertion: HTMLElement | null, no .value

const el = document.querySelector('#title')!;   // ! = non-null assertion: "this is not null"
```

⚠️ If you're wrong, the code crashes at runtime. Prefer checks:

```ts
const input = document.getElementById('email');
if (input instanceof HTMLInputElement) {
  input.value;             // ✅ safely narrowed
}
```

Never use the double assertion `value as unknown as Something` except as a last resort.

---

## 8. Literal types

A literal type is a **specific value** used as a type:

```ts
let direction: 'up' | 'down' | 'left' | 'right';
direction = 'up';       // ✅
direction = 'north';    // ❌ Type '"north"' is not assignable to type '"up" | "down" | "left" | "right"'

let diceRoll: 1 | 2 | 3 | 4 | 5 | 6;
let yes: true;
```

Combined with unions (lesson 03), they replace many uses of enums and magic strings.

---

## 9. Reading error messages

TypeScript errors look long but follow a pattern: **"Type X is not assignable to type Y"**, followed by indented lines explaining **which property** doesn't match. Read the **last** indented line first; it's usually the real cause.

```
Type '{ name: string; age: string; }' is not assignable to type 'User'.
  Types of property 'age' are incompatible.
    Type 'string' is not assignable to type 'number'.     ← the actual problem
```

Hover over variables in VS Code to see their inferred types; this is the fastest way to understand errors.

---

## 10. Exercises

1. In the Playground, declare variables of each primitive type and try assigning wrong values.
2. Create a `string[]`, a `readonly number[]` and a tuple `[string, number, boolean]`.
3. Parse `'{"name":"A"}'` with `JSON.parse` into an `unknown` and safely print `name`.
4. Explain the difference between `let x = 'a'` and `const y = 'a'` in their inferred types.
5. Get an `<input>` with `querySelector` and read its value safely, without `as`.
