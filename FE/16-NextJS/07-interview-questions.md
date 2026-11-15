# Next.js interview questions

Answers are in collapsible blocks — open the Markdown preview (Ctrl+Shift+V), read the question, answer **out loud**, then click to compare.

---

## A. Fundamentals

<details>
<summary>What is Next.js and what problems does it solve that plain React doesn't?</summary>

React is a UI library: it renders components in the browser. Next.js is a framework around it that adds everything an application needs:

- **Routing** from the file system (no React Router setup)
- **Server rendering** (SSR/SSG/ISR) so HTML arrives filled in — better first paint and SEO
- **React Server Components**, so component code and dependencies can stay off the client entirely
- **Data fetching + caching** built into the rendering model
- **Server Actions** for mutations without hand-writing API endpoints
- **Optimization**: images, fonts, code splitting, prefetching
- **Production output**: a server (or static files), middleware, and deployment conventions

With plain React + Vite you assemble those yourself (React Router, TanStack Query, an SSR setup, an image pipeline).

</details>

<details>
<summary>Explain CSR, SSR, SSG and ISR.</summary>

| Strategy | HTML generated | Pros | Cons | Example |
| --- | --- | --- | --- | --- |
| **CSR** | In the browser | Cheap hosting, rich interactivity | Blank first paint, weaker SEO | Internal dashboard |
| **SSR** | On each request | Always fresh, personalised, SEO-friendly | Server cost, slower TTFB | Logged-in account page |
| **SSG** | At build time | Fastest, CDN-cacheable | Content frozen until rebuild | Docs, marketing |
| **ISR** | Build + background re-render | Static speed with fresh content | Can serve briefly stale data | Product catalogue, blog |

In the App Router you don't pick these with separate functions — Next.js infers them from what the route uses, and you tune with `revalidate`, `dynamic` and cache options.

</details>

<details>
<summary>What is hydration, and why do hydration errors happen?</summary>

Hydration is React attaching to server-rendered HTML in the browser: it walks the existing DOM and wires up event handlers and state instead of re-creating the markup.

Errors happen when the first client render produces different output from the server HTML. Common causes:
- Time or randomness: `new Date()`, `Math.random()`
- Browser-only values: `localStorage`, `window.innerWidth`
- Locale-dependent formatting
- Invalid HTML nesting (`<div>` inside `<p>`)
- Browser extensions modifying the DOM

Fixes: render the varying value in `useEffect` after mount, use `dynamic(..., { ssr: false })`, or `suppressHydrationWarning` for a single unavoidable text node.

</details>

<details>
<summary>App Router vs Pages Router — what actually changed?</summary>

- **Default component type:** Server Components (App) vs Client Components (Pages).
- **Data fetching:** `async` components and `fetch` with cache options vs `getServerSideProps`/`getStaticProps`/`getStaticPaths`.
- **Layouts:** nested `layout.tsx` that preserve state across navigation vs a single `_app.tsx`.
- **Streaming:** built in with Suspense + `loading.tsx`.
- **Mutations:** Server Actions vs API routes + client fetch.
- **API:** `route.ts` using Web `Request`/`Response` vs `pages/api` using Node req/res.

Both can coexist in one project during a migration. New projects use the App Router.

</details>

---

## B. Server and Client Components

<details>
<summary>What's the difference between a Server Component and an SSR'd Client Component?</summary>

This is the question that separates people who've read the docs from people who've used them.

**SSR (Pages Router style):** the component runs on the server to produce HTML, **and** its code is sent to the browser to hydrate and run again. The JS cost is paid either way.

**Server Component:** the component runs **only** on the server. Its code and its imports (a markdown parser, the DB client) are never sent. Its output is serialized into the RSC payload — a description of the UI, not JavaScript.

So: SSR is about *where the first HTML is produced*; RSC is about *which code ever reaches the browser*. A Server Component has no state, no effects and no event handlers — it's rendered once per request, not re-rendered on the client.

</details>

<details>
<summary>When do you add 'use client'?</summary>

When the component needs something that only exists in the browser:
- `useState`, `useReducer`, `useEffect`, `useRef`
- Event handlers (`onClick`, `onChange`)
- Browser APIs (`window`, `localStorage`, `IntersectionObserver`)
- React Context (provider or consumer)
- Most animation and chart libraries

The directive marks a **boundary**: that file and everything it imports become part of the client bundle. So put it on leaf components, never on the root layout.

</details>

<details>
<summary>Can a Client Component render a Server Component?</summary>

Not by importing it — that would turn it into a Client Component. But it can **receive** one as a prop, usually `children`:

```tsx
// Server page
<ClientTabs>
  <ServerExpensiveList />   {/* rendered on the server, passed in as a node */}
</ClientTabs>
```

The Client Component just places the already-rendered node; it never executes that component's code. This is the main composition pattern in the App Router.

</details>

<details>
<summary>What are the constraints on props passed from Server to Client Components?</summary>

They must be **serializable**, because they travel in the RSC payload: plain objects, arrays, strings, numbers, booleans, null, Dates, React nodes and Server Actions. Not allowed: functions, class instances, Maps/Sets, Symbols.

Two practical consequences: define callbacks inside the Client Component (or pass a Server Action), and remember anything you pass is **visible in the payload** — never spread a whole user record with a password hash.

</details>

---

## C. Data fetching and caching

<details>
<summary>Explain Next.js 15's caching layers.</summary>

Four of them:

1. **Request Memoization** — React dedupes identical `fetch` calls (and `cache()`-wrapped functions) within a single request. Automatic, per-request only.
2. **Data Cache** — persists `fetch` results across requests and deploys. **Off by default in Next 15**; opt in with `cache: 'force-cache'` or `next: { revalidate }`. Invalidated by time, `revalidateTag` or `revalidatePath`.
3. **Full Route Cache** — the rendered HTML + RSC payload for static routes, stored on the server at build time.
4. **Router Cache** — the client-side cache of RSC payloads for visited/prefetched routes, so back/forward and prefetched links are instant.

Most "stale data" bugs are: forgetting `revalidateTag`/`revalidatePath` after a mutation, or expecting the Next 14 default (cached `fetch`) in Next 15.

</details>

<details>
<summary>How do you revalidate data after a mutation?</summary>

In the Server Action (or route handler) that performed the write:

```ts
revalidateTag('tasks');       // every fetch tagged 'tasks'
revalidatePath('/tasks');     // that route's rendered output
```

`revalidateTag` is better for data used by several routes; `revalidatePath` for a specific page. Both also refresh the client Router Cache, so the user sees the new data without a reload. From a Client Component you can also call `router.refresh()`.

</details>

<details>
<summary>What makes a route dynamic, and why does it matter?</summary>

Using request-specific data: `cookies()`, `headers()`, `searchParams`, `draftMode()`, `connection()`, `fetch(..., { cache: 'no-store' })`, or `export const dynamic = 'force-dynamic'`.

It matters because a dynamic route is rendered on **every** request — no CDN caching, higher TTFB, more server cost. One `cookies()` call deep in a tree makes the whole route dynamic.

The fix is to isolate the dynamic part in a small component wrapped in `<Suspense>`, so the rest of the page stays static and streams instantly. Partial Prerendering generalises exactly this.

</details>

<details>
<summary>How does streaming work and why is it useful?</summary>

React renders to a stream; Next.js sends the HTML it already has and keeps the connection open. Each `<Suspense>` boundary sends its fallback first, then the real content when its data resolves.

Benefits: **TTFB and FCP** don't wait for the slowest query, the user sees layout and fast sections immediately, and slow sections load in parallel rather than blocking each other. `loading.tsx` is sugar for wrapping a whole segment in Suspense.

Gotcha: make the slow **children** async, not the page — an `async` page awaits before any boundary can help.

</details>

<details>
<summary>How do you avoid request waterfalls?</summary>

- `Promise.all` for independent requests in the same component.
- The **preload pattern**: start a fetch without awaiting, await it later.
- Separate `<Suspense>` boundaries so sibling components fetch in parallel.
- Deduplicate with `fetch` memoization or React's `cache()` so metadata and page don't double-fetch.
- Don't fetch in a Client Component that then renders a child that fetches again — move fetching up to the server.

</details>

---

## D. Mutations and forms

<details>
<summary>What is a Server Action and how is it different from an API route?</summary>

A function marked `'use server'` that runs on the server but is callable directly from client code; Next.js creates a POST endpoint and the RPC wiring for you.

| | Server Action | Route Handler |
| --- | --- | --- |
| Caller | Your React app | Anything (mobile, webhooks, curl) |
| Shape | Typed function args | HTTP request/response |
| Works without JS | ✅ with `<form action={...}>` | ❌ |
| Best for | App mutations | Public API, webhooks, OAuth callbacks, SSE |

</details>

<details>
<summary>What are the security considerations for Server Actions?</summary>

Each one is a **public HTTP endpoint** — an attacker can call it directly, with any arguments, regardless of your UI. So inside every action:

1. **Authenticate** (`await requireUser()`).
2. **Authorise** — check the record belongs to this user (broken object-level authorization is the most common API flaw).
3. **Validate** inputs with Zod; never trust `formData` or hidden fields.
4. Rate-limit sensitive actions.
5. Don't leak internal errors; log them and return a generic message.

Also: values you close over in an inline action are encrypted and round-tripped to the client, so don't close over secrets. Next.js does check `Origin`/`Host` for CSRF, but that's not authorisation.

</details>

<details>
<summary>What do useActionState, useFormStatus and useOptimistic do?</summary>

- `useActionState(action, initial)` → `[state, formAction, isPending]`. The action receives the previous state as its first argument and returns the new one, which is how you render validation errors.
- `useFormStatus()` → `{ pending, data, method, action }` for the **enclosing** form; used in a child submit button so the form itself doesn't re-render.
- `useOptimistic(state, reducer)` → shows the expected result immediately and reverts automatically if the action throws.

</details>

---

## E. Routing, auth and the rest

<details>
<summary>What are layouts, templates, route groups and parallel routes?</summary>

- **Layout** — shared shell that **persists** across navigation (keeps state, doesn't remount). Nests down the folder tree.
- **Template** — same position but **remounts** every navigation; use for enter animations or per-page effects.
- **Route group** `(name)` — organises files without adding a URL segment; the standard way to give sections different root layouts.
- **Parallel routes** `@slot` — render several pages into one layout simultaneously (dashboard panels).
- **Intercepting routes** `(.)path` — render a route as a modal over the current page while keeping the URL shareable.

</details>

<details>
<summary>What is middleware good for, and what shouldn't it do?</summary>

Good: redirects and rewrites, optimistic auth checks (is a session cookie present?), locale detection, A/B tests, setting headers and request IDs. It runs before the route on every matching request, so it must be fast.

Not good: database queries, password verification, heavy computation, or being your **only** auth check. The recommended pattern is middleware for optimistic redirects plus a **Data Access Layer** that verifies the session wherever data is actually read or written. There have also been CVEs around middleware bypass, which is another reason not to rely on it alone.

</details>

<details>
<summary>How do you implement authentication in the App Router?</summary>

1. **Session:** httpOnly, secure, sameSite cookie containing either a database session ID (revocable) or a signed JWT (`jose` works on Node and Edge).
2. **Middleware:** redirect to `/login` if the cookie is missing — UX only.
3. **Data Access Layer:** `verifySession()` wrapped in React `cache()`, used by every data function; pages call `getMyTasks()` rather than querying directly, so ownership is enforced by construction.
4. **Server Actions and Route Handlers:** re-check auth inside each one.
5. Libraries: Auth.js/NextAuth, Clerk, Better Auth, or an external IdP verified with `jose`.

</details>

<details>
<summary>How does next/image improve performance?</summary>

It serves correctly-sized, modern-format (AVIF/WebP) images, lazy-loads below-the-fold ones, and reserves space via width/height or `fill` so there's no layout shift. `priority` preloads the LCP image. Static imports infer dimensions and can generate a blur placeholder. Remote hosts must be allow-listed in `next.config`, and self-hosted deployments should install `sharp` or offload to a CDN loader.

</details>

<details>
<summary>How do you reduce the client bundle in a Next.js app?</summary>

1. Keep components on the server — Server Component code never ships (biggest win).
2. Push `'use client'` to leaves.
3. `next/dynamic` for heavy client-only widgets (charts, editors), with `ssr: false` where appropriate.
4. Lighter dependencies and tree-shakeable imports; `optimizePackageImports`.
5. Watch "First Load JS" in the build output and run `@next/bundle-analyzer`.

</details>

---

## F. Scenario questions

<details>
<summary>"Our product pages are slow and the data is 10 minutes stale at worst. What do you do?"</summary>

Make them **ISR**: static rendering with `export const revalidate = 600`, plus `revalidateTag('products')` from a CMS/inventory webhook for instant updates on important changes. Pages are then served from the CDN at static speed, re-rendered in the background when stale.

If part of the page is personal (cart count, recommendations), isolate it in a `<Suspense>` boundary so the rest stays static — or use Partial Prerendering.

</details>

<details>
<summary>"After submitting a form the list doesn't update. Why?"</summary>

The caches weren't invalidated. The Server Action wrote to the database but didn't call `revalidatePath('/tasks')` or `revalidateTag('tasks')`, so the Full Route Cache / Data Cache and the client Router Cache still hold the old payload. Alternatively the data was fetched in a Client Component and needs `router.refresh()` or a query-client invalidation.

</details>

<details>
<summary>"The build says a route is dynamic but we expected it static. How do you debug it?"</summary>

Look for dynamic APIs in that route's tree: `cookies()`, `headers()`, `searchParams`, `no-store` fetches, `force-dynamic`, or a third-party call doing one of those. Next's build output and `next build --debug`-style logs point at the reason. Then either remove the dependency, or push it into a Suspense-wrapped child so only that part is dynamic.

</details>

<details>
<summary>"How would you migrate a Pages Router app to the App Router?"</summary>

Incrementally — both routers can coexist:
1. Create `app/` with a root layout; move global providers into a `'use client'` `Providers` component.
2. Migrate leaf routes first, least risky ones.
3. Convert `getServerSideProps` → async Server Component; `getStaticProps` + `revalidate` → `fetch` cache options or route `revalidate`; `getStaticPaths` → `generateStaticParams`.
4. Replace `next/router` with `next/navigation` (different API: `useRouter`, `usePathname`, `useSearchParams`).
5. Move `pages/api` to `route.ts` when convenient, or leave them.
6. Add `'use client'` where components use hooks/handlers, then push the boundary down.

</details>

<details>
<summary>"When would you NOT use Next.js?"</summary>

- A purely internal dashboard behind a login with no SEO needs and a separate backend — Vite + React Router is simpler and cheaper.
- A static site with no React requirement — Astro or a plain SSG.
- A team that can't host Node (static-only hosting) and needs SSR features.
- An app that's essentially a native-feeling SPA with heavy client state and no server rendering benefit.

Showing you can say "this doesn't need Next.js" scores well.

</details>

---

## G. Rapid fire

<details>
<summary>Short answers</summary>

- **`<Link>` vs `<a>`** — `<Link>` does a client-side transition and prefetches; `<a>` causes a full page load.
- **`redirect()` vs `router.push()`** — server-side (throws, use in actions/components) vs client-side.
- **`loading.tsx`** — automatic Suspense boundary for a route segment.
- **`error.tsx`** — client-side error boundary per segment; `global-error.tsx` covers the root layout.
- **`generateStaticParams`** — which dynamic paths to pre-render at build.
- **`metadataBase`** — base URL used to resolve relative OG/canonical URLs.
- **Edge vs Node runtime** — Web APIs only, fast cold starts vs full Node, most packages.
- **`NEXT_PUBLIC_`** — the only env vars sent to the browser; inlined at build time.
- **`server-only` package** — build error if a server module is imported into client code.
- **Why `params` is a Promise in 15** — enables more streaming/concurrency; `await` it (or `use()` it on the client).
- **Turbopack** — the Rust bundler, default in Next 16, much faster dev builds than webpack.
- **`output: 'standalone'`** — minimal self-contained server bundle for Docker.

</details>

---

## H. Questions to ask them

- Which router are you on, and if it's Pages, is a migration planned?
- Where do you deploy — Vercel or self-hosted? How do you handle the ISR cache across instances?
- How do you enforce auth: middleware, a data access layer, or both?
- What's your caching strategy for product/content pages?
- Do you track Core Web Vitals from real users, and what are the current numbers?
