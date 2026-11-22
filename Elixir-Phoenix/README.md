# Elixir + Phoenix: from zero to interview-ready

Learn **Elixir** (the language), **OTP** (its concurrency toolkit), **Phoenix** (the web framework) and **LiveView** (server-rendered real-time UI), then build a trial project and prepare for the interview.

**Prerequisites:** none in Elixir. You already know JavaScript, React, Node and Python. The notes compare new ideas to those whenever it helps ("a GenServer is like a tiny Node server with its own private state…").

| # | Folder | Level | Covers |
| --- | --- | --- | --- |
| 00 | [Study plan](00-Study-Plan/) | — | **[The big picture explained simply](00-Study-Plan/01-the-big-picture-explained-simply.md)** (start here), a **[glossary](00-Study-Plan/02-glossary.md)**, week-by-week schedule, install checklist, resources |
| 01 | [Elixir basics](01-Elixir-Basics/) | Noob → Pro | The BEAM, IEx and Mix, types, **pattern matching**, functions and the pipe operator, control flow, Enum/Stream/recursion, structs and protocols, errors and `with`, binaries/dates/Decimal, files/JSON/Erlang interop, **macros**, config and umbrella projects |
| 02 | [OTP and concurrency](02-OTP-Concurrency/) | Beginner → Pro | Processes and messages, **GenServer**, **Supervisors** and "let it crash", Tasks, Agents, Registry, ETS, gen_statem, GenStage/Broadway, **when (not) to use processes** |
| 03 | [Phoenix](03-Phoenix/) | Intermediate → Pro | Project structure, request lifecycle, router, **plugs**, controllers, **Ecto** basics and advanced, **contexts**, JSON APIs, auth, Channels/PubSub/Presence, HEEx/assets/i18n, sessions/cookies/emails/uploads, HTTP clients, webhooks, GraphQL |
| 04 | [LiveView](04-LiveView/) | Intermediate → Pro | The LiveView lifecycle, events, function and live components, forms, **streams**, real-time with PubSub, uploads, JS hooks, async work, `on_mount`, crash recovery, LiveView security and performance |
| 05 | [Testing and production](05-Testing-and-Production/) | Pro | ExUnit, testing Phoenix and LiveView, **Oban** background jobs, releases, Docker, deployment, observability and debugging, **security** |
| 06 | [Trial project](06-Trial-Project/) | Pro | A step-by-step build of **TaskMate**: a real-time task board with auth, a JSON API, LiveView UI, background jobs and tests |
| 07 | [Interview prep](07-Interview-Prep/) | — | Q&A with collapsible answers, a one-page cheat sheet, a JS/Python → Elixir translation table |

## Topic map: where everything lives

Use this to check you've covered everything, or to jump straight to a topic.

| Area | Topics → lesson |
| --- | --- |
| **Foundations** | Why Elixir / BEAM / OTP → [01/00](01-Elixir-Basics/00-what-is-elixir-and-the-beam.md) · IEx, Mix, project layout → [01/01](01-Elixir-Basics/01-setup-iex-mix.md) · whole stack in plain English → [00/01](00-Study-Plan/01-the-big-picture-explained-simply.md) |
| **Data** | Immutability, atoms, lists, tuples, maps, keyword lists, ranges → [01/02](01-Elixir-Basics/02-types-operators-strings.md) · structs → [01/07](01-Elixir-Basics/07-structs-protocols-behaviours.md) · binaries, Unicode, dates, time zones, Decimal → [01/09](01-Elixir-Basics/09-binaries-unicode-dates-numbers.md) |
| **Core language** | Pattern matching, pin, guards → [01/03](01-Elixir-Basics/03-pattern-matching.md) · functions, arity, captures, pipe, alias/import/use → [01/04](01-Elixir-Basics/04-functions-modules-pipe.md) · case/cond/if/with → [01/05](01-Elixir-Basics/05-control-flow.md), [01/08](01-Elixir-Basics/08-errors-with-and-typespecs.md) · recursion, Enum, for, Stream → [01/06](01-Elixir-Basics/06-collections-enum-stream-recursion.md) |
| **Abstractions** | Protocols, behaviours, sigils → [01/07](01-Elixir-Basics/07-structs-protocols-behaviours.md) · macros, AST, `use` → [01/11](01-Elixir-Basics/11-macros-and-metaprogramming.md) |
| **Errors & types** | Tagged tuples, exceptions, bang functions, typespecs, Dialyzer, doctests → [01/08](01-Elixir-Basics/08-errors-with-and-typespecs.md) |
| **Outside world** | IO, File, Path, System, JSON, Erlang libs, ports, NIFs, Mix.install → [01/10](01-Elixir-Basics/10-io-files-system-json-erlang-interop.md) |
| **Tooling** | Config (compile vs runtime), aliases, custom Mix tasks, deps, umbrellas, Hex, Livebook → [01/12](01-Elixir-Basics/12-mix-config-umbrella-hex-livebook.md) |
| **Concurrency** | Processes, send/receive, links, monitors → [02/01](02-OTP-Concurrency/01-processes-and-messages.md) · GenServer → [02/02](02-OTP-Concurrency/02-genserver.md) · supervisors, applications → [02/03](02-OTP-Concurrency/03-supervisors-and-applications.md) · Task, Agent, Registry, ETS, clustering → [02/04](02-OTP-Concurrency/04-tasks-agents-registry-ets.md) · gen_statem, GenStage, Broadway, PartitionSupervisor → [02/05](02-OTP-Concurrency/05-advanced-otp-gen-statem-broadway.md) · process design → [02/06](02-OTP-Concurrency/06-designing-with-processes.md) |
| **Phoenix core** | Setup, structure, generators → [03/01](03-Phoenix/01-setup-and-project-structure.md) · Endpoint, router, plugs, controllers → [03/02](03-Phoenix/02-request-lifecycle-router-plugs-controllers.md) · contexts, JSON APIs → [03/04](03-Phoenix/04-contexts-and-json-api.md) · HEEx, components, layouts, assets, Gettext → [03/07](03-Phoenix/07-heex-assets-layouts-i18n.md) |
| **Database** | Repo, schemas, changesets, migrations, queries, preload, transactions → [03/03](03-Phoenix/03-ecto.md) · associations, embeds, upserts, dynamic queries, locking, UUIDs, multi-tenancy → [03/08](03-Phoenix/08-ecto-advanced.md) |
| **Web plumbing** | Auth, scopes, authorization, API tokens → [03/05](03-Phoenix/05-authentication.md) · sessions, cookies, flash, CSRF, Phoenix.Token, emails, uploads, downloads → [03/09](03-Phoenix/09-sessions-cookies-emails-uploads.md) · HTTP clients, webhooks, GraphQL → [03/10](03-Phoenix/10-http-clients-webhooks-graphql.md) |
| **Real-time** | PubSub, Channels, Presence → [03/06](03-Phoenix/06-channels-pubsub-presence.md) · LiveView basics → [04/01](04-LiveView/01-liveview-basics.md) · components and forms → [04/02](04-LiveView/02-components-and-forms.md) · streams, uploads, JS, hooks → [04/03](04-LiveView/03-streams-pubsub-uploads-hooks.md) · async, on_mount, recovery, LiveView security → [04/04](04-LiveView/04-liveview-advanced.md) |
| **Quality** | ExUnit, sandbox, Mox, testing Phoenix → [05/01](05-Testing-and-Production/01-exunit-and-testing-phoenix.md) · LiveView tests → [04/03](04-LiveView/03-streams-pubsub-uploads-hooks.md), [04/04](04-LiveView/04-liveview-advanced.md) · security → [05/05](05-Testing-and-Production/05-security.md) |
| **Production** | Oban → [05/02](05-Testing-and-Production/02-background-jobs-oban.md) · releases, Docker, Fly.io, CI, clustering → [05/03](05-Testing-and-Production/03-releases-docker-deploy.md) · telemetry, debugging, performance → [05/04](05-Testing-and-Production/04-performance-observability-debugging.md) |
| **Career** | Trial project → [06](06-Trial-Project/README.md) · interview Q&A, cheat sheet, JS/Python translation → [07](07-Interview-Prep/) |

## How to use these notes

1. Follow [00-Study-Plan/](00-Study-Plan/) — it maps each week to folders.
2. **Type every example into `iex`.** Elixir is learned through your fingers; reading alone won't stick.
3. Each lesson ends with **exercises** and **interview questions**. Do both before moving on.
4. From week 2, build the trial project alongside the lessons.

Each lesson opens with a `> **Plain English:**` explanation using an everyday analogy, and each section starts with a one-line `> **In short:**` summary, so you can skim a file before reading it properly. Interview answers are hidden in `<details>` blocks; open the Markdown preview and click a question to see its answer.

## Versions

Examples target **Elixir 1.18+**, **Erlang/OTP 27+**, **Phoenix 1.8** and **LiveView 1.1**. Phoenix 1.8 changed some generators (for example `phx.gen.auth` with magic links and "scopes"). Where older versions differ, the notes say so. To see what you have installed, run `elixir --version` and `mix phx.new --version`.
