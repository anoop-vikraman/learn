# 05 · Authentication and authorization

## 1. `mix phx.gen.auth`: don't hand-roll auth

> **In short:** Phoenix ships an auth generator that writes **all** the code into your app (no hidden library): registration, login, sessions, tokens, emails and tests. You own the code and can change it.

```bash
mix phx.gen.auth Accounts User users
mix deps.get
mix ecto.migrate
```

In **Phoenix 1.8** it generates:
- **Magic-link login** by default (an email with a one-time link), with optional password login that users can set in settings.
- A **`Scope`** struct (`MyApp.Accounts.Scope`) holding the current user. It's put in `@current_scope` instead of the older `@current_user`.
- `users` and `users_tokens` tables. Tokens are hashed in the DB and used for sessions, email confirmation, magic links and email changes.
- Plugs and LiveView `on_mount` hooks in `MyAppWeb.UserAuth`.
- Routes: `/users/register`, `/users/log-in`, `/users/settings`, `/users/log-out`.
- `sudo mode`: sensitive actions (changing email or password) require a recent login.
- Full tests.

In **Phoenix 1.7** it generated password login by default and assigned `@current_user`. You'll see both styles in the wild.

Passwords (if used) are hashed with **bcrypt** (or `--hashing-lib argon2`/`pbkdf2`). They're never stored in plain text and are compared in constant time.

## 2. How it works: sessions + tokens

> **In short:** On login a random token is generated, its **hash** is stored in `users_tokens`, and the raw token goes into the signed session cookie. Each request looks the token up to find the user.

```
Login ──▶ generate token ──▶ store {hash(token), user_id, context: "session"} in users_tokens
      ──▶ put token in the session cookie (signed by Phoenix with secret_key_base)

Request ─▶ fetch_current_scope_for_user plug reads the token from the session
        ─▶ query users_tokens for a valid, unexpired token ─▶ assign(:current_scope, Scope.for_user(user))

Logout ──▶ delete that token row (also kicks out any LiveView sockets for it)
```

Why DB tokens instead of only a cookie? You can **revoke** them: log out everywhere, invalidate all sessions on password change, and so on.

## 3. Protecting routes

> **In short:** Plugs protect controller routes, and `live_session` with `on_mount` hooks protects LiveViews. The generator wires up both.

```elixir
# router.ex (generated, simplified)
pipeline :browser do
  # ...
  plug :fetch_current_scope_for_user
end

scope "/", MyAppWeb do
  pipe_through [:browser, :require_authenticated_user]

  live_session :require_authenticated_user,
    on_mount: [{MyAppWeb.UserAuth, :require_authenticated}] do
    live "/users/settings", UserLive.Settings, :edit
    live "/tasks", TaskLive.Index, :index        # ◀ put your protected LiveViews here
  end

  post "/users/update-password", UserSessionController, :update_password
end

scope "/", MyAppWeb do
  pipe_through [:browser]

  live_session :current_user,
    on_mount: [{MyAppWeb.UserAuth, :mount_current_scope}] do
    live "/users/register", UserLive.Registration, :new
    live "/users/log-in", UserLive.Login, :new
  end
end
```

Why both a plug **and** `on_mount`? A LiveView is first rendered over HTTP, so the plug runs. Then it connects over a WebSocket, where plugs **don't** run, so the `on_mount` hook re-checks auth on the socket. Interviewers ask about this.

Access the user:

```elixir
# controller
user = conn.assigns.current_scope.user

# LiveView
socket.assigns.current_scope.user
```

```heex
<%!-- template --%>
<span :if={@current_scope}>Hi {@current_scope.user.email}</span>
```

## 4. Scopes: Phoenix 1.8's answer to "only show my data"

> **In short:** If you run generators **after** `phx.gen.auth`, the generated context functions take `scope` as their first argument and filter by `scope.user.id` automatically.

```bash
mix phx.gen.live Tasks Task tasks title:string done:boolean
```

The generated code (simplified):

```elixir
def list_tasks(%Scope{} = scope) do
  Repo.all_by(Task, user_id: scope.user.id)
end

def get_task!(%Scope{} = scope, id) do
  Repo.get_by!(Task, id: id, user_id: scope.user.id)
end

def create_task(%Scope{} = scope, attrs) do
  with {:ok, task = %Task{}} <-
         %Task{}
         |> Task.changeset(attrs, scope)          # sets user_id from the scope
         |> Repo.insert() do
    broadcast(scope, {:created, task})          # PubSub, per user
    {:ok, task}
  end
end
```

This prevents the #1 security bug in CRUD apps: **IDOR** (Insecure Direct Object Reference), where `GET /tasks/123` returns someone else's task. With scopes, `get_task!(scope, 123)` raises (404) if it isn't yours.

You can extend `Scope` with more fields (e.g. `organization`) for multi-tenant apps.

## 5. Authorization: who can do what

> **In short:** Authentication says **who** you are, and authorization says **what** you're allowed to do. Keep the rules in the context or a policy module, and check them in plugs or `with`.

Simple policy module:

```elixir
defmodule MyApp.Tasks.Policy do
  alias MyApp.Accounts.Scope
  alias MyApp.Tasks.Task

  def can?(%Scope{user: %{role: :admin}}, _action, _task), do: true
  def can?(%Scope{user: %{id: id}}, action, %Task{user_id: id}) when action in [:view, :edit, :delete], do: true
  def can?(_, _, _), do: false
end

# in a controller
with true <- Policy.can?(scope, :delete, task) || {:error, :forbidden},
     {:ok, _} <- Tasks.delete_task(task) do
  send_resp(conn, 204, "")
end
```

Libraries if needed: **Bodyguard** (policies), **LetMe**.

## 6. API authentication (for mobile or SPA clients)

> **In short:** For a JSON API, use bearer tokens: an opaque token stored hashed in `users_tokens` (reusing the generated token code), or a JWT (**Joken**/**Guardian**). Check it in a plug.

```elixir
defmodule MyAppWeb.Plugs.ApiAuth do
  import Plug.Conn
  alias MyApp.Accounts

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         {:ok, user} <- Accounts.fetch_user_by_api_token(token) do
      assign(conn, :current_scope, MyApp.Accounts.Scope.for_user(user))
    else
      _ ->
        conn
        |> put_status(:unauthorized)
        |> Phoenix.Controller.json(%{error: "unauthorized"})
        |> halt()
    end
  end
end
```

Opaque DB tokens vs JWT:

| | Opaque token (DB) | JWT |
| --- | --- | --- |
| Revocation | Easy: delete the row | Hard: needs a denylist or short expiry plus refresh tokens |
| Per-request cost | A DB lookup (cacheable) | Signature check only |
| Payload | None | Claims (readable by anyone, so never put secrets in it) |
| Good for | Most apps | Stateless microservices, third-party auth |

## 7. Security checklist (Phoenix defaults and what you add)

| Threat | Phoenix default / what to do |
| --- | --- |
| CSRF | `protect_from_forgery` in the browser pipeline; forms include the token automatically |
| XSS | HEEx escapes output by default; avoid `raw/1` with user content |
| SQL injection | Ecto parameterises everything pinned with `^`; be careful with `fragment` |
| Mass assignment | `cast/3` whitelists fields |
| Session hijacking | Signed (optionally encrypted) cookies, `secure`/`http_only` flags; tokens revocable in the DB |
| Clickjacking etc. | `put_secure_browser_headers` |
| Brute force | Add rate limiting on login (Hammer/PlugAttack) |
| Atom exhaustion | Never call `String.to_atom` on input |
| Scan your code | `mix sobelow` |

## Exercises

1. Run `mix phx.gen.auth Accounts User users` in your trial project. Register, then log in with the magic link via `/dev/mailbox`.
2. Read `lib/my_app_web/user_auth.ex` top to bottom and explain each function.
3. Generate `Tasks` **after** auth and confirm the context takes a `scope`. Try to fetch another user's task in IEx.
4. Add a `role` field (`Ecto.Enum`, values `[:member, :admin]`) and a policy check that only admins can delete.
5. Add an API token endpoint and the `ApiAuth` plug above.

## Interview questions

<details>
<summary>How does phx.gen.auth handle sessions?</summary>

On login it generates a random token, stores a **hash** of it in `users_tokens` with a context such as "session", and puts the raw token in the signed session cookie. A plug reads the token on each request, finds a valid, unexpired matching token and assigns the current user or scope. Since tokens live in the DB, sessions can be revoked: log out, change password, log out everywhere. LiveView sockets are disconnected when their token is deleted.

</details>

<details>
<summary>Why do LiveViews need on_mount hooks for auth if the router already has plugs?</summary>

A LiveView is rendered twice: first over regular HTTP (plugs run), then it connects over a WebSocket, where the plug pipeline doesn't run. `on_mount` hooks in a `live_session` run on **both** mounts, so authentication is enforced on the stateful connection too, including on live navigation between LiveViews in the same session.

</details>

<details>
<summary>What is a scope in Phoenix 1.8?</summary>

A struct (generated by `phx.gen.auth`) representing the caller's context, usually the current user, and extendable with organization, role and so on. Generated context functions take the scope as their first argument and filter data by it, which prevents insecure direct object references. PubSub topics are also scoped per user.

</details>

<details>
<summary>Authentication vs authorization?</summary>

Authentication verifies identity (who you are: login, tokens). Authorization decides permissions (what you can do: own this task, be an admin). In Phoenix, authentication is handled by `phx.gen.auth` plugs and hooks, and authorization by scope filtering in contexts plus policy functions checked in controllers or LiveViews.

</details>
