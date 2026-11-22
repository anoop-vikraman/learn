# 11 · Macros and metaprogramming

> **Plain English:** a macro is **code that writes code** when your program is compiled. You'll rarely write one yourself, but Phoenix, Ecto and ExUnit are full of them. Understanding macros removes the "magic" from `use`, `schema`, `get "/path"` and `test "..."`.

## 1. Code is data: the AST

> **In short:** Every piece of Elixir code can be represented as plain Elixir data (tuples, atoms, lists). `quote` gives you that representation, which is called the **AST**.

```elixir
quote do: 1 + 2
# {:+, [context: Elixir, imports: [{1, Kernel}, {2, Kernel}]], [1, 2]}
```

Every function call becomes a 3-element tuple: `{function_name, metadata, arguments}`.

```elixir
quote do: sum(1, 2, 3)
# {:sum, [], [1, 2, 3]}

quote do: if(x > 0, do: :pos, else: :neg)
# {:if, [...], [{:>, [...], [{:x, [], Elixir}, 0]}, [do: :pos, else: :neg]]}
```

Simple values (atoms, numbers, strings, lists, 2-element tuples) represent themselves.

```elixir
Macro.to_string(quote do: 1 + 2 * 3)    # "1 + 2 * 3"   (AST back to code)
Code.string_to_quoted!("a + b")          # code string → AST
Code.eval_quoted(quote do: 1 + 2)        # {3, []}
```

Analogy: the AST is like the **blueprint** of a building. A macro receives a blueprint, edits it, and hands it back to the compiler before anything is built.

## 2. `unquote`: inject values into a quote

> **In short:** Inside `quote`, `unquote(x)` means "insert the value of x here", like `${}` inside a JS template string.

```elixir
number = 5
quote do: 1 + unquote(number)       # {:+, _, [1, 5]}

name = :hello
quote do
  def unquote(name)(), do: "hi"
end
# builds the code for: def hello(), do: "hi"
```

## 3. Your first macro

> **In short:** `defmacro` receives its arguments **as AST (unevaluated code)** and must return AST. That's why a macro can control *if* and *when* code runs.

```elixir
defmodule MyMacros do
  defmacro unless_(condition, do: block) do
    quote do
      if !unquote(condition), do: unquote(block)
    end
  end

  # Log the code AND its result
  defmacro debug(expr) do
    code = Macro.to_string(expr)
    quote do
      result = unquote(expr)
      IO.puts("#{unquote(code)} = #{inspect(result)}")
      result
    end
  end
end

require MyMacros                      # you must require a module to use its macros
MyMacros.unless_ 1 > 2, do: IO.puts("runs")
MyMacros.debug(Enum.sum([1, 2, 3]))   # prints: Enum.sum([1, 2, 3]) = 6
```

A **function** would receive the *value* `6`. The **macro** received the *code* `Enum.sum([1, 2, 3])`, so it could print the code itself. That's the whole difference.

To see what a macro produces:

```elixir
quote(do: MyMacros.unless_(true, do: :x)) |> Macro.expand(__ENV__) |> Macro.to_string()
```

## 4. Hygiene: variables don't leak

> **In short:** Variables created inside a macro don't clash with the caller's variables, which protects you from accidental bugs.

```elixir
defmacro set_x do
  quote do: x = 100
end

x = 1
set_x()
x          # still 1: the macro's x is a different, "hygienic" variable
```

You can deliberately break hygiene with `var!(x)`, but you should almost never need to.

## 5. How `use` really works

> **In short:** `use SomeModule, opts` calls `SomeModule.__using__(opts)`, a macro that returns code to paste into your module.

```elixir
defmodule Greeter do
  defmacro __using__(opts) do
    greeting = Keyword.get(opts, :greeting, "Hello")

    quote do
      def greet(name), do: "#{unquote(greeting)}, #{name}!"
      defoverridable greet: 1          # the user may override it
    end
  end
end

defmodule English do
  use Greeter
end

defmodule Spanish do
  use Greeter, greeting: "Hola"
end

English.greet("Ana")   # "Hello, Ana!"
Spanish.greet("Ana")   # "Hola, Ana!"
```

This is exactly how `use GenServer` gives you a default `child_spec/1`, and how `use MyAppWeb, :controller` adds imports.

## 6. Module attributes that accumulate, and `@before_compile`

> **In short:** DSLs like the Phoenix router collect declarations into an attribute while your module compiles, then generate functions from them at the end.

A mini router, built the same way as Phoenix's:

```elixir
defmodule MiniRouter do
  defmacro __using__(_opts) do
    quote do
      import MiniRouter
      Module.register_attribute(__MODULE__, :routes, accumulate: true)
      @before_compile MiniRouter
    end
  end

  defmacro get(path, handler) do
    quote do
      @routes {unquote(path), unquote(handler)}
    end
  end

  defmacro __before_compile__(env) do
    routes = Module.get_attribute(env.module, :routes)

    clauses =
      for {path, handler} <- routes do
        quote do
          def dispatch(unquote(path)), do: unquote(handler)
        end
      end

    quote do
      unquote_splicing(clauses)
      def dispatch(_), do: :not_found
    end
  end
end

defmodule MyRoutes do
  use MiniRouter
  get "/", :home
  get "/about", :about
end

MyRoutes.dispatch("/about")   # :about
MyRoutes.dispatch("/nope")    # :not_found
```

Because the routes become **function clauses with pattern matching**, dispatch is very fast. Phoenix's router compiles routes the same way.

## 7. Where macros appear in daily life

| Code you write | What the macro does |
| --- | --- |
| `def`, `defmodule`, `if`, `unless`, `|>` | Even the core language is built from macros |
| `use GenServer` | Adds `child_spec/1` and default callbacks |
| `schema "tasks" do field ... end` | Generates a struct and reflection functions |
| `from t in Task, where: t.done` | Turns Elixir code into a safe SQL query at compile time |
| `get "/tasks", TaskController, :index` | Builds the router's dispatch clauses |
| `test "adds" do ... end` | Defines a test function and registers it |
| `~H"..."` | Compiles the template into an optimised render function |
| `Logger.debug(...)` | Can be removed entirely at compile time in prod |

## 8. Other metaprogramming tools

```elixir
__MODULE__                 # the current module name
__ENV__.file, __ENV__.line # where we are in the source
MyModule.__info__(:functions)          # list a module's public functions
function_exported?(MyModule, :run, 1)
apply(MyModule, :run, [arg])            # call a function chosen at runtime
Module.concat([MyApp, "Workers", "Email"])   # MyApp.Workers.Email
Code.ensure_loaded?(MyModule)
```

`apply/3` is **runtime** dynamic dispatch, not a macro. It's handy for plugins and for config-driven modules.

## 9. When should you write a macro?

> **In short:** Almost never. "Don't write macros" is the first rule of macros. Use a function unless you truly need compile-time code generation or a DSL.

Write a macro only when you need to:
- receive code without evaluating it (`debug/1`, assertions that print the expression),
- generate many functions from declarations (routers, schemas),
- remove code at compile time (logging levels),
- build a DSL that reads much better than plain functions.

Downsides: harder to read, harder to debug, and harder to compose. And whoever reads your code has to learn your DSL.

## Exercises

1. In IEx, `quote` three different expressions and read their AST.
2. Write a `debug/1` macro like the one above and use it in a pipeline.
3. Write a `__using__` macro that adds `def hello, do: "hi from #{__MODULE__}"` to any module that uses it.
4. Extend the `MiniRouter` with `post/2` and make `dispatch(method, path)` match on both.
5. Open `deps/phoenix/lib/phoenix/router.ex` and find where `get` is defined as a macro.

## Interview questions

<details>
<summary>What's the difference between a function and a macro?</summary>

A function receives evaluated values at runtime and returns a value. A macro receives its arguments as AST (unevaluated code) at compile time and returns AST, which is inserted at the call site and compiled. Macros can decide whether and how code runs, generate functions, and build DSLs. Functions should be preferred whenever possible.

</details>

<details>
<summary>What are quote and unquote?</summary>

`quote` converts a block of code into its AST representation (nested `{name, meta, args}` tuples and literals). `unquote` injects a value or AST fragment into a quoted expression, like interpolation in a template. Macros are built from these two.

</details>

<details>
<summary>What is macro hygiene?</summary>

Variables defined inside a macro's quoted code live in the macro's own context, so they don't accidentally overwrite or read the caller's variables with the same name. You can bypass it deliberately with `var!/1`, but that's rarely appropriate.

</details>

<details>
<summary>How does `use` work?</summary>

`use Mod, opts` requires `Mod` and calls its `__using__/1` macro with the options. Whatever AST that macro returns is injected into the calling module: imports, aliases, attributes, function definitions (often with `defoverridable`), and `@before_compile` hooks. It's how GenServer, Phoenix controllers, Ecto schemas and ExUnit cases set themselves up.

</details>
