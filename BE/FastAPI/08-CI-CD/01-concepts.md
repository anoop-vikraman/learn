# 01 · CI/CD concepts

## 1. Why CI/CD?

> **In short:** Automatic checks on every change and small, frequent, low-risk releases.

Without it: people forget to run tests, "it works on my machine", deployments are manual, rare, scary and error-prone.

With it:
- Every change is checked the same way, automatically.
- Problems are found minutes after they're introduced, when they're cheap to fix.
- Releases are small, frequent and boring (a good thing).
- Anyone can see what's deployed where, and roll back quickly.

## 2. The pipeline

> **In short:** Stages, jobs, runners, triggers, artifacts, caches, services and environments.

```
push / merge request
   │
   ▼
┌────────┐  ┌──────────────┐  ┌────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐
│ Lint   │→ │ Type check   │→ │ Test   │→ │ Build image  │→ │ Deploy       │→ │ Deploy        │
│ format │  │ security scan│  │+cover. │  │ scan + push  │  │ staging      │  │ production    │
└────────┘  └──────────────┘  └────────┘  └──────────────┘  └──────────────┘  └───────────────┘
   CI ─────────────────────────────────────────────────────▶   CD ──────────────────────────────▶
                                                              (auto)            (manual approval or auto)
```

| Term | Meaning |
| --- | --- |
| **Pipeline / workflow** | The full automated process triggered by an event |
| **Stage** | A group of jobs that run in order (lint → test → build → deploy) |
| **Job** | One unit of work (e.g. "run pytest"); jobs in a stage can run in parallel |
| **Runner / agent** | The machine/container that executes jobs (hosted by GitHub/GitLab or self-hosted) |
| **Trigger** | Push, merge/pull request, tag, schedule, manual |
| **Artifact** | Files produced by a job and passed to later jobs or kept (coverage report, build output) |
| **Cache** | Files reused between pipeline runs to save time (pip/uv cache) |
| **Service container** | A helper container for a job (PostgreSQL/Redis for tests) |
| **Environment** | A deployment target (staging, production) with its own URL, secrets and protection rules |
| **Secret / variable** | Credentials and config injected into jobs, masked in logs |

## 3. Continuous Delivery vs Deployment

> **In short:** A one-click production release vs a fully automatic one.

| | Continuous Delivery | Continuous Deployment |
| --- | --- | --- |
| Production release | Manual approval (one click) | Automatic after all checks pass |
| Needs | Good tests | Excellent tests, monitoring, feature flags, fast rollback |

Most teams start with automatic staging deploys and a manual production approval.

## 4. Branching strategies

> **In short:** Trunk-based, GitHub flow, GitFlow; build once and promote the same image.

| Strategy | How | Fits |
| --- | --- | --- |
| **Trunk-based** | Short-lived branches (hours–days) merged to `main` often; `main` always deployable; feature flags hide unfinished work | CI/CD-friendly, most modern teams |
| **GitHub flow** | Feature branch → pull request → review + CI → merge to `main` → deploy | Simple web apps |
| **GitFlow** | `develop`, `release/*`, `hotfix/*`, `main` | Versioned releases, slower cycles |
| **Environment branches** | `main` → staging, `production` branch → prod | Common but can drift; prefer promoting the same image |

**Key principle: build once, deploy many.** Build the Docker image once (tagged with the commit SHA) and **promote that exact image** from staging to production. Only configuration changes between environments.

## 5. What each CI stage checks (Python backend)

> **In short:** Lint, types, security, tests, migrations, build, image scan and API diff.

| Stage | Tools | Catches |
| --- | --- | --- |
| Format & lint | `ruff format --check`, `ruff check` | Style, unused imports, common bugs |
| Type check | `mypy` / `pyright` | Type errors |
| Security (code/deps) | `pip-audit`, `bandit` / Ruff `S` rules, secret scanning (`gitleaks`) | Vulnerable packages, insecure code, leaked secrets |
| Unit + integration tests | `pytest` with Postgres/Redis services, coverage threshold | Broken behaviour |
| Migration check | `alembic upgrade head` on an empty DB, check for missing migrations (`alembic check`) | Broken or missing migrations |
| Build | `docker build` | Broken Dockerfile/dependencies |
| Image scan | Trivy / Docker Scout | Vulnerable OS packages |
| Contract/API checks | Diff the OpenAPI schema against `main` | Accidental breaking API changes |

## 6. Making pipelines fast

> **In short:** Caching, parallel jobs, test splitting and failing fast.

- **Cache** dependency downloads (uv/pip cache) and Docker layers (BuildKit cache, registry cache).
- Run independent jobs **in parallel** (lint, type check and tests at once).
- Split slow test suites across parallel jobs (`pytest-xdist`, test sharding).
- Fail fast: cheap checks first.
- Only run what's affected (path filters) in monorepos.
- Target: CI feedback in under ~10 minutes.

## 7. Quality gates and branch protection

> **In short:** Required checks, reviews and thresholds before merging.

- Protect `main`: require passing CI and at least one review before merging; no direct pushes.
- Require the branch to be up to date with `main` (or use a merge queue).
- Coverage threshold (e.g. 80%) and no new critical vulnerabilities.
- Signed commits/tags if required by your organization.

## 8. Environments

> **In short:** Local, CI, preview, staging and production, and how they differ.

| Environment | Purpose | Data | Deploy |
| --- | --- | --- | --- |
| Local | Development | Seed/fake data | Docker Compose |
| CI | Automated tests | Created per run, thrown away | Service containers |
| Preview (optional) | One environment per pull request | Seed data | Automatic per PR |
| Staging | Production-like final check | Anonymized/realistic | Automatic from `main` |
| Production | Real users | Real | Manual approval or automatic |

Keep staging as close to production as possible (same image, same infrastructure-as-code, similar data volume).

---

## 9. Exercises

1. Draw the pipeline you'd want for the task API, with stages and what each checks.
2. Decide between continuous delivery and deployment for your team and list what's needed to move to the latter.
3. Write branch protection rules for `main`.
4. List which secrets the pipeline needs (registry, cloud deploy, DB for migrations) and where each is stored.
