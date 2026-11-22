# 02 · Request lifecycle: endpoint, router, plugs, controllers

> **Plain English:** This lesson follows a request through Phoenix like a guest through a restaurant: the door (**Endpoint**), the host who checks the reservation (**Router**), the checks along the way (**Plugs**: is the guest logged in?), the waiter (**Controller**), and finally the dish is plated (**View/template**) and served. The request is carried in a struct called `conn` that every step receives and passes on.

## 1. The big picture

> **In short:** Each request gets its own process. A `%Plug.Conn{}` struct flows through a pipeline of plugs (endpoint → router → pipeline → controller), and each plug takes a conn and returns a conn.

```
HTTP request
  │  (Bandit web server spawns a process for this request)
  ▼
Endpoint  (lib/my_app_web/endpoint.ex)
  plug Plug.Static, Plug.RequestId, Plug.Telemetry, Plug.Parsers, Plug.Session ...
  ▼
Router    (lib/my_app_web/router.ex)
  matches path + verb → pipeline(s) → controller action
  pipeline :browser  → fetch_session, protect_from_forgery, put_secure_browser_headers, fetch_current_scope_for_user ...
  pipeline :api      → accepts ["json"]
  ▼
Controller action  def index(conn, params)
  calls a context → renders through a view (HTML template / JSON function)
  ▼
Response sent; the request process ends
```

## 2. `%Plug.Conn{}`: the request and response in one struct

> **In short:** The conn holds everything about the request (path, headers, params) and the response being built (status, body, headers), plus your own `assigns`.

Fields worth knowing:

```elixir
conn.method          # "GET"
conn.request_path    # "/tasks/5"
conn.path_params     # %{"id" => "5"}
conn.query_params
conn.params          # merged path + query + body params (STRING keys)
conn.req_headers     # [{"accept", "application/json"}, ...]
conn.assigns         # %{current_scope: ...}: data shared between plugs/controller/templates
conn.status          # set later
conn.resp_body
conn.halted          # true means stop processing further plugs
```

Since data is immutable, each plug returns an **updated** conn. That's why controllers are pipe chains.

## 3. Plugs: middleware

> **In short:** A plug is either a **function** `(conn, opts) -> conn` or a **module** with `init/1` and `call/2`. To stop the pipeline, call `halt/1`.

Function plug (inside a controller or router):

```elixir
defmodule MyAppWeb.TaskController do
  use MyAppWeb, :controller

  plug :require_owner when action in [:edit, :update, :delete]

  defp require_owner(conn, _opts) do
    task = MyApp.Tasks.get_task!(conn.params["id"])
    if task.user_id == conn.assigns.current_scope.user.id do
      assign(conn, :task, task)
    else
      conn |> put_flash(:error, "Not allowed") |> redirect(to: ~p"/tasks") |> halt()
    end
  end
end
```

Module plug:

```elixir
defmodule MyAppWeb.Plugs.RequireApiKey do
  import Plug.Conn

  def init(opts), do: opts                         # runs at COMPILE time; precompute options here

  def call(conn, _opts) do                         # runs on every request
    case get_req_header(conn, "x-api-key") do
      [key] when key != "" ->
        if valid_key?(key), do: assign(conn, :api_client, key), else: unauthorized(conn)
      _ ->
        unauthorized(conn)
    end
  end

  defp unauthorized(conn) do
    conn
    |> put_status(:unauthorized)
    |> Phoenix.Controller.json(%{error: "invalid api key"})
    |> halt()                                       # IMPORTANT: otherwise the next plugs still run
  end

  defp valid_key?(key), do: Plug.Crypto.secure_compare(key, System.fetch_env!("API_KEY"))
end
```

Express comparison: `(req, res, next) => {...}`. Here there's no `next()`. You return the conn to continue, or `halt()` it to stop.

## 4. The router

> **In short:** The router has pipelines (groups of plugs) and scopes (path prefixes that run pipelines), and maps verb + path to `Controller, :action`.

```elixir
defmodule MyAppWeb.Router do
  use MyAppWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {MyAppWeb.Layouts, :root}
    plug :protect_from_forgery          # CSRF
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/", MyAppWeb do
    pipe_through :browser

    get "/", PageController, :home
    resources "/tasks", TaskController       # generates the 7 REST routes
    live "/board", BoardLive                 # LiveView route
  end

  scope "/api", MyAppWeb.Api, as: :api do
    pipe_through :api
    resources "/tasks", TaskController, except: [:new, :edit]
    resources "/projects", ProjectController, only: [:index, :show] do
      resources "/tasks", TaskController, only: [:index]   # nested: /api/projects/:project_id/tasks
    end
  end
end
```

`resources "/tasks", TaskController` creates:

| Verb | Path | Action |
| --- | --- | --- |
| GET | /tasks | :index |
| GET | /tasks/new | :new |
| POST | /tasks | :create |
| GET | /tasks/:id | :show |
| GET | /tasks/:id/edit | :edit |
| PATCH/PUT | /tasks/:id | :update |
| DELETE | /tasks/:id | :delete |

### Verified routes: `~p`

> **In short:** `~p"/tasks/#{task}"` builds a path, and the compiler **warns if no route matches**. You get no broken links.

```elixir
~p"/tasks"
~p"/tasks/#{task}"            # uses task.id (via the Phoenix.Param protocol)
~p"/tasks?#{[page: 2]}"       # query string
url(~p"/tasks")               # full URL with host
```

## 5. Controllers

> **In short:** A controller action is a function `(conn, params) -> conn`. It calls the context, then renders, redirects or sends JSON.

```elixir
defmodule MyAppWeb.TaskController do
  use MyAppWeb, :controller
  alias MyApp.Tasks
  alias MyApp.Tasks.Task

  def index(conn, _params) do
    tasks = Tasks.list_tasks()
    render(conn, :index, tasks: tasks)          # → TaskHTML.index/1 (index.html.heex)
  end

  def show(conn, %{"id" => id}) do              # pattern-match params directly!
    task = Tasks.get_task!(id)                  # raises Ecto.NoResultsError → 404 page
    render(conn, :show, task: task)
  end

  def new(conn, _params) do
    changeset = Tasks.change_task(%Task{})
    render(conn, :new, form: to_form(changeset))
  end

  def create(conn, %{"task" => task_params}) do
    case Tasks.create_task(task_params) do
      {:ok, task} ->
        conn
        |> put_flash(:info, "Task created.")
        |> redirect(to: ~p"/tasks/#{task}")

      {:error, %Ecto.Changeset{} = changeset} ->
        render(conn, :new, form: to_form(changeset))   # re-render with errors
    end
  end

  def delete(conn, %{"id" => id}) do
    task = Tasks.get_task!(id)
    {:ok, _} = Tasks.delete_task(task)
    conn |> put_flash(:info, "Deleted.") |> redirect(to: ~p"/tasks")
  end
end
```

Response helpers: `render/3`, `redirect(to: path)` (or `external: url`), `json/2`, `text/2`, `html/2`, `send_resp(conn, 204, "")`, `put_status/2`, `put_flash/3`, `send_download/3`.

## 6. Views and HEEx templates

> **In short:** For a controller named `TaskController`, `TaskHTML` renders HTML (templates live in `task_html/*.html.heex`) and `TaskJSON` renders JSON. **HEEx** is HTML with `{...}` for Elixir expressions, and the compiler checks it.

```elixir
defmodule MyAppWeb.TaskHTML do
  use MyAppWeb, :html
  embed_templates "task_html/*"        # each file becomes a function: index/1, show/1 ...
end
```

```heex
<%!-- task_html/index.html.heex --%>
<Layouts.app flash={@flash}>
  <.header>
    Tasks
    <:actions>
      <.button navigate={~p"/tasks/new"}>New task</.button>
    </:actions>
  </.header>

  <ul>
    <li :for={task <- @tasks} class={["p-2", task.done && "line-through"]}>
      <.link navigate={~p"/tasks/#{task}"}>{task.title}</.link>
      <span :if={task.due_on}>due {task.due_on}</span>
    </li>
  </ul>

  <p :if={@tasks == []}>No tasks yet.</p>
</Layouts.app>
```

HEEx essentials:
- `{@name}`: output an assign (HTML-escaped automatically, which protects against XSS). `@name` is short for `assigns.name`.
- `{expr}` inside attributes: `class={...}`. A list for class combines values, and `false`/`nil` entries are dropped.
- `:if={cond}` and `:for={x <- list}` are special attributes on any tag.
- `<.button>` calls a **function component** (from `core_components.ex`). `<:actions>` is a **slot**.
- `<%= ... %>` / `<% ... %>` still work for blocks, but `{}` + `:if`/`:for` is the modern style.
- `<%!-- comment --%>`.

## 7. Error pages

> **In short:** Exceptions with a `plug_status` (like `Ecto.NoResultsError` → 404) render `ErrorHTML`/`ErrorJSON`. In dev you see a detailed debug page instead.

```elixir
defmodule MyAppWeb.ErrorJSON do
  def render(template, _assigns) do
    %{errors: %{detail: Phoenix.Controller.status_message_from_template(template)}}
  end
end
```

## Exercises

1. Add a module plug that logs request time (`System.monotonic_time` before, and `register_before_send/2` to log after).
2. Add an `/api/health` route returning `{"status":"ok"}` through a `HealthController`.
3. Pattern-match a query param in an action: `def index(conn, %{"q" => q})` plus a fallback clause.
4. Write an `ApiKey` plug and put it in an `:api_auth` pipeline.

## Interview questions

<details>
<summary>Walk through what happens when a request hits a Phoenix app.</summary>

The web server (Bandit, or Cowboy in older apps) accepts the connection and runs the request in its own process. A `%Plug.Conn{}` is created and passed through the **Endpoint's** plugs (static files, request id, telemetry, body parsing, session), then to the **Router**, which matches verb and path, runs the scope's **pipelines** (such as `:browser` with session, CSRF, secure headers), and dispatches to the **controller action**. The action calls a context for data and renders through a view module (HEEx template or JSON function). The response is sent, and the process exits.

</details>

<details>
<summary>What is a plug?</summary>

The composable building block of Phoenix's HTTP handling. It's either a function `(conn, opts) -> conn` or a module with `init/1` (run at compile time, to prepare options) and `call/2` (run per request). Each plug transforms the conn. Calling `halt/1` stops later plugs from running. The Endpoint, Router pipelines and controllers are all plug pipelines.

</details>

<details>
<summary>Why are Phoenix params maps with string keys?</summary>

They come from external input. Converting them to atoms would risk exhausting the atom table, since atoms aren't garbage-collected. Ecto changesets (`cast/3`) whitelist and convert only the allowed fields, safely.

</details>

<details>
<summary>What are verified routes?</summary>

The `~p` sigil builds paths that are checked at compile time against the router. If you link to a route that doesn't exist, you get a compiler warning. They replaced the older `Routes.task_path(conn, :show, task)` helpers in Phoenix 1.7.

</details>
