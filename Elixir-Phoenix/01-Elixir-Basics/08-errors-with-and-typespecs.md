# 08 · Errors, `with`, typespecs and docs

> **Plain English:** Some failures are *expected* (a wrong password, a missing record). Elixir returns those as values such as `{:error, :not_found}` that you handle. Others are *unexpected* (bugs). Those crash the process, and a supervisor restarts it. `with` lets you write "do step 1, then 2, then 3, and stop at the first problem" cleanly. Typespecs are optional type labels that help tools catch mistakes.

## 1. Two ways to signal failure

> **In short:** For **expected** failures, return `{:error, reason}`. For **exceptional** failures (bugs, broken invariants), raise an exception and usually let it crash.

| Expected (return a tuple) | Exceptional (raise) |
| --- | --- |
| User not found | Database connection config missing at boot |
| Invalid form input | A function received a type it can never handle |
| Payment declined | Impossible state ("this should never happen") |

Many standard functions come in pairs:

```elixir
File.read("x")       # {:ok, data} | {:error, reason}
File.read!("x")      # data, or raises File.Error

Map.fetch(m, :k)     # {:ok, v} | :error
Map.fetch!(m, :k)    # v, or raises KeyError

Repo.get(User, id)   # %User{} | nil
Repo.get!(User, id)  # %User{}, or raises Ecto.NoResultsError (Phoenix turns this into a 404)
```

**The "bang" (`!`) convention:** a function ending in `!` raises on failure instead of returning an error tuple. Use bang versions when failure means a bug or when you *want* a crash (scripts, seeds, `get!` in a controller where a missing record should give a 404).

## 2. `with`: chaining steps that can fail

> **In short:** `with` runs a series of pattern matches. As soon as one doesn't match, it stops and returns that value (or hands it to `else`).

```elixir
def create_order(user_id, params) do
  with {:ok, user} <- fetch_user(user_id),
       :ok <- check_active(user),
       {:ok, items} <- validate_items(params["items"]),
       {:ok, order} <- insert_order(user, items) do
    {:ok, order}
  end
end
```

If `fetch_user` returns `{:error, :not_found}`, that doesn't match `{:ok, user}`, so `with` immediately returns `{:error, :not_found}`. That's like early returns, but declarative.

With `else`, to transform errors:

```elixir
with {:ok, user} <- fetch_user(id),
     true <- user.admin do
  {:ok, user}
else
  {:error, :not_found} -> {:error, "User not found"}
  false -> {:error, "Not an admin"}
end
```

Tips:
- Plain expressions are allowed in `with` too: `total = calc(items),`
- Keep `else` clauses few. If you need a lot of them, give each step a distinct error tag (`{:error, :validation, cs}`), or make each helper return already-meaningful errors.
- In Phoenix controllers, combine `with` with `action_fallback` (see Phoenix lesson 04) and you rarely need `else` at all.

JS equivalent: a chain of `await`s inside `try/catch`, but errors are values instead of exceptions.

## 3. Exceptions: raise, rescue, try

> **In short:** `raise` throws, and `try/rescue` catches, but in idiomatic Elixir you rarely rescue. You let supervisors handle crashes.

```elixir
raise "Something broke"                         # RuntimeError
raise ArgumentError, message: "bad arg"

defmodule MyApp.PaymentError do
  defexception [:message, :code]
end
raise MyApp.PaymentError, message: "declined", code: 402

try do
  String.to_integer("abc")
rescue
  e in ArgumentError -> {:error, Exception.message(e)}
after
  IO.puts("always runs")                        # like finally
end
```

When **is** rescuing okay? At boundaries you don't control: parsing untrusted input with a library that raises, or a third-party SDK. Wrap it once and convert the exception to `{:error, _}`.

(There's also `throw/catch` and `exit`. `throw` is very rare, and `exit` is about processes, covered in OTP.)

## 4. Typespecs and Dialyzer

> **In short:** `@spec` documents argument and return types. Dialyzer (via `dialyxir`) checks them statically. The compiler is also gaining built-in type inference.

```elixir
defmodule Accounts do
  @type user_id :: pos_integer()
  @type error :: {:error, :not_found | :inactive}

  @spec get_user(user_id()) :: {:ok, User.t()} | error()
  def get_user(id) do
    # ...
  end
end

defmodule User do
  @type t :: %__MODULE__{email: String.t(), name: String.t() | nil}
  defstruct [:email, :name]
end
```

Common types: `integer()`, `float()`, `String.t()`, `atom()`, `boolean()`, `map()`, `list(integer())`, `keyword()`, `term()`/`any()`, `pid()`, `nil`, unions with `|`.

```bash
# mix.exs deps: {:dialyxir, "~> 1.4", only: [:dev, :test], runtime: false}
mix dialyzer
```

Since Elixir 1.17 the compiler itself includes a **gradual set-theoretic type system** that catches more type errors at compile time (for example, using a struct field that doesn't exist, or calling a function with a type it can't accept), and it gets stronger in each release. You don't write special annotations for it yet. Just read the compiler warnings.

## 5. Documentation and doctests

> **In short:** `@moduledoc` and `@doc` are first-class, `mix docs` (ex_doc) generates HexDocs-style HTML, and `iex>` examples in docs become tests.

```elixir
defmodule Cart do
  @moduledoc "Shopping cart calculations."

  @doc """
  Sums item prices.

  ## Examples

      iex> Cart.total([%{price: 2}, %{price: 3}])
      5
  """
  @spec total([%{price: number()}]) :: number()
  def total(items), do: items |> Enum.map(& &1.price) |> Enum.sum()
end
```

In the test file, `doctest Cart` runs those examples.

## 6. Tooling for code quality

| Tool | Purpose |
| --- | --- |
| `mix format` | Official formatter, no style debates |
| **Credo** (`mix credo`) | Linter: style, consistency, refactoring hints |
| **Dialyzer** (`mix dialyzer`) | Static type discrepancy analysis |
| **Sobelow** (`mix sobelow`) | Phoenix security scanner |
| `mix compile --warnings-as-errors` | Use it in CI |
| `mix xref` | Dependency graph between modules |

## Exercises

1. Write `parse_age/1`: it takes a string and returns `{:ok, int}` if it's 0–150, otherwise `{:error, :invalid}`. Use `Integer.parse/1` and `case`.
2. Write `signup/1` taking `%{"email" => ..., "age" => ...}`, chaining `validate_email/1`, `parse_age/1` and `build_user/2` with `with`.
3. Add `@spec` to both and run `mix dialyzer`.
4. Add a doctest and make it pass.

## Interview questions

<details>
<summary>When do you return error tuples vs raise exceptions?</summary>

Return `{:error, reason}` for **expected** failures the caller should handle: validation errors, not found, declined payments. Raise for **unexpected** situations or programmer errors, where crashing (and being restarted by a supervisor) is the right response. Bang functions (`get!`, `read!`) are the raising variants, used when failure means something is truly wrong.

</details>

<details>
<summary>How does `with` work?</summary>

It evaluates a sequence of `pattern <- expression` clauses. When a clause matches, its bindings are available to the next ones. If any expression's result doesn't match its pattern, `with` stops and returns that non-matching value, or passes it to the `else` block if there is one. If all match, the `do` block runs. It flattens nested `case` statements for happy-path-oriented code.

</details>

<details>
<summary>Is Elixir statically typed?</summary>

No, it's dynamically (and strongly) typed. You can add typespecs (`@spec`, `@type`) checked by Dialyzer, which uses "success typing" and reports only definite errors. Since 1.17 the compiler has been adding a gradual, set-theoretic type system that infers types and warns about type violations at compile time. It's being rolled out progressively across releases.

</details>
