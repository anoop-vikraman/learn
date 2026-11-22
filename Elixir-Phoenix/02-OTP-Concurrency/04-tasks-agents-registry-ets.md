# 04 · Tasks, Agents, Registry, ETS and distribution

> **Plain English:** These are the specialised helpers. A **Task** is a temp worker hired for one job (like `async/await`). An **Agent** is a simple box that holds a value. A **Registry** is a phone book for finding workers by name. **ETS** is a shared whiteboard that many workers can read at the same time, very fast.

## 1. Task: one-off concurrent work

> **In short:** `Task.async` runs a function in a new process, and `Task.await` gets its result. It's Elixir's `Promise` + `await`.

```elixir
task = Task.async(fn -> expensive_call() end)
# ... do other things ...
result = Task.await(task, 5_000)   # waits up to 5 s (the default), then crashes the caller on timeout
```

Run things in parallel (like `Promise.all`):

```elixir
tasks = [
  Task.async(fn -> fetch_user(id) end),
  Task.async(fn -> fetch_orders(id) end),
  Task.async(fn -> fetch_recommendations(id) end)
]

[user, orders, recs] = Task.await_many(tasks, 10_000)
```

`Task.async` **links** the task to the caller: if the task crashes, the caller crashes too. That's intentional, so failures aren't silently lost.

### `Task.async_stream`: parallel map with limited concurrency

> **In short:** Process a collection in parallel with at most N workers at a time. It's ideal for "call an API for each of 1,000 items".

```elixir
urls
|> Task.async_stream(&Req.get!/1, max_concurrency: 10, timeout: 15_000, on_timeout: :kill_task)
|> Enum.map(fn
  {:ok, resp} -> resp.status
  {:exit, reason} -> {:error, reason}
end)
```

Results come back in order by default (`ordered: false` for speed).

### `Task.Supervisor`: tasks that may fail

> **In short:** For fire-and-forget work, or tasks whose crash shouldn't take down the caller, start them under a `Task.Supervisor`.

```elixir
# in application.ex children:
{Task.Supervisor, name: MyApp.TaskSupervisor}

# fire and forget (e.g. send an analytics event)
Task.Supervisor.start_child(MyApp.TaskSupervisor, fn -> Analytics.track(event) end)

# async, but NOT linked (the caller survives a crash)
task = Task.Supervisor.async_nolink(MyApp.TaskSupervisor, fn -> risky() end)
case Task.yield(task, 5_000) || Task.shutdown(task) do
  {:ok, result} -> result
  {:exit, reason} -> {:error, reason}
  nil -> {:error, :timeout}
end
```

Tasks are in memory. If the node restarts, they're gone. For work that **must** happen (emails, payments), use **Oban** (persistent jobs).

## 2. Agent: a simple state holder

> **In short:** An Agent is a GenServer that only does get and update of state. It's handy for simple shared state, but you'll outgrow it quickly.

```elixir
{:ok, agent} = Agent.start_link(fn -> %{} end, name: :settings)
Agent.update(:settings, &Map.put(&1, :theme, "dark"))
Agent.get(:settings, &Map.get(&1, :theme))   # "dark"
```

Use a GenServer when you need timers, `handle_info` or more complex logic.

## 3. Registry: a key → process lookup

> **In short:** A local, scalable map from keys to PIDs, used for naming dynamic processes (`:unique`) or for local pub/sub (`:duplicate`).

```elixir
# application.ex
{Registry, keys: :unique, name: MyApp.Registry}

# name a process
GenServer.start_link(Room, id, name: {:via, Registry, {MyApp.Registry, {:room, id}}})

# look it up
Registry.lookup(MyApp.Registry, {:room, 42})   # [{pid, value}] or []
```

When a registered process dies, its entry is removed automatically (Registry monitors it).

## 4. ETS: fast in-memory tables

> **In short:** **ETS** (Erlang Term Storage) gives you in-memory key-value tables, owned by a process, that **many processes can read and write concurrently** without going through a single GenServer.

```elixir
table = :ets.new(:cache, [:set, :public, :named_table, read_concurrency: true])

:ets.insert(:cache, {"user:1", %{name: "Anoop"}})
:ets.lookup(:cache, "user:1")           # [{"user:1", %{name: "Anoop"}}]
:ets.lookup(:cache, "missing")          # []
:ets.delete(:cache, "user:1")

# Atomic counter: concurrent-safe, no GenServer bottleneck
:ets.insert(:cache, {"hits", 0})
:ets.update_counter(:cache, "hits", 1)  # 1
:ets.update_counter(:cache, "rate:ip", {2, 1}, {"rate:ip", 0})  # increment with a default
```

| Option | Meaning |
| --- | --- |
| `:set` / `:ordered_set` / `:bag` / `:duplicate_bag` | Unique keys / sorted unique keys / duplicate keys allowed |
| `:public` / `:protected` (default) / `:private` | Who can write: anyone / only the owner (anyone reads) / only the owner |
| `:named_table` | Refer to the table by its atom name |
| `read_concurrency` / `write_concurrency` | Tune for read-heavy or write-heavy workloads |

**Important:** a table is owned by the process that created it, and it's **deleted when the owner dies**. Common pattern: a GenServer creates the table in `init` (and handles expiry), while clients read straight from ETS:

```elixir
defmodule Cache do
  use GenServer
  def start_link(_), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  def get(key) do
    case :ets.lookup(__MODULE__, key) do
      [{^key, value, expires_at}] ->
        if System.monotonic_time(:millisecond) < expires_at, do: {:ok, value}, else: :miss
      [] -> :miss
    end
  end

  def put(key, value, ttl_ms \\ 60_000) do
    expires_at = System.monotonic_time(:millisecond) + ttl_ms
    :ets.insert(__MODULE__, {key, value, expires_at})
    :ok
  end

  @impl true
  def init(_) do
    :ets.new(__MODULE__, [:set, :public, :named_table, read_concurrency: true])
    {:ok, nil}
  end
end
```

Reads never touch the GenServer process, so there's no bottleneck. (For production caching, libraries like **Cachex** or **Nebulex** are built on this.)

Related: `:persistent_term` gives extremely fast reads for data that almost never changes (config). Writes are expensive.

## 5. Distribution: connecting nodes

> **In short:** BEAM nodes can connect into a cluster, and then sending a message to a PID on another machine works exactly like sending one locally.

```bash
iex --sname a --cookie secret
iex --sname b --cookie secret
```

```elixir
# on node b
Node.connect(:"a@your-hostname")
Node.list()                                  # [:"a@your-hostname"]
Node.spawn(:"a@your-hostname", fn -> IO.puts("running on a") end)
```

Phoenix.PubSub uses this: a broadcast on one node reaches subscribers on every node, which is how Phoenix scales real-time features horizontally. In production, nodes discover each other with **libcluster** or **DNSCluster** (in new Phoenix apps by default).

Caveats to mention in interviews: networks partition, and distributed Erlang assumes a trusted network. For state that must survive partitions, use a database or a consensus system rather than `:global` registrations.

## 6. Which tool when?

| Need | Use |
| --- | --- |
| Run something concurrently and get the result | `Task.async` / `await` |
| Parallel map with limited concurrency | `Task.async_stream` |
| Fire-and-forget, may fail | `Task.Supervisor.start_child` |
| Must happen even if the server restarts | **Oban** job |
| Stateful entity with logic | GenServer |
| Dynamic number of stateful entities | DynamicSupervisor + Registry + GenServer |
| Shared, read-heavy, fast data / counters | ETS |
| Data that rarely changes, read everywhere | `:persistent_term` |
| Broadcast events to many processes | Phoenix.PubSub |

## Exercises

1. Fetch 3 URLs in parallel with `Task.async` + `Task.await_many` using `Req`, and time it against doing them sequentially (`:timer.tc/1`).
2. Use `Task.async_stream` with `max_concurrency: 2` over 10 items that each `Process.sleep(500)`. How long does it take?
3. Rewrite the rate limiter from lesson 02 with ETS and `update_counter`.
4. Connect two IEx nodes and send a message from one to a registered process on the other.

## Interview questions

<details>
<summary>What's the difference between Task.async and Task.Supervisor.async_nolink?</summary>

`Task.async` links the task to the caller, so a crash in the task crashes the caller (and vice versa), and you must `await` it. `async_nolink` under a `Task.Supervisor` doesn't link, so the caller survives task crashes and handles the result with `Task.yield`, getting `{:exit, reason}` on failure. Use it when failures are expected and should be handled, for example calling flaky external APIs from a LiveView.

</details>

<details>
<summary>What is ETS and when would you use it over a GenServer?</summary>

ETS is a built-in in-memory key-value store whose tables can be read and written concurrently by many processes, with constant-time lookups for sets. Use it when many processes need fast shared access, such as caches, counters, rate limiting and lookup tables, because a GenServer serializes every access through one mailbox. Tables are owned by a process and disappear when it dies, so the owner is usually a supervised GenServer.

</details>

<details>
<summary>How does Elixir handle work across multiple machines?</summary>

BEAM nodes connect into a cluster with distributed Erlang, sharing a cookie. Processes can then message remote PIDs transparently, and tools such as `:global`, `:pg` and Phoenix.PubSub work cluster-wide. Nodes discover each other with libcluster or DNSCluster. For durable distributed work, combine this with a database (for example Oban for jobs), because distribution doesn't solve network partitions for you.

</details>
