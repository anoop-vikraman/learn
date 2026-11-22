# 03 · Pattern matching

> **Plain English:** Pattern matching means saying "I expect the data to look like *this*" and pulling out the parts you need in one step. Think of a mail sorter: envelopes with a red stamp go here, blue go there. Instead of writing `if result.ok ... else ...`, you describe the shapes and Elixir picks the right branch. This is the most important idea in the language.

This is the single most important concept in Elixir. Once it clicks, the rest of the language follows.

## 1. `=` is the match operator, not assignment

> **In short:** `left = right` means "make the left side match the right side". Variables on the left get bound, and if it can't match you get a `MatchError`.

```elixir
x = 1          # match: bind x to 1
1 = x          # match: 1 equals 1, fine!
2 = x          # ** (MatchError) no match of right hand side value: 1
```

In JS, `1 = x` is a syntax error. In Elixir it's an assertion.

## 2. Destructuring

> **In short:** Pull values out of tuples, lists and maps by writing the "shape" you expect.

```elixir
# Tuples
{a, b} = {1, 2}                    # a = 1, b = 2
{:ok, result} = {:ok, "data"}      # result = "data"
{:ok, result} = {:error, "oops"}   # MatchError: :ok doesn't match :error

# Lists
[first, second] = [1, 2]
[head | tail] = [1, 2, 3]          # head = 1, tail = [2, 3]
[a, b | rest] = [1, 2, 3, 4]       # a = 1, b = 2, rest = [3, 4]
[_ | _] = []                       # MatchError: empty list has no head

# Maps (partial match: only the keys you list need to exist)
%{name: name} = %{name: "Anoop", age: 30}   # name = "Anoop"
%{"id" => id} = %{"id" => 5, "x" => 1}       # id = 5
%{} = %{a: 1}                                # matches ANY map

# Nested
{:ok, %{user: %{email: email}}} = {:ok, %{user: %{email: "a@b.com"}}}

# Strings (prefix match)
"Bearer " <> token = "Bearer abc123"   # token = "abc123"
```

JS comparison: `const { name } = user` and `const [first, ...rest] = arr`. Same idea, but Elixir **also checks literal values** (the `:ok` part) and works in many more places.

## 3. The underscore

> **In short:** `_` matches anything and ignores it. `_name` is the same but documents what you're ignoring.

```elixir
{_, second} = {1, 2}
{:ok, _user} = {:ok, %{}}    # "I know this is a user; I just don't need it"
```

## 4. The pin operator `^`

> **In short:** `^x` means "match against x's current value" instead of rebinding x.

```elixir
x = 1
x = 2           # rebinds x
^x = 2          # matches x's value (2): OK
^x = 3          # MatchError

expected_id = 5
%{id: ^expected_id} = %{id: 5}   # OK only if id is 5
```

You'll use `^` all the time in **Ecto queries** to inject variables: `where: u.id == ^user_id`.

## 5. Matching in function heads: the real power

> **In short:** Define several clauses of the same function, each matching a different input shape. Elixir picks the first one that matches.

```elixir
defmodule Greeter do
  def greet(%{name: name, role: :admin}), do: "Welcome back, boss #{name}"
  def greet(%{name: name}), do: "Hello #{name}"
  def greet(_), do: "Hello stranger"
end

Greeter.greet(%{name: "Anoop", role: :admin})  # "Welcome back, boss Anoop"
Greeter.greet(%{name: "Sam"})                  # "Hello Sam"
Greeter.greet(nil)                             # "Hello stranger"
```

Clause **order matters**: put specific clauses first and the catch-all last. The compiler warns you if a clause can never match.

This replaces most `if/else` and `switch` code:

```elixir
# JS
function handle(result) {
  if (result.ok) return render(result.data)
  else if (result.error === "not_found") return notFound()
  else return serverError(result.error)
}
```

```elixir
# Elixir
def handle({:ok, data}), do: render(data)
def handle({:error, :not_found}), do: not_found()
def handle({:error, reason}), do: server_error(reason)
```

## 6. Tagged tuples: the `{:ok, _}` / `{:error, _}` convention

> **In short:** Functions that can fail return `{:ok, value}` or `{:error, reason}`, and the caller pattern-matches the result.

```elixir
File.read("exists.txt")      # {:ok, "contents"}
File.read("missing.txt")     # {:error, :enoent}

case File.read("config.json") do
  {:ok, contents} -> Jason.decode!(contents)
  {:error, :enoent} -> %{}             # file missing: use defaults
  {:error, reason} -> raise "Can't read config: #{inspect(reason)}"
end
```

Phoenix and Ecto use this everywhere: `Repo.insert(changeset)` returns `{:ok, user}` or `{:error, changeset}`.

## 7. Matching in `case`

> **In short:** `case` tries each pattern top to bottom, and you can add guards with `when`.

```elixir
case {1, 2, 3} do
  {4, 5, 6} -> "won't match"
  {1, x, 3} when x > 0 -> "matches, x = #{x}"
  _ -> "fallback"
end
```

## 8. Common mistakes

> **In short:** Watch out for rebinding instead of pinning, for map patterns matching more than you expect, and for forgetting the catch-all clause.

```elixir
id = 5
case %{id: 7} do
  %{id: id} -> "matched with id=#{id}"   # rebinds id to 7! You probably wanted ^id
end

# %{} matches ANY map, not only the empty one. To check for empty, use:
map == %{}    # or map_size(map) == 0 in a guard
```

## Exercises

1. Write `area/1` with clauses for `{:circle, r}`, `{:rect, w, h}` and `{:square, s}`.
2. Destructure `{:ok, %{"data" => [first | _]}}` to pull out `first`.
3. Write `parse_auth/1` that turns `"Bearer xyz"` into `{:ok, "xyz"}` and anything else into `{:error, :invalid}`.
4. Write `http_status/1` that maps `200` to `:ok`, `404` to `:not_found`, anything 500–599 to `:server_error` (guard: `when code in 500..599`), and everything else to `:unknown`.

## Interview questions

<details>
<summary>What does the = operator do in Elixir?</summary>

It's the **match operator**. It tries to make the left side match the right side, binding any unbound variables on the left. If the shapes or literal values don't match, it raises `MatchError`. So `{:ok, x} = {:ok, 1}` binds `x` to 1, and `1 = x` is a valid assertion.

</details>

<details>
<summary>What is the pin operator for?</summary>

`^var` uses the variable's **existing value** in a pattern instead of rebinding it. It's common in `case` patterns and essential in Ecto queries (`where: p.user_id == ^user_id`) to safely interpolate values as query parameters.

</details>

<details>
<summary>Why do Elixir functions return {:ok, value} / {:error, reason} instead of throwing?</summary>

It makes failure an explicit part of the return value, so callers must handle it with pattern matching (`case`, `with`, function heads). Control flow stays visible and composable, and exceptions are reserved for truly exceptional situations. Many functions also have a "bang" variant (`File.read!/1`) that raises instead, for when failure should crash the process.

</details>
