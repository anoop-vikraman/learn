# TypeScript cheat sheet

All the syntax, utility types, compiler options and React types in one place, with **what they take, what they produce, and the edge cases people forget.**

Legend: ⚠️ = gotcha

---

## Basic types

| Type | Example | Remember |
| --- | --- | --- |
| `string`, `number`, `boolean`, `bigint`, `symbol` | `let n: number = 1` | Lowercase. `String`/`Number` are wrapper objects ⚠️ |
| `null`, `undefined` | `let x: string \| null` | With `strict`, must be included explicitly |
| Array | `number[]` or `Array<number>` | `readonly number[]` / `ReadonlyArray<number>` blocks push/sort |
| Tuple | `[string, number]`, `[x: number, y?: number]`, `[string, ...number[]]` | Fixed positions. `as const` makes literal tuples |
| Literal | `'GET' \| 'POST'`, `1 \| 2`, `true` | `const` infers literals, `let` widens to `string` |
| Object | `{ a: string; b?: number; readonly c: boolean }` | `?` = may be missing (`\| undefined`) |
| Function | `(a: number) => string` | `void` return in a callback type = return value ignored |
| `any` | | ⚠️ Disables checking and spreads. Avoid |
| `unknown` | | Safe "anything": must narrow before use. Use for API data, `JSON.parse`, `catch` |
| `never` | | Impossible value: functions that always throw; exhaustive checks |
| `void` | | Function returns nothing useful |
| `object` | | Any non-primitive. Rarely useful |
| `{}` | | ⚠️ Means "any non-null value", NOT "empty object". Use `Record<string, never>` for an empty object |

---

## Declaring types

```ts
type Point = { x: number; y: number };                // type alias
interface User { id: number; name: string }          // interface
interface Admin extends User { level: number }        // extend interface
type Admin2 = User & { level: number };               // intersection
type Id = string | number;                            // union
type Callback = (err: Error | null, data?: string) => void;
type Dict = Record<string, number>;
interface Dict2 { [key: string]: number }             // index signature
```

| | `interface` | `type` |
| --- | --- | --- |
| Object shapes | ✅ | ✅ |
| Unions, tuples, primitives, functions, mapped/conditional | ❌ | ✅ |
| Extend | `extends` | `&` |
| Declaration merging | ✅ (same name declared twice merges) | ❌ |

---

## Functions

```ts
function f(a: number, b?: string, c = 10, ...rest: boolean[]): string { return ''; }
const g = (x: number): number => x * 2;
async function h(): Promise<User> { /* ... */ }
function assertNever(x: never): never { throw new Error(`Unexpected: ${x}`); }
```

| Feature | Remember |
| --- | --- |
| Parameters | Always annotate (can't be inferred, except in callbacks) |
| Return type | Inferred; annotate exported functions for clearer errors |
| Optional `b?` | Must come after required params. Type is `T \| undefined` |
| Default `c = 10` | Makes it optional; type inferred from the default |
| `this` parameter | `function fn(this: HTMLElement) {}`: first fake parameter, erased |
| Overloads | List signatures, then one implementation compatible with all |
| Async | Return type is `Promise<T>` |

---

## Narrowing

| Technique | Example | Narrows |
| --- | --- | --- |
| `typeof` | `typeof x === 'string'` | primitives (`'string'`, `'number'`, `'boolean'`, `'bigint'`, `'symbol'`, `'undefined'`, `'object'`, `'function'`) ⚠️ `typeof null === 'object'` |
| Truthiness | `if (x)` | removes `null`/`undefined` ⚠️ also removes `0` and `''` |
| Equality | `x === null`, `x != null` | `!= null` removes both `null` and `undefined` |
| `in` | `'swim' in animal` | object union members |
| `instanceof` | `err instanceof Error` | classes |
| `Array.isArray` | `Array.isArray(x)` | arrays |
| Discriminant | `switch (action.type)` | discriminated unions |
| Type predicate | `function isUser(x: unknown): x is User` | custom |
| Assertion function | `function assert(x: unknown): asserts x is string` | rest of the scope |
| Exhaustiveness | `const _: never = x` in `default` | errors when a case is missing |

⚠️ Narrowing doesn't survive into callbacks for `let` variables that might change, and is reset after function calls for object properties in some cases. Copy the value into a `const` first.

---

## Assertions and special operators

| Syntax | Meaning | Remember |
| --- | --- | --- |
| `value as Type` | Trust me, it's this type | ⚠️ No runtime check. Only between compatible types |
| `value as unknown as Type` | Force any conversion | ⚠️ Last resort |
| `value!` | Non-null assertion | ⚠️ Crashes if actually null. Prefer `?.` or a check |
| `as const` | Literal + readonly | `['a', 'b'] as const` → `readonly ['a', 'b']` |
| `satisfies Type` | Check against a type, keep the inferred type | Great for config objects |
| `obj?.prop` / `obj?.[k]` / `fn?.()` | Optional chaining | Result includes `undefined` |
| `a ?? b` | Nullish coalescing | Default only for `null`/`undefined` |

---

## Type operators

| Operator | Example | Result |
| --- | --- | --- |
| `keyof T` | `keyof { a: 1; b: 2 }` | `'a' \| 'b'` |
| `typeof value` (type position) | `typeof config` | the type of a variable |
| Indexed access `T[K]` | `User['name']` | `string` |
| Element type | `Item[][number]` / `(typeof arr)[number]` | element type of an array/tuple |
| Mapped type | `{ [K in keyof T]: T[K] \| null }` | transform every property |
| Key remapping | `{ [K in keyof T as \`get${Capitalize<K & string>}\`]: () => T[K] }` | rename keys |
| Modifiers | `{ readonly [K in keyof T]?: T[K] }`, `-readonly`, `-?` | add/remove readonly/optional |
| Conditional | `T extends string ? A : B` | type-level if/else. ⚠️ Distributes over unions (wrap in `[T]` to stop) |
| `infer` | `T extends Promise<infer U> ? U : T` | extract part of a type |
| Template literal | `` `on${Capitalize<E>}` `` | string pattern types |

---

## Utility types

| Utility | Input → output | Remember |
| --- | --- | --- |
| `Partial<T>` | all props optional | ⚠️ Shallow |
| `Required<T>` | all props required | Removes `?` |
| `Readonly<T>` | all props readonly | ⚠️ Shallow; compile-time only |
| `Pick<T, K>` | only keys `K` | `K` must exist in `T` ✅ checked |
| `Omit<T, K>` | all except keys `K` | ⚠️ `K` NOT checked: typos silently do nothing. ⚠️ Loses discriminated unions (use a distributive version) |
| `Record<K, V>` | object with keys `K`, values `V` | With a union `K`, all keys are required |
| `Exclude<U, X>` | union `U` minus members assignable to `X` | For **unions**, not objects |
| `Extract<U, X>` | union members assignable to `X` | |
| `NonNullable<T>` | removes `null \| undefined` | |
| `ReturnType<typeof fn>` | return type | Needs `typeof` for a value |
| `Parameters<typeof fn>` | params as a tuple | `Parameters<typeof fn>[0]` = first param |
| `ConstructorParameters<typeof C>` / `InstanceType<typeof C>` | | Classes |
| `Awaited<T>` | unwraps `Promise` (recursively) | `Awaited<ReturnType<typeof asyncFn>>` |
| `NoInfer<T>` | stops inference from a position | TS 5.4+ |
| `Uppercase<S>` / `Lowercase<S>` / `Capitalize<S>` / `Uncapitalize<S>` | string literals | |

---

## Generics

```ts
function identity<T>(value: T): T { return value; }
function longest<T extends { length: number }>(a: T, b: T): T { return a.length >= b.length ? a : b; }
function get<T, K extends keyof T>(obj: T, key: K): T[K] { return obj[key]; }
interface Box<T = string> { value: T }               // default type parameter
const arrow = <T,>(x: T) => x;                        // in .tsx files
class Stack<T> { private items: T[] = []; push(x: T) { this.items.push(x); } }
```

| Remember |
| --- |
| Type arguments are usually **inferred**: `identity(5)` → `T = number` |
| Use `extends` to require properties (`T extends { id: string }`) |
| A type parameter used only once is usually unnecessary |
| `<T,>` (with comma) for generic arrow functions in `.tsx` |
| `const T` modifier (`<const T>`) infers literal types like `as const` (TS 5.0+) |

---

## Classes

| Feature | Syntax | Remember |
| --- | --- | --- |
| Property | `name: string;` | With `strictPropertyInitialization`, must be assigned in constructor or have `!` / default |
| `public` / `protected` / `private` | `private balance = 0` | Compile-time only |
| `#private` | `#pin = '0000'` | Real runtime privacy |
| `readonly` | `readonly id: number` | Assign only in declaration/constructor |
| `static` | `static count = 0` | On the class, not instances |
| Parameter properties | `constructor(private db: Db) {}` | ⚠️ Not allowed with `erasableSyntaxOnly` |
| `implements` | `class A implements B` | Only checks; adds nothing |
| `abstract` | `abstract class`, `abstract method(): void` | Can't instantiate |
| `override` | `override render()` | With `noImplicitOverride`, required when overriding |

---

## Enums vs alternatives

```ts
enum Dir { Up, Down }                     // numeric: 0, 1 (+ reverse mapping)
enum Color { Red = 'RED' }                // string enum
const enum Fast { A, B }                  // inlined; ⚠️ problems with isolatedModules
type Dir2 = 'up' | 'down';                // ✅ preferred: union of literals
const DIR = { Up: 'up', Down: 'down' } as const;
type Dir3 = (typeof DIR)[keyof typeof DIR];
```

⚠️ String enums don't accept plain strings (`'RED'` isn't assignable to `Color`). ⚠️ Enums generate runtime code and don't work with type-stripping-only tools.

---

## Modules and declarations

| Syntax | Use |
| --- | --- |
| `import type { User } from './types'` | Type-only import (erased). Required with `verbatimModuleSyntax` |
| `import { type User, fetchUser } from './api'` | Mixed |
| `export type { User }` | Re-export a type |
| `declare module 'lib-name';` | Quick "any" types for an untyped package |
| `declare module '*.svg' { const src: string; export default src; }` | Non-JS imports |
| `declare global { interface Window { x: string } }` + `export {}` | Add globals |
| `npm i -D @types/package` | Community types (DefinitelyTyped) |
| `/// <reference types="vite/client" />` | Vite's `import.meta.env` and asset types |

---

## `tsconfig.json` options worth knowing

| Option | What it does | Recommended |
| --- | --- | --- |
| `strict` | Enables all strict checks (`strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, `useUnknownInCatchVariables`…) | ✅ `true` always |
| `noUncheckedIndexedAccess` | `arr[i]` and `obj[key]` include `undefined` | ✅ safer |
| `exactOptionalPropertyTypes` | `a?: string` doesn't accept an explicit `undefined` | Optional, strict |
| `noImplicitReturns`, `noFallthroughCasesInSwitch` | Catch missing returns / switch fallthrough | ✅ |
| `noUnusedLocals`, `noUnusedParameters` | Error on unused code | ✅ (or let ESLint do it) |
| `target` | JS version emitted | `ES2022`+ |
| `module` / `moduleResolution` | Import system | `ESNext` + `bundler` (Vite) / `NodeNext` (Node) |
| `lib` | Built-in API types | `["ES2022", "DOM", "DOM.Iterable"]` for browsers |
| `jsx` | JSX transform | `react-jsx` |
| `noEmit` | Only type-check | ✅ when a bundler builds |
| `isolatedModules` / `verbatimModuleSyntax` | Each file compiles alone (needed by Vite/esbuild/SWC) | ✅ |
| `skipLibCheck` | Skip checking `.d.ts` in node_modules | ✅ faster |
| `paths` + `baseUrl` | Import aliases (`@/…`) | Also configure the bundler |
| `allowJs` / `checkJs` | Include / type-check JS files | For migrations |
| `erasableSyntaxOnly` | Forbid enums, namespaces, parameter properties | When running TS directly in Node |

---

## React + TypeScript

| Need | Type / pattern |
| --- | --- |
| Props | `function Btn({ label }: { label: string })` or `interface BtnProps` |
| Children | `children: React.ReactNode` or `PropsWithChildren<P>` |
| Extend native props | `interface P extends React.ComponentProps<'button'> { variant?: 'a' \| 'b' }` |
| Props of another component | `React.ComponentProps<typeof Other>` |
| Style | `style?: React.CSSProperties` |
| State | `useState<User \| null>(null)`, `useState<Item[]>([])` ⚠️ `useState([])` → `never[]` |
| Setter prop | `(value: T) => void` (simple) or `React.Dispatch<React.SetStateAction<T>>` |
| DOM ref | `useRef<HTMLInputElement>(null)` → access with `ref.current?.` |
| Value ref | `useRef<number \| null>(null)`; `useRef(0)` |
| Timer ID | `ReturnType<typeof setTimeout>` (works in browser and Node typings) |
| Events | `React.ChangeEvent<HTMLInputElement>`, `React.FormEvent<HTMLFormElement>`, `React.MouseEvent<HTMLButtonElement>`, `React.KeyboardEvent<HTMLInputElement>` |
| Handler props | `onClick?: React.MouseEventHandler<HTMLButtonElement>` |
| Context | `createContext<Value \| null>(null)` + hook that throws if null |
| Reducer | `type Action = { type: 'a' } \| { type: 'b'; payload: X }`; `reducer(state: S, action: Action): S` |
| Custom hook tuple | `return [value, setValue] as const` |
| Generic component | `function List<T>(props: ListProps<T>)`; arrow: `<T,>(props: ListProps<T>) =>` |
| Component as prop | `React.ComponentType<P>`; any tag or component: `React.ElementType` |
| Ref prop (React 19) | `ref?: React.Ref<HTMLInputElement>` (included in `ComponentProps<'input'>`) |
| forwardRef (React 18) | `forwardRef<HTMLInputElement, Props>((props, ref) => …)` |

---

## Common error messages decoded

| Error | Usually means | Fix |
| --- | --- | --- |
| `Type 'X' is not assignable to type 'Y'` | Wrong shape/type | Read the **last** indented line for the real property |
| `Object is possibly 'null'` / `'undefined'` | Value may be missing | `?.`, `??`, an `if` check, or fix the type |
| `Property 'x' does not exist on type 'Y'` | Typo, or the type is too narrow/union not narrowed | Narrow first, or add the property to the type |
| `Parameter 'x' implicitly has an 'any' type` | Missing annotation (`noImplicitAny`) | Annotate the parameter |
| `Argument of type 'string' is not assignable to parameter of type '"a" \| "b"'` | A `let`/object property widened to `string` | `as const`, a `const` variable, or annotate with the union |
| `Type 'never[]'…` | `useState([])` / `[]` without a type | `useState<Item[]>([])` |
| `Element implicitly has an 'any' type because expression of type 'string' can't be used to index type` | `obj[key]` with a `string` key | Type key as `keyof typeof obj`, or use `Record<string, V>` |
| `Cannot find module 'x' or its corresponding type declarations` | No types for the package/file | `npm i -D @types/x` or a `declare module` |
| `'x' is declared but its value is never read` | Unused variable | Remove it or prefix with `_` (if configured) |
| `JSX element type 'X' does not have any construct or call signatures` | Passing an instance/element where a component is expected | Use `React.ComponentType` / `ElementType` |

---

## Things people commonly forget

1. **Types don't exist at runtime.** API responses, `JSON.parse`, localStorage and form data aren't checked: validate with Zod or type guards.
2. Turn on `strict: true`. Without it, `null`/`undefined` bugs aren't caught.
3. Prefer `unknown` over `any`, and narrow it.
4. `as` and `!` silence errors without making code safe.
5. `useState([])` is `never[]`; `useState(null)` is `null` forever: pass a type argument.
6. Empty arrays (`const a = []`) need annotations.
7. `arr[i]` is typed as defined even when it's `undefined` (unless `noUncheckedIndexedAccess`).
8. `Omit` doesn't check key names; `Pick` does.
9. `Partial`/`Readonly` are shallow.
10. `{}` doesn't mean "empty object".
11. `let x = 'a'` is `string`; `const x = 'a'` is `'a'`. Object properties widen too: use `as const`.
12. Return tuples from hooks with `as const`.
13. Generic arrow functions in `.tsx` need `<T,>`.
14. `catch (e)` is `unknown`: narrow with `instanceof Error`.
15. `typeof x === 'object'` is also true for `null` and arrays.
16. Truthiness narrowing removes `0` and `''`, not just `null`/`undefined`.
17. Excess property checks only apply to fresh object literals.
18. String enums don't accept plain strings; unions are usually simpler.
19. `import type` for types-only imports (required with `verbatimModuleSyntax`).
20. Vite doesn't type-check: run `tsc --noEmit` in CI.
