# 01 · Redis basics and data types

## 1. Running Redis

> **In short:** Start Redis with Docker or Compose and connect with `redis-cli`.

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine        # or valkey/valkey:8
docker exec -it redis redis-cli
```

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: ["redis-server", "--appendonly", "yes"]
    volumes: [redisdata:/data]
volumes:
  redisdata:
```

```
127.0.0.1:6379> PING
PONG
```

## 2. Core ideas

> **In short:** In-memory, key-based, atomic single-threaded commands, with optional expiry.

- Data lives **in memory** (optionally persisted to disk), which is why it's so fast and why memory size matters.
- Every value is stored under a **key** (a string). Use namespaced keys: `user:42:profile`, `cache:tasks:user:42`, `rl:login:1.2.3.4`.
- Commands are **atomic**: each runs completely before the next. Redis runs commands on a single main thread.
- Keys can **expire** automatically (TTL): great for caches and temporary data.

## 3. Keys and expiry

> **In short:** Create, check, delete and expire keys; iterate with `SCAN`, never `KEYS *`.

```
SET greeting "hello"
GET greeting                 → "hello"
EXISTS greeting              → 1
DEL greeting
EXPIRE session:abc 3600      # expire in 1 hour
TTL session:abc              → 3599   (-1 = no expiry, -2 = key doesn't exist)
PERSIST session:abc          # remove the expiry
TYPE user:42                 → hash
SCAN 0 MATCH user:* COUNT 100   # iterate keys safely
RENAME a b
```

⚠️ Never use `KEYS *` on a production server: it blocks Redis while scanning every key. Use `SCAN`.

## 4. Strings

> **In short:** Simple values, counters, JSON blobs and lock keys.

The simplest type: text, numbers, serialized JSON, binary (up to 512 MB, but keep values small).

```
SET user:42:name "Anoop"
SET cache:stats '{"tasks": 120}' EX 60     # with a 60 s TTL
SET lock:job1 "worker-a" NX EX 30          # only set if it doesn't exist (locks)
GET user:42:name
MSET a 1 b 2                               # several at once
MGET a b
INCR page:views                            # atomic counter → 1, 2, 3…
INCRBY page:views 10
DECR stock:item:7
APPEND log "line\n"
GETDEL token:xyz                           # get and delete (one-time tokens)
```

## 5. Hashes: objects with fields

> **In short:** Store objects whose fields can be read and updated individually.

```
HSET user:42 name "Anoop" email "a@x.com" plan "pro"
HGET user:42 email
HGETALL user:42
HMGET user:42 name plan
HINCRBY user:42 login_count 1
HDEL user:42 plan
HEXISTS user:42 email
```

Good for objects where you read/update individual fields. (Redis 7.4+ can also expire individual hash fields.)

## 6. Lists: ordered sequences

> **In short:** Push and pop at both ends: queues, feeds and capped logs.

```
LPUSH notifications:42 "new comment"       # push left (start)
RPUSH queue:emails "job1" "job2"           # push right (end)
LPOP queue:emails                          # pop from the start → FIFO with RPUSH
BLPOP queue:emails 5                       # blocking pop: wait up to 5 s for an item
LRANGE notifications:42 0 9                # first 10 items
LTRIM notifications:42 0 99                # keep only the latest 100
LLEN queue:emails
```

Uses: simple queues, recent-activity feeds, capped logs.

## 7. Sets: unique unordered members

> **In short:** Unique collections with fast membership and set operations.

```
SADD tags:task:10 "urgent" "backend"
SMEMBERS tags:task:10
SISMEMBER tags:task:10 "urgent"            → 1
SREM tags:task:10 "urgent"
SCARD tags:task:10                         # count
SINTER online:users team:7:members         # intersection: online members of team 7
SUNION a b
SDIFF a b
SRANDMEMBER giveaway:entries 1             # random member
```

Uses: unique visitors, tags, "who liked this", online users.

## 8. Sorted sets: members ordered by score

> **In short:** Leaderboards, priority queues and time-based scheduling.

```
ZADD leaderboard 1500 "anoop" 1720 "bina" 980 "chen"
ZINCRBY leaderboard 50 "anoop"
ZREVRANGE leaderboard 0 9 WITHSCORES       # top 10 (highest first)
ZRANK leaderboard "chen"                   # position (0-based, lowest first)
ZSCORE leaderboard "bina"
ZRANGEBYSCORE events:scheduled 0 1731240000   # items due before a timestamp
ZREM leaderboard "chen"
ZCARD leaderboard
```

Uses: leaderboards, priority queues, scheduled jobs (score = timestamp), sliding-window rate limits, "trending" lists.

## 9. Other types (overview)

> **In short:** Streams, bitmaps, HyperLogLog, geo, JSON and search.

| Type | Use |
| --- | --- |
| **Streams** | Append-only log with consumer groups (event processing, lesson 03) |
| **Bitmaps** (`SETBIT`, `BITCOUNT`) | Compact flags: daily active users by user ID |
| **HyperLogLog** (`PFADD`, `PFCOUNT`) | Approximate unique counts using ~12 KB, e.g. unique visitors |
| **Geospatial** (`GEOADD`, `GEOSEARCH`) | Nearby places |
| **JSON** (`JSON.SET`), **search**, **time series** | Built into Redis 8 / Redis Stack modules |

## 10. Using Redis from Python

> **In short:** The redis-py client for strings, hashes, sorted sets and JSON values.

```bash
uv add redis            # redis-py: sync and asyncio clients
```

```python
import json
import redis

r = redis.Redis.from_url("redis://localhost:6379/0", decode_responses=True)   # str instead of bytes

r.set("greeting", "hello", ex=60)
r.get("greeting")                       # 'hello' (None if missing)
r.incr("page:views")
r.hset("user:42", mapping={"name": "Anoop", "plan": "pro"})
r.hgetall("user:42")                    # {'name': 'Anoop', 'plan': 'pro'}
r.zadd("leaderboard", {"anoop": 1500, "bina": 1720})
r.zrevrange("leaderboard", 0, 9, withscores=True)

r.set("cache:task:10", json.dumps({"id": 10, "title": "Docs"}), ex=300)
task = json.loads(r.get("cache:task:10") or "null")
```

### Async client (for FastAPI `async def`)

> **In short:** `redis.asyncio` for non-blocking calls; create one client per process.

```python
import redis.asyncio as aioredis

redis_client = aioredis.from_url("redis://localhost:6379/0", decode_responses=True)

async def get_views() -> int:
    return int(await redis_client.get("page:views") or 0)

# close on shutdown (lifespan): await redis_client.aclose()
```

Create **one client per process** (it holds a connection pool) and reuse it; don't connect per request.

### Pipelines: send many commands in one round trip

> **In short:** Batch commands to cut network round trips.

```python
with r.pipeline() as pipe:
    for i in range(1000):
        pipe.set(f"key:{i}", i)
    pipe.execute()          # 1 network round trip instead of 1000
```

---

## 11. Exercises

1. Store a user profile as a hash, update one field, and read it back.
2. Build a page-view counter with `INCR` and a daily key (`views:2026-11-10`) that expires after 7 days.
3. Build a leaderboard with sorted sets: add scores, show the top 5, show a user's rank.
4. Implement a simple FIFO queue with `RPUSH` + `BLPOP` in two Python scripts (producer/consumer).
5. Count approximate unique visitors with HyperLogLog and compare with a set.
