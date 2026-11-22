# Glossary: every term in plain English

Keep this open while you read the lessons. Terms are grouped by topic and explained without jargon where possible.

## Language and runtime

| Term | Plain-English meaning |
| --- | --- |
| **BEAM** | The virtual machine that runs Erlang and Elixir code, like V8 for JavaScript or the JVM for Java |
| **Erlang** | The older language Elixir is built on. Elixir can call any Erlang library directly |
| **OTP** | Erlang's standard toolkit for building concurrent, crash-resistant systems (GenServer, Supervisor, etc.) |
| **Module** | A named container for functions (`defmodule Math do ... end`). There are no classes |
| **Function / arity** | A named piece of code. *Arity* is how many arguments it takes. `add/2` takes 2 |
| **Anonymous function** | A function without a name, stored in a variable: `fn x -> x * 2 end`. Called with a dot: `f.(3)` |
| **Capture `&`** | A shortcut to make a function: `&(&1 * 2)` or `&String.upcase/1` |
| **Pipe `|>`** | Passes the value on the left as the first argument of the function on the right |
| **Immutable** | Can't be changed. Every "change" produces a new value |
| **Rebinding** | Pointing a variable name at a new value (`x = 1; x = 2`). The old value itself is untouched |
| **Atom** | A constant whose value is its name: `:ok`, `:error`. Used as tags and keys |
| **Tuple** | A fixed-size group of values in curly braces: `{:ok, 42}` |
| **List** | An ordered collection in square brackets, stored as a linked list: `[1, 2, 3]` |
| **Map** | A key-value collection: `%{name: "Ana"}` |
| **Keyword list** | A list of `{atom, value}` pairs, used for options: `[timeout: 5000]` |
| **Struct** | A map with a fixed set of named fields and a type name: `%User{name: "Ana"}` |
| **Binary / string** | Elixir strings are binaries (raw bytes) encoded in UTF-8 |
| **Charlist** | A list of character codes (`~c"hi"`), mainly for talking to Erlang libraries |
| **Sigil** | A shortcut starting with `~`: `~r/regex/`, `~w(words)`, `~D[2026-01-01]`, `~p"/path"` |
| **Pattern matching** | Checking that data has a certain shape and pulling values out of it at the same time |
| **Match operator `=`** | Makes the left side match the right side. It is not plain assignment |
| **Pin `^`** | "Use the current value of this variable" inside a pattern, instead of rebinding it |
| **Guard** | An extra condition on a function clause: `when is_integer(x) and x > 0` |
| **Clause** | One version of a function. A function can have several clauses that match different inputs |
| **Tagged tuple** | The `{:ok, value}` / `{:error, reason}` convention for results |
| **Bang function `!`** | A function that raises an error instead of returning `{:error, ...}`: `File.read!/1` |
| **Predicate `?`** | A function returning true or false: `String.contains?/2` |
| **Protocol** | A way to make one function work differently for different data types (like interfaces for data) |
| **Behaviour** | A list of functions a module promises to implement (like an interface for modules) |
| **Macro** | Code that writes code at compile time. `if`, `def` and Phoenix's router are macros |
| **AST** | "Abstract syntax tree": code represented as data, which is what macros work with |
| **`use`** | "Let this other module inject its setup code into mine" |
| **`alias` / `import` / `require`** | Shorten a module name / call its functions without a prefix / enable its macros |
| **Module attribute** | A compile-time constant or annotation: `@timeout 5000`, `@doc`, `@spec` |
| **Typespec** | An optional type annotation: `@spec add(integer, integer) :: integer` |
| **Dialyzer** | A tool that reads typespecs and finds type mistakes |
| **Recursion** | A function calling itself, used instead of loops |
| **Tail call** | A recursive call that is the very last step, so it uses no extra memory |
| **Enum** | The module for working with collections (map, filter, reduce...) |
| **Stream** | A lazy version of Enum: work happens only when results are needed |
| **Comprehension** | The `for x <- list, do: ...` syntax for mapping and filtering |

## Tooling

| Term | Plain-English meaning |
| --- | --- |
| **IEx** | The interactive Elixir shell (REPL) |
| **Mix** | The build tool: create projects, run tests, install packages |
| **Hex** | The package registry (like npm) |
| **`mix.exs`** | Project file listing the name, version and dependencies (like `package.json`) |
| **`mix.lock`** | Exact dependency versions (like `package-lock.json`) |
| **ExUnit** | The built-in test framework |
| **Doctest** | Examples in documentation that are run as tests |
| **Credo** | A linter (style and code quality checks) |
| **Formatter** | `mix format`: the official auto-formatter |
| **Livebook** | An interactive notebook for Elixir, like Jupyter |
| **Umbrella project** | One repository containing several Mix apps that are developed together |
| **Release** | A self-contained build of your app that includes the BEAM runtime, ready to deploy |

## Processes and OTP

| Term | Plain-English meaning |
| --- | --- |
| **Process** | A tiny, isolated worker managed by the BEAM. It isn't an OS thread |
| **PID** | Process identifier, the "address" of a process: `#PID<0.120.0>` |
| **Mailbox** | The queue of messages waiting for a process |
| **`send` / `receive`** | Put a message in a mailbox / take a matching message out |
| **Scheduler** | The part of the BEAM that shares CPU time fairly between processes (one per core) |
| **Preemptive** | The scheduler can pause any process to let others run, so nobody hogs the CPU |
| **Reduction** | A unit of work the scheduler counts to decide when to switch processes |
| **Link** | A two-way bond: if one process crashes, the linked one is told (and usually dies too) |
| **Monitor** | A one-way watch: you get a message when the watched process dies |
| **Trap exits** | Turn crash signals into normal messages instead of dying |
| **GenServer** | A standard "stateful server" process: holds data and handles calls and casts |
| **call / cast** | Ask and wait for a reply / send and don't wait |
| **`handle_info`** | Where a GenServer or LiveView handles "other" messages (timers, PubSub) |
| **State** | The data a process holds between messages |
| **Supervisor** | A process that starts other processes and restarts them if they crash |
| **Supervision tree** | Supervisors supervising supervisors, forming a tree |
| **Restart strategy** | How a supervisor reacts to a crash: one_for_one, one_for_all, rest_for_one |
| **Child spec** | Instructions telling a supervisor how to start and restart a child |
| **DynamicSupervisor** | A supervisor for children that are started on demand at runtime |
| **Application** | A component with its own supervision tree that starts and stops as a unit |
| **Task** | A process for one job, often with `async`/`await` |
| **Agent** | A simple process that only stores state |
| **Registry** | A lookup table from names to processes |
| **ETS** | Erlang Term Storage: fast in-memory tables that many processes can read at once |
| **`:persistent_term`** | Super-fast storage for data that almost never changes |
| **Node** | One running BEAM instance. Several nodes can connect into a cluster |
| **Cookie** | A shared secret that lets nodes connect to each other |
| **gen_statem** | An OTP behaviour for state machines (e.g. locked/unlocked) |
| **GenStage / Broadway** | Libraries for processing streams of data with back-pressure |
| **Back-pressure** | Slowing producers down when consumers can't keep up |
| **NIF** | Native Implemented Function: C or Rust code called from Elixir for speed |
| **"Let it crash"** | Let unexpected errors crash a process and rely on supervisors to restart it |

## Phoenix

| Term | Plain-English meaning |
| --- | --- |
| **Phoenix** | The main web framework for Elixir |
| **Endpoint** | The entry point every request passes through first |
| **Router** | Maps URLs and HTTP verbs to controllers or LiveViews |
| **Pipeline** | A named group of plugs run for a set of routes (`:browser`, `:api`) |
| **Scope** (router) | A group of routes sharing a path prefix and pipelines |
| **Scope** (Phoenix 1.8 auth) | A struct describing who is making the request, passed into context functions |
| **Plug** | A small step that receives a connection and returns it (middleware) |
| **`%Plug.Conn{}`** | The struct holding everything about the current request and response |
| **Assigns** | Data attached to the conn or socket for later use (`@current_scope`) |
| **Controller** | Handles a request: reads params, calls the context, renders a response |
| **Action** | One function in a controller (`index`, `show`, `create`...) |
| **View module** | `TaskHTML` / `TaskJSON`: turns data into HTML or JSON |
| **HEEx** | Phoenix's HTML template language with `{...}` for Elixir values |
| **Function component** | A reusable piece of HTML written as a function: `<.button>` |
| **Slot** | A placeholder in a component for content passed in by the caller (like React `children`) |
| **Layout** | The page frame around your content (header, nav, flash messages) |
| **Flash** | One-time messages like "Saved!" shown after an action |
| **Verified route `~p`** | A path the compiler checks exists |
| **Context** | A module holding the business logic for one area (`Accounts`, `Tasks`) |
| **Generator** | A `mix phx.gen.*` command that writes code for you |
| **Channel** | A WebSocket topic handler for real-time communication |
| **Socket** | One persistent connection from a client, which can join many channels |
| **PubSub** | Publish/subscribe messaging between processes, across servers too |
| **Presence** | Tracks who is online in a topic, in real time |
| **Telemetry** | Events the framework emits for metrics and monitoring |
| **LiveDashboard** | A built-in web page showing live system stats |
| **CSRF token** | A hidden form value that stops other sites submitting forms as you |
| **Gettext** | The translation (i18n) system |
| **Swoosh** | The email library used by Phoenix |
| **Bandit** | The web server Phoenix uses (Cowboy in older apps) |
| **esbuild / Tailwind** | Asset tools, installed as Elixir packages (no Node required) |

## Ecto (database)

| Term | Plain-English meaning |
| --- | --- |
| **Ecto** | The database library |
| **Repo** | The module that actually talks to the database |
| **Schema** | Maps a database table to an Elixir struct |
| **Migration** | A versioned script that changes the database structure |
| **Changeset** | Validates and tracks changes before they're saved |
| **cast** | Picks only the allowed fields from user input and converts their types |
| **Validation** | A check run in Elixir before saving (required, length, format) |
| **Constraint** | A rule enforced by the database (unique, foreign key). Ecto turns violations into friendly errors |
| **Association** | A relationship: `belongs_to`, `has_many`, `many_to_many` |
| **Preload** | Explicitly load related records |
| **N+1 problem** | Running one query per row instead of one query for all of them |
| **Ecto.Multi** | A list of database steps to run together in one transaction |
| **Transaction** | A group of DB operations that all succeed or all roll back |
| **Embedded schema** | A schema stored inside another record (as JSON) or not stored at all |
| **Upsert** | Insert, or update if the row already exists |
| **Sandbox** | Test mode where each test runs in a rolled-back transaction |

## LiveView

| Term | Plain-English meaning |
| --- | --- |
| **LiveView** | A server process that renders a page and keeps it updated over a WebSocket |
| **mount** | The function that sets up the LiveView's initial state (runs twice: HTTP, then WebSocket) |
| **Socket** (LiveView) | The LiveView's state container, holding the assigns |
| **`handle_event`** | Handles user actions like clicks and form submits |
| **`handle_params`** | Handles URL changes |
| **Diff** | The small set of changes sent to the browser instead of the whole page |
| **Change tracking** | LiveView remembers which assigns each part of the template uses, so it re-renders only those parts |
| **Stream** | A way to show big lists without keeping them in server memory |
| **LiveComponent** | A component with its own state and events, inside a LiveView |
| **`phx-click` etc.** | HTML attributes that send events to the server |
| **JS commands** | Small client-side actions (show, hide, toggle classes) that need no server round trip |
| **Hook** | Custom JavaScript attached to an element (`phx-hook`) |
| **patch / navigate** | Change the URL in the same LiveView / move to another LiveView without a full page reload |
| **`on_mount`** | Code that runs when a LiveView mounts, used for auth checks |
| **`live_session`** | A group of LiveViews sharing `on_mount` hooks, between which you can navigate without reloading |
| **`assign_async`** | Load data in the background and show a loading state |

## Production

| Term | Plain-English meaning |
| --- | --- |
| **Oban** | A background job library that stores jobs in Postgres |
| **Worker** (Oban) | A module that performs one kind of job |
| **Queue** | A named line of jobs with a concurrency limit |
| **Cron** | Jobs scheduled on a timetable ("every day at 8:00") |
| **`runtime.exs`** | Config read when the app starts (env vars, secrets) |
| **`MIX_ENV`** | Which environment you're in: dev, test or prod |
| **Clustering** | Connecting several app servers so they share PubSub and Presence |
| **libcluster / DNSCluster** | Tools that let nodes find each other automatically |
| **Hot code upgrade** | Replacing code in a running system without restarting (rarely used for web apps) |
| **Remote console** | An IEx shell connected to a running production server |
