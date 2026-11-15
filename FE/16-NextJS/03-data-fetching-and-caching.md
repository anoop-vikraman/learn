# 03 · Data fetching and caching

## 1. Fetching in Server Components

> **In short:** Make the component `async` and `await` your data directly — no `useEffect`, no loading state, no waterfall of client requests.

```tsx
// app/tasks/page.tsx
export default async function TasksPage() {
  const tasks = await db.task.findMany({ orderBy: { createdAt: 'desc' } });
  return <TaskTable tasks={tasks} />;
}
```

```tsx
// Or over HTTP
async function getTasks() {
  const res = await fetch('https://api.example.com/tasks', { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);     // caught by the nearest error.tsx
  return res.json() as Promise<Task[]>;
}
```

Benefits: one network hop for the user, secrets stay server-side, no client JS for the fetching logic, and the HTML already contains the data (good for SEO).

## 2. Parallel vs sequential

> **In short:** Sequential `await`s create waterfalls; start independent requests together with `Promise.all`.

```tsx
// ❌ ~600 ms (200 + 200 + 200)
const user = await getUser(id);
const tasks = await getTasks(id);
const stats = await getStats(id);

// ✅ ~200 ms
const [user, tasks, stats] = await Promise.all([getUser(id), getTasks(id), getStats(id)]);

// ✅ Preload pattern: start early, await late
const tasksPromise = getTasks(id);          // no await yet
const user = await getUser(id);             // needs to resolve first for a permission check
const tasks = await tasksPromise;           // already in flight
```

A genuine dependency (you need the user's team ID before fetching the team) is a legitimate sequential case.

## 3. Request Memoization

> **In short:** Within a single request, React dedupes identical `fetch` calls, so several components can each fetch the same data without extra network calls.

```tsx
// Both of these run one HTTP request total
async function getUser(id: string) {
  const res = await fetch(`https://api.example.com/users/${id}`);
  return res.json();
}

// in generateMetadata
const user = await getUser(id);
// in the page
const user = await getUser(id);
```

This works for `fetch` automatically (same URL + options). For non-`fetch` data (Prisma, SDKs), wrap it in React's `cache`:

```ts
import { cache } from 'react';

export const getUser = cache(async (id: string) => db.user.findUnique({ where: { id } }));
```

This **only** dedupes within one request — it is not a persistent cache.

## 4. The Data Cache

> **In short:** Next.js can persist `fetch` results across requests and deployments; in Next 15 this is **opt-in** per call.

```ts
fetch(url)                                     // not cached (default in Next 15) — fresh every request
fetch(url, { cache: 'force-cache' })           // cached indefinitely until revalidated
fetch(url, { cache: 'no-store' })              // never cached, and makes the route dynamic
fetch(url, { next: { revalidate: 3600 } })     // cached, refreshed at most once an hour (ISR)
fetch(url, { next: { tags: ['tasks'] } })      // cached and taggable for on-demand invalidation
```

Route-level defaults:

```ts
// app/tasks/page.tsx
export const revalidate = 60;                  // this route's data revalidates every 60 s
export const dynamic = 'force-dynamic';        // never cache this route
export const dynamic = 'force-static';         // force static, even with dynamic APIs
export const fetchCache = 'default-cache';     // override fetch defaults for the whole route
```

For non-`fetch` sources (an ORM), use `unstable_cache` (Next 15) or `"use cache"` (Next 16):

```ts
import { unstable_cache } from 'next/cache';

export const getTopTasks = unstable_cache(
  async (userId: string) => db.task.findMany({ where: { userId }, take: 10 }),
  ['top-tasks'],                               // key parts
  { revalidate: 300, tags: ['tasks'] },
);
```

```ts
// Next.js 16 Cache Components
'use cache';
export async function getTopTasks(userId: string) { /* … */ }
```

## 5. Revalidation

> **In short:** Time-based revalidation refreshes on a schedule (ISR); on-demand revalidation clears caches immediately after a mutation.

```ts
// Time-based: stale-while-revalidate — users get the cached copy, the next request triggers a refresh
export const revalidate = 3600;
```

```ts
// On-demand, in a Server Action or Route Handler
'use server';
import { revalidateTag, revalidatePath } from 'next/cache';

export async function createTask(formData: FormData) {
  await db.task.create({ data: { title: String(formData.get('title')) } });
  revalidateTag('tasks');            // every fetch tagged 'tasks' is now stale
  revalidatePath('/tasks');          // that route's Full Route Cache is cleared
}
```

```ts
// A webhook from your CMS
// app/api/revalidate/route.ts
export async function POST(req: Request) {
  const secret = req.headers.get('x-secret');
  if (secret !== process.env.REVALIDATE_SECRET) return new Response('Unauthorized', { status: 401 });
  revalidateTag('posts');
  return Response.json({ revalidated: true });
}
```

**ISR in one sentence:** the page is static (fast, CDN-cacheable) but Next.js re-renders it in the background when it's older than `revalidate` or when you invalidate it — so you get static performance with fresh content.

## 6. The Full Route Cache and the Router Cache

> **In short:** The Full Route Cache stores rendered HTML/RSC on the server for static routes; the Router Cache holds payloads in the browser for instant back/forward and prefetched navigation.

| | Full Route Cache (server) | Router Cache (client) |
| --- | --- | --- |
| Holds | Rendered HTML + RSC payload | RSC payloads for visited/prefetched routes |
| Invalidated by | `revalidatePath`, `revalidateTag`, redeploy | `router.refresh()`, server action revalidation, 30 s/5 min staleness, full reload |
| Tune with | `revalidate`, `dynamic` | `experimental.staleTimes` in `next.config` |

```ts
'use client';
const router = useRouter();
router.refresh();        // re-fetch the current route's server data, preserving client state
```

## 7. Streaming and Suspense

> **In short:** `loading.tsx` streams a fallback for a whole segment; `<Suspense>` streams individual slow parts so fast content appears first.

```tsx
export default function Page() {
  return (
    <>
      <h1>Dashboard</h1>                           {/* sent immediately */}
      <Suspense fallback={<CardSkeleton />}>
        <Revenue />                                 {/* slow query */}
      </Suspense>
      <Suspense fallback={<TableSkeleton />}>
        <RecentOrders />
      </Suspense>
    </>
  );
}
```

Why it matters for interviews: streaming improves **TTFB** and **FCP** because the server doesn't wait for the slowest query before sending anything, and each Suspense boundary is an independent chunk of the HTML stream.

⚠️ Make the *children* async, not the page — an `async` page awaits before any Suspense boundary can help.

## 8. Dynamic APIs and when a route goes dynamic

> **In short:** Using request-specific data opts the route out of static rendering; isolate those reads so the rest of the page can stay static.

Dynamic triggers: `cookies()`, `headers()`, `draftMode()`, `connection()`, `searchParams`, `fetch(..., { cache: 'no-store' })`, `export const dynamic = 'force-dynamic'`.

```tsx
// Keep the page static and push the dynamic part into a Suspense boundary
export default function Page() {
  return (
    <>
      <StaticMarketingHero />
      <Suspense fallback={<GreetingSkeleton />}>
        <PersonalGreeting />            {/* this one calls cookies() */}
      </Suspense>
    </>
  );
}
```

(This is exactly what **Partial Prerendering** generalises: a static shell with dynamic holes.)

## 9. Client-side fetching

> **In short:** Use TanStack Query or SWR in Client Components for data that changes while the user watches, needs polling, or is user-specific and not worth server-rendering.

```tsx
'use client';
import { useQuery } from '@tanstack/react-query';

export function LiveStatus({ id }: { id: string }) {
  const { data, isPending } = useQuery({
    queryKey: ['status', id],
    queryFn: () => fetch(`/api/jobs/${id}/status`).then((r) => r.json()),
    refetchInterval: 5000,
  });
  return <span>{isPending ? '…' : data.status}</span>;
}
```

Server-render the initial data and hydrate it to avoid a loading flash:

```tsx
// Server Component
const dehydratedState = await prefetchTasks();
return <HydrationBoundary state={dehydratedState}><TaskList /></HydrationBoundary>;
```

More: [../04-TanStack-Query/](../04-TanStack-Query/).

## 10. Error handling in data fetching

> **In short:** Throwing in a Server Component triggers the nearest `error.tsx`; return a typed result instead when the UI should handle the failure inline.

```tsx
// Throw → error boundary
const res = await fetch(url);
if (!res.ok) throw new Error(`Failed to load tasks: ${res.status}`);

// Or degrade gracefully
async function Stats() {
  try {
    const stats = await getStats();
    return <StatsGrid stats={stats} />;
  } catch {
    return <p>Stats are temporarily unavailable.</p>;     // the rest of the page still works
  }
}
```

In production, error messages are hidden from the client; log them server-side and show `error.digest` for support.

## 11. A decision table

> **In short:** Pick the strategy from how fresh the data must be and who it belongs to.

| Data | Approach |
| --- | --- |
| Marketing copy, docs | Static (default) |
| Product catalogue, blog | `revalidate: 3600` + `revalidateTag` on CMS webhook (ISR) |
| Logged-in dashboard | Dynamic (`cookies()`), stream slow parts with Suspense |
| Live job progress, chat | Client fetching with polling, or SSE/WebSocket |
| Search results from `?q=` | Dynamic via `searchParams`, debounce on the client |
| Same data in metadata + page | One `cache()`-wrapped function, deduped automatically |

---

## 12. Exercises

1. Convert a `useEffect` fetch into an async Server Component and compare the Network tab.
2. Turn a 3-step waterfall into `Promise.all` and measure the difference.
3. Tag a fetch with `['tasks']`, then invalidate it from a Server Action and watch the list update.
4. Add `revalidate = 30` to a page and observe stale-while-revalidate behaviour across refreshes.
5. Put two slow components in separate Suspense boundaries; confirm with throttling that the fast content paints first.
6. Make a page accidentally dynamic with `cookies()`, then fix it by isolating that read.
