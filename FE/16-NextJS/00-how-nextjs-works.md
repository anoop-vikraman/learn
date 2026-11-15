# 00 · How Next.js works internally

Read this first for the mental model, then again after lesson 03 — the caching section makes far more sense once you've used it.

## 1. What Next.js adds to React

> **In short:** React is a UI library that renders components; Next.js is the framework around it that provides routing, a server, data fetching, bundling, caching and deployment output.

```
┌─────────────────────────────────────────────────────────────────┐
│ Your app: components, layouts, server actions, route handlers   │
├─────────────────────────────────────────────────────────────────┤
│ Next.js: file-system router, RSC rendering, caching, Image/Font │
│          optimization, middleware, dev server, build output      │
├─────────────────────────────────────────────────────────────────┤
│ React 19: components, hooks, Server Components, Suspense,       │
│           streaming renderer (react-dom/server)                  │
├─────────────────────────────────────────────────────────────────┤
│ Bundler: Turbopack (default in 16) or webpack · SWC compiler    │
├─────────────────────────────────────────────────────────────────┤
│ Node.js runtime (or Edge runtime) · the deployment platform     │
└─────────────────────────────────────────────────────────────────┘
```

A plain React app (Vite) ships an empty `<div id="root">` and a JS bundle; the browser does all the work. Next.js can render HTML **on the server**, send it immediately, then "hydrate" it into an interactive app — and with Server Components, never send some component code to the browser at all.

## 2. The two routers

> **In short:** The App Router (`app/`) is the current model built on React Server Components; the Pages Router (`pages/`) is the older model still supported for existing apps.

| | App Router (`app/`) | Pages Router (`pages/`) |
| --- | --- | --- |
| Default component type | **Server Component** | Client Component |
| Data fetching | `async` components, `fetch` in the component | `getServerSideProps`, `getStaticProps` |
| Layouts | Nested `layout.tsx`, preserved across navigation | One `_app.tsx`, re-rendered |
| Streaming | Built in (Suspense + `loading.tsx`) | Limited |
| Mutations | Server Actions | API routes + client fetch |
| API endpoints | `route.ts` (Web Request/Response) | `pages/api/*.ts` (req/res) |

Everything below describes the App Router unless stated otherwise.

## 3. Build time vs request time

> **In short:** `next build` compiles your code and pre-renders whatever it can into static HTML + RSC payloads; at request time the server renders what's left and serves the rest from cache.

```
next build
 ├─ SWC/Turbopack compiles TS/JSX → JS, splits bundles per route
 ├─ Walks every route:
 │    no dynamic data?   → prerender HTML + RSC payload to disk  (static)
 │    dynamic APIs used? → mark as dynamic, render per request   (dynamic)
 ├─ Generates the client bundles (only Client Components + their deps)
 └─ Writes .next/ : static assets, server chunks, the routes manifest

next start (or the platform's server)
 └─ per request: match route → (serve static file | render) → stream HTML + RSC payload
```

The build output tells you which is which (`○ Static`, `ƒ Dynamic`, `● SSG with generateStaticParams`, `◐ ISR`). Reading that table after `next build` is one of the fastest ways to catch an accidentally dynamic page.

## 4. Rendering strategies

> **In short:** A route is static (rendered once at build), dynamic (rendered per request), or incrementally regenerated (static but refreshed on a schedule) — and Next.js picks automatically based on what your code uses.

| Strategy | When it happens | Chosen because | Good for |
| --- | --- | --- | --- |
| **Static (SSG)** | Build time | No dynamic APIs or uncached data | Marketing pages, docs, blog |
| **ISR** | Build time + re-rendered in the background | `revalidate` time or `revalidateTag`/`revalidatePath` | Catalogues, news, anything mostly-stable |
| **Dynamic (SSR)** | Every request | `cookies()`, `headers()`, `searchParams`, `connection()`, uncached fetch, `dynamic = 'force-dynamic'` | Dashboards, personalised pages |
| **Client-side (CSR)** | In the browser after load | `'use client'` + `useEffect`/TanStack Query/SWR | Highly interactive widgets, private data that needn't be in HTML |
| **PPR (Partial Prerendering)** | Static shell at build + dynamic holes streamed in | Experimental/opt-in | Pages that are mostly static with a few personal bits |

⚠️ The common surprise: calling `cookies()` anywhere in a page's tree makes the **whole route dynamic**. Push dynamic reads down into a small Suspense-wrapped component so the rest can stay static.

## 5. React Server Components and the RSC payload

> **In short:** Server Components run only on the server and are serialized into a compact description of the UI (the RSC payload) that React on the client uses to build or update the tree — their code is never sent to the browser.

What the browser receives on a first visit:

1. **HTML** — streamed, so the user sees content immediately (good for SEO and first paint).
2. **RSC payload** — a line-based serialized format describing the rendered Server Component tree, including *where* Client Components go and what props they got.
3. **JS bundles** — only for Client Components.

```
Server Component output (conceptually):
  ["$","div",null,{"children":[
     ["$","h1",null,{"children":"Tasks"}],
     ["$","$L12",null,{"initialTasks":[…]}]     ← Client Component #12 with serialized props
  ]}]
```

Then **hydration**: React walks the server HTML and attaches event handlers for the Client Components. If the HTML and the first client render disagree, you get a **hydration error** (classic causes: `Date.now()`, `Math.random()`, `localStorage`, `window`, browser extensions, invalid HTML nesting like `<p><div>`).

On a client-side navigation, Next.js fetches **only the RSC payload** for the new route (not HTML) and React merges it into the existing tree — so layouts keep their state and no full page load happens.

**Consequences worth remembering for interviews:**
- Props passed from a Server to a Client Component must be **serializable** (no functions except Server Actions, no class instances, no Dates in some edge cases — those are fine, but Maps/Sets/functions are not).
- Secrets used in Server Components never reach the client — but anything you *pass as a prop* to a Client Component **is** in the payload, visible in DevTools.
- Server Components can `await` directly; they have no state, no effects, no event handlers.

## 6. The caching layers

> **In short:** Next.js 15 has four caches — Request Memoization, the Data Cache, the Full Route Cache and the client Router Cache — and most "why is my data stale?" questions are about knowing which one is involved.

| Cache | Where | Lifetime | Default (Next 15) | Clear with |
| --- | --- | --- | --- | --- |
| **Request Memoization** | Server, React | One request | On for `fetch` | Nothing needed (automatic) |
| **Data Cache** | Server, persistent | Across requests & deploys (unless revalidated) | **Off** for `fetch` (opt in with `cache: 'force-cache'` or `next: { revalidate }`) | `revalidateTag`, `revalidatePath`, time |
| **Full Route Cache** | Server, persistent | Until revalidated/redeployed | On for static routes | `revalidatePath`, redeploy |
| **Router Cache** | Client, in memory | Session (30 s for dynamic, 5 min static by default; `staleTimes` configurable) | On | `router.refresh()`, server action revalidation, hard navigation |

Two gotchas that come up constantly:
- **Next 14 → 15 changed the default**: `fetch` used to be cached by default; now it isn't. Opt in explicitly.
- `revalidatePath`/`revalidateTag` called in a Server Action invalidate the server caches **and** push a fresh payload to the client Router Cache.

Next.js 16 adds **Cache Components** (`"use cache"`) as a more explicit, opt-in model — same concepts, clearer boundaries.

## 7. The request lifecycle

> **In short:** Middleware runs first at the edge, then the router matches the route, the server renders (streaming HTML), and finally the client hydrates and takes over navigation.

```
Request
  │
  ├─ Middleware (matcher) — rewrite / redirect / set headers / check a cookie   [fast, no DB]
  │
  ├─ Route match in app/ → layout chain + page
  │
  ├─ Static? → serve prerendered HTML + RSC payload from cache/CDN  ──────────┐
  │                                                                            │
  └─ Dynamic? → render Server Components (await data; Suspense boundaries     │
       stream their fallbacks first, then real content as promises resolve)   │
                                                                               ▼
  Browser: paints streamed HTML → downloads client bundles → hydrates → Router takes over
           (prefetches linked routes' RSC payloads on hover/viewport)
```

## 8. Runtimes: Node.js vs Edge

> **In short:** Route handlers, pages and middleware run on the Node.js runtime by default; the Edge runtime is a lighter, faster-to-start Web-API-only environment with no Node APIs.

| | Node.js runtime | Edge runtime |
| --- | --- | --- |
| APIs | Full Node (`fs`, most npm packages, DB drivers) | Web standard only (`fetch`, `Request`, `crypto.subtle`) |
| Cold start | Slower | Very fast |
| Use for | Everything by default | Middleware, simple geolocation/redirect/A-B logic |

`export const runtime = 'edge'` opts a route in. Most database clients (Prisma with TCP, `pg`) don't work on Edge without an HTTP-based driver.

## 9. Bundling and code splitting

> **In short:** Next.js splits JS per route automatically, ships only Client Component code, and lets you defer heavy components with `next/dynamic`.

- Shared code goes into common chunks; each route loads only what it needs.
- Server Component code (and anything it imports, like a 300 kB markdown parser) is **never** in the client bundle — one of the biggest wins of the App Router.
- `next build` prints per-route "First Load JS"; watch it in code review.

## 10. What `next build` produces for deployment

> **In short:** By default a `.next` folder you run with `next start`; `output: 'standalone'` produces a minimal self-contained server ideal for Docker; `output: 'export'` produces pure static files.

| Output | Command/config | Use |
| --- | --- | --- |
| Default | `next build` + `next start` | Node host, Vercel |
| `standalone` | `output: 'standalone'` in `next.config` | **Docker** — copies only needed `node_modules` |
| `export` | `output: 'export'` | Static hosting (S3/CDN); no SSR, ISR, middleware or server actions |

## 11. Mental model in one paragraph

> **In short:** A summary of the whole chapter.

Next.js compiles your `app/` folder into routes. At build time it pre-renders everything it can; at request time middleware runs, the router matches a route, and React renders Server Components on the server — streaming HTML to the browser and a serialized RSC payload describing the tree. Only Client Components ship JavaScript, and those hydrate into interactivity. Data is cached at four levels (per-request memoization, a persistent Data Cache, a Full Route Cache, and a client Router Cache), and mutations invalidate them via `revalidateTag`/`revalidatePath`. Navigation after the first load fetches RSC payloads instead of full pages, so layouts persist and transitions stay fast.

---

## 12. Exercises

1. Run `next build` on a fresh app and read the route table; add `cookies()` to one page and watch it flip from `○` to `ƒ`.
2. Open DevTools → Network on a client navigation and inspect the RSC payload request (`?_rsc=`).
3. Add a `console.log` in a Server Component and a Client Component; see which appears in the terminal and which in the browser.
4. Cause a hydration error on purpose (`{Date.now()}` in a Client Component) and read the message.
5. Build with `output: 'standalone'` and inspect `.next/standalone` to see how small it is.
