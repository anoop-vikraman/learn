# Celery

**Celery** is a distributed task queue for Python. Your API puts a **task** (a message) on a **broker** (Redis or RabbitMQ); separate **worker** processes pick it up and run it. Use it for anything slow, unreliable or scheduled: emails, reports, image/PDF processing, calling third-party APIs, data imports, periodic clean-ups.

```
FastAPI ──task.delay()──▶ Broker (Redis/RabbitMQ) ──▶ Celery workers ──▶ DB / email / APIs
   ▲                                                      │
   └─────── (optional) result backend: task status/result ◀┘
Celery beat ──every N minutes──▶ Broker   (scheduled tasks)
```

| # | Lesson | Level | You will learn |
| --- | --- | --- | --- |
| 01 | [Basics](01-basics.md) | Beginner | Why a task queue, setup with Redis, defining and calling tasks, workers, results, FastAPI integration |
| 02 | [Tasks in depth](02-tasks-in-depth.md) | Intermediate → Advanced | Retries, idempotency, time limits, routing and queues, beat scheduling, workflows (chain/group/chord), testing |
| — | [**Production**](production.md) | — | Broker choice, reliability settings, scaling workers, monitoring (Flower, metrics), deployment, common failures |

Alternatives: **RQ** (simpler, Redis only), **Dramatiq**, **arq** (asyncio), **Taskiq**, **Huey**; for complex long-running workflows, **Temporal**.
