# 03 · Supervisors and applications

## 1. What a supervisor does

> **In short:** A supervisor is a process that starts child processes, watches them through links, and **restarts** them according to a strategy when they crash.

```elixir
children = [
  {Counter, 0},          # calls Counter.start_link(0)
  RateLimiter,           # calls RateLimiter.start_link([])
  {Cleaner, []}
]

Supervisor.start_link(children, strategy: :one_for_one)
```

Now kill one and watch it come back:

```elixir
pid = Process.whereis(Counter)
Process.exit(pid, :kill)
Process.whereis(Counter)   # a NEW pid: restarted with initial state 0
```

## 2. Restart strategies

> **In short:** `:one_for_one` restarts only the crashed child. `:one_for_all` restarts every child. `:rest_for_one` restarts the crashed child and every child started after it.

```
one_for_one     A  B✗ C   →  A  B' C        independent children (most common)
one_for_all     A  B✗ C   →  A' B' C'       children that all depend on each other
rest_for_one    A  B✗ C   →  A  B' C'       later children depend on earlier ones
```

Example of `:rest_for_one`: `[DBConnection, Cache, WebEndpoint]`. If the DB connection dies, the cache and endpoint that depend on it restart too. If only the endpoint dies, only it restarts.

**Order matters.** Children start top to bottom and shut down in reverse order. Put dependencies first.

## 3. Restart intensity: avoiding crash loops

> **In short:** If children crash more than `max_restarts` times in `max_seconds` (default 3 in 5 s), the supervisor itself gives up and crashes, escalating to **its** supervisor.

```elixir
Supervisor.start_link(children, strategy: :one_for_one, max_restarts: 3, max_seconds: 5)
```

This escalation is how failures move up the tree. If the top-level supervisor dies, the application stops. Restarting a broken thing forever is pointless, and escalating gives a higher level a chance to reset a bigger chunk of state.

## 4. Child specs and restart types

> **In short:** `use GenServer` defines `child_spec/1` for you. Tune it with `restart: :permanent | :transient | :temporary`.

```elixir
use GenServer, restart: :transient
```

| Restart type | Restarted when |
| --- | --- |
| `:permanent` (default) | Always |
| `:transient` | Only on an abnormal exit (not `:normal` or `:shutdown`) |
| `:temporary` | Never, e.g. a one-off task |

A full child spec map, for reference:

```elixir
%{
  id: Counter,
  start: {Counter, :start_link, [0]},
  restart: :permanent,
  shutdown: 5_000,      # ms to wait for a graceful terminate before killing
  type: :worker         # or :supervisor
}
```

## 5. A module-based supervisor

> **In short:** Define your own supervisor module when you want to group related children.

```elixir
defmodule MyApp.Chat.Supervisor do
  use Supervisor

  def start_link(arg), do: Supervisor.start_link(__MODULE__, arg, name: __MODULE__)

  @impl true
  def init(_arg) do
    children = [
      {Registry, keys: :unique, name: MyApp.Chat.Registry},
      {DynamicSupervisor, name: MyApp.Chat.RoomSupervisor, strategy: :one_for_one}
    ]

    Supervisor.init(children, strategy: :one_for_all)
  end
end
```

## 6. DynamicSupervisor: children started at runtime

> **In short:** Use it when you don't know the children up front, such as one process per game room, per user session or per uploaded file.

```elixir
defmodule MyApp.Chat.Room do
  use GenServer, restart: :transient

  def start_link(room_id),
    do: GenServer.start_link(__MODULE__, room_id, name: via(room_id))

  def post(room_id, msg), do: GenServer.cast(via(room_id), {:post, msg})
  def messages(room_id), do: GenServer.call(via(room_id), :messages)

  defp via(room_id), do: {:via, Registry, {MyApp.Chat.Registry, room_id}}

  @impl true
  def init(room_id), do: {:ok, %{id: room_id, messages: []}}

  @impl true
  def handle_cast({:post, msg}, state),
    do: {:noreply, %{state | messages: [msg | state.messages]}}

  @impl true
  def handle_call(:messages, _from, state),
    do: {:reply, Enum.reverse(state.messages), state}
end

defmodule MyApp.Chat do
  def open_room(room_id) do
    case DynamicSupervisor.start_child(MyApp.Chat.RoomSupervisor, {MyApp.Chat.Room, room_id}) do
      {:ok, pid} -> {:ok, pid}
      {:error, {:already_started, pid}} -> {:ok, pid}
    end
  end
end
```

This **Registry + DynamicSupervisor + GenServer-per-entity** pattern is extremely common. Learn it well.

## 7. Applications

> **In short:** An OTP **application** is a component that can be started and stopped as a unit, with a root supervisor. Your Mix project *is* an application, and every dependency is one too.

`lib/my_app/application.ex` in any Phoenix project:

```elixir
defmodule MyApp.Application do
  use Application

  @impl true
  def start(_type, _args) do
    children = [
      MyAppWeb.Telemetry,                                   # metrics
      MyApp.Repo,                                           # DB connection pool
      {DNSCluster, query: Application.get_env(:my_app, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: MyApp.PubSub},                 # pub/sub
      {Finch, name: MyApp.Finch},                           # HTTP client pool
      # MyApp.Worker,                                       # your own processes go here
      MyAppWeb.Endpoint                                     # web server: LAST, so it starts accepting requests only when everything else is up
    ]

    opts = [strategy: :one_for_one, name: MyApp.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
```

This file is your app's **supervision tree**. In an interview, be ready to walk through it line by line, and to say where you'd add your own GenServer (before the Endpoint).

`mix.exs` points to it:

```elixir
def application do
  [mod: {MyApp.Application, []}, extra_applications: [:logger, :runtime_tools]]
end
```

## 8. "Let it crash" in practice

> **In short:** Handle expected errors, let unexpected ones crash, and design state so that a restart fixes things.

Good practice:
- Keep important state somewhere durable (DB) or rebuildable, so a restart loses nothing important.
- Keep processes small and focused, so a crash resets a small amount of state.
- Don't `try/rescue` around everything. You'd just hide bugs and keep corrupt state alive.
- Watch crash logs and error tracking (Sentry, AppSignal). Restarts are recovery, not a fix.

Tree example for a chat app:

```
MyApp.Supervisor (one_for_one)
├── MyApp.Repo
├── Phoenix.PubSub
├── MyApp.Chat.Supervisor (one_for_all)
│   ├── Registry (MyApp.Chat.Registry)
│   └── DynamicSupervisor (RoomSupervisor)
│       ├── Room "lobby"
│       ├── Room "elixir"
│       └── ...
└── MyAppWeb.Endpoint
    └── (each HTTP request / WebSocket connection is its own process)
```

## Exercises

1. Start a supervisor with `Counter` and `Stack`. Kill each one with `Process.exit(pid, :kill)` and confirm it restarts.
2. Make `Counter` crash on purpose (`def handle_cast(:boom, _), do: raise "boom"`). Cast `:boom` 4 times quickly and see what happens to the supervisor (restart intensity).
3. Build the chat-room pattern above. Open 3 rooms, post messages, kill one room's PID, and see that it restarts (with empty state; how would you persist it?).
4. Open your trial project's `application.ex` and explain every child out loud.

## Interview questions

<details>
<summary>What is a supervision tree?</summary>

A hierarchy of supervisors and workers. Supervisors start, monitor (via links and trapped exits) and restart their children according to a strategy. Failures are isolated to subtrees, and if a supervisor exceeds its restart intensity it crashes too, escalating to its parent. The application's root supervisor sits at the top.

</details>

<details>
<summary>Explain the supervisor strategies.</summary>

`:one_for_one` restarts only the failed child, for independent children. `:one_for_all` restarts every child when one fails, for children tightly coupled to shared state. `:rest_for_one` restarts the failed child and all children started after it, for linear dependencies where later children depend on earlier ones.

</details>

<details>
<summary>What happens if a child keeps crashing?</summary>

The supervisor counts restarts. If more than `max_restarts` (default 3) happen within `max_seconds` (default 5), the supervisor terminates all its children and exits itself, so its own supervisor deals with it. If the failure reaches the application's root supervisor, the application stops (and, for a permanent application, so does the node). This prevents infinite crash loops.

</details>

<details>
<summary>When do you use a DynamicSupervisor?</summary>

When children are created at runtime and their number isn't known up front: one process per game room, user session, device connection or import job. It's usually combined with a Registry so processes can be found by a key (`{:via, Registry, {Reg, id}}`).

</details>

<details>
<summary>Why is the Phoenix Endpoint last in the children list?</summary>

Children start in order. The Endpoint starts accepting HTTP traffic, so it should come only after its dependencies (Repo, PubSub, caches) are up. On shutdown, children stop in reverse order, so the Endpoint stops taking requests first, before the things it depends on go away.

</details>
