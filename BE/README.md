# Backend (BE)

| Folder | What's inside |
| --- | --- |
| [00-API-Design-and-Architecture/](00-API-Design-and-Architecture/) | **Shared, language-independent**: REST/GraphQL/gRPC API design, real-time (SSE/WebSockets) and file uploads, monolith vs microservices and messaging (Kafka/RabbitMQ, outbox, sagas), and **system design for interviews** |
| [FastAPI/](FastAPI/) | The Python backend track: Python from scratch, FastAPI, databases, PostgreSQL, Redis, Celery, Docker, CI/CD, migrations, seeding. Every topic has a `production.md` |
| [Node/](Node/) | The Node.js backend track: how Node works (V8, libuv, event loop), Express (and how it works internally), TypeScript, Prisma + PostgreSQL, Redis + BullMQ, Docker, CI/CD. Every topic has a `production.md` |

## Suggested order for the FastAPI track

1. [Python](FastAPI/01-Python/): the language, beginner to advanced (starts with how Python works internally)
2. [Database concepts](FastAPI/03-Database-Concepts/): SQL and relational design (you can do this in parallel with Python)
3. [FastAPI](FastAPI/02-FastAPI/): building APIs (starts with how FastAPI works internally)
4. [PostgreSQL](FastAPI/04-PostgreSQL/): the database used in the examples
5. [Migrations](FastAPI/09-Migrations/) and [Seeding](FastAPI/10-Seeding/): evolving and filling the database
6. [Redis](FastAPI/05-Redis/) and [Celery](FastAPI/06-Celery/): caching and background jobs
7. [Docker](FastAPI/07-Docker/) and [CI/CD](FastAPI/08-CI-CD/): packaging, testing and shipping
8. [API design and architecture](00-API-Design-and-Architecture/): the decisions above the framework
9. [Interview prep](FastAPI/11-Interview-Prep/): Q&A across the whole track

Every folder ends with a **production.md**: what to set up, secure, monitor and maintain when that piece runs in a real production environment.

## Suggested order for the Node track

See [Node/README.md](Node/README.md): Node fundamentals (starting with how Node works internally) → Express (starting with how Express works internally) → Prisma → Redis/BullMQ → Docker/CI-CD. Database concepts, PostgreSQL and Redis theory are shared with the FastAPI track.
