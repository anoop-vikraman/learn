# 02 · Types, operators and strings

> **Plain English:** These are the building blocks of all data: numbers, text, true/false, *atoms* (named labels like `:ok`), and containers (lists, tuples, maps). The big difference from JavaScript is that **nothing can be changed in place**. Every "change" gives you a new copy, like saving a new version of a document instead of editing the original.

Type everything here into `iex`.

## 1. Immutability first

> **In short:** Data never changes in place. Functions return **new** data, and variables can be **rebound** but values are never mutated.

```elixir
list = [1, 2, 3]
List.delete(list, 1)   # => [2, 3]   (returns a new list)
list                   # => [1, 2, 3] (unchanged!)

x = 1
x = 2                  # allowed: "rebinding" the name x to a new value
```

In JS, `arr.push(4)` mutates `arr`. In Elixir nothing has methods that mutate. You always write `new = transform(old)`. It feels odd for a week, and then it makes code much easier to reason about. Immutability is also what makes sharing data between processes safe.

## 2. Basic types

> **In short:** integers, floats, booleans, **atoms**, strings, and `nil`. Atoms are named constants like `:ok`.

```elixir
42                 # integer (arbitrary precision: 2 ** 100 just works)
1_000_000          # underscores for readability
0xFF               # 255
3.14               # float
true / false       # booleans (they're actually the atoms :true / :false)
nil                # "nothing" (also an atom, :nil)
:ok                # atom
:error
"hello"            # string (UTF-8 binary)
'hello'            # charlist (list of codepoints), mostly for Erlang interop;
                   # newer versions print it as ~c"hello"

is_integer(1)      # true
is_atom(:ok)       # true
is_binary("hi")    # true: strings are binaries
```

### Atoms

> **In short:** An atom is a constant whose value is its own name. They're used for status tags, map keys and module names.

```elixir
:ok
:not_found
:"with spaces"     # quoted atom
String             # module names are atoms too: String == :"Elixir.String"
:crypto            # Erlang modules are lowercase atoms
```

You'll see atoms everywhere in return values: `{:ok, user}` and `{:error, :not_found}`. **Don't create atoms from user input** (e.g. `String.to_atom(params["x"])`). Atoms are never garbage-collected, and the atom table has a limit (~1M), so attackers can crash your VM. Use `String.to_existing_atom/1` instead.

## 3. Operators

> **In short:** Mostly familiar, with a few differences: `<>` joins strings, `++`/`--` work on lists, `div`/`rem` do integer division, and `and/or/not` require booleans.

```elixir
1 + 2              # 3
10 / 2             # 5.0   (/ ALWAYS returns a float)
div(10, 3)         # 3     integer division
rem(10, 3)         # 1     remainder
"a" <> "b"         # "ab"
[1, 2] ++ [3]      # [1, 2, 3]
[1, 2, 3] -- [2]   # [1, 3]

1 == 1.0           # true  (value equality)
1 === 1.0          # false (strict: type too)
1 != 2

true and false     # strict: left side must be a boolean
nil || "default"   # "default"  (||, && and ! accept any value: only nil and false are falsy)
!nil               # true
```

**Truthiness:** only `false` and `nil` are falsy. `0`, `""` and `[]` are **truthy**, which is different from JS.

## 4. Strings

> **In short:** Strings are UTF-8 binaries in double quotes. Use the `String` module, `#{}` interpolation and `<>`.

```elixir
name = "José"
"Hi #{name}"                    # interpolation
String.length(name)             # 4 (graphemes)
byte_size(name)                 # 5 (é is 2 bytes)
String.upcase("hi")             # "HI"
String.split("a,b,c", ",")      # ["a", "b", "c"]
String.trim("  hi  ")           # "hi"
String.replace("hello", "l", "L")  # "heLLo"
String.contains?("hello", "ell")   # true  (functions ending in ? return booleans)
String.to_integer("42")         # 42
Integer.to_string(42)           # "42"
Integer.parse("42abc")          # {42, "abc"}

"""
Multi-line
string (heredoc)
"""
```

Sigils (shortcuts):

```elixir
~s(a "quoted" string)   # string without escaping quotes
~w(apple banana cherry) # ["apple", "banana", "cherry"]  (word list)
~w(a b c)a              # [:a, :b, :c]
~r/\d+/                 # regex
Regex.match?(~r/\d+/, "abc123")  # true
```

## 5. Collections

> **In short:** Use **lists** for sequences, **tuples** for fixed-size groups, **maps** for key-value data, and **keyword lists** for options.

### Lists: linked lists

```elixir
list = [1, 2, 3]
[0 | list]          # [0, 1, 2, 3] prepend is O(1)
list ++ [4]         # append is O(n): it copies the whole list
hd(list)            # 1
tl(list)            # [2, 3]
length(list)        # 3, O(n)
Enum.at(list, 1)    # 2, O(n): there's no fast index access
```

Lists are **linked lists**, not arrays. Prepend and then reverse if needed. A list is `[head | tail]`, and `[1, 2, 3]` is really `[1 | [2 | [3 | []]]]`.

### Tuples: fixed size, contiguous

```elixir
t = {:ok, "data", 42}
elem(t, 1)          # "data", O(1) access
tuple_size(t)       # 3
put_elem(t, 2, 99)  # {:ok, "data", 99}  (new tuple)
```

Use tuples for **return values** (`{:ok, result}`) and small fixed groups. They're not for iterating over.

### Maps: key-value store

```elixir
user = %{"name" => "Anoop", "age" => 30}   # any key type
user = %{name: "Anoop", age: 30}           # atom keys: shorthand syntax

user.name                  # "Anoop"  (dot access works only for atom keys; raises if the key is missing)
user[:name]                # "Anoop"  (returns nil if the key is missing)
Map.get(user, :email, "n/a")  # with a default
Map.put(user, :email, "a@b.c")
%{user | age: 31}          # update syntax: the key MUST already exist
Map.delete(user, :age)
Map.keys(user)             # [:age, :name]
Map.merge(user, %{city: "Kochi"})
Map.has_key?(user, :name)  # true
```

Rule of thumb: **atom keys** for data you control internally, **string keys** for external input (JSON, form params). Phoenix gives you params with string keys.

### Keyword lists: lists of `{atom, value}` tuples

```elixir
opts = [timeout: 5000, retries: 3]
# same as [{:timeout, 5000}, {:retries, 3}]
opts[:timeout]             # 5000
Keyword.get(opts, :retries, 1)
```

They're used for **function options**. Keys can repeat and order is kept. When a keyword list is the last argument you can drop the brackets:

```elixir
String.split("a b  c", " ", trim: true)   # really String.split("a b  c", " ", [trim: true])
```

That's why Ecto queries and Phoenix routes look like DSLs: `from u in User, where: u.age > 18, select: u`.

### Ranges

```elixir
1..5                # inclusive range
Enum.to_list(1..5)  # [1, 2, 3, 4, 5]
1..10//2            # step: 1, 3, 5, 7, 9
```

## 6. Quick comparison with JS

| JS | Elixir |
| --- | --- |
| `const x = {a: 1}` | `x = %{a: 1}` |
| `x.a = 2` (mutates) | `x = %{x \| a: 2}` (new map) |
| `[...arr, 4]` | `arr ++ [4]` (or prepend: `[4 \| arr]`) |
| `` `Hi ${name}` `` | `"Hi #{name}"` |
| `null` / `undefined` | `nil` |
| `"ok"` string constants | `:ok` atoms |
| `arr[1]` | `Enum.at(list, 1)` (slow), or use a tuple/map |

## Exercises

1. Make a map `%{name: ..., skills: [...]}`, then add a skill (returning a new map) and print both maps to confirm the original didn't change.
2. Convert `"10,20,30"` into the integer sum `60`. Hint: `String.split` + `Enum.map(&String.to_integer/1)` + `Enum.sum`.
3. What do `[] || 1`, `0 && :yes` and `nil && :yes` return? Predict first, then check.
4. Why is `list ++ [x]` inside a loop slow? What's the alternative?

## Interview questions

<details>
<summary>What's the difference between a list and a tuple?</summary>

A list is a **linked list**: prepending is O(1), length and index access are O(n), and it's good for sequences of varying size that you iterate. A tuple is stored **contiguously**: index access is O(1), but any modification copies the whole tuple. Tuples are good for small fixed-size groups such as `{:ok, value}` return values.

</details>

<details>
<summary>Why shouldn't you convert user input to atoms?</summary>

Atoms aren't garbage-collected, and the VM has a fixed atom table limit (about 1,048,576 by default). Creating atoms from arbitrary input lets an attacker exhaust the table and crash the whole VM. Use `String.to_existing_atom/1`, or keep string keys.

</details>

<details>
<summary>When do you use a map vs a keyword list?</summary>

A map is the general key-value store: any key type, unique keys, fast lookup. A keyword list is a list of `{atom, value}` pairs that allows duplicate keys and keeps order. It's idiomatic for **options** passed to functions and for DSLs (Ecto queries, Phoenix configuration).

</details>

<details>
<summary>What does immutability buy you?</summary>

There are no surprises from shared mutable state: a function can't change data you passed it. That makes code easier to reason about and test, and it makes concurrency safe, because data sent between processes can't be modified by the sender afterwards. The runtime also shares unchanged parts of data structures (structural sharing), so "copying" is usually cheap.

</details>
