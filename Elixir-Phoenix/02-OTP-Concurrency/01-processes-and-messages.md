# 01 · Processes and messages

## 1. Spawning a process

> **In short:** `spawn(fn -> ... end)` starts a new process and returns its **PID** (process identifier). It runs concurrently and exits when its function finishes.

```elixir
pid = spawn(fn -> IO.puts("Hello from #{inspect(self())}") end)
# Hello from #PID<0.115.0>
Process.alive?(pid)   # false: it already finished

self()                # the PID of the current process (your IEx shell is a process too)
```

Spawn 100k processes to feel how cheap they are:

```elixir
for i <- 1..100_000, do: spawn(fn -> Process.sleep(1000); i end)
:erlang.system_info(:process_count)   # ~100k+
```

## 2. Sending and receiving messages

> **In short:** `send(pid, msg)` drops a message into the target's **mailbox** without blocking. `receive` takes the first message that matches a pattern, and waits if none has arrived yet.

```elixir
parent = self()

child = spawn(fn ->
  receive do
    {:greet, name, from} -> send(from, {:reply, "Hello #{name}"})
  end
end)

send(child, {:greet, "Anoop", parent})

receive do
  {:reply, msg} -> IO.puts(msg)
after
  1_000 -> IO.puts("timed out")     # never wait forever
end
```

Key facts:
- Messages are **copied** between processes (there's no shared memory). Large binaries over 64 bytes are reference-counted and shared, as an optimisation.
- Each process has **one mailbox**, which is a queue.
- `receive` scans the mailbox for the **first message matching any pattern**. Non-matching messages stay in the queue. Beware: if unmatched messages pile up, every `receive` scans them all and gets slower. This is a classic production issue.
- Message order is guaranteed **between a given pair** of processes.
- Include `self()` in a message so the receiver knows where to reply. This is the request/response pattern GenServer formalises.

## 3. A stateful process: the core idea behind GenServer

> **In short:** A process keeps state by calling itself recursively with new state after handling each message. That's an infinite tail-recursive loop.

```elixir
defmodule Counter do
  def start(initial \\ 0), do: spawn(fn -> loop(initial) end)

  defp loop(count) do
    receive do
      {:inc, by} ->
        loop(count + by)

      {:get, from} ->
        send(from, {:count, count})
        loop(count)

      :stop ->
        :ok    # don't recurse, so the process exits
    end
  end
end

pid = Counter.start()
send(pid, {:inc, 5})
send(pid, {:inc, 2})
send(pid, {:get, self()})
receive do {:count, c} -> c end   # 7
```

This is the most important insight in this folder: **state lives in a process and changes only by handling messages one at a time.** No locks are needed, because a process handles exactly one message at a time. Compare a JS class with a mutable field: here the "object" is a process, and "method calls" are messages.

GenServer (next lesson) is this exact loop, plus standard handling for replies, timeouts, errors, naming and debugging.

## 4. Links: dying together

> **In short:** Linked processes propagate crashes to each other. If one dies abnormally, the other dies too, unless it **traps exits**.

```elixir
spawn_link(fn -> raise "boom" end)
# Your IEx shell crashes too (IEx restarts it). That's because the two processes were linked.
```

```elixir
Process.flag(:trap_exit, true)     # turn exit signals into messages
pid = spawn_link(fn -> raise "boom" end)
receive do
  {:EXIT, ^pid, reason} -> IO.inspect(reason, label: "child died")
end
```

**Supervisors are exactly this:** processes that trap exits, link to their children, and restart them when they get `{:EXIT, ...}`.

## 5. Monitors: watching without dying

> **In short:** A monitor is one-way. You get a `:DOWN` message when the watched process dies, and nothing happens to you.

```elixir
pid = spawn(fn -> Process.sleep(500); exit(:normal) end)
ref = Process.monitor(pid)

receive do
  {:DOWN, ^ref, :process, ^pid, reason} -> IO.puts("exited: #{inspect(reason)}")
end
```

| | Link | Monitor |
| --- | --- | --- |
| Direction | Bidirectional | One-way |
| Effect | Crash propagates (unless trapping exits) | You receive a `:DOWN` message |
| Used for | Supervision; processes that can't live without each other | Watching a process you depend on: a client watching a server, Phoenix Presence watching channel processes |

## 6. Exit reasons

> **In short:** `:normal` means a clean exit (linked processes aren't killed). Anything else is abnormal and propagates through links.

- `:normal`: finished cleanly
- `:shutdown` / `{:shutdown, term}`: orderly shutdown (supervisors use it)
- `:kill`: untrappable, an immediate kill (`Process.exit(pid, :kill)`)
- Any other term: a crash (for example `{%RuntimeError{}, stacktrace}`)

## 7. Registered names

> **In short:** You can register a process under an atom so others can message it without knowing its PID.

```elixir
pid = Counter.start()
Process.register(pid, :my_counter)
send(:my_counter, {:inc, 1})
```

## 8. Inspecting processes

```elixir
Process.info(pid)                 # memory, mailbox length, current function...
Process.info(pid, :message_queue_len)
:observer.start()                 # GUI: all processes, supervision trees, memory (needs wx installed)
```

`:observer` (or the **Phoenix LiveDashboard**, which works in the browser) is a fantastic interview talking point: you can watch the live system.

## Exercises

1. Write a `Ping` process that replies `:pong` to `{:ping, from}`. Send it 3 pings.
2. Extend `Counter` with `{:dec, by}` and `{:reset}`.
3. Spawn 10 processes that each sleep a random 0–1000 ms and then send their number to the parent. Collect all 10 replies with `receive` in a loop, and notice they arrive out of order.
4. Link a process that crashes after 1 second. First observe the shell crashing, then trap exits and receive the `:EXIT` message instead.

## Interview questions

<details>
<summary>How do processes communicate in Elixir?</summary>

Only through asynchronous **message passing**. `send/2` copies the message into the receiver's mailbox and returns immediately. The receiver uses `receive` with pattern matching to take messages out. There's no shared memory, so there are no locks and no data races between processes.

</details>

<details>
<summary>How can a process hold state if data is immutable?</summary>

A process runs a recursive loop: it waits for a message, computes new state from the old state plus the message, and calls itself with the new state. The state is just the argument of the loop function. Because a process handles one message at a time, state updates are serialized without locks. GenServer formalizes this pattern.

</details>

<details>
<summary>What's the difference between a link and a monitor?</summary>

A link is bidirectional: if either process exits abnormally, the other gets an exit signal and dies too, unless it traps exits (then it receives an `{:EXIT, pid, reason}` message). Supervisors are built on links. A monitor is one-way and non-fatal: the monitoring process gets a `{:DOWN, ref, :process, pid, reason}` message when the monitored one dies. Use monitors when you just need to know a process died.

</details>

<details>
<summary>What can go wrong with a process mailbox?</summary>

If messages arrive faster than the process handles them, or if they never match any `receive` pattern, the mailbox grows without bound. Memory grows, and selective receive gets slower because it scans the whole queue. Fixes: add a catch-all clause (`handle_info` that logs unexpected messages), apply back-pressure (use `call` instead of `cast`, or GenStage/Broadway), or spread the load across more processes.

</details>
