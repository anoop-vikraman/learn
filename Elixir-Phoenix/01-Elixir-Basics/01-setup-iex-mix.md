# 01 · Setup, IEx and Mix

## 1. IEx: your best friend

> **In short:** `iex` is the REPL. Use it constantly, especially `h` for docs and `i` to inspect values.

```bash
iex
```

```elixir
iex> 1 + 2
3
iex> "hello" <> " world"       # string concatenation
"hello world"
iex> h String.upcase            # docs for a function
iex> h Enum                     # docs for a module
iex> i "hello"                  # inspect: data type, protocols, etc.
iex> String.<TAB>               # autocomplete
iex> v()                        # the last result
iex> c "my_file.ex"             # compile and load a file
iex> recompile()                # inside `iex -S mix`, reload changed code
iex> clear()
```

Exit with **Ctrl+C twice** (or `System.halt()`).

`iex -S mix` starts IEx **with your project loaded**. For Phoenix it's `iex -S mix phx.server`, which runs the server *and* gives you a shell into the live app. You'll use this all the time.

## 2. Running scripts

> **In short:** `.exs` files are scripts (interpreted, not compiled to disk). `.ex` files are compiled project code.

```elixir
# hello.exs
IO.puts("Hello from Elixir")
name = "Anoop"
IO.puts("Hi #{name}")   # string interpolation
```

```bash
elixir hello.exs
```

| Extension | Meaning | Used for |
| --- | --- | --- |
| `.ex` | Compiled to `.beam` files | Application code in `lib/` |
| `.exs` | Script, evaluated at runtime | Tests, config, `mix.exs`, seeds, one-off scripts |
| `.heex` | HTML + Elixir templates | Phoenix/LiveView templates |

## 3. Mix: the build tool

> **In short:** `mix new` creates a project. `mix compile`, `mix test`, `mix format` and `mix deps.get` cover most daily needs.

```bash
mix new practice           # plain project
mix new my_app --sup       # with a supervision tree (an OTP application)
cd practice
```

```
practice/
├── lib/
│   └── practice.ex         # your code (module Practice)
├── test/
│   ├── practice_test.exs
│   └── test_helper.exs
├── mix.exs                 # project config + dependencies (like package.json)
├── .formatter.exs          # formatter config
└── README.md
```

`mix.exs`:

```elixir
defmodule Practice.MixProject do
  use Mix.Project

  def project do
    [
      app: :practice,
      version: "0.1.0",
      elixir: "~> 1.18",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [extra_applications: [:logger]]
  end

  defp deps do
    [
      {:jason, "~> 1.4"},              # JSON library
      {:req, "~> 0.5"}                 # HTTP client
    ]
  end
end
```

Daily commands:

| Command | Does | npm equivalent |
| --- | --- | --- |
| `mix deps.get` | Install dependencies | `npm install` |
| `mix compile` | Compile | `tsc` / build |
| `mix test` | Run tests | `npm test` |
| `mix test test/foo_test.exs:12` | Run one test (by line) | `jest -t` |
| `mix format` | Format all code | `prettier --write` |
| `mix run -e "IO.puts 1"` | Run code in the project | `node -e` |
| `iex -S mix` | Shell with the project loaded | — |
| `mix help` | List all tasks | — |
| `mix hex.outdated` | Outdated deps | `npm outdated` |

**`~> 1.4` means** `>= 1.4.0 and < 2.0.0`; `~> 1.4.2` means `>= 1.4.2 and < 1.5.0`. The lock file is `mix.lock`; commit it.

## 4. Environments

> **In short:** `MIX_ENV` is `dev`, `test` or `prod`, and config files are chosen by environment.

```bash
MIX_ENV=prod mix compile
```

Config lives in `config/config.exs` (all environments), `config/dev.exs`, `config/test.exs`, `config/prod.exs` (compile-time), and `config/runtime.exs` (runs at **startup**, which is where you read env vars like `DATABASE_URL`). You'll see this again in Phoenix.

## 5. Your first module + test

> **In short:** Code goes in `lib/` as modules, tests go in `test/`, and you run `mix test`.

```elixir
# lib/practice.ex
defmodule Practice do
  @moduledoc "Practice functions."

  @doc """
  Greets a person.

      iex> Practice.greet("Anoop")
      "Hello, Anoop!"
  """
  def greet(name), do: "Hello, #{name}!"
end
```

```elixir
# test/practice_test.exs
defmodule PracticeTest do
  use ExUnit.Case
  doctest Practice      # runs the iex> examples in @doc as tests!

  test "greets" do
    assert Practice.greet("Sam") == "Hello, Sam!"
  end
end
```

```bash
mix test
```

## Exercises

1. Run `iex`, then `h Enum.map`, `h String.split`, and `i [1,2]`.
2. `mix new practice`, add `greet/1` from above, run `mix test`.
3. Add the `jason` dependency, then in `iex -S mix` run `Jason.encode!(%{a: 1})`.
4. Write a `hello.exs` script that prints the numbers 1–5 (hint: `Enum.each(1..5, &IO.puts/1)`).

## Interview questions

<details>
<summary>What's the difference between .ex and .exs files?</summary>

`.ex` files are compiled to `.beam` bytecode and are used for application code. `.exs` files are scripts evaluated at runtime without producing artifacts, and are used for tests, config, `mix.exs` and seeds.

</details>

<details>
<summary>What is config/runtime.exs for?</summary>

It runs when the application **starts** (including inside a compiled release), not at compile time. You use it to read environment variables such as `DATABASE_URL`, `SECRET_KEY_BASE` and `PORT`, so one compiled release can run with different configuration in each environment.

</details>
