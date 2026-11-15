# 02 · Caching patterns

## 1. Why cache?

> **In short:** Serve repeated expensive reads in under a millisecond and protect the database.

Reading from Redis takes well under a millisecond; a complex database query or an external API call can take 50–2000 ms. Caching stores the results of expensive operations so repeated requests are fast and the database is protected from load.

**Cache when data is:** read often, expensive to compute, and okay to be slightly stale.
**Don't cache:** data that must always be exactly current (account balances during payment), or data read once.

## 2. Cache-aside (lazy loading): the most common pattern

> **In short:** Read the cache, fall back to the DB on a miss, fill the cache, and delete keys on writes.

```
1. Read from the cache.
2. Hit → return it.
3. Miss → read from the database, store it in the cache with a TTL, return it.
4. On writes → update the database, then delete (invalidate) the cache key.
```

```python
import json
from redis.asyncio import Redis

CACHE_TTL = 300  # seconds

async def get_project(project_id: int, db, redis: Redis) -> dict:
    key = f"cache:project:{project_id}"
    if (cached := await redis.get(key)) is not None:
        return json.loads(cached)                       # hit

    project = await load_project_from_db(db, project_id)   # miss
    if project is None:
        await redis.set(key, json.dumps(None), ex=30)   # cache "not found" briefly (protects the DB)
        return None
    await redis.set(key, json.dumps(project, default=str), ex=CACHE_TTL)
    return project

async def update_project(project_id: int, data: dict, db, redis: Redis):
    await save_project_to_db(db, project_id, data)
    await redis.delete(f"cache:project:{project_id}")   # invalidate AFTER the DB commit
```

**Delete instead of update** on writes: it's simpler and avoids race conditions where an older value overwrites a newer one.

## 3. Other patterns

> **In short:** Write-through, write-behind, read-through and refresh-ahead compared.

| Pattern | How | Pros / cons |
| --- | --- | --- |
| **Cache-aside** | App reads cache, falls back to DB, fills cache | Simple, only caches what's used; first request is slow; possible stale data until TTL/invalidation |
| **Write-through** | App writes to cache and DB together | Cache always fresh for written keys; writes slower; caches data that may never be read |
| **Write-behind** (write-back) | Write to cache, persist to DB later asynchronously | Very fast writes; risk of data loss; complex |
| **Read-through** | A cache layer loads from the DB itself | Clean app code; needs a library/proxy |
| **Refresh-ahead** | Refresh popular keys before they expire (background job) | No slow misses for hot keys; extra work |

## 4. TTLs and invalidation

> **In short:** Always set TTLs (with jitter) and invalidate on every write path.

- **Always set a TTL.** Even with explicit invalidation, a TTL limits how long a bug or missed invalidation can serve wrong data.
- Pick TTLs by how stale data may be: seconds for dashboards, minutes for listings, hours for reference data.
- Add **jitter** (random ±10%) so many keys don't expire at the same instant.
- Invalidate on every write path (API, admin panel, background jobs, migrations…). Missing one path = stale data.

### Invalidating groups of keys

> **In short:** Track keys in a set, or bump a version number in the key.

You can't efficiently "delete all keys for user 42" without knowing them. Options:

```python
# 1. Track keys in a set
await redis.sadd(f"cache:index:user:{uid}", key)
keys = await redis.smembers(f"cache:index:user:{uid}")
await redis.delete(*keys, f"cache:index:user:{uid}")

# 2. Versioned keys: bump a version number instead of deleting
version = await redis.get(f"cache:ver:user:{uid}") or "1"
key = f"cache:v{version}:tasks:user:{uid}:page:{page}"
await redis.incr(f"cache:ver:user:{uid}")       # all old keys are now unused and expire via TTL
```

## 5. Cache stampede (thundering herd)

> **In short:** Stop many requests rebuilding the same expired key at once.

When a popular key expires, hundreds of requests miss at once and all hit the database.

Fixes:
- **Lock / single flight**: only one request recomputes; others wait briefly or serve stale data.
- **Stale-while-revalidate**: store a soft expiry inside the value; serve the old value while one worker refreshes it.
- **Jittered TTLs** and **refresh-ahead** for hot keys.

```python
async def get_with_lock(key: str, loader, ttl: int = 300):
    if (cached := await redis.get(key)) is not None:
        return json.loads(cached)
    lock_key = f"lock:{key}"
    if await redis.set(lock_key, "1", nx=True, ex=10):          # we won the lock
        try:
            value = await loader()
            await redis.set(key, json.dumps(value, default=str), ex=ttl)
            return value
        finally:
            await redis.delete(lock_key)
    await asyncio.sleep(0.1)                                    # someone else is loading: retry
    return await get_with_lock(key, loader, ttl)
```

## 6. Other caching pitfalls

> **In short:** Penetration, big values, hot keys, stale formats and data leaks between users.

| Problem | Fix |
| --- | --- |
| **Cache penetration**: requests for IDs that don't exist always miss | Cache "not found" for a short time; validate IDs; Bloom filter |
| **Big values** (MBs) | Slow and memory-hungry: cache smaller pieces, compress, or paginate |
| **Hot keys** (one key hammered) | Local in-process cache for a few seconds in front of Redis; replicate the key |
| **Serialization mismatch** after deploys | Version your cache keys (`cache:v2:...`) when the stored shape changes |
| **Caching per-user data under a shared key** | ⚠️ Data leak. Include the user/tenant ID in the key |
| **Treating cache as the source of truth** | Redis can evict or lose data: the DB remains the truth (unless it's purely ephemeral data) |

## 7. Caching in FastAPI

> **In short:** Practical ways to add caching to endpoints.

### A reusable helper/decorator

> **In short:** A decorator that caches an async function's result by its arguments.

```python
import functools, hashlib, json

def cached(prefix: str, ttl: int = 60):
    def decorator(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            raw = json.dumps([args, kwargs], default=str, sort_keys=True)
            key = f"cache:{prefix}:{hashlib.sha1(raw.encode()).hexdigest()}"
            if (hit := await redis_client.get(key)) is not None:
                return json.loads(hit)
            result = await fn(*args, **kwargs)
            await redis_client.set(key, json.dumps(result, default=str), ex=ttl)
            return result
        return wrapper
    return decorator

@cached("exchange-rates", ttl=3600)
async def get_exchange_rates(base: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        return (await c.get(f"https://api.example.com/rates?base={base}")).json()
```

### Caching Pydantic responses

> **In short:** Store `model_dump_json()` output and rebuild the model on a hit.

```python
@router.get("/projects/{project_id}", response_model=ProjectOut)
async def read_project(project_id: int, db: AsyncDb, redis: RedisDep, user: CurrentUser):
    key = f"cache:project:{user.tenant_id}:{project_id}"
    if (hit := await redis.get(key)) is not None:
        return ProjectOut.model_validate_json(hit)
    project = await project_service.get(db, project_id, user)
    out = ProjectOut.model_validate(project)
    await redis.set(key, out.model_dump_json(), ex=300)
    return out
```

Libraries: `fastapi-cache2`, `cashews`, `aiocache`.

### HTTP caching (complements Redis)

> **In short:** `Cache-Control` and ETags let browsers and CDNs cache public responses.

```python
response.headers["Cache-Control"] = "public, max-age=60"        # browsers/CDN may cache for 60 s
response.headers["ETag"] = etag                                  # client sends If-None-Match → return 304
```

Use `private` or `no-store` for user-specific data.

## 8. Sessions in Redis

> **In short:** Server-side sessions with expiry and instant logout.

```python
import secrets

async def create_session(user_id: int) -> str:
    sid = secrets.token_urlsafe(32)
    await redis.hset(f"session:{sid}", mapping={"user_id": user_id, "created": int(time.time())})
    await redis.expire(f"session:{sid}", 60 * 60 * 24 * 7)      # 7 days
    return sid                                                  # put in an httpOnly cookie

async def get_session_user(sid: str) -> int | None:
    uid = await redis.hget(f"session:{sid}", "user_id")
    return int(uid) if uid else None

async def logout(sid: str):
    await redis.delete(f"session:{sid}")                        # instant revocation
```

---

## 9. Exercises

1. Add cache-aside to `GET /projects/{id}` with invalidation on update and delete.
2. Measure response times with and without the cache using a simple load test.
3. Implement versioned keys to invalidate all cached pages of a user's task list.
4. Simulate a stampede with 100 concurrent requests and fix it with a lock.
5. Store sessions in Redis with a sliding expiry (renew the TTL on each request).
