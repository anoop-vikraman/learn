# Redis and BullMQ

Redis concepts (data types, caching patterns, locks, pub/sub) and Redis production operations are explained in [../../FastAPI/05-Redis/](../../FastAPI/05-Redis/); they apply unchanged to Node. This folder shows the Node implementation with **ioredis**, and background jobs with **BullMQ**, the Node equivalent of Celery.

| # | Lesson | You will learn |
| --- | --- | --- |
| 01 | [Redis with ioredis](01-redis-ioredis.md) | Connecting, commands, cache-aside in Express, invalidation, rate limiting, sessions, pub/sub for WebSockets, locks |
| 02 | [Background jobs with BullMQ](02-bullmq.md) | How BullMQ works, queues and workers, retries and backoff, delayed and repeatable jobs, concurrency, flows, events, Bull Board |
| — | [**Production**](production.md) | Redis settings for queues, worker deployment and scaling, graceful shutdown, monitoring, failure handling |
