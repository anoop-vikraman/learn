## 11. Behavioral prep and final checklist

Prepare two project stories in STAR format (Situation, Task, Action, Result) with a number in the result. Most behavioral questions can be answered with one of them.

### Stories to have ready

- A performance problem you found and fixed (what you measured, what changed, by how much).
- A refactor or architecture decision you drove, and the trade-off you accepted.
- A disagreement in code review and how it was resolved.
- A production bug: how you debugged it and what you changed to prevent it.
- Your questions for them: team structure, how the design system is shared (Stencil + React?), testing culture, CI/CD and release frequency.

### Can you explain these without notes? (tick off tomorrow morning)

- [ ] What triggers a re-render, and three ways to prevent unnecessary ones
- [ ] Why keys matter; why index keys break
- [ ] Stale closure: cause and fix
- [ ] `useEffect` cleanup + race-condition-safe fetch
- [ ] `useMemo` vs `useCallback` vs `React.memo`
- [ ] React 19 features in one sentence each
- [ ] `type` vs `interface`; `unknown` vs `any`; a generic component
- [ ] `staleTime` vs `gcTime`; invalidation after a mutation; optimistic update steps
- [ ] RTL query priority; `getBy`/`queryBy`/`findBy`; MSW
- [ ] Jest vs Vitest; why Vite is fast in development
- [ ] Loader vs plugin; tree shaking
- [ ] `@use` vs `@import`; SASS variables vs CSS variables
- [ ] Shadow DOM encapsulation; Stencil decorators; what shadcn actually is
- [ ] SOLID with one React example each
- [ ] `cache` vs `artifacts` in GitLab CI; merge vs rebase
- [ ] Multi-stage Dockerfile for a React app + the Nginx SPA fallback

### Live coding warm-ups (if there's a coding round)

1. `useDebounce(value, delay)` hook + a search input that fetches.
2. A fetch component with loading, error and empty states (then the same with TanStack Query).
3. A todo list: add, toggle, delete, filter; then write one RTL test for it.
4. A compound `Tabs` or `Accordion` component.
5. Fix a buggy component: missing key, stale closure in `setInterval`, missing effect cleanup.

In the interview, think out loud, ask about requirements before coding, and mention trade-offs. Saying "I'd measure first" or "it depends on X; here's how I'd decide" scores well.
