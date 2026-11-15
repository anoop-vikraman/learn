# 00 · How Express works internally

## 1. Express in one sentence

> **In short:** An Express app is a function `(req, res)` handed to Node's `http` server; inside, it runs your request through an ordered list of middleware and routes until one sends a response.

```js
import http from 'node:http';
import express from 'express';

const app = express();
app.get('/', (req, res) => res.send('hi'));

// app.listen(3000) is literally:
http.createServer(app).listen(3000);
```

Express doesn't replace Node's HTTP machinery: Node parses the HTTP request, and Express adds **routing**, **middleware**, and convenience methods on `req`/`res`.

```
Node http server ──('request' event)──▶ app(req, res)
                                          │
                                          ▼
                    ┌────────────── the stack (in registration order) ──────────────┐
                    │ express.json() → cors() → logger → router(/api/tasks) → 404 → error handler │
                    └────────────────────────────────────────────────────────────────┘
```

## 2. The stack of layers

> **In short:** Every `app.use()` and `app.get()` call appends a "layer" (path pattern + handler) to an array; requests walk that array from top to bottom.

```js
app.use(express.json());                       // layer 1: matches every path
app.use('/api', apiRateLimit);                 // layer 2: paths starting with /api
app.get('/health', healthHandler);             // layer 3: GET /health exactly
app.use('/api/tasks', tasksRouter);            // layer 4: a whole sub-router
app.use(notFound);                             // layer 5
app.use(errorHandler);                         // layer 6: (err, req, res, next)
```

Internally, a **Router** holds an array of `Layer` objects. Each layer has:
- a **path matcher** (compiled from the path string, e.g. `/tasks/:id`, using `path-to-regexp`),
- a **handler** (middleware function, route, or nested router),
- for routes, the allowed **HTTP methods**.

**Order matters**: the first layer that sends a response ends the request. A middleware registered after the routes never runs for those routes; a catch-all route registered first would swallow everything.

## 3. `next()`: passing control

> **In short:** Each middleware either ends the request by sending a response or calls `next()` to hand it to the next matching layer.

```js
app.use((req, res, next) => {
  req.startTime = Date.now();      // add data for later layers
  next();                          // continue down the stack
});

app.use((req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Unauthorized' });   // stop here: no next()
  }
  next();
});
```

What the router does, simplified:

```js
function handle(req, res, done) {
  let index = 0;
  function next(err) {
    const layer = stack[index++];
    if (!layer) return done(err);                    // end of stack → default 404/500 handler
    if (!layer.matches(req.path, req.method)) return next(err);
    if (err) {
      // only error handlers (4 arguments) receive errors
      return layer.handler.length === 4 ? layer.handler(err, req, res, next) : next(err);
    }
    if (layer.handler.length === 4) return next();   // skip error handlers when there's no error
    layer.handler(req, res, next);                   // Express 5 also catches a returned rejected promise → next(err)
  }
  next();
}
```

Key consequences:
- Calling **neither** `next()` nor sending a response leaves the request **hanging** until the client times out.
- Calling `next()` **after** sending a response causes "Cannot set headers after they are sent".
- `next('route')` skips the remaining handlers of the current route; `next('router')` exits the current router.

## 4. Error handling internals

> **In short:** Calling `next(err)`, throwing synchronously, or (in Express 5) a rejected promise makes Express skip normal middleware and jump to the next error handler, recognised by its four parameters.

```js
app.get('/tasks/:id', async (req, res) => {
  const task = await taskService.get(req.params.id);   // if this rejects, Express 5 calls next(err)
  res.json(task);
});

app.use((err, req, res, next) => {                     // 4 arguments → error handler
  res.status(err.statusCode ?? 500).json({ error: err.message });
});
```

- Express checks `handler.length === 4` (the function's declared parameter count) to recognize error handlers. Don't remove the unused `next` parameter, or it stops being an error handler.
- **Express 4** did *not* catch rejected promises from async handlers; you needed `try/catch` + `next(err)` or `express-async-errors`. **Express 5** handles them automatically.
- If no error handler exists, Express's final handler sends a 500 (with the stack trace only when `NODE_ENV` isn't `production`).

## 5. Routing and path matching

> **In short:** Path strings are compiled into matchers that extract named parameters into `req.params`; routers can be nested and mounted on prefixes.

```js
const router = express.Router();
router.get('/:id', handler);          // matches /123, req.params.id = '123'
app.use('/api/tasks', router);        // the router sees paths relative to /api/tasks
```

- When a router is **mounted** at `/api/tasks`, Express strips that prefix from `req.url` inside the router (the original is in `req.originalUrl`, the mount path in `req.baseUrl`).
- `app.route('/tasks').get(...).post(...)` groups methods on one path.
- Express 5 uses a newer `path-to-regexp`: wildcards must be named (`/*splat` instead of `*`), and optional segments use braces (`/:file{.:ext}`).
- Route lookup is a linear scan of layers. That's fast for typical apps (hundreds of routes); Fastify uses a radix tree for faster matching in huge route tables.

## 6. How `req` and `res` get their extra powers

> **In short:** Express sets the prototypes of Node's `IncomingMessage` and `ServerResponse` objects to its own, adding helpers like `req.query`, `res.json()` and `res.status()`.

| Added by Express | What it does |
| --- | --- |
| `req.params`, `req.query` | Route parameters and parsed query string |
| `req.body` | **Only after** a body-parsing middleware (`express.json()`) has run |
| `req.get('header')`, `req.ip`, `req.hostname`, `req.protocol` | Convenience (IP/protocol respect `trust proxy`) |
| `res.status(code)` | Sets the status (chainable) |
| `res.json(obj)` | `JSON.stringify` + `Content-Type: application/json` + send |
| `res.send(x)`, `res.sendStatus(204)`, `res.redirect(url)`, `res.sendFile(path)`, `res.cookie()`, `res.set()` | Common responses |
| `res.locals` | Per-request storage shared between middleware and handlers |

Underneath, they're still Node streams: `req` is readable (the body), `res` is writable.

### Body parsing

> **In short:** Express doesn't read the request body by default; `express.json()` reads the stream, parses JSON (with a size limit) and sets `req.body`.

That's why `req.body` is `undefined` if you forget `app.use(express.json())`, and why body size limits (default 100 kB) live there.

## 7. The life of a request

> **In short:** Node parses HTTP → Express initializes req/res → layers run in order → a handler responds → (or an error handler responds) → the final handler sends 404/500 if nothing did.

```
1. Socket data → llhttp parser → 'request' event → app(req, res)
2. Express sets up req/res prototypes, parses the query string
3. Router walks the stack:
     express.json()  → reads + parses body → next()
     cors()          → adds headers → next()
     logger          → records start time → next()
     /api/tasks router → matches GET /:id → auth middleware → handler
4. Handler awaits the database, then res.json(task)
5. Response headers + body written to the socket; logger's 'finish' listener logs the duration
   (If anything threw → error handler → res.status(500).json(...))
```

## 8. Settings and the `app` object

> **In short:** `app.set()` configures behaviour such as proxy trust and JSON formatting; `app.locals` holds app-wide values.

```js
app.set('trust proxy', 1);        // behind one proxy/load balancer: use X-Forwarded-For for req.ip
app.disable('x-powered-by');      // don't advertise Express
app.set('json spaces', 0);
```

## 9. Express vs Fastify vs NestJS

> **In short:** Express is minimal and universal; Fastify is faster with built-in schema validation; NestJS is an opinionated, Angular-style framework often built on top of Express.

| | Express | Fastify | NestJS |
| --- | --- | --- | --- |
| Style | Minimal, middleware-based | Plugins + hooks, schema-first | Modules, controllers, providers, decorators, DI |
| Performance | Good | Very high (radix router, compiled JSON serialization) | Depends on the underlying adapter (Express or Fastify) |
| Validation | Bring your own (Zod) | JSON Schema built in (Zod/TypeBox via type providers) | `class-validator` / pipes |
| Learning curve | Lowest | Low | Higher |
| Ecosystem | Largest | Large | Large, enterprise-oriented |
| Closest to FastAPI | — | Schema-driven validation + serialization | DI, decorators, generated OpenAPI |

The concepts in this folder (middleware, validation, error handling, layering, auth) transfer directly to the others.

## 10. Mental model in one paragraph

> **In short:** A summary of the whole chapter.

Express is a function plugged into Node's HTTP server. It keeps an ordered list of layers (middleware, routes, sub-routers), each with a path matcher. For every request it walks the list, running matching layers; each one either responds or calls `next()`. Errors (thrown, passed to `next(err)`, or rejected promises in Express 5) jump to handlers with four parameters. Helpers like `req.body`, `req.params` and `res.json` are conveniences layered over Node's raw request and response streams.

---

## 11. Exercises

1. Write a 15-line "mini Express": an array of `(req, res, next)` functions and a `next` that walks them, plugged into `http.createServer`.
2. Register a logging middleware after your routes and observe it never runs for them; move it and compare.
3. Forget to call `next()` in a middleware and watch the request hang; then call `next()` after `res.json()` and read the error.
4. Throw inside an async handler with Express 5 and see the error handler catch it.
5. Mount a router at `/api/tasks` and log `req.url`, `req.baseUrl` and `req.originalUrl` inside it.
