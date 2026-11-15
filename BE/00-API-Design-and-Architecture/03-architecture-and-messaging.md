# 03 · Architecture and messaging

## 1. Monolith, modular monolith, microservices

> **In short:** Start with a well-structured monolith; split into services only when a specific scaling, team or deployment problem demands it.

| | Monolith | Modular monolith | Microservices |
| --- | --- | --- | --- |
| Deployment | One unit | One unit | Many independent units |
| Code boundaries | Often blurred | **Enforced modules**, one database (or schema per module) | Separate repos/DBs |
| Transactions | Easy (one DB) | Easy | Hard (distributed, sagas) |
| Scaling | Whole app together | Whole app together | Per service |
| Debugging | Stack trace | Stack trace | Distributed tracing required |
| Team fit | 1–3 teams | Several teams | Many autonomous teams |
| Operational cost | Low | Low | **High** (CI/CD, observability, networking, on-call per service) |

**The honest interview answer:** "I'd start with a modular monolith with clear module boundaries and a single database. That gives most of the organisational benefit without distributed-systems cost. I'd extract a service when there's a concrete reason — a component with very different scaling needs, a separate compliance boundary, or a team that needs to deploy independently — not because microservices are fashionable."

Common failure: a "distributed monolith" — services that must be deployed together and share a database. Worst of both.

### If you do split

> **In short:** Database per service, split by business capability, and budget for the operational overhead.

- **Database per service** — no shared tables; cross-service reads go through APIs or events.
- Split by **business capability** (orders, payments, catalogue), not by technical layer.
- Expect: an API gateway, service discovery, distributed tracing, centralised logging, per-service CI/CD, and a story for distributed transactions.
- Strangler-fig migration: route new functionality to the new service, move endpoints gradually, delete the old code last.

## 2. The 12-factor app

> **In short:** A checklist for services that deploy cleanly and scale horizontally.

| Factor | Means | In practice |
| --- | --- | --- |
| 1 Codebase | One repo per app, many deploys | Git |
| 2 Dependencies | Declared and isolated | `uv.lock` / `package-lock.json`, containers |
| 3 **Config** | In the environment | Env vars validated at startup; no secrets in git |
| 4 Backing services | Attached resources | DB/Redis/S3 swappable by URL |
| 5 Build/release/run | Separate stages | Build an image once, promote it |
| 6 **Processes** | Stateless, share-nothing | No local session/file state |
| 7 Port binding | Self-contained service | App exports HTTP on a port |
| 8 Concurrency | Scale out by process | More containers, not bigger ones |
| 9 **Disposability** | Fast start, graceful shutdown | SIGTERM handling |
| 10 Dev/prod parity | Keep them similar | Same DB engine, Docker Compose locally |
| 11 Logs | Event streams to stdout | Platform collects them |
| 12 Admin processes | One-off tasks as code | Migrations, seeds run as jobs |

Factors 3, 6, 9 and 11 are the ones that actually break deployments when ignored.

## 3. Synchronous vs asynchronous communication

> **In short:** HTTP/gRPC calls are simple but couple services' availability; messaging decouples them at the cost of eventual consistency.

```
Sync:   Order Service ──HTTP──▶ Payment Service     (order fails if payment is down)
Async:  Order Service ──event──▶ broker ──▶ Payment Service   (order succeeds; payment catches up)
```

| Use sync when | Use async when |
| --- | --- |
| The caller needs the answer now | Work can happen later (email, reports, indexing) |
| Simple request/response | Several consumers need the same event |
| Strong consistency needed | Spikes need smoothing (buffering) |
| | The producer shouldn't fail when a consumer is down |

## 4. Messaging systems

> **In short:** Redis for simple queues, RabbitMQ for rich routing and reliable work queues, Kafka for high-throughput event streams with replay.

| | Redis (lists/streams) | RabbitMQ | Kafka |
| --- | --- | --- | --- |
| Model | Queue / stream | **Message broker** with exchanges and routing | **Distributed commit log** |
| Delivery | At-least-once (with care) | At-least-once, acks, DLX | At-least-once, offsets |
| Retention | Until consumed/trimmed | Until acked | **Time/size based — replayable** |
| Throughput | High | High | **Very high** (millions/s) |
| Ordering | Per key/stream | Per queue | **Per partition** |
| Multiple independent consumers | Limited | Per queue binding | **Consumer groups, each with its own offset** |
| Operational cost | Low | Medium | High |
| Use for | Celery/BullMQ jobs, caching, rate limits | Task queues, routing, RPC, priorities | Event sourcing, analytics pipelines, cross-team event bus |

Also: **SQS/SNS**, **Google Pub/Sub**, **NATS**, **Redpanda** (Kafka-compatible).

**Interview phrasing:** "A queue distributes work to one consumer; a log like Kafka lets many consumers read the same stream independently and replay history. If I need a job queue, I'd use Celery/BullMQ on Redis or RabbitMQ. If I need an event backbone several teams consume, Kafka."

## 5. Event-driven patterns

> **In short:** Publish facts about what happened; let consumers decide what to do — and design for duplicates and ordering.

```json
{
  "eventId": "01JC…",            // unique → consumers deduplicate
  "type": "order.paid",
  "version": 1,
  "occurredAt": "2026-11-12T08:30:00Z",
  "aggregateId": "order_123",
  "data": { "orderId": "order_123", "amount": 4999, "currency": "INR" }
}
```

Rules: name events in the **past tense** (`order.paid`, not `pay_order`), version the payload, keep events small (IDs + essentials), and never assume ordering across partitions.

| Pattern | What it is |
| --- | --- |
| **Event notification** | "Something happened, go look" — small payload, consumer calls back for detail |
| **Event-carried state transfer** | Payload contains enough data that consumers don't call back |
| **Event sourcing** | The event log **is** the source of truth; state is a projection. Powerful, costly |
| **CQRS** | Separate write model from read models/projections |
| **Choreography** | Services react to each other's events (no coordinator) |
| **Orchestration** | A coordinator (saga/workflow engine) drives the steps |

## 6. The transactional outbox

> **In short:** You can't atomically write to your database and publish to a broker — so write the event to an `outbox` table in the same transaction and publish it from there.

```sql
BEGIN;
  INSERT INTO orders (...) VALUES (...);
  INSERT INTO outbox (id, type, payload) VALUES (gen_random_uuid(), 'order.created', '{...}');
COMMIT;
-- A relay worker (or CDC tool like Debezium) reads unsent outbox rows, publishes, marks them sent.
```

This guarantees **at-least-once** publication of events for committed data — the most-asked distributed-systems pattern in backend interviews. Consumers must then be **idempotent**.

## 7. Idempotent consumers and retries

> **In short:** Assume every message can arrive twice; make handling it twice harmless.

```python
if not redis.set(f"processed:{event_id}", 1, nx=True, ex=86400):
    return                                  # already handled
process(event)
```

Other techniques: natural idempotency (`UPDATE … SET status='paid'`), unique constraints on `(event_id)`, and conditional updates (`WHERE version = n`).

Retries need **exponential backoff with jitter** and a **dead-letter queue** after N attempts, with alerting on DLQ depth.

## 8. Sagas: transactions across services

> **In short:** Replace a distributed transaction with a sequence of local transactions plus compensating actions.

```
Create order ──▶ Reserve stock ──▶ Charge card ──▶ Ship
     │                 │                │
     └── cancel ◀── release stock ◀── refund        (compensations on failure)
```

| Style | How |
| --- | --- |
| **Choreography** | Each service listens for the previous event and emits the next. Simple at 2–3 steps, hard to follow beyond that |
| **Orchestration** | A saga coordinator (or a workflow engine like **Temporal**) calls each step and handles failures. Easier to reason about and observe |

Two-phase commit exists but is rarely used — it couples availability across services.

## 9. Resilience patterns

> **In short:** Assume every dependency will be slow or down, and fail in a controlled way.

| Pattern | Does |
| --- | --- |
| **Timeout** | Never wait forever (the #1 omission) |
| **Retry with backoff + jitter** | Survive transient failures without a thundering herd |
| **Circuit breaker** | After N failures, fail fast for a cooldown instead of piling up requests |
| **Bulkhead** | Separate pools/queues so one slow dependency can't exhaust all workers |
| **Rate limiting / throttling** | Protect yourself and downstream services |
| **Graceful degradation** | Serve cached or partial data when a dependency is down |
| **Health checks** | Liveness vs readiness, so orchestrators act correctly |
| **Backpressure** | Shed load rather than collapse |

## 10. Observability in distributed systems

> **In short:** Logs, metrics and traces — with a correlation ID flowing through every hop, or you can't debug anything.

- **Correlation/trace ID** generated at the edge, propagated via headers (W3C `traceparent`) into logs, messages and jobs.
- **OpenTelemetry** for traces across HTTP, DB and queues.
- **RED metrics** per service: Rate, Errors, Duration. **USE** for resources: Utilization, Saturation, Errors.
- Alert on user-facing symptoms (error rate, p95 latency, queue age), not CPU.

## 11. Deployment and data concerns

> **In short:** Independent deploys require backward-compatible APIs, events and database schemas.

- API: additive changes only, versioned endpoints, deprecation windows.
- Events: versioned payloads, tolerant readers (ignore unknown fields).
- Database: expand → migrate → contract ([../FastAPI/09-Migrations/production.md](../FastAPI/09-Migrations/production.md)).
- Feature flags to decouple deploy from release.

---

## 12. Exercises

1. Take a monolith you know and draw the module boundaries you'd enforce before any split.
2. Implement the outbox pattern: write an event in the same transaction, relay it with a worker.
3. Make a consumer idempotent with a Redis `SET NX` dedupe key; deliver the same event twice.
4. Add retry with backoff + a dead-letter queue, and an alert on DLQ depth.
5. Sketch a saga for "place order" with compensating actions for each failure point.
6. Propagate a trace ID from an HTTP request through a queued job into the worker's logs.
