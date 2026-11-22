# 10 · Calling other APIs, receiving webhooks, and GraphQL

> **Plain English:** real apps talk to other services. They call APIs (payments, maps, AI), receive webhooks (Stripe telling you "payment succeeded"), and sometimes offer GraphQL instead of REST. This lesson shows how to do each one safely in Elixir.

## 1. HTTP clients: Req (recommended)

> **In short:** **Req** is the modern, batteries-included HTTP client. It decodes JSON automatically and handles retries, redirects, compression and auth. It's built on Finch (connection pooling) and Mint (low-level HTTP).

```elixir
# mix.exs: {:req, "~> 0.5"}

Req.get!("https://api.github.com/repos/phoenixframework/phoenix").body["stargazers_count"]

{:ok, resp} = Req.post("https://httpbin.org/post", json: %{title: "Hi"})
resp.status        # 200
resp.body          # already decoded from JSON into a map
resp.headers

Req.get!("https://api.example.com/search", params: [q: "elixir", page: 2])
Req.get!(url, auth: {:bearer, token}, receive_timeout: 10_000)
Req.get!(url, retry: :transient, max_retries: 3)   # retries on timeouts and 408/429/5xx
```

### Build a reusable client module

```elixir
defmodule MyApp.Weather.Client do
  @moduledoc "Talks to the weather API."

  defp new do
    Req.new(
      base_url: "https://api.weather.example.com/v1",
      auth: {:bearer, Application.fetch_env!(:my_app, :weather_api_key)},
      receive_timeout: 5_000,
      retry: :transient
    )
    |> Req.Request.put_header("accept", "application/json")
  end

  def current(city) do
    case Req.get(new(), url: "/current", params: [city: city]) do
      {:ok, %Req.Response{status: 200, body: body}} -> {:ok, %{temp: body["temp_c"], summary: body["text"]}}
      {:ok, %Req.Response{status: 404}} -> {:error, :not_found}
      {:ok, %Req.Response{status: status}} -> {:error, {:http_error, status}}
      {:error, exception} -> {:error, exception}
    end
  end
end
```

Good habits:
- Always set **timeouts**. A hanging HTTP call ties up a process.
- **Translate** responses into your own `{:ok, data}` / `{:error, reason}` shapes, so the rest of the app doesn't know about HTTP.
- Put the client behind a **behaviour** so you can mock it in tests (see [05/01](../05-Testing-and-Production/01-exunit-and-testing-phoenix.md)).
- Call slow APIs from **Oban jobs** or `Task.Supervisor.async_nolink`, not directly in a request or LiveView event, if they might be slow or flaky.

### Testing Req without real network calls

```elixir
# config/test.exs
config :my_app, weather_req_options: [plug: {Req.Test, MyApp.Weather.Client}]

# in the client: Req.new(...) |> Req.merge(Application.get_env(:my_app, :weather_req_options, []))

# in a test
Req.Test.stub(MyApp.Weather.Client, fn conn ->
  Req.Test.json(conn, %{"temp_c" => 31, "text" => "Sunny"})
end)

assert {:ok, %{temp: 31}} = MyApp.Weather.Client.current("Kochi")
```

### Other clients you'll see

| Library | Notes |
| --- | --- |
| **Req** | Modern default, high-level |
| **Finch** | Connection-pooling HTTP client (Req uses it, and so does Swoosh) |
| **Tesla** | Middleware-based, common in older codebases |
| **HTTPoison** | Older and popular, built on hackney |
| **Mint** | Low-level, process-less HTTP/1 and HTTP/2 |

## 2. Circuit breakers and resilience (briefly)

> **In short:** If an external service is down, stop hammering it for a while ("open the circuit"), and fail fast with a fallback.

- `:fuse` (Erlang library): `:fuse.ask(:weather_api, :sync)` returns `:ok` or `:blown`, and you "melt" the fuse on errors.
- Cache the last good response in ETS and serve it while the service is down.
- Use timeouts plus retries with backoff (Req's `retry`), and Oban for anything that must eventually succeed.

## 3. Receiving webhooks

> **In short:** A webhook is another service calling **your** endpoint when something happens. Verify its signature using the **raw request body**, respond `200` quickly, and process the event in a background job. Make processing idempotent, because webhooks can arrive more than once.

### Step 1: keep the raw body

Signature checks need the exact bytes that were sent, but `Plug.Parsers` consumes the body to build `params`. Tell it to save a copy:

```elixir
# lib/my_app_web/cache_body_reader.ex
defmodule MyAppWeb.CacheBodyReader do
  def read_body(conn, opts) do
    {:ok, body, conn} = Plug.Conn.read_body(conn, opts)
    conn = Plug.Conn.update_private(conn, :raw_body, fn existing -> (existing || "") <> body end)
    {:ok, body, conn}
  end
end

# endpoint.ex
plug Plug.Parsers,
  parsers: [:urlencoded, :multipart, :json],
  pass: ["*/*"],
  body_reader: {MyAppWeb.CacheBodyReader, :read_body, []},
  json_decoder: Phoenix.json_library()
```

(To save memory, apply this only for webhook paths.)

### Step 2: verify the signature in a plug

```elixir
defmodule MyAppWeb.Plugs.VerifyWebhook do
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    secret = Application.fetch_env!(:my_app, :webhook_secret)
    raw = conn.private[:raw_body] || ""
    expected = :crypto.mac(:hmac, :sha256, secret, raw) |> Base.encode16(case: :lower)

    with [signature] <- get_req_header(conn, "x-signature"),
         true <- Plug.Crypto.secure_compare(expected, signature) do
      conn
    else
      _ -> conn |> send_resp(401, "invalid signature") |> halt()
    end
  end
end
```

`Plug.Crypto.secure_compare/2` runs in **constant time**, so attackers can't guess the signature byte by byte from response timing. Real providers (Stripe, GitHub) also include a **timestamp** in the signature to prevent replay attacks. Their SDKs (e.g. `stripity_stripe`) verify it for you.

### Step 3: accept fast, process later, idempotently

```elixir
# router.ex
pipeline :webhook do
  plug :accepts, ["json"]
  plug MyAppWeb.Plugs.VerifyWebhook
end

scope "/webhooks", MyAppWeb do
  pipe_through :webhook
  post "/payments", WebhookController, :payments
end

# controller
def payments(conn, %{"id" => event_id} = event) do
  %{event_id: event_id, payload: event}
  |> MyApp.Workers.ProcessPaymentEvent.new(unique: [keys: [:event_id], period: :infinity])
  |> Oban.insert()

  send_resp(conn, 200, "ok")
end
```

Also store processed event ids (a unique index on `event_id`) so duplicate deliveries are ignored.

## 4. Sending webhooks to others

> **In short:** Deliver them from an Oban job with retries and backoff, sign each payload with HMAC, and record delivery attempts.

```elixir
defmodule MyApp.Workers.DeliverWebhook do
  use Oban.Worker, queue: :webhooks, max_attempts: 10

  @impl true
  def perform(%{args: %{"url" => url, "payload" => payload, "secret" => secret}}) do
    body = JSON.encode!(payload)
    sig = :crypto.mac(:hmac, :sha256, secret, body) |> Base.encode16(case: :lower)

    case Req.post(url, body: body, headers: [{"content-type", "application/json"}, {"x-signature", sig}], receive_timeout: 10_000, retry: false) do
      {:ok, %{status: status}} when status in 200..299 -> :ok
      {:ok, %{status: status}} -> {:error, {:bad_status, status}}     # Oban retries with backoff
      {:error, reason} -> {:error, reason}
    end
  end
end
```

## 5. GraphQL with Absinthe

> **In short:** **Absinthe** is the GraphQL toolkit for Elixir. You define a schema of types, queries and mutations, with resolvers that call your contexts. Dataloader fixes N+1 queries, and subscriptions run over Phoenix Channels.

```elixir
# mix.exs: {:absinthe, "~> 1.7"}, {:absinthe_plug, "~> 1.5"}, {:dataloader, "~> 2.0"}

defmodule MyAppWeb.Schema do
  use Absinthe.Schema
  import Absinthe.Resolution.Helpers, only: [dataloader: 1]

  object :task do
    field :id, non_null(:id)
    field :title, non_null(:string)
    field :done, non_null(:boolean)
    field :project, :project, resolve: dataloader(MyApp.Tasks)   # batched: no N+1
  end

  object :project do
    field :id, non_null(:id)
    field :name, :string
  end

  query do
    field :tasks, list_of(:task) do
      arg :done, :boolean
      resolve &MyAppWeb.Resolvers.Tasks.list/3
    end
  end

  mutation do
    field :create_task, :task do
      arg :title, non_null(:string)
      resolve &MyAppWeb.Resolvers.Tasks.create/3
    end
  end

  def context(ctx) do
    loader = Dataloader.new() |> Dataloader.add_source(MyApp.Tasks, Dataloader.Ecto.new(MyApp.Repo))
    Map.put(ctx, :loader, loader)
  end

  def plugins, do: [Absinthe.Middleware.Dataloader | Absinthe.Plugin.defaults()]
end

defmodule MyAppWeb.Resolvers.Tasks do
  def list(_parent, args, %{context: %{current_scope: scope}}),
    do: {:ok, MyApp.Tasks.list_tasks(scope, args)}

  def list(_, _, _), do: {:error, "unauthenticated"}   # clauses of the same function must stay together

  def create(_parent, args, %{context: %{current_scope: scope}}) do
    case MyApp.Tasks.create_task(scope, args) do
      {:ok, task} -> {:ok, task}
      {:error, changeset} -> {:error, format_errors(changeset)}
    end
  end

  defp format_errors(cs), do: Ecto.Changeset.traverse_errors(cs, fn {msg, _} -> msg end) |> inspect()
end
```

```elixir
# router.ex
scope "/api" do
  pipe_through [:api, :api_auth]          # the auth plug puts current_scope into the Absinthe context
  forward "/graphql", Absinthe.Plug, schema: MyAppWeb.Schema
  if Mix.env() == :dev, do: forward("/graphiql", Absinthe.Plug.GraphiQL, schema: MyAppWeb.Schema)
end
```

Put the scope into the Absinthe context with a plug: `Absinthe.Plug.put_options(conn, context: %{current_scope: scope})`.

Notice that resolvers call the **same contexts** as your controllers and LiveViews. That's the payoff of the context design.

### REST vs GraphQL in Phoenix

| | REST (controllers + JSON views) | GraphQL (Absinthe) |
| --- | --- | --- |
| Simplicity | Simpler, cache-friendly | More setup |
| Clients choose fields | No | Yes |
| N+1 risk | Controlled per endpoint | Needs Dataloader |
| Real-time | Channels or LiveView | Subscriptions over Channels |
| Best for | Public APIs, simple mobile apps | Complex front ends with many views of the same data |

## 6. gRPC, Server-Sent Events, and others (names to know)

- **SSE:** stream events with `send_chunked/2` + `chunk/2` (`text/event-stream`). It's a simple alternative to WebSockets for one-way updates.
- **gRPC:** the `grpc` Hex package.
- **Message queues:** Broadway producers for SQS, Kafka (`broadway_kafka`) and RabbitMQ ([02-OTP/05](../02-OTP-Concurrency/05-advanced-otp-gen-statem-broadway.md)).

## Exercises

1. Write a `GitHub.Client` with `Req.new(base_url: ...)` that fetches a repo's stars and returns `{:ok, stars}` or `{:error, reason}`. Test it with `Req.Test.stub`.
2. Add a webhook endpoint that verifies an HMAC signature from the raw body. Test it with a correct and an incorrect signature.
3. Make webhook processing idempotent with a unique index on `event_id`.
4. Add an Absinthe schema with `tasks` and `createTask`, protected by your API token plug. Use Dataloader for `project`.

## Interview questions

<details>
<summary>How do you call an external API safely from a Phoenix app?</summary>

Wrap it in a client module (Req with base URL, auth, timeouts and transient retries) that translates responses into `{:ok, _}`/`{:error, _}`, behind a behaviour so it can be mocked. Avoid blocking requests or LiveViews on slow calls: use `Task.Supervisor.async_nolink` or Oban jobs. Add caching and possibly a circuit breaker for unreliable services, and monitor it with telemetry.

</details>

<details>
<summary>How do you implement a secure webhook receiver?</summary>

Keep the raw body via a custom `body_reader` in `Plug.Parsers`, verify the provider's HMAC signature (and timestamp, against replay) with a constant-time comparison, return 2xx quickly, enqueue the processing as an Oban job, and make it idempotent by recording processed event ids with a unique index.

</details>

<details>
<summary>How does Absinthe avoid N+1 queries?</summary>

With Dataloader: instead of each resolver querying the DB individually, field resolvers register what they need, and Dataloader batches all requests for the same source into one query per association per level of the query, then distributes the results.

</details>
