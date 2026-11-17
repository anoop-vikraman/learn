# Elixir + Phoenix interview questions

Open the Markdown preview, read the question, answer **out loud**, then expand to compare.

---

## A. Language fundamentals

<details>
<summary>What is Elixir, and why was it created?</summary>

A functional, dynamically typed language running on the Erlang VM (BEAM), created by José Valim in 2012. He wanted Ruby-like productivity, metaprogramming (macros) and modern tooling (Mix, Hex, ExUnit, docs) on top of Erlang's proven concurrency and fault tolerance. It compiles to BEAM bytecode and interoperates with Erlang at no cost.

</details>

<details>
<summary>What does "immutable data" mean in practice?</summary>

Values never change after they're created. Functions return new values (`Map.put/3` returns a new map), and variables can be rebound to new values but the old value is unchanged. Benefits: no hidden mutation, simpler reasoning, safe concurrency (messages can't be modified after sending). Structural sharing makes it efficient.

</details>

<details>
<summary>Explain pattern matching with three examples of where it's used.</summary>

`=` matches the left side against the right, binding variables and asserting shapes/literals. It's used in: (1) destructuring, `{:ok, user} = create_user(...)`; (2) function heads, with multiple clauses like `def handle({:error, reason})`; (3) `case`/`with`/`receive` branches. Also in map partial matches (`%{"id" => id} = params`), string prefixes (`"Bearer " <> token`) and the pin operator `^` to match existing values.

</details>

<details>
<summary>What are atoms, and what's the danger with them?</summary>

Constants whose value is their name (`:ok`, `:error`). Module names and booleans are atoms. They're stored in a global table that is never garbage-collected and has a limit (~1M), so converting untrusted input to atoms can crash the VM. Use `String.to_existing_atom/1` or keep strings.

</details>

<details>
<summary>List vs tuple vs map vs keyword list?</summary>

List: a linked list, O(1) prepend, O(n) access, for variable-length sequences. Tuple: contiguous, O(1) access, for fixed-size groups like `{:ok, val}`. Map: key-value with any key type and fast lookup, for general data. Keyword list: a list of `{atom, value}` pairs that allows duplicate keys and keeps order, used for options and DSLs.

</details>

<details>
<summary>What does the pipe operator do?</summary>

`x |> f(a)` becomes `f(x, a)`: the left value becomes the first argument, turning nested calls into a top-to-bottom data transformation. That's why the standard library puts the main data structure first.

</details>

<details>
<summary>How do you iterate without loops?</summary>

Recursion (head/tail with a base case, tail-call optimised with accumulators), `Enum` functions (`map`, `filter`, `reduce`), `for` comprehensions, and lazy `Stream`s for large or infinite data.

</details>

<details>
<summary>What is `with` and when do you use it?</summary>

It chains pattern-matched steps: `with {:ok, a} <- step1(), {:ok, b} <- step2(a) do ... end`. When a step doesn't match, `with` returns that value (or handles it in `else`). It flattens nested `case` statements for happy-path code where each step can fail.

</details>

<details>
<summary>Error tuples vs exceptions?</summary>

Expected failures return `{:error, reason}` (validation, not found). Exceptions are for unexpected or programmer errors, which usually crash the process and are recovered by a supervisor. Bang functions (`get!`, `read!`) raise instead of returning error tuples.

</details>

<details>
<summary>Protocols vs behaviours?</summary>

Protocols are polymorphism based on the data type of the argument (`String.Chars`, `Jason.Encoder`), and can be implemented for existing types. Behaviours are compile-checked sets of callbacks a module implements (`GenServer`, `Plug`), where you choose the module explicitly. Behaviours plus config are also how you swap in mocks.

</details>

<details>
<summary>What are macros and when should you write one?</summary>

Macros receive code as an AST (quoted expressions) and return new AST at compile time. They power `def`, `if`, Ecto queries, Phoenix routers and `use`. Rule: don't write a macro if a function will do. Macros make code harder to read and debug. They're for DSLs and compile-time code generation.

</details>

<details>
<summary>What does `use` do?</summary>

`use Mod, opts` calls `Mod.__using__(opts)`, a macro that injects code into the current module: imports, aliases, behaviour declarations, default functions. For example, `use MyAppWeb, :live_view` sets up a LiveView module.

</details>

<details>
<summary>Is Elixir typed?</summary>

It's dynamically and strongly typed. Optional typespecs are checked by Dialyzer. Since 1.17 the compiler has been gaining a gradual set-theoretic type system that infers types and reports violations, rolled out across releases.

</details>

---

## B. BEAM, processes and OTP

<details>
<summary>What is a BEAM process?</summary>

A lightweight, isolated unit of execution managed by the VM (~2 KB), with its own heap, GC and mailbox. It isn't an OS thread. Millions can run at once, preemptively scheduled across one scheduler per core. Processes share nothing and communicate by asynchronous message passing.

</details>

<details>
<summary>How does a process hold state?</summary>

By running a recursive receive loop that passes the new state into the next iteration. Since it handles one message at a time, updates are serialized without locks. GenServer is the standard abstraction for this.

</details>

<details>
<summary>What is a GenServer? Write one from memory.</summary>

An OTP behaviour for a stateful server process: client API functions wrap `GenServer.call/cast`, and callbacks `init/1`, `handle_call/3`, `handle_cast/2` and `handle_info/2` run inside the process and return the new state.

```elixir
defmodule Counter do
  use GenServer
  def start_link(n), do: GenServer.start_link(__MODULE__, n, name: __MODULE__)
  def inc, do: GenServer.cast(__MODULE__, :inc)
  def get, do: GenServer.call(__MODULE__, :get)

  @impl true
  def init(n), do: {:ok, n}
  @impl true
  def handle_cast(:inc, n), do: {:noreply, n + 1}
  @impl true
  def handle_call(:get, _from, n), do: {:reply, n, n}
end
```

</details>

<details>
<summary>call vs cast vs handle_info?</summary>

`call` is synchronous with a reply and a 5 s default timeout, and gives back-pressure. `cast` is async fire-and-forget, with no back-pressure. `handle_info` handles every other message: timers, monitors, PubSub, raw sends. Prefer `call` by default.

</details>

<details>
<summary>What is "let it crash"?</summary>

Don't defensively handle unexpected errors. Let the process crash, and have a supervisor restart it in a clean state. Isolation contains the failure. Expected errors are still handled with return values. The result is simpler code and self-healing systems.

</details>

<details>
<summary>Explain supervisors and the restart strategies.</summary>

Supervisors start children, link to them, and restart them on failure. `:one_for_one` restarts only the failed child. `:one_for_all` restarts all children. `:rest_for_one` restarts the failed child and those started after it. Restart intensity (default 3 restarts in 5 s) makes the supervisor itself exit if exceeded, escalating up the tree.

</details>

<details>
<summary>Links vs monitors?</summary>

Links are bidirectional and propagate exits (unless the process traps exits); supervisors use them. Monitors are one-way and deliver a `:DOWN` message without killing the watcher. Use monitors to observe processes you depend on.

</details>

<details>
<summary>What is a DynamicSupervisor and Registry, and when do you combine them?</summary>

DynamicSupervisor starts children on demand at runtime. Registry maps keys to PIDs (and cleans up when processes die). Combined with `{:via, Registry, {Reg, key}}` names, you get one process per entity (game room, chat, device) that can be found by id.

</details>

<details>
<summary>What is ETS and when do you use it?</summary>

An in-memory key-value store with concurrent reads and writes from many processes, owned by a process and destroyed when that process dies. Use it for caches, counters (`update_counter`) and lookup tables, to avoid a GenServer bottleneck.

</details>

<details>
<summary>When should you NOT use a GenServer?</summary>

When there's no state, or no need for serialized access. Wrapping pure functions in a GenServer creates a single-process bottleneck. Use modules for logic, ETS for shared reads, Tasks for concurrent one-off work, and the DB for durable state.

</details>

<details>
<summary>Task.async vs Task.Supervisor.async_nolink vs Oban?</summary>

`Task.async` is linked: you await the result, and a crash propagates. `async_nolink` (under a Task.Supervisor) isolates crashes, so you handle `{:exit, reason}`. Oban persists jobs in Postgres with retries, scheduling and uniqueness. Use Oban whenever work must survive restarts.

</details>

<details>
<summary>How does BEAM scheduling differ from Node's event loop?</summary>

The BEAM is preemptive (it counts reductions per process), runs one scheduler per core, and has per-process GC. A CPU-heavy process can't starve the others. Node is single-threaded and cooperative: a blocking computation stalls every request, and one uncaught exception can kill the process.

</details>

<details>
<summary>How do Elixir nodes form a cluster?</summary>

Distributed Erlang connects nodes that share a cookie. Discovery uses libcluster or DNSCluster. Remote PIDs can be messaged transparently, and Phoenix.PubSub, Presence and `:global`/`:pg` work across the cluster. Network partitions still need application-level thinking.

</details>

---

## C. Phoenix

<details>
<summary>Walk through a Phoenix request lifecycle.</summary>

The web server (Bandit) spawns a process per request. A `%Plug.Conn{}` passes through the Endpoint plugs (static files, parsers, session), then the Router (match → pipelines such as `:browser`/`:api`) → the controller action → a context call → rendering via a view module (HEEx or JSON). The response is sent, and the process ends.

</details>

<details>
<summary>What is a plug? Write a plug that requires an API key.</summary>

A function `(conn, opts) -> conn`, or a module with `init/1` + `call/2`. `halt/1` stops the pipeline.

```elixir
def call(conn, _opts) do
  case get_req_header(conn, "x-api-key") do
    [key] -> if valid?(key), do: conn, else: deny(conn)
    _ -> deny(conn)
  end
end
defp deny(conn), do: conn |> send_resp(401, "unauthorized") |> halt()
```

</details>

<details>
<summary>What are contexts?</summary>

Modules that expose the public API of a business domain (`Accounts`, `Billing`). The web layer calls them instead of Repo or schemas. They give a thin web layer, centralized rules, testability without HTTP, and clear boundaries.

</details>

<details>
<summary>my_app vs my_app_web?</summary>

`my_app` is the domain (contexts, schemas, business logic, no HTTP). `my_app_web` is the interface (router, controllers, LiveViews, components). It enforces separation, so the domain can be reused from jobs, APIs and IEx.

</details>

<details>
<summary>What does action_fallback do?</summary>

When a controller action returns a non-conn value (usually an `{:error, _}` from a `with`), it's passed to the fallback controller, which maps errors to HTTP responses (422, 404, 403). Actions stay happy-path only.

</details>

<details>
<summary>How do you handle authentication in Phoenix?</summary>

`mix phx.gen.auth` generates code into your app. In 1.8 that means magic links with optional passwords, a `Scope` struct, hashed DB session tokens in signed cookies, plugs for controllers and `on_mount` hooks for LiveViews. For APIs, use bearer tokens (hashed in the DB, or JWT) checked in a plug.

</details>

<details>
<summary>What's a Phoenix 1.8 scope?</summary>

A struct representing who is making the request (the current user, and optionally org or role). Generated context functions take it as the first argument and filter queries by it, which prevents IDOR bugs. PubSub topics are scoped per user too.

</details>

<details>
<summary>Phoenix Channels: how do they work?</summary>

A client opens one socket connection (authenticated in `connect/3`), then joins topics. Each join is a channel process handling `join/3`, `handle_in/3` and broadcasts through PubSub. JS, Swift and Kotlin clients handle reconnects and heartbeats.

</details>

<details>
<summary>PubSub vs Channels vs Presence?</summary>

PubSub is the distributed topic-based message bus between processes. Channels are the client-facing WebSocket abstraction built on it. Presence is CRDT-based tracking of who is connected per topic, replicated across nodes, with join/leave diffs.

</details>

<details>
<summary>What are verified routes?</summary>

`~p"/tasks/#{task}"` paths are checked at compile time against the router, and you get a warning for nonexistent routes. They replaced `Routes.*_path` helpers in 1.7.

</details>

<details>
<summary>How does Phoenix protect against common web attacks?</summary>

CSRF tokens (`protect_from_forgery`), auto-escaping in HEEx (XSS), parameterized Ecto queries (SQL injection), `cast/3` whitelisting (mass assignment), secure browser headers, signed/encrypted cookies, `check_origin` for sockets, and Sobelow for static analysis.

</details>

---

## D. Ecto

<details>
<summary>What are the four main parts of Ecto?</summary>

Repo (executes against the DB), Schema (maps tables to structs), Changeset (casts, validates and tracks changes), and Query (a composable, parameterized DSL). It isn't an ORM: data is plain structs, nothing loads lazily, and there are no callbacks.

</details>

<details>
<summary>What is a changeset, and why have multiple per schema?</summary>

It holds the data, casts params, records changes and errors, and tracks `valid?`. Different operations permit different fields and rules (registration vs profile update vs admin edit), so you write a changeset function for each.

</details>

<details>
<summary>validate_* vs *_constraint?</summary>

`validate_*` runs in memory before the DB. `*_constraint` maps DB constraint violations (unique index, FK, check) to changeset errors. Uniqueness needs a DB index plus `unique_constraint`, because in-memory checks race.

</details>

<details>
<summary>Why must you use ^ in Ecto queries?</summary>

It marks external values as query parameters. That makes them SQL-injection safe and tells the macro the value comes from runtime, not a schema field.

</details>

<details>
<summary>How does Ecto prevent N+1, and how do you fix it?</summary>

There's no lazy loading: unloaded associations are `%Ecto.Association.NotLoaded{}`, so hidden queries can't happen. Load explicitly with `Repo.preload`, `preload:` in queries, or `join` + `preload` for a single query.

</details>

<details>
<summary>Ecto.Multi vs Repo.transact?</summary>

Both are atomic. `Repo.transact` (Ecto 3.13+, or `transaction` + `rollback` before that) wraps a function whose `{:ok, _}`/`{:error, _}` result decides commit or rollback, which works well with `with`. `Multi` builds a named, inspectable sequence of operations, returning which step failed and the changes so far. It's easy to compose and test, and Oban can insert jobs into it.

</details>

<details>
<summary>How do you write a zero-downtime migration?</summary>

Additive and backward compatible: add nullable columns, backfill in batches, then add constraints. Create indexes concurrently (with DDL transactions and the migration lock disabled). Don't rename or drop columns the running version uses; do it in a later deploy.

</details>

---

## E. LiveView

<details>
<summary>How does LiveView work?</summary>

The first render is server-rendered HTML over HTTP. Then a WebSocket connects and a stateful process mounts. Events go to `handle_event`, which updates assigns, and change-tracked templates send minimal diffs that the client patches into the DOM.

</details>

<details>
<summary>Why does mount run twice?</summary>

Once disconnected (HTTP, for fast first paint and SEO) and once connected (WebSocket, a new process). Guard side effects such as subscriptions and timers with `connected?/1`, and use `assign_async` for slow loads.

</details>

<details>
<summary>What are streams?</summary>

A way to render collections without keeping them in server memory. Items are sent to the client, then pruned on the server, and updated individually with `stream_insert`/`stream_delete` by DOM id. They keep per-user memory flat.

</details>

<details>
<summary>How do you make a LiveView real-time across users?</summary>

The context broadcasts via PubSub after writes. The LiveView subscribes when connected and updates assigns or streams in `handle_info`. It works across nodes.

</details>

<details>
<summary>Function component vs LiveComponent vs nested LiveView?</summary>

Function component: stateless markup (the default). LiveComponent: its own state and events (`phx-target={@myself}`), running in the parent process. Nested LiveView: a separate process with isolation (rarely needed).

</details>

<details>
<summary>patch vs navigate?</summary>

`patch` stays in the same LiveView and calls `handle_params` (filters, modals). `navigate` mounts a different LiveView over the same socket, without a full page reload.

</details>

<details>
<summary>How is auth enforced for LiveViews?</summary>

Router plugs protect the HTTP render. `live_session` `on_mount` hooks re-check the session on the WebSocket mount and during live navigation. Every `handle_event` must also authorize the action (look up records through the scope).

</details>

<details>
<summary>LiveView vs a React SPA: when would you pick each?</summary>

LiveView: CRUD, dashboards, admin panels, forms, collaborative and real-time features, small teams, one codebase, no API duplication. React/SPA: offline-first, highly interactive client-side apps (editors, canvas), mobile code sharing, or an existing large front-end team. They can mix: a Phoenix API or Channels behind a React app, or React islands inside LiveView via hooks.

</details>

<details>
<summary>How do you handle latency-sensitive UI in LiveView?</summary>

`JS` commands for instant client-side changes (show, hide, class toggles, transitions), `phx-disable-with` for loading states, `phx-debounce`/`phx-throttle`, CSS loading classes (`phx-click-loading`), and hooks for heavy client logic. Deploy close to users (Fly regions).

</details>

---

## F. Architecture and scenarios

<details>
<summary>Design a real-time chat system in Phoenix.</summary>

Accounts + Chat contexts. Messages are persisted in Postgres (indexed by `room_id`, `inserted_at`). A LiveView (or a Channel for mobile) per room subscribes to `"room:ID"`. `Chat.send_message` inserts and then broadcasts. Presence shows online users and typing indicators (presence meta updates). Message history is paginated with keyset pagination plus streams. Rate-limit sending with ETS. Notifications for offline users go through Oban jobs. Scale out with a clustered PubSub across nodes. Optionally run a GenServer per active room for ephemeral state, under DynamicSupervisor + Registry.

</details>

<details>
<summary>A GenServer in your app is a bottleneck. What do you do?</summary>

Confirm it with LiveDashboard (message queue length, reductions). Then: move reads to ETS (`read_concurrency`), use atomic counters (`update_counter`), shard into N processes by key hash or per entity, move slow work out of callbacks into Tasks, switch casts to calls for back-pressure, or question whether the state belongs in a process at all.

</details>

<details>
<summary>How would you process 1 million rows from a CSV upload?</summary>

Upload directly to S3. Enqueue an Oban job with the file reference. The job streams the file (`File.stream!` or an S3 stream + `NimbleCSV`), chunks with `Stream.chunk_every(1000)`, validates, and `Repo.insert_all`s each batch (or uses `Task.async_stream` with limited concurrency). Report progress via PubSub to a LiveView. Make it idempotent and resumable (track the last processed line), and handle errors per row.

</details>

<details>
<summary>How do you call a flaky external API from Phoenix safely?</summary>

Wrap it behind a behaviour (so it's mockable). Use Req with timeouts and retry/backoff. Use `Task.Supervisor.async_nolink` from LiveViews so failures don't crash the view. Use Oban for work that must eventually succeed. Optionally add a circuit breaker (`:fuse`) and cache results in ETS.

</details>

<details>
<summary>What are Elixir's weaknesses?</summary>

A smaller ecosystem and hiring pool. Raw CPU-heavy computation is slower (mitigated by Rust NIFs or Nx). Static typing is still maturing. OTP has a learning curve. LiveView requires persistent connections. Be honest and show mitigations.

</details>

<details>
<summary>How would you scale a Phoenix app to many users?</summary>

Run multiple nodes behind a load balancer, clustered so PubSub and Presence work everywhere. Use a Postgres connection pool sized correctly (plus PgBouncer if needed), read replicas, and indexes. Cache in ETS. Push heavy work to Oban. Use LiveView streams to limit memory. Monitor with telemetry. The BEAM handles high connection counts well, so the database is usually the first bottleneck.

</details>

---

## G. Live-coding warm-ups

Practise these in `iex` until you can write each one in under 5 minutes.

1. **Word count:** `"the cat the hat"` → `%{"the" => 2, "cat" => 1, "hat" => 1}` (use `Enum.frequencies`, then write it again with `reduce`).
2. **FizzBuzz** with multi-clause functions on `{rem(n, 3), rem(n, 5)}`.
3. **Flatten** a nested list recursively.
4. **Group anagrams:** `["eat","tea","tan","ate","nat"]` → `[["eat","tea","ate"],["tan","nat"]]` (hint: `Enum.group_by(&(&1 |> String.graphemes() |> Enum.sort()))`).
5. **Balanced brackets** with a list as a stack and pattern matching.
6. **Stack/Queue GenServer** with push/pop and an `{:error, :empty}` case.
7. **KV store with TTL** GenServer (`Process.send_after` for expiry).
8. **Parallel fetch:** `Task.async_stream` over a list of ids with `max_concurrency: 5`.
9. **Changeset:** write a `User` schema changeset with required email, a format check, password length ≥ 12, and a unique constraint.
10. **Ecto query:** "users with more than 5 incomplete tasks, ordered by count" (join, group_by, having).
11. **Plug:** reject requests without a valid `x-api-key` header.
12. **LiveView:** a counter plus a search box with debounce.

<details>
<summary>Reference solution: balanced brackets</summary>

```elixir
defmodule Brackets do
  @pairs %{")" => "(", "]" => "[", "}" => "{"}

  def balanced?(str), do: str |> String.graphemes() |> check([])

  defp check([], stack), do: stack == []
  defp check([c | rest], stack) when c in ["(", "[", "{"], do: check(rest, [c | stack])
  defp check([c | rest], [top | stack]) when c in [")", "]", "}"] do
    if @pairs[c] == top, do: check(rest, stack), else: false
  end
  defp check([c | _], []) when c in [")", "]", "}"], do: false
  defp check([_ | rest], stack), do: check(rest, stack)
end
```

</details>

<details>
<summary>Reference solution: users with more than 5 incomplete tasks</summary>

```elixir
from u in User,
  join: t in assoc(u, :tasks),
  where: t.done == false,
  group_by: u.id,
  having: count(t.id) > 5,
  order_by: [desc: count(t.id)],
  select: %{user: u, open_tasks: count(t.id)}
```

</details>

---

## H. Questions to ask them

- How is your Elixir codebase organised: contexts, umbrella apps, or something else?
- LiveView, a separate SPA, or both? How do you decide?
- How do you deploy and run clusters? Do you use hot upgrades or rolling deploys?
- What does on-call look like, and what's your observability stack?
- What's the biggest technical challenge the team faces right now?
- How do you onboard developers who are new to Elixir?
