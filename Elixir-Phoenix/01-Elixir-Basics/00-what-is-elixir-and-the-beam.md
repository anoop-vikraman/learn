# 00 · What is Elixir, and what is the BEAM?

> **Plain English:** Elixir is a programming language, and the BEAM is the engine that runs it. Picture an office with thousands of tiny workers who each have a private desk and talk only by passing notes. If one worker gets confused, a manager replaces them, and nobody else is disturbed. That design is why Elixir apps handle huge numbers of users and rarely go down.

Read this first for the big picture. Interviewers often open with "Why Elixir?", and this lesson is the answer.

## 1. Elixir in one paragraph

> **In short:** Elixir is a **functional, dynamically-typed** language that runs on the **BEAM**, Erlang's virtual machine. The BEAM was built to run millions of tiny, isolated processes that never stop.

José Valim created Elixir in 2012. He was a Ruby on Rails core member and wanted Ruby-like productivity on top of Erlang's battle-tested concurrency. So:

- **Syntax** feels a bit like Ruby (`def`, `do ... end`).
- **Semantics** are functional: data is immutable, there are no classes or objects, and you write functions that transform data.
- **Runtime** is the BEAM: the same VM that has run telecom switches (Ericsson), WhatsApp, Discord's chat infrastructure, and Heroku's routing for decades.

Elixir compiles to the same bytecode as Erlang, so you can call any Erlang library directly (`:crypto.hash(:sha256, "hi")`).

## 2. The BEAM and its processes

> **In short:** A BEAM **process** is not an OS process or thread. It's a ~2 KB lightweight unit that the VM schedules itself, so you can run millions of them.

```
┌───────────────────────── One OS process: the BEAM VM ─────────────────────────┐
│  Scheduler 1 (CPU core 1)     Scheduler 2 (core 2)     ...  Scheduler N        │
│   ├─ process (a request)       ├─ process (a websocket)                         │
│   ├─ process (a GenServer)     ├─ process (a background job)                    │
│   └─ ... thousands more        └─ ...                                           │
│  Each process: own heap, own garbage collection, own mailbox. No shared memory. │
└───────────────────────────────────────────────────────────────────────────────┘
```

Key properties:

| Property | What it means | Compared with Node.js |
| --- | --- | --- |
| **Lightweight** | Spawning a process costs microseconds and ~2 KB | Node has one main thread plus a worker pool |
| **Isolated** | Each process has its own memory, so one crashing doesn't corrupt another | One uncaught exception can kill the whole Node process |
| **Preemptive scheduling** | The VM gives each process a budget of "reductions" (~work units) and switches when it's used up | Node is cooperative: a CPU-heavy loop blocks *every* request |
| **Message passing** | Processes communicate only by sending immutable messages | Shared memory/closures plus an event loop |
| **Per-process GC** | Garbage collection happens per tiny heap, so there are no global "stop the world" pauses | V8 GC pauses the whole isolate |
| **Multi-core by default** | One scheduler per core | You need cluster/worker threads |

This is why a Phoenix server handles each HTTP request **and** each WebSocket connection in its own process, and why a slow request never blocks the others.

## 3. "Let it crash" and fault tolerance

> **In short:** Instead of defensive `try/catch` everywhere, you let a broken process die, and a **supervisor** restarts it in a known-good state.

In most languages you guard against every possible error. In Erlang/Elixir:

1. Write the **happy path** clearly.
2. Handle **expected** errors (e.g. invalid user input) with return values like `{:error, reason}`.
3. For **unexpected** errors (a bug, a dropped network connection), let the process crash.
4. A **supervisor** process watches it and restarts it.

It works because processes are isolated: the crash is contained, and the restarted process starts with clean state. This is how Erlang systems reach "nine nines" of availability. You'll implement it in [02-OTP-Concurrency](../02-OTP-Concurrency/).

## 4. OTP

> **In short:** OTP is Erlang's standard library for building concurrent, fault-tolerant systems: GenServer, Supervisor, Application, ETS and more.

OTP originally stood for "Open Telecom Platform", but nobody means telecom any more. When people say "OTP" they mean the **patterns and behaviours**: GenServer (a stateful server process), Supervisor (restarts children), Application (a startable unit with its own supervision tree). Phoenix itself is an OTP application.

## 5. Where Elixir shines, and where it doesn't

> **In short:** It's great for anything concurrent, real-time or long-running. It's weaker at raw number crunching and has a smaller ecosystem than JS or Python.

**Great at:**
- Real-time apps: chat, notifications, collaborative tools, live dashboards (Phoenix Channels / LiveView)
- High-concurrency APIs, IoT backends (Nerves), messaging, multiplayer game servers
- Systems that must stay up (soft real-time, self-healing)
- Data pipelines (Broadway, GenStage)
- Increasingly ML too: Nx, Axon, Bumblebee, Livebook

**Weaker at:**
- CPU-heavy number crunching in pure Elixir (the usual fix is a Rust NIF via Rustler, or Nx)
- Ecosystem size: fewer libraries than npm/PyPI, and a smaller hiring pool
- Static typing: Elixir is dynamic, though a gradual **set-theoretic type system** is being built into the compiler (from 1.17 onwards) and Dialyzer exists

## 6. The ecosystem map

> **In short:** Learn these names now so you recognise them in job descriptions.

| Name | What it is | JS/Python equivalent |
| --- | --- | --- |
| **Mix** | Build tool: create projects, compile, test, run tasks | npm scripts + CLI |
| **Hex** | Package registry (hex.pm) | npm / PyPI |
| **IEx** | Interactive shell | `node` REPL / `python` |
| **ExUnit** | Built-in test framework | Jest / pytest |
| **Phoenix** | Web framework | Express/NestJS, Django, Rails |
| **Ecto** | Database wrapper + query language + validations | Prisma/TypeORM, SQLAlchemy |
| **LiveView** | Server-rendered real-time UI over WebSockets | Something like React + API + WebSocket in one; similar to Hotwire/Livewire |
| **Plug** | Composable HTTP middleware spec | Express middleware / WSGI |
| **Oban** | Background jobs backed by Postgres | BullMQ / Celery |
| **Absinthe** | GraphQL | Apollo Server / Graphene |
| **Tesla / Req** | HTTP clients | axios / requests |
| **Credo / Dialyzer** | Linter / static analysis | ESLint / mypy |

## Interview questions

<details>
<summary>Why would you choose Elixir for a project?</summary>

When the system needs **high concurrency, real-time features, and resilience**. The BEAM gives cheap isolated processes, preemptive scheduling (so one slow task doesn't block others), and supervisors that restart failures automatically. Phoenix adds productive web tooling, and Channels/LiveView make real-time features almost free. The trade-offs are a smaller ecosystem and hiring pool, and weaker raw CPU performance, which you can work around with NIFs or Nx.

</details>

<details>
<summary>What's the difference between a BEAM process and an OS thread?</summary>

BEAM processes are managed by the VM, not the OS. They're tiny (~2 KB initial heap), fast to spawn, have their own heap and GC, share no memory, and communicate by message passing. The VM runs one scheduler per CPU core and preemptively multiplexes millions of processes onto them. OS threads are heavier (MBs of stack), share memory (needing locks), and are scheduled by the OS kernel.

</details>

<details>
<summary>Explain "let it crash".</summary>

Don't write defensive code for unexpected failures. Let the process crash, and rely on a supervisor to restart it in a clean state. Because processes are isolated, a crash doesn't corrupt anything else. Expected errors (bad user input, not found) are still handled explicitly with `{:error, reason}` tuples. "Let it crash" is about *unexpected* failures, and it keeps code simpler and the system self-healing.

</details>

<details>
<summary>How is the BEAM's concurrency different from Node.js?</summary>

Node runs JS on a single thread with an event loop. Concurrency is cooperative, so a CPU-bound function blocks all requests, and an uncaught error can crash the process. The BEAM is **preemptive** (each process gets a time slice in reductions), uses **all cores** by default, and **isolates** processes, so a slow or crashing request affects only itself. Garbage collection is also per-process, which avoids global pauses.

</details>
