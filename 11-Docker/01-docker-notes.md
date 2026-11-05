## 10. Docker and Docker Compose

For a frontend role, the classic question is "how would you containerize a React app?" The answer: a multi-stage build, Node to build, then Nginx to serve the static files.

### Explained simply (read this first)

**Docker solves "it works on my machine".** It packs your app plus everything it needs (the right Node version, OS libraries, config) into one box that runs the same on any computer or server.

- **Dockerfile** = the recipe.
- **Image** = the cake baked from the recipe (read-only, shareable).
- **Container** = a slice being eaten: a running copy of the image. You can run many containers from one image.
- **Docker Compose** = a menu that starts several containers together (frontend + API + database) with one command.

**A simple Dockerfile, line by line:**

```dockerfile
FROM node:22-alpine         # start from an image that already has Node (alpine = small Linux)
WORKDIR /app                # all following commands run in /app inside the container
COPY package*.json ./       # copy ONLY the dependency files first...
RUN npm ci                  # ...and install. This layer is cached until package.json changes
COPY . .                    # now copy the rest of the source code
EXPOSE 5173                 # documents which port the app uses (doesn't actually open it)
CMD ["npm", "run", "dev", "--", "--host"]   # the command that runs when the container starts
```

**Why copy package.json first? Layer caching.** Each line creates a layer, and Docker reuses a layer if nothing it depends on has changed. You change source code all the time but dependencies rarely, so installing first means rebuilds skip the slow `npm ci` step.

**Production React app: multi-stage build.** Stage 1 has Node and all the build tools (about 1 GB). Stage 2 copies *only* the built static files into a tiny Nginx web server (about 50 MB). Node isn't even in the final image.

```dockerfile
# ---------- Stage 1: build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL                      # passed with --build-arg, baked into the JS bundle
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build                     # outputs /app/dist

# ---------- Stage 2: serve ----------
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```nginx
# nginx.conf: the SPA fallback means /profile/123 serves index.html, and React Router takes over
server {
  listen 80;
  root /usr/share/nginx/html;
  location / {
    try_files $uri $uri/ /index.html;
  }
  location /assets/ {
    expires 1y;                       # hashed filenames, so cache forever
    add_header Cache-Control "public, immutable";
  }
}
```

```text
# .dockerignore: keeps the build fast and stops secrets leaking into the image
node_modules
dist
.git
.env
*.log
```

**Commands you should know:**

```bash
docker build -t my-app .                         # build an image from the Dockerfile in this folder
docker build --build-arg VITE_API_URL=https://api.x.com -t my-app .
docker run -d -p 8080:80 --name web my-app       # run it; open http://localhost:8080
                                                 # -p HOST:CONTAINER, -d = in the background
docker ps                                        # list running containers
docker logs -f web                               # follow its logs
docker exec -it web sh                           # open a shell inside the running container
docker stop web && docker rm web                 # stop and remove
docker images / docker rmi my-app                # list / remove images
```

**Docker Compose: the whole stack in one file.**

```yaml
# compose.yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:5173"
    volumes:
      - ./frontend:/app          # bind mount: edit code on your laptop, changes appear live in the container
      - /app/node_modules        # but keep the container's own node_modules
    environment:
      - VITE_API_URL=http://localhost:4000
    depends_on:
      - api

  api:
    build: ./api
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=postgres://app:secret@db:5432/app   # "db" = the service name below, not localhost
    depends_on:
      db:
        condition: service_healthy                        # wait until Postgres is actually ready

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data                   # named volume: data survives restarts
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 5

volumes:
  pgdata:
```

```bash
docker compose up -d --build     # build and start everything
docker compose logs -f api       # logs for one service
docker compose exec db psql -U app   # run a command in a service
docker compose down              # stop and remove containers (data in volumes is kept)
docker compose down -v           # ...and delete volumes too (wipes the database)
```

**How containers talk to each other:** Compose puts all services on one private network, where each service's name works as its hostname. The API reaches Postgres at `db:5432`. The browser, which runs on your laptop and not in Docker, reaches the API through the published port, `localhost:4000`.

### Core concepts

- **Image vs container:** an image is a read-only template built in layers; a container is a running instance of an image.
- **Dockerfile instructions:** `FROM`, `WORKDIR`, `COPY`, `RUN` (build time), `CMD`/`ENTRYPOINT` (run time), `ENV`, `ARG` (build-time only), `EXPOSE` (documentation only), `USER`.
- **Layer caching:** copy `package*.json` and install *before* copying the source, so the dependency layer is reused when only code changes.
- **Multi-stage builds:** the final image contains only what it needs, so it's small and more secure.
- **`.dockerignore`:** exclude `node_modules`, `.git`, `dist` and `.env`.
- **Volumes** (persistent data, or bind mounts for live code in dev), **networks** (containers reach each other by service name), port mapping `-p 8080:80` (host:container).
- Commands: `docker build -t app .`, `docker run -p 8080:80 app`, `docker ps`, `docker logs -f`, `docker exec -it <id> sh`, `docker compose up -d --build`, `docker compose down -v`.

```dockerfile
# Stage 1: build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```yaml
# compose.yaml
services:
  web:
    build: ./web
    ports: ["3000:80"]
    depends_on:
      api:
        condition: service_healthy
  api:
    build: ./api
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/app
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
  db:
    image: postgres:16
    environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: secret }
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  pgdata:
```

### Likely questions

- Docker vs a virtual machine? (Containers share the host kernel: lighter and faster to start. VMs run a full guest OS.)
- How do you keep images small? (Alpine or distroless base images, multi-stage builds, `.dockerignore`, fewer layers.)
- `CMD` vs `ENTRYPOINT`? `ARG` vs `ENV`? `COPY` vs `ADD`?
- What does Docker Compose add? (Multi-container apps defined in one file: shared network, volumes, startup order.)

### Gotchas

- SPA routing in Nginx needs `try_files $uri /index.html;` or refreshing a deep link returns 404.
- `VITE_*`/`REACT_APP_*` variables are baked in at build time. The same image can't change them per environment unless you inject a runtime `config.js`.
- `depends_on` only orders startup. It doesn't wait for readiness unless you use `condition: service_healthy`.
- Inside a container, `localhost` is the container itself. Use the service name (`api:4000`).
- Bind-mounting the project over `/app` hides the container's `node_modules`. Add an anonymous volume for it.
- Run as a non-root `USER` in production images.

