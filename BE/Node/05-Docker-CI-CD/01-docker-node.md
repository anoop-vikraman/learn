# 01 · Docker for Node

## 1. `.dockerignore`

> **In short:** Keep `node_modules`, build output, secrets and git history out of the build context.

```
node_modules
dist
coverage
.git
.env
.env.*
!.env.example
*.log
Dockerfile*
compose*.yaml
tests
```

Never copy your local `node_modules` into the image: native modules built on macOS/Windows won't work on Linux, and it bloats the context.

## 2. A multi-stage Dockerfile (TypeScript + Prisma)

> **In short:** Install all dependencies and build in one stage, install only production dependencies in another, and copy the results into a slim, non-root runtime image.

```dockerfile
# syntax=docker/dockerfile:1
ARG NODE_VERSION=24

############ deps: all dependencies (for building) ############
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

############ build: compile TypeScript, generate Prisma client ############
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

############ prod-deps: production dependencies only ############
FROM node:${NODE_VERSION}-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

############ runtime ############
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# (Prisma needs OpenSSL on slim images)
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node package.json ./

# the official image includes a non-root "node" user
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
```

| Technique | Why |
| --- | --- |
| `npm ci` | Exact, reproducible install from the lock file |
| Copy `package*.json` before the source | Dependency layers are cached until dependencies change |
| `--mount=type=cache` | Reuses the npm download cache between builds |
| `--omit=dev` in the final dependencies | No TypeScript, Vitest or ESLint in production |
| Generated Prisma client copied explicitly | The client is generated at build time; the paths depend on your Prisma version/output setting |
| `USER node` | Don't run as root |
| `CMD ["node", ...]` (exec form, not `npm start`) | Node is PID 1 and receives SIGTERM for graceful shutdown; npm doesn't forward signals reliably |

Base images: `node:24-slim` (Debian) is a safe default. `node:24-alpine` is smaller, but uses musl, which can break native modules. Distroless/Chainguard images are even smaller and more secure.

### The migration image

> **In short:** Migrations need the Prisma CLI (a dev dependency), so use the build stage (or a dedicated target) to run `prisma migrate deploy`.

```dockerfile
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]
```

```bash
docker build --target migrate -t task-api-migrate:${TAG} .
```

(Alternatively, keep `prisma` as a production dependency.)

## 3. Building and running

> **In short:** Build with a tag, pass configuration at runtime, and run the API, worker and migrations from the same image.

```bash
docker build -t task-api:dev .
docker run --rm -p 3000:3000 --env-file .env task-api:dev
docker run --rm --env-file .env task-api:dev node dist/jobs/worker.js     # BullMQ worker
docker run --rm --env-file .env task-api-migrate:dev                       # migrations
```

## 4. Compose for the full stack

> **In short:** One file runs the API (with hot reload), a worker, migrations, PostgreSQL and Redis for local development.

```yaml
# compose.yaml
name: task-api

services:
  api:
    build: { context: ., target: deps }       # dev: has all dependencies incl. tsx
    command: sh -c "npx prisma generate && npx tsx watch src/server.ts"
    ports: ["3000:3000"]
    env_file: .env
    environment:
      DATABASE_URL: postgresql://app:secret@db:5432/tasks
      REDIS_URL: redis://redis:6379
    volumes:
      - ./src:/app/src                         # live reload
      - ./prisma:/app/prisma
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_healthy }
      migrate: { condition: service_completed_successfully }

  worker:
    build: { context: ., target: deps }
    command: sh -c "npx prisma generate && npx tsx watch src/jobs/worker.ts"
    env_file: .env
    environment:
      DATABASE_URL: postgresql://app:secret@db:5432/tasks
      REDIS_URL: redis://redis:6379
    volumes: ["./src:/app/src", "./prisma:/app/prisma"]
    depends_on:
      redis: { condition: service_healthy }
      migrate: { condition: service_completed_successfully }

  migrate:
    build: { context: ., target: deps }
    command: npx prisma migrate deploy
    environment:
      DATABASE_URL: postgresql://app:secret@db:5432/tasks
    volumes: ["./prisma:/app/prisma"]
    depends_on:
      db: { condition: service_healthy }

  db:
    image: postgres:17
    environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: secret, POSTGRES_DB: tasks }
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d tasks"]
      interval: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction"]
    ports: ["6379:6379"]
    volumes: [redisdata:/data]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 10

volumes:
  pgdata:
  redisdata:
```

```bash
docker compose up -d
docker compose logs -f api worker
docker compose exec api npx prisma studio
docker compose run --rm api npx tsx prisma/seed.ts --fake
docker compose down        # add -v to wipe the database
```

More Compose commands, override files and troubleshooting: [../../FastAPI/07-Docker/03-compose-full-stack.md](../../FastAPI/07-Docker/03-compose-full-stack.md).

## 5. Common Node-in-Docker pitfalls

> **In short:** Signals, file watching, native modules and memory limits cause most problems.

| Problem | Fix |
| --- | --- |
| Container takes 10 s to stop, requests cut off | Exec-form `CMD ["node", ...]`, handle SIGTERM, or add `--init` |
| Hot reload doesn't notice changes (Docker Desktop on Mac/Windows) | Use polling (`CHOKIDAR_USEPOLLING=true`) or `docker compose watch` |
| Native module errors (`bcrypt`, `sharp`) | Install dependencies inside the image (never copy host `node_modules`); match libc (slim vs alpine) |
| OOM kills | Set `--max-old-space-size` below the container memory limit (`NODE_OPTIONS`) |
| Huge images | Multi-stage build, `--omit=dev`, `.dockerignore` |
| Prisma "query engine not found" / OpenSSL errors | Install OpenSSL in the runtime image; set `binaryTargets` (older Prisma) for the image's platform |

---

## 6. Exercises

1. Write the multi-stage Dockerfile and compare its size with a single-stage one.
2. Confirm the container runs as the `node` user and stops quickly on `docker stop`.
3. Run the full Compose stack with API, worker, migrations, Postgres and Redis.
4. Seed fake data through Compose and browse it with Prisma Studio.
5. Build the `migrate` target and run it against your local database.
