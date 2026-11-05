# Behavioral extra: answer templates, questions to ask, interview-day plan

## "Tell me about yourself" (90 seconds, Present → Past → Future)

> "I'm a frontend developer with **[X] years** of experience, mainly in **React and TypeScript**. Right now at **[Company]** I work on **[product]**, where I **[biggest responsibility: built the component library / own the dashboard module / led the migration to TanStack Query]**.
>
> Before that, I **[previous role / project]**, where I got strong at **[testing, performance, CI/CD]**.
>
> One thing I'm proud of is **[one quantified win: cut load time by 40%, reduced bundle size from 1.2 MB to 600 KB, raised test coverage from 30% to 75%]**.
>
> I'm looking for a role where I can **[go deeper into design systems / own features end-to-end / work on a product at scale]**, and that's why this position caught my attention: **[specific thing about the company or stack: Stencil + React design system, GitLab CI culture]**."

Fill in the brackets tonight and say it out loud 3 times. Don't memorize it word for word: memorize the **bullet points**.

## STAR template (fill one in for each story)

| | Your story |
| --- | --- |
| **S**ituation (1–2 sentences) | Context: team, product, problem |
| **T**ask (1 sentence) | What *you* were responsible for |
| **A**ction (60% of the answer) | What **you** did, step by step. Say "I", not "we" |
| **R**esult (with a number) | Measurable outcome + what you learned |

### Example: performance story

- **S:** Our orders dashboard took about 6 s to become interactive. Support tickets complained about lag when filtering.
- **T:** I owned improving it before a big client demo.
- **A:** I profiled with React DevTools and Lighthouse. I found (1) the whole table re-rendering on every keystroke because filter state lived at the top, (2) 5,000 rows rendered at once, (3) moment.js + full lodash in the bundle. I moved filter state down and used `useDeferredValue`, virtualized the table with TanStack Virtual, lazy-loaded the charts route, and replaced moment with date-fns.
- **R:** Time-to-interactive dropped from 6 s to 1.8 s, the bundle shrank by 35%, and filter input lag went from about 400 ms to imperceptible. I added a bundle-size check to CI so it doesn't regress.

### Example: disagreement story

- **S:** In code review a senior dev wanted to put all server data in Redux. I suggested TanStack Query.
- **T:** Reach a decision without blocking the sprint.
- **A:** Instead of arguing in comments, I built a small spike on one screen with both approaches and compared lines of code, loading/error handling and caching behaviour. We discussed it in a 20-minute call. I acknowledged Redux was still right for some client state.
- **R:** The team adopted TanStack Query for server state. We deleted about 800 lines of Redux boilerplate over two sprints. Lesson: show, don't argue, and separate the decision from ego.

### Example: production bug story

- **S:** After a release, some users saw another customer's name flash on the profile page.
- **T:** I was on call and had to find and fix it fast.
- **A:** I reproduced it by switching profiles quickly on a throttled network. It was a race condition: an older fetch resolved after a newer one. I hot-fixed it with an AbortController in the effect cleanup, then migrated the page to TanStack Query with the user id in the query key. I added a test using MSW with delayed responses.
- **R:** The fix shipped within 2 hours and there have been no recurrences. I wrote a short team note on race conditions in effects, and we added the ESLint exhaustive-deps rule as an error.

## Common behavioral questions → which story to use

| Question | Story |
| --- | --- |
| Tell me about a challenge / difficult technical problem | Performance or production bug |
| A time you disagreed / had conflict | Disagreement |
| A mistake or failure | Production bug (own it, show the fix + prevention) |
| A time you led something / took initiative | Refactor/architecture |
| Tight deadline | Performance (demo deadline) |
| Learning something new quickly | Any story where you picked up a new tool (Stencil, TanStack, Docker) |
| Why are you leaving? | Positive only: growth, scope, tech, never criticise your current employer |
| Where do you see yourself in 3–5 years? | Deeper expertise (senior/lead frontend, design systems, architecture) + mentoring |
| Biggest weakness | A real one + what you're doing about it ("I used to over-polish PRs; now I open draft MRs early to get feedback sooner") |
| Why this company? | Specifics: their product, stack, engineering blog, culture |

## Questions to ask them (pick 3–4)

1. "What does a typical sprint look like for the frontend team? How are features scoped from design to release?"
2. "How is the design system built and shared? Is it Stencil web components consumed by React, or separate libraries?"
3. "What's the testing culture like? Unit/integration with RTL, E2E with Playwright? Is coverage enforced in CI?"
4. "How often do you deploy to production? What does the GitLab pipeline look like?"
5. "What's the biggest technical challenge the team is facing right now?"
6. "What would success look like for this role in the first 3 months?"
7. "How do code reviews work? How many approvals, any pair programming?"

## Live-coding etiquette

1. **Repeat the problem** in your own words and ask clarifying questions (inputs, edge cases, constraints).
2. **State your plan** before typing: "I'll keep the todos in state, derive the filtered list, then handle edge cases."
3. **Start simple**, get it working, then improve. Working code beats perfect code that's half done.
4. **Narrate**: "I'm using a functional update here because…"
5. **Test as you go**: run it, try an edge case (empty input, double click, fast typing).
6. **If stuck**, say what you're thinking. Interviewers often give hints.
7. **At the end**, list improvements: "With more time I'd add tests, memoize the row, handle errors, and add a11y labels."

## Interview-day plan

**Morning (90 min):**
- [ ] 30 min: read every **Gotchas** list (React, TS, TanStack, Testing, Build, Docker)
- [ ] 20 min: re-do 5 output puzzles and 3 spot-the-bug drills
- [ ] 10 min: write `useDebounce` and a fetch-with-abort effect from memory
- [ ] 20 min: say "tell me about yourself" + 2 STAR stories out loud
- [ ] 10 min: review the final checklist in `01-behavioral-checklist.md`

**One hour before:**
- [ ] Laptop charged, camera/mic tested, stable internet, IDE or CodeSandbox ready
- [ ] Water, a notepad for clarifying questions
- [ ] Job description open: map 3 of its keywords to your experience

**During:**
- Pause before answering. "Good question, let me think for a second" is fine.
- Don't know something? "I haven't used X in production, but I understand it as… and here's how I'd approach it." That's honest and shows reasoning.
- Tie answers back to your own experience: "In my last project we…"

**After:**
- Send a short thank-you note mentioning one thing you enjoyed discussing.

## 30-second answers to "explain X like I'm your teammate"

| Topic | One-liner |
| --- | --- |
| Virtual DOM | A lightweight JS copy of the UI that React diffs to apply minimal real DOM updates |
| Reconciliation | React's diffing algorithm: same type + key = update; different = replace |
| Hooks | Functions that let function components use state, effects, context; called in the same order every render |
| useEffect | Sync with external systems after render; return cleanup |
| Keys | Stable identities for list items so state sticks to the right item |
| Context | Dependency injection for the component tree; every consumer re-renders on value change |
| Memoization | Cache results/identities to skip work; measure first |
| TanStack Query | Server-state cache: fetching, caching, dedupe, background refetch, mutations |
| staleTime vs gcTime | How long data is fresh vs how long unused data stays in memory |
| TypeScript generics | Type parameters: write once, keep type safety for any type |
| Tree shaking | Removing unused exports at build time; needs ESM |
| Vite | Native ESM dev server + esbuild pre-bundling; Rollup for prod |
| Shadow DOM | Encapsulated DOM + styles inside a custom element |
| Docker multi-stage | Build in a Node image, ship only static files in a tiny Nginx image |
| GitLab cache vs artifacts | Cache = speed (deps, best effort); artifacts = job outputs passed to later stages |

You've prepared well. Sleep, eat, and walk in confident. 💪
