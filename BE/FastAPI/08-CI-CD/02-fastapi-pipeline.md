# 02 · A complete FastAPI pipeline

The same pipeline in **GitHub Actions** and **GitLab CI**. It assumes the project layout from the FastAPI lessons (uv, pytest, Alembic, a multi-stage Dockerfile).

## 1. Make the checks runnable locally first

> **In short:** The same make targets locally and in CI make failures reproducible.

```toml
# pyproject.toml (excerpt)
[dependency-groups]
dev = ["pytest", "pytest-cov", "ruff", "mypy", "pip-audit", "httpx"]
```

```makefile
# Makefile: the same commands locally and in CI
lint:
	uv run ruff format --check .
	uv run ruff check .
typecheck:
	uv run mypy app
test:
	uv run pytest -q --cov=app --cov-report=xml --cov-fail-under=80
audit:
	uv run pip-audit
migrations-check:
	uv run alembic upgrade head && uv run alembic check
```

If CI only calls `make` targets, developers can reproduce any failure locally.

---

## 2. GitHub Actions

> **In short:** A complete CI and deploy setup with GitHub Actions.

### `.github/workflows/ci.yml`

> **In short:** Lint, test with Postgres/Redis services, build, push and scan the image.

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:                      # cancel older runs of the same branch/PR
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
        with: { enable-cache: true }
      - run: uv sync --frozen
      - run: uv run ruff format --check .
      - run: uv run ruff check .
      - run: uv run mypy app
      - run: uv run pip-audit

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: secret
          POSTGRES_DB: tasks_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U app -d tasks_test"
          --health-interval 5s --health-timeout 5s --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: --health-cmd "redis-cli ping" --health-interval 5s --health-retries 10
    env:
      DATABASE_URL: postgresql+psycopg://app:secret@localhost:5432/tasks_test
      REDIS_URL: redis://localhost:6379/0
      JWT_SECRET: test-secret-that-is-at-least-32-characters-long
      ENVIRONMENT: local
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
        with: { enable-cache: true }
      - run: uv sync --frozen
      - name: Migrations apply cleanly and are complete
        run: |
          uv run alembic upgrade head
          uv run alembic check
      - name: Tests
        run: uv run pytest -q --cov=app --cov-report=xml --cov-fail-under=80
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: coverage, path: coverage.xml }

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write             # push to GitHub Container Registry
    outputs:
      image: ${{ steps.meta.outputs.image }}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        run: echo "image=ghcr.io/${{ github.repository }}:sha-${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: ${{ github.event_name == 'push' }}          # only push from main, not PRs
          tags: ${{ steps.meta.outputs.image }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      - name: Scan image
        if: github.event_name == 'push'
        uses: aquasecurity/trivy-action@0.28.0
        with:
          image-ref: ${{ steps.meta.outputs.image }}
          severity: CRITICAL,HIGH
          ignore-unfixed: true
          exit-code: "1"
```

### `.github/workflows/deploy.yml`

> **In short:** Migrate and deploy to staging, smoke test, then production with approval.

```yaml
name: Deploy

on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]

jobs:
  staging:
    if: github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    environment: staging                     # environment-specific secrets
    steps:
      - uses: actions/checkout@v4
      - id: img
        run: echo "image=ghcr.io/${{ github.repository }}:sha-$(echo ${{ github.event.workflow_run.head_sha }} | cut -c1-7)" >> "$GITHUB_OUTPUT"
      - name: Run migrations
        run: ./deploy/migrate.sh "${{ steps.img.outputs.image }}"
        env: { DATABASE_URL: "${{ secrets.DATABASE_URL }}" }
      - name: Deploy
        run: ./deploy/deploy.sh staging "${{ steps.img.outputs.image }}"
      - name: Smoke test
        run: curl --fail --retry 10 --retry-delay 5 https://staging-api.example.com/health/ready

  production:
    needs: staging
    runs-on: ubuntu-latest
    environment:
      name: production                       # configure "required reviewers" on this environment
      url: https://api.example.com
    steps:
      - uses: actions/checkout@v4
      - id: img                                  # same tag as built in CI (first 7 chars of the SHA)
        run: echo "image=ghcr.io/${{ github.repository }}:sha-$(echo ${{ github.event.workflow_run.head_sha }} | cut -c1-7)" >> "$GITHUB_OUTPUT"
      - run: ./deploy/migrate.sh "$IMAGE" && ./deploy/deploy.sh production "$IMAGE"
        env:
          IMAGE: ${{ steps.img.outputs.image }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - run: curl --fail --retry 10 --retry-delay 5 https://api.example.com/health/ready
```

`deploy/deploy.sh` depends on your platform, for example:
- **Cloud Run**: `gcloud run deploy task-api --image "$IMAGE" --region asia-south1`
- **ECS**: update the task definition with the new image and `aws ecs update-service`
- **Kubernetes**: `kubectl set image deployment/task-api api="$IMAGE"` (or update a GitOps repo for Argo CD)
- **VM + Compose**: SSH in, `docker compose pull && docker compose up -d`

Use **OIDC** (`aws-actions/configure-aws-credentials` with `role-to-assume`, `google-github-actions/auth`) instead of long-lived cloud keys in secrets.

---

## 3. GitLab CI

> **In short:** The same pipeline written for GitLab.

### `.gitlab-ci.yml`

> **In short:** Stages, services, caching, coverage reports, image build and manual production deploys.

```yaml
stages: [check, test, build, deploy]

variables:
  UV_CACHE_DIR: .uv-cache
  IMAGE: $CI_REGISTRY_IMAGE:sha-$CI_COMMIT_SHORT_SHA

default:
  image: ghcr.io/astral-sh/uv:python3.12-bookworm-slim
  cache:
    key:
      files: [uv.lock]
    paths: [.uv-cache]
  before_script:
    - uv sync --frozen

workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

lint:
  stage: check
  script:
    - uv run ruff format --check .
    - uv run ruff check .
    - uv run mypy app
    - uv run pip-audit

test:
  stage: test
  services:
    - name: postgres:17
      alias: db
    - name: redis:7-alpine
      alias: redis
  variables:
    POSTGRES_USER: app
    POSTGRES_PASSWORD: secret
    POSTGRES_DB: tasks_test
    DATABASE_URL: postgresql+psycopg://app:secret@db:5432/tasks_test
    REDIS_URL: redis://redis:6379/0
    JWT_SECRET: test-secret-that-is-at-least-32-characters-long
  script:
    - uv run alembic upgrade head
    - uv run alembic check
    - uv run pytest -q --cov=app --cov-report=xml --cov-report=term --cov-fail-under=80 --junitxml=report.xml
  coverage: '/TOTAL.*\s+(\d+%)$/'
  artifacts:
    when: always
    reports:
      junit: report.xml
      coverage_report: { coverage_format: cobertura, path: coverage.xml }

build:
  stage: build
  image: docker:27
  services: [docker:27-dind]
  before_script:
    - echo "$CI_REGISTRY_PASSWORD" | docker login -u "$CI_REGISTRY_USER" --password-stdin "$CI_REGISTRY"
  script:
    - docker build --cache-from $CI_REGISTRY_IMAGE:latest -t $IMAGE .
    - docker push $IMAGE
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

scan:
  stage: build
  needs: [build]
  image: { name: aquasec/trivy:latest, entrypoint: [""] }
  before_script: []
  script:
    - trivy image --exit-code 1 --severity CRITICAL,HIGH --ignore-unfixed $IMAGE
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

deploy_staging:
  stage: deploy
  image: alpine:3.20
  before_script: []
  environment: { name: staging, url: https://staging-api.example.com }
  script:
    - ./deploy/migrate.sh $IMAGE
    - ./deploy/deploy.sh staging $IMAGE
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

deploy_production:
  stage: deploy
  image: alpine:3.20
  before_script: []
  environment: { name: production, url: https://api.example.com }
  script:
    - ./deploy/migrate.sh $IMAGE
    - ./deploy/deploy.sh production $IMAGE
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual                 # click to release; protect the environment for approvals
  needs: [deploy_staging]
```

Store secrets as **masked, protected CI/CD variables**, scoped to environments.

---

## 4. The migration step

> **In short:** Run migrations once per deploy with the new image, before the new code takes traffic.

Migrations run **once per deploy, before the new code receives traffic**, as a one-off job using the new image:

```bash
#!/usr/bin/env bash
# deploy/migrate.sh
set -euo pipefail
IMAGE="$1"
docker run --rm -e DATABASE_URL="$DATABASE_URL" "$IMAGE" alembic upgrade head
# Kubernetes: a Job (or Helm pre-upgrade hook); ECS: a one-off task; Cloud Run: a Cloud Run job
```

Migrations must be **backward compatible** with the currently running version (it keeps serving traffic during the rollout). See [../09-Migrations/production.md](../09-Migrations/production.md).

## 5. Release tags and changelogs (optional)

> **In short:** Semver tags on built images and generated changelogs.

```yaml
on:
  push:
    tags: ["v*.*.*"]
```

- Tag releases (`v1.4.0`), add the semver tag to the already-built image (re-tag, don't rebuild).
- Generate changelogs from Conventional Commits (`release-please`, `semantic-release`).

## 6. Scheduled pipelines

> **In short:** Nightly audits and rebuilds, and automated dependency PRs.

- Nightly: full test suite, dependency audit, image rebuild with fresh base images.
- Weekly: Renovate/Dependabot opens dependency update PRs that run through CI.

---

## 7. Exercises

1. Add `ci.yml` to the task API and get lint + tests green with Postgres and Redis services.
2. Make CI fail when a model changes without a migration (`alembic check`).
3. Build and push an image tagged with the commit SHA from `main` only.
4. Add a staging deploy with a smoke test and a manual production approval.
5. Replace stored cloud keys with OIDC authentication.
