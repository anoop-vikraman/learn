# 05 · Control flow

Elixir has no `for` loops in the JS sense, no `while`, no `return`, and no `break`. Everything is an **expression** that returns a value.

## 1. `case`: match a value against patterns

> **In short:** Use `case` most often, whenever you branch on the **shape** of a value.

```elixir
case HTTP.get(url) do
  {:ok, %{status: 200, body: body}} -> {:ok, body}
  {:ok, %{status: 404}} -> {:error, :not_found}
  {:ok, %{status: status}} when status >= 500 -> {:error, :server_error}
  {:error, reason} -> {:error, reason}
end
```

If no clause matches you get a `CaseClauseError`, which is often what you want ("let it crash" on truly unexpected input).

## 2. `cond`: the first true condition wins

> **In short:** Like an `if / else if / else` chain. Use it when you're checking **conditions**, not shapes.

```elixir
cond do
  age < 13 -> :child
  age < 20 -> :teen
  age < 65 -> :adult
  true -> :senior        # "else": true always matches
end
```

## 3. `if` / `unless`

> **In short:** For a single boolean check. Both are expressions that return a value (`nil` if there's no `else`).

```elixir
status = if user.active, do: "active", else: "inactive"

if valid? do
  save()
else
  log_error()
end

unless admin?, do: raise("forbidden")   # unless = if not; never use unless with an else
```

There's no `else if`. Use `cond` or `case` for that.

## 4. Everything is an expression, and scoping

> **In short:** Assign the **result** of `if`/`case`. Variables bound inside a branch don't leak out.

```elixir
# WRONG (it works in JS, but not in Elixir)
x = 1
if true do
  x = 2      # this x is local to the if block
end
x            # still 1 (the compiler warns you)

# RIGHT
x = if true, do: 2, else: 1
```

## 5. No early return: how to cope

> **In short:** Use multi-clause functions, guards, or `with` instead of early `return`.

JS habit:

```js
function process(user) {
  if (!user) return { error: "no user" }
  if (!user.active) return { error: "inactive" }
  return doWork(user)
}
```

Elixir option 1, multi-clause functions:

```elixir
def process(nil), do: {:error, :no_user}
def process(%{active: false}), do: {:error, :inactive}
def process(user), do: do_work(user)
```

Elixir option 2, `with` (fully covered in lesson 08):

```elixir
def register(params) do
  with {:ok, attrs} <- validate(params),
       {:ok, user} <- create_user(attrs),
       {:ok, _email} <- send_welcome(user) do
    {:ok, user}
  else
    {:error, reason} -> {:error, reason}
  end
end
```

`with` runs each step while its pattern matches. If any step returns something that **doesn't** match (like `{:error, _}`), it jumps to `else`, or returns that value directly if there's no `else`.

## 6. Choosing the right tool

| Situation | Use |
| --- | --- |
| Branch on the shape of a return value | `case` |
| Different behaviour per input type/shape | multi-clause functions |
| Several boolean conditions | `cond` |
| One boolean | `if` |
| A chain of steps that can each fail | `with` |
| "Loop" over a collection | `Enum` / `for` / recursion (lesson 06) |

## Exercises

1. Write `grade/1` with `cond`: 90+ → "A", 80+ → "B", 70+ → "C", otherwise "F".
2. Rewrite it as multi-clause functions with guards.
3. Write `fetch_user_email(users_map, id)` that returns `{:ok, email}`, `{:error, :not_found}` (unknown id), or `{:error, :no_email}` (user has a `nil` email). Use `case`, then rewrite with `with`.

## Interview questions

<details>
<summary>When would you use cond vs case?</summary>

`case` matches one value against **patterns** (shapes, literals, guards). `cond` evaluates a list of **boolean conditions** and runs the first one that is truthy, like an else-if chain. Use `case` when you're destructuring results, and `cond` when you're comparing values.

</details>

<details>
<summary>How do you handle early returns in Elixir?</summary>

There's no `return` statement. You use multi-clause functions with pattern matching and guards (each clause handles one case), `with` for a chain of steps that can fail, or a `case` structure where each branch produces the final value.

</details>
