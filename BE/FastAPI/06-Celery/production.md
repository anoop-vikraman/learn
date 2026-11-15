# Celery in production

## 1. Checklist

> **In short:** Everything to set up before running Celery in production.

- [ ] Reliable broker (managed RabbitMQ, or Redis with persistence and `noeviction`), separate from the cache
- [ ] `acks_late=True` + idempotent tasks for important work
- [ ] Time limits on every task; timeouts on every network call
- [ ] Separate queues for different workloads; workers scaled per queue
- [ ] Exactly one beat scheduler
- [ ] Results ignored unless needed; result expiry set
- [ ] Monitoring: queue length, task failures, task duration, worker health; alerts
- [ ] Graceful shutdown during deploys
- [ ] Error tracking (Sentry Celery integration) with task context
- [ ] Failed-task handling (DB status, alerts, dead-letter or manual retry tool)

## 2. Broker choice

> **In short:** Redis, RabbitMQ or SQS, and the reliability each offers.

| | Redis | RabbitMQ | Amazon SQS |
| --- | --- | --- | --- |
| Setup | Easy, often already present | Extra service | Managed, no servers |
| Delivery guarantees | Good with persistence + `noeviction`; visibility-timeout-based redelivery | Strongest: acknowledgements, durable queues, dead-letter exchanges | Good; visibility timeout |
| Features | Basic routing, priorities (emulated) | Rich routing, priorities, DLX, quorum queues | Limited features, some Celery features unsupported |
| Recommendation | Fine for most apps | High-volume or critical workloads | AWS-native setups |

### Redis broker settings that matter

> **In short:** Visibility timeout, `noeviction` and persistence prevent lost or duplicated tasks.

```python
celery_app.conf.broker_transport_options = {
    "visibility_timeout": 3600,     # seconds before an unacknowledged task is redelivered
}
```

With `acks_late`, a task running **longer than `visibility_timeout`** gets delivered to another worker **while still running** (duplicate execution). Set the visibility timeout above your longest task's time limit, including ETA/countdown delays.

Redis used as a broker must have **`maxmemory-policy noeviction`** and persistence (AOF), or queued tasks can disappear. Use a separate Redis instance/DB from your cache.

## 3. Recommended configuration

> **In short:** Late acks, prefetch, time limits, worker recycling and result settings.

```python
celery_app.conf.update(
    # reliability
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,          # fair distribution for long tasks
    broker_connection_retry_on_startup=True,

    # safety limits
    task_soft_time_limit=300,
    task_time_limit=360,
    worker_max_tasks_per_child=1000,       # recycle processes (memory leaks)
    worker_max_memory_per_child=500_000,   # KB: restart a child above ~500 MB

    # results
    task_ignore_result=True,               # opt in per task with ignore_result=False
    result_expires=24 * 3600,

    # observability
    task_track_started=True,
    worker_send_task_events=True,
    task_send_sent_event=True,

    # serialization
    task_serializer="json",
    accept_content=["json"],
    timezone="UTC",
)
```

⚠️ Never accept `pickle` content from the broker: anyone who can write to the broker could execute code on your workers.

## 4. Deployment

> **In short:** One image with separate commands for each worker type and a single beat.

Same Docker image as the API, different commands:

```yaml
# docker-compose.prod.yml (sketch)
services:
  api:
    image: registry.example.com/task-api:${TAG}
    command: ["fastapi", "run", "app/main.py", "--workers", "4"]
  worker-default:
    image: registry.example.com/task-api:${TAG}
    command: ["celery", "-A", "app.workers.celery_app", "worker", "-Q", "default,emails",
              "--concurrency=8", "--loglevel=INFO", "-n", "default@%h"]
    stop_grace_period: 120s            # let running tasks finish
  worker-reports:
    image: registry.example.com/task-api:${TAG}
    command: ["celery", "-A", "app.workers.celery_app", "worker", "-Q", "reports",
              "--concurrency=2", "--loglevel=INFO", "-n", "reports@%h"]
    stop_grace_period: 600s
  beat:
    image: registry.example.com/task-api:${TAG}
    command: ["celery", "-A", "app.workers.celery_app", "beat", "--loglevel=INFO",
              "--schedule=/tmp/celerybeat-schedule"]
    deploy:
      replicas: 1                      # exactly one
```

In Kubernetes: one Deployment per worker type, beat as a Deployment with `replicas: 1` and `strategy: Recreate` (no overlap during rollout), and a high `terminationGracePeriodSeconds` for workers.

### Graceful shutdown

> **In short:** Let running tasks finish before workers stop.

On SIGTERM, a Celery worker stops taking new tasks and waits for running ones to finish (**warm shutdown**). Make the platform's grace period longer than your longest task; otherwise tasks are killed mid-way (and, with `acks_late`, redelivered).

### Deploying task changes safely

> **In short:** Keep task signatures backward compatible during rolling deploys.

During a rolling deploy, old and new code run side by side and queued messages may be processed by either version:
- Add new **optional** arguments with defaults; don't remove or reorder parameters in one step.
- Keep old task names registered until queues have drained.
- Deploy workers **before** API code that sends a brand-new task (so a worker that knows it exists).

## 5. Scaling

> **In short:** Scale workers per queue, autoscale on queue length, and protect downstream services.

- Scale **per queue**: more replicas for busy queues, fewer for heavy ones.
- Autoscale on **queue length** (KEDA in Kubernetes scales on Redis/RabbitMQ queue depth) rather than CPU.
- CPU-bound tasks: concurrency ≈ cores per worker; I/O-bound: higher concurrency or `--pool=threads`/`gevent`.
- Watch downstream limits: 50 workers can overwhelm your database or a partner API. Limit DB pool size per worker process and use rate limits.
- Database connections: each worker child process has its own pool → total connections = processes × pool size. Use small pools (`pool_size=2–5`) in workers, plus PgBouncer.

## 6. Monitoring and alerting

> **In short:** Queue backlog, failures, durations, and worker and beat liveness.

| Signal | How | Alert when |
| --- | --- | --- |
| Queue length / age of oldest message | Redis `LLEN <queue>`, RabbitMQ management API, exporters | Growing backlog / oldest > N minutes |
| Task failures and retries | Flower, Prometheus exporter (`celery-exporter`), Sentry | Failure rate spike |
| Task duration (p95) | Exporter / task events / logs | Regression |
| Worker liveness | `celery inspect ping`, process supervisor, heartbeat metric | No workers for a queue |
| Beat liveness | A heartbeat task that updates a timestamp; alert if stale | No run for > 2 intervals |

- **Flower** gives a live web UI; protect it with authentication and don't expose it publicly.
- Sentry's Celery integration captures task exceptions with arguments and retry info (scrub sensitive args).
- Log with task name and ID; propagate a correlation/request ID from the API into task headers for tracing (OpenTelemetry has Celery instrumentation).

## 7. Handling failures

> **In short:** Record failures, allow re-enqueueing, and contain poison messages.

- Record failures in your **domain data** (e.g. `reports.status = 'failed'`, `error_message`), so users and support can see them.
- Provide an admin action or script to **re-enqueue** failed jobs after fixing the cause.
- **Poison messages** (a task that always crashes the worker): with `task_reject_on_worker_lost` it can loop forever. Cap with retry counts and send to a dead-letter queue (RabbitMQ DLX) or mark it failed.
- **Thundering herd after outages**: when the broker or a dependency comes back, thousands of retries fire together. Use backoff with jitter and rate limits.

## 8. Security

> **In short:** Private, authenticated broker, JSON only, no secrets in task arguments.

- Broker on a private network, with authentication and TLS (`rediss://`, `amqps://`).
- JSON serialization only.
- Don't put secrets or large personal data in task arguments (they're stored in the broker and may appear in logs/Flower); pass IDs and load data inside the task.
- Flower behind auth/VPN.

## 9. Common problems

> **In short:** Causes and fixes for duplicate, stuck and lost tasks and memory growth.

| Problem | Likely cause | Fix |
| --- | --- | --- |
| Tasks run twice | `acks_late` + task longer than visibility timeout; two beat instances; retries without idempotency | Raise visibility timeout; single beat; make tasks idempotent |
| Tasks stay PENDING forever | No worker listening on that queue; task not registered; wrong broker URL | Check `inspect registered`/`active_queues`, routes, `-Q` flags |
| Tasks lost | Redis evicting keys; worker killed with early acks | `noeviction` + persistence; `acks_late` |
| Workers' memory grows | Leaks in task code or libraries | `worker_max_tasks_per_child`, `worker_max_memory_per_child` |
| One slow task type blocks everything | All tasks in one queue, high prefetch | Separate queues; `worker_prefetch_multiplier=1` |
| DB "too many connections" | Many worker processes × pool size | Smaller pools, PgBouncer |
| Scheduled tasks missed | Beat down, or deploy overlap | Monitor beat heartbeat; `Recreate` strategy |

## 10. Routine

> **In short:** Ongoing to quarterly Celery tasks.

| How often | Task |
| --- | --- |
| Continuously | Alerts on backlog, failures, worker/beat liveness |
| Weekly | Review failed tasks and retries; slowest task types |
| Monthly | Tune concurrency/queues based on load; review periodic tasks still needed; update Celery/kombu/broker |
| Quarterly | Test broker failover and worker restart behaviour; review task idempotency for new tasks |
