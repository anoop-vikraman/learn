# 03 · Advanced Redis uses

## 1. Rate limiting

> **In short:** Limit how many requests a user or IP can make in a time window.

### Fixed window (simple)

> **In short:** One counter per time window; simple but allows bursts at window edges.

```python
async def allow_request(user_id: int, limit: int = 100, window: int = 60) -> bool:
    key = f"rl:{user_id}:{int(time.time() // window)}"
    async with redis.pipeline(transaction=True) as pipe:
        pipe.incr(key)
        pipe.expire(key, window)
        count, _ = await pipe.execute()
    return count <= limit
```

Weakness: a burst at the edge of two windows can allow up to 2× the limit.

### Sliding window log (accurate) with a sorted set

> **In short:** Count requests in the last N seconds using timestamps in a sorted set.

```python
async def allow_sliding(key: str, limit: int, window: int) -> bool:
    now = time.time()
    async with redis.pipeline(transaction=True) as pipe:
        pipe.zremrangebyscore(key, 0, now - window)     # drop old entries
        pipe.zadd(key, {f"{now}-{uuid.uuid4().hex}": now})
        pipe.zcard(key)
        pipe.expire(key, window)
        _, _, count, _ = await pipe.execute()
    return count <= limit
```

### Token bucket

> **In short:** Allows short bursts while limiting the average rate; usually a Lua script.

Allows short bursts but limits the average rate; usually implemented with a small **Lua script** so the read-modify-write is atomic. Libraries: `limits`, `slowapi`, `fastapi-limiter`.

In FastAPI, use a dependency that raises `HTTPException(429, headers={"Retry-After": "..."})` (see [../02-FastAPI/08-async-background-middleware.md](../02-FastAPI/08-async-background-middleware.md)). Rate-limit by user ID when authenticated, and by IP otherwise (correct client IP behind proxies!).

## 2. Distributed locks

> **In short:** `SET NX EX` plus token-checked release, so only one process does a job at a time.

Ensure only **one process** does something at a time across many servers (e.g. a scheduled job, processing one order).

```python
import uuid

async def acquire_lock(name: str, ttl: int = 30) -> str | None:
    token = uuid.uuid4().hex
    ok = await redis.set(f"lock:{name}", token, nx=True, ex=ttl)    # set only if absent, with expiry
    return token if ok else None

RELEASE = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
end
return 0
"""

async def release_lock(name: str, token: str) -> None:
    await redis.eval(RELEASE, 1, f"lock:{name}", token)   # only delete if we still own it
```

redis-py has a built-in helper:

```python
lock = redis.lock("lock:daily-report", timeout=60, blocking_timeout=5)
async with lock:
    await generate_report()
```

Rules:
- **Always set an expiry**, or a crashed process holds the lock forever.
- **Release only your own lock** (compare the token), because your lock may have expired and been taken by someone else.
- If work can outlast the TTL, extend the lock periodically.
- Redis locks are **best-effort** (a failover can lose a lock). For correctness-critical cases, also protect with database constraints, row locks (`SELECT ... FOR UPDATE`), or fencing tokens.

## 3. Pub/Sub

> **In short:** Broadcast messages to connected subscribers; nothing is stored for offline ones.

Fire-and-forget messaging: publishers send to a **channel**; every currently connected subscriber receives it.

```python
# subscriber
async def listen():
    pubsub = redis.pubsub()
    await pubsub.subscribe("task-events")
    async for message in pubsub.listen():
        if message["type"] == "message":
            print("got", message["data"])

# publisher
await redis.publish("task-events", json.dumps({"id": 10, "action": "updated"}))
```

- **No persistence**: if a subscriber is offline, it misses the message.
- Perfect for broadcasting **WebSocket** messages across multiple FastAPI workers/servers: each worker subscribes and forwards messages to its own connected clients.
- Pattern subscriptions: `psubscribe("task-events:*")`.

## 4. Streams: durable event logs

> **In short:** Persistent messages with consumer groups, acknowledgements and recovery.

Streams keep messages, support **consumer groups** (each message processed by one consumer in the group), acknowledgements and replay: like a lightweight Kafka.

```python
# producer
await redis.xadd("stream:orders", {"order_id": "123", "event": "paid"}, maxlen=100_000, approximate=True)

# create a consumer group once
try:
    await redis.xgroup_create("stream:orders", "billing", id="0", mkstream=True)
except Exception:
    pass  # group already exists

# consumer
while True:
    entries = await redis.xreadgroup("billing", "worker-1", {"stream:orders": ">"}, count=10, block=5000)
    for _stream, messages in entries or []:
        for msg_id, fields in messages:
            await handle(fields)
            await redis.xack("stream:orders", "billing", msg_id)     # done
```

- Unacknowledged messages stay **pending**; recover them from crashed consumers with `XAUTOCLAIM`.
- Trim with `MAXLEN` to bound memory.

| | Pub/Sub | Streams | List queue |
| --- | --- | --- | --- |
| Persistence | ❌ | ✅ | ✅ |
| Multiple independent consumers groups | All subscribers get everything | ✅ consumer groups | ❌ |
| Acknowledgement / redelivery | ❌ | ✅ | ❌ (unless you build it) |
| Use | Live notifications | Event processing | Simple job queue |

For full job queues with retries, scheduling and monitoring, use **Celery**, **RQ**, **arq** or **Dramatiq** on top of Redis instead of building your own.

## 5. Transactions: MULTI/EXEC and WATCH

> **In short:** Run commands together without interleaving; no rollback.

```python
async with redis.pipeline(transaction=True) as pipe:   # MULTI ... EXEC: queued commands run together
    pipe.decrby("stock:7", 1)
    pipe.rpush("orders", "order-1")
    await pipe.execute()
```

- All commands run in sequence without other clients' commands in between.
- There is **no rollback**: if one command fails (e.g. wrong type), the others still run.
- `WATCH key` gives optimistic locking: the transaction aborts if the watched key changed before EXEC.

## 6. Lua scripts: atomic custom logic

> **In short:** Read-modify-write logic that runs atomically on the server.

A Lua script runs **atomically** on the server: no other command runs in between. Use it for read-modify-write logic that must not race.

```python
DECR_IF_ENOUGH = """
local stock = tonumber(redis.call('get', KEYS[1]) or '0')
local qty = tonumber(ARGV[1])
if stock >= qty then
    return redis.call('decrby', KEYS[1], qty)
end
return -1
"""
decrement_stock = redis.register_script(DECR_IF_ENOUGH)
remaining = await decrement_stock(keys=["stock:7"], args=[2])    # -1 = not enough stock
```

Keep scripts short: a long script blocks the whole server. (Redis 7 also has **Functions**, server-side script libraries.)

## 7. Pipelines vs transactions

> **In short:** Round-trip savings vs atomicity vs conditional logic.

| | Pipeline | Transaction (MULTI/EXEC) | Lua script |
| --- | --- | --- | --- |
| Fewer round trips | ✅ | ✅ | ✅ |
| Atomic (no interleaving) | ❌ | ✅ | ✅ |
| Can use read results to decide the next step | ❌ | ❌ (only WATCH) | ✅ |

## 8. Other useful recipes

> **In short:** Idempotency keys, online users, feature flags and delayed jobs.

```python
# Idempotency: process each event ID only once (24 h window)
if await redis.set(f"processed:{event_id}", 1, nx=True, ex=86400):
    await process(event)

# Online users (expire after 5 minutes without a heartbeat)
await redis.zadd("online", {user_id: time.time()})
await redis.zremrangebyscore("online", 0, time.time() - 300)
online_count = await redis.zcard("online")

# Feature flags / config with instant updates
await redis.hset("flags", "new_dashboard", "1")
enabled = await redis.hget("flags", "new_dashboard") == "1"

# Delayed jobs with a sorted set (score = run-at timestamp)
await redis.zadd("delayed", {json.dumps(job): time.time() + 3600})
due = await redis.zrangebyscore("delayed", 0, time.time())
```

---

## 9. Exercises

1. Implement a sliding-window rate limit as a FastAPI dependency and test it with 150 quick requests.
2. Use a Redis lock so a scheduled report runs on only one of three worker processes.
3. Broadcast WebSocket chat messages through Redis pub/sub across two Uvicorn workers.
4. Build a stream consumer group with two consumers; kill one mid-processing and reclaim its pending messages.
5. Write a Lua script for atomic "decrement stock if enough".
