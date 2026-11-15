# Next.js: from scratch to interview-ready

**Next.js** is the most widely used React framework: it adds routing, server rendering, data fetching, caching, image/font optimization and a production server on top of React. These lessons assume you know React ([../02-React/basics/](../02-React/basics/)) and TypeScript basics ([../03-TypeScript/basics/](../03-TypeScript/basics/)).

**Version:** examples target **Next.js 15+ with the App Router and React 19**. Where Next.js 16 changes things (Turbopack by default, Cache Components / `"use cache"`), it's flagged. The Pages Router (old) is covered only as a comparison.

| # | Lesson | You will learn |
| --- | --- | --- |
| 00 | [How Next.js works internally](00-how-nextjs-works.md) | The layers, build vs request time, the RSC payload, rendering modes, the four caches, client navigation, middleware, self-hosting output |
| 01 | [Setup and routing](01-setup-and-routing.md) | create-next-app, file conventions (page, layout, loading, error…), dynamic routes, route groups, navigation, metadata |
| 02 | [Server and client components](02-server-client-components.md) | What runs where, `'use client'`, boundary rules, composition patterns, serialization, context, `server-only` |
| 03 | [Data fetching and caching](03-data-fetching-and-caching.md) | Async server components, fetch caching semantics, revalidation (time + tags), ISR, streaming with Suspense, client-side fetching |
| 04 | [Server actions and forms](04-server-actions-and-forms.md) | `'use server'`, form actions, `useActionState`, `useOptimistic`, validation, security, revalidating after mutations |
| 05 | [Route handlers, middleware and auth](05-route-handlers-middleware-auth.md) | API routes (`route.ts`), middleware, sessions vs JWT, Auth.js, protecting pages/actions/data, the data access layer pattern |
| 06 | [Optimization and SEO](06-optimization-seo.md) | `next/image`, `next/font`, metadata and OG images, bundle analysis, `next/dynamic`, scripts, Core Web Vitals in Next |
| 07 | [**Interview questions**](07-interview-questions.md) | Q&A with answers: rendering strategies, hydration, RSC vs SSR, caching layers, App vs Pages Router, scenarios |
| — | [**Production**](production.md) | Deploying (Vercel vs self-hosted Docker), env vars, caching/CDN, ISR at scale, security headers, monitoring, upgrades |

## Suggested path

1. Lessons 00–04 in order, building the example app (a small task dashboard with auth).
2. Lesson 05, then wire auth into the app.
3. Lesson 06 + production.md before deploying anything.
4. Lesson 07 the week of the interview, after revising [../02-React/](../02-React/).
