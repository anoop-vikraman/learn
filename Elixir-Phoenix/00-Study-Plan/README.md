# 00 · Study plan: Elixir + Phoenix in ~4 weeks

You need to (1) learn the language, (2) build a trial project, and (3) pass an interview. This plan runs all three in parallel from week 2, so you aren't left with an untested project at the end.

## 1. Install (day 1, 30 minutes)

> **In short:** Install Erlang + Elixir with a version manager, then Postgres, then the Phoenix project generator.

```bash
# macOS — recommended: mise (or asdf) so you can pin versions per project
brew install mise
mise use -g erlang@27 elixir@1.18      # takes a while: Erlang compiles from source
# Simpler alternative if you don't care about pinning:
# brew install elixir

elixir --version            # Erlang/OTP 27 ... Elixir 1.18.x

# Postgres (Phoenix's default database)
brew install postgresql@16 && brew services start postgresql@16
# or: docker run -d --name pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16

# Package manager + Phoenix generator
mix local.hex --force
mix archive.install hex phx_new --force
mix phx.new --version       # Phoenix installer v1.8.x
```

**Editor:** VS Code with the **ElixirLS** extension (or the newer official **Expert** language server if available). Turn on format-on-save; Elixir has one official formatter (`mix format`) and everyone uses it.

## 2. Weekly plan

> **In short:** Week 1: language. Week 2: OTP + Phoenix basics + start the project. Week 3: LiveView + finish the project. Week 4: polish, testing, deploy, interview drills.

| Week | Learn | Build | Done when you can… |
| --- | --- | --- | --- |
| **1** | [01-Elixir-Basics](../01-Elixir-Basics/) 00 → 08 | Solve 10–15 small exercises (see below) in `iex` / a Mix project | Explain pattern matching and immutability; write a module with multi-clause functions and pipes; use `Enum.reduce`, `with`, and structs without looking things up |
| **2** | [02-OTP-Concurrency](../02-OTP-Concurrency/) all + [03-Phoenix](../03-Phoenix/) 01 → 04 | [Trial project](../06-Trial-Project/) steps 1–4: generate app, schema + migrations, context, JSON API | Draw the supervision tree of a Phoenix app; write a GenServer from memory; explain conn → endpoint → router → pipeline → controller |
| **3** | [03-Phoenix](../03-Phoenix/) 05 → 06 + [04-LiveView](../04-LiveView/) all | Trial project steps 5–8: auth, LiveView board, real-time updates with PubSub, presence | Explain the LiveView lifecycle (`mount` twice!), use streams, broadcast changes to all tabs |
| **4** | [05-Testing-and-Production](../05-Testing-and-Production/) + [07-Interview-Prep](../07-Interview-Prep/) | Trial project steps 9–11: Oban job, tests, Docker/deploy, README | Answer every question in `07/01` out loud; demo the project in 5 minutes |

**Short on time (2 weeks)?** Do: 01 (lessons 00–06), 02 (lessons 01–03), 03 (01–04), 04 (01–02), the trial project's core steps, and the interview file. Skip ETS, Presence, uploads and deployment details.

## 3. Daily routine (2–3 hours)

> **In short:** Read for 30 minutes, type code for 90, and spend 15 minutes saying answers out loud.

1. **30 min:** read one lesson (skim the `In short` lines first).
2. **60–90 min:** type every example into `iex` or the project, then do the exercises.
3. **15 min:** answer that lesson's interview questions **out loud** before expanding them.
4. **5 min:** write down one thing that surprised you. Those surprises are what interviewers ask about.

## 4. Week 1 practice exercises

> **In short:** Small puzzles that force you to use pattern matching and recursion instead of loops.

Create a scratch project with `mix new practice`, put the solutions in `lib/`, and test them with `mix test`.

1. `sum/1`, `max/1`, and `reverse/1` of a list, written with recursion and no `Enum`.
2. FizzBuzz using a multi-clause function on `{rem(n,3), rem(n,5)}`.
3. Count word frequencies in a string, returning `%{"the" => 3, ...}` (use `String.split`, then `Enum.frequencies`, then write it again with `Enum.reduce`).
4. Flatten a nested list without `List.flatten`.
5. Parse `"name=Anoop;age=30"` into a map.
6. Implement a `BankAccount` struct with `deposit/2` and `withdraw/2` that return `{:ok, account}` or `{:error, :insufficient_funds}`.
7. Chain three functions that can each fail with `with`.
8. Run-length encoding: `"AAABBC"` → `"3A2B1C"`.
9. Group a list of `%{name, dept}` maps by dept.
10. A `Stack` GenServer with `push/pop` (once you reach week 2).

Extra practice: **Exercism's Elixir track** (exercism.org/tracks/elixir) has a well-designed syllabus with mentoring. Do its "learning exercises" in order during week 1.

## 5. Best external resources

> **In short:** Use the official guides first, then Exercism, then books if you have time.

| Resource | Use it for |
| --- | --- |
| elixir-lang.org → *Getting Started* guide | The official tour of the language, short and accurate |
| hexdocs.pm/elixir, hexdocs.pm/phoenix, hexdocs.pm/phoenix_live_view, hexdocs.pm/ecto | The API reference. Elixir docs are excellent, so read them before searching elsewhere |
| Exercism Elixir track | Graded practice exercises |
| *Elixir in Action* (Saša Jurić) | The best book on OTP and the "why" behind it |
| *Programming Phoenix LiveView* (Tate & DeBenedetto) | LiveView in depth |
| ElixirForum.com | Community Q&A, very helpful |
| `h Enum.map` inside `iex` | Docs in your terminal, often the fastest way to look something up |

## 6. Interview-day checklist

- [ ] Trial project runs from a clean clone, with setup steps in its README
- [ ] You can explain *why* you chose contexts, LiveView vs API, PubSub, Oban
- [ ] You know your project's supervision tree (`lib/my_app/application.ex`)
- [ ] You can name 3 trade-offs of Elixir (smaller ecosystem/hiring pool, not ideal for raw CPU-heavy number crunching, learning curve of OTP)
- [ ] You've re-read [07-Interview-Prep/02-cheat-sheet.md](../07-Interview-Prep/02-cheat-sheet.md)
