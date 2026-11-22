# 01 · LiveView basics

> **Plain English:** LiveView lets you build interactive pages like React, but the state and logic stay on the server. The page keeps an open line (WebSocket) to a small server process. When you click, the server updates its data, works out exactly what changed on the page, and sends back only that tiny change. You get no separate API and no client-side state library.

## 1. How LiveView works

> **In short:** The first request returns full HTML (fast, SEO-friendly). Then the browser opens a WebSocket, a stateful LiveView **process** starts on the server, and every event sends back only the **changed parts** of the page.

```
1. GET /counter  ──HTTP──▶  mount/3 (disconnected) → render → full HTML page
2. JS boots, opens WebSocket ──▶ NEW process: mount/3 (connected) → render
3. User clicks  ──"inc" event over WS──▶ handle_event/3 → assign → re-render
4. Server sends a tiny diff ◀── {"0": "6"} ── only the dynamic parts that changed
5. Client patches the DOM (morphdom)
```

The template is compiled into **static** parts (sent once) and **dynamic** parts (tracked). LiveView knows which assigns each dynamic part depends on, so it re-renders only what changed. This is "change tracking", and it's why payloads are tiny.

## 2. Your first LiveView

> **In short:** A module with `mount/3`, `render/1` (or a `.heex` file next to it) and `handle_event/3`.

```elixir
defmodule MyAppWeb.CounterLive do
  use MyAppWeb, :live_view

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, count: 0)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <h1 class="text-2xl">Count: {@count}</h1>
      <button phx-click="inc" class="btn">+1</button>
      <button phx-click="add" phx-value-amount="10" class="btn">+10</button>
      <button phx-click="reset" class="btn btn-ghost">Reset</button>
    </Layouts.app>
    """
  end

  @impl true
  def handle_event("inc", _params, socket) do
    {:noreply, update(socket, :count, &(&1 + 1))}
  end

  def handle_event("add", %{"amount" => amount}, socket) do
    {:noreply, update(socket, :count, &(&1 + String.to_integer(amount)))}
  end

  def handle_event("reset", _params, socket), do: {:noreply, assign(socket, count: 0)}
end
```

Router:

```elixir
live "/counter", CounterLive
```

Open the page in **two tabs**. Each tab has its own process and its own count. (In lesson 03 you'll sync them with PubSub.)

Templates can also live in a separate file: `counter_live.html.heex` next to `counter_live.ex` (then omit `render/1`).

## 3. The lifecycle

> **In short:** `mount` (×2: disconnected HTTP + connected WS) → `handle_params` → `render`. After that, events → `handle_event`, messages → `handle_info`, URL changes → `handle_params`. Each one returns an updated socket, and render runs again.

```
               ┌──────────── HTTP (disconnected) ───────────┐
Request ─────▶ │ mount/3 → handle_params/3 → render/1 → HTML │
               └────────────────────────────────────────────┘
               ┌──────────── WebSocket (connected) ─────────────────────────────┐
JS connects ─▶ │ mount/3 → handle_params/3 → render/1                            │
               │   ▲ phx-click/phx-submit…  → handle_event/3 → render (diff)     │
               │   ▲ send/PubSub message    → handle_info/2  → render (diff)     │
               │   ▲ push_patch / <.link patch> → handle_params/3 → render       │
               └────────────────────────────────────────────────────────────────┘
```

**`mount` runs twice.** Avoid doing expensive work (like subscribing to PubSub) during the disconnected render:

```elixir
def mount(_params, _session, socket) do
  if connected?(socket) do
    Phoenix.PubSub.subscribe(MyApp.PubSub, "stats")
    :timer.send_interval(1000, self(), :tick)
  end

  {:ok, assign(socket, stats: load_stats())}
end
```

## 4. Assigns

> **In short:** `assign/2,3` sets values, `update/3` transforms one, and `assign_new/3` sets one only if it's missing. Templates read them as `@name`. Changing an assign triggers a re-render of the parts that use it.

```elixir
socket
|> assign(:page_title, "Tasks")
|> assign(tasks: [], filter: :all)
|> update(:count, &(&1 + 1))
|> assign_new(:current_scope, fn -> nil end)
```

Rules:
- Only use `@assigns` in templates. Don't compute with local variables that read assigns inside a `~H` block, because that breaks change tracking.
- Keep assigns small. Every assign lives in server memory **per connected user**. For big lists, use **streams** (lesson 03).

## 5. Events: bindings

> **In short:** `phx-*` attributes send events to `handle_event/3`, with parameters taken from `phx-value-*` attributes or form fields.

| Binding | Fires on |
| --- | --- |
| `phx-click="evt"` | Click |
| `phx-value-id={task.id}` | Adds `%{"id" => "..."}` to the event params |
| `phx-submit="save"` | Form submit (params = form fields) |
| `phx-change="validate"` | Any form input change |
| `phx-blur` / `phx-focus` | Input focus |
| `phx-keydown` / `phx-keyup` + `phx-key="Enter"` | Keyboard |
| `phx-window-keydown` | Global keyboard shortcuts |
| `phx-debounce="300"` / `phx-throttle="500"` | Rate-limit input events |
| `phx-click-away` | Click outside the element (close dropdowns) |
| `phx-disable-with="Saving..."` | Disable a button while the event is in flight |

```heex
<li :for={task <- @tasks}>
  {task.title}
  <button phx-click="delete" phx-value-id={task.id} data-confirm="Are you sure?">Delete</button>
</li>
<input type="text" name="q" value={@q} phx-keyup="search" phx-debounce="300" />
```

```elixir
def handle_event("delete", %{"id" => id}, socket) do
  task = Tasks.get_task!(socket.assigns.current_scope, id)   # always re-authorize on the server!
  {:ok, _} = Tasks.delete_task(socket.assigns.current_scope, task)
  {:noreply, assign(socket, tasks: Tasks.list_tasks(socket.assigns.current_scope))}
end
```

**Security:** events come from the client, so treat params as untrusted. Always look records up through a scope and check permissions in `handle_event`.

## 6. URL state: `handle_params` and live navigation

> **In short:** Keep filters, pagination and the selected tab in the URL. `<.link patch>` changes the URL within the same LiveView (calling `handle_params`), and `<.link navigate>` switches to another LiveView without a full page reload.

```elixir
def handle_params(params, _uri, socket) do
  filter = params["filter"] || "all"
  {:noreply, assign(socket, filter: filter, tasks: list_tasks(socket, filter))}
end
```

```heex
<.link patch={~p"/tasks?filter=all"}>All</.link>
<.link patch={~p"/tasks?filter=done"}>Done</.link>
<.link navigate={~p"/projects"}>Projects</.link>   <%!-- different LiveView, same WebSocket --%>
<.link href={~p"/users/log-out"} method="delete">Log out</.link>   <%!-- full HTTP request --%>
```

From code: `push_patch(socket, to: ~p"/tasks?filter=done")`, `push_navigate(socket, to: ...)`, or `redirect(socket, to: ...)`.

**Live actions:** routes can pass an action atom, which is useful for modals on the same page:

```elixir
live "/tasks", TaskLive.Index, :index
live "/tasks/new", TaskLive.Index, :new
live "/tasks/:id/edit", TaskLive.Index, :edit
# in the template: <.modal :if={@live_action in [:new, :edit]} ...>
```

## 7. Messages: `handle_info`

> **In short:** Any message sent to the LiveView process (timers, PubSub, Task results) arrives in `handle_info/2`.

```elixir
def mount(_, _, socket) do
  if connected?(socket), do: :timer.send_interval(1000, self(), :tick)
  {:ok, assign(socket, now: DateTime.utc_now())}
end

def handle_info(:tick, socket), do: {:noreply, assign(socket, now: DateTime.utc_now())}
```

## 8. Loading data asynchronously

> **In short:** `assign_async` loads data without blocking the mount, and the template shows loading, ok and failed states. If the LiveView process dies, the async work is cancelled too.

```elixir
def mount(%{"id" => id}, _session, socket) do
  {:ok,
   socket
   |> assign(:project_id, id)
   |> assign_async(:stats, fn -> {:ok, %{stats: Analytics.slow_stats(id)}} end)}
end
```

```heex
<.async_result :let={stats} assign={@stats}>
  <:loading>Loading stats…</:loading>
  <:failed :let={_reason}>Couldn't load stats</:failed>
  <p>Completed: {stats.completed}</p>
</.async_result>
```

For more control use `start_async/3` + `handle_async/3`.

## 9. Flash, page title and redirects

```elixir
socket
|> put_flash(:info, "Saved!")
|> assign(:page_title, "Edit task")    # updates <title> live
|> push_navigate(to: ~p"/tasks")
```

## 10. What happens on disconnect?

> **In short:** If the connection drops, the client reconnects automatically and a **new** process mounts, so in-memory state is rebuilt from `mount`/`handle_params`. Keep important state in the URL or the DB. Form inputs are recovered automatically.

The LiveView process is linked to the socket: close the tab and the process dies. On deploy, all clients reconnect to new processes. That's why URL params (`handle_params`) and the DB are the source of truth.

## Exercises

1. Build the counter, then add a "+N" input using a form with `phx-submit`.
2. Build a clock that ticks every second (`handle_info`). Confirm it only ticks once connected.
3. Build a task list with filters (`all / active / done`) stored in the URL via `<.link patch>`.
4. Add a search box with `phx-change` + `phx-debounce="300"` that filters the list server-side.
5. Use `assign_async` to load a "slow" value (`Process.sleep(2000)`) and show a loading state.

## Interview questions

<details>
<summary>How does Phoenix LiveView work under the hood?</summary>

The initial HTTP request renders the LiveView to full HTML (a "disconnected" mount), so the first paint is fast and crawlable. The JS client then connects over a WebSocket (it's a Phoenix Channel), and a stateful LiveView process mounts on the server. User interactions are sent as events. The server updates assigns and re-renders, and thanks to compile-time change tracking in HEEx it sends only the changed dynamic values. The client applies them to the DOM with morphdom.

</details>

<details>
<summary>Why is mount called twice, and what are the implications?</summary>

Once for the initial HTTP render (disconnected, no WebSocket) and once when the WebSocket connects (a new stateful process). Expensive work and side effects such as PubSub subscriptions and timers should be guarded with `connected?(socket)`, or moved to `assign_async`, to avoid doing them twice or doing them in a process that will exit immediately.

</details>

<details>
<summary>patch vs navigate vs href?</summary>

`patch` updates the URL and calls `handle_params` in the **same** LiveView process, with minimal re-render. Use it for filters, pagination and modals. `navigate` moves to a **different** LiveView over the existing WebSocket without a full page reload, mounting a new process (it must be in the same `live_session`). `href` does a full HTTP page load.

</details>

<details>
<summary>What are the downsides of LiveView?</summary>

It needs a persistent connection, so latency affects interactions. Use client-side JS (`JS` commands, hooks) for instant UI feedback like toggles and animations. There's server memory per connected user (keep assigns small, use streams). Offline support is poor. Very interaction-heavy UIs such as drawing tools or rich editors still need JS. Reconnects rebuild state, so it must be recoverable from the URL or DB.

</details>
