# 09 · Sessions, cookies, flash, tokens, emails and file uploads

> **Plain English:** this lesson covers the everyday web plumbing: remembering things about a visitor between requests (sessions and cookies), showing "Saved!" messages (flash), creating secure signed links (tokens), sending emails, and accepting file uploads in regular controllers.

## 1. How sessions work in Phoenix

> **In short:** By default the session is stored **inside a cookie**, signed so it can't be tampered with (and optionally encrypted so it can't be read). Nothing is stored on the server.

```elixir
# lib/my_app_web/endpoint.ex (generated)
@session_options [
  store: :cookie,
  key: "_my_app_key",
  signing_salt: "abc123",
  same_site: "Lax"
  # encryption_salt: "xyz789"   ← add this to encrypt the contents too
]

plug Plug.Session, @session_options
```

Analogy: the session cookie is a **sealed envelope** the browser carries. The server can open it and check the seal (signature). If anyone changes the contents, the seal breaks and the server rejects it.

```elixir
# in a controller or plug (after :fetch_session)
conn = put_session(conn, :cart_id, 42)
get_session(conn, :cart_id)                  # 42
conn = delete_session(conn, :cart_id)
conn = configure_session(conn, renew: true)  # new session id (do this on login, to prevent session fixation)
conn = configure_session(conn, drop: true)   # clear everything (logout)
conn = clear_session(conn)
```

Limits: cookies max out at about **4 KB**, so store small things (ids, tokens), not big data. For server-side sessions you can use `store: :ets` (single node) or a DB- or Redis-backed store, but cookie sessions plus DB tokens (as `phx.gen.auth` does) are the norm.

### Sessions in LiveView

The session is available as the second argument of `mount/3`, read-only. You can't write to the session from a LiveView (it's a WebSocket, so there are no cookies). To change it, redirect to a controller that writes it.

```elixir
def mount(_params, session, socket) do
  {:ok, assign(socket, locale: session["locale"] || "en")}
end
```

## 2. Cookies

> **In short:** For values outside the session, set cookies with `put_resp_cookie/4`. Sign or encrypt anything you'll trust later.

```elixir
# set
conn = put_resp_cookie(conn, "theme", "dark", max_age: 60 * 60 * 24 * 365, sign: true)
conn = put_resp_cookie(conn, "secret", value, encrypt: true, http_only: true, secure: true)

# read
conn = fetch_cookies(conn, signed: ["theme"], encrypted: ["secret"])
conn.cookies["theme"]        # "dark"

# delete
conn = delete_resp_cookie(conn, "theme")
```

| Option | Meaning |
| --- | --- |
| `sign: true` | Readable but tamper-proof |
| `encrypt: true` | Neither readable nor tamperable |
| `http_only: true` (default) | JavaScript can't read it, which protects against XSS stealing it |
| `secure: true` | Sent only over HTTPS |
| `same_site: "Lax"` | Not sent on most cross-site requests, which reduces CSRF risk |
| `max_age` | Lifetime in seconds (without it, the cookie lasts only for the browser session) |

## 3. Flash messages

> **In short:** Flash stores a one-time message that survives exactly one redirect, then disappears. The layout shows it automatically.

```elixir
# controller
conn
|> put_flash(:info, "Task created!")
|> redirect(to: ~p"/tasks")

# LiveView
socket |> put_flash(:error, "Not allowed") |> push_navigate(to: ~p"/")

# clear it
clear_flash(socket)
```

Kinds are just atoms. `:info` and `:error` are styled by `core_components.ex`, and you can add `:warning`.

## 4. CSRF protection, explained

> **In short:** CSRF is when a malicious site makes your browser submit a form to *our* site while you're logged in. Phoenix stops it by requiring a secret token in every form, which the other site can't know.

- `plug :protect_from_forgery` in the `:browser` pipeline checks the token on POST, PUT, PATCH and DELETE.
- `<.form>` adds the hidden `_csrf_token` input automatically.
- LiveView sends the token when it connects (`params: {_csrf_token: csrfToken}` in `app.js`, read from the `<meta name="csrf-token">` tag).
- Plain JS `fetch` to a browser route must send the `x-csrf-token` header.
- JSON API routes in the `:api` pipeline don't use CSRF. They authenticate with bearer tokens instead of cookies, so CSRF doesn't apply.

## 5. Phoenix.Token: signed, expiring values

> **In short:** `Phoenix.Token.sign/3` turns data into a tamper-proof string, and `verify/4` checks it (and its age). Use it for socket auth, email links and short-lived API tokens.

```elixir
token = Phoenix.Token.sign(MyAppWeb.Endpoint, "invite", %{board_id: 42, email: "a@b.com"})

case Phoenix.Token.verify(MyAppWeb.Endpoint, "invite", token, max_age: 86_400 * 7) do
  {:ok, %{board_id: id, email: email}} -> accept_invite(id, email)
  {:error, :expired} -> {:error, "Invite expired"}
  {:error, :invalid} -> {:error, "Invalid invite"}
end
```

- **Signed, not encrypted:** anyone can decode and *read* the payload, so don't put secrets in it. Use `Phoenix.Token.encrypt/decrypt` if the contents must stay hidden.
- It can't be revoked before it expires. For revocable tokens, store a hashed token in the DB, as `phx.gen.auth` does.
- The "salt" string (`"invite"`) separates purposes, so an invite token can't be used as a password-reset token.

## 6. Sending emails with Swoosh

> **In short:** Build an email with `Swoosh.Email` functions and deliver it through `MyApp.Mailer`. In dev, emails appear at `/dev/mailbox`. In production, configure a provider adapter such as Postmark, SES, Mailgun, SendGrid or SMTP.

```elixir
defmodule MyApp.Emails do
  import Swoosh.Email

  def task_assigned(user, task) do
    new()
    |> to({user.name, user.email})
    |> from({"TaskMate", "noreply@taskmate.app"})
    |> subject("You were assigned: #{task.title}")
    |> text_body("Hi #{user.name}, you have a new task: #{task.title}")
    |> html_body("""
    <p>Hi #{user.name},</p>
    <p>You have a new task: <strong>#{task.title}</strong></p>
    """)
  end
end

MyApp.Emails.task_assigned(user, task) |> MyApp.Mailer.deliver()
# {:ok, _} | {:error, reason}
```

(`phx.gen.auth` generates a `UserNotifier` module using exactly this pattern.)

**HTML emails with templates:** you can render HEEx function components to a string with `Phoenix.Template.render_to_string/4` or `Phoenix.HTML.Safe.to_iodata/1`, or use a library such as **Mjml** for responsive email markup.

### Configure a provider for production

```elixir
# config/runtime.exs
if config_env() == :prod do
  config :my_app, MyApp.Mailer,
    adapter: Swoosh.Adapters.Postmark,
    api_key: System.fetch_env!("POSTMARK_API_KEY")

  config :swoosh, :api_client, Swoosh.ApiClient.Req   # an HTTP client for API-based adapters
end
```

### Send emails in the background

Don't make the user wait for an email provider. Enqueue an Oban job, so you also get retries:

```elixir
defmodule MyApp.Workers.SendEmail do
  use Oban.Worker, queue: :mailers, max_attempts: 5

  @impl true
  def perform(%{args: %{"type" => "task_assigned", "user_id" => uid, "task_id" => tid}}) do
    user = MyApp.Accounts.get_user!(uid)
    task = MyApp.Tasks.get_task!(tid)
    with {:ok, _} <- user |> MyApp.Emails.task_assigned(task) |> MyApp.Mailer.deliver(), do: :ok
  end
end
```

Testing: `import Swoosh.TestAssertions`, then `assert_email_sent(subject: "You were assigned: Write tests")`.

## 7. File uploads in controllers (non-LiveView)

> **In short:** A `multipart/form-data` form gives your controller a `%Plug.Upload{}` struct with a temporary file path. Copy or upload the file somewhere permanent before the request ends, because the temp file is deleted afterwards.

```heex
<.form for={@form} action={~p"/avatars"} multipart>
  <input type="file" name="avatar" accept="image/png,image/jpeg" />
  <.button>Upload</.button>
</.form>
```

```elixir
def create(conn, %{"avatar" => %Plug.Upload{} = upload}) do
  # upload.path         → "/tmp/plug-1700/multipart-123"
  # upload.filename     → "me.png" (from the user: never trust it as a path!)
  # upload.content_type → "image/png" (also from the user: verify it)

  with :ok <- validate_image(upload),
       {:ok, url} <- MyApp.Storage.put(upload.path, "avatars/#{Ecto.UUID.generate()}.png") do
    MyApp.Accounts.update_avatar(conn.assigns.current_scope.user, url)
    conn |> put_flash(:info, "Avatar updated") |> redirect(to: ~p"/users/settings")
  end
end

defp validate_image(%Plug.Upload{path: path}) do
  case File.read!(path) |> binary_part(0, 8) do
    <<0x89, "PNG", _::binary>> -> :ok
    <<0xFF, 0xD8, _::binary>> -> :ok
    _ -> {:error, :invalid_file}
  end
end
```

Security rules for uploads:
- Generate your own filename. Never use `upload.filename` in a path (path traversal: `../../etc/passwd`).
- Check the real file type with magic bytes, not just the extension or `content_type`.
- Limit the size: `plug Plug.Parsers, ..., length: 20_000_000` in the endpoint (the default limit is 8 MB).
- Store files in object storage (S3, R2, GCS) in production, not on the server's disk. Containers lose their disk on redeploy.

### S3 uploads

```elixir
# with ExAws: {:ex_aws, "~> 2.5"}, {:ex_aws_s3, "~> 2.5"}, {:sweet_xml, "~> 0.7"}
ExAws.S3.put_object("my-bucket", key, File.read!(path), content_type: "image/png")
|> ExAws.request()

# presigned download URL (expires in 1 hour)
{:ok, url} = ExAws.S3.presigned_url(ExAws.Config.new(:s3), :get, "my-bucket", key, expires_in: 3600)
```

LiveView can upload **directly from the browser to S3** with presigned URLs (the `external:` option of `allow_upload`), so large files never pass through your server. See [04-LiveView/03](../04-LiveView/03-streams-pubsub-uploads-hooks.md).

Image processing: the **Image** library (based on libvips) for resizing and thumbnails, usually run in an Oban job.

## 8. Sending files and downloads

```elixir
send_download(conn, {:file, "/path/report.pdf"}, filename: "report.pdf")
send_download(conn, {:binary, csv_string}, filename: "tasks.csv", content_type: "text/csv")

# streaming a large CSV export without loading everything into memory
conn = conn |> put_resp_content_type("text/csv") |> put_resp_header("content-disposition", ~s(attachment; filename="tasks.csv")) |> send_chunked(200)

Repo.transaction(fn ->
  Task |> Repo.stream() |> Stream.map(&to_csv_row/1) |> Enum.reduce_while(conn, fn row, conn ->
    case chunk(conn, row) do
      {:ok, conn} -> {:cont, conn}
      {:error, :closed} -> {:halt, conn}
    end
  end)
end)
```

## Exercises

1. Store a "last visited board" id in the session and redirect to it from `/`.
2. Set a signed `theme` cookie (light/dark) from a controller and read it in the root layout.
3. Create a board invite link with `Phoenix.Token` that expires in 7 days, and an `accept` action.
4. Send a "task assigned" email via an Oban worker, and check it in `/dev/mailbox`.
5. Build an avatar upload controller with magic-byte validation and a generated filename.
6. Add a streaming CSV export of a board's tasks.

## Interview questions

<details>
<summary>Where does Phoenix store the session, and is it secure?</summary>

By default in a cookie, signed with `secret_key_base` plus a signing salt so it can't be tampered with, and optionally encrypted with an encryption salt so it can't be read. It's limited to about 4 KB. For authentication, `phx.gen.auth` stores only a random token in the session and keeps the hashed token in the DB, so sessions can be revoked. The session should be renewed on login to prevent session fixation.

</details>

<details>
<summary>What's the difference between Phoenix.Token and a session cookie?</summary>

The session is tied to the browser's cookie and sent automatically. A `Phoenix.Token` is a standalone signed string you hand out explicitly: in URLs (email links), in socket params, or to API clients. Both are signed with the app secret. Tokens have a `max_age` check, but they can't be revoked before expiry unless you track them in the DB.

</details>

<details>
<summary>How do you handle file uploads securely?</summary>

Limit the size in `Plug.Parsers` (or `allow_upload` in LiveView), validate the real type with magic bytes, generate your own storage key instead of using the client filename, store files in object storage rather than on the app server's disk, serve them through presigned URLs or a CDN, process images in background jobs, and consider virus scanning for user-shared files.

</details>
