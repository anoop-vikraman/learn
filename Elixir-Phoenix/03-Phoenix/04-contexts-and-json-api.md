# 04 · Contexts and JSON APIs

## 1. Contexts: the boundary of your domain

> **In short:** A context is a plain module (e.g. `MyApp.Tasks`) that exposes the **public API** for one area of the business. Controllers and LiveViews call context functions and never call `Repo` directly.

```
lib/my_app/
├── accounts.ex            # MyApp.Accounts: register_user, get_user!, ...
├── accounts/user.ex       # schema
├── tasks.ex               # MyApp.Tasks: list_tasks, create_task, complete_task, ...
├── tasks/task.ex
└── tasks/comment.ex
```

```elixir
defmodule MyApp.Tasks do
  @moduledoc "Task management."
  import Ecto.Query
  alias MyApp.Repo
  alias MyApp.Tasks.Task

  def list_tasks(user_id) do
    Task |> where(user_id: ^user_id) |> order_by(desc: :inserted_at) |> Repo.all()
  end

  def get_task!(user_id, id), do: Repo.get_by!(Task, id: id, user_id: user_id)

  def create_task(user_id, attrs) do
    %Task{user_id: user_id}
    |> Task.changeset(attrs)
    |> Repo.insert()
  end

  def update_task(%Task{} = task, attrs), do: task |> Task.changeset(attrs) |> Repo.update()
  def delete_task(%Task{} = task), do: Repo.delete(task)
  def change_task(%Task{} = task, attrs \\ %{}), do: Task.changeset(task, attrs)

  # Domain-specific operations, not only CRUD
  def complete_task(%Task{} = task), do: update_task(task, %{done: true})
end
```

**Why?**
- The web layer stays thin. Business rules live in one place.
- It's easy to test without HTTP (`MyApp.TasksTest` calls functions directly).
- It forces you to think about boundaries: "should Accounts know about Tasks?"
- Other contexts call through the public API, not each other's schemas or Repo queries.

**Design tips interviewers like:**
- Name contexts after business capabilities (`Billing`, `Catalog`, `Accounts`), not tables.
- Functions should speak the domain: `publish_post/1`, `cancel_subscription/1`, not just `update_x`.
- Cross-context references: store `user_id` on a task, but don't let `Tasks` reach into `Accounts.User` internals.
- Phoenix 1.8 generators pass a **scope** (`%Scope{user: user}`) as the first argument (`list_tasks(scope)`), so every query is automatically limited to the current user. More on this in lesson 05.

## 2. Generating a JSON API

> **In short:** `mix phx.gen.json` creates a context, schema, migration, controller, JSON view, `FallbackController` and tests.

```bash
mix phx.new task_api --no-html --no-assets     # API-only app (or add an API to an existing app)
mix phx.gen.json Tasks Task tasks title:string done:boolean due_on:date
```

Add to the router:

```elixir
scope "/api", TaskApiWeb do
  pipe_through :api
  resources "/tasks", TaskController, except: [:new, :edit]
end
```

## 3. The generated controller with `action_fallback`

> **In short:** Actions use `with` for the happy path, and anything that falls through (like `{:error, changeset}`) goes to a **FallbackController** that turns it into a proper HTTP error.

```elixir
defmodule TaskApiWeb.TaskController do
  use TaskApiWeb, :controller
  alias TaskApi.Tasks
  alias TaskApi.Tasks.Task

  action_fallback TaskApiWeb.FallbackController

  def index(conn, _params) do
    render(conn, :index, tasks: Tasks.list_tasks())
  end

  def create(conn, %{"task" => task_params}) do
    with {:ok, %Task{} = task} <- Tasks.create_task(task_params) do
      conn
      |> put_status(:created)
      |> put_resp_header("location", ~p"/api/tasks/#{task}")
      |> render(:show, task: task)
    end
  end

  def show(conn, %{"id" => id}) do
    render(conn, :show, task: Tasks.get_task!(id))
  end

  def update(conn, %{"id" => id, "task" => task_params}) do
    task = Tasks.get_task!(id)
    with {:ok, %Task{} = task} <- Tasks.update_task(task, task_params) do
      render(conn, :show, task: task)
    end
  end

  def delete(conn, %{"id" => id}) do
    task = Tasks.get_task!(id)
    with {:ok, %Task{}} <- Tasks.delete_task(task) do
      send_resp(conn, :no_content, "")
    end
  end
end
```

```elixir
defmodule TaskApiWeb.FallbackController do
  use TaskApiWeb, :controller

  def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
    conn
    |> put_status(:unprocessable_entity)
    |> put_view(json: TaskApiWeb.ChangesetJSON)
    |> render(:error, changeset: changeset)
  end

  def call(conn, {:error, :not_found}) do
    conn
    |> put_status(:not_found)
    |> put_view(html: TaskApiWeb.ErrorHTML, json: TaskApiWeb.ErrorJSON)
    |> render(:"404")
  end

  # add your own: {:error, :unauthorized}, {:error, :forbidden} ...
end
```

## 4. JSON views

> **In short:** `TaskJSON` is a plain module whose functions return maps. You control exactly which fields go out, so nothing leaks by accident.

```elixir
defmodule TaskApiWeb.TaskJSON do
  alias TaskApi.Tasks.Task

  def index(%{tasks: tasks}), do: %{data: for(task <- tasks, do: data(task))}
  def show(%{task: task}), do: %{data: data(task)}

  defp data(%Task{} = task) do
    %{id: task.id, title: task.title, done: task.done, due_on: task.due_on}
  end
end

defmodule TaskApiWeb.ChangesetJSON do
  def error(%{changeset: changeset}) do
    %{errors: Ecto.Changeset.traverse_errors(changeset, &translate_error/1)}
  end

  defp translate_error({msg, opts}) do
    Enum.reduce(opts, msg, fn {key, value}, acc ->
      String.replace(acc, "%{#{key}}", fn _ -> to_string(value) end)
    end)
  end
end
```

The error response looks like `{"errors": {"title": ["can't be blank"]}}`.

## 5. Try it

```bash
curl -X POST localhost:4000/api/tasks -H 'content-type: application/json' \
  -d '{"task": {"title": "Learn Phoenix"}}'
curl localhost:4000/api/tasks
curl -X PATCH localhost:4000/api/tasks/1 -H 'content-type: application/json' -d '{"task": {"done": true}}'
curl -X DELETE localhost:4000/api/tasks/1 -i
```

## 6. Common API needs

### Pagination

> **In short:** Offset pagination with `limit`/`offset` is simplest. Keyset (cursor) pagination scales better for large tables. Libraries: **Flop**, **Scrivener**, **Paginator**.

```elixir
def list_tasks(params) do
  page = max(String.to_integer(params["page"] || "1"), 1)
  per_page = min(String.to_integer(params["per_page"] || "20"), 100)

  Task
  |> order_by(desc: :id)
  |> limit(^per_page)
  |> offset(^((page - 1) * per_page))
  |> Repo.all()
end

# keyset/cursor: WHERE id < last_seen_id ORDER BY id DESC LIMIT n
```

### Filtering safely

Never pass raw params into `order_by` or field names. Whitelist them:

```elixir
@sortable %{"title" => :title, "due" => :due_on, "created" => :inserted_at}
def sort(q, key), do: order_by(q, ^[asc: Map.get(@sortable, key, :inserted_at)])
```

### CORS (when a React app on another origin calls the API)

```elixir
# mix.exs: {:cors_plug, "~> 3.0"}
# endpoint.ex, before the router:
plug CORSPlug, origin: ["http://localhost:5173", "https://app.example.com"]
```

### Rate limiting, API docs, GraphQL

- Rate limiting: **Hammer** or **PlugAttack**, or an ETS counter (OTP lesson 04).
- OpenAPI docs: **open_api_spex**.
- GraphQL: **Absinthe** (+ Dataloader for N+1).

### API versioning

```elixir
scope "/api/v1", MyAppWeb.V1, as: :v1 do ... end
```

## Exercises

1. Generate the JSON API for tasks and test every endpoint with `curl` or Postman.
2. Add `{:error, :forbidden}` handling to the FallbackController, and return it when a user tries to update someone else's task.
3. Add pagination plus `?done=true` filtering to `index`.
4. Add a `ProjectJSON` that embeds a project's tasks (preload them in the context).
5. Call the API from a small React app (Vite on :5173) and configure CORS.

## Interview questions

<details>
<summary>What are Phoenix contexts and why use them?</summary>

Contexts are modules that group related functionality and expose a public API for one domain area (`Accounts`, `Billing`, `Tasks`). Controllers, LiveViews and jobs call context functions instead of touching Repo or schemas directly. That keeps the web layer thin, centralizes business rules, makes the domain testable without HTTP, and creates explicit boundaries between parts of the system, a light form of domain-driven design.

</details>

<details>
<summary>What is action_fallback?</summary>

A controller-level hook. If an action returns something other than a `%Plug.Conn{}` (typically the non-matching `{:error, ...}` from a `with`), Phoenix passes it to the fallback controller's `call/2`. That centralizes error-to-HTTP-response translation (422 for changeset errors, 404, 403), so actions only describe the happy path.

</details>

<details>
<summary>How do you shape JSON responses in Phoenix?</summary>

With a `XxxJSON` view module whose functions return plain maps. Phoenix encodes them with Jason (or the built-in `JSON` module in newer Elixir). Explicit field selection prevents leaking sensitive data. Alternatives are deriving `Jason.Encoder` with `only:` on the schema, or a serializer library. Changeset errors are rendered with `traverse_errors/2`.

</details>
