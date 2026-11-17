# 03 · Streams, real-time, uploads, JS and testing

## 1. Streams: large lists without server memory

> **In short:** Streams send list items to the client and then **forget them on the server**. You insert, update or delete individual items by id, so 10,000 rows don't sit in every user's process.

```elixir
def mount(_params, _session, socket) do
  tasks = Tasks.list_tasks(socket.assigns.current_scope)
  {:ok, stream(socket, :tasks, tasks)}
end

def handle_event("delete", %{"id" => id}, socket) do
  task = Tasks.get_task!(socket.assigns.current_scope, id)
  {:ok, _} = Tasks.delete_task(socket.assigns.current_scope, task)
  {:noreply, stream_delete(socket, :tasks, task)}
end
```

```heex
<ul id="tasks" phx-update="stream">
  <li :for={{dom_id, task} <- @streams.tasks} id={dom_id}>
    {task.title}
    <button phx-click="delete" phx-value-id={task.id}>×</button>
  </li>
</ul>
<%!-- Empty state that works with streams: --%>
<div id="tasks-empty" class="only:block hidden">No tasks</div>
```

API:

```elixir
stream(socket, :tasks, list)                      # initial (or append more)
stream(socket, :tasks, list, reset: true)         # replace everything (e.g. a new filter)
stream_insert(socket, :tasks, task)               # add or update (same id → replaced in place)
stream_insert(socket, :tasks, task, at: 0)        # prepend
stream_insert(socket, :tasks, task, limit: 100)   # keep only 100 in the DOM
stream_delete(socket, :tasks, task)
```

Requirements: the container has `phx-update="stream"` and a unique `id`, and each child uses the `dom_id` as its `id`.

Infinite scroll: `phx-viewport-bottom="load_more"` on the container, plus `stream(socket, :tasks, next_page)` in the handler.

## 2. Real-time with PubSub: multi-user sync

> **In short:** Subscribe in `mount` (when connected), broadcast from the context, and handle the message in `handle_info` with `stream_insert`. Every user's page updates live.

```elixir
# context
def subscribe_tasks(%Scope{} = scope) do
  Phoenix.PubSub.subscribe(MyApp.PubSub, "user:#{scope.user.id}:tasks")
end

defp broadcast(%Scope{} = scope, message) do
  Phoenix.PubSub.broadcast(MyApp.PubSub, "user:#{scope.user.id}:tasks", message)
end
# create_task / update_task / delete_task call broadcast(scope, {:created, task}) etc.
```

```elixir
# LiveView
def mount(_params, _session, socket) do
  if connected?(socket), do: Tasks.subscribe_tasks(socket.assigns.current_scope)
  {:ok, stream(socket, :tasks, Tasks.list_tasks(socket.assigns.current_scope))}
end

def handle_info({:created, task}, socket), do: {:noreply, stream_insert(socket, :tasks, task, at: 0)}
def handle_info({:updated, task}, socket), do: {:noreply, stream_insert(socket, :tasks, task)}
def handle_info({:deleted, task}, socket), do: {:noreply, stream_delete(socket, :tasks, task)}
```

Open two browser windows: create a task in one and it appears in the other. That takes about 10 lines of code, with no API, no client cache and no WebSocket plumbing. **This is the demo moment for your trial project.**

Phoenix 1.8's `phx.gen.live` (after `phx.gen.auth`) generates exactly this pattern.

### For a shared board (e.g. a team project)

Use a topic per board, `"board:#{board_id}"`, and broadcast to it so that everyone viewing the board gets updates.

## 3. Presence in LiveView: who's viewing

```elixir
def mount(%{"id" => board_id}, _session, socket) do
  topic = "board:#{board_id}:presence"

  if connected?(socket) do
    MyAppWeb.Presence.track(self(), topic, socket.assigns.current_scope.user.id, %{
      email: socket.assigns.current_scope.user.email
    })
    Phoenix.PubSub.subscribe(MyApp.PubSub, topic)
  end

  {:ok, assign(socket, topic: topic, viewers: list_viewers(topic))}
end

def handle_info(%Phoenix.Socket.Broadcast{event: "presence_diff"}, socket) do
  {:noreply, assign(socket, viewers: list_viewers(socket.assigns.topic))}
end

defp list_viewers(topic) do
  topic |> MyAppWeb.Presence.list() |> Enum.map(fn {_id, %{metas: [meta | _]}} -> meta.email end)
end
```

## 4. File uploads

> **In short:** `allow_upload` in mount, `<.live_file_input>` in the form, and `consume_uploaded_entries` on save. You get progress, validation, drag-and-drop and previews built in. Uploads can also go directly to S3.

```elixir
def mount(_params, _session, socket) do
  {:ok,
   socket
   |> assign(:uploaded_files, [])
   |> allow_upload(:attachment, accept: ~w(.jpg .png .pdf), max_entries: 3, max_file_size: 5_000_000)}
end

def handle_event("validate", _params, socket), do: {:noreply, socket}

def handle_event("save", _params, socket) do
  paths =
    consume_uploaded_entries(socket, :attachment, fn %{path: path}, entry ->
      dest = Path.join(["priv/static/uploads", "#{entry.uuid}-#{entry.client_name}"])
      File.cp!(path, dest)
      {:ok, ~p"/uploads/#{Path.basename(dest)}"}
    end)

  {:noreply, update(socket, :uploaded_files, &(&1 ++ paths))}
end

def handle_event("cancel-upload", %{"ref" => ref}, socket),
  do: {:noreply, cancel_upload(socket, :attachment, ref)}
```

```heex
<form id="upload-form" phx-submit="save" phx-change="validate">
  <div phx-drop-target={@uploads.attachment.ref}>
    <.live_file_input upload={@uploads.attachment} />
  </div>

  <div :for={entry <- @uploads.attachment.entries}>
    <.live_img_preview entry={entry} width="80" />
    <progress value={entry.progress} max="100">{entry.progress}%</progress>
    <button type="button" phx-click="cancel-upload" phx-value-ref={entry.ref}>×</button>
    <p :for={err <- upload_errors(@uploads.attachment, entry)}>{inspect(err)}</p>
  </div>

  <button type="submit">Upload</button>
</form>
```

For production, upload **directly to S3** with the `external:` option of `allow_upload` (presigned URLs), so files never pass through your server.

## 5. JS commands: instant client-side UI

> **In short:** `Phoenix.LiveView.JS` runs common DOM operations (show, hide, toggle classes, transitions, push events) **on the client with no server round-trip**, and they survive re-renders.

```elixir
alias Phoenix.LiveView.JS

def toggle_menu(js \\ %JS{}) do
  js
  |> JS.toggle(to: "#menu", in: {"ease-out duration-200", "opacity-0", "opacity-100"})
  |> JS.toggle_class("rotate-180", to: "#chevron")
end
```

```heex
<button phx-click={toggle_menu()}>Menu <span id="chevron">▾</span></button>
<div id="menu" class="hidden">...</div>

<%!-- Combine client-side and server work: hide instantly, then tell the server --%>
<button phx-click={JS.hide(to: "#task-#{@task.id}", transition: "fade-out") |> JS.push("delete", value: %{id: @task.id})}>
  Delete
</button>
```

Other commands: `JS.show`, `JS.hide`, `JS.add_class`, `JS.remove_class`, `JS.set_attribute`, `JS.focus`, `JS.navigate`, `JS.patch`, `JS.dispatch`, `JS.exec`.

## 6. Hooks: when you need real JavaScript

> **In short:** A hook attaches JS lifecycle callbacks (`mounted`, `updated`, `destroyed`…) to an element with `phx-hook`. Use hooks for third-party libraries (charts, maps, editors), the clipboard, or local storage. Hooks can push events to the server and receive events from it.

```js
// assets/js/app.js
const Hooks = {}

Hooks.Chart = {
  mounted() {
    this.chart = new Chart(this.el, JSON.parse(this.el.dataset.config))
    this.handleEvent("chart:update", ({ data }) => {   // server → client
      this.chart.data = data
      this.chart.update()
    })
  },
  destroyed() { this.chart.destroy() }
}

Hooks.CopyToClipboard = {
  mounted() {
    this.el.addEventListener("click", () => {
      navigator.clipboard.writeText(this.el.dataset.text)
      this.pushEvent("copied", {})                      // client → server
    })
  }
}

let liveSocket = new LiveSocket("/live", Socket, { hooks: Hooks, params: { _csrf_token: csrfToken } })
```

```heex
<canvas id="stats-chart" phx-hook="Chart" phx-update="ignore" data-config={Jason.encode!(@chart_config)}></canvas>
```

```elixir
# server pushes to the hook
{:noreply, push_event(socket, "chart:update", %{data: new_data})}
```

- An element with a hook **must have a unique id**.
- `phx-update="ignore"` stops LiveView from overwriting DOM that the JS library manages.
- **LiveView 1.1 colocated hooks:** you can write the hook's JS right next to the component in a `<script :type={Phoenix.LiveView.ColocatedHook} name=".Chart">` tag, and it's bundled automatically. Phoenix 1.8 apps are set up for this.

## 7. Testing LiveViews

> **In short:** `Phoenix.LiveViewTest` lets you mount a LiveView, click, submit forms and assert on rendered HTML without a browser. It's fast and runs concurrently.

```elixir
defmodule MyAppWeb.TaskLiveTest do
  use MyAppWeb.ConnCase
  import Phoenix.LiveViewTest
  import MyApp.TasksFixtures

  setup :register_and_log_in_user       # generated by phx.gen.auth

  test "lists and creates tasks", %{conn: conn, scope: scope} do
    task = task_fixture(scope, title: "Existing")
    {:ok, view, html} = live(conn, ~p"/tasks")
    assert html =~ "Existing"

    view
    |> form("#task-form", task: %{title: ""})
    |> render_change() =~ "can&#39;t be blank"

    view
    |> form("#task-form", task: %{title: "New one"})
    |> render_submit()

    assert render(view) =~ "New one"
  end

  test "deletes", %{conn: conn, scope: scope} do
    task = task_fixture(scope)
    {:ok, view, _} = live(conn, ~p"/tasks")
    view |> element("#tasks-#{task.id} button", "×") |> render_click()
    refute has_element?(view, "#tasks-#{task.id}")
  end

  test "receives broadcasts", %{conn: conn, scope: scope} do
    {:ok, view, _} = live(conn, ~p"/tasks")
    {:ok, _} = MyApp.Tasks.create_task(scope, %{title: "From elsewhere"})
    assert render(view) =~ "From elsewhere"
  end
end
```

Useful helpers: `live/2`, `render/1`, `element/3`, `has_element?/2,3`, `render_click/1`, `form/3`, `render_change/1`, `render_submit/1`, `assert_patch/2`, `assert_redirect/2`, `follow_redirect/2`, `render_async/1`, `file_input/4` + `render_upload/2`.

For real-browser tests (JS hooks), use **Wallaby** or **PhoenixTest** with Playwright.

## Exercises

1. Convert your task list to streams. Add `stream_insert(..., at: 0)` on create.
2. Add PubSub to the context and sync two browser windows live.
3. Add Presence showing "N people viewing".
4. Add an image attachment upload with a preview and progress bar.
5. Add a `JS.toggle` dropdown and a hook that copies a task link to the clipboard.
6. Write LiveView tests for create, validate, delete and broadcast.

## Interview questions

<details>
<summary>What are LiveView streams and why do they exist?</summary>

Streams manage large or growing collections without keeping them in the LiveView process's memory. Items are rendered and sent to the client, then dropped from server state. Later you insert, update or delete individual items by DOM id (`stream_insert`, `stream_delete`), and the client keeps the DOM in sync via `phx-update="stream"`. That keeps per-user memory constant, which matters when thousands of users each hold a LiveView process.

</details>

<details>
<summary>How do you make a LiveView update in real time when data changes elsewhere?</summary>

The context broadcasts an event on a Phoenix.PubSub topic after each successful write. The LiveView subscribes in `mount` (only when `connected?`) and handles the messages in `handle_info/2`, updating assigns or calling `stream_insert`/`stream_delete`. LiveView then pushes the minimal diff to the browser. It works across a cluster because PubSub is distributed.

</details>

<details>
<summary>When do you need JS hooks vs JS commands?</summary>

JS commands (`Phoenix.LiveView.JS`) cover declarative DOM operations: show, hide, toggle classes, transitions, focus, and pushing events. They run instantly on the client and are re-render safe. Hooks are for imperative JavaScript: integrating third-party libraries (charts, maps, rich-text editors), browser APIs (clipboard, geolocation, local storage), or custom client-server event exchange via `pushEvent`/`handleEvent`.

</details>

<details>
<summary>How do you test LiveViews?</summary>

With `Phoenix.LiveViewTest`: `live(conn, path)` mounts the LiveView (both the disconnected and connected phases) in the test process, without a browser. You interact with `element/3` + `render_click`, `form/3` + `render_change`/`render_submit`, and assert on `render/1` output or `has_element?`. Broadcasts can be tested by calling the context and asserting on the re-rendered output. Tests run concurrently thanks to the Ecto SQL sandbox. Real-browser tests (Wallaby or Playwright) are only needed for JS hooks.

</details>
