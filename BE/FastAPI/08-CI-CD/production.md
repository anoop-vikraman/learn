# CI/CD in production

## 1. Checklist

> **In short:** What a production-grade delivery process needs.

- [ ] Protected `main`: CI + review required; no direct pushes
- [ ] Build once, tag with commit SHA, promote the same image through environments
- [ ] Staging deploy automatic; production deploy with approval (or fully automatic with strong safeguards)
- [ ] Migrations as a separate, backward-compatible step
- [ ] Health checks + smoke tests after each deploy; automatic rollback on failure
- [ ] Zero-downtime strategy (rolling / blue-green / canary)
- [ ] Secrets in the CI secret store or fetched via OIDC; least privilege per environment
- [ ] Dependency, secret and image scanning in the pipeline
- [ ] Deploy notifications and an audit trail (who deployed what, when)
- [ ] Documented rollback procedure, tested regularly

## 2. Deployment strategies

> **In short:** Recreate, rolling, blue/green, canary and feature flags compared.

| Strategy | How | Pros | Cons |
| --- | --- | --- | --- |
| **Recreate** | Stop old, start new | Simple | Downtime |
| **Rolling** | Replace instances a few at a time, behind health checks | No downtime, default on most platforms | Old and new versions run together briefly; slower rollback |
| **Blue/green** | Deploy the new version alongside ("green"), switch traffic all at once | Instant switch and instant rollback | Double resources during deploy; DB must work for both |
| **Canary** | Send a small % of traffic (1% → 10% → 50% → 100%) to the new version, watching metrics | Limits blast radius; data-driven | Needs traffic splitting and good metrics |
| **Feature flags** | Deploy code dark, enable features separately (per user/% of users) | Decouples deploy from release; instant "rollback" by toggling | Flag debt; needs a flag system |

For most FastAPI services: **rolling deploys + readiness probes + feature flags**, with canary for high-risk changes.

### Requirements for zero-downtime deploys

> **In short:** Readiness checks, graceful shutdown, compatible changes and connection draining.

- Readiness checks so traffic only reaches instances that are ready.
- **Graceful shutdown**: old instances finish in-flight requests (and Celery tasks) before stopping.
- **Backward-compatible** API and database changes: during a rolling deploy, old and new code run at the same time against the same database (expand → migrate → contract).
- Connection draining at the load balancer.

## 3. Rollbacks

> **In short:** Redeploy the previous image quickly; prefer rolling forward for database changes.

- Rolling back = **redeploying the previous image tag** (keep recent images in the registry).
- Keep it one command or one click (`kubectl rollout undo`, re-run the previous deploy job, Cloud Run traffic to the previous revision).
- **Database rollbacks are hard**: prefer **roll-forward** fixes and backward-compatible migrations, so the previous app version still works with the new schema. Never rely on "downgrade" migrations in production for destructive changes.
- Automate: if error rate or latency crosses a threshold within N minutes of a deploy, roll back automatically (Argo Rollouts, Flagger, AWS CodeDeploy, Cloud Deploy).

## 4. Post-deploy verification

> **In short:** Health checks, smoke tests, dashboards and deploy markers.

1. Health/readiness endpoints pass.
2. **Smoke tests**: a few critical API calls (login, list tasks) against the deployed environment.
3. Watch dashboards for 15–30 minutes: 5xx rate, p95 latency, error tracking (new Sentry issues tagged with the release), queue backlog.
4. Annotate dashboards with deploy markers (release version) so changes in graphs can be linked to deploys.

## 5. Secrets and access

> **In short:** Environment-scoped secrets, OIDC, least privilege and no secrets for forks.

- Store secrets in the CI platform's secret store, scoped to environments (staging secrets can't deploy to production).
- Prefer **OIDC federation** to cloud providers: short-lived credentials, no stored keys.
- Least privilege: the deploy role can only update the specific service and run the migration job.
- Never echo secrets; mask them; disable debug logging that might print them.
- Pull requests from forks must **not** get secrets (GitHub does this by default; don't use `pull_request_target` carelessly).
- Rotate CI credentials periodically and when people leave.

## 6. Supply-chain security

> **In short:** Pinned actions, locked dependencies, scanners, SBOMs and signed images.

- Pin third-party CI actions/templates to a version or **commit SHA** (a compromised action tag can steal secrets).
- Lock dependencies (`uv.lock`) and verify hashes.
- Scan: dependencies (`pip-audit`), code (Bandit/Ruff, CodeQL/Semgrep), secrets (gitleaks, GitHub secret scanning), images (Trivy).
- Generate SBOMs; sign images (cosign) and verify signatures in the cluster (admission policies).
- Use dedicated, ephemeral runners for production deploys; restrict self-hosted runners to trusted repositories.

## 7. Approvals and governance

> **In short:** Protected environments, required reviewers, freeze windows and audit trails.

- Production environment protection: required reviewers, allowed branches (only `main`/tags), wait timers.
- Change freeze windows if your business needs them (e.g. sale days), enforced by deployment rules rather than hope.
- Audit trail: the CI system records who triggered/approved each deploy and which commit went out.

## 8. Pipeline reliability

> **In short:** Fast pipelines, no flaky tests and pinned tool versions.

- Keep CI fast (< 10–15 minutes); slow pipelines lead people to bypass them.
- Fix or quarantine **flaky tests** immediately; flakiness destroys trust in CI.
- Pin tool versions (Python, uv, Postgres images) so the pipeline doesn't break randomly.
- Retry only genuinely transient steps (network downloads), not tests.

## 9. Measure delivery performance (DORA metrics)

> **In short:** Deployment frequency, lead time, change failure rate and time to restore.

| Metric | Meaning | Good |
| --- | --- | --- |
| Deployment frequency | How often you deploy to production | Daily or more |
| Lead time for changes | Commit → running in production | Less than a day |
| Change failure rate | % of deploys causing incidents/rollbacks | 0–15% |
| Time to restore service | How long to recover from a failure | Less than an hour |

Small, frequent deploys improve all four.

## 10. Routine

> **In short:** Per-deploy to quarterly CI/CD tasks.

| How often | Task |
| --- | --- |
| Every deploy | Verify health, watch metrics, record the release |
| Weekly | Merge dependency update PRs; review failed/flaky pipelines |
| Monthly | Review pipeline duration and costs; prune old images and artifacts; update CI action versions |
| Quarterly | Rollback drill; rotate CI secrets; review environment protections and access; review DORA metrics |
