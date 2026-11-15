# 02 · Middleware, validation and errors

## 1. What middleware is

> **In short:** Middleware are functions `(req, res, next)` that run in order for matching requests, used for parsing, logging, auth, validation and more.

Kinds of middleware:

| Kind | Example |
| --- | --- |
| Application-level | `app.use(express.json())` |
| Router-level | `tasksRouter.use(requireAuth)` |
| Route-level | `router.post('/', validate(schema), handler)` |
| Error-handling | `app.use((err, req, res, next) => …)` |
| Built-in | `express.json()`, `express.urlencoded()`, `express.static()` |
| Third-party | `cors`, `helmet`, `compression`, `express-rate-limit`, `pino-http`, `cookie-parser`, `multer` |

## 2. Built-in and common middleware

> **In short:** A typical app parses JSON with a size limit, adds security headers, CORS, compression and request logging.

```ts
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

app.disable('x-powered-by');
app.use(helmet());                                         // security headers
app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));                   // body size limit
app.use(express.urlencoded({ extended: false }));          // HTML form bodies
```

## 3. Writing your own middleware

> **In short:** Read or add data on `req`/`res.locals`, then call `next()`, or end the request early.

```ts
import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

// Request ID + timing
export const requestContext: RequestHandler = (req, res, next) => {
  req.requestId = req.get('x-request-id') ?? randomUUID();
  res.set('X-Request-Id', req.requestId);
  const start = performance.now();
  res.on('finish', () => {
    console.log(JSON.stringify({ id: req.requestId, method: req.method, path: req.originalUrl,
      status: res.statusCode, ms: Math.round(performance.now() - start) }));
  });
  next();
};

// Configurable middleware: a factory returning middleware
export const requireHeader = (name: string): RequestHandler => (req, res, next) => {
  if (!req.get(name)) return res.status(400).json({ error: `${name} header required` });
  next();
};
```

Rule: **respond or call `next()`**, never both, never neither.

## 4. Validation with Zod

> **In short:** Validate params, query and body against schemas in a reusable middleware, returning 422 with field-level errors when invalid.

```ts
// src/middleware/validate.ts
import type { RequestHandler } from 'express';
import { z, type ZodType } from 'zod';

type Schemas = { body?: ZodType; query?: ZodType; params?: ZodType };

export const validate = (schemas: Schemas): RequestHandler => (req, res, next) => {
  const errors: { location: string; path: string; message: string }[] = [];

  for (const key of ['params', 'query', 'body'] as const) {
    const schema = schemas[key];
    if (!schema) continue;
    const result = schema.safeParse(req[key]);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({ location: key, path: issue.path.join('.'), message: issue.message });
      }
    } else {
      res.locals[key] = result.data;      // parsed + coerced values (req.query is read-only in Express 5)
    }
  }

  if (errors.length) return res.status(422).json({ error: { code: 'validation_error', fields: errors } });
  next();
};
```

```ts
// src/schemas/task.schema.ts
export const createTaskBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: z.number().int().min(1).max(5).default(3),
  dueDate: z.coerce.date().optional(),
});

export const listTasksQuery = z.object({
  done: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParams = z.object({ id: z.string().uuid() });
export type CreateTaskBody = z.infer<typeof createTaskBody>;
```

```ts
// usage
tasksRouter.post('/', validate({ body: createTaskBody }), async (req, res) => {
  const input = res.locals.body as CreateTaskBody;
  res.status(201).json(await taskService.create(req.user!.id, input));
});

tasksRouter.get('/', validate({ query: listTasksQuery }), async (req, res) => {
  res.json(await taskService.list(req.user!.id, res.locals.query));
});
```

Zod strips unknown keys by default (`.strict()` rejects them), which also prevents clients setting fields like `role` or `ownerId` that they shouldn't (mass assignment).

## 5. Centralized error handling

> **In short:** Throw typed errors from anywhere, and translate them into consistent JSON responses in one error-handling middleware at the end of the stack.

```ts
// src/errors.ts
export class AppError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, message: string, code = 'app_error') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') { super(404, `${resource} not found`, 'not_found'); }
}
export class ConflictError extends AppError {
  constructor(message: string) { super(409, message, 'conflict'); }
}
export class ForbiddenError extends AppError {
  constructor() { super(403, 'Forbidden', 'forbidden'); }
}
```

```ts
// src/middleware/error-handler.ts
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors.js';

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'route_not_found', message: `No route for ${req.method} ${req.path}` } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  }
  if (err.type === 'entity.parse.failed') {                 // invalid JSON body from express.json()
    return res.status(400).json({ error: { code: 'invalid_json', message: 'Malformed JSON' } });
  }
  req.log?.error({ err }, 'unhandled error');               // pino-http logger (lesson 04)
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } });
};
```

```ts
// src/app.ts (order matters)
app.use('/api/v1', apiRouter);
app.use(notFound);        // after all routes
app.use(errorHandler);    // last
```

- Never send stack traces or internal messages to clients in production.
- If headers were already sent (e.g. an error during streaming), delegate to Express's default handler: `if (res.headersSent) return _next(err);`.
- Map database errors (unique violation → 409, not found → 404) in the service layer or the error handler.

## 6. File uploads

> **In short:** `multer` parses multipart form data; limit file size and type, and prefer streaming large files to object storage.

```ts
import multer from 'multer';
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 }, storage: multer.memoryStorage() });

router.post('/avatar', upload.single('file'), async (req, res) => {
  if (!req.file || !['image/png', 'image/jpeg'].includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'PNG or JPEG required' });
  }
  const url = await storage.upload(req.file.buffer, req.file.mimetype);
  res.status(201).json({ url });
});
```

Don't trust the client's filename or MIME type; for large files use presigned S3 URLs so uploads bypass your server.

## 7. Serving static files

> **In short:** `express.static` serves a folder; in production prefer a CDN or Nginx for static assets.

```ts
app.use('/static', express.static('public', { maxAge: '1d' }));
```

---

## 8. Exercises

1. Write request-ID and timing middleware and log one JSON line per request.
2. Build the `validate` middleware and apply it to create, list and get-by-ID routes.
3. Add `AppError` classes and the central error handler; make a service throw `NotFoundError`.
4. Send malformed JSON and return a clean 400 instead of the default HTML error page.
5. Add an avatar upload endpoint limited to 2 MB images.
