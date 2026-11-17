# 07 · Structs, protocols and behaviours

Without classes, how do you model data and polymorphism? Use **structs** for data, **protocols** for polymorphism over data types, and **behaviours** for module-level interfaces.

## 1. Structs: maps with a fixed shape

> **In short:** A struct is a map with a defined set of keys, default values and a name. It's defined in a module with `defstruct`.

```elixir
defmodule User do
  @enforce_keys [:email]                       # must be given when building the struct
  defstruct [:email, name: "Anonymous", age: nil, admin: false]
end

user = %User{email: "a@b.com", name: "Anoop"}
user.name                        # "Anoop"
user = %User{user | age: 30}     # update (new struct)
%User{}                          # ** (ArgumentError) the following keys must also be given: [:email]
%User{email: "x", foo: 1}        # ** (KeyError) key :foo not found: unknown keys are rejected at compile time

is_map(user)                     # true: a struct IS a map...
user.__struct__                  # User   (...with a hidden __struct__ key)
```

Pattern matching on struct type:

```elixir
def greet(%User{admin: true, name: name}), do: "Hi admin #{name}"
def greet(%User{name: name}), do: "Hi #{name}"
```

Structs **don't** implement `Access` (`user[:name]` raises) or `Enum`. That's deliberate: a struct is a well-defined record, not a generic bag. Ecto schemas (`%MyApp.Accounts.User{}`) are structs.

### Put functions alongside the struct

```elixir
defmodule BankAccount do
  defstruct balance: 0, owner: nil

  def new(owner), do: %__MODULE__{owner: owner}     # __MODULE__ = BankAccount

  def deposit(%__MODULE__{} = acc, amount) when amount > 0 do
    {:ok, %{acc | balance: acc.balance + amount}}
  end

  def withdraw(%__MODULE__{balance: bal}, amount) when amount > bal,
    do: {:error, :insufficient_funds}

  def withdraw(%__MODULE__{} = acc, amount),
    do: {:ok, %{acc | balance: acc.balance - amount}}
end
```

`%BankAccount{} = acc` in a function head means "this argument must be a BankAccount struct, and bind it to `acc`".

## 2. Protocols: polymorphism over data types

> **In short:** A protocol defines a function that each data type implements in its own way, like an interface that you can add to existing types (even built-in ones).

```elixir
defprotocol Describable do
  @doc "Returns a human description"
  def describe(value)
end

defimpl Describable, for: User do
  def describe(user), do: "User #{user.name}"
end

defimpl Describable, for: Map do
  def describe(map), do: "A map with #{map_size(map)} keys"
end

defimpl Describable, for: Integer do
  def describe(n), do: "The number #{n}"
end

Describable.describe(%User{email: "x", name: "Sam"})   # "User Sam"
Describable.describe(42)                                # "The number 42"
```

Built-in protocols you'll meet:

| Protocol | Purpose | Example |
| --- | --- | --- |
| `String.Chars` | `to_string/1`, used by `"#{x}"` interpolation | implement it so you can interpolate your struct |
| `Inspect` | how `IO.inspect` shows the value | hide password fields |
| `Enumerable` | makes something work with `Enum` | custom collections |
| `Jason.Encoder` | JSON encoding (from the Jason library) | `@derive {Jason.Encoder, only: [:id, :name]}` |
| `Phoenix.Param` | what goes in URLs for `~p"/users/#{user}"` | use a slug instead of the id |

`@derive` gives you a default implementation:

```elixir
defmodule User do
  @derive {Jason.Encoder, only: [:email, :name]}       # never leak the password hash to JSON
  @derive {Inspect, except: [:password]}
  defstruct [:email, :name, :password]
end
```

## 3. Behaviours: interfaces for modules

> **In short:** A behaviour is a contract listing the functions (callbacks) a **module** must implement. GenServer, Plug and Supervisor are all behaviours.

```elixir
defmodule PaymentProvider do
  @callback charge(amount :: integer, token :: String.t()) :: {:ok, String.t()} | {:error, term}
  @callback refund(charge_id :: String.t()) :: :ok | {:error, term}
end

defmodule Stripe do
  @behaviour PaymentProvider

  @impl true
  def charge(amount, token), do: {:ok, "ch_123"}

  @impl true
  def refund(_id), do: :ok
end

# Choose the implementation via config, which makes it easy to swap in a mock in tests
provider = Application.get_env(:my_app, :payment_provider, Stripe)
provider.charge(1000, "tok_abc")
```

The compiler warns you if a callback is missing. `@impl true` marks a function as a callback implementation. You'll write `@impl true` on every GenServer and LiveView callback.

**Protocol vs behaviour**:
- A **protocol** dispatches on the **data type** of the first argument ("how do I describe *this value*?").
- A **behaviour** is a contract a **module** fulfils ("this module can act as a payment provider"). You pick the module explicitly.

Behaviours plus config are the standard way to **mock** in tests (the **Mox** library is built on this).

## 4. Sigils, briefly

> **In short:** `~x(...)` shortcuts for strings, regexes, word lists, dates and (in Phoenix) verified routes and templates.

```elixir
~s(string)          ~w(word list)        ~r/regex/i
~D[2026-11-17]      ~T[13:00:00]         ~U[2026-11-17 13:00:00Z]  # Date, Time, UTC DateTime
~p"/users/#{id}"    # Phoenix verified route: the compiler checks the path exists!
~H"""<div>{@name}</div>"""   # Phoenix HEEx template
```

## Exercises

1. Build a `Product` struct (`:name`, `:price`, `qty: 0`) with `@enforce_keys [:name, :price]` and a `total/1` function.
2. Implement `String.Chars` for `Product` so that `"#{product}"` prints `"Widget ($9.99)"`.
3. Define a `Notifier` behaviour with `send(to, message)`, plus `EmailNotifier` and `SmsNotifier` implementations. Pick one via `Application.get_env`.
4. Derive `Jason.Encoder` with `only:` so a `password` field is never encoded.

## Interview questions

<details>
<summary>What's the difference between a struct and a map?</summary>

A struct is a map with a `__struct__` key naming its module, a fixed set of allowed keys (unknown keys raise at compile time), optional defaults and `@enforce_keys`. It doesn't implement `Access` or `Enumerable` by default. You can pattern-match on its type (`%User{} = u`) and implement protocols for it.

</details>

<details>
<summary>Protocols vs behaviours?</summary>

Protocols give polymorphism based on **data type**: you implement a protocol for each type, and dispatch happens on the value passed in (for example `Jason.Encoder`, `String.Chars`). Behaviours define a set of **callbacks a module must implement**, a compile-time-checked interface (for example `GenServer`, `Plug`). With behaviours you choose the module explicitly, often via config, which is great for swapping implementations and mocking.

</details>

<details>
<summary>How do you mock external services in Elixir tests?</summary>

Define a **behaviour** for the service, make the real implementation adopt it, and pick the implementation via application config. In tests, configure a mock module, usually generated by **Mox** (`Mox.defmock(MyApp.PaymentMock, for: PaymentProvider)`), and set expectations with `expect/3`. Mox mocks are concurrency-safe and tied to the test process.

</details>
