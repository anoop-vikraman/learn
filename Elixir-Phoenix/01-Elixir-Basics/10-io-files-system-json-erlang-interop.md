# 10 · IO, files, the system, JSON and Erlang interop

> **Plain English:** how an Elixir program talks to the outside world: printing to the terminal, reading and writing files, running shell commands, reading environment variables, converting JSON, and borrowing the huge Erlang standard library.

## 1. IO: printing and reading

> **In short:** `IO.puts` prints a line, `IO.inspect` prints any value for debugging (and returns it), and `IO.gets` reads input.

```elixir
IO.puts("Hello")                    # prints a string plus a newline
IO.write("no newline")
IO.inspect(%{a: 1})                 # prints %{a: 1} and returns it
IO.inspect(list, label: "list")     # list: [1, 2, 3]
IO.inspect(big, limit: :infinity, pretty: true)
name = IO.gets("Your name? ") |> String.trim()
IO.puts(:stderr, "to standard error")
```

`IO.puts(123)` fails, because it wants a string or chardata. Use `IO.puts("#{123}")` or `IO.inspect(123)`.

`inspect/1` (without `IO.`) turns any value into a printable **string**: `"Got: #{inspect(value)}"`.

## 2. Files

> **In short:** Use the `File` module to read, write and list files. Most functions have a safe version returning `{:ok, _}` / `{:error, _}` and a bang `!` version that raises.

```elixir
File.write("notes.txt", "line 1\n")             # :ok (creates or overwrites)
File.write("notes.txt", "line 2\n", [:append])
File.read("notes.txt")                          # {:ok, "line 1\nline 2\n"}
File.read!("missing.txt")                       # raises File.Error
File.exists?("notes.txt")                       # true
File.ls!(".")                                   # ["mix.exs", "lib", ...]
File.mkdir_p!("tmp/uploads")                    # like mkdir -p
File.cp!("a.txt", "b.txt")
File.rename!("b.txt", "c.txt")
File.rm!("c.txt")
File.rm_rf!("tmp")                              # careful: recursive delete
File.stat!("notes.txt").size

# Big files: stream them line by line (constant memory)
File.stream!("access.log")
|> Stream.filter(&String.contains?(&1, " 500 "))
|> Enum.count()

# Write a stream to a file
1..1_000_000 |> Stream.map(&"#{&1}\n") |> Stream.into(File.stream!("numbers.txt")) |> Stream.run()
```

Common error reasons: `:enoent` (no such file), `:eacces` (permission denied), `:eisdir` (it's a directory).

### Paths

```elixir
Path.join(["priv", "static", "logo.png"])   # "priv/static/logo.png"
Path.basename("/a/b/photo.jpg")             # "photo.jpg"
Path.extname("photo.jpg")                   # ".jpg"
Path.rootname("photo.jpg")                  # "photo"
Path.dirname("/a/b/photo.jpg")              # "/a/b"
Path.expand("~/projects")                   # absolute path
Path.wildcard("lib/**/*.ex")                # glob
Application.app_dir(:my_app, "priv/data.json")   # works inside releases, unlike relative paths
```

**In a release, don't use relative paths like `"priv/..."`.** The working directory may be different. Use `Application.app_dir/2` or `:code.priv_dir(:my_app)`.

## 3. System: environment, commands, time

```elixir
System.get_env("HOME")                       # "/Users/you" or nil
System.get_env("PORT", "4000")               # with a default
System.fetch_env!("DATABASE_URL")            # raises if missing (good for required config)
System.cmd("git", ["rev-parse", "HEAD"])     # {"a1b2c3...\n", 0}  (output, exit status)
System.cmd("ls", ["-la"], cd: "/tmp", stderr_to_stdout: true)
System.os_time(:second)                      # Unix timestamp
System.monotonic_time(:millisecond)          # for measuring durations
System.schedulers_online()                   # number of CPU cores in use
System.halt(0)                               # stop the VM
```

`System.cmd/3` passes arguments as a list, so there's **no shell injection** (no shell is involved). Never build commands with string interpolation from user input.

## 4. JSON

> **In short:** Elixir 1.18+ has a built-in `JSON` module. Most existing projects use the **Jason** library, which has the same API shape.

```elixir
# Built in (Elixir 1.18+)
JSON.encode!(%{name: "Ana", tags: ["a", "b"]})   # "{\"name\":\"Ana\",\"tags\":[\"a\",\"b\"]}"
JSON.decode!(~s({"name": "Ana"}))                # %{"name" => "Ana"}  (string keys!)
JSON.decode("not json")                          # {:error, ...}

# Jason (very common)
Jason.encode!(%{a: 1}, pretty: true)
Jason.decode!(json, keys: :atoms)                # atom keys: ONLY for trusted input
```

Decoded JSON always has **string keys**. Atoms are never garbage-collected (see lesson 02), so don't turn untrusted JSON keys into atoms.

Encoding your own structs needs a protocol implementation:

```elixir
defmodule User do
  @derive {JSON.Encoder, only: [:id, :name]}     # or {Jason.Encoder, only: [...]}
  defstruct [:id, :name, :password_hash]
end
```

## 5. Talking to Erlang

> **In short:** Every Erlang module is available as an **atom**: `:crypto`, `:timer`, `:ets`, `:rand`, `:math`, `:queue`... Erlang strings are charlists, so convert when needed.

```elixir
:math.sqrt(16)                               # 4.0
:math.pi()
:timer.sleep(100)                            # same as Process.sleep/1
:timer.minutes(5)                            # 300000 (milliseconds)
:crypto.hash(:sha256, "hello") |> Base.encode16(case: :lower)
:crypto.mac(:hmac, :sha256, "secret", "message") |> Base.encode16(case: :lower)
:rand.uniform(100)
:queue.new() |> then(&:queue.in(1, &1))      # an efficient FIFO queue
:erlang.system_info(:process_count)
:erlang.memory()
:observer.start()                            # GUI tool
:zlib.gzip("text")
:calendar.local_time()
```

Reading Erlang docs: `lists:reverse/1` in Erlang is `:lists.reverse/1` in Elixir. Erlang variables start with a capital letter, and Erlang atoms are lowercase without a colon.

## 6. Encoding helpers

```elixir
Base.encode64("hi")                  # "aGk="
Base.decode64!("aGk=")               # "hi"
Base.url_encode64(bytes, padding: false)
Base.encode16(<<255>>)               # "FF"
URI.encode_query(%{q: "elixir lang", page: 2})   # "page=2&q=elixir+lang"
URI.decode_query("a=1&b=2")          # %{"a" => "1", "b" => "2"}
URI.parse("https://x.com/path?q=1")  # %URI{host: "x.com", path: "/path", query: "q=1", ...}
```

## 7. Calling code in other languages: ports and NIFs

> **In short:** A **Port** runs an external program and talks to it over stdin/stdout, which is safe because a crash stays outside the VM. A **NIF** loads native C or Rust code into the VM, which is fast but dangerous: a crash there takes down the whole VM.

| Option | Speed | Safety | Typical use |
| --- | --- | --- | --- |
| `System.cmd` | Slow (starts a process each call) | Safe | One-off commands: ffmpeg, git |
| **Port** | Medium | Safe (separate OS process) | A long-running external program (e.g. a Python ML script) |
| **NIF** (via **Rustler** for Rust) | Fastest | Risky: a crash or a long-running call harms the VM | Hot loops, image processing, parsing |
| **Nx** (numerical Elixir) | Fast, can use the GPU | Safe | ML, tensors |

```elixir
port = Port.open({:spawn, "python3 -u worker.py"}, [:binary, :exit_status])
Port.command(port, "hello\n")
receive do
  {^port, {:data, data}} -> IO.puts("Python said: #{data}")
end
```

Interview tip: if someone says "Elixir is slow at number crunching", the answer is "use Rustler NIFs or Nx for the hot path, and keep the BEAM for concurrency and orchestration".

## 8. Scripts with dependencies: `Mix.install`

> **In short:** In a single `.exs` file you can install packages on the fly, which is perfect for experiments.

```elixir
# try.exs (run with: elixir try.exs)
Mix.install([{:req, "~> 0.5"}])

Req.get!("https://api.github.com/repos/elixir-lang/elixir").body["stargazers_count"]
|> IO.inspect(label: "stars")
```

## Exercises

1. Write a script that reads a CSV file of `name,score` lines, skips the header, and prints the average score. Use `File.stream!` and `String.split`.
2. Write `sha256_file/1` that streams a large file through `:crypto.hash_init`/`hash_update`/`hash_final`.
3. Use `System.cmd("git", ["log", "--oneline", "-5"])` to print your last 5 commits.
4. Decode a JSON array of users, filter to active ones and encode the result back to JSON.
5. Write a `Mix.install` script that calls a public API with `Req` and prints one field.

## Interview questions

<details>
<summary>What's the difference between a Port and a NIF?</summary>

A Port runs an external OS process and communicates by message passing over stdin/stdout. It's isolated, so if it crashes the VM is unaffected. A NIF is native code loaded into the VM and called like a normal function. It's very fast, but a crash brings down the whole VM, and long-running NIFs can block schedulers (unless they're "dirty" NIFs). Rustler makes NIFs much safer by writing them in Rust.

</details>

<details>
<summary>How do you read a 10 GB file in Elixir without running out of memory?</summary>

Use `File.stream!/1`, which reads lazily, line by line or in chunks, and compose `Stream` functions before a final `Enum` call or `Stream.run/1`. Only a small buffer is in memory at once. For parallel processing, add `Task.async_stream` or Flow.

</details>

<details>
<summary>Why shouldn't you use relative paths to priv/ in production?</summary>

In a release, the current working directory is not your project root. Use `Application.app_dir(:my_app, "priv/...")` or `:code.priv_dir(:my_app)` to get the correct absolute path in every environment.

</details>
