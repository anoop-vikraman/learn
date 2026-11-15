# Docker in production

## 1. Checklist

> **In short:** What a production-ready image and container setup needs.

- [ ] Multi-stage build, slim base, only runtime dependencies
- [ ] Pinned base image versions (ideally by digest) and locked app dependencies
- [ ] Runs as a non-root user; read-only filesystem where possible
- [ ] No secrets in the image (build args, ENV, copied `.env`)
- [ ] Image scanned for vulnerabilities in CI; base images rebuilt regularly
- [ ] Immutable, traceable tags (git SHA / semver); never deploy `latest`
- [ ] Health checks; graceful shutdown (exec-form CMD, SIGTERM handling)
- [ ] CPU/memory limits and requests
- [ ] Logs to stdout/stderr; collected centrally
- [ ] Stateless containers; data in managed services/volumes
- [ ] Orchestrator handles restarts, scaling, rolling updates

## 2. Image hardening

> **In short:** Minimal base, non-root, read-only filesystem, dropped capabilities, pinned digests.

- **Minimal base**: `python:3.12-slim`, or distroless/Chainguard/Wolfi images for fewer packages (and fewer CVEs). Smaller images also pull and start faster.
- **Non-root user** (`USER app`); never run as root in production.
- **Read-only root filesystem** (`read_only: true` in Compose, `readOnlyRootFilesystem: true` in Kubernetes) with a writable `tmpfs` for `/tmp` if needed.
- **Drop Linux capabilities** (`cap_drop: [ALL]`) and disable privilege escalation (`no-new-privileges`).
- Don't install debugging tools (curl, vim, compilers) in the runtime image; use ephemeral debug containers when needed.
- **Pin by digest** for reproducibility: `FROM python:3.12-slim@sha256:...` (Renovate/Dependabot can update digests).

## 3. Secrets

> **In short:** Inject secrets at runtime; never bake them into images.

- ❌ `ENV DATABASE_PASSWORD=...` or `COPY .env` in the Dockerfile: anyone with the image can read them (`docker history`, layer extraction).
- ❌ Build args for secrets (visible in image metadata).
- ✅ Inject at **runtime**: environment variables from the orchestrator's secret store (Kubernetes Secrets, ECS task secrets from Secrets Manager/SSM, Docker Swarm secrets) or mounted secret files.
- ✅ For secrets needed **during the build** (private package index tokens), use BuildKit secret mounts: `RUN --mount=type=secret,id=pip_token ...`.

## 4. Vulnerability scanning and supply chain

> **In short:** Scan images, rebuild regularly, generate SBOMs and sign images.

```bash
trivy image registry.example.com/task-api:1.4.0          # scan OS packages + Python deps
docker scout cves registry.example.com/task-api:1.4.0
grype registry.example.com/task-api:1.4.0
```

- Scan in CI and **fail the build** on critical/high vulnerabilities with available fixes.
- Rebuild images regularly (e.g. weekly) to pick up base image security patches, even without code changes.
- Generate an **SBOM** (`docker buildx build --sbom=true`, `syft`) and optionally **sign** images (cosign/Sigstore) and verify signatures at deploy time.
- Use trusted base images (official/verified publishers).

## 5. Tagging and registries

> **In short:** Deploy immutable SHA tags from a private registry; never `latest`.

| Tag | Use |
| --- | --- |
| `sha-a1b2c3d` (git commit) | **Deploy this**: immutable, traceable to the exact code |
| `1.4.0` (semver release) | Human-friendly releases |
| `main`, `latest` | Convenience only. ❌ Never reference in production deployments: you can't tell what's running or roll back reliably |

- Use a private registry (ECR, GHCR, Artifact Registry, Harbor) with access control.
- Enable **tag immutability** where supported.
- Set lifecycle policies to delete old untagged images (cost) while keeping recent releases for rollbacks.

## 6. Runtime configuration

> **In short:** Restart policy, security options, health checks, log rotation and grace periods.

```yaml
# Compose (single host) production-ish example
services:
  api:
    image: registry.example.com/task-api:sha-a1b2c3d
    restart: unless-stopped
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    environment:
      ENVIRONMENT: production
    env_file: /etc/task-api/prod.env          # provisioned by your deploy tooling, not in git
    deploy:
      resources:
        limits: { cpus: "1.0", memory: 512M }
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=2)"]
      interval: 30s
      timeout: 3s
      retries: 3
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "5" }    # prevent logs filling the disk
    stop_grace_period: 30s
```

### Resource limits

> **In short:** Set memory and CPU limits and watch for OOM kills.

- Set **memory limits** (a leaking process otherwise takes down the host) and CPU limits/requests.
- Python processes: memory ≈ workers × per-worker memory; size limits accordingly and watch for OOM kills (`docker inspect` → `OOMKilled`).

### Signals and graceful shutdown

> **In short:** Exec-form CMD so SIGTERM reaches the app and in-flight work finishes.

- Use the **exec form** `CMD ["fastapi", "run", ...]`, so the app is PID 1 and receives SIGTERM. The shell form (`CMD fastapi run ...`) wraps it in `/bin/sh`, which may not forward signals → the container is killed after the timeout.
- If your app spawns child processes, consider `--init` (tini) to reap zombies and forward signals.
- Set grace periods longer than your longest request/task.

## 7. Logging

> **In short:** Log to stdout/stderr in JSON and ship logs centrally.

- Write logs to **stdout/stderr**, never to files inside the container.
- Use JSON logs for easy parsing.
- Ship them with the platform (CloudWatch, Cloud Logging, Loki/Promtail, Fluent Bit, Datadog agent).
- Configure log rotation on single hosts (`max-size`, `max-file`) so logs don't fill the disk.

## 8. Where to run containers

> **In short:** Single VM, managed container services or Kubernetes, and when each fits.

| Option | Good for |
| --- | --- |
| Single VM + Docker Compose + systemd | Small apps, low budget, simple ops (no auto-scaling, manual HA) |
| **Managed container services**: AWS ECS/Fargate, Google Cloud Run, Azure Container Apps, Fly.io, Render, Railway | Most teams: no cluster to manage, autoscaling, rolling deploys |
| **Kubernetes** (EKS, GKE, AKS, self-managed) | Many services, complex needs, platform teams |

### Kubernetes essentials (for awareness)

> **In short:** A Deployment with probes, resources and secrets, plus the core Kubernetes objects.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: task-api }
spec:
  replicas: 3
  selector: { matchLabels: { app: task-api } }
  template:
    metadata: { labels: { app: task-api } }
    spec:
      securityContext: { runAsNonRoot: true }
      containers:
        - name: api
          image: registry.example.com/task-api:sha-a1b2c3d
          ports: [{ containerPort: 8000 }]
          envFrom: [{ secretRef: { name: task-api-secrets } }, { configMapRef: { name: task-api-config } }]
          resources:
            requests: { cpu: 250m, memory: 256Mi }
            limits: { memory: 512Mi }
          readinessProbe: { httpGet: { path: /health/ready, port: 8000 }, periodSeconds: 10 }
          livenessProbe: { httpGet: { path: /health/live, port: 8000 }, periodSeconds: 20 }
          securityContext: { readOnlyRootFilesystem: true, allowPrivilegeEscalation: false }
```

Concepts: Deployment (replicas, rolling updates), Service (stable internal address), Ingress/Gateway (HTTP routing + TLS), ConfigMap/Secret, HorizontalPodAutoscaler, Job (migrations), CronJob, PodDisruptionBudget. Package with Helm or Kustomize; deploy with GitOps (Argo CD/Flux).

## 9. Databases and state

> **In short:** Prefer managed databases and keep app containers stateless.

- Prefer **managed databases** (RDS, Cloud SQL) and managed Redis over running stateful services in containers yourself.
- If you do run Postgres/Redis in containers: persistent volumes, backups, monitoring, and an operator on Kubernetes (CloudNativePG).
- Keep app containers **stateless**: uploads go to object storage, sessions to Redis/DB.

## 10. Maintenance routine

> **In short:** Per-build, weekly, monthly and quarterly container tasks.

| How often | Task |
| --- | --- |
| Every build | Scan image; fail on critical CVEs; tag with git SHA |
| Weekly | Rebuild with updated base images (automated); review scan reports |
| Monthly | Clean up registry and unused images/volumes on hosts; review resource limits vs actual usage |
| Quarterly | Update base Python minor/patch versions; review Dockerfile best practices; test rollback to a previous image |
