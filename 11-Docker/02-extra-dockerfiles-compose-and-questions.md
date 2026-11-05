# Docker extra: more Dockerfiles, Compose, commands, Q&A

## Dev Dockerfile with hot reload (Vite)

```dockerfile
# Dockerfile.dev
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]   # --host so it's reachable from outside the container
```

```yaml
# compose.dev.yaml
services:
  web:
    build: { context: ., dockerfile: Dockerfile.dev }
    ports: ["5173:5173"]
    volumes:
      - .:/app                 # bind mount: edits on the host appear in the container
      - /app/node_modules      # anonymous volume: keeps the container's node_modules
    environment:
      - CHOKIDAR_USEPOLLING=true   # file watching on some hosts (Windows/WSL)
```

## Production Dockerfile with a non-root user + healthcheck

```dockerfile
# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL                      # build-time argument
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- serve ----
FROM nginxinc/nginx-unprivileged:1.27-alpine     # runs as non-root, listens on 8080
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080/ || exit 1
```

```nginx
# nginx.conf
server {
  listen 8080;
  root /usr/share/nginx/html;
  index index.html;

  # Hashed assets: cache forever
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # SPA fallback: deep links like /orders/42 serve index.html
  location / {
    try_files $uri $uri/ /index.html;
    add_header Cache-Control "no-cache";          # always revalidate index.html
  }

  # Proxy API calls (avoids CORS; the browser sees one origin)
  location /api/ {
    proxy_pass http://api:4000/;
  }

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
}
```

## Runtime config: one image for every environment

Problem: `VITE_*` values are baked in at build time. Solution: load a `config.js` at runtime.

```html
<!-- index.html -->
<script src="/config.js"></script>
```

```sh
#!/bin/sh
# docker-entrypoint.sh: generates config.js from env vars when the container starts
cat <<EOF > /usr/share/nginx/html/config.js
window.__APP_CONFIG__ = { API_URL: "${API_URL}", FEATURE_X: "${FEATURE_X:-false}" };
EOF
exec nginx -g 'daemon off;'
```

```ts
// src/config.ts
export const config = (window as any).__APP_CONFIG__ ?? { API_URL: import.meta.env.VITE_API_URL };
```

## A full-stack Compose file (web + api + db + cache)

```yaml
services:
  web:
    build: ./web
    ports: ["8080:8080"]
    depends_on:
      api: { condition: service_healthy }

  api:
    build: ./api
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/app   # "db" = service name = hostname
      REDIS_URL: redis://cache:6379
    depends_on:
      db: { condition: service_healthy }
      cache: { condition: service_started }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:4000/health"]
      interval: 10s
      retries: 5

  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data      # named volume: data survives container removal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 10

  cache:
    image: redis:7-alpine

volumes:
  pgdata:
```

## Commands cheat sheet

```bash
docker build -t myapp:1.0 .                 # build an image from the Dockerfile
docker build --build-arg VITE_API_URL=https://api.x.com -t myapp .
docker images                               # list images
docker run -d -p 8080:8080 --name web myapp:1.0   # detached, host:container port
docker run --rm -it node:22-alpine sh       # throwaway interactive container
docker ps / docker ps -a                    # running / all containers
docker logs -f web                          # follow logs
docker exec -it web sh                      # shell inside a running container
docker stop web && docker rm web
docker rmi myapp:1.0
docker system prune -a                      # clean up unused images/containers/networks
docker inspect web                          # low-level details (IP, mounts, env)
docker stats                                # live CPU/memory

docker compose up -d --build                # build + start everything
docker compose logs -f api
docker compose exec api sh
docker compose down                         # stop + remove containers/networks
docker compose down -v                      # ...and named volumes (deletes DB data!)
docker compose ps
```

---

## Extra interview questions

**Q: Image vs container?**
An image is a read-only template made of layers (like a class). A container is a running instance of an image with a thin writable layer on top (like an object). Many containers can come from one image.

**Q: What are layers and how does caching work?**
Each instruction (`RUN`, `COPY`, `ADD`) creates a layer. Docker reuses cached layers until one changes. After that, everything below rebuilds. So order instructions from least to most frequently changing: base image → system deps → `package*.json` → `npm ci` → source code.

**Q: `CMD` vs `ENTRYPOINT`, with an example?**
```dockerfile
ENTRYPOINT ["npm", "run"]   # fixed executable
CMD ["start"]               # default arguments, easily overridden
# docker run img        → npm run start
# docker run img test   → npm run test
```
Use the exec form (JSON array) so the process gets signals (graceful shutdown on `docker stop`).

**Q: `ARG` vs `ENV`?**
`ARG` exists only at **build time** (`--build-arg`). `ENV` persists into the **running container**. Don't put secrets in either: they're visible in image history. Use BuildKit secrets (`RUN --mount=type=secret`).

**Q: `COPY` vs `ADD`?**
`COPY` copies files. `ADD` also extracts local tar archives and can fetch URLs. Prefer `COPY` because it's explicit and predictable.

**Q: Volumes vs bind mounts vs tmpfs?**
Named **volumes** are managed by Docker: use them for persistent data (databases). **Bind mounts** map a host path: use them for live code in development. **tmpfs** is in-memory only: use it for temporary secrets or cache.

**Q: How do containers communicate?**
On a user-defined network (Compose creates one by default), containers reach each other by **service name** via built-in DNS. Ports only need publishing (`ports:`) for host access. `expose` is documentation only.

**Q: `ports` vs `expose`?**
`ports: "8080:80"` publishes container port 80 to host 8080. `expose` documents a port for other containers but doesn't publish it to the host.

**Q: Why use multi-stage builds?**
Build tools (Node, compilers, devDependencies) stay in the build stage, and the final image contains only the static files + Nginx. That takes about 1 GB down to about 25 MB: faster pulls and a smaller attack surface.

**Q: Alpine vs slim vs distroless?**
Alpine is tiny (musl libc, so occasional native module issues). Slim is Debian with fewer packages (glibc, more compatible). Distroless has no shell or package manager: the most secure, but harder to debug.

**Q: How do you make images secure?**
A minimal base image, a non-root `USER`, pinned versions (or digests), no secrets in layers, `.dockerignore` for `.env` and `.git`, scanning images (Trivy, `docker scout`, GitLab container scanning), a read-only filesystem where possible.

**Q: What happens on `docker stop`?**
It sends SIGTERM, waits 10 s, then SIGKILL. Your app should handle SIGTERM to shut down gracefully. Shell-form `CMD npm start` wraps the process in `sh`, which may not forward signals. Use the exec form or `--init`.

**Q: Docker vs Kubernetes?**
Docker builds and runs containers on one host. Kubernetes **orchestrates** containers across a cluster: scheduling, scaling, self-healing, rolling deploys, service discovery. Compose suits local development and simple single-host setups.

**Q: How would you debug a container that keeps crashing?**
`docker logs <c>`, `docker inspect` (exit code, OOMKilled), run it with `--entrypoint sh` to look inside, check the healthcheck, env variables and port binding (`0.0.0.0`, not `127.0.0.1`, inside the container).

**Q: Why does my React app 404 on refresh in Docker?**
Nginx looks for a file at `/orders/42`. Add the `try_files $uri /index.html;` fallback.
