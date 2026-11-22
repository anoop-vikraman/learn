# 06 · Designing with processes: when to spawn, and when not to

> **Plain English:** knowing *how* to write a GenServer is easy. Knowing *when* to use one is what interviewers actually test. This lesson gives you a decision guide and walks through real designs.

## 1. The golden rule

> **In short:** Use processes for **runtime** reasons (concurrency, isolation, state that lives over time, resource management), **not** to organise code. To organise code, use modules and functions.

People coming from object-oriented languages are tempted to make "a process per thing", like objects. That leads to bottlenecks and complexity.

| ✅ Good reasons for a process | ❌ Bad reasons |
| --- | --- |
| Do work **concurrently** (fetch 10 APIs in parallel) | "It's a service, so it should be a GenServer" |
| **Isolate failures** (a flaky integration shouldn't crash requests) | Grouping related functions |
| Hold **state that changes over time** and is accessed by many (a cache, a game room) | Holding data that's already in the database |
| Manage a **resource** (a connection, a file, a port) | Making code "look like" OOP objects |
| Do something **periodically** (a timer, polling) | Wrapping a pure calculation |

## 2. Decision guide

```
Do you need to run things at the same time?
├─ yes, one-off work with a result → Task / Task.async_stream
├─ yes, must survive restarts → Oban job
└─ no ↓
Do you need state that lives between requests?
├─ no → plain module + functions (most of your code!)
└─ yes ↓
Must it survive a restart/deploy?
├─ yes → database (maybe cached in ETS)
└─ no ↓
Is it read by many processes, very often?
├─ yes → ETS (owned by a GenServer that writes/cleans)
└─ no ↓
One per entity (room, game, device, session)?
├─ yes → GenServer per entity + Registry + DynamicSupervisor
└─ no → a single GenServer (watch for bottlenecks)
```

## 3. Request processes already exist

> **In short:** Phoenix already runs every request, every LiveView and every channel in its own process. You get concurrency for free. Don't route every request through one GenServer.

❌ A bottleneck:

```elixir
defmodule TaskService do
  use GenServer
  def create(attrs), do: GenServer.call(__MODULE__, {:create, attrs})   # every user waits in ONE line
  def handle_call({:create, attrs}, _, s), do: {:reply, Repo.insert(...), s}
end
```

✅ Just a function, running in each caller's own process:

```elixir
defmodule Tasks do
  def create(attrs), do: %Task{} |> Task.changeset(attrs) |> Repo.insert()
end
```

The database handles concurrent writes. Wrapping it in a GenServer only adds a queue.

## 4. Design walkthroughs

### A. In-memory cache for an expensive API

- **Need:** fast reads from many request processes, refreshed every 10 minutes.
- **Design:** a GenServer **owns** an ETS table (`read_concurrency: true`) and refreshes it on a timer. Request processes **read ETS directly**, never calling the GenServer.
- **Crash:** the supervisor restarts the GenServer, which recreates and refills the table. Reads miss briefly, so fall back to the API.

### B. Multiplayer game rooms or live auctions

- **Need:** each room has fast-changing shared state (players, bids, a timer), and all participants must see updates instantly.
- **Design:** a GenServer **per room**, named via Registry (`{:via, Registry, {Rooms, room_id}}`) and started on demand under a DynamicSupervisor (or PartitionSupervisor). The room broadcasts changes via PubSub, and LiveViews subscribe. The final result is persisted to the DB.
- **Crash:** only that room restarts. Persist snapshots if losing state is unacceptable.
- **Cluster:** use Horde or `:global`, or route a room to a fixed node with consistent hashing, so a room doesn't run on two nodes.

### C. Rate limiter

- **Need:** count requests per key, very fast, from every request process.
- **Design:** ETS with `:ets.update_counter/4` (atomic, no GenServer in the path), plus a small GenServer that clears old windows. Or use the **Hammer** library.

### D. Sending emails after signup

- **Need:** must happen even if the server restarts, with retries.
- **Design:** an **Oban** job inserted in the same transaction as the user. No custom process.

### E. Talking to a third-party WebSocket feed (e.g. stock prices)

- **Need:** a long-lived connection with reconnects, and messages delivered to many LiveViews.
- **Design:** one supervised connection process (e.g. using `WebSockex` or `Mint.WebSocket`) that broadcasts each message via PubSub. If it crashes, the supervisor reconnects it (add backoff).

### F. Per-user session data (e.g. a shopping cart)

- **Option 1 (usual):** store it in the DB (survives deploys, works across nodes).
- **Option 2:** in the LiveView's assigns (lost on reconnect unless rebuilt from the DB).
- **Option 3:** a GenServer per user: only if there's real-time logic and timers. It adds complexity around clusters and deploys.

## 5. Common anti-patterns

| Anti-pattern | Why it hurts | Better |
| --- | --- | --- |
| A GenServer wrapping Repo calls | A single-file queue for the whole app | Plain context functions |
| One global GenServer for hot data | A bottleneck at scale | ETS, partitioning |
| `cast` everywhere | Unbounded mailboxes, silent failures | `call` with timeouts |
| Long work inside `handle_call` | Blocks all callers, causes timeouts | Hand the work to a Task, `GenServer.reply/2` later |
| Unsupervised `spawn` | Crashes go unnoticed, processes leak | `Task.Supervisor`, DynamicSupervisor |
| Storing the only copy of important data in a process | Lost on crash or deploy | DB as the source of truth |
| Catching every error with `try/rescue` | Hides bugs, keeps broken state alive | Let it crash, supervise |
| Huge state copied in messages | Slow copying between processes | Send ids, keep big data in ETS or the DB |

## 6. Thinking about failure: "what if this crashes?"

For every process you add, be ready to answer:

1. **Who supervises it?** (Where in `application.ex`?)
2. **What state is lost on restart, and is that OK?**
3. **What happens to callers while it restarts?** (Do they time out or retry?)
4. **What if it crashes repeatedly?** (Restart intensity, escalation.)
5. **What if there are 2 nodes?** (Duplicated singletons? Use Oban, `:global`, or leader election.)

Practising these five questions out loud is great interview preparation.

## 7. Error kernel design

> **In short:** Keep the most important state in the most stable processes near the top of the tree, and put risky work (external calls, parsing) in short-lived child processes that are allowed to crash.

```
Application supervisor
├── Repo, PubSub                  ← stable "error kernel"
├── Cache owner (GenServer + ETS) ← simple, rarely crashes
├── Task.Supervisor               ← risky external calls run here and may crash
└── Endpoint                      ← each request is its own disposable process
```

## Exercises

1. For each of these, decide: plain module, Task, Oban, GenServer, GenServer per entity, or ETS. Then justify it out loud: (a) a currency-conversion function, (b) a nightly report, (c) "who's typing" in a chat, (d) feature flags read on every request, (e) a 10-minute quiz game with a countdown, (f) resizing uploaded images.
2. Draw the supervision tree for your trial project, including any processes you added.
3. Take the rate limiter from lesson 02 and redesign it with ETS. Answer the five failure questions.

## Interview questions

<details>
<summary>When should you use a GenServer, and when shouldn't you?</summary>

Use one for runtime concerns: state that changes over time and must be shared or serialized, resource ownership (connections, ETS tables), periodic work, or isolating failure. Don't use one to organize code or wrap stateless logic and database calls. That creates a bottleneck, because every call is handled one at a time. Phoenix already gives each request its own process, so plain functions are concurrent by default.

</details>

<details>
<summary>Design a live auction system with Elixir.</summary>

Each auction is a GenServer started on demand under a DynamicSupervisor and found through a Registry. It holds the current bid, the bidders and the end timer (`Process.send_after`), and validates bids serially, so there are no race conditions. Accepted bids are persisted to Postgres and broadcast via PubSub to bidders' LiveViews. When the timer fires, it closes the auction, persists the result and enqueues Oban jobs for notifications and payment. On restart, it reloads state from the DB. Across a cluster, ensure one process per auction (Horde, `:global`, or consistent hashing).

</details>

<details>
<summary>What questions do you ask before adding a new process to a system?</summary>

Why does it need to be a process (concurrency, state, isolation, resource)? Who supervises it, and with what restart strategy? What state is lost on crash, and does it need persisting? How do callers behave during a restart? Could it become a bottleneck? And how does it behave with multiple nodes?

</details>
