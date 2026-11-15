# 01 · Celery basics

## 1. Why a task queue?

> **In short:** Move slow, unreliable or scheduled work out of web requests into retryable background jobs.

A web request should finish in milliseconds to a couple of seconds. Some work takes longer or may fail and need retrying:

- Sending emails/SMS/push notifications
- Generating PDFs/reports, resizing images, video processing
- Calling slow or unreliable third-party APIs (payments webhooks, CRMs)
- Importing large CSV files
- Scheduled jobs: nightly clean-ups, daily summaries

Doing these inside the request makes users wait, ties up web workers, and loses the work if the server restarts. A task queue moves them to **background workers** that can **retry**, be **scaled separately**, and survive restarts (the task stays in the broker).

### Key terms

> **In short:** Task, message, broker, worker, result backend, beat and queue.

| Term | Meaning |
| --- | --- |
| **Task** | A Python function registered with Celery |
| **Message** | The serialized task call (name + arguments) |
| **Broker** | Message transport/queue: **Redis** or **RabbitMQ** (or SQS) |
| **Worker** | A process that consumes messages and runs tasks |
| **Result backend** | Optional storage for task state/results (Redis, database) |
| **Beat** | Scheduler that sends tasks periodically |
| **Queue** | A named channel; workers can listen to specific queues |

## 2. Setup

> **In short:** Create a Celery app pointing at a Redis broker, with JSON serialization and UTC.

```bash
uv add "celery[redis]"
docker run -d -p 6379:6379 redis:7-alpine
```

```python
# app/workers/celery_app.py
from celery import Celery

celery_app = Celery(
    "task_api",
    broker="redis://localhost:6379/1",           # use settings.redis_url in real code
    backend="redis://localhost:6379/2",          # result backend (optional)
    include=["app.workers.tasks"],               # modules containing tasks
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    result_expires=3600,                         # delete stored results after 1 h
)
```

## 3. Defining tasks

> **In short:** Decorate functions with `@celery_app.task`; pass IDs, not ORM objects.

```python
# app/workers/tasks.py
import time
from app.workers.celery_app import celery_app

@celery_app.task
def add(x: int, y: int) -> int:
    return x + y

@celery_app.task(name="emails.send_welcome")      # explicit names survive refactors/moves
def send_welcome_email(user_id: int) -> None:
    user = load_user(user_id)                     # load fresh data inside the task
    email_client.send(to=user.email, template="welcome", context={"name": user.full_name})

@celery_app.task
def generate_report(report_id: int) -> str:
    time.sleep(10)                                # pretend it's heavy
    path = build_pdf(report_id)
    return path
```

**Pass IDs, not objects.** Arguments are serialized to JSON; pass `user_id`, not a SQLAlchemy `User` (it can't be serialized and would be stale by the time the task runs).

## 4. Running a worker

> **In short:** Start worker processes that consume tasks from the broker.

```bash
celery -A app.workers.celery_app worker --loglevel=INFO
celery -A app.workers.celery_app worker -l INFO --concurrency=4 -Q default,emails   # options
```

The worker connects to the broker, waits for messages, and runs tasks in a **pool** of child processes (default: one per CPU core).

## 5. Calling tasks

> **In short:** `.delay()` / `.apply_async()` enqueue a task, optionally with a delay, queue or expiry.

```python
from app.workers.tasks import add, send_welcome_email, generate_report

add.delay(2, 3)                                   # shortcut: send to the queue now
add.apply_async(args=(2, 3))                      # same, with options:
add.apply_async((2, 3), countdown=60)             # run in ≥ 60 seconds
add.apply_async((2, 3), eta=datetime(2026, 11, 11, 9, 0, tzinfo=timezone.utc))
add.apply_async((2, 3), queue="emails", priority=5, expires=300)

add(2, 3)                                         # ⚠️ runs synchronously in THIS process (no queue)
```

`delay()` returns an **AsyncResult** immediately (it doesn't wait for the task).

## 6. Results and task state

> **In short:** Check a task's status and result; store important outcomes in your own database.

```python
result = generate_report.delay(42)
result.id              # task ID: return it to the client so it can poll
result.status          # PENDING → STARTED → SUCCESS / FAILURE / RETRY
result.ready()         # finished?
result.get(timeout=30) # ⚠️ blocks until done: never call this inside a web request or another task

from celery.result import AsyncResult
AsyncResult(task_id, app=celery_app).status
```

- `PENDING` also means "unknown ID" (Celery can't distinguish). Set `task_track_started=True` to see `STARTED`.
- Only configure a result backend if you need results/status; otherwise ignore results (`@task(ignore_result=True)`) to save resources.
- For important outcomes, store status in **your own database** (e.g. a `reports` table with `status`, `file_url`, `error`) rather than relying on the result backend.

## 7. Using Celery from FastAPI

> **In short:** Return 202 with a job ID, enqueue after committing, and let the client poll for status.

```python
# app/api/routes/reports.py
from fastapi import APIRouter
from celery.result import AsyncResult
from app.workers.celery_app import celery_app
from app.workers.tasks import generate_report

router = APIRouter(prefix="/reports", tags=["reports"])

@router.post("", status_code=202)                      # 202 Accepted: processing later
def create_report(data: ReportRequest, db: DbSession, user: CurrentUser):
    report = Report(owner_id=user.id, status="queued", params=data.model_dump())
    db.add(report)
    db.commit()
    generate_report.delay(report.id)                   # enqueue AFTER the commit (the worker must see the row)
    return {"report_id": report.id, "status": "queued"}

@router.get("/{report_id}")
def report_status(report_id: int, db: DbSession, user: CurrentUser):
    report = get_owned_report_or_404(db, report_id, user)
    return {"status": report.status, "download_url": report.file_url}
```

```python
# app/workers/tasks.py
@celery_app.task(name="reports.generate")
def generate_report(report_id: int) -> None:
    with SessionLocal() as db:                         # tasks open their OWN DB session
        report = db.get(Report, report_id)
        report.status = "running"
        db.commit()
        try:
            report.file_url = build_and_upload_pdf(report)
            report.status = "done"
        except Exception:
            report.status = "failed"
            raise
        finally:
            db.commit()
```

The frontend polls `GET /reports/{id}` (or listens via WebSocket/SSE) until `status == "done"`.

⚠️ **Enqueue after committing.** If you call `.delay()` before the transaction commits, the worker may run before the row exists, or the transaction may roll back while the task still runs. For full safety use the transactional **outbox pattern** (see [../03-Database-Concepts/06-transactions-concurrency.md](../03-Database-Concepts/06-transactions-concurrency.md)).

## 8. Async code inside tasks

> **In short:** Tasks are synchronous; wrap async code with `asyncio.run` or use an async-native queue.

Celery tasks are synchronous functions. To call async code:

```python
import asyncio

@celery_app.task
def sync_wrapper(user_id: int):
    return asyncio.run(async_work(user_id))
```

Or use an asyncio-native queue (arq, Taskiq) if most of your code is async.

## 9. Project layout

> **In short:** Where the Celery app and task modules live; API and workers share one codebase.

```
app/
  workers/
    __init__.py
    celery_app.py      # Celery() instance + config
    tasks/             # or tasks.py
      emails.py
      reports.py
      maintenance.py
```

Both the API and the worker import the same code base; they're the same Docker image started with different commands (see [../07-Docker/](../07-Docker/)).

## 10. Monitoring locally

> **In short:** Flower's web UI and `celery inspect` commands.

```bash
uv add flower
celery -A app.workers.celery_app flower --port=5555     # web UI: workers, tasks, failures
celery -A app.workers.celery_app inspect active         # what's running now
celery -A app.workers.celery_app inspect registered     # which tasks a worker knows
celery -A app.workers.celery_app purge                  # ⚠️ delete all queued messages
```

---

## 11. Exercises

1. Set up Celery with Redis, write an `add` task, run a worker and call it from a Python shell.
2. Add `POST /reports` (202) and `GET /reports/{id}` backed by a DB status column and a Celery task.
3. Send a welcome email from a task after registration (mock the email client).
4. Start Flower and watch tasks succeed and fail.
5. Explain what happens to queued tasks if the worker is stopped and restarted.
