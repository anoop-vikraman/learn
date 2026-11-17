# 01 · Elixir basics

| # | Lesson | Level | You will learn |
| --- | --- | --- | --- |
| 00 | [What is Elixir and the BEAM](00-what-is-elixir-and-the-beam.md) | Overview | Why Elixir exists, Erlang/BEAM, lightweight processes, "let it crash", where it shines and where it doesn't |
| 01 | [Setup, IEx and Mix](01-setup-iex-mix.md) | Noob | `iex`, `h` helper, `mix new`, project layout, running and testing code, Hex packages, formatter |
| 02 | [Types, operators and strings](02-types-operators-strings.md) | Noob | Integers, floats, atoms, booleans, strings vs charlists, lists, tuples, maps, keyword lists, immutability |
| 03 | [Pattern matching](03-pattern-matching.md) | Noob → Beginner | `=` is match, destructuring, the pin operator `^`, matching in function heads, `{:ok, _}` / `{:error, _}` |
| 04 | [Functions, modules and the pipe](04-functions-modules-pipe.md) | Beginner | Named and anonymous functions, arity, multi-clause functions, guards, default args, `|>`, `import`/`alias`/`use` |
| 05 | [Control flow](05-control-flow.md) | Beginner | `case`, `cond`, `if`/`unless`, guards; why there are no loops or early returns |
| 06 | [Collections: Enum, Stream, recursion](06-collections-enum-stream-recursion.md) | Beginner → Intermediate | Recursion, tail calls, `Enum`, comprehensions (`for`), lazy `Stream`, Map/Keyword APIs |
| 07 | [Structs, protocols and behaviours](07-structs-protocols-behaviours.md) | Intermediate | `defstruct`, updating structs, protocols (polymorphism), behaviours (interfaces), sigils |
| 08 | [Errors, `with` and typespecs](08-errors-with-and-typespecs.md) | Intermediate | Tagged tuples vs exceptions, `with`, `raise`/`rescue`, bang functions, `@spec`, Dialyzer, docs, doctests |

**Goal for this folder:** you can read any Elixir code in a Phoenix project and understand what it does.
