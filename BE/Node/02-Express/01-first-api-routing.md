# 01 · First API and routing

## 1. Project setup

> **In short:** Create a TypeScript project with Express 5, its types, and tsx for development.

```bash
mkdir task-api && cd task-api
npm init -y
npm pkg set type=module
npm install express
npm install -D typescript tsx @types/node @types/express
npx tsc --init     # then apply the tsconfig from ../01-Node-Fundamentals/04-typescript-for-node.md
```

```json
"scripts": {
  "dev": "tsx watch --env-file=.env src/server.ts",
  "build": "tsc",
  "start": "node dist/server.js"
}
```

## 2. Hello Express

> **In short:** Create the app, add a route, and start listening; keep the app and the server start in separate files for testability.

```ts
// src/app.ts
import express from 'express';

export const app = express();
app.use(express.json());                 // parse JSON bodies into req.body

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
```

```ts
// src/server.ts
import { app } from './app.js';

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`API on http://localhost:${port}`));
```

```bash
npm run dev
curl localhost:3000/health
```

Separating `app` (configuration) from `server` (listening) lets tests import the app without opening a port.

## 3. Routes

> **In short:** A route is an HTTP method + path + handler; the handler reads `req` and sends a response with `res`.

```ts
app.get('/tasks', handler);       // read a list
app.post('/tasks', handler);      // create
app.get('/tasks/:id', handler);   // read one
app.patch('/tasks/:id', handler); // partial update
app.put('/tasks/:id', handler);   // replace
app.delete('/tasks/:id', handler);// delete
app.all('/legacy', handler);      // any method
```

HTTP methods, status codes and REST naming are explained in [../../FastAPI/02-FastAPI/01-intro-first-app.md](../../FastAPI/02-FastAPI/01-intro-first-app.md#1-what-is-an-api); they're the same in every framework.

## 4. Reading input: params, query, body, headers

> **In short:** Path parameters are in `req.params`, the query string in `req.query`, the JSON body in `req.body`, headers via `req.get()`; all are untrusted strings or unknown data until validated.

```ts
// GET /projects/7/tasks?done=true&page=2
app.get('/projects/:projectId/tasks', (req, res) => {
  const { projectId } = req.params;           // '7' (string!)
  const done = req.query.done === 'true';     // query values are strings (or arrays)
  const page = Number(req.query.page ?? 1);
  const userAgent = req.get('user-agent');
  res.json({ projectId, done, page, userAgent });
});

// POST /tasks  { "title": "Write docs" }
app.post('/tasks', (req, res) => {
  const { title } = req.body;                 // requires express.json()
  res.status(201).json({ title });
});
```

⚠️ Everything from the request must be **validated** before use (lesson 02 uses Zod for this).

## 5. Sending responses

> **In short:** Set the status, then send JSON, text, a file, a redirect or nothing; send exactly one response per request.

```ts
res.json({ id: 1 });                          // 200 + JSON
res.status(201).json(task);                   // created
res.status(204).end();                        // no content
res.status(404).json({ error: 'Task not found' });
res.redirect(301, '/new-path');
res.sendFile(path.resolve('reports/a.pdf'));
res.set('Cache-Control', 'no-store').json(data);
res.cookie('sid', token, { httpOnly: true, secure: true, sameSite: 'lax' });
```

Use `return res.json(...)` in early exits so the rest of the handler doesn't run.

## 6. A complete in-memory CRUD

> **In short:** A full task API with list (with filtering), get, create, update and delete, before adding a database.

```ts
// src/app.ts
import express from 'express';
import { randomUUID } from 'node:crypto';

interface Task { id: string; title: string; done: boolean; createdAt: string }

const tasks = new Map<string, Task>();
export const app = express();
app.use(express.json());

app.get('/tasks', (req, res) => {
  let list = [...tasks.values()];
  if (req.query.done !== undefined) list = list.filter((t) => t.done === (req.query.done === 'true'));
  res.json(list);
});

app.get('/tasks/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

app.post('/tasks', (req, res) => {
  const title = String(req.body?.title ?? '').trim();
  if (!title) return res.status(422).json({ error: 'title is required' });
  const task: Task = { id: randomUUID(), title, done: false, createdAt: new Date().toISOString() };
  tasks.set(task.id, task);
  res.status(201).location(`/tasks/${task.id}`).json(task);
});

app.patch('/tasks/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (typeof req.body.title === 'string') task.title = req.body.title.trim();
  if (typeof req.body.done === 'boolean') task.done = req.body.done;
  res.json(task);
});

app.delete('/tasks/:id', (req, res) => {
  if (!tasks.delete(req.params.id)) return res.status(404).json({ error: 'Task not found' });
  res.status(204).end();
});
```

## 7. Organizing routes with `Router`

> **In short:** Put each resource's routes in its own Router module and mount it on a prefix.

```ts
// src/routes/tasks.routes.ts
import { Router } from 'express';
import * as controller from '../controllers/tasks.controller.js';

export const tasksRouter = Router();
tasksRouter.get('/', controller.list);
tasksRouter.post('/', controller.create);
tasksRouter.get('/:id', controller.getById);
tasksRouter.patch('/:id', controller.update);
tasksRouter.delete('/:id', controller.remove);

// src/routes/index.ts
import { Router } from 'express';
export const apiRouter = Router();
apiRouter.use('/tasks', tasksRouter);
apiRouter.use('/projects', projectsRouter);

// src/app.ts
app.use('/api/v1', apiRouter);
```

Routers can have their own middleware: `tasksRouter.use(requireAuth)` protects every task route.

## 8. Route order and parameters

> **In short:** Routes are matched in registration order, so specific routes must come before parameterized ones.

```ts
router.get('/stats', statsHandler);   // ✅ before /:id
router.get('/:id', getById);          // otherwise "stats" would be treated as an id
```

## 9. Async handlers in Express 5

> **In short:** In Express 5 you can write `async` handlers and simply throw; rejected promises are passed to the error handler automatically.

```ts
router.get('/:id', async (req, res) => {
  const task = await taskService.getById(req.params.id);   // throws NotFoundError if missing
  res.json(task);
});
```

(With Express 4 you'd need `try/catch` and `next(err)` in every async handler.)

---

## 10. Exercises

1. Build the in-memory CRUD and test every route with curl or a REST client (VS Code REST Client, Bruno, Postman).
2. Move task routes into a `Router` mounted at `/api/v1/tasks`.
3. Add `GET /api/v1/tasks/stats` returning total and done counts (mind the route order).
4. Add pagination with `page` and `size` query parameters (convert and bound them).
5. Return a `Location` header on create and `204` on delete.
