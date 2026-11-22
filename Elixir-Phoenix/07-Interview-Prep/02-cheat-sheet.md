# Elixir + Phoenix cheat sheet

## Syntax

```elixir
# Types
42  3.14  :atom  "string"  'charlist'  true  nil
[1, 2, 3]            # list (linked)
{:ok, 1}             # tuple
%{a: 1, "b" => 2}    # map
[timeout: 5000]      # keyword list
1..10//2             # range with step
~w(a b c)  ~r/re/  ~D[2026-11-17]  ~p"/path"  ~H"<p>{@x}</p>"

# Operators
"a" <> "b"   [1] ++ [2]   [1, 2] -- [1]   div(7, 2)  rem(7, 2)  7 / 2  # 3.5
==  ===  !=  and  or  not  &&  ||  !     # only nil and false are falsy

# Pattern matching
{:ok, x} = {:ok, 1}
[h | t] = [1, 2, 3]
%{name: n} = %{name: "A", age: 1}
"Bearer " <> token = header
^existing = value

# Functions
def f(x), do: x
defp private(x), do: x
def g(x \\ 1), do: x                       # default arg
def h(x) when is_integer(x) and x > 0, do: x  # guard
fn x -> x * 2 end     &(&1 * 2)     &String.upcase/1
add.(1, 2)                                # call an anonymous fn

# Pipe
data |> transform() |> Enum.map(&f/1) |> Enum.sum()

# Control flow
case v do {:ok, x} -> x; {:error, _} -> nil end
cond do x > 1 -> :big; true -> :small end
if c, do: a, else: b
with {:ok, a} <- s1(), {:ok, b} <- s2(a) do {:ok, b} else err -> err end
for x <- list, x > 0, into: %{}, do: {x, x * x}

# Modules
defmodule My.Mod do
  @moduledoc "..."
  alias My.Other
  import Ecto.Query, only: [from: 2]
  require Logger
  use GenServer
  @const 10
  @doc "..."
  @spec f(integer()) :: integer()
  def f(x), do: x + @const
end

# Structs
defstruct [:email, name: "anon"]
%User{email: "x"}   %{user | name: "B"}   %User{} = u
```

## Enum / Map / String essentials

```elixir
Enum.map/filter/reject/reduce/find/any?/all?/count/sum/sort_by/group_by/
     frequencies/uniq/take/chunk_every/with_index/zip/flat_map/join/into
Stream.map/filter/take/iterate/cycle + File.stream!
Map.get/put/update/delete/merge/take/drop/keys/values/has_key?/new
get_in/put_in/update_in
String.split/trim/upcase/downcase/replace/contains?/length/to_integer/graphemes
Integer.parse/to_string   Keyword.get/merge   List.first/last/flatten/wrap
```

## OTP

```elixir
pid = spawn(fn -> ... end);  send(pid, msg);  receive do m -> m after 1000 -> :timeout end
spawn_link / Process.monitor / Process.flag(:trap_exit, true) / Process.exit(pid, :kill)

# GenServer
use GenServer
GenServer.start_link(__MODULE__, arg, name: __MODULE__)
GenServer.call(name, msg)   GenServer.cast(name, msg)
init/1 → {:ok, state} | {:ok, state, {:continue, x}}
handle_call/3 → {:reply, reply, state}
handle_cast/2, handle_info/2, handle_continue/2 → {:noreply, state}
Process.send_after(self(), :tick, 1000)

# Supervisor
Supervisor.start_link(children, strategy: :one_for_one)   # | :one_for_all | :rest_for_one
DynamicSupervisor.start_child(Sup, {Mod, arg})
{:via, Registry, {MyReg, key}}
restart: :permanent | :transient | :temporary

# Tasks / ETS
Task.async(fn -> end) |> Task.await()   Task.await_many/2   Task.async_stream(list, f, max_concurrency: 10)
Task.Supervisor.start_child/async_nolink
:ets.new(:t, [:set, :public, :named_table, read_concurrency: true])
:ets.insert/lookup/delete/update_counter
```

## Phoenix

```bash
mix phx.new app  |  mix setup  |  iex -S mix phx.server  |  mix phx.routes
mix phx.gen.html|live|json|context Ctx Schema table field:type
mix phx.gen.auth Accounts User users  |  mix phx.gen.presence  |  mix phx.gen.release --docker
mix ecto.gen.migration name | ecto.migrate | ecto.rollback | ecto.reset
mix test [file:line] [--failed]  |  mix format  |  mix precommit
```

```elixir
# Router
pipeline :api do plug :accepts, ["json"] end
scope "/api", AppWeb do pipe_through :api; resources "/tasks", TaskController, except: [:new, :edit] end
live "/tasks", TaskLive.Index, :index
live_session :auth, on_mount: [{AppWeb.UserAuth, :require_authenticated}] do ... end

# Controller
action_fallback AppWeb.FallbackController
def create(conn, %{"task" => p}) do
  with {:ok, t} <- Tasks.create_task(scope, p) do
    conn |> put_status(:created) |> render(:show, task: t)
  end
end
render/3  json/2  redirect(to: ~p"/x")  put_flash/3  send_resp(conn, 204, "")  put_status/2

# Plug
def init(o), do: o
def call(conn, _o), do: conn |> assign(:x, 1)     # or ... |> halt()
```

## Ecto

```elixir
schema "tasks" do
  field :title, :string
  field :status, Ecto.Enum, values: [:todo, :done]
  belongs_to :user, User
  has_many :comments, Comment
  timestamps(type: :utc_datetime)
end

task |> cast(attrs, [:title]) |> validate_required([:title]) |> validate_length(:title, min: 3)
     |> unique_constraint(:title) |> foreign_key_constraint(:user_id)

from t in Task, where: t.user_id == ^id and not t.done, order_by: [desc: t.inserted_at], preload: [:user]
Task |> where([t], t.done) |> limit(10) |> Repo.all()
Repo.all/get/get!/get_by/one/insert/update/delete/insert_all/update_all/preload/aggregate/exists?
Repo.transact(fn -> ... end)   Ecto.Multi.new() |> Multi.insert(:a, cs) |> Repo.transaction()
```

## LiveView

```elixir
def mount(params, session, socket)      # ×2 — guard with connected?(socket)
def handle_params(params, uri, socket)  # URL changes
def handle_event("evt", params, socket) # phx-click/submit/change
def handle_info(msg, socket)            # PubSub, timers
→ {:ok, socket} / {:noreply, socket}

assign(socket, k: v)  update(socket, :k, &f/1)  assign_async(socket, :k, fn -> {:ok, %{k: v}} end)
stream(socket, :items, list)  stream_insert(socket, :items, item, at: 0)  stream_delete(socket, :items, item)
push_patch(socket, to: ~p"/x")  push_navigate(socket, to: ~p"/y")  put_flash(socket, :info, "ok")
push_event(socket, "name", payload)
to_form(changeset)  Map.put(changeset, :action, :validate)
allow_upload(socket, :file, accept: ~w(.png), max_entries: 1)  consume_uploaded_entries/3
```

```heex
<div :if={@show} class={["a", @active && "b"]}>{@text}</div>
<li :for={{id, item} <- @streams.items} id={id}>{item.name}</li>
<button phx-click="del" phx-value-id={@id} phx-disable-with="…">x</button>
<.form for={@form} phx-change="validate" phx-submit="save"><.input field={@form[:title]} /></.form>
<.link patch={~p"/?f=done"}>  <.link navigate={~p"/other"}>
<button phx-click={JS.toggle(to: "#menu")}>   <div id="c" phx-hook="Chart" phx-update="ignore">
```

## Dates, money, JSON, files

```elixir
Date.utc_today()  DateTime.utc_now()  Date.add(d, 7)  Date.diff(a, b)  Date.shift(d, month: 1)
Date.compare(a, b)  Date.after?(a, b)  Enum.sort(dates, Date)       # never a < b on dates
DateTime.shift_zone!(dt, "Asia/Kolkata")   # needs the :tz/:tzdata time zone database
Calendar.strftime(dt, "%d %b %Y")
Decimal.new("19.99") |> Decimal.mult(3) |> Decimal.round(2)
JSON.encode!(map)  JSON.decode!(str)   # Elixir 1.18+ (or Jason.*)
File.read/write/stream!  Path.join  System.fetch_env!("X")  System.cmd("git", ["status"])
Application.fetch_env!(:app, :key)    # inside functions = runtime
```

## Macros

```elixir
quote do: 1 + 2          # AST: {:+, meta, [1, 2]}
quote do: x + unquote(y) # inject a value
defmacro m(expr), do: quote(do: unquote(expr) * 2)
defmacro __using__(opts), do: quote(do: import Helpers)   # what `use` calls
```

## Ecto advanced

```elixir
many_to_many :tags, Tag, join_through: "tasks_tags", on_replace: :delete
embeds_many :items, Item, on_replace: :delete   # + cast_embed(:items)
put_assoc(cs, :tags, tags)   cast_assoc(cs, :comments)
Repo.insert(cs, on_conflict: {:replace, [:title]}, conflict_target: [:user_id, :title])
where(q, ^dynamic([t], t.done == ^done))
from a in Account, where: a.id == ^id, lock: "FOR UPDATE"
optimistic_lock(cs, :lock_version)
@primary_key {:id, :binary_id, autogenerate: true}
```

## Web plumbing

```elixir
put_session(conn, :k, v)  get_session(conn, :k)  configure_session(conn, renew: true)
put_resp_cookie(conn, "theme", "dark", sign: true)  fetch_cookies(conn, signed: ["theme"])
Phoenix.Token.sign(Endpoint, "salt", data)  Phoenix.Token.verify(Endpoint, "salt", tok, max_age: 86400)
new() |> to(email) |> from(addr) |> subject(s) |> text_body(b) |> Mailer.deliver()
Req.get!(url, params: [q: 1], auth: {:bearer, t}, receive_timeout: 5_000).body
Plug.Crypto.secure_compare(a, b)   :crypto.mac(:hmac, :sha256, secret, body)
```

## LiveView advanced

```elixir
live_session :auth, on_mount: [{UserAuth, :require_authenticated}] do ... end
def on_mount(:default, params, session, socket), do: {:cont, socket}   # or {:halt, redirect(...)}
attach_hook(socket, :name, :handle_params, fn params, url, socket -> {:cont, socket} end)
assign_async(socket, [:a, :b], fn -> {:ok, %{a: 1, b: 2}} end)
start_async(socket, :job, fn -> work() end)  →  handle_async(:job, {:ok, result} | {:exit, reason}, socket)
live_render(@socket, ChildLive, id: "x", session: %{}, sticky: true)
```

## The 10 sentences to have ready

1. The BEAM runs millions of isolated, preemptively scheduled lightweight processes that communicate by message passing.
2. "Let it crash": handle expected errors with tuples, and let supervisors restart unexpected failures.
3. A GenServer is a stateful process that handles one message at a time. Use `call` by default for back-pressure.
4. Supervision strategies are one_for_one, one_for_all and rest_for_one. Restart intensity escalates failures.
5. Contexts separate the domain from the web. Controllers and LiveViews stay thin.
6. Changesets cast, validate and map DB constraints. Ecto has no lazy loading, so preload explicitly.
7. LiveView renders over HTTP first, then a WebSocket process, and sends minimal diffs. Mount runs twice.
8. Streams keep LiveView memory flat. PubSub + `handle_info` give real-time updates across users and nodes.
9. Oban gives persistent, retryable, transactional jobs in Postgres.
10. Releases + `runtime.exs` + clustering (DNSCluster) are how you deploy Phoenix.
