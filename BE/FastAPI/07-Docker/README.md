# Docker for the FastAPI stack

Docker packages your app and everything it needs (Python, libraries, system packages) into an **image** that runs the same way on your laptop, in CI and in production. This folder focuses on the backend stack: FastAPI, PostgreSQL, Redis and Celery.

(The frontend-focused Docker notes are in [../../../FE/11-Docker/](../../../FE/11-Docker/).)

| # | Lesson | Level | You will learn |
| --- | --- | --- | --- |
| 01 | [Docker basics](01-basics.md) | Beginner | Images, containers, registries, volumes, networks, essential commands |
| 02 | [Dockerfile for FastAPI](02-dockerfile-fastapi.md) | Intermediate | Writing a Dockerfile, layer caching, multi-stage builds with uv, non-root user, .dockerignore |
| 03 | [Docker Compose for the full stack](03-compose-full-stack.md) | Intermediate | API + Postgres + Redis + Celery worker + beat, health checks, env files, dev vs prod |
| — | [**Production**](production.md) | — | Image hardening, scanning, tagging, resources, logging, secrets, orchestration (Kubernetes/ECS) |
