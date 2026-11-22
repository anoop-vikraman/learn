# 12 · Mix in depth: config, custom tasks, umbrella projects, Hex and Livebook

> **Plain English:** Mix is your project manager. It installs packages, compiles, tests and runs tasks. This lesson covers how configuration works, how to write your own `mix something` commands, how big projects are split into several apps, and how to use Livebook notebooks.

## 1. Application configuration

> **In short:** Config files set values per application, and your code reads them with `Application.get_env/3` or `Application.fetch_env!/2`. Values set in `runtime.exs` are read when the app **starts**; the other config files are read when it **compiles**.

```elixir
# config/config.exs
import Config

config :my_app,
  greeting: "Hello",
  feature_flags: [new_dashboard: false]

config :my_app, MyApp.Mailer, adapter: Swoosh.Adapters.Local

import_config "#{config_env()}.exs"     # loads dev.exs / test.exs / prod.exs
```

```elixir
# reading config
Application.get_env(:my_app, :greeting)                 # "Hello"
Application.get_env(:my_app, :missing, "default")
Application.fetch_env!(:my_app, :greeting)              # raises if missing
Application.get_env(:my_app, MyApp.Mailer)[:adapter]
```

### Compile time vs runtime: the classic gotcha

```elixir
defmodule MyApp.Client do
  # ❌ Read ONCE at compile time and baked into the build.
  #    Changing the env var later does nothing.
  @api_url Application.get_env(:my_app, :api_url)

  # ✅ Explicit compile-time config: Elixir warns you if the value changes between compile and boot
  @api_url Application.compile_env(:my_app, :api_url)

  # ✅ Read at runtime, every call. Use this for anything set in runtime.exs
  defp api_url, do: Application.fetch_env!(:my_app, :api_url)
end
```

| File | When it runs | Put here |
| --- | --- | --- |
| `config/config.exs` | Compile time | Defaults, library setup |
| `config/dev.exs`, `test.exs`, `prod.exs` | Compile time | Per-environment settings |
| `config/runtime.exs` | **Boot time**, also in releases | Secrets and env vars (`DATABASE_URL`, API keys) |

### Libraries shouldn't rely on app config

If you write a reusable library, accept options as function arguments or `start_link` options instead of reading global config. This makes the code testable and lets two instances run with different settings.

## 2. Mix aliases

> **In short:** Aliases in `mix.exs` combine several commands under one name. Phoenix defines `setup`, `ecto.reset`, `test` and `precommit` this way.

```elixir
defp aliases do
  [
    setup: ["deps.get", "ecto.setup", "assets.setup", "assets.build"],
    "ecto.setup": ["ecto.create", "ecto.migrate", "run priv/repo/seeds.exs"],
    "ecto.reset": ["ecto.drop", "ecto.setup"],
    test: ["ecto.create --quiet", "ecto.migrate --quiet", "test"],
    lint: ["format --check-formatted", "credo --strict", "compile --warnings-as-errors"]
  ]
end
```

Run with `mix setup` or `mix lint`.

## 3. Writing a custom Mix task

> **In short:** A module named `Mix.Tasks.Something` with `use Mix.Task` and a `run/1` function becomes the command `mix something`.

```elixir
# lib/mix/tasks/tasks.report.ex
defmodule Mix.Tasks.Tasks.Report do
  @shortdoc "Prints how many tasks each user has"
  @moduledoc """
  Usage:

      mix tasks.report [--only-open]
  """
  use Mix.Task

  @requirements ["app.start"]          # start the app (Repo etc.) before running

  @impl Mix.Task
  def run(args) do
    {opts, _rest, _invalid} = OptionParser.parse(args, strict: [only_open: :boolean])

    MyApp.Tasks.count_by_user(only_open: opts[:only_open] || false)
    |> Enum.each(fn {email, count} -> Mix.shell().info("#{email}: #{count}") end)
  end
end
```

```bash
mix tasks.report --only-open
mix help tasks.report
```

**Note:** Mix isn't available inside a release. For production one-off jobs, write a plain module function and run it with `bin/my_app eval "MyApp.Release.some_task()"`.

## 4. Dependencies in depth

```elixir
defp deps do
  [
    {:phoenix, "~> 1.8"},                                   # from Hex
    {:credo, "~> 1.7", only: [:dev, :test], runtime: false},# dev-only tool, not started at runtime
    {:mox, "~> 1.0", only: :test},
    {:my_lib, path: "../my_lib"},                           # local folder
    {:some_fork, github: "me/some_fork", branch: "fix"},    # from GitHub
    {:heavy, "~> 1.0", optional: true}
  ]
end
```

```bash
mix deps.get            # install
mix deps.update phoenix # update one package
mix deps.update --all
mix deps.tree           # dependency tree
mix deps.unlock --unused
mix hex.outdated
mix hex.audit           # retired or insecure packages
```

Version rules: `~> 1.8` means `>= 1.8.0 and < 2.0.0`, and `~> 1.8.2` means `>= 1.8.2 and < 1.9.0`.

## 5. Umbrella projects and other ways to split a big app

> **In short:** An umbrella project holds several Mix apps in one repository (`apps/core`, `apps/web`, ...) that are compiled and tested together but keep separate boundaries. Most teams today prefer **one app with good contexts**, and use umbrellas only when they need separate deployables or strict boundaries.

```bash
mix new my_platform --umbrella
cd my_platform/apps
mix new core --sup
mix phx.new.web web          # or: mix phx.new my_platform --umbrella  (generates *_web + core apps)
```

```
my_platform/
├── apps/
│   ├── core/          # business logic, Repo, contexts
│   └── web/           # Phoenix; depends on core with {:core, in_umbrella: true}
├── config/            # shared config for every app
└── mix.exs
```

| Option | Pros | Cons |
| --- | --- | --- |
| **Single app + contexts** (most common) | Simple, one config, fast to work in | Boundaries are only a convention (the **Boundary** library can enforce them) |
| **Umbrella** | Enforced dependencies between apps; each app can go into a different release | More configuration, everything is still compiled together, circular-dependency pain |
| **Separate repos / Hex packages** | Fully independent | Versioning overhead |
| **Poncho projects** (sibling apps with path deps) | Explicit dependencies without umbrella config sharing | Slightly more setup |

Interview answer: "I'd start with a single Phoenix app and clear contexts. I'd consider an umbrella or separate releases only if parts must deploy independently or need hard boundaries."

## 6. Publishing a package to Hex (briefly)

```elixir
def project do
  [
    app: :my_lib, version: "0.1.0",
    description: "Does a useful thing",
    package: [licenses: ["MIT"], links: %{"GitHub" => "https://github.com/me/my_lib"}],
    docs: [main: "readme", extras: ["README.md"]]
  ]
end
```

```bash
mix hex.user register
mix docs             # with {:ex_doc, ...} → HexDocs-style HTML
mix hex.publish
```

## 7. Livebook: interactive notebooks

> **In short:** Livebook is Jupyter for Elixir. Code cells, Markdown, charts and interactive inputs, and it can connect to a running app. It's great for learning, data exploration and documentation.

```bash
mix escript.install hex livebook
livebook server
# or install the desktop app from livebook.dev
```

Use it to:
- practise these lessons interactively (each cell is a mini IEx),
- explore data with **Explorer** (dataframes) and **VegaLite** (charts),
- try ML models with **Bumblebee** (Hugging Face models) and **Nx**,
- attach to your running Phoenix app and call contexts ("runtime: attached node"),
- write runnable runbooks for your team.

```elixir
# In a Livebook cell
Mix.install([{:req, "~> 0.5"}, {:kino, "~> 0.14"}])
data = Req.get!("https://api.github.com/repos/phoenixframework/phoenix").body
Kino.Tree.new(data)
```

## 8. Useful compiler and project commands

```bash
mix compile --warnings-as-errors
mix xref graph --label compile-connected   # find modules that cause big recompiles
mix xref callers MyApp.Tasks               # who calls this module
mix app.tree                               # application dependency tree
mix clean && mix compile                   # fresh build
MIX_ENV=prod mix compile
mix escript.build                          # build a CLI executable (needs Erlang installed)
```

## Exercises

1. Add a `:support_email` config in `config.exs`, override it in `runtime.exs` from an env var, and read it in IEx.
2. Find a module attribute in your project that reads config with `Application.get_env` at compile time, and fix it.
3. Write a `mix tasks.seed_demo` task with `@requirements ["app.start"]` that creates demo data.
4. Add a `lint` alias and run it.
5. Install Livebook and redo the lesson 06 Enum exercises in a notebook.

## Interview questions

<details>
<summary>What's the difference between Application.get_env in a module attribute and inside a function?</summary>

A module attribute is evaluated at **compile time**, so the value is frozen into the compiled code, and changes to `runtime.exs` or env vars are ignored. Calling `Application.get_env/fetch_env!` inside a function reads the value at **runtime**. Use `Application.compile_env/3` when you really do want compile-time config, because it warns if the runtime value differs.

</details>

<details>
<summary>What is an umbrella project and when would you use one?</summary>

A Mix project containing several applications under `apps/`, sharing config and build, with explicit dependencies between them (`in_umbrella: true`). Use one when you need enforced boundaries between parts of the system or want to build different releases from subsets of the apps. For most products, a single app with well-designed contexts is simpler and preferred.

</details>

<details>
<summary>How do you run a one-off task in production if Mix isn't available?</summary>

Put the logic in a regular module function (often in `MyApp.Release`) and call it with `bin/my_app eval "MyApp.Release.task()"`, or from a remote console with `bin/my_app remote`. Mix tasks are a development and CI tool and aren't included in releases.

</details>
