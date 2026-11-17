# 01 · Phoenix setup and project structure

## 1. Create and run an app

> **In short:** `mix phx.new my_app`, then `mix ecto.create`, then `mix phx.server`, and open localhost:4000.

```bash
mix phx.new task_mate          # add --no-html for API-only, --database sqlite3 for SQLite, --binary-id for UUIDs
cd task_mate
mix setup                      # deps.get + ecto.setup + assets setup (see "aliases" in mix.exs)
mix phx.server                 # or: iex -S mix phx.server  (recommended: you get a shell into the running app)
```

Open http://localhost:4000. In dev also visit http://localhost:4000/dev/dashboard (**LiveDashboard**: processes, memory, requests, Ecto stats) and http://localhost:4000/dev/mailbox (emails sent in dev).

Database credentials are in `config/dev.exs` (default `postgres`/`postgres` on localhost).

**Live reload:** save a template or CSS file and the browser refreshes. Elixir code changes are recompiled on the next request.

## 2. Folder structure

> **In short:** `lib/my_app/` holds **business logic** (contexts, schemas, no web code), and `lib/my_app_web/` holds the **web interface** (router, controllers, LiveViews, components).

```
task_mate/
├── assets/                      # front-end: app.js, app.css (Tailwind v4 + daisyUI in Phoenix 1.8), vendor/
│   ├── js/app.js                # LiveSocket setup, hooks
│   └── css/app.css
├── config/
│   ├── config.exs               # shared compile-time config
│   ├── dev.exs / test.exs / prod.exs
│   └── runtime.exs              # read at boot: DATABASE_URL, SECRET_KEY_BASE, PHX_HOST, PORT
├── lib/
│   ├── task_mate/               # ◀── CORE / DOMAIN ("the app")
│   │   ├── application.ex       # supervision tree
│   │   ├── repo.ex              # Ecto Repo (DB access)
│   │   ├── mailer.ex
│   │   └── tasks/ + tasks.ex    # a context (generated later): TaskMate.Tasks
│   ├── task_mate_web/           # ◀── WEB LAYER
│   │   ├── endpoint.ex          # entry point for every request: the plug pipeline
│   │   ├── router.ex            # routes + pipelines
│   │   ├── telemetry.ex         # metrics
│   │   ├── gettext.ex           # i18n
│   │   ├── components/
│   │   │   ├── core_components.ex   # <.button>, <.input>, <.table>, <.modal>... (generated: yours to edit)
│   │   │   ├── layouts.ex           # <Layouts.app>, root layout
│   │   │   └── layouts/root.html.heex
│   │   ├── controllers/
│   │   │   ├── page_controller.ex
│   │   │   ├── page_html.ex          # view module: functions/templates for HTML
│   │   │   ├── page_html/home.html.heex
│   │   │   └── error_html.ex / error_json.ex
│   │   └── live/                # LiveViews (when generated)
│   └── task_mate_web.ex         # defines what `use TaskMateWeb, :controller | :live_view | :html` injects
├── priv/
│   ├── repo/migrations/         # DB migrations
│   ├── repo/seeds.exs           # seed data: mix run priv/repo/seeds.exs
│   ├── static/                  # compiled assets, favicon, robots.txt
│   └── gettext/
├── test/
│   ├── support/                 # ConnCase, DataCase, fixtures
│   └── task_mate_web/ ...
├── mix.exs / mix.lock
└── .formatter.exs
```

**Why the split?** Business logic shouldn't know about HTTP. The same `TaskMate.Tasks.create_task/2` can be called from a controller, a LiveView, a GraphQL resolver, an Oban job or IEx. Interviewers like to hear this.

## 3. `task_mate_web.ex`: the `use` magic explained

> **In short:** `use TaskMateWeb, :controller` calls a function in this file that injects imports and aliases, so read it once.

```elixir
defmodule TaskMateWeb do
  def controller do
    quote do
      use Phoenix.Controller, formats: [:html, :json]
      import Plug.Conn
      unquote(verified_routes())   # enables ~p"/path"
    end
  end

  def live_view do
    quote do
      use Phoenix.LiveView
      unquote(html_helpers())
    end
  end
  # ...
  defmacro __using__(which) when is_atom(which), do: apply(__MODULE__, which, [])
end
```

## 4. Generators: scaffolding

> **In short:** Generators create a context, schema, migration, web layer and tests in one command. Use them to learn the conventions, then customise.

```bash
# HTML CRUD (controllers + templates)
mix phx.gen.html Tasks Task tasks title:string description:text done:boolean due_on:date

# LiveView CRUD
mix phx.gen.live Tasks Task tasks title:string done:boolean

# JSON API
mix phx.gen.json Tasks Task tasks title:string done:boolean

# Only context + schema + migration (no web)
mix phx.gen.context Tasks Task tasks title:string

# Only schema + migration
mix phx.gen.schema Tasks.Task tasks title:string

# Authentication (see lesson 05)
mix phx.gen.auth Accounts User users

# Migration only
mix ecto.gen.migration add_priority_to_tasks
```

Argument order: **Context** (module, plural-ish: `Tasks`), **Schema** (singular: `Task`), **table** (plural: `tasks`), then `field:type`. Types include `string`, `text`, `integer`, `boolean`, `date`, `utc_datetime`, `decimal`, `map`, `references:users`, `enum:low:medium:high`, and `array:string`.

After generating, the output tells you to add routes to `router.ex` and run `mix ecto.migrate`.

## 5. Config essentials

> **In short:** Compile-time config lives in `config/*.exs`, and runtime config (secrets, URLs) lives in `runtime.exs` via env vars. Read config with `Application.get_env/3`.

```elixir
# config/runtime.exs (simplified)
if config_env() == :prod do
  database_url = System.get_env("DATABASE_URL") || raise "DATABASE_URL is missing"
  config :task_mate, TaskMate.Repo, url: database_url, pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10")

  secret_key_base = System.get_env("SECRET_KEY_BASE") || raise "SECRET_KEY_BASE missing"
  config :task_mate, TaskMateWeb.Endpoint,
    url: [host: System.get_env("PHX_HOST"), port: 443, scheme: "https"],
    http: [ip: {0, 0, 0, 0, 0, 0, 0, 0}, port: String.to_integer(System.get_env("PORT") || "4000")],
    secret_key_base: secret_key_base
end
```

`mix phx.gen.secret` generates a `SECRET_KEY_BASE`.

## 6. Useful mix tasks

| Command | Purpose |
| --- | --- |
| `mix phx.routes` | List all routes (like `rails routes`) |
| `mix ecto.create / ecto.drop` | Create / drop the DB |
| `mix ecto.migrate / ecto.rollback` | Run / undo migrations |
| `mix ecto.reset` | Drop, create, migrate, seed |
| `mix test` | Tests (uses a sandboxed test DB) |
| `mix phx.gen.secret` | Random secret |
| `mix assets.deploy` | Build minified assets for production |
| `mix precommit` | Phoenix 1.8 alias: compile with warnings as errors, unlock unused deps, format, test |

## Exercises

1. Create `task_mate` (you'll keep building it in [06-Trial-Project](../06-Trial-Project/)). Run it and open LiveDashboard.
2. Run `mix phx.routes` and match each route to its controller.
3. Open `application.ex`, `endpoint.ex`, `router.ex` and `task_mate_web.ex`. Write a one-line comment above each section explaining what it does.
4. Change the home page text in `page_html/home.html.heex` and watch it live reload.

## Interview questions

<details>
<summary>Why does Phoenix split my_app and my_app_web?</summary>

To separate the **domain** (business logic, data, rules) from the **web interface**. `my_app` holds contexts and schemas with no knowledge of HTTP. `my_app_web` holds the router, controllers, LiveViews and templates, which call context functions. The same logic can then be reused from APIs, LiveViews, background jobs or the console, and it's easier to test in isolation.

</details>

<details>
<summary>What's the difference between config.exs and runtime.exs?</summary>

`config.exs` and the environment files are evaluated at **compile time** and baked into the build. `runtime.exs` is evaluated when the app **boots**, including inside a release, so it's where environment variables (secrets, DB URL, host, port) are read. One compiled release can then run in different environments.

</details>
