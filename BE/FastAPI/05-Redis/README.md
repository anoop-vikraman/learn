# Redis

**Redis** is an in-memory data store: extremely fast (sub-millisecond) key-value storage with rich data types. Backends use it for **caching, sessions, rate limiting, distributed locks, queues (Celery broker), pub/sub and leaderboards**.

*(Licensing note: Redis 7.4+ moved to source-available licences; Redis 8 added AGPL as an option. **Valkey** is a fully open-source fork (Linux Foundation) with the same commands and clients. Everything here works with both.)*

| # | Lesson | Level | You will learn |
| --- | --- | --- | --- |
| 01 | [Basics and data types](01-basics-data-types.md) | Beginner | Running Redis, redis-cli, keys, TTL, strings, hashes, lists, sets, sorted sets, using Redis from Python |
| 02 | [Caching patterns](02-caching-patterns.md) | Intermediate | Cache-aside, write-through, invalidation, TTLs, stampedes, caching in FastAPI |
| 03 | [Advanced uses](03-advanced-uses.md) | Advanced | Rate limiting, distributed locks, pub/sub, streams, queues, transactions, Lua, pipelines |
| — | [**Production**](production.md) | — | Persistence, memory and eviction, HA (replication, Sentinel, Cluster), security, monitoring |
