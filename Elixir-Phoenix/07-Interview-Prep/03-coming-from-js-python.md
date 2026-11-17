# Coming from JS/Python: translation tables and how to talk about it

## 1. Concepts

| You know (JS/TS, Node, Python) | In Elixir |
| --- | --- |
| `const`/`let`, mutation | Immutable values, rebinding names |
| Classes, `this`, methods | Modules + functions + structs (data and behaviour are separate) |
| Interfaces (TS) / ABCs (Python) | Behaviours (`@callback`) |
| Duck typing / method overloading | Protocols, multi-clause functions |
| `if/else`, `switch` | Pattern matching in function heads, `case`, `cond` |
| `try/catch`, throwing errors | `{:ok, _}` / `{:error, _}` + `with`; crash and supervise |
| `for` / `while` loops | `Enum`, `for` comprehensions, recursion |
| Array methods (`map`, `filter`, `reduce`) | `Enum.map/filter/reduce` (data first, so pipes work) |
| Generators / iterators | `Stream` |
| `async/await`, Promises | `Task.async/await`, or processes and messages |
| `Promise.all` | `Task.await_many` / `Task.async_stream` |
| Event loop (single thread) | Preemptive schedulers on all cores |
| Worker threads / multiprocessing | Just spawn processes (cheap and isolated) |
| Redis for shared state/caching | ETS / GenServer (in-VM), plus Redis if you want |
| Socket.IO | Phoenix Channels |
| BullMQ / Celery | Oban |
| npm / pip, `package.json` / `pyproject.toml` | Hex, `mix.exs` |
| Jest / pytest | ExUnit (built in, async by default) |
| ESLint / Prettier / mypy | Credo / `mix format` / Dialyzer + compiler type checks |
| Express middleware / Django middleware | Plugs |
| Express routes / Django URLs | Phoenix Router |
| Prisma / SQLAlchemy / Django ORM | Ecto (Repo + Schema + Changeset + Query) |
| Zod / Pydantic validation | Ecto changesets (also for schemaless data) |
| Service layer | Contexts |
| React + REST + React Query + WebSocket | LiveView (state on the server, diffs over WS) |
| `useState`, `setState` | `assign/3` |
| `useEffect` on mount | `mount/3` (guarded by `connected?`) |
| Props / children | `attr` / slots |
| `.env` + `process.env` | `config/runtime.exs` + `System.get_env` |
| PM2 / gunicorn + Docker | Mix releases + Docker |
| Node REPL / ipython | IEx (and remote IEx into production!) |

## 2. Same code, three languages

**Sum the prices of paid orders**

```js
orders.filter(o => o.status === "paid").map(o => o.total).reduce((a, b) => a + b, 0)
```

```python
sum(o["total"] for o in orders if o["status"] == "paid")
```

```elixir
orders
|> Enum.filter(&(&1.status == :paid))
|> Enum.map(& &1.total)
|> Enum.sum()
```

**Handle a result**

```js
try {
  const user = await createUser(params)
  res.status(201).json(user)
} catch (e) {
  if (e instanceof ValidationError) res.status(422).json(e.errors)
  else throw e
}
```

```elixir
case Accounts.create_user(params) do
  {:ok, user} -> conn |> put_status(:created) |> json(user)
  {:error, %Ecto.Changeset{} = cs} -> conn |> put_status(422) |> json(errors(cs))
end
```

**Parallel requests**

```js
const [user, orders] = await Promise.all([getUser(id), getOrders(id)])
```

```elixir
[user, orders] = Task.await_many([Task.async(fn -> get_user(id) end), Task.async(fn -> get_orders(id) end)])
```

**A stateful counter "service"**

```js
class Counter { count = 0; inc() { this.count++ } get() { return this.count } }
```

```elixir
# A process holding state, safe for concurrent callers without locks
defmodule Counter do
  use GenServer
  def start_link(_), do: GenServer.start_link(__MODULE__, 0, name: __MODULE__)
  def inc, do: GenServer.cast(__MODULE__, :inc)
  def get, do: GenServer.call(__MODULE__, :get)
  @impl true
  def init(n), do: {:ok, n}
  @impl true
  def handle_cast(:inc, n), do: {:noreply, n + 1}
  @impl true
  def handle_call(:get, _, n), do: {:reply, n, n}
end
```

## 3. Mindset shifts that trip people up

1. **No mutation:** `Map.put(m, :k, v)` doesn't change `m`. Always use the return value.
2. **No early return:** use function clauses, `with` or `case`.
3. **`=` is matching:** `{:ok, x} = something()` crashes if it isn't `:ok`, and that's often on purpose.
4. **Data first:** design functions as `verb(data, args)` so they pipe.
5. **Strings vs atoms:** params are string-keyed maps; your internal data uses atom keys.
6. **Lists are linked lists:** no `list[i]`; prepend, then reverse.
7. **Don't reach for GenServer for code organisation.** Plain modules are the default.
8. **Don't rescue everything.** Let supervisors do their job.
9. **`mount` runs twice** in LiveView.
10. **Read the docs in IEx** (`h Enum.reduce`). They're excellent.

## 4. Talking about your background in the interview

You're a React/Node developer learning Elixir in a few weeks. Present it as a strength:

> "My background is React and Node, with some Python/FastAPI. I've built real-time features the hard way: Socket.IO servers, Redis pub/sub, client caches with React Query, BullMQ workers. That's what pulled me to Elixir: Phoenix gives you PubSub, Presence, LiveView and Oban as one coherent system, on a runtime designed for exactly this. In the last few weeks I went through the language and OTP fundamentals and built TaskMate, a real-time board with LiveView streams, PubSub, Presence, a token-authed JSON API, and Oban jobs, with tests and CI. My front-end experience transfers directly to LiveView's component model, and my Node experience makes me appreciate preemptive scheduling and process isolation."

Points to make:
- **Transferable:** component thinking (function components ≈ React components), REST/API design, SQL/Postgres, testing culture, Docker/CI, real-time UX intuition.
- **What surprised you:** pattern matching replacing conditionals; `with`; how little code real-time took; supervisors restarting a killed process live in IEx; the Ecto changeset as a single source of validation for both the API and forms.
- **What you're still learning (be honest):** advanced OTP (distribution, hot upgrades), macros/metaprogramming, performance tuning at scale.
- **Show momentum:** commits, the deployed URL, tests, and a clear README with decisions.

## 5. Questions you might get because of your background

<details>
<summary>"How is LiveView different from React?"</summary>

In React, state and rendering live in the browser and you sync with the server through an API. In LiveView, state lives in a server process per user, events go over a WebSocket, and the server sends minimal HTML diffs. You skip the API layer, client cache and duplicated validation, but you depend on the connection (latency, offline). For interactions that need instant feedback I'd use JS commands or hooks, or embed a React component via a hook for complex widgets.

</details>

<details>
<summary>"Why not just use Node for real-time?"</summary>

Node can do it, but it's single-threaded and cooperative: CPU work blocks every connection, a crash can take down the whole process, and scaling across cores and nodes needs extra infrastructure (cluster mode, Redis adapter, sticky sessions). The BEAM gives each connection an isolated, preemptively scheduled process, uses all cores, has supervision for recovery, and has distributed PubSub and Presence built in. It was designed for millions of concurrent connections.

</details>

<details>
<summary>"What was hardest to learn?"</summary>

Thinking in processes: knowing when state deserves its own process (and when it doesn't), and getting used to "let it crash" instead of defensive try/catch. Also unlearning mutation and early returns. Once pattern matching clicked, the rest of the code became much easier to read.

</details>
