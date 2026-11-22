# 04 · Phoenix LiveView

LiveView gives you rich, real-time UI **without writing a JavaScript front end**. State lives on the server in a process, and the browser receives minimal HTML diffs over a WebSocket.

| # | Lesson | Level | You will learn |
| --- | --- | --- | --- |
| 01 | [LiveView basics](01-liveview-basics.md) | Intermediate | How it works, lifecycle (`mount` runs twice), assigns, events, `handle_params`, live navigation, async data |
| 02 | [Components and forms](02-components-and-forms.md) | Intermediate | Function components (`attr`, `slot`), core components, live components, forms with changesets and live validation |
| 03 | [Streams, real-time, uploads and JS](03-streams-pubsub-uploads-hooks.md) | Pro | Streams for large lists, PubSub real-time updates, Presence, file uploads, `JS` commands, client hooks, testing |
| 04 | [LiveView advanced](04-liveview-advanced.md) | Pro | `live_session`, custom `on_mount` and `attach_hook`, `assign_async`/`start_async`, loading states and optimistic UI, nested and sticky LiveViews, memory at scale, crashes, reconnects and form recovery, security, performance, latency simulation |

**React developer's mental model:**

| React | LiveView |
| --- | --- |
| Component state (`useState`) | `socket.assigns` (on the server) |
| `setState` | `assign(socket, key, value)` |
| `onClick={handler}` | `phx-click="event_name"` → `handle_event/3` |
| `useEffect(() => fetch…, [])` | `mount/3` (+ `assign_async`) |
| Router params | `handle_params/3` |
| Props | Function component `attr` |
| Children / render props | Slots |
| Context / global store | Assigns via `on_mount`, PubSub |
| Virtual DOM diff on the client | Diff computed **on the server**, applied by morphdom on the client |
| WebSocket + manual cache sync | Built in: `handle_info` + PubSub |
