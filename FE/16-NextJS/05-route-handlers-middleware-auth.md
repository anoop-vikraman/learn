# 05 · Route handlers, middleware and auth

## 1. Route Handlers

> **In short:** A `route.ts` file exports functions named after HTTP methods and works with the Web `Request`/`Response` APIs.

```ts
// app/api/tasks/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const done = searchParams.get('done');
  const tasks = await db.task.findMany({ where: done ? { done: done === 'true' } : {} });
  return NextResponse.json(tasks);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error).fieldErrors }, { status: 422 });
  }
  const task = await db.task.create({ data: parsed.data });
  return NextResponse.json(task, { status: 201, headers: { Location: `/api/tasks/${task.id}` } });
}
```

```ts
// app/api/tasks/[id]/route.ts
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;                   // ⚠️ async in Next 15
  const task = await db.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(task);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await db.task.delete({ where: { id: (await params).id } });
  return new Response(null, { status: 204 });
}
```

Supported exports: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.

⚠️ A folder can have `page.tsx` **or** `route.ts`, not both.

### Caching and dynamic behaviour

> **In short:** GET handlers aren't cached by default in Next 15 — opt in with route segment config.

```ts
export const dynamic = 'force-static';          // cache a GET handler
export const revalidate = 60;
export const runtime = 'edge';                  // Web APIs only
```

In the App Router, `GET` handlers are **not cached by default** (Next 15); opt in explicitly.

### Streaming and other response types

> **In short:** Return a ReadableStream for SSE, downloads or progressive responses.

```ts
// Server-Sent Events
export async function GET() {
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i <= 100; i += 10) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ progress: i })}\n\n`));
        await new Promise((r) => setTimeout(r, 500));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
}
```

### CORS for public APIs

> **In short:** Handle `OPTIONS` and set the allow headers yourself in route handlers.

```ts
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://app.example.com',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
```

## 2. Middleware

> **In short:** `middleware.ts` at the project root runs before matching requests — use it for cheap checks like redirects, rewrites, locale and headers, not for database work.

```ts
// middleware.ts (project root, next to app/)
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const session = request.cookies.get('session')?.value;

  if (!session) {
    const url = new URL('/login', request.url);
    url.searchParams.set('from', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  response.headers.set('x-request-id', crypto.randomUUID());
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login).*)'],   // skip assets and public routes
};
```

| Good use | Avoid |
| --- | --- |
| Redirect unauthenticated users (**optimistic** cookie presence check) | Verifying passwords / hitting the database |
| A/B tests, feature flags, geolocation | Heavy computation |
| Rewrites, locale detection | Treating it as your only auth layer |
| Setting security headers, request IDs | Long-running work (it blocks the response) |

⚠️ Middleware runs on **every matching request** including prefetches, so keep it fast. Historically it ran only on the Edge runtime; newer versions allow Node.js runtime for middleware, but keep the logic light regardless.

⚠️ **Security note:** there have been Next.js CVEs where a crafted header could bypass middleware. Treat middleware as UX routing, and always re-check auth in the page/action/handler that touches data.

## 3. Sessions: cookies and JWT

> **In short:** Store a session identifier in an httpOnly cookie; either keep the session in your database (revocable) or in a signed/encrypted JWT (stateless).

```ts
// lib/session.ts
import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);   // 32+ chars

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);

  (await cookies()).set('session', token, {
    httpOnly: true,          // JavaScript can't read it → XSS can't steal it
    secure: true,            // HTTPS only
    sameSite: 'lax',         // CSRF protection for top-level navigation
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<{ userId: string } | null> {
  const token = (await cookies()).get('session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    return { userId: payload.sub as string };
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete('session');
}
```

| | Database session | JWT session |
| --- | --- | --- |
| Revocable immediately | ✅ | ❌ (until it expires) |
| Needs a DB read per request | ✅ | ❌ |
| Good for | Most apps, admin panels | Short-lived tokens, edge-only checks |

`jose` works on both Node and Edge runtimes, which is why it's preferred over `jsonwebtoken` in Next.js.

## 4. The Data Access Layer pattern

> **In short:** Centralise authentication checks in functions that fetch data, so every page, action and handler is protected by construction rather than by remembering.

```ts
// lib/dal.ts
import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';

export const verifySession = cache(async () => {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
});

export const getCurrentUser = cache(async () => {
  const { userId } = await verifySession();
  return db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, role: true } });
});

export async function getMyTasks() {
  const { userId } = await verifySession();
  return db.task.findMany({ where: { ownerId: userId } });   // ownership baked into the query
}
```

Now a page is simply:

```tsx
export default async function TasksPage() {
  const tasks = await getMyTasks();          // redirects to /login if not authenticated
  return <TaskTable tasks={tasks} />;
}
```

This is the pattern the Next.js docs recommend: **middleware for optimistic redirects, the DAL for real enforcement.**

## 5. Auth.js (NextAuth)

> **In short:** Auth.js handles OAuth providers, sessions and callbacks; you configure providers and read the session on the server.

```ts
// auth.ts
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt' },
  providers: [
    GitHub,
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (c) => verifyUser(String(c.email), String(c.password)),
    }),
  ],
  callbacks: {
    jwt({ token, user }) { if (user) token.role = (user as { role?: string }).role; return token; },
    session({ session, token }) { session.user.role = token.role as string; return session; },
  },
  pages: { signIn: '/login' },
});
```

```ts
// app/api/auth/[...nextauth]/route.ts
export const { GET, POST } = handlers;
```

```tsx
// Any Server Component
const session = await auth();
if (!session) redirect('/login');
```

Alternatives: **Clerk**, **Better Auth**, **Lucia**-style hand-rolled sessions, or an external IdP (Keycloak, Auth0, Cognito) verified with `jose`.

## 6. Protecting each surface

> **In short:** Check authentication in four places — middleware (redirect), pages (render), actions (mutate), and route handlers (API).

```ts
// 1. middleware.ts  → optimistic redirect based on cookie presence
// 2. page / layout  → const user = await getCurrentUser();
// 3. server action  → 'use server'; const user = await requireUser();
// 4. route handler  → const session = await getSession(); if (!session) return 401;
```

Role checks:

```ts
export async function requireRole(role: 'admin' | 'member') {
  const user = await getCurrentUser();
  if (!user || user.role !== role) redirect('/403');
  return user;
}
```

## 7. Request context APIs

> **In short:** `cookies()`, `headers()` and `draftMode()` are async in Next 15 and make the route dynamic.

```ts
import { cookies, headers, draftMode } from 'next/headers';

const theme = (await cookies()).get('theme')?.value;
const ua = (await headers()).get('user-agent');
const { isEnabled } = await draftMode();         // CMS preview mode
```

## 8. Security headers

> **In short:** Set CSP, HSTS and friends in `next.config.ts` (or at the CDN) so every response is protected.

```ts
// next.config.ts
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

export default {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
```

A nonce-based CSP can be generated in middleware for stricter protection.

---

## 9. Exercises

1. Build `GET/POST /api/tasks` and `GET/DELETE /api/tasks/[id]` with Zod validation and proper status codes.
2. Add middleware that redirects unauthenticated users to `/login?from=…`.
3. Implement cookie sessions with `jose`: login, `getSession`, logout.
4. Create `lib/dal.ts` with `verifySession`/`getMyTasks` and use it in a page.
5. Prove the middleware alone isn't enough: call a protected Server Action directly without a session.
6. Add security headers and check them with `curl -I`.
