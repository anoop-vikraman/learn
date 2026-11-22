# 06 · Collections: recursion, Enum, comprehensions and Stream

> **Plain English:** With no `for` loops that change counters, how do you go through a list? You use ready-made tools from `Enum` (map, filter, reduce), which work like array methods in JS, and occasionally **recursion** (a function calling itself on the rest of the list). `Stream` is the lazy version: it does the work only when you finally ask for results, which helps with huge or endless data.

## 1. Recursion: how "loops" work underneath

> **In short:** With no mutable counters, you iterate by having a function call itself on the list's tail, with a clause for the empty list to stop.

```elixir
defmodule MyList do
  def sum([]), do: 0
  def sum([head | tail]), do: head + sum(tail)

  def len([]), do: 0
  def len([_ | tail]), do: 1 + len(tail)

  def map([], _fun), do: []
  def map([h | t], fun), do: [fun.(h) | map(t, fun)]
end

MyList.sum([1, 2, 3])     # 6
MyList.map([1, 2], &(&1 * 10))  # [10, 20]
```

How `sum([1,2,3])` evaluates: `1 + sum([2,3])` → `1 + (2 + sum([3]))` → `1 + (2 + (3 + sum([])))` → `1 + 2 + 3 + 0`.

### Tail-call optimisation

> **In short:** If the recursive call is the **very last** thing the function does, the BEAM reuses the stack frame, so the recursion runs in constant memory. Use an accumulator to get there.

```elixir
defmodule MyList do
  def sum(list), do: do_sum(list, 0)

  defp do_sum([], acc), do: acc
  defp do_sum([h | t], acc), do: do_sum(t, acc + h)   # tail call: nothing left to do after it
end
```

In the first version, `head + sum(tail)` still has an addition to do after the call returns, so it isn't a tail call. In practice you'll rarely write recursion by hand. `Enum` covers about 95% of cases. But interviewers love asking about it, and tail recursion is what makes long-running processes (`loop(state)`) possible.

## 2. Enum: your daily toolkit

> **In short:** `Enum` works on anything enumerable (lists, maps, ranges) and is **eager**: each call walks the whole collection and returns a list.

```elixir
list = [1, 2, 3, 4, 5]

Enum.map(list, &(&1 * 2))              # [2, 4, 6, 8, 10]
Enum.filter(list, &(rem(&1, 2) == 0))  # [2, 4]
Enum.reject(list, &(&1 > 3))           # [1, 2, 3]
Enum.reduce(list, 0, fn x, acc -> x + acc end)  # 15
Enum.sum(list)                         # 15
Enum.find(list, &(&1 > 2))             # 3
Enum.any?(list, &(&1 > 4))             # true
Enum.all?(list, &(&1 > 0))             # true
Enum.count(list, &(&1 > 2))            # 3
Enum.sort(list, :desc)                 # [5, 4, 3, 2, 1]
Enum.sort_by(users, & &1.age)
Enum.take(list, 2)                     # [1, 2]
Enum.chunk_every(list, 2)              # [[1, 2], [3, 4], [5]]
Enum.zip([1, 2], [:a, :b])             # [{1, :a}, {2, :b}]
Enum.with_index(["a", "b"])            # [{"a", 0}, {"b", 1}]
Enum.uniq([1, 1, 2])                   # [1, 2]
Enum.join(["a", "b"], ", ")            # "a, b"
Enum.frequencies(~w(a b a))            # %{"a" => 2, "b" => 1}
Enum.group_by(users, & &1.dept)        # %{"eng" => [...], "ops" => [...]}
Enum.into([a: 1], %{})                 # %{a: 1}
Enum.flat_map([1, 2], &[&1, &1])       # [1, 1, 2, 2]
Enum.min_max([3, 1, 2])                # {1, 3}
```

### Enum on maps

Maps are enumerated as `{key, value}` tuples:

```elixir
prices = %{apple: 1.0, pear: 2.5}
Enum.map(prices, fn {fruit, price} -> {fruit, price * 1.1} end) |> Map.new()
# or
Map.new(prices, fn {k, v} -> {k, v * 1.1} end)
Enum.filter(prices, fn {_k, v} -> v > 2 end)  # [pear: 2.5]  (a list of tuples!)
```

### `reduce` is the universal tool

```elixir
# Build a map from a list
users = [%{id: 1, name: "A"}, %{id: 2, name: "B"}]
Enum.reduce(users, %{}, fn user, acc -> Map.put(acc, user.id, user) end)
# %{1 => %{id: 1, ...}, 2 => %{...}}

# or more simply
Map.new(users, &{&1.id, &1})
```

`reduce_while` lets you stop early:

```elixir
Enum.reduce_while(1..100, 0, fn x, acc ->
  if acc + x > 50, do: {:halt, acc}, else: {:cont, acc + x}
end)
```

## 3. Comprehensions: `for`

> **In short:** `for` is a comprehension, not a loop. It maps, filters and can combine several collections in one expression, and returns a list (or anything else via `into:`).

```elixir
for x <- [1, 2, 3], do: x * x               # [1, 4, 9]
for x <- 1..10, rem(x, 2) == 0, do: x       # filter: [2, 4, 6, 8, 10]
for x <- [1, 2], y <- [:a, :b], do: {x, y}  # nested: [{1,:a},{1,:b},{2,:a},{2,:b}]
for {k, v} <- %{a: 1, b: 2}, into: %{}, do: {k, v * 10}   # %{a: 10, b: 20}
for {:ok, val} <- [{:ok, 1}, {:error, 2}, {:ok, 3}], do: val   # pattern filters: [1, 3]
```

You'll see `for` constantly in HEEx templates: `<li :for={item <- @items}>{item.name}</li>`.

## 4. Stream: lazy evaluation

> **In short:** `Stream` builds a recipe of transformations and only runs it when you call an `Enum` function. Use it for large or infinite data, or to avoid building intermediate lists.

```elixir
# Eager: builds 3 full intermediate lists
1..1_000_000 |> Enum.map(&(&1 * 2)) |> Enum.filter(&(rem(&1, 3) == 0)) |> Enum.take(5)

# Lazy: processes element by element and stops after 5
1..1_000_000 |> Stream.map(&(&1 * 2)) |> Stream.filter(&(rem(&1, 3) == 0)) |> Enum.take(5)

# Process a huge file line by line without loading it all into memory
File.stream!("big.log")
|> Stream.filter(&String.contains?(&1, "ERROR"))
|> Stream.map(&String.trim/1)
|> Enum.take(100)

# Infinite stream
Stream.iterate(1, &(&1 * 2)) |> Enum.take(10)   # powers of 2
Stream.cycle([:red, :green]) |> Enum.take(5)
```

Rule: default to `Enum`. Switch to `Stream` for big files, DB result streams (`Repo.stream`), infinite sequences, or long pipelines over large data.

## 5. Map, Keyword and List helpers

> **In short:** A few functions beyond `Enum` that you'll use often.

```elixir
Map.update(%{count: 1}, :count, 0, &(&1 + 1))   # %{count: 2}  (0 is used if the key is missing)
Map.take(user, [:id, :name])
Map.drop(user, [:password])
Map.filter(map, fn {_k, v} -> v != nil end)
Map.from_struct(user)
get_in(data, [:user, :address, :city])          # nested access
put_in(data, [:user, :name], "New")
update_in(data, [:stats, :views], &(&1 + 1))

List.first([1, 2])      # 1
List.last([1, 2])       # 2
List.flatten([1, [2, [3]]])
List.wrap(nil)          # []
List.wrap(1)            # [1]
Keyword.merge([a: 1], [b: 2])
```

## Exercises

1. Write `my_max/1` and `my_reverse/1` with tail recursion and an accumulator.
2. Given `orders = [%{customer: "a", total: 10}, %{customer: "b", total: 5}, %{customer: "a", total: 7}]`, compute `%{"a" => 17, "b" => 5}` (a) with `Enum.group_by` + `Map.new`, and (b) with a single `Enum.reduce`.
3. Using `for`, generate all `{x, y}` pairs with x and y in 1..3 where x < y.
4. Use `File.stream!` to count the lines in a file that contain "def ".
5. Run-length encode `"AAABBC"` → `"3A2B1C"` (hint: `String.graphemes` + `Enum.chunk_by`).

## Interview questions

<details>
<summary>How do you loop in Elixir without mutable variables?</summary>

With recursion (a function calling itself on the tail of a list, with a base-case clause for the empty list), or more commonly with higher-order functions in `Enum` (`map`, `reduce`, `filter`) and comprehensions (`for`). State is carried in accumulators instead of being mutated.

</details>

<details>
<summary>What is tail-call optimisation and why does it matter on the BEAM?</summary>

When the recursive call is the last operation in a function, the VM reuses the current stack frame instead of pushing a new one, so the recursion uses constant stack space. That's crucial because long-running processes are just tail-recursive loops: `def loop(state), do: (receive ... -> loop(new_state))`. Without TCO they'd eventually overflow the stack.

</details>

<details>
<summary>Enum vs Stream: when do you use each?</summary>

`Enum` is eager: each function traverses the whole collection and builds a new list. It's simple and fast for normal sizes. `Stream` is lazy: it composes the operations and runs them element by element only when the stream is consumed. Use it for large or infinite data or file and DB streams, where intermediate lists would waste memory, or when you only need the first few results.

</details>
