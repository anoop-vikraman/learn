# 06 · Trial project: TaskMate (a real-time team task board)

A step-by-step build that uses everything in folders 01–05. Each step lists **what to do**, **what to learn from it**, and a **checkpoint**. Commit after every step, so the git history tells the story in your interview.

> If the company gives you its own trial brief, still follow this order: generate → schema → context → web → auth → real-time → jobs → tests → deploy. Swap "tasks" for their domain.

## What you're building

- Users sign up and log in (magic link and password).
- Users create **boards**, and each board has **tasks** (title, description, status `todo | doing | done`, priority, due date, assignee).
- The board page is a **LiveView**: create, edit and move tasks between columns. **Everyone viewing the same board sees changes instantly**, plus "who's online".
- A **JSON API** (`/api/boards/:id/tasks`) with token auth, for a hypothetical mobile app.
- An **Oban** job that sends due-date reminders, and a cron job that flags overdue tasks.
- Tests, CI, Docker and deployment.

**Why this project impresses:** it shows Elixir's three strengths (real-time with LiveView + PubSub + Presence, fault-tolerant background work with Oban/OTP, and a clean domain design with contexts) in a small codebase.

---

## Step 1: Generate the app (30 min)

```bash
mix phx.new task_mate
cd task_mate
mix setup
git init && git add . && git commit -m "chore: generate Phoenix app"
iex -S mix phx.server
```

**Learn:** the folder structure ([03-Phoenix/01](../03-Phoenix/01-setup-and-project-structure.md)), and `application.ex` as the supervision tree.
**Checkpoint:** localhost:4000 and /dev/dashboard work.

## Step 2: Authentication (30 min)

```bash
mix phx.gen.auth Accounts User users
mix deps.get && mix ecto.migrate
mix test
```

**Learn:** [03-Phoenix/05](../03-Phoenix/05-authentication.md): tokens, `current_scope`, `live_session` and `on_mount`.
**Checkpoint:** register and log in via the magic link at /dev/mailbox. Commit.

## Step 3: Boards and tasks: schema, migrations, context (2–3 h)

Generate after auth so that the context functions are **scoped**:

```bash
mix phx.gen.live Boards Board boards name:string
mix phx.gen.context Boards Task tasks title:string description:text \
  status:enum:todo:doing:done priority:enum:low:medium:high due_on:date \
  board_id:references:boards assignee_id:references:users
```

Then edit by hand:
- `Board` `has_many :tasks`, and `Task` `belongs_to :board` / `belongs_to :assignee, User`.
- Task changeset: `validate_required([:title, :status])`, `validate_length(:title, min: 2, max: 120)`, `foreign_key_constraint(:board_id)`.
- Add context functions with domain names:

```elixir
def list_tasks_by_status(%Scope{} = scope, board_id) do
  board = get_board!(scope, board_id)

  Task
  |> where(board_id: ^board.id)
  |> order_by([t], asc: t.position, asc: t.inserted_at)
  |> preload(:assignee)
  |> Repo.all()
  |> Enum.group_by(& &1.status)
end

def move_task(%Scope{} = scope, %Task{} = task, new_status) when new_status in [:todo, :doing, :done] do
  update_task(scope, task, %{status: new_status})
end
```

(Optional: add an integer `position` column for ordering within a column.)

Seed data in `priv/repo/seeds.exs`: one demo user, 2 boards, 15 tasks.

**Learn:** [03-Phoenix/03](../03-Phoenix/03-ecto.md) changesets, queries and preload, [03-Phoenix/04](../03-Phoenix/04-contexts-and-json-api.md) contexts, and [03-Phoenix/08](../03-Phoenix/08-ecto-advanced.md) for tags (many-to-many), search filters (`dynamic/2`) and `optimistic_lock` on tasks.
**Checkpoint:** in IEx, create a board and tasks through the context, and confirm another user's scope can't fetch them. Commit.

> **Multi-user boards (stretch goal):** add a `board_members` join table so several users can share a board, and change the scope checks from "owner" to "member". This is a great talking point about authorization.

## Step 4: The board LiveView (3–4 h)

Create `lib/task_mate_web/live/board_live/show.ex` with route `live "/boards/:id", BoardLive.Show, :show` inside the authenticated `live_session`.

```elixir
defmodule TaskMateWeb.BoardLive.Show do
  use TaskMateWeb, :live_view
  alias TaskMate.Boards

  @statuses [:todo, :doing, :done]

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    scope = socket.assigns.current_scope
    board = Boards.get_board!(scope, id)
    grouped = Boards.list_tasks_by_status(scope, board.id)

    socket =
      socket
      |> assign(board: board, page_title: board.name, statuses: @statuses)
      |> assign(form: to_form(Boards.change_task(scope, %Boards.Task{})))

    socket =
      Enum.reduce(@statuses, socket, fn status, acc ->
        stream(acc, status, Map.get(grouped, status, []))
      end)

    {:ok, socket}
  end

  @impl true
  def handle_event("create", %{"task" => params}, socket) do
    params = Map.merge(params, %{"board_id" => socket.assigns.board.id, "status" => "todo"})

    case Boards.create_task(socket.assigns.current_scope, params) do
      {:ok, task} ->
        {:noreply,
         socket
         |> stream_insert(:todo, task)
         |> assign(form: to_form(Boards.change_task(socket.assigns.current_scope, %Boards.Task{})))}

      {:error, changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  def handle_event("move", %{"id" => id, "to" => to}, socket) do
    scope = socket.assigns.current_scope
    task = Boards.get_task!(scope, id)
    {:ok, moved} = Boards.move_task(scope, task, String.to_existing_atom(to))

    {:noreply,
     socket
     |> stream_delete(task.status, task)
     |> stream_insert(moved.status, moved)}
  end
end
```

Template idea (three columns):

```heex
<Layouts.app flash={@flash} current_scope={@current_scope}>
  <.header>{@board.name}</.header>

  <.form for={@form} id="new-task" phx-submit="create" class="flex gap-2">
    <.input field={@form[:title]} placeholder="New task…" />
    <.button>Add</.button>
  </.form>

  <div class="grid grid-cols-3 gap-4 mt-6">
    <section :for={status <- @statuses} class="bg-base-200 rounded p-3">
      <h2 class="font-semibold uppercase">{status}</h2>
      <ul id={"col-#{status}"} phx-update="stream" class="space-y-2">
        <li :for={{dom_id, task} <- @streams[status]} id={dom_id} class="card bg-base-100 p-2">
          <span>{task.title}</span>
          <div class="flex gap-1 text-xs">
            <button :for={to <- @statuses -- [status]} phx-click="move"
                    phx-value-id={task.id} phx-value-to={to} class="btn btn-xs">→ {to}</button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</Layouts.app>
```

> `String.to_existing_atom` is safe here because `:todo`, `:doing` and `:done` already exist, and the context guard `when new_status in [...]` rejects anything else. Mention this in the interview.

**Stretch:** drag and drop with a JS hook using SortableJS that calls `pushEvent("move", {id, to})` ([03-Phoenix/07](../03-Phoenix/07-heex-assets-layouts-i18n.md) shows how to install npm packages). Add a board stats panel with `assign_async` and optimistic "toggle done" ([04-LiveView/04](../04-LiveView/04-liveview-advanced.md)).

**Learn:** [04-LiveView/01](../04-LiveView/01-liveview-basics.md), [02](../04-LiveView/02-components-and-forms.md) and [03](../04-LiveView/03-streams-pubsub-uploads-hooks.md) on streams.
**Checkpoint:** create and move tasks without page reloads. Commit.

## Step 5: Real-time sync + presence (1–2 h)

1. In the `Boards` context, broadcast to `"board:#{board_id}"` after create, update, move and delete:

```elixir
def subscribe_board(board_id), do: Phoenix.PubSub.subscribe(TaskMate.PubSub, "board:#{board_id}")
defp broadcast_board(%Task{board_id: id} = task, event),
  do: Phoenix.PubSub.broadcast(TaskMate.PubSub, "board:#{id}", {event, task})
```

2. In `mount`, `if connected?(socket), do: Boards.subscribe_board(board.id)`.
3. Add `handle_info({:task_created, task}, socket)` and similar handlers that call `stream_insert`/`stream_delete`. Now remove the stream updates from `handle_event`, so both the acting user and everyone else update through the same broadcast path (one code path).
4. `mix phx.gen.presence`, add `TaskMateWeb.Presence` to `application.ex`, track the user in `mount`, and show the avatars of people viewing.

**Checkpoint:** two browsers (one normal, one incognito with a second user who is a member) see each other's changes and presence instantly. **Record a 30-second screen capture for the interview.** Commit.

## Step 6: JSON API with token auth (2 h)

- Add `Accounts.create_api_token/1` and `fetch_user_by_api_token/1` (reuse `UserToken` with context `"api-token"`).
- Add the `ApiAuth` plug ([03-Phoenix/05](../03-Phoenix/05-authentication.md) §6) and an `:api_auth` pipeline.
- `TaskMateWeb.Api.TaskController` with `index`, `create`, `update` and `delete` under `/api/boards/:board_id/tasks`, using `action_fallback` and a `TaskJSON` view.
- API writes go through the same context, so **LiveView users see API changes in real time for free**. Demo this!

**Checkpoint:** create a task with `curl` and watch it appear in the open browser. Commit.

## Step 7: A small GenServer, to show OTP knowledge (1 h)

Pick one:
- **Board activity counter:** a GenServer (or ETS table) counting actions per board in the last hour, shown on the board page.
- **API rate limiter:** an ETS-based limiter plug for `/api` ([02-OTP/04](../02-OTP-Concurrency/04-tasks-agents-registry-ets.md)).

Add it to the supervision tree, and be ready to explain why you chose ETS or a GenServer, and what happens when it crashes.

## Step 8: Background jobs with Oban (1–2 h)

- Add Oban ([05/02](../05-Testing-and-Production/02-background-jobs-oban.md)).
- `DueReminder` worker: when a task with `due_on` is created, schedule an email for 9:00 on the due date (`unique` by task_id).
- `MarkOverdue` cron worker every 15 minutes: find tasks past due that aren't done, set an `overdue` flag, and broadcast, so boards highlight them live.
- Enqueue jobs inside the same transaction as the task insert (`Ecto.Multi` + `Oban.insert/3`).

**Checkpoint:** see emails in /dev/mailbox and overdue tasks turn red live. Commit.

## Step 9: Tests (2–3 h)

- Context tests: CRUD, scope isolation, move, broadcasts (`assert_receive`).
- LiveView tests: create a task, move a task, receive a broadcast from another "user".
- API tests: 201, 401, 404 for another user's board, 422.
- Oban tests: `assert_enqueued`, `perform_job`.
- Run `mix test --cover` and `mix precommit`.

## Step 10: Production readiness (2 h)

- `mix phx.gen.release --docker`, plus a `docker-compose.yml` for local prod-like runs.
- GitHub Actions CI ([05/03](../05-Testing-and-Production/03-releases-docker-deploy.md) §6).
- Deploy to Fly.io with `release_command` migrations.
- Add `/health`, LiveDashboard behind admin auth, and `credo` + `sobelow`.
- Go through the [security checklist](../05-Testing-and-Production/05-security.md): scoped queries everywhere, authorization in every `handle_event`, rate-limited login, `force_ssl`, `check_origin`.
- Optional: send emails via Oban ([03-Phoenix/09](../03-Phoenix/09-sessions-cookies-emails-uploads.md)) and add a signed board-invite link with `Phoenix.Token`.

## Step 11: README and demo script (1 h)

Your project README should include:
1. One-paragraph pitch plus a screenshot or GIF.
2. **Setup**: `mix setup && mix phx.server`, with seed credentials.
3. **Architecture**: contexts (`Accounts`, `Boards`), the supervision tree (list the children and why), and the real-time flow diagram:

```
LiveView A ──event──▶ Boards.move_task ──▶ Repo.update ──▶ PubSub "board:42"
                                                              │
                         LiveView A ◀──{:task_moved}──────────┤
                         LiveView B ◀──{:task_moved}──────────┤
                         API client ─(curl)─▶ same context ───┘
```

4. **Decisions and trade-offs**: LiveView vs React SPA, streams vs assigns, Oban vs Task, ETS vs GenServer, scopes for authorization.
5. **What I'd do next**: board member invitations, drag-and-drop ordering with `position`, optimistic UI with JS commands, S3 uploads, multi-node clustering.

**5-minute demo script:**
1. (30 s) What it is and the stack.
2. (90 s) Two browsers side by side: create and move tasks, show presence.
3. (45 s) `curl` the API and watch the board update.
4. (60 s) Code tour: context → LiveView → PubSub broadcast.
5. (45 s) Supervision tree + Oban job + kill a process in IEx and watch it restart.
6. (30 s) Tests + CI + deployment.

---

## Rough time budget

| Steps | Hours |
| --- | --- |
| 1–3 | 4 |
| 4–5 | 6 |
| 6–8 | 5 |
| 9–11 | 6 |
| **Total** | **~21 h** (spread over weeks 2–4) |
