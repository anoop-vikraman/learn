# 03 · Ecto: database, schemas, changesets, queries

Ecto is **not** an ORM. There are no objects that save themselves (`user.save()`). It's made of four separate parts: **Repo** (talks to the DB), **Schema** (maps tables to structs), **Changeset** (validates and tracks changes) and **Query** (composable SQL DSL).

## 1. Repo: all DB access goes through it

> **In short:** `MyApp.Repo` is the only module that touches the database. Schemas and queries are just data until you pass them to the Repo.

```elixir
Repo.all(Task)                       # SELECT * FROM tasks
Repo.get(Task, 1)                    # %Task{} or nil
Repo.get!(Task, 1)                   # %Task{} or raises
Repo.get_by(User, email: "a@b.com")
Repo.one(query)                      # exactly one or nil (raises if more than one)
Repo.insert(changeset)               # {:ok, struct} | {:error, changeset}
Repo.update(changeset)
Repo.delete(struct)
Repo.insert_all(Task, [%{title: "a", inserted_at: now, updated_at: now}])   # bulk, no changesets
Repo.update_all(query, set: [done: true])
Repo.delete_all(query)
Repo.aggregate(Task, :count)
Repo.exists?(query)
Repo.preload(task, :user)
```

Compare Prisma: `prisma.task.findMany()` ≈ `Repo.all(Task)`.

## 2. Migrations

> **In short:** Migrations are Elixir modules in `priv/repo/migrations/` that describe schema changes. `mix ecto.migrate` runs them.

```bash
mix ecto.gen.migration create_tasks
```

```elixir
defmodule MyApp.Repo.Migrations.CreateTasks do
  use Ecto.Migration

  def change do
    create table(:tasks) do
      add :title, :string, null: false
      add :description, :text
      add :done, :boolean, default: false, null: false
      add :priority, :string, default: "medium"
      add :due_on, :date
      add :user_id, references(:users, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime)      # inserted_at, updated_at
    end

    create index(:tasks, [:user_id])
    create unique_index(:tasks, [:user_id, :title])
  end
end
```

`change/0` is reversible automatically. For changes Ecto can't reverse (raw SQL, data migrations), write `up/0` and `down/0`. Other operations: `alter table(:tasks) do add/modify/remove ... end`, `rename`, `drop`, `execute "SQL"`.

## 3. Schemas

> **In short:** A schema maps a table to an Elixir struct and declares fields and associations.

```elixir
defmodule MyApp.Tasks.Task do
  use Ecto.Schema
  import Ecto.Changeset

  schema "tasks" do
    field :title, :string
    field :description, :string
    field :done, :boolean, default: false
    field :priority, Ecto.Enum, values: [:low, :medium, :high], default: :medium
    field :due_on, :date
    field :tag_count, :integer, virtual: true     # not stored in the DB

    belongs_to :user, MyApp.Accounts.User
    has_many :comments, MyApp.Tasks.Comment
    many_to_many :tags, MyApp.Tasks.Tag, join_through: "tasks_tags"

    timestamps(type: :utc_datetime)
  end
end
```

`%Task{}` is a plain struct. Associations that haven't been loaded show as `#Ecto.Association.NotLoaded<...>`. There's no lazy loading: you **must** preload explicitly (section 7). That deliberately prevents hidden N+1 queries.

## 4. Changesets: validation and change tracking

> **In short:** A changeset takes existing data plus untrusted params, **casts** only the allowed fields, runs validations, and records errors. The Repo only writes valid changesets.

```elixir
def changeset(task, attrs) do
  task
  |> cast(attrs, [:title, :description, :done, :priority, :due_on])  # whitelist (prevents mass assignment)
  |> validate_required([:title])
  |> validate_length(:title, min: 3, max: 100)
  |> validate_inclusion(:priority, [:low, :medium, :high])
  |> validate_due_date_not_past()
  |> unique_constraint([:user_id, :title], message: "you already have a task with this title")
  |> foreign_key_constraint(:user_id)
end

defp validate_due_date_not_past(changeset) do
  validate_change(changeset, :due_on, fn :due_on, date ->
    if Date.compare(date, Date.utc_today()) == :lt,
      do: [due_on: "can't be in the past"],
      else: []
  end)
end
```

```elixir
cs = Task.changeset(%Task{}, %{"title" => "Hi", "done" => "true"})
cs.valid?        # false
cs.errors        # [title: {"should be at least %{count} character(s)", [count: 3, ...]}]
cs.changes       # %{title: "Hi", done: true}   ("true" was cast to a boolean)

Repo.insert(cs)  # {:error, %Ecto.Changeset{}}: the invalid changeset is never sent to the DB
```

Key ideas:
- **`cast/3`** converts types (string `"true"` → `true`) and ignores fields that aren't listed, which is your protection against users setting `admin: true`.
- **`validate_*`** run in memory, before the DB.
- **`*_constraint`** functions don't check anything up front. They turn a **DB constraint error** (unique index, foreign key) into a friendly changeset error instead of a crash. You need the actual index or constraint in the migration.
- You can have **several changesets per schema**: `registration_changeset`, `password_changeset`, `admin_changeset`. Each one permits different fields.
- Changesets also power forms: `to_form(changeset)` gives Phoenix forms their values and errors.

Other useful functions: `put_change/3`, `get_field/2`, `get_change/2`, `add_error/3`, `validate_format(:email, ~r/@/)`, `validate_number(:age, greater_than: 0)`, `validate_confirmation(:password)`, `cast_assoc/3`, `put_assoc/3`.

## 5. Queries

> **In short:** `import Ecto.Query`, then build queries with `from` (keyword syntax) or pipes (macro syntax). They're composable, and values are interpolated safely with `^`.

```elixir
import Ecto.Query

# keyword syntax
query =
  from t in Task,
    where: t.user_id == ^user_id and t.done == false,
    order_by: [desc: t.inserted_at],
    limit: 20,
    select: %{id: t.id, title: t.title}

Repo.all(query)

# pipe (macro) syntax: great for building queries step by step
Task
|> where([t], t.user_id == ^user_id)
|> where([t], not t.done)
|> order_by([t], desc: t.inserted_at)
|> Repo.all()
```

The `^` (pin) marks a value as a **query parameter**, which makes it SQL-injection safe. Forgetting `^` is a compile error.

### Composable query functions (a very common pattern)

```elixir
defmodule MyApp.Tasks.TaskQuery do
  import Ecto.Query
  alias MyApp.Tasks.Task

  def base, do: from(t in Task, as: :task)
  def for_user(q, user_id), do: where(q, [task: t], t.user_id == ^user_id)
  def pending(q), do: where(q, [task: t], t.done == false)
  def search(q, nil), do: q
  def search(q, term), do: where(q, [task: t], ilike(t.title, ^"%#{term}%"))
  def newest_first(q), do: order_by(q, [task: t], desc: t.inserted_at)
end

TaskQuery.base()
|> TaskQuery.for_user(user.id)
|> TaskQuery.pending()
|> TaskQuery.search(params["q"])
|> TaskQuery.newest_first()
|> Repo.all()
```

### Joins, aggregates and grouping

```elixir
from u in User,
  join: t in assoc(u, :tasks),
  where: t.done == false,
  group_by: u.id,
  select: {u.email, count(t.id)},
  having: count(t.id) > 5

# fragment: raw SQL inside a query (still parameterised)
from t in Task, where: fragment("lower(?) = ?", t.title, ^String.downcase(title))
```

Use `Repo.all(query)`, then `IO.inspect` or check the logs in dev to see the generated SQL. `Ecto.Adapters.SQL.to_sql(:all, Repo, query)` shows it without running the query.

## 6. Associations: creating related data

```elixir
user = Repo.get!(User, 1)

# build_assoc sets the foreign key for you
user
|> Ecto.build_assoc(:tasks)
|> Task.changeset(%{title: "Buy milk"})
|> Repo.insert()

# nested params with cast_assoc (e.g. a form with task + comments)
|> cast_assoc(:comments, with: &Comment.changeset/2)
```

## 7. Preloading and the N+1 problem

> **In short:** Associations aren't loaded until you `preload` them. Preload up front to avoid one query per row.

```elixir
# N+1: 1 query for tasks + N queries for users
tasks = Repo.all(Task)
Enum.map(tasks, fn t -> Repo.preload(t, :user).user.email end)

# 2 queries total
tasks = Task |> Repo.all() |> Repo.preload(:user)

# preload inside the query
from(t in Task, preload: [:user, comments: :author]) |> Repo.all()

# 1 query, with a join (good when you also filter on the association)
from(t in Task, join: u in assoc(t, :user), where: u.active, preload: [user: u]) |> Repo.all()
```

## 8. Transactions

> **In short:** Wrap multiple writes so they all succeed or none do. Use `Repo.transact/2` (Ecto 3.13+), `Repo.transaction/1`, or `Ecto.Multi`.

```elixir
# Ecto 3.13+: Repo.transact. Return {:ok, _} to commit, {:error, _} to roll back
Repo.transact(fn ->
  with {:ok, order} <- create_order(attrs),
       {:ok, _} <- decrement_stock(order) do
    {:ok, order}
  end
end)

# Ecto.Multi: a named, inspectable sequence of operations
alias Ecto.Multi

Multi.new()
|> Multi.insert(:order, Order.changeset(%Order{}, attrs))
|> Multi.update(:product, fn %{order: order} -> Product.decrement_stock_changeset(order.product_id) end)
|> Multi.run(:payment, fn _repo, %{order: order} -> Payments.charge(order) end)
|> Repo.transaction()
# {:ok, %{order: ..., product: ..., payment: ...}}
# {:error, failed_step, failed_value, changes_so_far}
```

On older Ecto, `Repo.transaction(fn -> ... Repo.rollback(reason) end)` is the equivalent of `transact`.

## 9. Seeds

```elixir
# priv/repo/seeds.exs
alias MyApp.{Repo, Accounts, Tasks}
{:ok, user} = Accounts.register_user(%{email: "demo@example.com"})
for i <- 1..20, do: Tasks.create_task(user, %{title: "Task #{i}"})
```

Run with `mix run priv/repo/seeds.exs` (also part of `mix ecto.reset`).

## Exercises

1. Generate a `Project` schema with `has_many :tasks`, and add `belongs_to :project` to Task (a migration with `references`).
2. Write a changeset that requires `title`, limits its length to 3–100, and adds a unique constraint on `[:project_id, :title]`. Test it in IEx: insert duplicates and read `changeset.errors`.
3. Write composable query functions: `for_project/2`, `overdue/1` (due_on < today and not done) and `search/2`.
4. Load 10 tasks with their project, first with N+1 and then with preload. Count the queries in the dev log.
5. Use `Ecto.Multi` to create a project and 3 default tasks atomically.

## Interview questions

<details>
<summary>Why isn't Ecto an ORM?</summary>

There's no object-relational mapping with stateful objects that know how to save themselves. Schemas are plain structs, changesets are plain data describing changes and validation, queries are data built with a DSL, and only the Repo talks to the DB. There's no lazy loading, no hidden callbacks firing on save, and no identity map. Everything is explicit, which makes behaviour predictable and testable.

</details>

<details>
<summary>What is a changeset?</summary>

A data structure that holds the original data, the cast params, the computed changes, validation errors and a `valid?` flag. You build it with `cast/3` (whitelist + type casting) and validation functions. Constraint functions map DB constraint violations to errors. The Repo only persists valid changesets. Changesets also back Phoenix forms, so validation errors display automatically.

</details>

<details>
<summary>What's the difference between validate_* and *_constraint?</summary>

`validate_*` functions run in Elixir **before** touching the database (required, length, format). `*_constraint` functions (`unique_constraint`, `foreign_key_constraint`, `check_constraint`) don't validate up front. They tell Ecto how to turn a **database** constraint violation into a changeset error instead of raising. Uniqueness can only be guaranteed by the DB (two concurrent inserts would both pass an in-memory check), so you need both the unique index and `unique_constraint`.

</details>

<details>
<summary>How do you avoid N+1 queries in Ecto?</summary>

Associations are never lazily loaded, so accessing one without loading it gives you `NotLoaded` instead of silently running a query. You preload explicitly: `Repo.preload(tasks, :user)` (one extra query per association), `preload:` in the query, or a `join` + `preload: [user: u]` to load in a single query. In GraphQL, use Dataloader.

</details>

<details>
<summary>How do you run several DB operations atomically?</summary>

Use `Repo.transact/2` (or `Repo.transaction/1` with `Repo.rollback/1`), or `Ecto.Multi`, which builds a named sequence of inserts, updates and arbitrary `run` steps, executed in one transaction. On failure it reports which step failed and the changes made so far.

</details>
