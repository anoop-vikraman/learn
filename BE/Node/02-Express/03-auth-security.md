# 03 · Authentication and security

General concepts (authentication vs authorization, JWT structure, refresh tokens, CORS, BOLA) are explained in [../../FastAPI/02-FastAPI/06-auth-security.md](../../FastAPI/02-FastAPI/06-auth-security.md); this lesson shows the Express implementation.

## 1. Password hashing

> **In short:** Store argon2 (or bcrypt) hashes of passwords using the async API, so hashing doesn't block the event loop.

```bash
npm install argon2         # or: npm install bcrypt
```

```ts
// src/lib/password.ts
import argon2 from 'argon2';

export const hashPassword = (plain: string) => argon2.hash(plain, { type: argon2.argon2id });
export const verifyPassword = (hash: string, plain: string) => argon2.verify(hash, plain);
```

⚠️ Never use `bcrypt.hashSync` or fast hashes (SHA-256) for passwords.

## 2. Issuing JWTs

> **In short:** Sign a short-lived access token containing the user ID and role with a strong secret, and verify it on each request.

```bash
npm install jsonwebtoken && npm install -D @types/jsonwebtoken
# (alternative: `jose`, a modern standards-based library that also verifies tokens from identity providers via JWKS)
```

```ts
// src/lib/jwt.ts
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

type TokenPayload = { sub: string; role: 'admin' | 'member' };

export function signAccessToken(payload: TokenPayload) {
  return jwt.sign(payload, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m', issuer: 'task-api' });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], issuer: 'task-api' }) as TokenPayload;
}
```

Always pass `algorithms` to `verify`, so attackers can't switch the algorithm.

## 3. Register and login routes

> **In short:** Register hashes the password and creates the user; login verifies credentials and returns a token, with the same error for unknown email and wrong password.

```ts
// src/routes/auth.routes.ts
import { Router } from 'express';
import { z } from 'zod';

export const authRouter = Router();
const credentials = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(8).max(128) });

authRouter.post('/register', validate({ body: credentials }), async (_req, res) => {
  const { email, password } = res.locals.body;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('Email already registered');
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password) },
    select: { id: true, email: true, role: true, createdAt: true },   // never return the hash
  });
  res.status(201).json(user);
});

authRouter.post('/login', loginLimiter, validate({ body: credentials }), async (_req, res) => {
  const { email, password } = res.locals.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw new AppError(401, 'Invalid email or password', 'invalid_credentials');
  }
  res.json({ accessToken: signAccessToken({ sub: user.id, role: user.role }), tokenType: 'Bearer' });
});
```

## 4. Authentication middleware

> **In short:** Read the `Authorization: Bearer` header, verify the token, attach the user to `req`, or respond 401.

```ts
// src/middleware/auth.ts
import type { RequestHandler } from 'express';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) throw new AppError(401, 'Not authenticated', 'unauthenticated');
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    throw new AppError(401, 'Invalid or expired token', 'invalid_token');
  }
};

// apply to everything below this line, or per router
apiRouter.use('/tasks', requireAuth, tasksRouter);
```

## 5. Authorization: roles and ownership

> **In short:** Check roles with a middleware factory, and always scope database queries to the current user to prevent access to other users' data.

```ts
export const requireRole = (...roles: Array<'admin' | 'member'>): RequestHandler => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) throw new ForbiddenError();
  next();
};

usersRouter.delete('/:id', requireRole('admin'), deleteUser);

// Ownership: filter by owner in the query itself
export async function getTaskForUser(taskId: string, userId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, ownerId: userId } });
  if (!task) throw new NotFoundError('Task');      // 404, not 403: don't reveal it exists
  return task;
}
```

⚠️ Broken object-level authorization (changing an ID in the URL to see someone else's data) is the #1 API vulnerability. Never fetch by ID alone for user-owned resources.

## 6. Refresh tokens in httpOnly cookies

> **In short:** Keep access tokens short-lived and in memory; store a rotating, revocable refresh token in a secure httpOnly cookie.

```ts
import cookieParser from 'cookie-parser';
import { randomBytes, createHash } from 'node:crypto';

app.use(cookieParser());

async function issueRefreshToken(res: Response, userId: string) {
  const token = randomBytes(48).toString('base64url');
  await prisma.refreshToken.create({
    data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'),
            expiresAt: new Date(Date.now() + 7 * 864e5) },
  });
  res.cookie('refresh_token', token, {
    httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1/auth/refresh', maxAge: 7 * 864e5,
  });
}

authRouter.post('/refresh', async (req, res) => {
  const token = req.cookies.refresh_token;
  const tokenHash = token && createHash('sha256').update(token).digest('hex');
  const stored = tokenHash && await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) throw new AppError(401, 'Invalid refresh token');
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });  // rotate
  await issueRefreshToken(res, stored.userId);
  res.json({ accessToken: signAccessToken({ sub: stored.user.id, role: stored.user.role }) });
});
```

Store only a **hash** of refresh tokens, revoke them on logout and password change, and use CSRF protection (`sameSite` + an anti-CSRF token if requests are cross-site).

Alternatives: server-side sessions (`express-session` + Redis store), or an identity provider (Auth0, Keycloak, Cognito, Clerk) whose tokens you verify with `jose` and the provider's JWKS.

## 7. Security middleware

> **In short:** Helmet sets protective headers, CORS restricts browser origins, and rate limiting slows down brute force and abuse.

```ts
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

app.set('trust proxy', 1);       // behind a load balancer: needed for correct client IPs
app.use(helmet());
app.use(cors({
  origin: config.CORS_ORIGINS,   // exact list, never '*' with credentials
  credentials: true,
}));

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,                     // 10 attempts per 15 minutes per IP
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: new RedisStore({ sendCommand: (...args: string[]) => redis.call(...args) }),   // shared across instances
});

app.use('/api', rateLimit({ windowMs: 60_000, limit: 300 }));
```

## 8. Other essentials

> **In short:** Validate everything, limit sizes, avoid injection, protect secrets, and never leak internals.

| Risk | Defence |
| --- | --- |
| Invalid / malicious input | Zod schemas; strip unknown fields |
| Large bodies (DoS) | `express.json({ limit: '1mb' })`, upload limits |
| SQL injection | Prisma / parameterized queries; never interpolate into `$queryRawUnsafe` |
| NoSQL / prototype pollution | Validate shapes; don't deep-merge untrusted objects |
| XSS (if rendering HTML) | Escape output; CSP via Helmet |
| Brute force | Rate limits, lockouts, MFA for admins |
| Secrets | Env vars from a secret manager; long random JWT secret; rotate |
| Error leaks | Generic 500 messages; `NODE_ENV=production` |
| Dependency vulnerabilities | `npm audit`, Dependabot/Renovate |
| Logging | Never log passwords, tokens or full card numbers (pino `redact`) |

Reference: OWASP API Security Top 10.

---

## 9. Exercises

1. Implement register, login and a `GET /me` route protected by `requireAuth`.
2. Add `requireRole('admin')` to a user-management route.
3. Write a test proving user B can't read user A's task.
4. Add refresh tokens with rotation and a logout endpoint that revokes them.
5. Add Helmet, CORS for `http://localhost:5173`, and a Redis-backed login rate limiter.
