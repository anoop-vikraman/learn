# 02 · Tasks in depth

## 1. Retries

> **In short:** Retry transient failures automatically with exponential backoff and jitter.

```python
import httpx
from celery.exceptions import MaxRetriesExceededError

@celery_app.task(
    bind=True,                                   # gives access to self (the task instance)
    autoretry_for=(httpx.TransportError, httpx.HTTPStatusError),
    retry_backoff=True,                          # exponential: 1 s, 2 s, 4 s, 8 s…
    retry_backoff_max=600,                       # cap the delay at 10 minutes
    retry_jitter=True,                           # randomize to avoid retry storms
    max_retries=5,
)
def sync_to_crm(self, user_id: int) -> None:
    user = load_user(user_id)
    r = httpx.post(CRM_URL, json=user.to_crm(), timeout=10)
    r.raise_for_status()

# Manual retry with custom logic
@celery_app.task(bind=True, max_retries=3)
def charge_invoice(self, invoice_id: int):
    try:
        payment_gateway.charge(invoice_id)
    except RateLimited as exc:
        raise self.retry(exc=exc, countdown=exc.retry_after)    # retry later
    except CardDeclined:
        mark_invoice_failed(invoice_id)                          # permanent error: don't retry
```

- Retry only **transient** errors (timeouts, 5xx, rate limits, connection errors), not bugs or invalid data.
- After `max_retries`, the task fails; record it (DB status, alert, dead-letter queue).
- `self.request.retries` tells you which attempt this is.

## 2. Idempotency (essential)

> **In short:** Tasks may run more than once, so running them twice must be safe.

Tasks can run **more than once**: retries, worker crashes after doing the work but before acknowledging, broker redelivery. Design every task so running it twice is safe.

```python
@celery_app.task(name="emails.send_invoice")
def send_invoice_email(invoice_id: int):
    with SessionLocal() as db:
        invoice = db.get(Invoice, invoice_id)
        if invoice.email_sent_at is not None:          # already done → skip
            return
        email_client.send(...)
        invoice.email_sent_at = datetime.now(timezone.utc)
        db.commit()
```

Techniques:
- Check a status/flag before acting (as above), ideally with a row lock or atomic update.
- **Upserts** instead of inserts; unique constraints to block duplicates.
- **Idempotency keys** for external APIs (most payment APIs accept one).
- A Redis "processed" key: `SET processed:{task_id} 1 NX EX 86400`.

## 3. Acknowledgements: at-most-once vs at-least-once

> **In short:** Early acks can lose tasks; late acks can repeat them.

| Setting | Behaviour | Risk |
| --- | --- | --- |
| Default (`acks_late=False`) | Message acknowledged **before** running | Worker crash mid-task → task **lost** |
| `acks_late=True` | Acknowledged **after** the task finishes | Crash → task **redelivered** and runs again (needs idempotency) |
| `task_reject_on_worker_lost=True` | With `acks_late`, requeue if the worker process is killed | Possible repeated runs (poison tasks that crash workers repeatedly) |

For important work: `acks_late=True` + idempotent tasks. See [production.md](production.md).

## 4. Time limits

> **In short:** Soft limits let a task clean up; hard limits kill stuck tasks.

```python
from celery.exceptions import SoftTimeLimitExceeded

@celery_app.task(soft_time_limit=60, time_limit=90)
def generate_report(report_id: int):
    try:
        build_pdf(report_id)
    except SoftTimeLimitExceeded:
        mark_report_failed(report_id, "timed out")       # clean up before the hard kill
        raise
```

- **Soft** limit raises `SoftTimeLimitExceeded` inside the task so it can clean up.
- **Hard** limit kills the worker child process.
- Always set limits; a stuck task (e.g. an HTTP call without timeout) otherwise occupies a worker forever. Set timeouts on every network call inside tasks too.

## 5. Queues and routing

> **In short:** Separate queues so slow tasks don't delay urgent ones, each with its own workers.

Separate queues stop slow tasks from delaying urgent ones.

```python
celery_app.conf.task_routes = {
    "emails.*": {"queue": "emails"},
    "reports.*": {"queue": "reports"},
    "maintenance.*": {"queue": "low"},
}
celery_app.conf.task_default_queue = "default"
```

```bash
celery -A app.workers.celery_app worker -Q emails,default --concurrency=8 -n emails@%h
celery -A app.workers.celery_app worker -Q reports --concurrency=2 -n reports@%h    # heavy, few at a time
```

You can now scale each worker type independently. Override per call: `task.apply_async(args, queue="priority")`.

## 6. Rate limits and concurrency

> **In short:** Control how fast and how many tasks run at once per worker.

```python
@celery_app.task(rate_limit="10/m")              # per worker, max 10 per minute
def call_partner_api(...): ...
```

- `rate_limit` applies **per worker process**, not globally; for a global limit, use a Redis-based limiter inside the task or a dedicated queue with a single worker.
- `--concurrency` sets the number of child processes (or threads/greenlets with `--pool=threads|gevent|eventlet`). I/O-heavy tasks can use more concurrency (or the threads/gevent pool); CPU-heavy tasks ≈ number of cores.
- `worker_prefetch_multiplier=1` stops a worker grabbing many long tasks at once while others sit idle.

## 7. Periodic tasks with Celery beat

> **In short:** Schedule tasks by interval or cron; run exactly one beat process.

```python
from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    "cleanup-expired-sessions": {
        "task": "maintenance.cleanup_sessions",
        "schedule": 15 * 60,                                   # every 15 minutes (seconds)
    },
    "daily-summary-email": {
        "task": "emails.daily_summary",
        "schedule": crontab(hour=3, minute=30),                # every day at 03:30 UTC
    },
    "weekly-report": {
        "task": "reports.weekly",
        "schedule": crontab(day_of_week="mon", hour=6, minute=0),
        "args": ("all",),
    },
}
```

```bash
celery -A app.workers.celery_app beat --loglevel=INFO
```

⚠️ Run **exactly one** beat process. Two beat instances send every scheduled task twice. (Use a distributed lock inside critical periodic tasks as a safety net; `celery-redbeat` or `django-celery-beat` store schedules in Redis/DB.)

Beat only **sends** tasks; workers run them. For development you can combine them: `celery worker -B` (not for production).

## 8. Workflows (canvas)

> **In short:** Chain, group and chord tasks into sequences and parallel steps.

```python
from celery import chain, group, chord

# chain: run in sequence, each result passed to the next
chain(download.s(url), parse.s(), save.s()).delay()

# group: run in parallel
group(resize.s(image_id, size) for size in (64, 256, 1024)).delay()

# chord: parallel tasks, then a callback with all results
chord(
    (process_chunk.s(file_id, i) for i in range(10)),
    merge_results.s(file_id),
).delay()

# immutable signature: ignore the previous result
chain(step_one.s(1), notify.si("done")).delay()
```

- `.s()` creates a **signature** (a task call to run later); `.si()` an immutable one.
- Chords need a result backend and can be fragile at large scale; keep workflows simple, and store progress in your DB for long processes.
- Link callbacks: `task.apply_async(args, link=on_success.s(), link_error=on_error.s())`.

## 9. Task design guidelines

> **In short:** Small, idempotent, time-limited tasks with simple arguments and their own DB sessions.

- Small, focused tasks; pass **IDs and simple JSON-serializable arguments**.
- Load fresh data inside the task; the data may have changed since enqueueing.
- Open and close your **own DB session** per task (don't share the web request's session).
- Make them **idempotent**; set **time limits**; use timeouts on network calls.
- Use explicit `name=` for tasks so renaming modules doesn't break queued messages.
- Keep messages small (no big payloads: store files in S3 and pass the key).
- Log with the task ID for traceability (`self.request.id`).
- Version tasks carefully: during deploys, old messages may be consumed by new code (and vice versa). Add new optional parameters instead of changing signatures.

## 10. Signals and hooks

> **In short:** Hook into worker and task events, e.g. to reset DB connections or log failures.

```python
from celery.signals import task_failure, worker_process_init

@worker_process_init.connect
def init_worker(**kwargs):
    engine.dispose()            # don't share DB connections inherited from the parent process

@task_failure.connect
def on_failure(sender=None, task_id=None, exception=None, **kwargs):
    logger.error("Task %s (%s) failed: %s", sender.name, task_id, exception)
```

## 11. Testing Celery tasks

> **In short:** Call task functions directly, and mock `.delay()` in API tests.

```python
# Unit-test the task logic by calling the function directly (runs synchronously)
def test_generate_report(db):
    report = make_report(db)
    generate_report(report.id)            # no broker needed
    db.refresh(report)
    assert report.status == "done"

# API tests: check that the task was enqueued, without running it
from unittest.mock import patch

def test_create_report_enqueues(auth_client):
    with patch("app.api.routes.reports.generate_report.delay") as delay:
        r = auth_client.post("/reports", json={"type": "monthly"})
    assert r.status_code == 202
    delay.assert_called_once_with(r.json()["report_id"])
```

`task_always_eager=True` runs tasks inline when called with `.delay()`, which is convenient but hides real behaviour (serialization, timing). Prefer the two approaches above, plus a few integration tests with a real worker (`celery.contrib.testing.worker.start_worker`).

---

## 12. Exercises

1. Write a task calling a flaky API with automatic retries, backoff and jitter; simulate failures.
2. Make an email task idempotent using a `sent_at` column, then call it twice.
3. Route reports to a `reports` queue served by a worker with concurrency 1.
4. Add a nightly beat task that deletes expired sessions.
5. Use a chord to process 10 file chunks in parallel and merge the results.
6. Add soft and hard time limits to a slow task and handle the soft limit.
