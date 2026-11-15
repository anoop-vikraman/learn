# Next.js in production

## 1. Checklist

> **In short:** What to verify before a Next.js app serves real traffic.

- [ ] `next build` passes with no type or lint errors; route table reviewed (nothing accidentally dynamic)
- [ ] Environment variables validated at startup; only public values use `NEXT_PUBLIC_`
- [ ] Auth enforced in the data layer, not only in middleware
- [ ] Caching strategy decided per route; `revalidateTag`/`revalidatePath` after every mutation
- [ ] Images allow-listed and `sharp` installed (self-hosted)
- [ ] Security headers (CSP, HSTS, nosniff, frame options)
- [ ] Error tracking (Sentry) with source maps uploaded, not published
- [ ] `instrumentation.ts` for observability; Web Vitals reported
- [ ] Health endpoint for the load balancer
- [ ] Deploy strategy with instant rollback; ISR cache shared across instances if self-hosted

## 2. Where to deploy

> **In short:** Vercel supports every feature with zero configuration; self-hosting with Docker works well if you handle caching, images and scaling yourself.

| Option | Notes |
| --- | --- |
| **Vercel** | First-party: ISR, image optimization, edge middleware, preview deployments, analytics all built in |
| **Docker on your own infra** (ECS, Kubernetes, VM) | Full control; use `output: 'standalone'`; you own caching, images, scaling |
| **Netlify / Cloudflare / AWS Amplify / Render / Railway** | Adapters cover most features; check ISR and middleware support |
| **Static export** (`output: 'export'`) | Cheapest hosting, but no SSR, ISR, middleware, server actions or image optimization |
| **Node host** (`next start`) | Simple; put a CDN in front for static assets |

## 3. Dockerfile for self-hosting

> **In short:** Use a multi-stage build with `output: 'standalone'` so the runtime image contains only the server and the files it needs.

```ts
// next.config.ts
export default { output: 'standalone' };
```

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# ⚠️ NEXT_PUBLIC_* values are inlined HERE, at build time — pass them as build args per environment
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

⚠️ **Build-time vs runtime env vars.** `NEXT_PUBLIC_*` variables are baked into the client bundle during `next build`, so one image can't serve two environments with different public values — either build per environment, or fetch public config at runtime from a server component/endpoint.

## 4. Caching when self-hosted

> **In short:** The default ISR cache is on local disk, which breaks with multiple instances — plug in a shared cache handler (Redis) or accept per-instance caches.

```ts
// next.config.ts
export default {
  cacheHandler: require.resolve('./cache-handler.js'),
  cacheMaxMemorySize: 0,          // disable the in-memory layer when using a shared store
};
```

Without this: instance A revalidates, instance B still serves stale content, and `revalidateTag` only affects the instance that received the request. Community handlers backed by Redis solve this.

Also: put a CDN in front, cache `/_next/static/*` immutably (hashed filenames), and never cache HTML for authenticated pages (`Cache-Control: private, no-store`).

## 5. Environment and configuration

> **In short:** Validate env vars at build and runtime, and keep secrets out of anything prefixed `NEXT_PUBLIC_`.

```ts
// env.ts
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

export const env = schema.parse(process.env);     // fails the build/boot with a clear error
```

Load order: `.env.local` (git-ignored) → `.env.production`/`.env.development` → `.env`. Never commit `.env.local`.

## 6. Observability

> **In short:** Use `instrumentation.ts` for tracing, Sentry for errors, and report Web Vitals from real users.

```ts
// instrumentation.ts (project root)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node');        // OpenTelemetry, DB instrumentation
  }
}

export function onRequestError(err: unknown, request: { path: string }) {
  // called for server errors in Next 15+
  reportToSentry(err, request);
}
```

- **Errors:** `@sentry/nextjs` wraps the config, captures server and client errors, and can upload source maps (set `hideSourceMaps: true` so they're not public).
- **Logs:** structured JSON to stdout; include the `error.digest` so support can correlate a user report with a server log.
- **Metrics/traces:** OpenTelemetry via `@vercel/otel` or the standard SDK.
- **Vitals:** `useReportWebVitals` → your own endpoint or a vendor.

## 7. Performance in production

> **In short:** Prefer static/ISR, cache data deliberately, keep client JS small, and check the build output every release.

- Treat any route marked `ƒ Dynamic` that didn't need to be as a bug.
- Database: connection pooling (PgBouncer/serverless driver), indexes, no N+1 — the server render is only as fast as its slowest query.
- Stream slow sections instead of blocking the whole page.
- Set a First Load JS budget and fail CI if a route exceeds it.
- Load-test the real deployment, not `next dev` (dev is much slower by design).

## 8. Security

> **In short:** Enforce auth server-side, keep secrets off the client, set headers, validate every action, and patch Next.js promptly.

- Auth checks in the Data Access Layer (and in every Server Action and Route Handler).
- Never pass sensitive fields as props to Client Components — they're in the RSC payload.
- `import 'server-only'` on modules holding secrets.
- CSP (ideally nonce-based), HSTS, `nosniff`, `X-Frame-Options`.
- Rate-limit Server Actions and auth endpoints.
- **Keep Next.js updated** — there have been high-severity CVEs (middleware bypass, cache poisoning, image optimization issues). Subscribe to the security advisories.

## 9. CI/CD

> **In short:** Lint, type-check, test, build, then deploy the built artifact with preview environments per pull request.

```yaml
# .github/workflows/ci.yml (sketch)
- run: npm ci
- run: npm run lint
- run: npx tsc --noEmit
- run: npm test
- run: npm run build          # catches type errors in server/client boundaries too
- run: npx playwright test    # e2e against the built app
```

Vercel gives preview deployments automatically; self-hosted setups can spin up a preview container per PR. Use the same image for staging and production.

## 10. Upgrades

> **In short:** Next.js moves fast — upgrade on a schedule, use the codemods, and read the breaking-change list.

```bash
npx @next/codemod@canary upgrade latest
```

Recent breaking changes worth knowing: async `params`/`searchParams`/`cookies()`/`headers()` (15), `fetch` no longer cached by default (15), Turbopack as the default bundler and the Cache Components model (16).

## 11. Routine

> **In short:** Regular checks that keep a Next.js app healthy.

| How often | Task |
| --- | --- |
| Every PR | Build passes; route table and First Load JS reviewed; preview deployment checked |
| Every deploy | Watch error rate, LCP/INP, cache hit ratio for 15–30 minutes |
| Weekly | Dependency updates; Sentry triage |
| Monthly | Lighthouse/CrUX review; bundle analysis; unused route cleanup |
| Quarterly | Next.js minor/major upgrade; security header and CSP review; load test |
