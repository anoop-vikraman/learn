# 05 · Security for Phoenix apps

> **Plain English:** Phoenix is secure by default in many ways, but it can't stop every mistake. This lesson goes through the common attacks one by one: what each attack is, what Phoenix already does about it, and what you must do yourself. Interviewers love asking "how do you secure X?".

## 1. The checklist at a glance

| Attack | Plain-English meaning | Phoenix default | Your job |
| --- | --- | --- | --- |
| **SQL injection** | User input changes your SQL query | Ecto parameterises values pinned with `^` | Never interpolate strings into `fragment`, and whitelist dynamic field names |
| **XSS** | An attacker's script runs in other users' browsers | HEEx escapes all output | Avoid `raw/1` on user content; sanitise rich text (HtmlSanitizeEx) |
| **CSRF** | Another site submits forms as the logged-in user | `protect_from_forgery`, tokens in forms and LiveView | Keep cookie-authenticated routes in the `:browser` pipeline |
| **IDOR / broken access control** | Changing `/tasks/5` to `/tasks/6` shows someone else's data | Phoenix 1.8 scopes in generated code | Always query through the scope, and authorize every action and event |
| **Mass assignment** | User sends `role=admin` in a form | `cast/3` whitelists fields | Separate changesets per role; never cast `role`/`admin` in user-facing changesets |
| **Session hijacking/fixation** | Stealing or planting a session | Signed cookies, `http_only`; gen.auth renews the session on login | Enable HTTPS-only (`force_ssl`), consider encrypting the session |
| **Brute force** | Guessing passwords or codes | — | Rate-limit login, magic link and reset endpoints |
| **Atom exhaustion (DoS)** | Creating millions of atoms crashes the VM | — | Never `String.to_atom` on input |
| **Open redirect** | `?return_to=https://evil.com` | — | Only redirect to relative paths you've validated |
| **Clickjacking** | Your site loaded invisibly inside an iframe | `put_secure_browser_headers` (x-frame-options) | Add a Content Security Policy |
| **Secrets leakage** | API keys in git or logs | `filter_parameters` hides `password` in logs | Use env vars in `runtime.exs`, extend the filtered params |
| **Vulnerable dependencies** | Known CVEs in packages | — | `mix hex.audit`, `mix deps.audit` (mix_audit), Dependabot |
| **Unsafe deserialization** | `:erlang.binary_to_term` on input can create atoms or functions | — | Never use it on untrusted data (or only with `[:safe]`) |
| **WebSocket hijacking** | A foreign site opens a socket with your cookies | `check_origin` in prod | Keep it configured with your real hosts |

## 2. SQL injection

```elixir
# ✅ safe: ^ makes the value a query parameter
from u in User, where: u.email == ^email

# ✅ safe: fragment with ? placeholders
from t in Task, where: fragment("lower(?) = ?", t.title, ^String.downcase(title))

# ❌ DANGEROUS: string interpolation into SQL
Repo.query!("SELECT * FROM users WHERE email = '#{email}'")

# ✅ raw SQL done safely
Repo.query!("SELECT * FROM users WHERE email = $1", [email])

# ❌ user controls a column name
order_by(query, ^String.to_atom(params["sort"]))

# ✅ whitelist
@sortable %{"title" => :title, "due" => :due_on}
order_by(query, ^[asc: Map.get(@sortable, params["sort"], :inserted_at)])
```

Ecto's `fragment` won't even compile if you interpolate a string instead of using `?` placeholders, which is a nice safety net.

## 3. XSS (cross-site scripting)

```heex
<%!-- ✅ escaped: "<script>" is shown as text --%>
<p>{@comment.body}</p>

<%!-- ❌ renders raw HTML: an attacker's <script> would run --%>
<p>{raw(@comment.body)}</p>

<%!-- ✅ if you must allow some HTML (rich text/markdown), sanitise it first --%>
<p>{raw(HtmlSanitizeEx.basic_html(@comment.body))}</p>
```

Watch out for:
- `href` attributes built from user input (`javascript:alert(1)`). Validate that URLs start with `http(s)://`.
- Putting user data into inline `<script>` tags. Use `data-*` attributes plus a hook instead, with `Jason.encode!` output.
- Markdown rendering (Earmark/MDEx): sanitise its HTML output.

### Content Security Policy (CSP)

A CSP tells the browser which scripts and styles are allowed, as a second line of defence:

```elixir
# router.ex
@csp "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss://#{System.get_env("PHX_HOST", "localhost")}"

pipeline :browser do
  # ...
  plug :put_secure_browser_headers, %{"content-security-policy" => @csp}
end
```

(Module attributes are compile-time, so build the CSP header at runtime in a plug if it depends on env vars.)

## 4. Authorization and IDOR

> **In short:** Authentication checks who you are. Authorization checks whether you may touch **this specific record**. Missing authorization is the #1 web vulnerability (OWASP A01).

```elixir
# ❌ any logged-in user can read any task by changing the id
def show(conn, %{"id" => id}), do: render(conn, :show, task: Repo.get!(Task, id))

# ✅ the scope filters by owner: someone else's id → 404
def show(conn, %{"id" => id}) do
  render(conn, :show, task: Tasks.get_task!(conn.assigns.current_scope, id))
end
```

Apply the same rule in **controllers, LiveView `handle_event`s, channels' `join/3`, GraphQL resolvers and API endpoints**. Return 404 rather than 403 when you don't want to reveal that a record exists.

Write tests for it: "user B cannot read, update or delete user A's task".

## 5. Mass assignment

```elixir
# ❌ the user can make themselves an admin by adding role=admin to the form
def changeset(user, attrs), do: cast(user, attrs, [:name, :email, :role])

# ✅ separate changesets
def profile_changeset(user, attrs), do: cast(user, attrs, [:name])
def admin_changeset(user, attrs), do: cast(user, attrs, [:name, :role])   # only used in admin-only code paths
```

Set ownership fields (`user_id`, `org_id`) from the **scope**, never from params.

## 6. Authentication hardening

- Use `phx.gen.auth` instead of rolling your own. Tokens are hashed, compared in constant time, and expire.
- **Rate-limit** login, registration, magic-link and password-reset requests (Hammer or PlugAttack), by IP **and** by email.
- Don't reveal whether an email exists ("If that email exists, we sent a link").
- Passwords: bcrypt or argon2, with a minimum length of about 12; checking against breached passwords is a bonus.
- Renew the session on login (`configure_session(renew: true)`, generated) and on privilege change.
- Use **sudo mode** for sensitive actions (generated in 1.8): require a recent login.
- 2FA: the **NimbleTOTP** library for authenticator apps; passkeys via WebAuthn libraries.

### Rate limiting example (Hammer)

```elixir
defmodule MyAppWeb.Plugs.RateLimit do
  import Plug.Conn

  def init(opts), do: Keyword.merge([limit: 5, period_ms: 60_000], opts)

  def call(conn, opts) do
    key = "login:#{:inet.ntoa(conn.remote_ip)}"
    case MyApp.RateLimit.hit(key, opts[:period_ms], opts[:limit]) do
      {:allow, _count} -> conn
      {:deny, _retry_after} ->
        conn |> put_resp_header("retry-after", "60") |> send_resp(429, "Too many requests") |> halt()
    end
  end
end
```

(`MyApp.RateLimit` is a module using Hammer's API, `use Hammer, backend: :ets`, started in the supervision tree. Check the Hammer docs for the exact API of the version you install.)

Behind a load balancer, `conn.remote_ip` is the proxy's IP. Use the **remote_ip** library to read `X-Forwarded-For` safely, from trusted proxies only.

## 7. Secrets and configuration

- Keep all secrets in env vars, read in `config/runtime.exs`. Never commit them (`.env` goes in `.gitignore`).
- `SECRET_KEY_BASE` signs cookies and tokens. If it leaks, attackers can forge sessions. Rotate it if exposed.
- Hide sensitive params from logs:

```elixir
# config/config.exs
config :phoenix, :filter_parameters, ["password", "token", "secret", "api_key", "card"]
```

- Use `@derive {Inspect, except: [:password, :api_key]}` on structs so secrets don't show up in logs or crash reports.
- Use `redact: true` on Ecto schema fields: `field :password, :string, virtual: true, redact: true`.

## 8. Transport and headers

```elixir
# config/prod.exs
config :my_app, MyAppWeb.Endpoint,
  force_ssl: [hsts: true, rewrite_on: [:x_forwarded_proto]],   # redirect HTTP→HTTPS + HSTS
  check_origin: ["https://taskmate.app", "https://www.taskmate.app"]
```

`put_secure_browser_headers` (in the `:browser` pipeline) already sets `x-frame-options`, `x-content-type-options`, `referrer-policy` and others.

**CORS** (for APIs called from other origins): allow only your known front-end origins with `CORSPlug`. Never use `*` together with credentials.

## 9. Safe redirects

```elixir
# ❌ open redirect: /login?return_to=https://evil.com
redirect(conn, external: params["return_to"])

# ✅ only allow local paths
defp safe_return_to("//" <> _), do: ~p"/"      # "//evil.com" is a protocol-relative external URL
defp safe_return_to("/" <> _ = path), do: path  # a local path such as "/boards/42"
defp safe_return_to(_), do: ~p"/"              # nil, "https://evil.com", anything else

redirect(conn, to: safe_return_to(params["return_to"]))
```

`redirect(conn, to: path)` already refuses absolute URLs and raises on them, so prefer `to:` over `external:`.

## 10. Tools

```bash
mix sobelow                 # Phoenix-specific security scanner (XSS, SQLi, config issues...)
mix sobelow --config        # create a config to ignore reviewed findings
mix hex.audit               # retired packages
mix deps.audit              # known vulnerabilities (mix_audit package)
mix credo --strict          # code quality issues that often hide bugs
```

Put `sobelow` and `deps.audit` in CI.

## 11. Security in the trial project: what to show

- Scoped contexts, plus tests proving user B can't touch user A's board.
- Authorization in every `handle_event` and API action.
- Rate limiting on login and the API.
- `force_ssl`, `check_origin`, secrets in `runtime.exs`.
- `mix sobelow` clean in CI.
- Webhook signature verification (if you added webhooks).

## Exercises

1. Run `mix sobelow` on your trial project and fix or explain every finding.
2. Write tests: user B gets 404 for A's board in the controller, the LiveView and the API.
3. Add a rate limit to the magic-link login endpoint and test the 429 response.
4. Add a CSP header and check the browser console for violations.
5. Add `redact: true` and `@derive Inspect` to sensitive fields, then trigger an error and check the logs.

## Interview questions

<details>
<summary>What security protections does Phoenix give you by default?</summary>

CSRF protection for browser forms and LiveView, automatic HTML escaping in HEEx (XSS), parameterised Ecto queries (SQL injection), `cast/3` field whitelisting (mass assignment), signed session cookies with `http_only`, secure browser headers, `check_origin` for WebSockets, parameter filtering in logs, and with `phx.gen.auth`, hashed revocable tokens, session renewal and scoped generated code.

</details>

<details>
<summary>What is IDOR and how do you prevent it in Phoenix?</summary>

Insecure Direct Object Reference: accessing another user's record by changing an id in a URL or event. Prevent it by always loading records through the current user's scope (`Repo.get_by!(Task, id: id, user_id: scope.user.id)`), checking permissions in every controller action, LiveView event, channel join and resolver, and testing cross-user access explicitly.

</details>

<details>
<summary>Why is String.to_atom dangerous?</summary>

Atoms are never garbage-collected, and the atom table has a hard limit (about 1M by default). Converting attacker-controlled strings to atoms lets them fill the table and crash the entire VM, a denial of service. Use `String.to_existing_atom/1` on whitelisted values, or keep strings.

</details>

<details>
<summary>How do you protect a login endpoint?</summary>

Use `phx.gen.auth` (hashed passwords or magic-link tokens, constant-time comparison), rate-limit by IP and account, give generic error messages that don't reveal whether an account exists, renew the session on login, serve over HTTPS only, and optionally add 2FA (TOTP/passkeys). Log and monitor failed attempts.

</details>
