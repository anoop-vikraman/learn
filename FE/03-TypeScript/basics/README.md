# TypeScript basics: start here

TypeScript (TS) is **JavaScript with types**. You write normal JavaScript plus type annotations; the TypeScript compiler checks them and finds mistakes **before** the code runs. Then the types are removed and plain JavaScript runs in the browser.

You should know basic JavaScript first ([../../01-JavaScript/basics/](../../01-JavaScript/basics/)). Read the lessons **in order**.

| # | Lesson | You will learn |
| --- | --- | --- |
| 01 | [Setup and basic types](01-setup-basic-types.md) | Why TS, installing, `tsconfig`, type annotations and inference, primitives, arrays, tuples, `any` vs `unknown`, `never` |
| 02 | [Functions, objects, type aliases and interfaces](02-functions-objects-interfaces.md) | Typing functions, optional/default params, object types, `type` vs `interface`, optional and readonly properties, index signatures |
| 03 | [Unions, narrowing and generics](03-unions-narrowing-generics.md) | Union and literal types, type guards, discriminated unions, `as const`, generics and constraints |
| 04 | [Utility types, classes, enums and modules](04-utility-types-classes-modules.md) | `Partial`, `Pick`, `Omit`, `Record`…, `keyof`, `typeof`, classes with access modifiers, enums vs unions, type-only imports, `.d.ts` |
| 05 | [TypeScript with React](05-typescript-with-react.md) | Typing props, children, state, events, refs, context, reducers, custom hooks, generic components, API data |
| — | [**Cheat sheet**](cheat-sheet.md) | All syntax, utility types, `tsconfig` options, React types, edge cases and things people forget |

After these, continue with [../01-typescript-notes.md](../01-typescript-notes.md) and [../02-extra-advanced-types-and-questions.md](../02-extra-advanced-types-and-questions.md).

## Try it without installing anything

Open the **TypeScript Playground** at <https://www.typescriptlang.org/play>. Type code on the left, see errors underlined and the JavaScript output on the right. Hover over any variable to see its type.
