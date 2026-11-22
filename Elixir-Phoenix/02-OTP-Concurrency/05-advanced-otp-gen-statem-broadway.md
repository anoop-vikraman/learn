# 05 · Advanced OTP: lifecycle, state machines, GenStage, Broadway and more

> **Plain English:** you know GenServers and supervisors. This lesson covers the remaining tools: how processes shut down cleanly, how to model "things with states" (an order that goes pending → paid → shipped), how to process streams of data without being overwhelmed, and how to spread load across CPU cores.

## 1. The full GenServer lifecycle

> **In short:** `start_link` → `init` → (`handle_continue`) → a loop of `handle_call`/`handle_cast`/`handle_info` → `terminate` (only sometimes!).

```
start_link ──▶ init/1 ──▶ handle_continue/2 (optional)
                              │
         ┌────────────────────▼────────────────────┐
         │ wait for message ──▶ handle_call/cast/info │◀─┐
         └────────────────────┬────────────────────┘  │
                              └──── new state ─────────┘
                              │
                stop / crash / supervisor shutdown
                              ▼
                     terminate/2 (if trapping exits or stopping itself)
```

### `terminate/2` is NOT guaranteed

> **In short:** `terminate/2` runs when the GenServer stops itself (`{:stop, ...}`), or when its supervisor shuts it down **and** it traps exits. It does **not** run on `:kill` or when the whole VM dies abruptly. Never rely on it for anything critical.

```elixir
@impl true
def init(state) do
  Process.flag(:trap_exit, true)     # so a supervisor shutdown calls terminate/2
  {:ok, state}
end

@impl true
def terminate(reason, state) do
  Logger.info("Shutting down: #{inspect(reason)}, flushing #{length(state.buffer)} items")
  flush_to_db(state.buffer)          # best effort only
  :ok
end
```

The supervisor waits for the child's `shutdown` time (default **5000 ms** for workers) before force-killing it.

### Graceful shutdown of the whole app

On `SIGTERM` (e.g. a Kubernetes or Fly deploy), the BEAM stops applications in reverse start order, so your supervision tree shuts down from the bottom up:
1. The Endpoint stops accepting new requests and lets in-flight requests finish (Bandit drains connections).
2. Your workers get their `shutdown` time.
3. Oban stops fetching jobs and waits for running ones (its `shutdown_grace_period` option).

To make sure in-memory work isn't lost: keep it small, persist important things as you go, and use Oban for durable work.

## 2. Replying later: `GenServer.reply/2`

> **In short:** A `handle_call` can return `{:noreply, state}`, keep the caller's `from`, and reply later. The GenServer stays free to handle other messages while slow work happens elsewhere.

```elixir
@impl true
def handle_call({:fetch, url}, from, state) do
  Task.start(fn ->
    result = Req.get(url)
    GenServer.reply(from, result)     # the original caller unblocks now
  end)
  {:noreply, state}                    # the server is immediately free for other calls
end
```

## 3. Hibernation and memory

```elixir
{:noreply, state, :hibernate}   # compact the process's memory (useful for idle, long-lived processes)
{:noreply, state, 30_000}       # timeout: you'll get a :timeout message in handle_info if idle for 30 s
```

A common pattern is to stop idle per-entity processes (e.g. chat rooms) after a period of inactivity, to free memory:

```elixir
def handle_info(:timeout, state), do: {:stop, :normal, state}
```

## 4. State machines with `:gen_statem`

> **In short:** When your process has clear **states** (locked/unlocked, pending/paid/shipped) and the allowed actions depend on the current state, use `:gen_statem` instead of a GenServer full of `if` checks. It also has built-in state timeouts.

Analogy: a **vending machine**. In the "waiting for coin" state, pressing a drink button does nothing. In the "has coin" state, it dispenses. After 30 seconds with no choice, it refunds the coin.

```elixir
defmodule DoorLock do
  @behaviour :gen_statem

  # ── API ──
  def start_link(code), do: :gen_statem.start_link({:local, __MODULE__}, __MODULE__, code, [])
  def unlock(code), do: :gen_statem.call(__MODULE__, {:unlock, code})
  def lock, do: :gen_statem.call(__MODULE__, :lock)
  def state, do: :gen_statem.call(__MODULE__, :get_state)

  def child_spec(code),
    do: %{id: __MODULE__, start: {__MODULE__, :start_link, [code]}}

  # ── Callbacks ──
  @impl true
  def callback_mode, do: :handle_event_function

  @impl true
  def init(code), do: {:ok, :locked, %{code: code, failed_attempts: 0}}

  # Correct code while locked → unlock, and automatically re-lock after 5 seconds
  @impl true
  def handle_event({:call, from}, {:unlock, code}, :locked, %{code: code} = data) do
    {:next_state, :unlocked, %{data | failed_attempts: 0},
     [{:reply, from, :ok}, {:state_timeout, 5_000, :auto_lock}]}
  end

  # Wrong code while locked
  def handle_event({:call, from}, {:unlock, _wrong}, :locked, data) do
    {:keep_state, %{data | failed_attempts: data.failed_attempts + 1},
     [{:reply, from, {:error, :wrong_code}}]}
  end

  # Already unlocked
  def handle_event({:call, from}, {:unlock, _}, :unlocked, _data) do
    {:keep_state_and_data, [{:reply, from, {:error, :already_unlocked}}]}
  end

  def handle_event({:call, from}, :lock, _state, data) do
    {:next_state, :locked, data, [{:reply, from, :ok}]}
  end

  def handle_event(:state_timeout, :auto_lock, :unlocked, data) do
    {:next_state, :locked, data}
  end

  def handle_event({:call, from}, :get_state, state, _data) do
    {:keep_state_and_data, [{:reply, from, state}]}
  end
end
```

Each `handle_event` clause matches on **(event, current state, data)**, which makes the rules easy to read. A `state_timeout` is automatically cancelled when the state changes. The `gen_state_machine` Hex package offers an Elixir-friendly wrapper.

**Alternative for business workflows:** often you don't need a process at all. Store `status` in the DB and enforce allowed transitions in a pure function:

```elixir
def transition(%Order{status: :pending} = o, :pay), do: {:ok, %{o | status: :paid}}
def transition(%Order{status: :paid} = o, :ship), do: {:ok, %{o | status: :shipped}}
def transition(%Order{status: s}, event), do: {:error, {:invalid_transition, s, event}}
```

Use `:gen_statem` when the state machine is **live** (connections, devices, timers, protocols). Use a DB status plus pure functions for **business records**.

## 5. Back-pressure, GenStage and Broadway

> **In short:** If a producer sends messages faster than a consumer handles them, mailboxes grow until memory runs out. **GenStage** flips the model: consumers **ask for** N items when they're ready (demand). **Broadway** builds on GenStage to consume queues like SQS, Kafka and RabbitMQ with batching, concurrency and acknowledgements.

Analogy: instead of a conveyor belt that keeps dumping boxes on a worker (push), the worker says "send me 10 more when I'm done" (pull).

```
Producer ──(sends only what was asked for)──▶ Consumer
         ◀──────── "I want 10 more" ─────────
```

### GenStage in brief

```elixir
defmodule Numbers do
  use GenStage
  def start_link(start), do: GenStage.start_link(__MODULE__, start, name: __MODULE__)
  def init(start), do: {:producer, start}

  def handle_demand(demand, counter) do
    events = Enum.to_list(counter..(counter + demand - 1))
    {:noreply, events, counter + demand}
  end
end

defmodule Printer do
  use GenStage
  def start_link(_), do: GenStage.start_link(__MODULE__, :ok)
  def init(:ok), do: {:consumer, :ok, subscribe_to: [{Numbers, max_demand: 10}]}

  def handle_events(events, _from, state) do
    Enum.each(events, &IO.inspect/1)
    {:noreply, [], state}
  end
end
```

### Broadway: production data pipelines

```elixir
defmodule MyApp.OrderPipeline do
  use Broadway
  alias Broadway.Message

  def start_link(_opts) do
    Broadway.start_link(__MODULE__,
      name: __MODULE__,
      producer: [
        module: {BroadwaySQS.Producer, queue_url: System.fetch_env!("ORDERS_QUEUE_URL")},
        concurrency: 2
      ],
      processors: [default: [concurrency: 20]],                     # 20 parallel workers
      batchers: [db: [batch_size: 100, batch_timeout: 1_000, concurrency: 4]]
    )
  end

  @impl true
  def handle_message(_processor, %Message{} = message, _context) do
    case JSON.decode(message.data) do
      {:ok, order} -> message |> Message.update_data(fn _ -> order end) |> Message.put_batcher(:db)
      {:error, _} -> Message.failed(message, :invalid_json)
    end
  end

  @impl true
  def handle_batch(:db, messages, _batch_info, _context) do
    rows = Enum.map(messages, & &1.data)
    MyApp.Repo.insert_all("orders", rows, on_conflict: :nothing)   # idempotent
    messages                                                        # successful → acked
  end
end
```

What Broadway handles for you: concurrency, batching, acknowledgements (messages are deleted from SQS only after success), retries via the queue, graceful shutdown, rate limiting and telemetry.

| Tool | Use when |
| --- | --- |
| `Task.async_stream` | Process a known list with limited concurrency |
| Oban | Durable jobs created by your app |
| **Broadway** | Consuming an external message queue at high throughput |
| GenStage | Building your own back-pressured pipeline stages |
| Flow | Parallel map-reduce over big collections |

## 6. Spreading load: PartitionSupervisor

> **In short:** One DynamicSupervisor, or one GenServer, can become a bottleneck. `PartitionSupervisor` (Elixir 1.14+) starts N copies (one per core by default) and routes each call to one of them by key.

```elixir
# application.ex
{PartitionSupervisor, child_spec: DynamicSupervisor, name: MyApp.RoomSupervisors}

# start a child in a partition chosen by a key
DynamicSupervisor.start_child(
  {:via, PartitionSupervisor, {MyApp.RoomSupervisors, room_id}},
  {MyApp.Room, room_id}
)
```

The same idea works for your own GenServers (e.g. a sharded cache): `{PartitionSupervisor, child_spec: MyCache, name: MyCaches}`, then `GenServer.call({:via, PartitionSupervisor, {MyCaches, key}}, msg)`.

## 7. Process groups (`:pg`) and Registry as pub/sub

```elixir
# :pg: cluster-wide groups of processes (Phoenix.PubSub uses it under the hood)
:pg.start_link()
:pg.join(:workers, self())
:pg.get_members(:workers)          # PIDs on every connected node

# Registry with duplicate keys: local pub/sub
{:ok, _} = Registry.start_link(keys: :duplicate, name: MyApp.Events)
Registry.register(MyApp.Events, "orders", [])
Registry.dispatch(MyApp.Events, "orders", fn entries ->
  for {pid, _} <- entries, do: send(pid, {:order_created, 42})
end)
```

## 8. Things to know, but rarely use

| Feature | What it is | Advice |
| --- | --- | --- |
| Process dictionary (`Process.put/get`) | Per-process global mutable storage | Avoid. It's hidden state. Libraries use it for things like Logger metadata |
| `:global` | Cluster-wide unique names | Fine for small clusters. Be careful with network splits |
| Hot code upgrades (`code_change/3`) | Swap code while it's running | Rare in web apps. Rolling deploys are simpler |
| `:sys.get_state/1`, `:sys.trace/2` | Inspect and trace any OTP process | Great for debugging, never for business logic |
| `Process.flag(:priority, :high)` | Scheduler priority | Almost never needed |
| `:erlang.process_info(pid, :message_queue_len)` | Mailbox size | Use it to monitor bottlenecks |

## Exercises

1. Add `Process.flag(:trap_exit, true)` and a `terminate/2` that logs to a GenServer. Stop it with `GenServer.stop/1`, then with `Process.exit(pid, :kill)`, and compare.
2. Build the `DoorLock` state machine, then add a "locked out" state after 3 failed attempts that lasts 10 seconds.
3. Write an `Order.transition/2` pure state machine with a test for every valid and invalid transition.
4. Build the GenStage `Numbers` → `Printer` pipeline and change `max_demand` to see the batches change.
5. Make a chat-room GenServer stop itself after 60 seconds of inactivity using the timeout return value.

## Interview questions

<details>
<summary>Is terminate/2 always called when a GenServer stops?</summary>

No. It's called when the GenServer returns a `{:stop, ...}` tuple, or when its supervisor shuts it down **and** it traps exits. It's not called on a brutal `:kill`, a linked crash without trapping, or a VM crash. Critical data must be persisted as you go, not in `terminate`.

</details>

<details>
<summary>When would you use gen_statem over a GenServer?</summary>

When the process is clearly a state machine: the valid events and behaviour depend on the current state, and you need state-specific timeouts (connection protocols, device control, a lock with auto-relock). `gen_statem` gives explicit state transitions, state timeouts and postponed events. For business entities stored in a DB, a status column plus pure transition functions is usually simpler.

</details>

<details>
<summary>What is back-pressure and how does Elixir handle it?</summary>

Back-pressure means slowing producers when consumers can't keep up, so queues don't grow without limit. In plain OTP, `GenServer.call` provides natural back-pressure (the caller waits). GenStage implements demand-driven flow, where consumers request N events. Broadway uses GenStage to consume message queues with bounded concurrency and batching. `Task.async_stream` limits concurrency with `max_concurrency`.

</details>

<details>
<summary>What is Broadway?</summary>

A library for building concurrent, multi-stage data ingestion pipelines on top of GenStage. You configure a producer (SQS, Kafka, RabbitMQ, Google Pub/Sub), processor concurrency and batchers, and implement `handle_message/3` and `handle_batch/4`. It handles acknowledgements, back-pressure, batching, graceful shutdown and telemetry.

</details>
