# Questions from the skills list

> ReactJS, HTML, JavaScript, TypeScript, CSS, Bootstrap, React Bootstrap, React Testing Library, JSON, UI/UX Design, TanStack Query, Jest, MUI, Zustand, AWS, Git, JIRA, GitLab, MSW, OAuth, Python, SQL, Keycloak, React Hook Form, Yup, Storybook, Kiro, FastAPI

**Every item listed is fair game.** Interviewers often pick the least expected one ("I see Zustand, where did you use it?"). For each skill, have **where you used it** plus one or two technical answers. React, JS, TS, TanStack Query, testing, Git and CSS are covered in depth in folders 01–12; this file focuses on the rest and links to those folders.

---

## Zustand

### Where did you use Zustand, and why not Redux or Context?

<details>
<summary>Answer</summary>

> "[Project/feature]: for global client state like [the logged-in user and permissions / UI state such as the sidebar / filters shared across pages]."

- **vs Context:** Context re-renders **every consumer** when the value changes. Zustand components subscribe with a **selector** and only re-render when *their slice* changes.
- **vs Redux:** no providers, actions, reducers or boilerplate; a tiny API. Redux Toolkit is still good for very large apps with strict patterns and great devtools.
- **Server data doesn't belong in Zustand** → TanStack Query.

```ts
interface UiState { sidebarOpen: boolean; toggleSidebar: () => void }
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({ sidebarOpen: true, toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })) }),
    { name: 'ui' }
  )
);

const open = useUiStore(s => s.sidebarOpen);           // re-renders only when sidebarOpen changes
```

**Trap:** `useStore(s => ({ a: s.a, b: s.b }))` returns a new object each time, causing extra re-renders (or an infinite loop in v5). Use `useShallow` or separate selectors.

</details>

---

## TanStack Query

### Where did you use it, and why?

<details>
<summary>Answer</summary>

It handles **server state**: caching, deduplication, background refetch, retries, pagination/infinite queries, and mutations with invalidation, replacing hand-written `useEffect` + `useState` fetching. Know `staleTime` vs `gcTime`, query keys, `invalidateQueries` after a mutation, optimistic updates, and `useInfiniteQuery` (your infinite-scroll dropdown).

→ Full notes: [04-TanStack-Query](../04-TanStack-Query/)

</details>

---

## MSW (Mock Service Worker)

### What is MSW, and why use it instead of mocking Axios/fetch?

<details>
<summary>Answer</summary>

MSW intercepts requests **at the network level**: a Service Worker in the browser, request interception in Node for tests. Your app code runs completely unchanged (Axios, interceptors, fetch, TanStack Query), so tests are more realistic than `jest.mock('axios')`.

Uses:
1. **Tests:** consistent API mocks; override per test for error states.
2. **Development before the backend is ready:** the same handlers run in the browser.
3. **Storybook:** stories with mocked APIs.

```ts
export const handlers = [
  http.get('/api/vendors', () => HttpResponse.json({ items: [{ id: '1', name: 'Acme' }], hasMore: false })),
];

// one test overrides it
server.use(http.get('/api/vendors', () => new HttpResponse(null, { status: 500 })));
```

</details>

---

## OAuth / Keycloak

<details>
<summary>Answer</summary>

Covered in depth in [02-procurement-phase-2.md, section E](02-procurement-phase-2.md#e-keycloak-sso-with-a-legacy-login-fallback): Authorization Code + PKCE, access/refresh/ID tokens, OAuth vs OIDC, token storage, roles, JWT structure.

**Extra Keycloak vocabulary:** **Realm** = an isolated space of users and clients (often one per environment or tenant). **Client** = an app registered with Keycloak (your SPA is a *public* client, no secret). **Roles**: realm roles (global) vs client roles (per app). **Identity brokering**: Keycloak can log users in through Google, Azure AD, etc.

</details>

---

## React Hook Form vs Formik, and Yup

### Compare React Hook Form and Formik.

<details>
<summary>Answer</summary>

| | React Hook Form | Formik |
| --- | --- | --- |
| Inputs | **Uncontrolled** (refs) by default | Controlled (state) |
| Re-renders | Minimal: only what you subscribe to | The whole form on every keystroke |
| Bundle | Small | Larger |
| Controlled UI libs (MUI) | `<Controller>` / `useController` | Natural fit |
| Maintenance | Very active | Slower development recently |
| Validation | `resolver` (Yup, Zod) or built-in rules | `validationSchema` (Yup) |

Choose RHF for big or performance-sensitive forms. Formik is fine for small forms and teams already using it.

</details>

### Yup vs Zod?

<details>
<summary>Answer</summary>

Both are schema validators. **Zod** is TypeScript-first: `z.infer` gives exact types, with better TS inference. **Yup** is older, very common with Formik, and has `InferType`. Both work with RHF through `@hookform/resolvers`. A single schema can validate the form *and* type the data.

</details>

### Using RHF with MUI components

<details>
<summary>Answer</summary>

MUI inputs are controlled, so wrap them with `Controller`:

```tsx
<Controller
  name="billDate"
  control={control}
  render={({ field, fieldState }) => (
    <DatePicker {...field} label="Bill date"
      slotProps={{ textField: { error: !!fieldState.error, helperText: fieldState.error?.message } }} />
  )}
/>
```

Plain `TextField` can use `{...register('name')}` with `inputRef` handled by spreading, but `Controller` is the safe, consistent choice.

</details>

---

## Storybook

<details>
<summary>Answer</summary>

See [02-procurement-phase-2.md, I2](02-procurement-phase-2.md#i2-why-storybook-how-did-you-use-it). Know: **CSF** (Component Story Format: default export `meta`, named exports are stories), **args** and controls, **decorators** (wrapping stories in a ThemeProvider or Router), **play functions** for interactions, addons (a11y, MSW), and visual regression with Chromatic.

</details>

---

## MUI / Bootstrap / React Bootstrap

<details>
<summary>Answers</summary>

- **Bootstrap vs React Bootstrap:** Bootstrap is CSS plus its own JS (which manipulates the DOM directly, conflicting with React). React Bootstrap rebuilds those components in React without jQuery or Bootstrap JS.
- **MUI vs Bootstrap:** MUI has richer components (Autocomplete, DataGrid, pickers), a JS theme and CSS-in-JS (Emotion), and follows Material Design. Bootstrap is utility/CSS-class based, lighter, and easier to theme with SASS variables.
- **MUI performance note:** `sx` and `styled` have a runtime cost; for hot paths, prefer theme overrides and avoid creating `sx` objects in huge lists.
- **Bootstrap grid:** 12 columns, breakpoints `sm md lg xl xxl`, `container > row > col-md-6`.

</details>

---

## AWS

### Which AWS services do you know, and how did you use them?

<details>
<summary>Answer</summary>

Only claim what you used. From your CV: **S3** (config JSON), **QuickSight** (embedded dashboards). Common frontend-related services to know in one line each:

| Service | What it does | Frontend relevance |
| --- | --- | --- |
| S3 | Object storage | Host a static React build; store uploads (presigned URLs) |
| CloudFront | CDN | Serve the build fast worldwide; cache headers; SPA fallback to `index.html` |
| Amplify | Hosting + CI for frontends | Git-push deploys |
| Cognito | User auth | Alternative to Keycloak |
| Lambda / API Gateway | Serverless backend | APIs the frontend calls |
| QuickSight | BI dashboards | Embedding |

**How would you deploy a React SPA on AWS?** Build → upload to S3 (private bucket) → CloudFront in front with OAC → error responses 403/404 → `/index.html` (status 200) for client-side routing → long cache for hashed assets, `no-cache` for `index.html` → invalidate CloudFront on deploy.

</details>

---

## Python, SQL, FastAPI

Be honest about the level (see [01-intro-and-cv-overview.md, Q6](01-intro-and-cv-overview.md)). Expect basic questions only.

<details>
<summary>Basic answers</summary>

**FastAPI:** a Python web framework built on type hints and Pydantic, async, with automatic OpenAPI/Swagger docs at `/docs` (great for frontend developers: you get the API contract for free).

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

class Vendor(BaseModel):
    name: str
    gstin: str | None = None

@app.get("/vendors/{vendor_id}")
async def get_vendor(vendor_id: int):
    return {"id": vendor_id, "name": "Acme"}

@app.post("/vendors", status_code=201)
async def create_vendor(vendor: Vendor):     # body validated by Pydantic, 422 if invalid
    return vendor
```

Note: CORS is fixed **here, on the server**, which links back to the Axios question.

**Python basics:** list vs tuple (mutable vs immutable), dict, list comprehension `[x*2 for x in items if x > 0]`, `async def`/`await`, virtual environments (`python -m venv`).

**SQL basics:**

```sql
-- Total bill amount per vendor in 2026, highest first, only vendors over 1 lakh
SELECT v.name, SUM(b.amount) AS total
FROM bills b
JOIN vendors v ON v.id = b.vendor_id
WHERE b.bill_date >= '2026-01-01'
GROUP BY v.name
HAVING SUM(b.amount) > 100000
ORDER BY total DESC;
```

Know: `INNER` vs `LEFT JOIN`, `WHERE` vs `HAVING`, primary vs foreign key, what an index is (faster reads, slower writes), SQL injection and parameterized queries.

</details>

---

## Kiro

### What is Kiro? How do you use AI tools in your work?

<details>
<summary>Answer</summary>

**Kiro** is AWS's AI-powered IDE (built on VS Code). It's known for **spec-driven development**: you describe a feature and it produces requirements, a design and a task list before writing code, plus "hooks" that run agents on events like saving a file.

How to talk about AI tools (interviewers want to hear judgment, not blind trust):
> "I use AI tools for boilerplate, test scaffolding, exploring unfamiliar APIs and first drafts. I **review everything** as if a junior wrote it, run the tests, and never paste secrets or confidential client code into tools that aren't approved. They speed me up most on repetitive work; design decisions and debugging tricky state still need me to understand the code."

</details>

---

## JSON

<details>
<summary>Quick answers</summary>

- JSON vs a JS object: JSON is a **string format**: keys must be double-quoted; no functions, `undefined`, comments, `Date` or `Map`.
- `JSON.parse` can throw, so wrap it in try/catch for untrusted input (localStorage, S3 config).
- `JSON.stringify` drops `undefined` and functions, turns `Date` into a string, and throws on circular references.
- `structuredClone` vs `JSON.parse(JSON.stringify(x))` for deep copies: structuredClone keeps Dates, Maps and Sets and handles cycles.

</details>

---

## Git / GitLab / JIRA

<details>
<summary>Quick answers</summary>

- Your branching flow (feature branches → merge requests → review → develop → release/main).
- Merge vs rebase; resolving conflicts; `git stash`; `git cherry-pick` for hotfixes; `git revert` vs `reset`.
- GitLab CI basics: stages, jobs, `cache` vs `artifacts`, rules/only.
- JIRA: sprints, story points, how you broke a module into tickets, how you estimated.

→ [10-Git-GitLab-CI](../10-Git-GitLab-CI/)

</details>

---

## Core skills: where to revise

| Skill | Folder |
| --- | --- |
| JavaScript | [01-JavaScript](../01-JavaScript/) |
| React | [02-React](../02-React/) |
| TypeScript | [03-TypeScript](../03-TypeScript/) |
| Jest / RTL | [05-Testing](../05-Testing/) |
| CSS / HTML | [07-SASS-CSS](../07-SASS-CSS/), [12-Web-Fundamentals](../12-Web-Fundamentals-Performance-Security/) |
