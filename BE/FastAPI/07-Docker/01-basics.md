# 01 · Docker basics

## 1. Why Docker?

> **In short:** Same environment everywhere, one-command setup, and the same image from CI to production.

- "Works on my machine" problems disappear: the image contains the exact Python version, OS libraries and dependencies.
- New developers start the whole stack (API, database, Redis) with one command.
- The **same image** is tested in CI and deployed to production.
- Containers are lightweight (they share the host's kernel), unlike virtual machines.

## 2. Core concepts

> **In short:** Images, containers, Dockerfiles, registries, tags, volumes, networks and Compose.

| Concept | Meaning |
| --- | --- |
| **Image** | A read-only template: filesystem + metadata (what to run). Built from a **Dockerfile**, made of **layers** |
| **Container** | A running instance of an image, with its own writable layer, processes and network |
| **Dockerfile** | Recipe for building an image |
| **Registry** | Stores images: Docker Hub, GitHub Container Registry (ghcr.io), AWS ECR, GCP Artifact Registry |
| **Tag** | Version label: `python:3.12-slim`, `myapi:1.4.2`, `myapi:sha-a1b2c3d` |
| **Volume** | Persistent storage that survives container removal (database data) |
| **Bind mount** | A host folder mounted into a container (live code in development) |
| **Network** | Lets containers talk to each other by name |
| **Compose** | Defines and runs multi-container apps from a YAML file |

Image → `docker run` → container. Many containers can run from one image.

## 3. Installing

> **In short:** Docker Desktop or Docker Engine, and how to check the installation.

- **Docker Desktop** (Windows/macOS/Linux) or **Docker Engine** on Linux (`sudo apt install docker.io docker-compose-plugin`, or the official repository).
- Linux: add yourself to the `docker` group to run without sudo (`sudo usermod -aG docker $USER`, then log out/in).
- Check: `docker version`, `docker compose version`.

## 4. Essential commands

> **In short:** Build, run, list, inspect, log into, stop and clean up images and containers.

```bash
# Images
docker pull postgres:17                 # download
docker images                           # list
docker build -t task-api:dev .          # build from ./Dockerfile
docker rmi task-api:dev                 # remove
docker image prune                      # remove dangling images

# Containers
docker run -d --name api -p 8000:8000 task-api:dev     # detached, name, port host:container
docker run --rm -it python:3.12-slim bash               # interactive, removed on exit
docker ps                               # running containers (-a for all)
docker logs -f api                      # follow logs
docker exec -it api bash                # shell inside a running container (sh on alpine)
docker stop api && docker rm api
docker restart api
docker inspect api                      # full details (JSON)
docker stats                            # live CPU/memory per container

# Environment variables
docker run -e DATABASE_URL=postgresql://... -e DEBUG=false task-api:dev
docker run --env-file .env task-api:dev

# Clean up (careful)
docker system df                        # disk usage
docker system prune                     # remove stopped containers, unused networks, dangling images
docker volume prune                     # ⚠️ removes unused volumes (data!)
```

## 5. Ports

> **In short:** Publish container ports to the host; apps must listen on 0.0.0.0.

A container's ports are private until **published**: `-p HOST:CONTAINER`.

```bash
docker run -p 8000:8000 task-api        # http://localhost:8000 → container port 8000
docker run -p 127.0.0.1:5432:5432 postgres:17   # only reachable from this machine
```

Inside the container, the app must listen on **`0.0.0.0`**, not `127.0.0.1`, or it isn't reachable from outside the container.

## 6. Volumes and bind mounts

> **In short:** Persist data in volumes; mount host folders for live development.

```bash
# Named volume: managed by Docker, for persistent data
docker volume create pgdata
docker run -d -v pgdata:/var/lib/postgresql/data -e POSTGRES_PASSWORD=secret postgres:17

# Bind mount: host folder → container (development: live code reload)
docker run -v "$(pwd)/app:/code/app" -p 8000:8000 task-api:dev

docker volume ls
docker volume inspect pgdata
```

A container's own filesystem is **temporary**: delete the container and its changes are gone. Anything that must persist goes in a volume (or an external service like S3/managed DB).

## 7. Networks

> **In short:** Containers on the same network reach each other by service name.

```bash
docker network create backend
docker run -d --name db --network backend -e POSTGRES_PASSWORD=secret postgres:17
docker run -d --name api --network backend -e DATABASE_URL=postgresql://postgres:secret@db:5432/postgres task-api
#                                                                                   ^^ container name = hostname
```

Containers on the same user-defined network reach each other **by name** (`db`, `redis`). Compose creates such a network automatically. ⚠️ Inside a container, `localhost` means **that container**, not your machine or another container.

## 8. How layers and caching work

> **In short:** Unchanged layers are reused, so put rarely-changing steps first.

Each Dockerfile instruction creates a **layer**. Docker caches layers and reuses them if the instruction and its inputs haven't changed. Once a layer changes, every layer after it is rebuilt. That's why Dockerfiles copy dependency files and install them **before** copying the source code (lesson 02).

## 9. Containers vs virtual machines

> **In short:** Containers share the host kernel and are lighter; VMs run a full OS.

| | Container | Virtual machine |
| --- | --- | --- |
| Isolation | Process-level (shares host kernel) | Full OS with its own kernel |
| Start time | Milliseconds–seconds | Minutes |
| Size | MBs | GBs |
| Use | Packaging and running apps | Running different OSes, strong isolation |

---

## 10. Exercises

1. Run PostgreSQL in a container with a named volume; create a table; remove and recreate the container and confirm the data survived.
2. Run Redis and connect with `docker exec -it redis redis-cli`.
3. Create a network, run Postgres and an `adminer` container on it, and connect Adminer to `db` by name.
4. Run `python:3.12-slim` interactively and install a package; exit and confirm the change is gone in a new container.
5. Use `docker stats` and `docker logs -f` while sending requests to a container.
