# Node.js backend track

Learn to build production backends with **Node.js**, **Express**, **TypeScript**, **PostgreSQL (Prisma)**, **Redis**, **BullMQ**, **Docker** and **CI/CD**, from zero.

**Prerequisite:** JavaScript basics ([../../FE/01-JavaScript/basics/](../../FE/01-JavaScript/basics/)), especially functions, objects, arrays, promises and `async`/`await`, and modules. TypeScript basics help ([../../FE/03-TypeScript/basics/](../../FE/03-TypeScript/basics/)).

| # | Folder | Covers |
| --- | --- | --- |
| 01 | [Node fundamentals](01-Node-Fundamentals/) | **How Node works (V8, libuv, event loop)**, setup, modules and npm, async patterns, events, streams, core modules, TypeScript for Node |
| 02 | [Express](02-Express/) | **How Express works internally**, routing, middleware, validation, errors, auth and security, project structure, logging, testing |
| 03 | [Database with Prisma](03-Database-Prisma/) | Prisma schema and client, CRUD, relations, transactions, migrations, seeding |
| 04 | [Redis and BullMQ](04-Redis-BullMQ/) | Caching with ioredis, rate limiting, sessions, background jobs and scheduled jobs with BullMQ |
| 05 | [Docker and CI/CD](05-Docker-CI-CD/) | Dockerfile for Node, Compose for the full stack, GitHub Actions/GitLab pipelines |
| 06 | [**Interview prep**](06-Interview-Prep/) | Q&A with answers: event loop, Express internals, security, Prisma, BullMQ, deployment, scenarios |

Each folder has a README, numbered lessons with an **In short** summary under every subtopic, and a **production.md**.

## Shared, language-independent topics

These apply to Node exactly as they do to Python, so they live in the FastAPI track:

- [Database concepts](../FastAPI/03-Database-Concepts/): SQL, design, indexes, transactions, scaling
- [PostgreSQL](../FastAPI/04-PostgreSQL/): PostgreSQL features, performance and production
- [Redis concepts and production](../FastAPI/05-Redis/): data types, caching patterns, production setup
- [Docker concepts](../FastAPI/07-Docker/01-basics.md) and [CI/CD concepts](../FastAPI/08-CI-CD/01-concepts.md)
- [Zero-downtime migration patterns](../FastAPI/09-Migrations/production.md)
- [API design and architecture](../00-API-Design-and-Architecture/): REST/GraphQL/gRPC, real-time, messaging, **system design**

## Suggested order

1. Node fundamentals 00 → 04
2. Database concepts 01–03 (shared) in parallel
3. Express 00 → 05
4. Prisma, then PostgreSQL (shared)
5. Redis and BullMQ
6. Docker and CI/CD
7. [API design and architecture](../00-API-Design-and-Architecture/) (shared)
8. Read every `production.md` before shipping anything real, then [interview prep](06-Interview-Prep/)

## The example project

As in the FastAPI track, the lessons build a **task management API** (users, projects, tasks), so you can compare both stacks side by side.
