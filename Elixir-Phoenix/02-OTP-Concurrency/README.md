# 02 · OTP and concurrency

This is what makes Elixir different from every other language you know. Interviewers **will** ask about GenServers and supervisors.

| # | Lesson | Level | You will learn |
| --- | --- | --- | --- |
| 01 | [Processes and messages](01-processes-and-messages.md) | Beginner | `spawn`, `send`, `receive`, mailboxes, PIDs, links, monitors, a hand-written stateful loop |
| 02 | [GenServer](02-genserver.md) | Intermediate | `call` vs `cast`, `handle_info`, state, timeouts, naming, a rate limiter and a cache, common pitfalls |
| 03 | [Supervisors and applications](03-supervisors-and-applications.md) | Intermediate | Supervision trees, strategies, restart options, `DynamicSupervisor`, Application, "let it crash" in practice |
| 04 | [Tasks, Agents, Registry and ETS](04-tasks-agents-registry-ets.md) | Intermediate → Pro | `Task.async/await`, `Task.async_stream`, `Task.Supervisor`, Agent, Registry, ETS tables, distribution basics |

**Mental model to keep:** every stateful "thing" in an Elixir system (a cache, a connection, a game room, a chat session) is a **process** holding its own state, receiving messages, and supervised by someone.
