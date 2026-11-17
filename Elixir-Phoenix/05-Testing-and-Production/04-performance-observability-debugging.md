# 04 · Performance, observability and debugging

## 1. Debugging tools

> **In short:** Use `IO.inspect` with labels in pipelines, `dbg/1` for step-by-step pipe output, IEx breakpoints, and a remote IEx session into running systems.

```elixir
# IO.inspect returns its argument, so it fits anywhere in a pipeline
params
|> IO.inspect(label: "raw params")
|> normalize()
|> IO.inspect(label: "normalized")
|> save()

# dbg: prints the code, each pipe step and the results
[1, 2, 3]
|> Enum.map(&(&1 * 2))
|> Enum.sum()
|> dbg()

# Breakpoint-style: with `iex -S mix phx.server`, dbg() pauses execution and gives you a prompt
# (you may need: iex --dbg pry -S mix phx.server)
```

In IEx:

```elixir
recompile()
h MyApp.Tasks.create_task          # your own docs
exports(MyApp.Tasks)               # list its functions
open MyApp.Tasks                   # open the source in your editor ($ELIXIR_EDITOR)
runtime_info()
:sys.get_state(MyApp.RateLimiter)  # peek at a GenServer's state (debugging only!)
:sys.trace(pid, true)              # trace the messages a process handles
```

## 2. LiveDashboard

> **In short:** `/dev/dashboard` (protect it behind admin auth in prod) shows the OS, memory, processes, ports, ETS tables, Ecto stats, request metrics and logs, live.

The **Processes** tab lets you sort by memory, reductions or **message queue length**, which is the fastest way to find a stuck or overloaded GenServer.

To expose it in production:

```elixir
scope "/admin" do
  pipe_through [:browser, :require_authenticated_user, :require_admin]
  live_dashboard "/dashboard", metrics: MyAppWeb.Telemetry, ecto_repos: [MyApp.Repo]
end
```

## 3. Telemetry

> **In short:** Phoenix, Ecto, Oban and LiveView emit `:telemetry` events (e.g. `[:phoenix, :endpoint, :stop]` with a duration). You attach handlers or reporters to turn them into metrics, logs and traces.

```elixir
# lib/my_app_web/telemetry.ex (generated) defines metrics like:
summary("phoenix.router_dispatch.stop.duration", tags: [:route], unit: {:native, :millisecond}),
summary("my_app.repo.query.total_time", unit: {:native, :millisecond}),

# emitting your own event
:telemetry.execute([:my_app, :task, :created], %{count: 1}, %{user_id: user.id})

# attaching a handler
:telemetry.attach("log-slow-queries", [:my_app, :repo, :query], fn _event, measurements, metadata, _ ->
  ms = System.convert_time_unit(measurements.total_time, :native, :millisecond)
  if ms > 100, do: Logger.warning("Slow query #{ms}ms: #{metadata.query}")
end, nil)
```

Export to Prometheus (`telemetry_metrics_prometheus`), StatsD, or **OpenTelemetry** (`opentelemetry_phoenix`, `opentelemetry_ecto`) for distributed tracing. Hosted APMs: AppSignal, New Relic, Datadog, Honeybadger. Errors: Sentry, AppSignal, Honeybadger.

## 4. Logging

```elixir
require Logger
Logger.info("Task created", task_id: task.id, user_id: user.id)   # metadata
Logger.metadata(request_id: conn.assigns.request_id)
```

Use structured JSON logs in production (`logger_json`). Phoenix adds a `request_id` to every request's logs automatically.

## 5. Common performance problems and fixes

> **In short:** Most real problems are N+1 queries, missing indexes, a GenServer bottleneck, big LiveView assigns, or unbounded mailboxes. The BEAM is rarely the limit.

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Slow page, lots of SQL in logs | N+1 queries | `preload`, joins |
| One slow query | Missing index | `EXPLAIN ANALYZE`, add an index |
| `DBConnection.ConnectionError` / pool timeouts | Pool too small, or slow queries/transactions holding connections | Fix the queries first, then raise `pool_size` (and Postgres `max_connections`) |
| Rising memory, slow responses | A GenServer with a huge message queue | Find it in LiveDashboard; use `call` for back-pressure, shard, or move to ETS |
| High memory per LiveView user | Large assigns (whole lists, big structs) | Streams, `temporary_assigns`, store only ids |
| Calls time out at 5 s | A slow GenServer callback | Move work to a Task, or reply asynchronously |
| CPU-bound hot path | Pure Elixir number crunching | Rust NIF (Rustler), Nx, or move the work out of the request path |
| Atom table full | `String.to_atom` on input | `to_existing_atom`, string keys |

Benchmark functions with **Benchee**:

```elixir
Benchee.run(%{
  "Enum" => fn -> Enum.map(1..10_000, &(&1 * 2)) end,
  "for" => fn -> for x <- 1..10_000, do: x * 2 end
})
```

## 6. Caching

> **In short:** ETS/Cachex for local caches, `:persistent_term` for rarely changing config, HTTP caching headers, and Postgres materialised views for heavy aggregates. Redis is optional, because the BEAM already gives you in-memory state.

## 7. Production checklist

- [ ] `runtime.exs` reads every secret from env vars
- [ ] Health check endpoint (e.g. `/health` returning 200, checking the DB)
- [ ] Error tracking (Sentry/AppSignal) + structured logs
- [ ] Telemetry metrics exported, and LiveDashboard behind admin auth
- [ ] DB indexes for every foreign key and every frequent filter
- [ ] Pool size tuned; long-running work in Oban, not in requests
- [ ] Rate limiting on auth endpoints
- [ ] `force_ssl`, HSTS, and `check_origin` for WebSockets in prod config
- [ ] Clustering configured if running more than one node
- [ ] `mix sobelow` passes

## Interview questions

<details>
<summary>How would you debug a slow Phoenix app in production?</summary>

Start with metrics: telemetry/APM to find slow routes and queries, and LiveDashboard for memory, process message queue lengths and Ecto stats. Check for N+1 queries and missing indexes with `EXPLAIN ANALYZE`. Look for GenServer bottlenecks (a large mailbox or high reductions on a single process). Connect with a remote IEx session (`bin/my_app remote`) to inspect state with `:sys.get_state`, check `Process.info`, or trace calls with `:recon` or `:dbg`, all without restarting the system.

</details>

<details>
<summary>What is Telemetry in the Elixir ecosystem?</summary>

`:telemetry` is a small library for emitting events with measurements and metadata, such as `[:phoenix, :endpoint, :stop]` with a duration. Libraries like Phoenix, Ecto, Oban and LiveView emit standard events. Applications attach handlers, or use `Telemetry.Metrics` with reporters (Prometheus, StatsD, LiveDashboard, OpenTelemetry), to turn them into metrics, logs and traces, without coupling libraries to a specific monitoring vendor.

</details>
