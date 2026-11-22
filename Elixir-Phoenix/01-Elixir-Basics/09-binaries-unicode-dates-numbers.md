# 09 · Binaries, Unicode, dates, times and numbers

> **Plain English:** this lesson covers the everyday data you'll handle in any real app: text (and the emoji and accents inside it), dates and times (with time zones), and money (where floats are dangerous).

## 1. Strings are binaries

> **In short:** A string is a **binary**, a sequence of bytes, holding UTF-8 text. One visible character can take several bytes.

```elixir
"hello" |> is_binary()         # true
byte_size("hello")             # 5
byte_size("héllo")             # 6  (é takes 2 bytes)
String.length("héllo")         # 5  (5 visible characters)

<<104, 105>>                   # "hi": you can write binaries as raw bytes
<<104, 105>> == "hi"           # true
"hi" <> <<0>>                  # <<104, 105, 0>>: no longer printable, so IEx shows the bytes
```

Analogy: a string is a **train of bytes**. Some characters fit in one carriage (`a`), others need two, three or four (`é`, `€`, `😀`).

## 2. Codepoints vs graphemes

> **In short:** A **codepoint** is one Unicode number, and a **grapheme** is what a human sees as one character, which can be several codepoints. `String` functions work on graphemes, which is what you want.

```elixir
?a                                  # 97: the codepoint of "a"
String.codepoints("é")              # ["é"] (one precomposed codepoint)
String.graphemes("👍🏽")             # ["👍🏽"]: 1 grapheme...
String.codepoints("👍🏽")            # ["👍", "🏽"]: ...made of 2 codepoints

String.reverse("noël")              # "lëon" (correct: it reverses graphemes, not bytes)
String.upcase("straße")             # "STRASSE"
String.normalize("é", :nfd)         # split into e + combining accent
String.valid?(<<0xFF>>)             # false: not valid UTF-8
```

Why care? If you slice a string by bytes (`binary_part/3`), you can cut a character in half. Use `String.slice/3`, which is grapheme-aware.

## 3. Binary pattern matching

> **In short:** You can pattern-match on bytes, which is great for parsing protocols, file headers and prefixes.

```elixir
# Prefix matching on strings (most common)
"user:" <> id = "user:42"            # id = "42"

# Fixed-size chunks
<<first::binary-size(3), rest::binary>> = "abcdef"
# first = "abc", rest = "def"

# Read numbers out of raw bytes (e.g. a network packet)
<<version::8, length::16, payload::binary>> = <<1, 0, 5, "hello">>
# version = 1, length = 5, payload = "hello"

# Detect file types by "magic bytes"
def file_type(<<0x89, "PNG", _::binary>>), do: :png
def file_type(<<0xFF, 0xD8, _::binary>>), do: :jpeg
def file_type(<<"%PDF", _::binary>>), do: :pdf
def file_type(_), do: :unknown
```

`::8` means 8 bits, `::16` means 16 bits, and `binary-size(n)` means n bytes. A **bitstring** is the general form (any number of bits); a **binary** is a bitstring whose size is a whole number of bytes.

## 4. Charlists (and why you'll rarely need them)

> **In short:** `~c"abc"` (shown as `'abc'` in old versions) is a list of codepoints. Some Erlang functions want charlists, so convert with `to_charlist/1` and `to_string/1`.

```elixir
~c"abc" == [97, 98, 99]             # true
to_charlist("abc")                  # ~c"abc"
to_string(~c"abc")                  # "abc"
:os.cmd(~c"date")                   # an Erlang function that returns a charlist
```

A classic surprise: `[104, 105]` prints as `~c"hi"` in IEx because the numbers happen to be printable characters. It's still just a list of integers.

## 5. IO lists: building output efficiently

> **In short:** Instead of joining strings with `<>` repeatedly, you can build a nested list of strings (an **IO list**) and hand it to output functions. Phoenix renders templates this way, which is one reason it's fast.

```elixir
html = ["<ul>", Enum.map(["a", "b"], &["<li>", &1, "</li>"]), "</ul>"]
IO.iodata_to_binary(html)           # "<ul><li>a</li><li>b</li></ul>"
IO.puts(html)                       # works directly, no joining needed
```

Building an IO list costs almost nothing, because no strings are copied until the very end.

## 6. Integers and floats

> **In short:** Integers are arbitrary precision (they never overflow). Floats are 64-bit IEEE, so `0.1 + 0.2` is not exactly `0.3`.

```elixir
2 ** 200                    # a huge exact integer
10 / 3                      # 3.3333333333333335 (/ always returns a float)
div(10, 3)                  # 3
rem(-7, 3)                  # -1 (the remainder takes the sign of the first number)
Integer.mod(-7, 3)          # 2 (true modulo)
0.1 + 0.2                   # 0.30000000000000004
Float.round(3.14159, 2)     # 3.14
round(2.5)                  # 3
trunc(2.9)                  # 2
Integer.to_string(255, 16)  # "FF"
Integer.digits(123)         # [1, 2, 3]
```

## 7. Money: use Decimal, never floats

> **In short:** For prices and balances use the **Decimal** library (Ecto's `:decimal` type), or store integer cents.

```elixir
# mix.exs: {:decimal, "~> 2.0"} (already included with Ecto)
a = Decimal.new("0.10")
b = Decimal.new("0.20")
Decimal.add(a, b)                    # Decimal.new("0.30") — exact
Decimal.mult(Decimal.new("19.99"), 3)
Decimal.compare(a, b)                # :lt
Decimal.round(Decimal.new("2.345"), 2)   # 2.35 (default rounding is :half_up)
Decimal.to_string(a)                 # "0.10"
```

In Ecto: `field :price, :decimal` in the schema and `add :price, :decimal, precision: 10, scale: 2` in the migration. The alternative is `field :price_cents, :integer`. Libraries such as **ex_money** add currencies.

## 8. Dates and times: the four types

> **In short:** `Date` (a calendar day), `Time` (a time of day), `NaiveDateTime` (date + time with **no** time zone) and `DateTime` (date + time **with** a time zone). Store timestamps in UTC as `DateTime`.

| Type | Example | Sigil | Use for |
| --- | --- | --- | --- |
| `Date` | 2026-11-17 | `~D[2026-11-17]` | Birthdays, due dates |
| `Time` | 14:30:00 | `~T[14:30:00]` | Opening hours |
| `NaiveDateTime` | 2026-11-17 14:30:00 | `~N[2026-11-17 14:30:00]` | Avoid for real events: "naive" means it has no zone |
| `DateTime` | 2026-11-17 14:30:00Z | `~U[2026-11-17 14:30:00Z]` | Real moments in time: created_at, sent_at |

```elixir
Date.utc_today()                          # ~D[2026-11-17]
DateTime.utc_now()                        # ~U[2026-11-17 09:12:45.123456Z]
Date.add(~D[2026-11-17], 30)              # ~D[2026-12-17]
Date.diff(~D[2026-12-25], ~D[2026-11-17]) # 38 days
Date.day_of_week(~D[2026-11-17])          # 2 (Tuesday; Monday is 1)
Date.beginning_of_month(~D[2026-11-17])   # ~D[2026-11-01]
DateTime.add(DateTime.utc_now(), 3600, :second)
DateTime.diff(later, earlier, :minute)
Date.from_iso8601("2026-11-17")           # {:ok, ~D[2026-11-17]}
DateTime.from_iso8601("2026-11-17T10:00:00+05:30")   # {:ok, ~U[2026-11-17 04:30:00Z], 19800}
DateTime.to_iso8601(dt)
Calendar.strftime(dt, "%d %b %Y, %H:%M")  # "17 Nov 2026, 09:12"

# Elixir 1.17+: Duration and shift (respects month lengths)
Date.shift(~D[2026-01-31], month: 1)      # ~D[2026-02-28]
DateTime.shift(DateTime.utc_now(), hour: 2, minute: 30)
```

### Comparing dates: a classic trap

> **In short:** Don't compare dates with `<` or `>`. Those compare the **struct fields** in a fixed order and can give wrong answers. Use `Date.compare/2`, `Date.before?/2` or `Date.after?/2`.

```elixir
~D[2026-12-01] > ~D[2026-11-30]          # don't do this: it's a structural comparison and can be wrong
Date.compare(~D[2026-12-01], ~D[2026-11-30])   # :gt
Date.after?(~D[2026-12-01], ~D[2026-11-30])    # true (Elixir 1.15+)
Enum.sort(dates, Date)                    # sort dates correctly by passing the module
Enum.max(dates, Date)
```

### Time zones

> **In short:** Elixir ships only UTC. To convert to "Asia/Kolkata" and other zones, add a time zone database such as **tz** or **tzdata**.

```elixir
# mix.exs: {:tz, "~> 0.28"}
# config/config.exs:
config :elixir, :time_zone_database, Tz.TimeZoneDatabase

DateTime.now!("Asia/Kolkata")
DateTime.shift_zone!(~U[2026-11-17 09:00:00Z], "America/New_York")
```

**Rule of thumb:** store UTC in the database (`timestamps(type: :utc_datetime)`), keep the user's zone in their profile, and convert only when you **display** a time.

### Ecto date and time types

| Ecto type | Elixir value |
| --- | --- |
| `:date` | `Date` |
| `:time` | `Time` |
| `:naive_datetime` / `:naive_datetime_usec` | `NaiveDateTime` (the old Phoenix default for timestamps) |
| `:utc_datetime` / `:utc_datetime_usec` | `DateTime` in UTC (seconds / microseconds) |

### Measuring durations

Use `System.monotonic_time/1` to measure how long something takes. Wall-clock time can jump (NTP adjustments, daylight saving), but monotonic time never goes backwards.

```elixir
start = System.monotonic_time(:millisecond)
do_work()
elapsed = System.monotonic_time(:millisecond) - start

{microseconds, result} = :timer.tc(fn -> do_work() end)
```

## 9. Random values and IDs

```elixir
Enum.random(1..100)
:rand.uniform(6)                                   # 1..6 (not cryptographically secure)
:crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)   # secure token
Ecto.UUID.generate()                               # "6f1c..."
System.unique_integer([:positive])                 # unique within this VM run
```

## Exercises

1. Write `initials/1`: `"Anoop Vikraman"` → `"AV"`. Make it handle accented names like `"Élodie Durand"`.
2. Write `file_type/1` using binary pattern matching for PNG, JPEG and PDF, and test it with `File.read!/1` on real files.
3. Compute an order total with Decimal for 3 items at "19.99" plus 18% tax, rounded to 2 places.
4. Given a list of `Date`s, find the earliest one correctly, and show why `Enum.min/1` without `Date` can be wrong.
5. Convert `~U[2026-11-17 09:00:00Z]` to Asia/Kolkata and America/New_York (add `tz`).

## Interview questions

<details>
<summary>Why do String.length and byte_size give different answers?</summary>

Strings are UTF-8 binaries. `byte_size/1` counts bytes, while `String.length/1` counts graphemes (what users perceive as characters). Non-ASCII characters take 2–4 bytes, and some graphemes (emoji with skin tones, letters with combining accents) are made of several codepoints.

</details>

<details>
<summary>How should you handle money in Elixir?</summary>

Never with floats, because binary floating point can't represent values like 0.1 exactly. Use the `Decimal` library (Ecto `:decimal` with precision and scale) or store integer minor units (cents). Do the arithmetic with `Decimal` functions and round explicitly.

</details>

<details>
<summary>What's the difference between NaiveDateTime and DateTime?</summary>

`NaiveDateTime` has a date and time but no time zone, so it can't be placed on the global timeline unambiguously. `DateTime` includes a zone (usually UTC). Store event timestamps as UTC `DateTime` and convert to the user's zone for display, which needs a time zone database such as `tz` or `tzdata`.

</details>

<details>
<summary>Why can't you compare dates with > in Elixir?</summary>

Comparison operators on structs compare their internal fields structurally, not chronologically, so results can be wrong. Use `Date.compare/2` (or `DateTime.compare/2`), the `before?`/`after?` helpers, and pass the module to sorting functions: `Enum.sort(dates, Date)`.

</details>
