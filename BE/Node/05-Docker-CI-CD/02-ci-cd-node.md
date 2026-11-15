# 02 · CI/CD for Node

Pipeline concepts (stages, environments, branching, build once/deploy many) are in [../../FastAPI/08-CI-CD/01-concepts.md](../../FastAPI/08-CI-CD/01-concepts.md).

## 1. Scripts the pipeline calls

> **In short:** CI runs the same npm scripts you run locally, so any failure can be reproduced on your machine.

```json
"scripts": {
  "lint": "eslint .",
  "format:check": "prettier --check .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "build": "tsc",
  "db:migrate": "prisma migrate deploy"
}
```

## 2. What CI checks for a Node backend

> **In short:** Lint, format, type-check, test against real Postgres/Redis, check migrations, audit dependencies, then build and scan the image.

| Check | Command |
| --- | --- |
| Lint + format | `npm run lint`, `npm run format:check` |
| Types | `npm run typecheck` |
| Tests + coverage | `npm run test:coverage` with Postgres and Redis service containers |
| Migrations apply cleanly | `npx prisma migrate deploy` on an empty DB |
| No missing migration | `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url $SHADOW_URL --exit-code` |
| Dependencies | `npm audit --audit-level=high` (or Snyk/Dependabot) |
| Image | `docker build` + Trivy scan |

## 3. GitHub Actions

> **In short:** One workflow for checks and image builds on every PR and push to main, with Postgres and Redis service containers for tests.

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_USER: app, POSTGRES_PASSWORD: secret, POSTGRES_DB: tasks_test }
        ports: ["5432:5432"]
        options: --health-cmd "pg_isready -U app" --health-interval 5s --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: --health-cmd "redis-cli ping" --health-interval 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://app:secret@localhost:5432/tasks_test
      SHADOW_URL: postgresql://app:secret@localhost:5432/tasks_shadow
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: test-secret-that-is-at-least-32-characters-long
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npx prisma generate
      - run: npx prisma migrate deploy
      - name: Fail if schema changed without a migration
        run: |
          psql "postgresql://app:secret@localhost:5432/tasks_test" -c "CREATE DATABASE tasks_shadow"
          npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
            --shadow-database-url "$SHADOW_URL" --exit-code
      - run: npm run test:coverage
      - run: npm audit --audit-level=high --omit=dev

  build:
    needs: check
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: "${{ github.actor }}", password: "${{ secrets.GITHUB_TOKEN }}" }
      - id: tag
        run: echo "tag=sha-${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ steps.tag.outputs.tag }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      - uses: docker/build-push-action@v6
        with:
          context: .
          target: migrate
          push: true
          tags: ghcr.io/${{ github.repository }}-migrate:${{ steps.tag.outputs.tag }}
          cache-from: type=gha
      - uses: aquasecurity/trivy-action@0.28.0
        with:
          image-ref: ghcr.io/${{ github.repository }}:${{ steps.tag.outputs.tag }}
          severity: CRITICAL,HIGH
          ignore-unfixed: true
          exit-code: "1"
```

A deploy workflow then runs (staging automatically, production with approval):

1. Run the **migrate** image once (`prisma migrate deploy`) against the target database.
2. Roll out the new API and worker images.
3. Smoke-test `/health/ready` and a critical endpoint.

The FastAPI version of the deploy workflow ([../../FastAPI/08-CI-CD/02-fastapi-pipeline.md](../../FastAPI/08-CI-CD/02-fastapi-pipeline.md#githubworkflowsdeployyml)) applies unchanged apart from the image names.

## 4. GitLab CI

> **In short:** The same stages in `.gitlab-ci.yml`: install with cache, check with services, build/push images, deploy with a manual production gate.

```yaml
stages: [check, build, deploy]

default:
  image: node:24-slim
  cache:
    key: { files: [package-lock.json] }
    paths: [.npm]
  before_script:
    - npm ci --cache .npm --prefer-offline

variables:
  IMAGE: $CI_REGISTRY_IMAGE:sha-$CI_COMMIT_SHORT_SHA

check:
  stage: check
  services:
    - { name: postgres:17, alias: db }
    - { name: redis:7-alpine, alias: redis }
  variables:
    POSTGRES_USER: app
    POSTGRES_PASSWORD: secret
    POSTGRES_DB: tasks_test
    DATABASE_URL: postgresql://app:secret@db:5432/tasks_test
    REDIS_URL: redis://redis:6379
    JWT_SECRET: test-secret-that-is-at-least-32-characters-long
    NODE_ENV: test
  script:
    - npm run lint
    - npm run typecheck
    - npx prisma generate
    - npx prisma migrate deploy
    - npm run test:coverage
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'

build:
  stage: build
  image: docker:27
  services: [docker:27-dind]
  before_script:
    - echo "$CI_REGISTRY_PASSWORD" | docker login -u "$CI_REGISTRY_USER" --password-stdin "$CI_REGISTRY"
  script:
    - docker build -t $IMAGE .
    - docker build --target migrate -t $IMAGE-migrate .
    - docker push $IMAGE && docker push $IMAGE-migrate
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

deploy_production:
  stage: deploy
  image: alpine:3.20
  before_script: []
  environment: { name: production, url: https://api.example.com }
  script:
    - ./deploy/migrate.sh $IMAGE-migrate
    - ./deploy/deploy.sh production $IMAGE
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual
```

## 5. Speeding up Node pipelines

> **In short:** Cache npm downloads, run jobs in parallel, shard tests, and cache Docker layers.

- `actions/setup-node` with `cache: npm` (or pnpm/yarn).
- Split lint/typecheck and tests into parallel jobs for large repos.
- Vitest sharding: `vitest run --shard=1/3` across a matrix.
- Docker layer cache (`type=gha` or a registry cache).
- In monorepos, only test affected packages (Turborepo, Nx).

## 6. Dependency updates

> **In short:** Let Renovate or Dependabot open small, regular update PRs that run through CI.

Group minor/patch updates weekly; review majors individually; never merge failing updates.

---

## 7. Exercises

1. Add the GitHub Actions workflow and get it green with Postgres and Redis services.
2. Make CI fail when `schema.prisma` changes without a migration.
3. Build and push API and migrate images tagged with the commit SHA.
4. Add a deploy job that runs migrations, deploys and smoke-tests staging.
5. Shard the test suite across three parallel jobs.
