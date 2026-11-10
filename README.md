# React Interview Prep: Index

Your original notes from `React Interview Crash Plan.md` are split word for word into the numbered files. Files with **extra** in the name are new material: more questions with model answers, code snippets, puzzles and drills.

| # | Folder | Original notes | Extra material |
| --- | --- | --- | --- |
| 00 | [Study Plan](00-Study-Plan/) | study-schedule | — |
| 01 | [JavaScript](01-JavaScript/) | async/event loop, internals, 10 puzzles, write-it-yourself | 20 more puzzles, polyfills (Promise.any, pool, LRU, curry, EventEmitter…), Q&A |
| 02 | [React](02-React/) | explained simply, core concepts/hooks/performance | custom hooks, 11 machine-coding solutions, advanced Q&A, 18 spot-the-bug drills, **new hooks (React 18/19/19.2)**, **portals**, **HOCs** |
| 03 | [TypeScript](03-TypeScript/) | TS notes | advanced types, utility types from scratch, React typing patterns, Q&A |
| 04 | [TanStack Query](04-TanStack-Query/) | TanStack notes | key factory, queryOptions, Suspense, prefetch, v5 flags, Q&A |
| 05 | [Testing](05-Testing/) | Jest/Vitest/RTL notes | mocking, fake timers, MSW error states, renderHook, Playwright, Q&A |
| 06 | [Build Tools](06-Build-Tools/) | Babel/Webpack/Vite notes | real vite + webpack configs, code splitting, Q&A, **toolchain parts + comparison tables** |
| 07 | [SASS + CSS](07-SASS-CSS/) | SASS notes | maps/tokens, @forward, BEM, core CSS questions (box model, stacking, grid) |
| 08 | [Web Components / Stencil / shadcn](08-Web-Components-Stencil-shadcn/) | notes | lifecycle, slots, ::part, full Stencil component, cva + cn, Q&A |
| 09 | [Design Patterns + SOLID](09-Design-Patterns-SOLID/) | notes | strategy, factory, adapter, facade, observer, state machine, Q&A |
| 10 | [Git + GitLab CI](10-Git-GitLab-CI/) | notes | git commands, full production pipeline, Q&A |
| 11 | [Docker](11-Docker/) | notes | dev/prod Dockerfiles, runtime config, full Compose, Q&A |
| 12 | [Web Fundamentals](12-Web-Fundamentals-Performance-Security/) | *(new folder)* | HTTP, caching, CORS, XSS/CSRF, Core Web Vitals, a11y, system design (RADIO) |
| 13 | [Behavioral + Final Checklist](13-Behavioral-Final-Checklist/) | stories + checklist | intro template, STAR examples, questions to ask, interview-day plan |
| 14 | [CV Project Questions](14-CV-Project-Questions/) | *(new folder)* | questions + model answers for each CV project (Procurement, Knowledge Graph, Winmore), every listed skill, CV red flags, STAR stories |
| 15 | [Zustand + Redux](15-Zustand-Redux/) | *(new folder)* | Zustand guide (selectors, useShallow, middleware, slices, testing), Redux Toolkit guide (createSlice, thunks, createSelector, entity adapter, RTK Query, listeners), side-by-side comparison + decision guide |

## Suggested order if time is short

1. `02-React/` (all files), especially **spot-the-bug**, **machine-coding** and **07-new-hooks** (a common "what's new?" question)
2. `01-JavaScript/03` + `05` (puzzles) and `04` + `06` (coding tasks)
3. `03-TypeScript/`, then `04-TanStack-Query/`, then `05-Testing/`
4. Skim the Gotchas and Q&A in folders 06–12
5. Morning: `13-Behavioral-Final-Checklist/`

Tip: the puzzle and bug files use `<details>` blocks. In VS Code's Markdown preview (Ctrl+Shift+V) the answers stay hidden until you click them.
