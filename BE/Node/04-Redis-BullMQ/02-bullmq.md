# 02 · Background jobs with BullMQ

## 1. Why background jobs

> **In short:** Slow, unreliable or scheduled work (emails, reports, image processing, third-party calls) runs in separate worker processes with retries, instead of inside the HTTP request.

The reasons are the same as for Celery in Python: see [../../FastAPI/06-Celery/01-basics.md](../../FastAPI/06-Celery/01-basics.md#1-why-a-task-queue). In Node, an extra reason is that CPU-heavy jobs would **block the event loop** of your API.

## 2. How BullMQ works

> **In short:** A queue is a set of Redis data structures; producers add jobs, workers atomically move them through states (waiting → active → completed/failed) using Lua scripts.

```
API (producer) ── queue.add() ──▶ Redis: waiting list ──▶ Worker process(es)
                                   delayed (sorted set)        │ processes job
                                   active / completed / failed ◀┘ (retries on failure)
```

| State | Meaning |
| --- | --- |
| `waiting` | Ready to be processed |
| `delayed` | Scheduled for later (or waiting for a retry backoff) |
| `active` | Being processed by a worker (holding a lock) |
| `completed` / `failed` | Finished (kept or removed based on options) |
| `waiting-children` | A parent waiting for child jobs (flows) |

- Workers hold a **lock** on active jobs and renew it; if a worker dies, the lock expires and the job is detected as **stalled** and retried.
- Delivery is **at least once**, so jobs must be **idempotent**.

## 3. Setup

> **In short:** Install BullMQ, give queues and workers their own Redis connection (with `maxRetriesPerRequest: null` for workers).

```bash
npm install bullmq ioredis
```

```ts
// src/jobs/connection.ts
import { Redis } from 'ioredis';
import { config } from '../config.js';

export const createConnection = () =>
  new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });   // required by BullMQ workers
```

## 4. Defining a queue and adding jobs

> **In short:** Create a `Queue` by name and call `add(name, data, options)`; pass IDs, not whole objects.

```ts
// src/jobs/queues.ts
import { Queue } from 'bullmq';
import { createConnection } from './connection.js';

export type EmailJob =
  | { type: 'welcome'; userId: string }
  | { type: 'task-assigned'; taskId: string; assigneeId: string };

export const emailQueue = new Queue<EmailJob>('emails', {
  connection: createConnection(),
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2_000 },     // 2 s, 4 s, 8 s, 16 s…
    removeOnComplete: { age: 24 * 3600, count: 1000 },  // keep Redis memory bounded
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});
```

```ts
// in the register route, AFTER the user is saved
await emailQueue.add('welcome', { type: 'welcome', userId: user.id });

// options
await emailQueue.add('reminder', data, { delay: 60 * 60_000 });          // run in 1 hour
await emailQueue.add('invoice', data, { jobId: `invoice:${invoiceId}` }); // dedupe: same jobId isn't added twice
await reportQueue.add('monthly', data, { priority: 10 });                 // lower number = higher priority
```

## 5. Workers

> **In short:** A `Worker` consumes a queue and runs your processor function; throwing marks the attempt failed and triggers a retry.

```ts
// src/jobs/email.worker.ts
import { Worker, UnrecoverableError } from 'bullmq';
import type { EmailJob } from './queues.js';

export const emailWorker = new Worker<EmailJob>(
  'emails',
  async (job) => {
    job.log(`attempt ${job.attemptsMade + 1}`);
    switch (job.data.type) {
      case 'welcome': {
        const user = await prisma.user.findUnique({ where: { id: job.data.userId } });
        if (!user) throw new UnrecoverableError('User no longer exists');   // don't retry
        if (user.welcomeEmailSentAt) return;                                // idempotent: already done
        await mailer.send({ to: user.email, template: 'welcome' });
        await prisma.user.update({ where: { id: user.id }, data: { welcomeEmailSentAt: new Date() } });
        return { sent: true };                                              // stored as the job's return value
      }
      case 'task-assigned':
        // ...
        return;
    }
  },
  {
    connection: createConnection(),
    concurrency: 10,                 // jobs processed in parallel by this worker (async I/O)
    limiter: { max: 50, duration: 1_000 },   // at most 50 jobs/second across this queue
  },
);

emailWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'email job failed'));
```

Run workers as a **separate process** from the API:

```json
"scripts": {
  "worker": "node dist/jobs/worker.js",
  "dev:worker": "tsx watch --env-file=.env src/jobs/worker.ts"
}
```

```ts
// src/jobs/worker.ts: entry point that starts all workers and handles shutdown
import { emailWorker } from './email.worker.js';
import { reportWorker } from './report.worker.js';

const workers = [emailWorker, reportWorker];
async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));   // waits for active jobs to finish
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

### CPU-heavy jobs: sandboxed processors

> **In short:** Point the worker at a processor file to run jobs in separate child processes or threads, so CPU work doesn't block other jobs.

```ts
new Worker('images', new URL('./resize.processor.js', import.meta.url), {
  connection: createConnection(), concurrency: 4, useWorkerThreads: true,
});
```

## 6. Retries, backoff and failures

> **In short:** Configure attempts and exponential backoff; throw `UnrecoverableError` for permanent failures; inspect and retry failed jobs.

- Retry only transient errors (timeouts, 5xx, rate limits). For permanent problems (invalid data, deleted record) throw `UnrecoverableError`.
- Set timeouts on network calls inside jobs (`AbortSignal.timeout`).
- Failed jobs stay in the `failed` set (until `removeOnFail` cleans them): inspect `job.failedReason` and `job.stacktrace`, fix the bug, then `job.retry()`.

## 7. Scheduled (repeatable) jobs

> **In short:** Job schedulers create jobs on a cron pattern or fixed interval; only one job per schedule is created even with many workers.

```ts
await maintenanceQueue.upsertJobScheduler(
  'cleanup-expired-sessions',            // scheduler ID: upsert is idempotent across deploys
  { pattern: '0 */15 * * * *' },         // every 15 minutes (cron with seconds)
  { name: 'cleanup', data: {} },
);

await reportQueue.upsertJobScheduler('daily-summary', { pattern: '0 30 3 * * *', tz: 'UTC' }, { name: 'daily-summary' });
await maintenanceQueue.removeJobScheduler('old-schedule');
```

Unlike Celery beat, there's no separate scheduler process: Redis coordinates it.

## 8. Flows: parent and child jobs

> **In short:** A flow runs child jobs (in parallel) before their parent, which can then read all child results.

```ts
import { FlowProducer } from 'bullmq';

const flow = new FlowProducer({ connection: createConnection() });
await flow.add({
  name: 'merge-report',
  queueName: 'reports',
  data: { reportId },
  children: Array.from({ length: 10 }, (_, i) => ({ name: 'chunk', queueName: 'reports', data: { reportId, chunk: i } })),
});

// in the parent processor
const childResults = await job.getChildrenValues();
```

## 9. Progress, events and status for the frontend

> **In short:** Workers report progress; the API returns a job ID with 202 and the client polls status (or receives updates via WebSocket/SSE).

```ts
// worker
await job.updateProgress(40);

// API
router.post('/reports', async (req, res) => {
  const report = await prisma.report.create({ data: { ownerId: req.user!.id, status: 'queued' } });
  await reportQueue.add('generate', { reportId: report.id }, { jobId: report.id });
  res.status(202).json({ reportId: report.id, status: 'queued' });
});

router.get('/reports/:id', async (req, res) => {
  const report = await prisma.report.findFirstOrThrow({ where: { id: req.params.id, ownerId: req.user!.id } });
  const job = await reportQueue.getJob(report.id);
  res.json({ status: report.status, progress: job?.progress ?? null, url: report.fileUrl });
});
```

Store important outcomes (status, file URL, error) in **your database**; job records are cleaned up from Redis.

`QueueEvents` lets a process listen to `completed`/`failed`/`progress` events for all jobs (e.g. to push WebSocket updates).

## 10. Dashboard

> **In short:** Bull Board gives a web UI to inspect queues, jobs, failures and retries; protect it behind admin auth.

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({ queues: [new BullMQAdapter(emailQueue), new BullMQAdapter(reportQueue)], serverAdapter });
app.use('/admin/queues', requireAuth, requireRole('admin'), serverAdapter.getRouter());
```

## 11. Testing jobs

> **In short:** Unit-test processor functions directly, and assert in API tests that a job was enqueued.

```ts
// export the processor separately so it can be called without Redis
export async function processEmail(job: Pick<Job<EmailJob>, 'data' | 'attemptsMade' | 'log'>) { /* ... */ }

it('sends the welcome email once', async () => {
  await processEmail({ data: { type: 'welcome', userId }, attemptsMade: 0, log: async () => 0 } as never);
  await processEmail({ data: { type: 'welcome', userId }, attemptsMade: 0, log: async () => 0 } as never);
  expect(mailer.send).toHaveBeenCalledTimes(1);
});

// API test
vi.spyOn(emailQueue, 'add').mockResolvedValue({} as never);
```

---

## 12. Exercises

1. Create an `emails` queue and worker; enqueue a welcome email after registration.
2. Make the job idempotent and test calling it twice.
3. Add exponential retries and an `UnrecoverableError` case; watch retries in Bull Board.
4. Add a scheduler that runs a cleanup job every 15 minutes.
5. Build `POST /reports` (202) and `GET /reports/:id` with progress updates.
