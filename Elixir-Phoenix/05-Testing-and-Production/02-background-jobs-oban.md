# 02 · Background jobs with Oban

> **Plain English:** Some work shouldn't make the user wait: sending emails, generating reports, calling slow APIs. Oban is a to-do list kept in your database. Jobs are written down first, so they survive crashes and restarts, are retried if they fail, and can be scheduled for later or run on a timetable.

## 1. Why Oban (and not just a Task)?

> **In short:** Oban stores jobs in **Postgres**, so they survive restarts and deploys, retry with backoff, run once across a cluster, and can be scheduled. It's the standard choice in Elixir, like BullMQ or Celery but without Redis.

| | `Task.Supervisor.start_child` | Oban |
| --- | --- | --- |
| Survives a restart/deploy | ❌ | ✅ (stored in the DB) |
| Retries with backoff | ❌ | ✅ |
| Scheduling / cron | ❌ | ✅ |
| Uniqueness / dedup | ❌ | ✅ |
| Transactional enqueue (with your data) | ❌ | ✅ (same DB, same transaction) |
| Observability | ❌ | Oban Web dashboard, telemetry |

Use Oban for emails, webhooks, payment processing, reports, imports, cleanup and anything that must eventually happen.

## 2. Setup

```elixir
# mix.exs
{:oban, "~> 2.19"}
```

```bash
mix deps.get
mix igniter.install oban     # or set up manually as below
```

Manual setup:

```bash
mix ecto.gen.migration add_oban_jobs_table
```

```elixir
defmodule MyApp.Repo.Migrations.AddObanJobsTable do
  use Ecto.Migration
  def up, do: Oban.Migration.up(version: 12)
  def down, do: Oban.Migration.down(version: 1)
end
```

```elixir
# config/config.exs
config :my_app, Oban,
  engine: Oban.Engines.Basic,
  repo: MyApp.Repo,
  queues: [default: 10, mailers: 20, reports: 2],     # queue name: concurrency
  plugins: [
    {Oban.Plugins.Pruner, max_age: 60 * 60 * 24 * 7},  # delete old completed jobs
    {Oban.Plugins.Cron,
     crontab: [
       {"0 8 * * *", MyApp.Workers.DailyDigest},        # every day at 08:00 UTC
       {"*/15 * * * *", MyApp.Workers.MarkOverdue}
     ]}
  ]

# config/test.exs
config :my_app, Oban, testing: :manual       # don't run jobs automatically in tests
```

```elixir
# application.ex children, after the Repo:
{Oban, Application.fetch_env!(:my_app, Oban)}
```

## 3. A worker

> **In short:** A worker module implements `perform/1`, which receives an `%Oban.Job{}` with `args` (a JSON map with **string keys**). Return `:ok` / `{:ok, _}` for success, `{:error, reason}` to retry, `{:cancel, reason}` to stop, or `{:snooze, seconds}` to try again later.

```elixir
defmodule MyApp.Workers.TaskReminder do
  use Oban.Worker,
    queue: :mailers,
    max_attempts: 5,
    unique: [period: 300, keys: [:task_id]]      # no duplicate reminders within 5 minutes

  alias MyApp.{Tasks, Mailer}

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"task_id" => task_id}}) do
    case Tasks.get_task(task_id) do
      nil -> {:cancel, :task_deleted}
      %{done: true} -> :ok
      task ->
        task |> MyApp.Emails.reminder() |> Mailer.deliver()
        :ok
    end
  end
end
```

Enqueue:

```elixir
%{task_id: task.id}
|> MyApp.Workers.TaskReminder.new()
|> Oban.insert()

# scheduled for later
%{task_id: task.id}
|> MyApp.Workers.TaskReminder.new(scheduled_at: DateTime.add(task.due_at, -3600))
|> Oban.insert()

# or: new(args, schedule_in: 60 * 60)
```

Args are stored as JSON, so pass **ids, not structs**, and expect string keys in `perform`.

## 4. Transactional enqueue: a key selling point

> **In short:** Because jobs live in the same Postgres database, you can insert a record **and** its job in one transaction. Either both happen or neither does.

```elixir
Ecto.Multi.new()
|> Ecto.Multi.insert(:user, User.registration_changeset(%User{}, attrs))
|> Oban.insert(:welcome_email, fn %{user: user} -> MyApp.Workers.WelcomeEmail.new(%{user_id: user.id}) end)
|> Repo.transaction()
```

With Redis-based queues you'd risk "user created but email job lost" or "job runs before the user row is committed".

## 5. Retries, errors and timeouts

- A raised exception or `{:error, _}` → retried with exponential backoff (with jitter), up to `max_attempts`.
- Customise with `@impl Oban.Worker def backoff(%Oban.Job{attempt: n}), do: n * 30`.
- `timeout/1` callback: kill jobs that run too long.
- Jobs that exhaust their attempts become `discarded`. Monitor them via telemetry or **Oban Web**.
- Make jobs **idempotent**: a job might run more than once (for example, if the node crashes after the work but before the job is marked complete).

## 6. Testing jobs

```elixir
use Oban.Testing, repo: MyApp.Repo

test "enqueues a reminder" do
  {:ok, task} = Tasks.create_task(scope, %{title: "x", remind: true})
  assert_enqueued worker: MyApp.Workers.TaskReminder, args: %{task_id: task.id}
end

test "worker sends email" do
  task = task_fixture(scope)
  assert :ok = perform_job(MyApp.Workers.TaskReminder, %{task_id: task.id})
end
```

## 7. Alternatives you should know

| Option | When |
| --- | --- |
| **Oban** | The default for Phoenix + Postgres |
| `Task.Supervisor` | Fire-and-forget, OK to lose |
| **Broadway** | High-throughput consumers from SQS, Kafka or RabbitMQ (data pipelines) |
| **GenStage** | Building custom back-pressured pipelines (Broadway is built on it) |
| Quantum | Cron-like scheduling inside the app, in memory, without a DB |

## Exercises

1. Add Oban to your trial project. Create a `TaskReminder` worker and enqueue it when a task with a due date is created.
2. Add a cron job `MarkOverdue` that runs every 15 minutes and broadcasts updates over PubSub, so open LiveViews update.
3. Test with `assert_enqueued` and `perform_job`.
4. Make a worker fail on purpose and look at the retries in the `oban_jobs` table.

## Interview questions

<details>
<summary>Why use Oban rather than spawning a Task for background work?</summary>

Tasks live in memory, so they're lost on a crash, restart or deploy, with no retries, scheduling or visibility. Oban persists jobs in Postgres, retries failures with backoff, supports scheduled and cron jobs, uniqueness, queues with concurrency limits, and runs jobs exactly once across a cluster. Because it uses the same database, jobs can be enqueued transactionally with business data.

</details>

<details>
<summary>What makes a good background job?</summary>

It's idempotent, so it's safe to run more than once. Its args are small and serializable (pass ids, not structs). It reloads fresh data in `perform`. It returns accurate results (`:ok`, `{:error, _}` to retry, `{:cancel, _}` when retrying is pointless). It has sensible `max_attempts` and timeouts, and it's observable through telemetry.

</details>
