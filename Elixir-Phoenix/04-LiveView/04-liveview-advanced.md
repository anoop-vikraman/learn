# 04 · LiveView advanced: hooks into the lifecycle, async work, nesting, errors and performance

> **Plain English:** you can build LiveViews now. This lesson covers what senior developers worry about: sharing setup code across pages, loading slow data without freezing the page, what happens when things crash or the network drops, keeping memory low with thousands of users, and making the UI feel instant.

## 1. `live_session` and `on_mount`: shared setup for many LiveViews

> **In short:** A `live_session` groups LiveViews that share `on_mount` hooks (auth, locale, current user). Navigating between LiveViews **inside** the same live_session reuses the WebSocket. Crossing into a different live_session does a full page load.

```elixir
# router.ex
live_session :authenticated,
  on_mount: [
    {MyAppWeb.UserAuth, :require_authenticated},
    MyAppWeb.Hooks.Locale,
    {MyAppWeb.Hooks.ActivePage, :default}
  ] do
  live "/boards", BoardLive.Index
  live "/boards/:id", BoardLive.Show
end
```

Write your own hook:

```elixir
defmodule MyAppWeb.Hooks.Locale do
  import Phoenix.Component, only: [assign: 3]

  def on_mount(:default, _params, session, socket) do
    locale = session["locale"] || "en"
    Gettext.put_locale(MyAppWeb.Gettext, locale)
    {:cont, assign(socket, :locale, locale)}
  end
end
```

Return `{:cont, socket}` to continue, or `{:halt, redirect(socket, to: ...)}` to stop (e.g. not logged in).

### `attach_hook`: run code on every event, param change or message

```elixir
defmodule MyAppWeb.Hooks.ActivePage do
  import Phoenix.LiveView
  import Phoenix.Component

  def on_mount(:default, _params, _session, socket) do
    {:cont,
     attach_hook(socket, :active_page, :handle_params, fn _params, url, socket ->
       {:cont, assign(socket, :current_path, URI.parse(url).path)}   # highlight the nav item
     end)}
  end
end
```

You can attach hooks to `:handle_params`, `:handle_event`, `:handle_info`, `:handle_async` and `:after_render`. Use them for analytics, active-nav highlighting, or tracking the user's last activity.

## 2. Async work: never block the LiveView

> **In short:** A LiveView handles one message at a time. A slow function in `handle_event` freezes that user's page. Use `assign_async` for loading data, and `start_async` + `handle_async` for actions. Both run in a separate process that is linked to the LiveView, so the work is cancelled if the user leaves.

### Loading several things in parallel

```elixir
def mount(%{"id" => id}, _session, socket) do
  {:ok,
   socket
   |> assign(:board_id, id)
   |> assign_async([:stats, :activity], fn ->
     {:ok, %{stats: Stats.for_board(id), activity: Activity.recent(id)}}
   end)}
end
```

```heex
<.async_result :let={stats} assign={@stats}>
  <:loading><div class="skeleton h-8 w-32"></div></:loading>
  <:failed :let={_}>Couldn't load stats. <button phx-click="retry">Retry</button></:failed>
  {stats.done} / {stats.total} done
</.async_result>
```

### Running a slow action after a click

```elixir
def handle_event("generate_report", _params, socket) do
  board_id = socket.assigns.board_id

  {:noreply,
   socket
   |> assign(:report_status, :running)
   |> start_async(:report, fn -> Reports.generate(board_id) end)}
end

def handle_async(:report, {:ok, {:ok, url}}, socket) do
  {:noreply, socket |> assign(:report_status, :done) |> assign(:report_url, url)}
end

def handle_async(:report, {:ok, {:error, reason}}, socket) do
  {:noreply, socket |> assign(:report_status, :failed) |> put_flash(:error, "Failed: #{inspect(reason)}")}
end

def handle_async(:report, {:exit, reason}, socket) do          # the task crashed or timed out
  {:noreply, socket |> assign(:report_status, :failed) |> put_flash(:error, "Crashed: #{inspect(reason)}")}
end
```

`cancel_async(socket, :report)` stops it. Starting another `start_async` with the same name replaces the previous one.

**For work longer than a few seconds**, or work that must finish even if the user closes the tab, use an **Oban** job and broadcast progress over PubSub to the LiveView.

## 3. Showing progress and making it feel instant

> **In short:** Every click is a round trip to the server, so give feedback immediately on the client: loading classes, `phx-disable-with`, JS commands, and optimistic updates.

### Automatic loading classes

While an event is in flight, LiveView adds classes to the element that triggered it:

| Class | Added to |
| --- | --- |
| `phx-click-loading` | The clicked element |
| `phx-submit-loading` | The form being submitted |
| `phx-change-loading` | The input being changed |

With Tailwind's variants (configured in Phoenix's `app.css`):

```heex
<button phx-click="save" class="btn phx-click-loading:opacity-50 phx-click-loading:cursor-wait">
  Save
</button>
<button phx-disable-with="Saving...">Save</button>
```

### Connection status

```heex
<div id="offline-banner" class="hidden" phx-disconnected={JS.show()} phx-connected={JS.hide()}>
  Reconnecting…
</div>
```

The `topbar` progress bar in `app.js` shows during page navigations, driven by the `phx:page-loading-start` and `phx:page-loading-stop` events.

### Optimistic UI

Change the DOM immediately, then let the server confirm:

```heex
<li id={"task-#{@task.id}"}>
  <button phx-click={
    JS.toggle_class("line-through opacity-50", to: "#task-#{@task.id}")
    |> JS.push("toggle_done", value: %{id: @task.id})
  }>✓</button>
</li>
```

If the server rejects the change, it re-renders with the true state, which corrects the UI.

## 4. Nested LiveViews

> **In short:** `live_render/3` embeds a **separate LiveView process** inside another. It's useful for isolated, independently updating widgets (a notifications bell, a chat sidebar). If the child crashes, the parent survives.

```heex
{live_render(@socket, MyAppWeb.NotificationsLive,
  id: "notifications",
  session: %{"user_id" => @current_scope.user.id},
  sticky: true)}
```

`sticky: true` keeps it alive across live navigation (e.g. a music player or chat that persists between pages). It must be rendered in the layout.

| | Function component | LiveComponent | Nested LiveView |
| --- | --- | --- | --- |
| Own process | No | No (runs in the parent) | **Yes** |
| Own state + events | No | Yes | Yes |
| Crash isolation | No | No | **Yes** |
| Cost | Cheapest | Low | A process plus a channel |

## 5. Memory management at scale

> **In short:** Every connected user has a LiveView process holding its assigns. With 10,000 users, a 1 MB assign is 10 GB. Keep assigns small.

Techniques:
- **Streams** for lists (lesson 03): items aren't kept in memory after rendering.
- **Store ids, not big structs**, when you only need to look things up later.
- `temporary_assigns`: reset an assign after each render (older technique, mostly replaced by streams):

```elixir
def mount(_, _, socket), do: {:ok, assign(socket, messages: []), temporary_assigns: [messages: []]}
```

- **Hibernate** idle processes (LiveView does this automatically after a period of inactivity, configurable with `hibernate_after`).
- **Measure:** LiveDashboard → Processes, sorted by memory, then find the LiveView processes.

## 6. When things go wrong: crashes and reconnects

> **In short:** If a LiveView crashes, the client reconnects and **mounts a fresh process**. The user sees a brief flash and the page recovers. Form inputs are restored automatically. Anything else must be rebuildable from the URL and the database.

What happens on a crash in `handle_event`:
1. The LiveView process crashes (the error is logged).
2. The client detects the dropped channel and rejoins.
3. `mount` → `handle_params` run again, building state from the URL and DB.
4. **Form recovery:** the client re-sends the form's current values as a `phx-change` event, so the user doesn't lose their typing. Customise this with `phx-auto-recover="recover_form"` on the form.

Design rules:
- Keep important UI state (filters, selected tab, page) in the **URL** via `handle_params`.
- Persist important data immediately (DB), not only in assigns.
- Don't rescue everything. Let unexpected errors crash, and show expected errors as flash messages.

Errors during the **initial HTTP render** produce normal error pages (404 for `Ecto.NoResultsError`, 500 otherwise). For custom behaviour, raise an exception that implements `Plug.Exception`, or redirect explicitly.

### Deploys

On deploy, every connected LiveView disconnects and reconnects to the new code, triggering the same recovery path. `phx-track-static` reloads the page if assets changed.

## 7. Security in LiveView

> **In short:** Every `handle_event` is an API endpoint. Users can send any event with any params from the browser console, so authorize everything on the server.

```elixir
# ❌ trusts the client: any user could delete any task by sending a different id
def handle_event("delete", %{"id" => id}, socket) do
  Repo.delete!(Repo.get!(Task, id))
  ...
end

# ✅ looks up through the user's scope (raises if it isn't theirs) and checks permission
def handle_event("delete", %{"id" => id}, socket) do
  scope = socket.assigns.current_scope
  task = Tasks.get_task!(scope, id)
  with :ok <- Tasks.Policy.authorize(scope, :delete, task),
       {:ok, _} <- Tasks.delete_task(scope, task) do
    {:noreply, stream_delete(socket, :tasks, task)}
  else
    {:error, :forbidden} -> {:noreply, put_flash(socket, :error, "Not allowed")}
  end
end
```

Checklist:
- Re-authorize in `on_mount` (it runs on the WebSocket connect too), and in every event that touches data.
- Hiding a button in the template is **not** security.
- Validate and whitelist params (`String.to_existing_atom` only on values you've checked, changesets for everything else).
- Topics for PubSub should include ids the user is authorized for, and must be checked before subscribing.
- `check_origin` in prod config prevents other sites from opening your sockets.
- Log users out of live sockets on logout (`phx.gen.auth` broadcasts a disconnect to `users_sessions:TOKEN`).

## 8. Performance checklist

| Problem | Fix |
| --- | --- |
| Large lists | `stream` with `limit:` and pagination or infinite scroll |
| Typing triggers too many events | `phx-debounce="300"` or `"blur"` |
| Scroll or mouse events | `phx-throttle` |
| Whole template re-renders | Check change tracking: no `assigns` passed whole, no locals computed in the template |
| Slow mount | `assign_async`; guard work with `connected?` |
| Big diffs on each update | Break the page into components; use `:key` on `:for` |
| Third-party JS fighting LiveView | `phx-update="ignore"` on its container |
| UI feels laggy | JS commands, loading classes, deploy closer to users |
| Broadcast storms | Send ids or small payloads, debounce broadcasts, use per-entity topics |

LiveView also has a **latency simulator** for testing what users far away will feel:

```js
liveSocket.enableLatencySim(300)   // in the browser console
liveSocket.disableLatencySim()
```

## 9. Testing the advanced pieces

```elixir
test "async stats load", %{conn: conn, scope: scope} do
  board = board_fixture(scope)
  {:ok, view, html} = live(conn, ~p"/boards/#{board}")
  assert html =~ "skeleton"                       # loading state
  assert render_async(view) =~ "done"             # waits for assign_async/start_async
end

test "unauthorized delete is rejected", %{conn: conn, scope: scope} do
  other_task = task_fixture(user_scope_fixture())
  {:ok, view, _} = live(conn, ~p"/boards/#{board_fixture(scope)}")
  assert_raise Ecto.NoResultsError, fn -> render_click(view, "delete", %{"id" => other_task.id}) end
end

test "redirects when not logged in" do
  conn = build_conn()
  assert {:error, {:redirect, %{to: "/users/log-in"}}} = live(conn, ~p"/boards")
end
```

## Exercises

1. Write an `on_mount` hook that assigns `:current_path` via `attach_hook` and highlights the active nav link.
2. Add a "Generate report" button using `start_async`, with loading, success and failure states.
3. Add a connection-status banner with `phx-disconnected` and `phx-connected`.
4. Make "toggle done" optimistic with `JS.toggle_class |> JS.push`.
5. Turn on `liveSocket.enableLatencySim(500)` and improve every interaction that feels slow.
6. Try deleting someone else's task by sending the event from the browser console (`liveSocket.main.pushEvent(...)`, or a test), and make sure it fails.

## Interview questions

<details>
<summary>What is a live_session and why does it matter?</summary>

It groups LiveView routes that share `on_mount` hooks and a root layout. Navigation with `navigate` between LiveViews in the same live_session happens over the existing WebSocket, without a full page load, and the hooks re-run for each LiveView mount. That's where authentication is enforced for the WebSocket lifecycle, because plugs don't run there. Crossing live_session boundaries forces a full HTTP page load.

</details>

<details>
<summary>How do you run slow operations in a LiveView without freezing the UI?</summary>

Use `assign_async/3` for data loading and `start_async/3` + `handle_async/3` for user-triggered work. Both run in a separate process linked to the LiveView (cancelled if the LiveView dies), and the template shows loading or failed states via `<.async_result>` or your own assigns. For long or must-complete work, enqueue an Oban job and stream progress via PubSub.

</details>

<details>
<summary>What happens when a LiveView crashes?</summary>

The process exits and the client automatically rejoins, mounting a new process that rebuilds state through `mount`/`handle_params` from the URL and DB. Forms are recovered by re-sending their values as a change event (customisable with `phx-auto-recover`). So durable state should live in the URL or database, not only in assigns.

</details>

<details>
<summary>How do you keep LiveView memory usage under control?</summary>

Keep assigns minimal (ids instead of big structs), use streams for collections, paginate, avoid storing large binaries, let idle processes hibernate, and monitor process memory in LiveDashboard. Memory per user multiplied by concurrent users is the main scaling constraint.

</details>

<details>
<summary>Why is every handle_event a security boundary?</summary>

Events and their params come from the client, and a user can push any event with arbitrary params using the JS console or a custom WebSocket client. Each handler must re-fetch records through the user's scope and check authorization, exactly as an API endpoint would. Hiding buttons in the template is not access control.

</details>
