# 03 · Releases, Docker and deployment

> **Plain English:** Deploying means getting your app running on a server for real users. A **release** packs your app and the Elixir runtime into one self-contained folder, like a ready-to-eat meal box. **Docker** puts that box in a standard container. Then you ship it to a host such as Fly.io, run database migrations, and connect several servers together if you need more capacity.

## 1. Releases

> **In short:** `mix release` builds a **self-contained package** (your compiled code, dependencies and the Erlang runtime) that runs without Elixir or Mix installed. It's the standard way to deploy.

```bash
mix phx.gen.release          # adds rel/ scripts + lib/my_app/release.ex (migration helper); --docker also adds a Dockerfile
MIX_ENV=prod mix assets.deploy
MIX_ENV=prod mix release

_build/prod/rel/my_app/bin/my_app start      # foreground
_build/prod/rel/my_app/bin/server            # (generated) start with the web server enabled
_build/prod/rel/my_app/bin/my_app remote     # attach IEx to the RUNNING node
_build/prod/rel/my_app/bin/my_app eval "MyApp.Release.migrate()"
```

Why releases?
- Small, reproducible artifacts. No compile step on the server.
- Config is read at boot from `runtime.exs` (env vars).
- **`remote`** gives you an IEx shell into the live production system, a superpower for debugging.

## 2. Migrations in production

> **In short:** Mix isn't available inside a release, so run migrations with the generated `MyApp.Release.migrate/0`.

```elixir
defmodule MyApp.Release do
  @app :my_app

  def migrate do
    load_app()
    for repo <- repos() do
      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end
  end

  def rollback(repo, version) do
    load_app()
    {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :down, to: version))
  end

  defp repos, do: Application.fetch_env!(@app, :ecto_repos)
  defp load_app, do: Application.ensure_loaded(@app)
end
```

Run it as a "release command" before the new version starts (Fly.io `release_command`, a Kubernetes init Job, etc.): `bin/migrate`.

**Zero-downtime migrations:** add columns as nullable first, backfill, then add constraints. Create indexes concurrently (`@disable_ddl_transaction true`, `@disable_migration_lock true`, `create index(..., concurrently: true)`). Never rename or drop a column that the old version still reads during a rolling deploy.

## 3. Docker

> **In short:** `mix phx.gen.release --docker` creates a multi-stage Dockerfile: build in an Elixir image, then copy the release into a slim Debian image.

Simplified version of the generated Dockerfile:

```dockerfile
ARG ELIXIR_VERSION=1.18.4
ARG OTP_VERSION=27.3
ARG DEBIAN_VERSION=bookworm-20250520-slim
ARG BUILDER_IMAGE="hexpm/elixir:${ELIXIR_VERSION}-erlang-${OTP_VERSION}-debian-${DEBIAN_VERSION}"
ARG RUNNER_IMAGE="debian:${DEBIAN_VERSION}"

# ---------- build stage ----------
FROM ${BUILDER_IMAGE} AS builder
RUN apt-get update -y && apt-get install -y build-essential git && apt-get clean
WORKDIR /app
RUN mix local.hex --force && mix local.rebar --force
ENV MIX_ENV="prod"

COPY mix.exs mix.lock ./
RUN mix deps.get --only $MIX_ENV
RUN mkdir config
COPY config/config.exs config/${MIX_ENV}.exs config/
RUN mix deps.compile                       # cached layer if deps didn't change

COPY priv priv
COPY lib lib
COPY assets assets
RUN mix assets.deploy
RUN mix compile
COPY config/runtime.exs config/
COPY rel rel
RUN mix release

# ---------- runtime stage ----------
FROM ${RUNNER_IMAGE}
RUN apt-get update -y && apt-get install -y libstdc++6 openssl libncurses5 locales ca-certificates && apt-get clean
RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen
ENV LANG=en_US.UTF-8 LANGUAGE=en_US:en LC_ALL=en_US.UTF-8
WORKDIR /app
RUN chown nobody /app
ENV MIX_ENV="prod"
COPY --from=builder --chown=nobody:root /app/_build/${MIX_ENV}/rel/my_app ./
USER nobody
CMD ["/app/bin/server"]
```

Local stack with docker-compose:

```yaml
services:
  db:
    image: postgres:16
    environment: { POSTGRES_PASSWORD: postgres }
    ports: ["5432:5432"]
  web:
    build: .
    depends_on: [db]
    ports: ["4000:4000"]
    environment:
      DATABASE_URL: ecto://postgres:postgres@db/my_app_prod
      SECRET_KEY_BASE: "<output of mix phx.gen.secret>"
      PHX_HOST: localhost
      PHX_SERVER: "true"
    command: sh -c "/app/bin/migrate && /app/bin/server"
```

## 4. Where to deploy

> **In short:** Fly.io is the most common choice for Phoenix demos (`fly launch` detects Phoenix). Gigalixir, Render, Railway, and Kubernetes/ECS also work fine.

**Fly.io** (great for the trial project):

```bash
brew install flyctl
fly launch          # detects Phoenix, generates fly.toml + Dockerfile, offers to create Postgres
fly deploy
fly logs
fly ssh console --pty -C "/app/bin/my_app remote"   # IEx into production
```

`fly.toml` contains `release_command = "/app/bin/migrate"`, so migrations run on each deploy.

Required env vars in any environment: `DATABASE_URL`, `SECRET_KEY_BASE`, `PHX_HOST`, `PORT`, `PHX_SERVER=true` (with releases, tells the endpoint to start), and optionally `POOL_SIZE` and `ECTO_IPV6`.

## 5. Clustering in production

> **In short:** Connect your app instances so that PubSub, Presence and LiveView broadcasts reach users on every node.

- New Phoenix apps include **DNSCluster**. Set `DNS_CLUSTER_QUERY` (e.g. `my-app.internal` on Fly) and nodes find each other through DNS.
- On Kubernetes, use **libcluster** with the Kubernetes strategy.
- Set `RELEASE_COOKIE` to the same secret on all nodes, plus `RELEASE_DISTRIBUTION=name` and `RELEASE_NODE=my_app@<ip>`.
- If you can't cluster, use the `Phoenix.PubSub.Redis` adapter instead.

## 6. CI with GitHub Actions

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres }
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      MIX_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: erlef/setup-beam@v1
        with: { elixir-version: "1.18", otp-version: "27" }
      - uses: actions/cache@v4
        with:
          path: |
            deps
            _build
          key: ${{ runner.os }}-mix-${{ hashFiles('mix.lock') }}
      - run: mix deps.get
      - run: mix format --check-formatted
      - run: mix compile --warnings-as-errors
      - run: mix credo --strict          # if credo is added
      - run: mix test
```

Add a deploy job on `main` with `superfly/flyctl-actions` and `fly deploy --remote-only`.

## 7. Hot code upgrades?

> **In short:** The BEAM *can* swap code in a running system without restarting, but almost nobody does that for web apps. Rolling deploys with releases are simpler.

Interviewers sometimes ask about it. Know that it exists (appups/relups, `code_change/3` in GenServer), that it's used in telecom-style systems, and that it's rarely worth the complexity in containerised web deployments.

## Exercises

1. Run `mix phx.gen.release --docker`, build the image, and run it with docker-compose against Postgres.
2. Deploy the trial project to Fly.io (free or low-cost tier), with migrations as the release command.
3. Open a remote IEx session to production and call a context function.
4. Add the GitHub Actions CI workflow.

## Interview questions

<details>
<summary>What is a Mix release and why use it?</summary>

A self-contained build of your application, including compiled BEAM files, dependencies and the Erlang runtime (ERTS), with scripts to start, stop, run remote IEx and evaluate code. It doesn't need Elixir or Mix on the server, starts fast and gives a reproducible artifact. Configuration that varies per environment goes in `runtime.exs`, read at boot.

</details>

<details>
<summary>How do you run migrations when deploying a release?</summary>

Mix isn't in the release, so a `Release` module calls `Ecto.Migrator` (generated by `mix phx.gen.release`), invoked as `bin/my_app eval "MyApp.Release.migrate()"` or the `bin/migrate` script. It runs as a pre-deploy release command, before the new version takes traffic. Migrations should be backward compatible with the old version during rolling deploys.

</details>

<details>
<summary>How do multiple Phoenix nodes share real-time state?</summary>

Nodes are connected into a BEAM cluster (DNSCluster or libcluster, with a shared cookie). Phoenix.PubSub then broadcasts across all nodes, so LiveViews and Channels on any node receive updates, and Presence replicates its CRDT state between nodes. Durable state stays in Postgres, and jobs are coordinated by Oban.

</details>
