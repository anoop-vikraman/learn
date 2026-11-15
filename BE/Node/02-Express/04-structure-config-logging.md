# 04 · Project structure, config and logging

## 1. A layered project layout

> **In short:** Separate routes (HTTP), controllers (request/response), services (business logic) and data access, so each piece is small and testable.

```
task-api/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  src/
    server.ts               # start HTTP server, graceful shutdown
    app.ts                  # create Express app: middleware, routes, error handler
    config.ts               # validated env config (Zod)
    lib/
      logger.ts             # pino
      prisma.ts             # Prisma client singleton
      redis.ts
      jwt.ts, password.ts
    middleware/
      auth.ts, validate.ts, error-handler.ts, request-context.ts
    modules/                # feature folders
      tasks/
        tasks.routes.ts
        tasks.controller.ts
        tasks.service.ts
        tasks.repository.ts   (optional)
        tasks.schema.ts       # Zod schemas + types
      users/
      auth/
    jobs/                   # BullMQ queues and workers
    types/express.d.ts
  tests/
  Dockerfile
  compose.yaml
```

| Layer | Responsibility | Must not |
| --- | --- | --- |
| Routes | Map URL + method to middleware and controller | Contain logic |
| Controller | Read validated input, call a service, send the response | Run SQL or business rules |
| Service | Business rules, transactions, orchestration | Know about `req`/`res` |
| Repository / Prisma | Queries | Make business decisions |

```ts
// tasks.controller.ts
export const create: RequestHandler = async (req, res) => {
  const task = await tasksService.create(req.user!.id, res.locals.body);
  res.status(201).json(task);
};

// tasks.service.ts
export async function create(ownerId: string, input: CreateTaskBody) {
  const count = await prisma.task.count({ where: { ownerId, done: false } });
  if (count >= 500) throw new AppError(422, 'Too many open tasks', 'limit_reached');
  return prisma.task.create({ data: { ...input, ownerId } });
}
```

## 2. Dependency injection (keeping things swappable)

> **In short:** Pass dependencies (DB client, email sender) into services instead of importing globals everywhere, so tests can supply fakes.

```ts
// A simple factory-based approach: no framework needed
export function createTasksService(deps: { prisma: PrismaClient; queue: Queue }) {
  return {
    async create(ownerId: string, input: CreateTaskBody) {
      const task = await deps.prisma.task.create({ data: { ...input, ownerId } });
      await deps.queue.add('task-created', { taskId: task.id });
      return task;
    },
  };
}

// composition root (app.ts)
const tasksService = createTasksService({ prisma, queue: emailQueue });
app.use('/api/v1/tasks', requireAuth, createTasksRouter(tasksService));
```

Containers like `awilix` or `tsyringe` (or NestJS's built-in DI) automate this for bigger apps.

## 3. Configuration

> **In short:** Validate all environment variables once at startup with Zod, export a typed `config` object, and import it instead of reading `process.env` everywhere.

See the full example in [../01-Node-Fundamentals/04-typescript-for-node.md](../01-Node-Fundamentals/04-typescript-for-node.md#6-runtime-validation-with-zod). Rules:
- The app refuses to start with missing or invalid config.
- `.env` for local development only; real environments inject variables.
- Commit `.env.example` with every variable documented.

## 4. Logging with pino

> **In short:** pino writes fast JSON logs; `pino-http` logs every request with a request ID, and child loggers carry context automatically.

```bash
npm install pino pino-http && npm install -D pino-pretty
```

```ts
// src/lib/logger.ts
import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],   // never log secrets
  transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,   // pretty only locally
});
```

```ts
// src/app.ts
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';

app.use(pinoHttp({
  logger,
  genReqId: (req, res) => {
    const id = (req.headers['x-request-id'] as string) ?? randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
}));

// in handlers/services: req.log includes the request ID automatically
req.log.info({ taskId }, 'task created');
```

For logs deep inside services (where `req` isn't available), store the request logger in `AsyncLocalStorage`.

## 5. The server file and graceful shutdown

> **In short:** `server.ts` starts listening, sets timeouts, and closes the server and connections cleanly on SIGTERM.

```ts
// src/server.ts
import { app } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';

const server = app.listen(config.PORT, () => logger.info(`listening on ${config.PORT}`));
server.keepAliveTimeout = 65_000;         // longer than the load balancer's idle timeout
server.headersTimeout = 66_000;
server.requestTimeout = 30_000;

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  setTimeout(() => process.exit(1), 20_000).unref();
  server.close(async () => {
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => { logger.fatal({ err }, 'unhandled rejection'); process.exit(1); });
```

## 6. Health endpoints

> **In short:** A cheap liveness endpoint and a readiness endpoint that checks dependencies.

```ts
app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/health/ready', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  res.json({ status: 'ready' });
});
```

## 7. API documentation

> **In short:** Generate an OpenAPI document (for example from Zod schemas) and serve Swagger UI, so the frontend has an accurate contract.

Options: `zod-openapi` / `@asteasolutions/zod-to-openapi` (generate from Zod), `swagger-ui-express` (serve the UI), or a schema-first framework (Fastify, NestJS) that generates docs automatically. Generate TypeScript clients for the frontend from the spec (`openapi-typescript`).

## 8. Conventions

> **In short:** Consistent versioning, error shape, pagination and naming make the API easy to consume.

- Prefix routes with `/api/v1`.
- One error format: `{ "error": { "code", "message", "fields"? } }`.
- Pagination: `{ items, total, page, size }` or cursor-based `{ items, nextCursor }`.
- camelCase JSON, ISO 8601 UTC dates, UUID IDs.

---

## 9. Exercises

1. Restructure the task API into `modules/tasks` with routes, controller, service and schema files.
2. Convert the tasks service into a factory that receives `prisma` and test it with a fake.
3. Add pino + pino-http with request IDs and redaction; confirm the Authorization header is hidden.
4. Implement graceful shutdown and test it by sending SIGTERM during a slow request.
5. Add `/health/live` and `/health/ready`.
