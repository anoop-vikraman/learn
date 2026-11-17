# 04 · Functions, modules and the pipe operator

## 1. Modules and named functions

> **In short:** All named functions live inside a `defmodule`. `def` makes a public function, `defp` a private one.

```elixir
defmodule Math do
  def add(a, b) do
    a + b
  end

  # one-liner form
  def square(x), do: x * x

  defp secret(x), do: x * 42    # private: callable only inside Math
end

Math.add(1, 2)       # 3
Math.square(4)       # 16
Math.secret(1)       # ** (UndefinedFunctionError)
```

The **last expression is the return value**, with no `return` keyword. Parentheses on calls are optional (`Math.add 1, 2`), but use them; the formatter prefers them.

Module names are nested with dots: `MyApp.Accounts.User`. The dot is only a naming convention, not a real hierarchy.

## 2. Arity: name/number-of-args

> **In short:** A function is identified by its name **and** its arity. `add/2` and `add/3` are completely different functions.

```elixir
defmodule Greet do
  def hello(), do: hello("world")       # hello/0
  def hello(name), do: "Hello #{name}"  # hello/1
end
```

In docs and errors you'll always see `Enum.map/2`, `String.split/3` and so on.

## 3. Default arguments

> **In short:** `\\` sets a default value.

```elixir
defmodule Http do
  def get(url, opts \\ []) do
    timeout = Keyword.get(opts, :timeout, 5000)
    "GET #{url} (timeout #{timeout})"
  end
end

Http.get("/users")                 # this generates get/1 and get/2
Http.get("/users", timeout: 1000)
```

## 4. Guards

> **In short:** Add `when` conditions to function clauses. Only a limited set of pure functions is allowed in guards.

```elixir
defmodule Num do
  def kind(n) when is_integer(n) and n < 0, do: :negative
  def kind(0), do: :zero
  def kind(n) when is_integer(n), do: :positive
  def kind(_), do: :not_an_integer
end
```

Allowed in guards: comparison and arithmetic operators, `is_*` type checks, `in` (with a literal list or range), `length/1`, `map_size/1`, `elem/2`, `hd/1`, and similar. You **can't** call your own functions, but you can define reusable guards with `defguard`:

```elixir
defguard is_adult(age) when is_integer(age) and age >= 18
```

## 5. Anonymous functions

> **In short:** `fn args -> body end` creates a function value. You call it with a **dot**: `f.(x)`.

```elixir
add = fn a, b -> a + b end
add.(1, 2)              # 3, note the dot!

# Multi-clause anonymous function
handle = fn
  {:ok, v} -> "got #{v}"
  {:error, _} -> "failed"
end

# Closures capture variables
factor = 3
times = fn x -> x * factor end
times.(5)               # 15
```

### The capture operator `&`

> **In short:** `&` is a shorthand for writing short anonymous functions or referring to named ones.

```elixir
Enum.map([1, 2, 3], fn x -> x * 2 end)
Enum.map([1, 2, 3], &(&1 * 2))          # &1 = first argument
Enum.map(["a", "b"], &String.upcase/1)  # capture a named function by name/arity
Enum.reduce([1, 2, 3], 0, &(&1 + &2))   # &1, &2 = first and second args
```

Rule: use `&` when it's short and obvious, and `fn` when it's not.

## 6. The pipe operator `|>`

> **In short:** `x |> f(y)` means `f(x, y)`. The result on the left becomes the **first argument** on the right, so data flows top to bottom.

```elixir
# Nested: read inside-out
String.split(String.upcase(String.trim("  hello world  ")), " ")

# Piped: read top to bottom
"  hello world  "
|> String.trim()
|> String.upcase()
|> String.split(" ")
# ["HELLO", "WORLD"]
```

This is why Elixir libraries always put the **"subject" data as the first argument**: `Enum.map(list, fun)`, `Map.put(map, k, v)`, `String.replace(str, a, b)`. Design your own functions the same way.

A real-world example (you'll write lots of these in Phoenix):

```elixir
def list_active_users_emails(users) do
  users
  |> Enum.filter(& &1.active)
  |> Enum.sort_by(& &1.inserted_at, :desc)
  |> Enum.map(& &1.email)
  |> Enum.take(10)
end
```

Phoenix's `conn` is built for piping:

```elixir
conn
|> put_status(:created)
|> put_resp_header("location", ~p"/api/users/#{user}")
|> json(%{data: user})
```

## 7. Module attributes

> **In short:** `@name value` defines compile-time constants. `@doc`, `@moduledoc` and `@spec` are special attributes.

```elixir
defmodule Config do
  @default_timeout 5_000
  @roles [:admin, :member, :guest]

  def timeout, do: @default_timeout
  def valid_role?(role), do: role in @roles
end
```

## 8. `alias`, `import`, `require` and `use`

> **In short:** `alias` shortens module names, `import` brings functions in without a prefix, `require` enables a module's macros, and `use` runs a module's setup code inside yours.

```elixir
defmodule MyApp.Accounts do
  alias MyApp.Repo                    # now write Repo instead of MyApp.Repo
  alias MyApp.Accounts.{User, Token}  # several at once
  import Ecto.Query, only: [from: 2]  # call from(...) directly
  require Logger                      # Logger.info/1 is a macro, so it needs require

  def get_user(id), do: Repo.get(User, id)
end
```

`use` is the magic one:

```elixir
defmodule MyAppWeb.UserController do
  use MyAppWeb, :controller   # calls MyAppWeb.__using__(:controller), which injects imports/aliases
end
```

When you see `use Something`, it means "Something injects code here". Look at that module's `__using__/1` macro to see what it adds. In a Phoenix app, open `lib/my_app_web.ex` to see exactly what `use MyAppWeb, :controller` gives you.

## 9. Functions are first-class

> **In short:** Pass functions as arguments and return them from other functions, as in JS.

```elixir
defmodule Retry do
  def run(fun, attempts \\ 3)
  def run(fun, 1), do: fun.()
  def run(fun, n) do
    case fun.() do
      {:ok, _} = ok -> ok
      {:error, _} -> run(fun, n - 1)
    end
  end
end

Retry.run(fn -> {:error, :flaky} end)
```

(The first line, `def run(fun, attempts \\ 3)` with no body, is a **function head**. You need it when a multi-clause function has defaults.)

## Exercises

1. Write `Temperature.convert/2` with clauses for `{:c, deg}, :f` and `{:f, deg}, :c`.
2. Rewrite `Enum.join(Enum.map(Enum.filter(list, fn x -> rem(x, 2) == 0 end), fn x -> x * x end), ",")` with pipes and `&`.
3. Write `slugify/1`: `"  Hello World! Elixir  "` → `"hello-world-elixir"`. Use a pipe of `String.trim`, `String.downcase`, `String.replace(~r/[^a-z0-9\s]/, "")` and `String.split` + `Enum.join("-")`.
4. Add a `defguard is_even(n)` and use it in a function head.

## Interview questions

<details>
<summary>What is arity and why does it matter?</summary>

Arity is the number of arguments a function takes. Functions are identified by `name/arity`, so `get/1` and `get/2` are different functions. Default arguments generate several arities. You refer to functions this way in captures (`&String.upcase/1`), docs and error messages.

</details>

<details>
<summary>How does the pipe operator work, and how does it affect API design?</summary>

`a |> f(b)` becomes `f(a, b)`: the left value is inserted as the **first** argument. That's why idiomatic Elixir functions take the main data structure first (`Enum.map(enumerable, fun)`, `Map.put(map, key, value)`), so they chain cleanly.

</details>

<details>
<summary>Explain the difference between alias, import, require, and use.</summary>

`alias` creates a short name for a module. `import` makes a module's functions callable without the module prefix. `require` makes a module's **macros** available at compile time. `use` calls the target module's `__using__/1` macro, which can inject any code (imports, aliases, functions, behaviours). It's how Phoenix sets up controllers, LiveViews and so on.

</details>

<details>
<summary>Why is there a dot when calling anonymous functions?</summary>

To tell them apart from named functions. `add.(1, 2)` calls the function **stored in the variable** `add`, while `add(1, 2)` calls a named function `add/2` in scope. Elixir keeps the two namespaces separate.

</details>
