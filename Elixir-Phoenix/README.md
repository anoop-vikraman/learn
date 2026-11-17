# Elixir + Phoenix: from zero to interview-ready

Learn **Elixir** (the language), **OTP** (its concurrency toolkit), **Phoenix** (the web framework) and **LiveView** (server-rendered real-time UI), then build a trial project and prepare for the interview.

**Prerequisites:** none in Elixir. You already know JavaScript, React, Node and Python. The notes compare new ideas to those whenever it helps ("a GenServer is like a tiny Node server with its own private state…").

| # | Folder | Level | Covers |
| --- | --- | --- | --- |
| 00 | [Study plan](00-Study-Plan/) | — | Week-by-week schedule, daily routine, install checklist, best resources |
| 01 | [Elixir basics](01-Elixir-Basics/) | Noob → Beginner | The BEAM, IEx and Mix, types, **pattern matching**, functions and the pipe operator, control flow, Enum/Stream/recursion, structs and protocols, errors and `with` |
| 02 | [OTP and concurrency](02-OTP-Concurrency/) | Beginner → Intermediate | Processes and messages, **GenServer**, **Supervisors** and "let it crash", Tasks, Agents, Registry, ETS |
| 03 | [Phoenix](03-Phoenix/) | Intermediate | Project structure, request lifecycle, router, **plugs**, controllers, **Ecto** (schemas, changesets, queries, migrations), **contexts**, JSON APIs, auth, Channels/PubSub/Presence |
| 04 | [LiveView](04-LiveView/) | Intermediate → Pro | The LiveView lifecycle, events, function and live components, forms, **streams**, real-time with PubSub, uploads, JS hooks |
| 05 | [Testing and production](05-Testing-and-Production/) | Pro | ExUnit, testing Phoenix and LiveView, **Oban** background jobs, releases, Docker, deployment, observability and debugging |
| 06 | [Trial project](06-Trial-Project/) | Pro | A step-by-step build of **TaskMate**: a real-time task board with auth, a JSON API, LiveView UI, background jobs and tests |
| 07 | [Interview prep](07-Interview-Prep/) | — | Q&A with collapsible answers, a one-page cheat sheet, a JS/Python → Elixir translation table |

## How to use these notes

1. Follow [00-Study-Plan/](00-Study-Plan/) — it maps each week to folders.
2. **Type every example into `iex`.** Elixir is learned through your fingers; reading alone won't stick.
3. Each lesson ends with **exercises** and **interview questions**. Do both before moving on.
4. From week 2, build the trial project alongside the lessons.

Each section starts with a one-line `> **In short:**` summary, so you can skim a file before reading it properly. Interview answers are hidden in `<details>` blocks; open the Markdown preview and click a question to see its answer.

## Versions

Examples target **Elixir 1.18+**, **Erlang/OTP 27+**, **Phoenix 1.8** and **LiveView 1.1**. Phoenix 1.8 changed some generators (for example `phx.gen.auth` with magic links and "scopes"). Where older versions differ, the notes say so. To see what you have installed, run `elixir --version` and `mix phx.new --version`.
