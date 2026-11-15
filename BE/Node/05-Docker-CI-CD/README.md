# Docker and CI/CD for Node

General concepts are shared with the FastAPI track: [Docker basics](../../FastAPI/07-Docker/01-basics.md), [Docker in production](../../FastAPI/07-Docker/production.md), [CI/CD concepts](../../FastAPI/08-CI-CD/01-concepts.md) and [CI/CD in production](../../FastAPI/08-CI-CD/production.md). This folder shows the Node-specific files.

| # | Lesson | You will learn |
| --- | --- | --- |
| 01 | [Docker for Node](01-docker-node.md) | A multi-stage Dockerfile for TypeScript + Prisma, .dockerignore, signals, Compose for API + worker + Postgres + Redis |
| 02 | [CI/CD for Node](02-ci-cd-node.md) | GitHub Actions and GitLab CI: lint, type-check, test with services, build and push images, migrate and deploy |
| — | [**Production**](production.md) | Image hardening for Node, runtime settings, deployment strategy, release checklist |
