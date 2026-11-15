# 01 · Redis with ioredis

## 1. Connecting

> **In short:** Create one ioredis client per process from `REDIS_URL`, reuse it everywhere, and close it on shutdown.

```bash
npm install ioredis
docker run -d -p 6379:6379 redis:7-alpine
```

```ts
// src/lib/redis.ts
import { Redis } from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,                  // fail commands instead of waiting forever when Redis is down
  connectTimeout: 5_000,
  enableReadyCheck: true,
});
redis.on('error', (err) => logger.error({ err }, 'redis error'));
```

(The official `redis` package, "node-redis", is an equally good alternative with a similar API.)

## 2. Basic commands

> **In short:** ioredis exposes every Redis command as a promise-returning method with the same name.

```ts
await redis.set('greeting', 'hello', 'EX', 60);          // with a 60 s TTL
await redis.get('greeting');                              // 'hello' | null
await redis.incr('page:views');
await redis.hset('user:42', { name: 'Anoop', plan: 'pro' });
await redis.hgetall('user:42');
await redis.zadd('leaderboard', 1500, 'anoop');
await redis.zrevrange('leaderboard', 0, 9, 'WITHSCORES');
await redis.del('greeting');

// Pipelines: many commands, one round trip
const results = await redis.pipeline().incr('a').incr('b').expire('a', 60).exec();
```

Data types and when to use each: [../../FastAPI/05-Redis/01-basics-data-types.md](../../FastAPI/05-Redis/01-basics-data-types.md).

## 3. Cache-aside in Express

> **In short:** Check Redis first; on a miss load from the database, store it with a TTL, and delete the key whenever the data changes.

```ts
// src/lib/cache.ts
export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (err) {
    logger.warn({ err }, 'cache read failed');          // cache down → fall back to the DB
  }
  const value = await load();
  redis.set(key, JSON.stringify(value), 'EX', ttlSeconds).catch(() => {});   // don't fail the request
  return value;
}

export const invalidate = (...keys: string[]) => redis.del(...keys).catch(() => {});
```

```ts
// tasks.service.ts
export const getProject = (userId: string, id: string) =>
  cached(`cache:project:${userId}:${id}`, 300, () => prisma.project.findFirstOrThrow({ where: { id, ownerId: userId } }));

export async function updateProject(userId: string, id: string, data: UpdateProject) {
  const project = await prisma.project.update({ where: { id, ownerId: userId }, data });
  await invalidate(`cache:project:${userId}:${id}`);   // after the DB write
  return project;
}
```

- Include the user/tenant in keys for per-user data (otherwise you leak data between users).
- Always set a TTL; add jitter for many similar keys.
- Stampedes, versioned keys and other pitfalls: [../../FastAPI/05-Redis/02-caching-patterns.md](../../FastAPI/05-Redis/02-caching-patterns.md).

## 4. Rate limiting

> **In short:** Use a Redis-backed store for `express-rate-limit` so limits are shared by all instances, or write a simple counter.

```ts
import { rateLimit } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<RedisReply>,
  }),
});
```

```ts
// A hand-written fixed-window limiter
export async function allow(key: string, limit: number, windowSec: number) {
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const [[, count]] = (await redis.multi().incr(bucket).expire(bucket, windowSec).exec()) as [[null, number], unknown];
  return count <= limit;
}
```

## 5. Sessions in Redis

> **In short:** Store server-side sessions in Redis (with `express-session` + `connect-redis`) so any instance can serve any user and logout is instant.

```ts
import session from 'express-session';
import { RedisStore } from 'connect-redis';

app.use(session({
  store: new RedisStore({ client: redis, prefix: 'sess:' }),
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7 * 864e5 },
}));
```

(Check the `connect-redis` docs for the client it expects; some versions prefer the official `redis` client.)

## 6. Pub/Sub for WebSockets across instances

> **In short:** Each server instance subscribes to a Redis channel and forwards messages to its own WebSocket clients, so broadcasts reach users on every instance.

```ts
// A subscriber needs its own connection (a subscribed client can't run other commands)
const sub = redis.duplicate();
await sub.subscribe('task-events');
sub.on('message', (_channel, message) => {
  for (const client of wss.clients) client.send(message);   // ws / socket.io clients on THIS instance
});

// anywhere: publish once, every instance receives it
await redis.publish('task-events', JSON.stringify({ type: 'task.updated', id }));
```

Socket.IO has a ready-made Redis adapter (`@socket.io/redis-adapter`) that does this for you.

## 7. Distributed locks

> **In short:** `SET key token NX PX ttl` acquires a lock; release only if you still own it (Lua script), so only one instance runs a critical job.

```ts
import { randomUUID } from 'node:crypto';

export async function withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
  const token = randomUUID();
  const ok = await redis.set(`lock:${name}`, token, 'PX', ttlMs, 'NX');
  if (!ok) return null;                                          // someone else holds it
  try {
    return await fn();
  } finally {
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1, `lock:${name}`, token,
    );
  }
}
```

Libraries: `redlock`. For correctness-critical work, also rely on database constraints or row locks.

## 8. Idempotency keys

> **In short:** Store each `Idempotency-Key` with `SET NX` so retried requests (e.g. payments) don't run twice.

```ts
export const idempotent: RequestHandler = async (req, res, next) => {
  const key = req.get('idempotency-key');
  if (!key) return next();
  const stored = await redis.get(`idem:${req.user!.id}:${key}`);
  if (stored) return res.status(200).json(JSON.parse(stored));      // replay the first result
  const original = res.json.bind(res);
  res.json = (body) => {
    redis.set(`idem:${req.user!.id}:${key}`, JSON.stringify(body), 'EX', 86400).catch(() => {});
    return original(body);
  };
  next();
};
```

(A production version also locks the key while the first request is still running.)

---

## 9. Exercises

1. Add a Redis client with error logging and a `/health/ready` check using `PING`.
2. Cache `GET /projects/:id` with cache-aside and invalidate on update and delete.
3. Make the login rate limiter use Redis and test it with two app instances.
4. Broadcast task updates to WebSocket clients across two instances with pub/sub.
5. Use `withLock` so a nightly cleanup runs on only one instance.
