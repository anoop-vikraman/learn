# 02 · Components and forms

> **Plain English:** Components are reusable pieces of UI, the same idea as React components. **Function components** just turn inputs into HTML. **Live components** also keep their own small state. Forms in LiveView use Ecto changesets, so the same validation rules check the form *as the user types* and again when it's saved.

## 1. Function components: stateless, like React function components

> **In short:** A function that takes `assigns` and returns `~H`. Declare props with `attr` and children with `slot`, and call it as `<.name>`.

```elixir
defmodule MyAppWeb.TaskComponents do
  use Phoenix.Component

  attr :task, :map, required: true
  attr :on_toggle, :string, default: "toggle"
  attr :rest, :global                          # passes through class, id, data-* ...

  def task_item(assigns) do
    ~H"""
    <li class={["flex gap-2 p-2", @task.done && "opacity-50"]} {@rest}>
      <input type="checkbox" checked={@task.done} phx-click={@on_toggle} phx-value-id={@task.id} />
      <span class={@task.done && "line-through"}>{@task.title}</span>
    </li>
    """
  end

  attr :title, :string, required: true
  slot :inner_block, required: true
  slot :actions                                # named slot

  def card(assigns) do
    ~H"""
    <div class="card bg-base-200 p-4">
      <h2 class="font-bold">{@title}</h2>
      {render_slot(@inner_block)}
      <div :if={@actions != []} class="mt-2 flex gap-2">{render_slot(@actions)}</div>
    </div>
    """
  end
end
```

```heex
<.card title="Today">
  <ul>
    <.task_item :for={t <- @tasks} task={t} id={"task-#{t.id}"} />
  </ul>
  <:actions><.button phx-click="clear_done">Clear done</.button></:actions>
</.card>
```

- Local call: `<.card>` for functions in the current or imported module. Remote call: `<TaskComponents.card>`.
- `attr` is checked at **compile time**: a missing required attr or unknown attr gives a warning.
- Slots can take arguments: `<:col :let={row} label="Title">{row.title}</:col>`. That's how `<.table>` works.

### Core components

> **In short:** `core_components.ex` is generated into your app with `<.button>`, `<.input>`, `<.form>`-friendly inputs, `<.table>`, `<.header>`, `<.list>`, `<.icon>` and `<.flash>`. It's your code, so restyle it freely.

```heex
<.table id="tasks" rows={@tasks} row_click={&JS.navigate(~p"/tasks/#{&1}")}>
  <:col :let={task} label="Title">{task.title}</:col>
  <:col :let={task} label="Done">{if task.done, do: "✓"}</:col>
  <:action :let={task}><.link navigate={~p"/tasks/#{task}/edit"}>Edit</.link></:action>
</.table>

<.icon name="hero-check-circle" class="size-5" />   <%!-- Heroicons are built in --%>
```

## 2. Forms with changesets

> **In short:** Turn a changeset into a form with `to_form/1`, render it with `<.form for={@form}>` and `<.input field={@form[:title]}>`. Validate on `phx-change`, save on `phx-submit`.

```elixir
defmodule MyAppWeb.TaskLive.New do
  use MyAppWeb, :live_view
  alias MyApp.Tasks
  alias MyApp.Tasks.Task

  def mount(_params, _session, socket) do
    changeset = Tasks.change_task(socket.assigns.current_scope, %Task{})
    {:ok, assign(socket, form: to_form(changeset))}
  end

  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash} current_scope={@current_scope}>
      <.form for={@form} id="task-form" phx-change="validate" phx-submit="save">
        <.input field={@form[:title]} label="Title" phx-debounce="300" />
        <.input field={@form[:description]} type="textarea" label="Description" />
        <.input field={@form[:priority]} type="select" label="Priority"
                options={[Low: :low, Medium: :medium, High: :high]} />
        <.input field={@form[:due_on]} type="date" label="Due" />
        <.input field={@form[:done]} type="checkbox" label="Done?" />
        <.button phx-disable-with="Saving...">Save</.button>
      </.form>
    </Layouts.app>
    """
  end

  def handle_event("validate", %{"task" => params}, socket) do
    changeset =
      socket.assigns.current_scope
      |> Tasks.change_task(%Task{}, params)
      |> Map.put(:action, :validate)          # ◀ makes errors display (otherwise they stay hidden)

    {:noreply, assign(socket, form: to_form(changeset))}
  end

  def handle_event("save", %{"task" => params}, socket) do
    case Tasks.create_task(socket.assigns.current_scope, params) do
      {:ok, _task} ->
        {:noreply, socket |> put_flash(:info, "Task created") |> push_navigate(to: ~p"/tasks")}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end
end
```

How it fits together:
- Form field names are `task[title]`, so params arrive as `%{"task" => %{"title" => ...}}`. The `task` key comes from the schema name.
- `<.input>` shows errors from the changeset automatically, but only if the changeset has an `:action` set (Repo sets one on failed insert/update; you set `:validate` manually). This way, a fresh form doesn't show "can't be blank" before the user has typed anything.
- Inputs the user hasn't touched yet don't show errors (LiveView tracks "used" inputs).
- `phx-debounce` avoids a server round-trip on every keystroke.

### Forms without a schema

```elixir
form = to_form(%{"q" => ""}, as: :search)
# <.form for={@form} phx-change="search"><.input field={@form[:q]} /></.form>
# params: %{"search" => %{"q" => "..."}}
```

For a validated form without a DB table, use an **embedded schema** with `embedded_schema do ... end` plus a changeset and `apply_action/2`.

### Nested forms

`<.inputs_for :let={f} field={@form[:comments]}>` together with `cast_assoc` in the changeset handles has-many forms (e.g. a task with sub-items). Use `sort_param`/`drop_param` to add and remove rows.

## 3. Live components: stateful, with their own events

> **In short:** `Phoenix.LiveComponent` keeps its own state **inside the parent's process** and handles its own events (`phx-target={@myself}`). Use one only when you need encapsulated state plus events. Otherwise prefer function components.

```elixir
defmodule MyAppWeb.TaskLive.InlineEdit do
  use MyAppWeb, :live_component

  @impl true
  def update(assigns, socket) do                       # runs when the parent passes new attrs
    {:ok, socket |> assign(assigns) |> assign_new(:editing, fn -> false end)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div id={@id}>
      <span :if={!@editing} phx-click="edit" phx-target={@myself}>{@task.title}</span>
      <form :if={@editing} phx-submit="save" phx-target={@myself}>
        <input name="title" value={@task.title} />
      </form>
    </div>
    """
  end

  @impl true
  def handle_event("edit", _, socket), do: {:noreply, assign(socket, editing: true)}

  def handle_event("save", %{"title" => title}, socket) do
    {:ok, task} = MyApp.Tasks.update_task(socket.assigns.scope, socket.assigns.task, %{title: title})
    send(self(), {:task_updated, task})                # notify the parent LiveView (same process!)
    {:noreply, assign(socket, editing: false, task: task)}
  end
end
```

```heex
<.live_component :for={t <- @tasks} module={MyAppWeb.TaskLive.InlineEdit} id={"edit-#{t.id}"} task={t} scope={@current_scope} />
```

- An `id` is required and must be unique.
- Lifecycle: `mount/1` (once) → `update/2` (each time the parent re-renders it) → `render/1`.
- Without `phx-target={@myself}`, events go to the parent LiveView.
- Child → parent communication: `send(self(), msg)` (the same process) handled in the parent's `handle_info`.

### Which component type?

| Need | Use |
| --- | --- |
| Reusable markup, no state | Function component (90% of cases) |
| Encapsulated state + its own events | LiveComponent |
| Separate process, crash isolation, its own lifecycle | A nested LiveView via `live_render` (rare) |

## 4. Layouts

> **In short:** `root.html.heex` is the static HTML shell, rendered once. In Phoenix 1.8 the app layout is a function component, `<Layouts.app>`, that you call explicitly in each template, passing `flash` and `current_scope`.

```heex
<Layouts.app flash={@flash} current_scope={@current_scope}>
  ...page...
</Layouts.app>
```

(Phoenix 1.7 used an implicit `app.html.heex` layout configured in `live_view` options.)

## Exercises

1. Write a `<.badge>` function component with `attr :kind, :atom, values: [:info, :warn, :error]` and an inner slot.
2. Build the new-task form with live validation. Notice that errors appear only after you type.
3. Convert it into a modal on `/tasks/new` using a live action on the index LiveView.
4. Build an inline-edit LiveComponent that notifies the parent when it saves.
5. Build a `<.data_table>` with a `:col` slot taking `:let`.

## Interview questions

<details>
<summary>Function components vs live components?</summary>

Function components are stateless functions of assigns (with compile-time-checked `attr`/`slot` declarations). They're cheap and should be the default. LiveComponents have their own state and lifecycle (`mount`, `update`, `render`) and can handle their own events via `phx-target={@myself}`, but they run in the **parent LiveView's process**. Use them only when you need encapsulated state plus event handling. For process isolation you'd use a nested LiveView.

</details>

<details>
<summary>How do forms and validation work in LiveView?</summary>

A changeset is converted with `to_form/1` and rendered with `<.form for={@form}>` and `<.input field={@form[:field]}>`. On `phx-change`, the handler builds a changeset from the params, sets `action: :validate` so errors become visible, and reassigns the form. LiveView sends only the changed error markup. On `phx-submit`, the context's create or update function runs, and either navigates on success or re-assigns the error changeset. Validation logic lives in the schema's changeset, so it's shared with APIs.

</details>

<details>
<summary>How does a LiveComponent communicate with its parent?</summary>

Because it runs in the parent's process, it can `send(self(), message)` and the parent handles it in `handle_info/2`. The parent passes data down as attributes, which triggers the component's `update/2`. To update a component from elsewhere, use `send_update/3` with the component module and id.

</details>
