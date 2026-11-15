# Express

**Express** is the most widely used Node.js web framework: minimal, flexible and built around **middleware**. These lessons use **Express 5** (async errors are handled automatically) with TypeScript.

Prerequisites: [../01-Node-Fundamentals/](../01-Node-Fundamentals/) and HTTP basics ([../../FastAPI/02-FastAPI/01-intro-first-app.md](../../FastAPI/02-FastAPI/01-intro-first-app.md#1-what-is-an-api) explains HTTP/REST independently of the language).

| # | Lesson | You will learn |
| --- | --- | --- |
| 00 | [How Express works internally](00-how-express-works.md) | The app as a request handler, the middleware stack, `next()`, router layers and path matching, error middleware, how req/res are extended; Fastify and NestJS compared |
| 01 | [First API and routing](01-first-api-routing.md) | Setup with TypeScript, routes, params, query, body, status codes, Router, a full CRUD |
| 02 | [Middleware, validation and errors](02-middleware-validation-errors.md) | Built-in and third-party middleware, writing middleware, Zod validation, centralized error handling, 404s |
| 03 | [Authentication and security](03-auth-security.md) | Password hashing, JWT, auth middleware, roles and ownership, refresh tokens/cookies, Helmet, CORS, rate limiting |
| 04 | [Project structure, config and logging](04-structure-config-logging.md) | Layered architecture, dependency injection, config, pino logging with request IDs, graceful shutdown |
| 05 | [Testing](05-testing.md) | Vitest + Supertest, test database, factories, mocking, coverage |
| — | [**Production**](production.md) | Running behind a proxy, security hardening, performance, observability, deployment, maintenance |
