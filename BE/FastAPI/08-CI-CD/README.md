# CI/CD for the FastAPI stack

- **CI (Continuous Integration)**: every push/merge request is automatically linted, type-checked, tested and built.
- **CD (Continuous Delivery/Deployment)**: every change that passes CI can be (delivery) or is automatically (deployment) released to staging and production.

The frontend-oriented GitLab CI notes are in [../../../FE/10-Git-GitLab-CI/](../../../FE/10-Git-GitLab-CI/).

| # | Lesson | Level | You will learn |
| --- | --- | --- | --- |
| 01 | [Concepts](01-concepts.md) | Beginner | Pipelines, stages, jobs, runners, artifacts, caches, environments, branching strategies |
| 02 | [A complete FastAPI pipeline](02-fastapi-pipeline.md) | Intermediate | GitHub Actions and GitLab CI: lint, type-check, test with Postgres/Redis services, build and push images, migrate, deploy |
| — | [**Production**](production.md) | — | Deployment strategies, rollbacks, secrets, approvals, environments, supply-chain security, metrics |
