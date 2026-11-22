# 02 · GenServer

> **Plain English:** A GenServer is a worker that **remembers something** (its state) and answers requests about it. Picture a shop assistant who keeps the stock count. You can *ask* and wait for an answer (`call`), or *tell* them something and walk away (`cast`). Because they serve one customer at a time, the count never gets mixed up, and you need no locks.

**GenServer** = "generic server". It's the hand-written loop from the last lesson, standardised. Expect at least one interview question asking you to write or explain a GenServer.

## 1. Anatomy

> **In short:** A GenServer module has a **client API** (plain functions other code calls) and **server callbacks** (`init`, `handle_call`, `handle_cast`, `handle_info`) that run inside the process.

```elixir
defmodule Counter do
  use GenServer

  # ── Client API: runs in the CALLER's process ─────────────────────
  def start_link(initial \\ 0) do
    GenServer.start_link(__MODULE__, initial, name: __MODULE__)
  end

  def increment(by \\ 1), do: GenServer.cast(__MODULE__, {:inc, by})
  def value, do: GenServer.call(__MODULE__, :value)

  # ── Server callbacks: run INSIDE the GenServer process ───────────
  @impl true
  def init(initial) do
    {:ok, initial}                      # the initial state
  end

  @impl true
  def handle_cast({:inc, by}, count) do
    {:noreply, count + by}              # new state, no reply
  end

  @impl true
  def handle_call(:value, _from, count) do
    {:reply, count, count}              # {:reply, response, new_state}
  end
end
```

```elixir
{:ok, _pid} = Counter.start_link(10)
Counter.increment()
Counter.increment(5)
Counter.value()    # 16
```

Wrapping `GenServer.call/cast` in client functions is a convention: callers never see the message format, and you can change internals freely.

## 2. `call` vs `cast` vs `info`

> **In short:** `call` is synchronous and waits for a reply. `cast` is fire-and-forget. `handle_info` handles any other message (timers, monitors, raw `send`s).

| | `GenServer.call/3` | `GenServer.cast/2` | `send/2` → `handle_info/2` |
| --- | --- | --- | --- |
| Caller waits? | Yes (default timeout **5 s**, then the caller crashes) | No | No |
| Gets a reply? | Yes | No | No |
| Back-pressure | Yes: the caller slows down if the server is busy | No: the mailbox can grow without limit | No |
| Use for | Reads, and writes where you need confirmation | Truly fire-and-forget updates | Timers (`Process.send_after`), `:DOWN` monitors, PubSub messages |

**Default to `call`.** It gives back-pressure and surfaces errors. Use `cast` only when you've thought about mailbox growth.

## 3. Callback return values

> **In short:** Each callback returns a tuple telling GenServer what to do next.

```elixir
# init/1
{:ok, state}
{:ok, state, {:continue, :load}}   # run handle_continue right after init, without blocking start_link
{:stop, reason}
:ignore

# handle_call/3
{:reply, reply, new_state}
{:noreply, new_state}              # reply later with GenServer.reply(from, value)
{:stop, reason, reply, new_state}

# handle_cast/2, handle_info/2, handle_continue/2
{:noreply, new_state}
{:noreply, new_state, timeout_or_continue}
{:stop, reason, new_state}
```

## 4. Periodic work with `handle_info`

> **In short:** Schedule a message to yourself with `Process.send_after/3`, handle it in `handle_info`, and schedule the next one.

```elixir
defmodule Cleaner do
  use GenServer
  @interval :timer.minutes(5)

  def start_link(_), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)

  @impl true
  def init(state) do
    schedule()
    {:ok, state}
  end

  @impl true
  def handle_info(:cleanup, state) do
    # ... delete expired sessions, etc.
    schedule()
    {:noreply, state}
  end

  # Always have a catch-all clause, so unexpected messages don't pile up silently
  def handle_info(msg, state) do
    require Logger
    Logger.warning("Unexpected message: #{inspect(msg)}")
    {:noreply, state}
  end

  defp schedule, do: Process.send_after(self(), :cleanup, @interval)
end
```

(For real scheduled jobs in a web app, prefer **Oban** with cron. It survives restarts and runs once across a cluster. See [05-Testing-and-Production/02](../05-Testing-and-Production/02-background-jobs-oban.md).)

## 5. Slow initialisation: `handle_continue`

> **In short:** Don't do slow work in `init`, because it blocks the supervisor from starting the rest of the app. Return `{:continue, ...}` and do the work right after.

```elixir
@impl true
def init(_), do: {:ok, %{data: nil}, {:continue, :load}}

@impl true
def handle_continue(:load, state) do
  data = expensive_load()
  {:noreply, %{state | data: data}}
end
```

## 6. A realistic example: a rate limiter

> **In short:** Per-key counters, a periodic reset and synchronous checks. This kind of thing comes up in interviews.

```elixir
defmodule RateLimiter do
  use GenServer

  @limit 5
  @window_ms 60_000

  def start_link(_opts), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)

  @doc "Returns :ok or {:error, :rate_limited}"
  def check(key), do: GenServer.call(__MODULE__, {:check, key})

  @impl true
  def init(state) do
    Process.send_after(self(), :reset, @window_ms)
    {:ok, state}
  end

  @impl true
  def handle_call({:check, key}, _from, counts) do
    count = Map.get(counts, key, 0)

    if count >= @limit do
      {:reply, {:error, :rate_limited}, counts}
    else
      {:reply, :ok, Map.put(counts, key, count + 1)}
    end
  end

  @impl true
  def handle_info(:reset, _counts) do
    Process.send_after(self(), :reset, @window_ms)
    {:noreply, %{}}
  end
end
```

Follow-up the interviewer will ask: **"What's the bottleneck?"** Every request goes through **one process**, so it handles one message at a time. Fixes: use **ETS** with `:ets.update_counter/4` for concurrent atomic increments (lesson 04), shard across several GenServers by key hash, or use a library such as **Hammer**.

## 7. Naming GenServers

> **In short:** Name a process with an atom (one per node), a `{:via, Registry, ...}` tuple (many dynamic ones), or `{:global, ...}` (cluster-wide).

```elixir
GenServer.start_link(Mod, arg, name: __MODULE__)                       # a singleton
GenServer.start_link(Mod, arg, name: {:via, Registry, {MyRegistry, "room:42"}})  # dynamic, e.g. one per chat room
GenServer.start_link(Mod, arg, name: {:global, :leader})              # across connected nodes
```

## 8. Common pitfalls (interviewers love these)

> **In short:** A GenServer is a serialization point. Don't use one for things that don't need serialized state, and don't block it.

1. **Bottleneck:** every call goes through one process. Don't wrap stateless logic in a GenServer ("code organisation" is not a reason). Use plain modules and functions.
2. **Long work inside callbacks** blocks every other caller. Hand slow work to a `Task` and reply later, or move it out of the process entirely.
3. **`call` timeouts:** the default is 5 s. If the server is slow, callers crash with `exit({:timeout, ...})`.
4. **Deadlock:** a GenServer calling **itself** (`GenServer.call(self(), ...)`) hangs until the timeout.
5. **Unbounded mailbox** from too many `cast`s.
6. **Lost state on crash:** state lives in memory. If it matters, persist it (DB/ETS) and reload it in `init`.

## 9. Testing a GenServer

```elixir
defmodule CounterTest do
  use ExUnit.Case, async: true

  test "increments" do
    pid = start_supervised!({Counter, 0})   # started and stopped with the test
    Counter.increment()
    assert Counter.value() == 1
  end
end
```

(For async tests with named singletons you'd pass the name in as an option, so that tests don't share one process.)

## Exercises

1. Write a `Stack` GenServer: `push/1` (cast), `pop/0` (call, returning `{:ok, item}` or `{:error, :empty}`).
2. Write a `KV` cache GenServer with `put/3` (with a TTL in ms) and `get/1`. Expire entries with `Process.send_after(self(), {:expire, key}, ttl)`.
3. Add `handle_continue` to load initial cache data from a file.
4. Explain out loud why the rate limiter is a bottleneck and how ETS would fix it.

## Interview questions

<details>
<summary>What is a GenServer?</summary>

An OTP behaviour that implements a generic client-server process: a long-running process that holds state and handles messages one at a time. You implement callbacks (`init/1`, `handle_call/3`, `handle_cast/2`, `handle_info/2`, optionally `handle_continue/2` and `terminate/2`), and GenServer provides the receive loop, replies, timeouts, naming, debugging hooks and integration with supervisors.

</details>

<details>
<summary>call vs cast: which do you prefer and why?</summary>

`call` is synchronous: the caller blocks until the reply arrives (or a 5 s timeout). `cast` is asynchronous with no reply. I prefer `call` by default, because it gives **back-pressure** (callers can't flood the server), you learn about failures, and ordering is easier to reason about. `cast` is for genuinely fire-and-forget updates where losing confirmation is acceptable and the message rate is bounded.

</details>

<details>
<summary>When should you NOT use a GenServer?</summary>

When there's no state to protect, or no need to serialize access. A GenServer runs one message at a time, so wrapping pure logic in one creates a needless bottleneck. Use plain modules for logic, ETS for concurrent read-heavy shared data, `Task` for one-off concurrent work, and the database for persistent state.

</details>

<details>
<summary>What's handle_info used for?</summary>

Any message that didn't come through `GenServer.call` or `cast`: timer messages from `Process.send_after`, `:DOWN` messages from monitors, `:EXIT` signals when trapping exits, PubSub broadcasts, and replies from raw `send`s or Tasks. Always include a catch-all clause to log and drop unexpected messages.

</details>

<details>
<summary>How would you scale a GenServer that has become a bottleneck?</summary>

Move hot reads to **ETS** (concurrent reads, atomic counters), shard state across several processes (by key hash, or one process per entity via Registry + DynamicSupervisor), offload slow work to Tasks, or rethink whether the state needs a process at all and could live in the database instead.

</details>
