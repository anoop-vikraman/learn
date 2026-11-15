# 01 · Setup and routing

## 1. Creating a project

> **In short:** `create-next-app` scaffolds a TypeScript + App Router project with the linter and Tailwind optionally configured.

```bash
npx create-next-app@latest task-dashboard
# ✔ TypeScript?  Yes
# ✔ ESLint?      Yes
# ✔ Tailwind?    Yes (optional)
# ✔ App Router?  Yes
# ✔ Turbopack?   Yes

cd task-dashboard
npm run dev          # http://localhost:3000
npm run build        # production build (read the route table!)
npm start            # serve the production build
```

```
task-dashboard/
  app/                  # the router: every folder is a URL segment
    layout.tsx          # root layout (required) — must render <html> and <body>
    page.tsx            # the / route
    globals.css
  public/               # static files served at / (images, favicon, robots.txt)
  next.config.ts
  tsconfig.json
```

## 2. File conventions

> **In short:** Special filenames inside `app/` create routes and UI states — `page` makes a URL public, `layout` wraps it, and the others handle loading, errors and 404s.

| File | Purpose |
| --- | --- |
| `page.tsx` | **Makes the route publicly accessible.** Without it, the folder is just a path segment |
| `layout.tsx` | Shared shell around a page and its children; **preserves state across navigation**; doesn't re-render |
| `template.tsx` | Like layout but **remounts** on every navigation (use for enter animations / per-page effects) |
| `loading.tsx` | Instant loading UI — wraps the segment in `<Suspense>` automatically |
| `error.tsx` | Error boundary for the segment (must be a Client Component, gets `error` + `reset`) |
| `global-error.tsx` | Catches errors in the root layout (must render its own `<html>`/`<body>`) |
| `not-found.tsx` | UI for `notFound()` and unmatched URLs |
| `route.ts` | An API endpoint instead of a page (can't coexist with `page.tsx` in the same folder) |
| `default.tsx` | Fallback for parallel routes |
| `middleware.ts` | At the **project root**, not in `app/` — runs before matching requests |

Anything else in `app/` (components, utils, tests) is **not** routable — colocation is safe.

```tsx
// app/layout.tsx — the only required file
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

## 3. Routes from folders

> **In short:** Folder names become URL segments; `[param]` captures a value, `[...slug]` captures the rest of the path.

```
app/
  page.tsx                        →  /
  about/page.tsx                  →  /about
  tasks/page.tsx                  →  /tasks
  tasks/[id]/page.tsx             →  /tasks/42          (params.id = '42')
  tasks/[id]/edit/page.tsx        →  /tasks/42/edit
  docs/[...slug]/page.tsx         →  /docs/a/b/c        (params.slug = ['a','b','c'])
  shop/[[...filters]]/page.tsx    →  /shop and /shop/red/large  (optional catch-all)
```

```tsx
// app/tasks/[id]/page.tsx
export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;              // ⚠️ async in Next 15+
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = 'details' } = await searchParams;
  const task = await getTask(id);
  return <h1>{task.title} — {tab}</h1>;
}
```

⚠️ **Next 15 breaking change:** `params` and `searchParams` are **Promises** — you must `await` them (or `use()` them in a Client Component). Reading `searchParams` makes the route dynamic.

## 4. Organising without affecting URLs

> **In short:** Route groups `(name)` group files for layouts or teams without adding a URL segment; private folders `_name` are excluded from routing entirely.

```
app/
  (marketing)/           ← not in the URL
    layout.tsx           ← marketing-only layout (nav + footer)
    page.tsx             →  /
    pricing/page.tsx     →  /pricing
  (app)/
    layout.tsx           ← dashboard layout (sidebar, auth check)
    tasks/page.tsx       →  /tasks
  _components/           ← private: never a route
    TaskCard.tsx
```

Route groups are the standard way to give different sections **different root layouts** (e.g. a marketing site and a logged-in app in one project).

## 5. Nested layouts

> **In short:** Layouts nest automatically down the folder tree and keep their state between navigations, so sidebars don't flicker and scroll position persists.

```
app/layout.tsx              → wraps everything
  app/(app)/layout.tsx      → wraps the dashboard
    app/(app)/tasks/layout.tsx → wraps task pages
      app/(app)/tasks/[id]/page.tsx
```

```tsx
// app/(app)/layout.tsx
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar />              {/* keeps its open/closed state across navigation */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

⚠️ Layouts **don't** receive `searchParams` (they don't re-render on query changes). Read those in the page, or in a Client Component with `useSearchParams`.

## 6. Loading, error and not-found UI

> **In short:** Drop a `loading.tsx` to get a Suspense fallback for free, an `error.tsx` to catch render errors in that segment, and call `notFound()` to render `not-found.tsx` with a 404.

```tsx
// app/tasks/loading.tsx — shown instantly while the page's data resolves
export default function Loading() {
  return <TaskListSkeleton />;
}
```

```tsx
// app/tasks/error.tsx
'use client';                                   // error boundaries must be client components

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert">
      <h2>Could not load tasks</h2>
      <p>{error.digest}</p>                     {/* in production the message is hidden; log the digest */}
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

```tsx
// app/tasks/[id]/page.tsx
import { notFound } from 'next/navigation';

const task = await getTask(id);
if (!task) notFound();                          // renders the nearest not-found.tsx with status 404
```

An `error.tsx` catches errors **below** it, not in its own layout — that's why `global-error.tsx` exists for the root.

## 7. Navigation

> **In short:** Use `<Link>` for navigation (it prefetches and does a client-side transition), `useRouter` for programmatic navigation in Client Components, and `redirect()` on the server.

```tsx
import Link from 'next/link';

<Link href="/tasks">Tasks</Link>
<Link href={`/tasks/${task.id}`} prefetch={false}>{task.title}</Link>
<Link href="/tasks" replace scroll={false}>Tasks</Link>
```

```tsx
'use client';
import { useRouter, usePathname, useSearchParams, useParams } from 'next/navigation';

const router = useRouter();
router.push('/tasks');        // navigate
router.replace('/login');     // no history entry
router.back();
router.refresh();             // re-fetch server data for the current route, keeping client state

const pathname = usePathname();                 // '/tasks/42'
const params = useParams();                     // { id: '42' }
const searchParams = useSearchParams();         // read-only URLSearchParams
```

```tsx
// Server Component / Server Action / Route Handler
import { redirect, permanentRedirect } from 'next/navigation';
redirect('/login');           // 307 (or 303 from an action) — throws, so don't wrap in try/catch
```

⚠️ `redirect()` and `notFound()` work by **throwing a special error**. Calling them inside a `try { } catch { }` swallows the navigation — put them after the try block.

### Active links

> **In short:** Compare `usePathname()` with the href to mark the current page.

```tsx
'use client';
const pathname = usePathname();
<Link href="/tasks" aria-current={pathname === '/tasks' ? 'page' : undefined}>Tasks</Link>
```

### Prefetching

> **In short:** `<Link>` prefetches visible routes automatically; disable it on very long lists.

`<Link>` prefetches routes in the viewport (static: the full payload; dynamic: just the loading shell). Disable with `prefetch={false}` on long lists.

## 8. Parallel and intercepting routes

> **In short:** Parallel routes render several pages into one layout through named slots (`@folder`); intercepting routes (`(.)folder`) let a URL render as a modal over the current page.

```
app/
  layout.tsx            → receives { children, team, analytics }
  @team/page.tsx
  @analytics/page.tsx
  page.tsx
```

```tsx
export default function Layout({ children, team, analytics }:
  { children: React.ReactNode; team: React.ReactNode; analytics: React.ReactNode }) {
  return <>{children}<aside>{team}{analytics}</aside></>;
}
```

The classic combination — a photo grid where clicking opens a modal, but the URL is shareable and a refresh shows the full page:

```
app/
  gallery/page.tsx
  gallery/@modal/(.)photo/[id]/page.tsx      ← intercepts /photo/42 when navigating client-side
  photo/[id]/page.tsx                        ← the real page on direct load/refresh
```

## 9. Metadata and SEO basics

> **In short:** Export a `metadata` object (static) or `generateMetadata` (dynamic) from a layout or page; Next.js renders the tags into `<head>` and merges them down the tree.

```tsx
// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Task Dashboard', template: '%s · Task Dashboard' },
  description: 'Plan and track your work',
  metadataBase: new URL('https://tasks.example.com'),
};
```

```tsx
// app/tasks/[id]/page.tsx
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const task = await getTask(id);                 // deduped with the page's own fetch
  if (!task) return { title: 'Not found' };
  return { title: task.title, openGraph: { title: task.title, images: [`/api/og?id=${id}`] } };
}
```

More (sitemaps, robots, OG images): [06-optimization-seo.md](06-optimization-seo.md).

## 10. Static params for dynamic routes

> **In short:** `generateStaticParams` tells Next.js which dynamic paths to pre-render at build time, turning a dynamic route into many static pages.

```tsx
export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map((p) => ({ slug: p.slug }));     // pre-renders /blog/[slug] for each
}

export const dynamicParams = true;                 // true (default): render unknown slugs on demand; false: 404
```

---

## 11. Exercises

1. Create `/`, `/tasks`, `/tasks/[id]` and a `(marketing)` group with its own layout; confirm the group doesn't appear in URLs.
2. Add `loading.tsx` and `error.tsx` to `/tasks`; make the page throw and confirm `reset()` works.
3. Make `/tasks/[id]` call `notFound()` for an unknown id and add a `not-found.tsx`.
4. Add a sidebar with active-link highlighting using `usePathname`.
5. Add `generateMetadata` to the task page and check the `<title>` in the page source.
6. Build an intercepting-route modal for `/tasks/[id]` over the list.
