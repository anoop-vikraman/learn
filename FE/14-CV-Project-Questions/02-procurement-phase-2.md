# Procurement Phase 2 (Sep 2025 – Jul 2026)

> A web-based rebuild of the organization's procurement tool: purchase requests, multi-level approvals, real-time tracking, expense recording, and integration with the Finbook Accounts app.
>
> **Stack:** React, TypeScript, MUI, React Hook Form, Formik, Yup, Keycloak, Storybook, Jest, Git, JIRA

This is your strongest project, so expect **most of the interview** to come from it. Each section below matches one CV bullet.

---

## A. Project overview

### A1. Explain the project in two minutes. What does a user actually do in it?

<details>
<summary>Model answer</summary>

> "Employees raise a **purchase request**, which goes through **multi-level approvals** (for example manager → department head → finance, depending on amount or category). Once approved it becomes a purchase order, and vendors, bills and provisions are recorded against it. Some expenses don't have a PO, so there is a **Non-PO Bill** flow. **Provision Entry** records expenses that are incurred but not yet billed, which accounting needs at month end. **Vendor Management** is the vendor master: details, tax registration, bank info.
>
> Everything syncs into **Finbook Accounts**, so finance sees spending in real time instead of re-entering it.
>
> I owned Vendor Management, Provision Entry and Non-PO Bill end to end, and built shared infrastructure: the API layer, SSO, feature flags and the build setup."

Know the **user roles** (requester, approver, finance, admin) and the **life cycle of a request**. Interviewers like asking you to draw it.

</details>

### A2. What was the frontend architecture? How was the code organized?

<details>
<summary>Model answer</summary>

```
src/
  api/            # axios instance, interceptors, per-module API functions
  auth/           # Keycloak init, AuthProvider, useAuth, ProtectedRoute
  components/     # shared, Storybook-documented UI (Table, SearchableSelect, PdfViewer…)
  features/
    vendor/       # pages, components, hooks, schema.ts (Yup), types.ts
    provision/
    non-po-bill/
  config/         # env config, feature flags
  hooks/          # shared hooks (useDebounce, useInfiniteList…)
  theme/          # MUI theme
  utils/          # tax calculation, formatters (pure, unit-tested)
```

Key points to say:
- **Feature-based folders**: everything for one module lives together, so a team member can work on one module without touching others.
- **Pure business logic outside components** (tax calculation in `utils/`), so it's easy to unit-test.
- **Shared components in Storybook**, so other developers reuse them instead of rebuilding.
- **State**: server state through [TanStack Query / custom hooks]; global client state (user, permissions, flags) in [Context / Zustand]; form state in React Hook Form.

</details>

### A3. What does "modernizing and restructuring the React codebase" mean? What was wrong before?

<details>
<summary>Model answer</summary>

Fill in what really applied:
> "Phase 1 was [plain JavaScript / class components / inconsistent styling / no tests]. We:
> - migrated to **TypeScript** gradually: `allowJs`, new files in TS, typing API responses first because that's where most bugs came from
> - standardized on **MUI** with one theme instead of mixed CSS
> - extracted repeated UI into **shared components documented in Storybook**
> - moved to a **feature-based folder structure**
> - added **ESLint + Prettier + Husky pre-commit hooks**"

**Follow-up: how do you migrate JS to TS without stopping feature work?**
`allowJs: true`, convert file by file starting with leaf utilities and API types, `strict` enabled per folder or later, avoid `any` by using `unknown` plus type guards at API boundaries.

</details>

---

## B. Multi-environment builds and CI/CD

### B1. How did you set up the Dev, QA, Staging and Prod builds?

<details>
<summary>Model answer</summary>

Each environment has its own env file and npm script:

```jsonc
// package.json
"scripts": {
  "start":         "vite --mode development",
  "build:qa":      "vite build --mode qa",
  "build:staging": "vite build --mode staging",
  "build:prod":    "vite build --mode production"
}
```

```bash
# .env.qa
VITE_API_BASE_URL=https://qa-api.example.com
VITE_KEYCLOAK_URL=https://qa-sso.example.com
VITE_KEYCLOAK_REALM=procurement-qa
VITE_FEATURE_FLAGS=vendor,provision
```

*(With CRA this would be `env-cmd -f .env.qa react-scripts build` and `REACT_APP_` prefixes. Use whichever you actually had.)*

The pipeline picks the script by branch: `develop` → dev, `qa` → QA, `release/*` → staging, `main` → prod (with manual approval).

</details>

### B2. Are environment variables in a React app secret?

<details>
<summary>Answer: no, and this is a common trap question</summary>

They are **inlined into the JS bundle at build time**, so anyone can read them in DevTools. Only put **public** config there (API URLs, Keycloak realm, client ID of a *public* client). Secrets (client secrets, DB passwords, API keys) belong on the backend.

**Follow-up: build-time vs runtime config.** Build-time env vars mean one build per environment. An alternative is "build once, deploy many": the app loads `/config.json` at startup, or the Nginx/Docker entrypoint writes `window.__ENV__`. The same artifact is promoted from QA to prod, so what you tested is exactly what ships.

</details>

### B3. Walk me through your CI/CD pipeline.

<details>
<summary>Model answer</summary>

```yaml
stages: [install, lint, test, build, deploy]

test:
  script:
    - npm ci
    - npm run lint
    - npm run test -- --coverage
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'

build_qa:
  stage: build
  script: npm run build:qa
  artifacts: { paths: [dist/] }
  only: [qa]

deploy_prod:
  stage: deploy
  when: manual
  only: [main]
```

Mention: `npm ci` for reproducible installs, caching `node_modules`/`.npm`, the coverage gate (fail under 80%), artifacts passed from build to deploy, a manual gate for prod. See [10-Git-GitLab-CI](../10-Git-GitLab-CI/) for more.

</details>

---

## C. Centralized API layer with Axios and interceptors

### C1. Show me how your Axios layer worked.

<details>
<summary>Model answer with code</summary>

```ts
// api/client.ts
import axios from 'axios';
import { keycloak } from '../auth/keycloak';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30_000,
});

// Request: attach a fresh token
api.interceptors.request.use(async (config) => {
  if (keycloak.authenticated) {
    await keycloak.updateToken(30);           // refresh if it expires within 30 s
    config.headers.Authorization = `Bearer ${keycloak.token}`;
  }
  return config;
});

// Response: one place for errors
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status;
    if (status === 401) {
      keycloak.login();                        // session is really gone
    } else if (status === 403) {
      notify.error('You do not have permission for this action');
    } else if (!error.response) {
      notify.error('Network error, check your connection');
    }
    return Promise.reject(normalizeError(error)); // { message, code, fieldErrors }
  }
);
```

```ts
// features/vendor/api.ts
export const vendorApi = {
  list: (params: VendorQuery, signal?: AbortSignal) =>
    api.get<Page<Vendor>>('/vendors', { params, signal }).then(r => r.data),
  create: (body: VendorInput) => api.post<Vendor>('/vendors', body).then(r => r.data),
};
```

Benefits: components never deal with tokens or base URLs; errors come in **one shape**; changing auth or adding logging touches one file.

</details>

### C2. What if several requests get a 401 at the same time? How do you avoid refreshing the token five times?

<details>
<summary>Model answer</summary>

Share **one in-flight refresh promise**; other requests wait on it and then retry.

```ts
let refreshing: Promise<void> | null = null;

api.interceptors.response.use(undefined, async (error) => {
  const original = error.config;
  if (error.response?.status !== 401 || original._retry) throw error;
  original._retry = true;                     // retry once only, no infinite loop

  refreshing ??= keycloak.updateToken(-1)     // -1 = force refresh
    .then(() => {})
    .finally(() => { refreshing = null; });

  try {
    await refreshing;
  } catch {
    keycloak.login();
    throw error;
  }
  original.headers.Authorization = `Bearer ${keycloak.token}`;
  return api(original);
});
```

</details>

### C3. Your CV says the Axios layer handled "cross-origin resolution". Can the frontend fix CORS?

<details>
<summary>Answer: careful, this is the likely trap in that bullet</summary>

**No.** CORS is enforced by the browser based on **response headers from the server** (`Access-Control-Allow-Origin`, and so on). The frontend cannot turn it off.

What the frontend *can* do, and what you likely mean:
- In **development**, use a **dev-server proxy** (`server.proxy` in Vite, `proxy` in CRA) so the browser sees same-origin requests.
- In **production**, serve the API behind the **same domain** through a reverse proxy (Nginx `/api → backend`), or ask the backend to set the right CORS headers.
- Set `withCredentials: true` in Axios when cookies must be sent cross-origin (the server must then send `Access-Control-Allow-Credentials: true` and a specific origin, not `*`).
- Understand **preflight**: a custom `Authorization` header or a JSON content type triggers an `OPTIONS` request, so the backend must answer it.

Consider rewording the bullet to "…and a dev proxy / environment-based base URLs to avoid cross-origin issues."

</details>

### C4. How do you cancel requests, for example when a user leaves the page or types fast in a search?

<details>
<summary>Model answer</summary>

`AbortController` (Axios supports `signal`):

```ts
useEffect(() => {
  const controller = new AbortController();
  api.get('/vendors', { params: { q }, signal: controller.signal })
     .then(r => setData(r.data))
     .catch(e => { if (!axios.isCancel(e)) setError(e); });
  return () => controller.abort();
}, [q]);
```

TanStack Query passes a `signal` to `queryFn` automatically. Debounce the input too, so you don't fire a request on every keystroke.

</details>

### C5. Axios vs fetch: why Axios?

<details>
<summary>Answer</summary>

Axios gives you interceptors, automatic JSON parsing, **rejection on non-2xx** (fetch only rejects on network errors), timeouts, upload progress events (useful for file uploads) and instance defaults. Fetch is built in and has no dependency; you'd write a small wrapper to get the same behaviour.

</details>

---

## D. Vendor Management, Provision Entry, Non-PO Bill: complex forms and tax calculation

### D1. How did you structure a large form like the Non-PO Bill with dynamic line items?

<details>
<summary>Model answer with code</summary>

React Hook Form + `useFieldArray` + a Yup schema:

```tsx
const lineItem = yup.object({
  description: yup.string().required(),
  quantity: yup.number().positive().required(),
  unitPrice: yup.number().min(0).required(),
  taxCode: yup.string().required(),
});

const schema = yup.object({
  vendorId: yup.string().required('Select a vendor'),
  billDate: yup.date().max(new Date(), 'Bill date cannot be in the future').required(),
  items: yup.array(lineItem).min(1, 'Add at least one item'),
});

type BillForm = yup.InferType<typeof schema>;

function NonPoBillForm() {
  const { control, handleSubmit } = useForm<BillForm>({
    resolver: yupResolver(schema),
    defaultValues: { items: [emptyItem] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = useWatch({ control, name: 'items' });
  const totals = useMemo(() => calculateTotals(items), [items]);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {fields.map((f, i) => (
        <LineItemRow key={f.id} index={i} control={control} onRemove={() => remove(i)} />
      ))}
      <Button onClick={() => append(emptyItem)}>Add item</Button>
      <TotalsPanel totals={totals} />
    </form>
  );
}
```

Points to make:
- `key={f.id}`, **not the index**, because rows can be removed.
- `useWatch` scoped to `items`, so only the totals area re-renders and not the whole form.
- Each row is its own memoized component.

</details>

### D2. How did the dynamic tax calculation work? (Expect deep follow-ups here.)

<details>
<summary>Model answer</summary>

Adapt to your real rules. In India this is usually **GST**: CGST + SGST for intra-state supply, IGST for inter-state, plus **TDS** deductions on some vendor categories.

```ts
// utils/tax.ts: pure function, fully unit-tested
export function calculateLine(item: LineItem, ctx: TaxContext) {
  const taxable = round2(item.quantity * item.unitPrice - (item.discount ?? 0));
  const rate = ctx.rates[item.taxCode];               // e.g. 18
  const intraState = ctx.vendorState === ctx.companyState;
  const tax = intraState
    ? { cgst: round2(taxable * rate / 200), sgst: round2(taxable * rate / 200), igst: 0 }
    : { cgst: 0, sgst: 0, igst: round2(taxable * rate / 100) };
  return { taxable, ...tax, total: round2(taxable + tax.cgst + tax.sgst + tax.igst) };
}
```

Things to say:
- The calculation is a **pure function** outside the component, with a test table of tax scenarios agreed with finance.
- It **re-runs when inputs change** (vendor state, tax code, quantity), and the result is derived with `useMemo`, **not stored in state**.
- The **backend recalculates and is the source of truth**; the frontend total is a preview. A mismatch is shown as an error.
- **Rounding** rules (per line or on the total) were agreed with finance, because a 1-paisa difference breaks reconciliation.

</details>

### D3. How do you handle money in JavaScript? Why not just use numbers?

<details>
<summary>Answer</summary>

`0.1 + 0.2 === 0.30000000000000004`: floating-point can't represent most decimals exactly. Options:
- Work in **integer minor units** (paise or cents) and divide only for display.
- Round at defined points with `Math.round(x * 100) / 100` (careful: `1.005` still rounds wrong; `Number.EPSILON` tricks or a library help).
- Use a decimal library (`decimal.js`, `big.js`, `dinero.js`) for anything serious.
- Display with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.

</details>

### D4. How did you do conditional or dependent fields? (e.g. "if vendor type is X, show GSTIN")

<details>
<summary>Answer</summary>

```ts
gstin: yup.string().when('isGstRegistered', {
  is: true,
  then: s => s.required().matches(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Invalid GSTIN'),
  otherwise: s => s.strip(),
}),
```

In the UI, `useWatch({ name: 'isGstRegistered' })` decides whether the field renders. Use `shouldUnregister: true` (or Yup `strip`) so hidden fields don't get submitted.

</details>

### D5. How do you show server-side validation errors on the right fields?

<details>
<summary>Answer</summary>

The interceptor normalizes the error into `{ fieldErrors: { gstin: 'Already exists' } }`. Then:

```ts
onError: (err) => {
  Object.entries(err.fieldErrors ?? {}).forEach(([name, message]) =>
    setError(name as keyof VendorForm, { type: 'server', message }));
}
```

</details>

### D6. How did you handle edit mode, prefilling a form from the API?

<details>
<summary>Answer</summary>

Fetch the record, then `reset(mapApiToForm(data))` once it arrives. Don't put the data in `defaultValues` before it loads, because `defaultValues` is read only on first render. Keep a mapper between the API shape and the form shape (dates, nested objects, nulls → empty strings).

</details>

### D7. How do you stop a user losing a half-filled form?

<details>
<summary>Answer</summary>

Use `formState.isDirty` to warn on navigation (React Router `useBlocker`) and on tab close (`beforeunload`). Optionally save a draft to `localStorage` or to a backend "draft" status.

</details>

---

## E. Keycloak SSO with a legacy-login fallback

### E1. How does Keycloak SSO work in your app? Explain the flow.

<details>
<summary>Model answer</summary>

Keycloak is an **identity provider** implementing **OpenID Connect** (on top of OAuth 2.0). For an SPA we used the **Authorization Code flow with PKCE**:

1. The app loads; `keycloak-js` runs `init({ onLoad: 'check-sso' | 'login-required', pkceMethod: 'S256' })`.
2. If there's no session, the browser is **redirected to the Keycloak login page**.
3. After login, Keycloak redirects back with an **authorization code**.
4. `keycloak-js` exchanges the code (plus the PKCE verifier) for an **access token**, an **ID token** and a **refresh token**.
5. Every API call sends `Authorization: Bearer <access token>`; the backend verifies the JWT signature with Keycloak's public keys.
6. `updateToken()` refreshes the access token before it expires.

**SSO** means that if the user is already logged in to Keycloak (from another company app), step 2 returns immediately without asking for a password.

```tsx
// auth/AuthProvider.tsx
const keycloak = new Keycloak({ url, realm, clientId });

export function AuthProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256' })
      .then(() => setReady(true));
    keycloak.onTokenExpired = () => keycloak.updateToken(30).catch(() => keycloak.login());
  }, []);
  if (!ready) return <FullPageSpinner />;
  return <AuthContext.Provider value={keycloak}>{children}</AuthContext.Provider>;
}
```

*Watch out for React 18 StrictMode, which runs effects twice in development: `keycloak.init` must only run once (guard with a ref or init outside React).*

</details>

### E2. What was the "legacy login fallback"? Why was it needed?

<details>
<summary>Model answer</summary>

Adapt to the real reason:
> "Not every user had been migrated to Keycloak yet, and some environments didn't have Keycloak at first. We kept the old username/password login behind a flag. At startup the app read a config value (or checked if Keycloak was reachable). If SSO was enabled it used Keycloak; otherwise it used the legacy login, which returned a token from our own backend. Both paths ended in the **same `AuthContext` interface** (`user`, `token`, `logout`), so the rest of the app didn't care which one was used. That's the **adapter / strategy pattern**."

```ts
interface AuthProvider { init(): Promise<void>; getToken(): Promise<string>; logout(): void; user: User | null }
const auth: AuthProvider = config.ssoEnabled ? keycloakAuth : legacyAuth;
```

</details>

### E3. Where do you store tokens? localStorage vs memory vs cookies?

<details>
<summary>Answer</summary>

| Option | XSS risk | CSRF risk | Notes |
| --- | --- | --- | --- |
| `localStorage` | **High**: any injected script can read it | None | Simple, survives reload |
| Memory (JS variable) | Lower: lost on reload | None | What `keycloak-js` does; reload uses the SSO session to get a new token silently |
| `httpOnly` cookie | JS can't read it | Needs `SameSite` / CSRF token | Needs a backend (BFF pattern) |

`keycloak-js` keeps tokens **in memory** and gets new ones from the Keycloak session cookie. The most secure SPA setup is a **BFF** (backend-for-frontend) holding tokens in httpOnly cookies.

</details>

### E4. Authentication vs authorization? How did you do role-based access in the UI?

<details>
<summary>Answer</summary>

**Authentication** = who are you (login). **Authorization** = what are you allowed to do (roles/permissions).

Keycloak roles appear in the token (`realm_access.roles`, `resource_access[clientId].roles`):

```tsx
const can = (role: string) => keycloak.hasResourceRole(role);
{can('approve_bill') && <Button>Approve</Button>}

<Route element={<RequireRole role="finance" />}>
  <Route path="/provisions" element={<ProvisionList />} />
</Route>
```

**Always say:** hiding buttons is UX only. **The backend must enforce permissions**, because anyone can call the API directly.

</details>

### E5. What's in a JWT? Can the frontend trust it?

<details>
<summary>Answer</summary>

Three base64url parts: `header.payload.signature`. The payload holds claims (`sub`, `exp`, `iss`, `aud`, roles). It is **signed, not encrypted**, so anyone can read it. The frontend can *read* it (to show a name or hide UI) but only the backend's **signature check** makes it trustworthy. Never put secrets in a JWT.

</details>

### E6. OAuth 2.0 vs OpenID Connect?

<details>
<summary>Answer</summary>

OAuth 2.0 is for **authorization** (delegated access, giving you an access token). OIDC is an identity layer on top that adds **authentication**: an **ID token** (a JWT about the user), a `userinfo` endpoint, standard scopes (`openid profile email`). Keycloak supports both.

**Why PKCE?** An SPA can't keep a client secret. PKCE stops an intercepted authorization code from being exchanged by an attacker, because the attacker doesn't have the code verifier. The old **implicit flow** (token in the URL) is deprecated.

</details>

---

## F. Feature-flag system

### F1. How did your feature-flag system work?

<details>
<summary>Model answer</summary>

> "Modules were released at different times, and staging often had features that production didn't. Flags came from [env config per build / an API endpoint / a JSON config], were loaded once at startup into a context, and checked in three places: **routes**, **navigation menu** and **individual UI elements**."

```tsx
type Flag = 'vendorManagement' | 'provisionEntry' | 'nonPoBill' | 'dashboard';

const FlagsContext = createContext<Record<Flag, boolean>>({} as never);
export const useFlag = (f: Flag) => useContext(FlagsContext)[f] ?? false;

export function Feature({ flag, children, fallback = null }: { flag: Flag; children: ReactNode; fallback?: ReactNode }) {
  return useFlag(flag) ? <>{children}</> : <>{fallback}</>;
}

// Routes and menu built from one config, so they never disagree
const modules = [
  { flag: 'vendorManagement', path: '/vendors', label: 'Vendors', element: lazy(() => import('./features/vendor')) },
  // …
];
```

**Why "scalable":** adding a module means adding one entry to the config, and the route, menu item and guard follow. Flags were typed (a union type), so typos fail at compile time.

</details>

### F2. Follow-ups on feature flags

<details>
<summary>Answers</summary>

- **Build-time vs runtime flags?** Build-time (env vars) needs a rebuild to change, but unused code can be tree-shaken out. Runtime (API/config) can be toggled without a deploy and can target users or roles. Mention tools like LaunchDarkly, Unleash or Flagsmith.
- **Is a flag a security control?** No. A hidden route can still be reached by calling the API, so the backend must check too.
- **Flag debt?** Remove flags once a feature is fully released. Keep a list and clean up each release.
- **Combine with lazy loading** so disabled modules are never downloaded.

</details>

---

## G. Advanced UI components

### G1. Tell me about the PDF viewer with "coordinate-based extraction". How did it work?

<details>
<summary>Model answer</summary>

Adapt to your real implementation. A likely version:

> "Users uploaded vendor bills as PDFs. They could **draw a box** over a part of the page (like the invoice number or total) and the app extracted the text in that area to fill form fields."

How:
1. Render pages with **PDF.js** (`pdfjs-dist` / `react-pdf`) onto a canvas, with a transparent **overlay layer** for the selection.
2. Track `mousedown` → `mousemove` → `mouseup` on the overlay to get a rectangle in **screen pixels**.
3. **Convert to PDF coordinates**: PDF units are points (1/72 inch) with the **origin at the bottom-left**, while the screen origin is top-left. Divide by the zoom scale and flip the Y axis. PDF.js gives `viewport.convertToPdfPoint(x, y)` for exactly this.
4. Either filter `page.getTextContent()` items whose `transform` positions fall inside the box, or send the coordinates to the backend for OCR (for scanned PDFs, which have no text layer).
5. Put the extracted value into the form with `setValue`.

Follow-ups:
- **Zoom/rotation?** Keep coordinates in PDF space and convert to screen only when drawing, so selections survive zoom.
- **Big PDFs?** Render only visible pages (virtualize), run PDF.js in its **web worker**, and lazy-load the whole viewer since PDF.js is large.
- **Scanned PDFs?** No text layer, so OCR (backend or Tesseract.js) is needed.

</details>

### G2. How did you build the searchable dropdown with infinite scroll?

<details>
<summary>Model answer with code</summary>

MUI `Autocomplete` + server-side search + pagination when the user scrolls to the end of the list:

```tsx
function VendorSelect({ value, onChange }: Props) {
  const [input, setInput] = useState('');
  const q = useDebounce(input, 300);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['vendors', 'search', q],
    queryFn: ({ pageParam, signal }) => vendorApi.list({ q, page: pageParam, size: 20 }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const options = data?.pages.flatMap(p => p.items) ?? [];

  return (
    <Autocomplete
      options={options}
      value={value}
      onChange={(_, v) => onChange(v)}
      filterOptions={(x) => x}                      // server already filtered
      getOptionLabel={(o) => o.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onInputChange={(_, v) => setInput(v)}
      loading={isLoading || isFetchingNextPage}
      ListboxProps={{
        onScroll: (e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50 && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        },
      }}
      renderInput={(p) => <TextField {...p} label="Vendor" />}
    />
  );
}
```

Key points:
- **Debounce** the search (300 ms).
- `filterOptions={(x) => x}` to turn off MUI's client-side filtering.
- Guard against **duplicate page fetches** (`!isFetchingNextPage`).
- **Cancel stale requests** (the `signal`), so an old response can't overwrite a newer one.
- **Edit mode:** the selected vendor may not be on page 1, so make sure the current value is still displayed (pass it in or fetch it by ID).
- An `IntersectionObserver` on a sentinel element is an alternative to the scroll handler.
- For thousands of loaded options, **virtualize** the listbox (`react-window`).
- **Accessibility:** MUI Autocomplete already handles the combobox ARIA roles and keyboard navigation.

</details>

---

## H. Dashboard analytics and multi-level approval workflow

### H1. How did you build the dashboard? Which chart library? How did you "transform backend data"?

<details>
<summary>Model answer</summary>

> "Charts used [Recharts / MUI X Charts / Chart.js]. The backend returned raw records or aggregates; I wrote **selector functions** that turned them into chart shapes (group by month, by department, by status), kept outside components and memoized."

```ts
const spendByMonth = useMemo(
  () => Object.entries(groupBy(bills, b => format(b.date, 'yyyy-MM')))
              .map(([month, list]) => ({ month, total: sum(list.map(b => b.amount)) })),
  [bills]
);
```

Follow-ups:
- **Should aggregation happen on the frontend or backend?** For big data sets, the backend. Don't send 50,000 rows to aggregate in the browser.
- **Loading each widget independently** with its own query and skeleton, so one slow widget doesn't block the page.
- **"Real-time tracking"**: polling (`refetchInterval`), refetch on window focus, or WebSockets/SSE if truly live. Say which you used.

</details>

### H2. How did the multi-level approval workflow work on the frontend?

<details>
<summary>Model answer</summary>

Treat it as a **state machine**:

```
DRAFT → SUBMITTED → L1_APPROVED → L2_APPROVED → APPROVED
             ↘ REJECTED (with comment)      ↘ SENT_BACK → DRAFT
```

- The backend decides the next approver and allowed actions; the API returns `allowedActions: ['APPROVE', 'REJECT', 'SEND_BACK']` for the current user, and the UI renders **only those buttons**. No approval logic is duplicated in the frontend.
- A **timeline / stepper** (MUI `Stepper`) shows each level, approver, time and comment.
- The **audit log** is an append-only list of who did what and when, shown in a table.
- After an action: disable the button while it's pending (no double approval), then invalidate the request detail and the "pending approvals" list.

**Follow-up: two approvers act at the same time?** The backend uses optimistic locking (a version number); the frontend shows "This request was updated by someone else" on a 409 and refetches.

</details>

---

## I. Collaboration, Storybook, testing and coverage

### I1. How did you work with designers and backend developers on API contracts?

<details>
<summary>Model answer</summary>

> "Before building a module we agreed the request/response shapes, in [Swagger/OpenAPI / a shared doc]. While the backend was still being built I mocked the API with **MSW**, so the frontend wasn't blocked. Validation rules were agreed so the Yup schema and backend validation matched. For financial edge cases (partial payments, tax-exempt vendors, rounding) we met with finance and wrote the scenarios down as test cases."

Have **one example** ready where you pushed back or changed a contract, e.g. "I asked the backend to return `allowedActions` instead of me computing permissions in the UI."

</details>

### I2. Why Storybook? How did you use it?

<details>
<summary>Answer</summary>

Storybook lets you build and document components **in isolation** with every state (loading, error, empty, disabled, long text) without clicking through the app. It is living documentation for the team, and designers can review components there.

```tsx
// SearchableSelect.stories.tsx
const meta: Meta<typeof SearchableSelect> = { component: SearchableSelect, title: 'Inputs/SearchableSelect' };
export default meta;
export const Default: StoryObj<typeof SearchableSelect> = { args: { label: 'Vendor' } };
export const Loading: StoryObj<typeof SearchableSelect> = { args: { loading: true } };
export const WithError: StoryObj<typeof SearchableSelect> = { args: { error: 'Required' } };
```

Extras worth mentioning if you used them: MSW addon for API mocks in stories, `play` functions for interaction tests, a11y addon, Chromatic for visual regression.

</details>

### I3. You say coverage was over 80%. What does coverage measure, and is 80% good?

<details>
<summary>Answer</summary>

Coverage measures **which lines/branches/functions ran** during tests, **not whether behaviour is correct**. You can reach 100% with tests that assert nothing.

> "80% was our CI gate. We focused it on where bugs hurt most: tax calculation utilities (close to 100%, table-driven tests), form validation and submit flows, permission-based rendering, and the API error handling. We didn't chase coverage on simple presentational components. **Branch coverage** is more meaningful than line coverage for logic like tax rules."

</details>

### I4. Show a test you'd write for the Non-PO Bill form.

<details>
<summary>Model answer with code</summary>

```tsx
test('shows validation errors and does not submit an empty bill', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  render(<NonPoBillForm onSubmit={onSubmit} />);

  await user.click(screen.getByRole('button', { name: /submit/i }));

  expect(await screen.findByText(/select a vendor/i)).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('calculates IGST for an inter-state vendor', async () => {
  const user = userEvent.setup();
  render(<NonPoBillForm />, { wrapper: Providers });   // MSW returns an inter-state vendor

  await user.click(screen.getByLabelText(/vendor/i));
  await user.click(await screen.findByRole('option', { name: /acme/i }));
  await user.type(screen.getByLabelText(/quantity/i), '2');
  await user.type(screen.getByLabelText(/unit price/i), '1000');

  expect(screen.getByTestId('igst')).toHaveTextContent('360.00');
});

// Pure function, table-driven
test.each([
  [1000, 18, true,  { cgst: 90, sgst: 90, igst: 0 }],
  [1000, 18, false, { cgst: 0,  sgst: 0,  igst: 180 }],
])('tax on %d at %d%% (intra=%s)', (amount, rate, intra, expected) => {
  expect(calculateLine(item(amount, rate), ctx(intra))).toMatchObject(expected);
});
```

</details>

### I5. How did you test components that depend on Keycloak?

<details>
<summary>Answer</summary>

Mock the auth module so tests never hit a real IdP:

```ts
jest.mock('../auth/keycloak', () => ({
  keycloak: { authenticated: true, token: 'fake', hasResourceRole: (r: string) => r === 'approver', updateToken: jest.fn().mockResolvedValue(true) },
}));
```

Or provide a test `AuthContext` value in a custom `render` wrapper, which is cleaner and lets each test pick roles.

</details>

### I6. What do you look for in code reviews?

<details>
<summary>Answer</summary>

Correctness and edge cases first (empty, error, loading, permissions), then: tests for the change, types (no stray `any`), unnecessary re-renders or effects, accessibility (labels, keyboard), naming and readability, reuse of existing shared components, no secrets or console logs. Be kind and specific; separate "must fix" from "nit".

</details>

---

## J. Rapid-fire follow-ups for this project

<details>
<summary>Short answers</summary>

- **Why MUI over Bootstrap?** A rich set of complex components (Autocomplete, DataGrid, DatePicker, Stepper) with a theme system and good accessibility, which suits a data-heavy admin app.
- **How did you customize MUI?** `createTheme` (palette, typography, component `defaultProps` and `styleOverrides`), the `sx` prop for one-offs, `styled()` for reusable variants.
- **Large tables?** Server-side pagination, sorting and filtering; MUI DataGrid or virtualization for big client-side lists.
- **How did data reach Finbook?** Backend-to-backend integration; the frontend showed sync status and retry options. *(Say exactly what you know; don't invent backend details.)*
- **Date/time zones?** Store UTC, display local; send dates as ISO strings; be careful that a bill date (date only) doesn't shift a day due to time zones.
- **Biggest bug you hit?** Prepare one real story (e.g. a tax total off by rounding, the token-refresh race, StrictMode double init).
- **What would you improve?** [TanStack Query everywhere / E2E tests with Playwright / OpenAPI-generated types / better error monitoring with Sentry.]

</details>
