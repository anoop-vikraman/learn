# 06 · Channels, PubSub and Presence

Real-time features are why many companies pick Phoenix. Each WebSocket connection is a cheap BEAM process, which is how Phoenix handled **2 million concurrent WebSocket connections on one server** in a well-known 2015 benchmark.

## 1. Phoenix.PubSub: the backbone

> **In short:** PubSub lets any process **subscribe** to a topic (a string) and any process **broadcast** to it. It works across all nodes in a cluster.

```elixir
# application.ex already has: {Phoenix.PubSub, name: MyApp.PubSub}

Phoenix.PubSub.subscribe(MyApp.PubSub, "tasks:user:42")

Phoenix.PubSub.broadcast(MyApp.PubSub, "tasks:user:42", {:task_created, task})

# The subscriber receives a plain message, so in a GenServer or LiveView:
def handle_info({:task_created, task}, state), do: ...
```

Put broadcasting in the **context** so every caller (API, LiveView, job) triggers it:

```elixir
defmodule MyApp.Tasks do
  @pubsub MyApp.PubSub

  def subscribe(user_id), do: Phoenix.PubSub.subscribe(@pubsub, topic(user_id))
  defp topic(user_id), do: "tasks:user:#{user_id}"

  def create_task(user_id, attrs) do
    with {:ok, task} <- %Task{user_id: user_id} |> Task.changeset(attrs) |> Repo.insert() do
      Phoenix.PubSub.broadcast(@pubsub, topic(user_id), {:task_created, task})
      {:ok, task}
    end
  end
end
```

`broadcast_from/4` excludes the sender. `local_broadcast/3` stays on the current node.

**You'll use PubSub most with LiveView** (next folder). Channels, below, are for custom clients such as React, mobile apps and games.

## 2. Channels: WebSockets for any client

> **In short:** A **Socket** is one WebSocket connection per client. Over it, the client **joins Channels** by topic (`"room:lobby"`). Each joined channel is its own process that handles events in both directions.

```
Browser/mobile ──WebSocket──▶ UserSocket (authenticates in connect/3)
                                 ├── RoomChannel process for "room:lobby"
                                 ├── RoomChannel process for "room:elixir"
                                 └── NotificationChannel for "user:42"
```

```bash
mix phx.gen.socket User
mix phx.gen.channel Room
```

### The socket: authentication

```elixir
# endpoint.ex
socket "/socket", MyAppWeb.UserSocket, websocket: true, longpoll: false

defmodule MyAppWeb.UserSocket do
  use Phoenix.Socket

  channel "room:*", MyAppWeb.RoomChannel

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) do
    # the token was generated server-side with Phoenix.Token.sign(conn, "user socket", user.id)
    case Phoenix.Token.verify(socket, "user socket", token, max_age: 86_400) do
      {:ok, user_id} -> {:ok, assign(socket, :user_id, user_id)}
      {:error, _} -> :error
    end
  end

  def connect(_params, _socket, _info), do: :error

  @impl true
  def id(socket), do: "users_socket:#{socket.assigns.user_id}"
  # lets you disconnect all of a user's sockets:
  # MyAppWeb.Endpoint.broadcast("users_socket:42", "disconnect", %{})
end
```

### The channel

```elixir
defmodule MyAppWeb.RoomChannel do
  use MyAppWeb, :channel

  @impl true
  def join("room:" <> room_id, _payload, socket) do
    if authorized?(socket.assigns.user_id, room_id) do
      send(self(), :after_join)
      {:ok, assign(socket, :room_id, room_id)}
    else
      {:error, %{reason: "unauthorized"}}
    end
  end

  @impl true
  def handle_info(:after_join, socket) do
    push(socket, "history", %{messages: MyApp.Chat.recent(socket.assigns.room_id)})
    {:noreply, socket}
  end

  # client → server event
  @impl true
  def handle_in("new_msg", %{"body" => body}, socket) do
    {:ok, msg} = MyApp.Chat.create_message(socket.assigns.room_id, socket.assigns.user_id, body)
    broadcast!(socket, "new_msg", %{id: msg.id, body: msg.body, user_id: msg.user_id})
    {:reply, :ok, socket}               # or {:noreply, socket}
  end

  defp authorized?(_user_id, _room_id), do: true
end
```

| Function | Sends to |
| --- | --- |
| `push(socket, event, payload)` | This client only |
| `broadcast!(socket, event, payload)` | Everyone on this topic (including the sender) |
| `broadcast_from!(socket, ...)` | Everyone except the sender |
| `{:reply, {:ok, payload}, socket}` | Reply to this specific client message |
| `MyAppWeb.Endpoint.broadcast(topic, event, payload)` | From anywhere (a context, a job) |

### The JS client (React example)

```js
// npm i phoenix
import { Socket } from "phoenix"

const socket = new Socket("ws://localhost:4000/socket", { params: { token: window.userToken } })
socket.connect()

const channel = socket.channel("room:lobby", {})
channel.join()
  .receive("ok", () => console.log("joined"))
  .receive("error", (resp) => console.log("failed", resp))

channel.on("new_msg", (msg) => setMessages((m) => [...m, msg]))

channel.push("new_msg", { body: "hello" })
  .receive("ok", () => {})
  .receive("timeout", () => console.warn("slow network"))
```

The client handles reconnection with backoff, rejoining channels, and heartbeats. There's also a Swift and a Kotlin client for mobile.

## 3. Presence: who's online

> **In short:** `Phoenix.Presence` tracks which users are connected to a topic, across all nodes, using a **CRDT**. There's no single point of failure, and it handles nodes joining and leaving.

```bash
mix phx.gen.presence
# then add MyAppWeb.Presence to application.ex children (after PubSub)
```

```elixir
# in the channel, after join
def handle_info(:after_join, socket) do
  {:ok, _} =
    MyAppWeb.Presence.track(socket, socket.assigns.user_id, %{
      online_at: System.system_time(:second),
      typing: false
    })

  push(socket, "presence_state", MyAppWeb.Presence.list(socket))
  {:noreply, socket}
end
```

Clients get `presence_state` (the full list) and then `presence_diff` events (joins and leaves). The JS `Presence` helper merges them:

```js
import { Presence } from "phoenix"
const presence = new Presence(channel)
presence.onSync(() => setOnline(presence.list((id, { metas }) => ({ id, count: metas.length }))))
```

When a channel process dies (the user closes the tab), Presence notices through a **monitor** and broadcasts the leave automatically. A user with 2 tabs open has 2 "metas" under the same key.

Presence works with LiveView too (track the LiveView process, then subscribe to the topic).

## 4. Channels vs LiveView: when to use which

| Use Channels when… | Use LiveView when… |
| --- | --- |
| The client is a React/Vue SPA, a mobile app, a game or IoT | The UI is rendered by Phoenix |
| You need a custom real-time protocol | You want real-time UI without writing a JS state layer |
| Offline-first or heavy client-side logic | Forms, dashboards, CRUD, admin, collaboration features |

Both are built on the same `Phoenix.Socket` and PubSub. LiveView *is* a channel underneath.

## 5. Scaling notes

- Each connection = one process (~a few KB). Memory per connection, not CPU, is usually the limit.
- Multi-node: PubSub broadcasts across the cluster automatically (via distributed Erlang, or the Redis adapter if nodes can't connect).
- Behind a load balancer, WebSockets need sticky sessions only if you use long-polling. Pure WebSockets don't.
- Watch for huge broadcast payloads: send IDs or diffs, not whole datasets.
- Use **fastlane** (built in): broadcasts are encoded once and sent directly to each socket, without going through every channel process.

## Exercises

1. Build a chat room with a Channel and a plain HTML/JS client (or a Vite React app).
2. Authenticate the socket with `Phoenix.Token` generated in a controller and rendered into the page.
3. Add Presence and show an online user list.
4. Broadcast from IEx with `MyAppWeb.Endpoint.broadcast("room:lobby", "new_msg", %{body: "from server"})` and watch the clients update.
5. Explain out loud why a Phoenix server can hold so many more WebSocket connections than a typical Node server per GB of RAM, and when that claim doesn't hold.

## Interview questions

<details>
<summary>How do Phoenix Channels work?</summary>

A client opens one WebSocket (or long-poll) connection to a `Phoenix.Socket`, which authenticates it in `connect/3`. Over that socket the client joins any number of topics. Each join spawns a lightweight channel process that handles `join/3`, incoming events (`handle_in/3`), and pushes or broadcasts to clients. Broadcasting goes through Phoenix.PubSub, so it reaches subscribers on every node in the cluster.

</details>

<details>
<summary>What is Phoenix.PubSub and how does it scale across nodes?</summary>

A distributed publish/subscribe system: processes subscribe to string topics, and broadcasts deliver messages to every subscriber. The default adapter uses distributed Erlang (`:pg` process groups), so a broadcast on one node is forwarded to the other nodes, which deliver locally. A Redis adapter exists for environments where nodes can't be clustered.

</details>

<details>
<summary>How does Phoenix Presence work?</summary>

It tracks processes (and their metadata) per topic using a CRDT replicated across the nodes in a cluster, so there's no central server, and conflicts resolve automatically. It monitors tracked processes, so when one dies (the user disconnects) the leave is broadcast. Clients get an initial `presence_state` and then `presence_diff` events.

</details>

<details>
<summary>How do you authenticate a WebSocket in Phoenix?</summary>

Generate a signed token server-side (`Phoenix.Token.sign/3`) for the logged-in user, give it to the client (rendered in the page or returned by an API), and pass it as a socket param. `UserSocket.connect/3` verifies it with `Phoenix.Token.verify/4` and a `max_age`, and assigns the user id. Per-topic authorization happens in the channel's `join/3`. For LiveView, the session cookie is used automatically, plus `on_mount` hooks.

</details>
