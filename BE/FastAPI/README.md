# FastAPI track

| # | Folder | Covers |
| --- | --- | --- |
| 01 | [Python](01-Python/) | Syntax, data structures, functions, OOP, modules and environments, errors and files, advanced features, type hints, async, testing |
| 02 | [FastAPI](02-FastAPI/) | First app, routing, Pydantic, responses and errors, dependency injection, SQLAlchemy, auth, project structure, background work, testing |
| 03 | [Database concepts](03-Database-Concepts/) | Relational model, SQL, joins, design and normalization, indexes, transactions, scaling, NoSQL |
| 04 | [PostgreSQL](04-PostgreSQL/) | psql, data types, constraints, advanced SQL (CTEs, window functions, JSONB), performance, security |
| 05 | [Redis](05-Redis/) | Data types, caching patterns, rate limiting, locks, pub/sub, streams |
| 06 | [Celery](06-Celery/) | Workers, brokers, tasks, retries, routing, scheduling with beat, workflows |
| 07 | [Docker](07-Docker/) | Images, containers, Dockerfiles for FastAPI, Compose for the full stack |
| 08 | [CI/CD](08-CI-CD/) | Pipelines, testing with services, building images, deploying |
| 09 | [Migrations](09-Migrations/) | Alembic, autogenerate, data migrations, zero-downtime changes |
| 10 | [Seeding](10-Seeding/) | Reference data vs test data, factories, Faker, idempotent seed scripts |
| 11 | [**Interview prep**](11-Interview-Prep/) | Q&A with answers: Python, async, FastAPI internals, SQLAlchemy, PostgreSQL, Redis, Celery, plus scenario questions |
| — | [API design & architecture](../00-API-Design-and-Architecture/) | *(shared)* REST/GraphQL/gRPC, real-time, microservices and messaging, system design |

Each folder has a **README** (reading order), numbered **lessons** with code, and a **production.md** covering setup, security, monitoring and maintenance in production.

## The example project

Most examples build pieces of the same app, a small **task management API**: users, projects and tasks, stored in PostgreSQL, cached in Redis, with Celery sending emails, all running in Docker. By the end you can put the pieces together into one deployable service.
