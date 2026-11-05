# Web fundamentals, performance, security, accessibility, frontend system design

*This whole folder is new. These topics come up in almost every frontend interview, even when the job description doesn't list them.*

## 1. HTTP essentials

**Methods:** `GET` (read, cacheable, idempotent), `POST` (create, not idempotent), `PUT` (replace, idempotent), `PATCH` (partial update), `DELETE` (idempotent).

**Status codes to know:**
| Code | Meaning |
| --- | --- |
| 200 / 201 / 204 | OK / Created / No Content |
| 301 / 302 / 304 | Moved permanently / Found (temporary) / Not Modified (use cache) |
| 400 / 401 / 403 / 404 / 409 / 422 / 429 | Bad request / Not authenticated / Not allowed / Not found / Conflict / Validation failed / Rate limited |
| 500 / 502 / 503 / 504 | Server error / Bad gateway / Unavailable / Gateway timeout |

**401 vs 403:** 401 = "who are you?" (log in). 403 = "I know you, but you can't do this."

**HTTP/1.1 vs HTTP/2 vs HTTP/3:** HTTP/2 multiplexes many requests over one connection and compresses headers, so bundling everything into one file matters less. HTTP/3 runs over QUIC (UDP), which removes TCP head-of-line blocking and speeds up connection setup.

**REST vs GraphQL:** REST has multiple endpoints, is simple and caches well over HTTP. GraphQL has one endpoint where the client asks for exactly the fields it needs (no over-fetching), with a typed schema. The costs: caching complexity, N+1 problems on the server.

## 2. Browser caching

```
Cache-Control: public, max-age=31536000, immutable   ← hashed JS/CSS/images
Cache-Control: no-cache                              ← index.html (always revalidate)
Cache-Control: no-store                              ← sensitive data (never cache)
ETag: "abc123"  →  If-None-Match: "abc123"  →  304 Not Modified
```

`no-cache` ≠ "don't cache". It means "cache, but check with the server before using it".

**Service workers:** a programmable network proxy in the browser, used for offline support (PWA), caching strategies (cache-first, network-first, stale-while-revalidate) and push notifications. Workbox simplifies it.

## 3. CORS (asked very often)

The browser blocks JS from reading responses from a **different origin** (scheme + host + port) unless the server allows it.

- **Simple requests** (GET/POST with basic headers) are sent, and the browser checks `Access-Control-Allow-Origin` on the response.
- **Preflight**: for `PUT`/`DELETE`, custom headers or JSON content-type, the browser first sends `OPTIONS`, and the server must reply with the allowed origin, methods and headers.
- **Credentials** (cookies) need `credentials: 'include'` on the client plus `Access-Control-Allow-Credentials: true` and a **specific** origin (not `*`) on the server.

How to fix CORS: **on the server** (configure allowed origins), or avoid it with a same-origin proxy (Vite `server.proxy` in dev, Nginx `/api` in prod). CORS is enforced by browsers only, so curl and Postman ignore it.

## 4. Security

**XSS (Cross-Site Scripting):** an attacker's script runs on your page.
- React escapes text in JSX automatically.
- Dangerous: `dangerouslySetInnerHTML` (sanitize with DOMPurify), `href={userUrl}` (block `javascript:`), `eval`, injecting into `<script>`.
- Defence in depth: a **Content-Security-Policy** header (`script-src 'self'`), and `HttpOnly` cookies so scripts can't read tokens.

```tsx
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userHtml) }} />

const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : '#');
```

**CSRF (Cross-Site Request Forgery):** another site makes the user's browser send an authenticated request (cookies are attached automatically). Defences: `SameSite=Lax/Strict` cookies, CSRF tokens, checking `Origin`.

**Where to store auth tokens?**
| Storage | XSS risk | CSRF risk |
| --- | --- | --- |
| localStorage | ❌ readable by any script | ✅ not sent automatically |
| HttpOnly + Secure + SameSite cookie | ✅ JS can't read it | Mitigated by SameSite / CSRF token |
| In memory (+ refresh token in HttpOnly cookie) | ✅ best balance for SPAs | ✅ |

**Other headers:** `Strict-Transport-Security` (force HTTPS), `X-Content-Type-Options: nosniff`, `frame-ancestors` in CSP (prevents clickjacking), `Referrer-Policy`.

**Dependency security:** `npm audit`, Dependabot/Renovate, lockfiles, GitLab dependency scanning.

## 5. Web performance and Core Web Vitals

| Metric | Measures | Good |
| --- | --- | --- |
| **LCP** (Largest Contentful Paint) | Loading: when the main content appears | ≤ 2.5 s |
| **INP** (Interaction to Next Paint) | Responsiveness to clicks and typing | ≤ 200 ms |
| **CLS** (Cumulative Layout Shift) | Visual stability | ≤ 0.1 |

Others: TTFB (server response), FCP (first paint), TBT (main-thread blocking in the lab).

**How to improve each:**
- **LCP:** SSR/SSG, preload the hero image (`<link rel="preload">`, `fetchpriority="high"`), a CDN, compressed modern images (AVIF/WebP), smaller JS on the critical path, no lazy-loading for the hero image.
- **INP:** break up long tasks (more than 50 ms), `useTransition`, debounce, virtualize big lists, move heavy work to Web Workers, avoid huge re-renders.
- **CLS:** width/height or `aspect-ratio` on images, reserved space for dynamic content, font-loading strategy.

**Measuring:** Lighthouse (lab), Chrome DevTools Performance panel, the `web-vitals` library + real-user monitoring (field data), React Profiler.

```ts
import { onLCP, onINP, onCLS } from 'web-vitals';
onLCP(sendToAnalytics); onINP(sendToAnalytics); onCLS(sendToAnalytics);
```

**Resource hints:**
```html
<link rel="preconnect" href="https://api.example.com">      <!-- early DNS+TCP+TLS -->
<link rel="preload" href="/fonts/inter.woff2" as="font" crossorigin>
<link rel="prefetch" href="/assets/settings-chunk.js">     <!-- likely next navigation -->
<img src="hero.avif" fetchpriority="high" alt="...">
<img src="below-fold.webp" loading="lazy" decoding="async" alt="...">
```

**Critical rendering path:** HTML → DOM, CSS → CSSOM (CSS is **render-blocking**), JS (**parser-blocking** unless defer/async/module) → render tree → layout → paint → composite.

## 6. Accessibility (a11y) checklist

- Semantic HTML: `<button>`, `<a href>`, `<nav>`, `<main>`, `<label>`, headings in order.
- Every input has a label (`<label htmlFor>` or `aria-label`).
- Images: meaningful `alt`, and `alt=""` for decorative ones.
- Keyboard: everything reachable with Tab, visible `:focus-visible` styles, no keyboard traps, Escape closes dialogs.
- Focus management: move focus into modals and restore it on close, and move focus to the heading on route change.
- ARIA: "No ARIA is better than bad ARIA". Use it for state (`aria-expanded`, `aria-selected`, `aria-current`) and live regions (`aria-live="polite"` for toasts and async results).
- Colour contrast: 4.5:1 for normal text, and never convey information by colour alone.
- Respect `prefers-reduced-motion`.
- Tools: axe DevTools, Lighthouse, eslint-plugin-jsx-a11y, a screen reader (NVDA, VoiceOver).

**WCAG levels:** A, AA (the usual legal target), AAA.

## 7. Real-time and storage

- **Polling:** simple, wasteful.
- **Long polling:** the server holds the request open until there's data.
- **Server-Sent Events (SSE):** one-way server → client stream over HTTP, auto-reconnects (notifications, live feeds, LLM token streaming).
- **WebSockets:** full-duplex, two-way (chat, multiplayer, collaborative editing).

Storage: cookies (4 KB, sent with requests), localStorage (about 5 MB, persistent, sync), sessionStorage (per tab), IndexedDB (large structured data, async), Cache API (service worker responses).

## 8. Frontend system design: the RADIO framework

Use this for "Design a news feed / autocomplete / chat app / image carousel / Google Docs".

1. **R**equirements: functional (what it does) and non-functional (performance, offline, a11y, devices, scale). Ask questions!
2. **A**rchitecture: components diagram (UI, client store, API layer, server). Where state lives.
3. **D**ata model: entities and shapes, client-side normalized cache, what's server vs client state.
4. **I**nterface (API): endpoints or GraphQL, pagination (cursor vs offset), real-time protocol, request/response shapes.
5. **O**ptimizations: performance (virtualization, lazy loading, caching, prefetch), network (debounce, batching, retries), UX (optimistic updates, skeletons, error states), a11y, i18n, security, monitoring.

**Example: "Design an infinite news feed"**
- Cursor-based pagination (stable under inserts), `useInfiniteQuery`, an IntersectionObserver sentinel.
- Virtualize the list (TanStack Virtual) to keep DOM nodes low, and preserve scroll position on back-navigation.
- Optimistic likes and comments, plus SSE/WebSocket for "new posts" with a "Show 5 new posts" banner (don't jump the scroll).
- Lazy-load images with fixed aspect ratio (no CLS), skeleton loaders, error and retry per page.
- A11y: `role="feed"`, `aria-busy` while loading, keyboard navigation between posts.

**Offset vs cursor pagination:** offset (`?page=3`) is simple and allows jumping to any page, but duplicates or skips items when data changes. A cursor (`?after=abc`) is stable and efficient for feeds and infinite scroll, but can't jump to page N.

## 9. Quick-fire Q&A

**Q: What is a CDN?** Servers worldwide caching your static assets close to users, for lower latency.
**Q: What is debouncing on the network level vs throttling?** See the JS notes. Debounce search input, throttle scroll analytics.
**Q: What is lazy hydration / islands architecture?** Only interactive components hydrate, and the rest stays static HTML (Astro, partial hydration).
**Q: What is a micro-frontend?** Independently deployed frontend apps composed into one product (Module Federation, Web Components, iframes). Pros: team autonomy. Cons: duplication, consistency, performance.
**Q: What is i18n in React?** react-i18next or FormatJS. The `Intl` API for dates, numbers and plurals. RTL support with logical CSS properties.
**Q: What is a PWA?** A web app with a manifest + service worker: installable, offline-capable, push notifications.
**Q: How do you monitor a frontend in production?** Sentry (errors with source maps), RUM for Web Vitals, logs, feature flags for safe rollouts.
