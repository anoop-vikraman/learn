# React basics: start here

These lessons teach React from zero. You should know basic JavaScript first, especially arrow functions, destructuring, spread, `map`/`filter`, modules and promises (see [../../01-JavaScript/basics/](../../01-JavaScript/basics/)).

Read **in order** and build every example yourself.

| # | Lesson | You will learn |
| --- | --- | --- |
| 01 | [Setup, JSX and components](01-setup-jsx-components.md) | What React is, creating a project with Vite, JSX rules, components, composition, `children` |
| 02 | [Props, state and events](02-props-state-events.md) | Passing data with props, `useState`, updating objects/arrays immutably, event handlers, lifting state up |
| 03 | [Lists, conditional rendering and forms](03-lists-conditional-forms.md) | `map` + keys, showing/hiding UI, controlled inputs, checkboxes, selects, form submit, validation |
| 04 | [Effects, refs and fetching data](04-effects-refs-data-fetching.md) | `useEffect`, dependencies, cleanup, fetching with loading/error states, `useRef`, when NOT to use effects |
| 05 | [Context, useReducer and custom hooks](05-context-reducer-custom-hooks.md) | Sharing state with Context, `useReducer`, writing your own hooks, rules of hooks |
| 06 | [Performance, routing, styling and project structure](06-performance-routing-styling-structure.md) | `memo`/`useMemo`/`useCallback`, React Router, styling options, folders, error boundaries, lazy loading |
| — | [**Cheat sheet**](cheat-sheet.md) | Every hook and API: arguments, return values, edge cases, rules and things people forget |

After these, continue with [../01-react-explained-simply.md](../01-react-explained-simply.md) and the interview-level files in [../](../).

## Practice projects (in increasing difficulty)

1. Counter with +, −, reset and a step input
2. To-do list: add, toggle, delete, filter, saved to localStorage
3. Search a list of users fetched from an API, with loading and error states
4. Multi-page app with React Router: list page → detail page → edit form
5. Shopping cart with Context + `useReducer`
