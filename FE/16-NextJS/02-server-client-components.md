# 02 · Server and Client Components

## 1. The default is server

> **In short:** Every component in `app/` is a Server Component until a file says `'use client'`; Server Components run only on the server and send no JavaScript to the browser.

```tsx
// app/tasks/page.tsx — a Server Component (no directive needed)
import { db } from '@/lib/db';

export default async function TasksPage() {
  const tasks = await db.task.findMany();     // runs on the server; the DB client never ships to the browser
  return <ul>{tasks.map((t) => <li key={t.id}>{t.title}</li>)}</ul>;
}
```

| | Server Component | Client Component |
| --- | --- | --- |
| Runs | On the server (build or request) | On the server (for the HTML) **and** in the browser |
| Can `await` directly | ✅ | ❌ (use `use()` or an effect/query library) |
| Access DB, secrets, filesystem | ✅ | ❌ |
| `useState`, `useEffect`, `useRef` | ❌ | ✅ |
| Event handlers (`onClick`) | ❌ | ✅ |
| Browser APIs (`window`, `localStorage`) | ❌ | ✅ |
| Ships JS to the browser | ❌ | ✅ |
| Can import the other kind | ✅ imports Client Components | ❌ can't import Server Components (only receive them as props) |

## 2. `'use client'` marks a boundary, not one file

> **In short:** `'use client'` at the top of a file makes that file **and everything it imports** part of the client bundle — it's the entry point to the client tree, not a per-component switch.

```tsx
// app/_components/TaskFilter.tsx
'use client';                                  // must be the first line, before imports

import { useState } from 'react';
import { heavyFormatter } from '@/lib/format'; // ⚠️ this now ships to the browser too

export function TaskFilter({ onChange }: { onChange: (v: string) => void }) {
  const [value, setValue] = useState('');
  return <input value={value} onChange={(e) => { setValue(e.target.value); onChange(e.target.value); }} />;
}
```

Rules of thumb:
- Put `'use client'` **as deep in the tree as possible** — leaves, not layouts.
- A Server Component can render a Client Component; the reverse needs the children pattern (section 4).
- Third-party components using hooks or context need `'use client'` — wrap them in your own file if the library doesn't declare it.

## 3. Choosing which to use

> **In short:** Default to Server Components; reach for a Client Component only when you need interactivity, state, effects or browser APIs.

| Need | Component |
| --- | --- |
| Fetch data, query the DB, read secrets | Server |
| Render large static content (markdown, tables) | Server |
| Keep a big dependency out of the bundle | Server |
| `onClick`, `onChange`, forms with live validation | Client |
| `useState`, `useReducer`, `useEffect` | Client |
| `window`, `localStorage`, `IntersectionObserver` | Client |
| React Context provider/consumer | Client |
| Custom hooks that use state/effects | Client |

## 4. Composition patterns

> **In short:** Pass Server Components into Client Components as `children` (or any prop) so the server-rendered part stays on the server.

### ❌ Importing a Server Component into a Client Component

> **In short:** Importing pulls it into the client bundle — this is the mistake to avoid.

```tsx
'use client';
import { ServerTaskList } from './ServerTaskList';   // ❌ becomes a Client Component (or errors)
```

### ✅ Passing it as children ("the slot pattern")

> **In short:** Pass server-rendered nodes as props so they stay on the server.

```tsx
// app/_components/Collapsible.tsx
'use client';
import { useState } from 'react';

export function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button onClick={() => setOpen((o) => !o)}>{title}</button>
      {open && children}                       {/* already-rendered server content */}
    </section>
  );
}
```

```tsx
// app/tasks/page.tsx — Server Component
export default async function Page() {
  return (
    <Collapsible title="Recent tasks">
      <ServerTaskList />                       {/* ✅ stays a Server Component */}
    </Collapsible>
  );
}
```

The Client Component receives the **already-rendered** React node and just decides where to put it — it never runs that component's code.

### Interleaving: a server page with client islands

> **In short:** A server page composes static server sections with small interactive client components.

```tsx
// Server
export default async function DashboardPage() {
  const [stats, tasks] = await Promise.all([getStats(), getTasks()]);
  return (
    <>
      <StatsGrid stats={stats} />            {/* Server: static markup */}
      <TaskFilterBar />                       {/* Client: interactive */}
      <TaskTable tasks={tasks} />             {/* Server, or Client if rows are interactive */}
    </>
  );
}
```

## 5. Props must be serializable

> **In short:** Props crossing from a Server to a Client Component are serialized into the RSC payload, so they can only be plain data (plus Server Actions and React nodes).

```tsx
// ✅ allowed
<Chart data={[{ x: 1, y: 2 }]} title="Sales" createdAt={new Date()} onSave={serverAction} >{node}</Chart>

// ❌ not allowed
<Chart format={(v) => v.toFixed(2)} client={new PrismaClient()} map={new Map()} />
```

⚠️ Two security implications:
- Anything you pass is **visible in the payload** — never pass a whole user record containing a password hash; `select` only what the UI needs.
- Functions can't cross the boundary (except Server Actions), so define formatters inside the Client Component.

## 6. Where environment variables go

> **In short:** Only variables prefixed `NEXT_PUBLIC_` reach the browser — everything else is server-only and safe for secrets.

```ts
// Server Component / Server Action / Route Handler
const key = process.env.STRIPE_SECRET_KEY;          // ✅ never shipped

// Client Component
const url = process.env.NEXT_PUBLIC_API_URL;        // ✅ inlined into the bundle at build time
const key = process.env.STRIPE_SECRET_KEY;          // ❌ undefined in the browser
```

Guard server-only modules so a bad import fails loudly at build:

```bash
npm install server-only client-only
```

```ts
// lib/db.ts
import 'server-only';      // build error if a Client Component imports this
```

## 7. Context and providers

> **In short:** Context requires a Client Component, so wrap providers in a `'use client'` file and render it in the root layout around `{children}`.

```tsx
// app/providers.tsx
'use client';
import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());    // one per browser session, not per render
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class">{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
```

```tsx
// app/layout.tsx (still a Server Component)
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
```

Because `children` is passed **through** the provider, pages below it remain Server Components.

## 8. Hydration errors

> **In short:** Hydration fails when the HTML rendered on the server differs from the first client render — usually due to time, randomness, browser-only APIs or invalid nesting.

```tsx
// ❌ differs between server and client
<p>{new Date().toLocaleTimeString()}</p>
<p>{Math.random()}</p>
<p>{localStorage.getItem('name')}</p>

// ✅ render after mount
'use client';
const [time, setTime] = useState<string | null>(null);
useEffect(() => setTime(new Date().toLocaleTimeString()), []);
return <p>{time ?? '—'}</p>;

// ✅ or skip SSR for that component entirely
const Chart = dynamic(() => import('./Chart'), { ssr: false });

// ✅ or suppress for a single unavoidable text node
<time suppressHydrationWarning>{formatted}</time>
```

Other causes: invalid HTML (`<div>` inside `<p>`, `<a>` inside `<a>`), browser extensions injecting markup, and user-locale date/number formatting.

## 9. Streaming with Suspense

> **In short:** Wrap a slow Server Component in `<Suspense>` so the rest of the page streams immediately and the slow part arrives when ready.

```tsx
import { Suspense } from 'react';

export default function DashboardPage() {
  return (
    <>
      <Header />                                   {/* instant */}
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />                                  {/* awaits a slow query; streams in later */}
      </Suspense>
      <Suspense fallback={<FeedSkeleton />}>
        <ActivityFeed />
      </Suspense>
    </>
  );
}
```

Note the page itself isn't `async` — each slow child awaits its own data, so they load in parallel and don't block each other. More in [03-data-fetching-and-caching.md](03-data-fetching-and-caching.md).

## 10. Common mistakes

> **In short:** The frequent errors are misplacing `'use client'`, accidentally pulling the server into the client, and treating Server Components as interactive.

| Mistake | Symptom | Fix |
| --- | --- | --- |
| `'use client'` on the root layout | Whole app becomes client-rendered, bundle balloons | Move it to leaf components |
| `onClick` in a Server Component | "Event handlers cannot be passed to Client Component props" | Make that component a Client Component |
| Importing a DB client in a Client Component | Build error or secret leak | `import 'server-only'`; fetch on the server |
| Passing a function as a prop across the boundary | "Functions cannot be passed directly" | Pass a Server Action, or define the function client-side |
| `useState` in a Server Component | "useState only works in Client Components" | Add `'use client'` |
| Using `searchParams` in a layout | Doesn't update | Read it in the page or with `useSearchParams` |
| `async` Client Component | Not supported | Fetch in a Server parent, or use TanStack Query/`use()` |

---

## 11. Exercises

1. Build a task list page where the list is a Server Component and the filter input is a Client Component.
2. Create a `Collapsible` Client Component and pass a Server Component as its children; prove in DevTools that no extra JS shipped.
3. Add `import 'server-only'` to a DB module and try importing it from a Client Component.
4. Reproduce a hydration error with `Date.now()` and fix it three ways (effect, `dynamic`, `suppressHydrationWarning`).
5. Wrap two slow Server Components in separate `<Suspense>` boundaries and watch them stream in independently.
