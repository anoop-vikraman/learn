# 07 · HEEx templates, components, assets, layouts and i18n

> **Plain English:** HEEx is how you write HTML in Phoenix. It's normal HTML with small Elixir pieces inside, checked by the compiler. This lesson also covers how CSS and JavaScript are built without needing Node, how page layouts work, and how to translate your app into other languages.

## 1. HEEx syntax, complete

> **In short:** `{...}` inserts an Elixir value (escaped for safety), `:if` and `:for` handle conditions and loops, `<.name>` calls a component, and `<:slot>` passes content into a component.

```heex
<%!-- This is a comment and is never sent to the browser --%>

<%!-- 1. Output values (auto-escaped: <script> becomes harmless text) --%>
<h1>Hello {@user.name}</h1>
<p>You have {length(@tasks)} tasks</p>

<%!-- 2. Attributes --%>
<a href={~p"/tasks/#{@task}"} class="link">Open</a>
<input type="checkbox" checked={@task.done} />        <%!-- false/nil removes the attribute --%>
<div class={["card", @selected && "ring-2", @task.done && "opacity-50"]}>  <%!-- lists drop false/nil --%>
<div {@rest}>                                          <%!-- spread a map/keyword of attributes --%>

<%!-- 3. Conditionals --%>
<p :if={@tasks == []}>Nothing to do 🎉</p>

<%!-- if/else: use a block --%>
<%= if @user do %>
  <span>Signed in</span>
<% else %>
  <.link navigate={~p"/users/log-in"}>Log in</.link>
<% end %>

<%!-- case --%>
<%= case @status do %>
  <% :loading -> %><.spinner />
  <% :error -> %><p>Something went wrong</p>
  <% :ok -> %><p>Done</p>
<% end %>

<%!-- 4. Loops --%>
<ul>
  <li :for={task <- @tasks} id={"task-#{task.id}"}>{task.title}</li>
</ul>
<li :for={{task, index} <- Enum.with_index(@tasks)}>{index + 1}. {task.title}</li>

<%!-- :for with :key (LiveView 1.1) helps LiveView track items efficiently --%>
<li :for={task <- @tasks} :key={task.id}>{task.title}</li>

<%!-- 5. Group several elements without a wrapper div --%>
<.dynamic_tag tag_name="section">...</.dynamic_tag>
<%= for item <- @items do %>
  <dt>{item.term}</dt>
  <dd>{item.definition}</dd>
<% end %>
```

Rules to remember:
- Inside **tag bodies and attributes** use `{...}`. Use `<%= ... %>` only for block constructs (`if`/`case`/`for` with `do`).
- Values are **escaped** automatically. To output trusted HTML, use `Phoenix.HTML.raw(html)`, and **never** pass user input to it (XSS).
- The compiler checks that tags are closed and properly nested.
- `~H` can only be used in a function that has a variable named `assigns`.

## 2. Function components in depth

> **In short:** Declare every input with `attr` (name, type, default, allowed values) and every slot with `slot`. The compiler warns you about missing or unknown attributes when the component is called.

```elixir
defmodule MyAppWeb.UI do
  use Phoenix.Component

  @doc "A coloured status badge"
  attr :status, :atom, required: true, values: [:todo, :doing, :done]
  attr :size, :string, default: "sm", values: ~w(sm md lg)
  attr :class, :any, default: nil
  attr :rest, :global, include: ~w(title)     # pass through id, data-*, aria-*, phx-* ...

  def status_badge(assigns) do
    ~H"""
    <span class={["badge", badge_color(@status), "badge-#{@size}", @class]} {@rest}>
      {humanize(@status)}
    </span>
    """
  end

  defp badge_color(:todo), do: "badge-ghost"
  defp badge_color(:doing), do: "badge-warning"
  defp badge_color(:done), do: "badge-success"
  defp humanize(s), do: s |> Atom.to_string() |> String.capitalize()
end
```

### Slots: passing content in (React's `children` and render props)

```elixir
attr :title, :string, required: true
slot :inner_block, required: true          # default slot: the content between the tags
slot :footer                               # named slot
slot :tab, doc: "tabs" do                  # a slot with its own attributes
  attr :label, :string, required: true
  attr :active, :boolean
end

def panel(assigns) do
  ~H"""
  <section class="panel">
    <h2>{@title}</h2>
    <nav>
      <button :for={tab <- @tab} class={tab[:active] && "active"}>{tab.label}</button>
    </nav>
    <div>{render_slot(@inner_block)}</div>
    <footer :if={@footer != []}>{render_slot(@footer)}</footer>
  </section>
  """
end
```

```heex
<.panel title="Settings">
  <:tab label="Profile" active />
  <:tab label="Security" />
  <p>Main content here</p>
  <:footer><.button>Save</.button></:footer>
</.panel>
```

### Slots that receive data back: `:let`

```elixir
attr :rows, :list, required: true
slot :col, required: true do
  attr :label, :string
end

def simple_table(assigns) do
  ~H"""
  <table>
    <thead><tr><th :for={col <- @col}>{col[:label]}</th></tr></thead>
    <tbody>
      <tr :for={row <- @rows}>
        <td :for={col <- @col}>{render_slot(col, row)}</td>
      </tr>
    </tbody>
  </table>
  """
end
```

```heex
<.simple_table rows={@users}>
  <:col :let={user} label="Name">{user.name}</:col>
  <:col :let={user} label="Email">{user.email}</:col>
</.simple_table>
```

`render_slot(col, row)` passes `row` back to the caller, who receives it via `:let={user}`. It's the same idea as a React render prop.

### Templates in separate files

```elixir
defmodule MyAppWeb.TaskHTML do
  use MyAppWeb, :html
  embed_templates "task_html/*"      # index.html.heex → index/1, show.html.heex → show/1
end
```

## 3. Core components (`core_components.ex`)

> **In short:** Phoenix generates a set of components into **your** app, which you're free to edit: `<.button>`, `<.input>`, `<.header>`, `<.table>`, `<.list>`, `<.icon>` and `<.flash>`.

| Component | Use |
| --- | --- |
| `<.input field={@form[:email]} type="email" label="Email" />` | Inputs with labels and errors (text, email, password, select, checkbox, textarea, date...) |
| `<.button variant="primary">` | Buttons (with `navigate`/`patch`/`href` it renders a link) |
| `<.header>Title<:subtitle>..</:subtitle><:actions>..</:actions></.header>` | Page headers |
| `<.table id rows>` + `<:col>` + `<:action>` | Data tables (work with streams) |
| `<.list><:item title="Name">{@user.name}</:item></.list>` | Description lists |
| `<.icon name="hero-trash" class="size-4" />` | Heroicons (outline, `-solid`, `-mini`, `-micro`) |
| `<.flash kind={:info} flash={@flash} />` | Flash messages (included by the layout) |

## 4. Layouts

> **In short:** The **root layout** (`root.html.heex`) is the outer `<html>` shell: head, CSS and JS tags. It's rendered once and never re-rendered by LiveView. In Phoenix 1.8, the **app layout** is a function component, `<Layouts.app>`, that you wrap each page in.

```heex
<%!-- components/layouts/root.html.heex --%>
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="csrf-token" content={get_csrf_token()} />
    <.live_title default="TaskMate">{assigns[:page_title]}</.live_title>
    <link phx-track-static rel="stylesheet" href={~p"/assets/css/app.css"} />
    <script defer phx-track-static type="text/javascript" src={~p"/assets/js/app.js"}></script>
  </head>
  <body>
    {@inner_content}
  </body>
</html>
```

```elixir
# components/layouts.ex (simplified)
attr :flash, :map, required: true
attr :current_scope, :map, default: nil
slot :inner_block, required: true

def app(assigns) do
  ~H"""
  <header class="navbar">
    <.link navigate={~p"/"}>TaskMate</.link>
    <span :if={@current_scope}>{@current_scope.user.email}</span>
  </header>
  <main class="p-6">{render_slot(@inner_block)}</main>
  <.flash_group flash={@flash} />
  """
end
```

You can make other layouts too, e.g. `<Layouts.auth>` for login pages or `<Layouts.admin>`. They're just components.

`phx-track-static` makes the browser reload the page when assets change after a deploy.

## 5. The asset pipeline: esbuild + Tailwind, without Node

> **In short:** Phoenix installs standalone **esbuild** (JS bundler) and **Tailwind** binaries through Hex packages. In dev they watch your files. For production, `mix assets.deploy` minifies the assets and adds content hashes to filenames for cache-busting.

```
assets/
├── css/app.css        # Tailwind v4: @import "tailwindcss"; plus daisyUI plugin in Phoenix 1.8
├── js/app.js          # LiveSocket setup, hooks, imports
└── vendor/            # third-party files (topbar.js, daisyui, heroicons)
priv/static/assets/    # build output (git-ignored)
```

```elixir
# config/config.exs (generated, simplified)
config :esbuild,
  version: "0.25.0",
  my_app: [
    args: ~w(js/app.js --bundle --target=es2022 --outdir=../priv/static/assets/js --external:/fonts/* --external:/images/*),
    cd: Path.expand("../assets", __DIR__),
    env: %{"NODE_PATH" => Path.expand("../deps", __DIR__)}
  ]

config :tailwind,
  version: "4.1.7",
  my_app: [args: ~w(--input=assets/css/app.css --output=priv/static/assets/css/app.css), cd: Path.expand("..", __DIR__)]

# config/dev.exs: watchers rebuild on save
watchers: [
  esbuild: {Esbuild, :install_and_run, [:my_app, ~w(--sourcemap=inline --watch)]},
  tailwind: {Tailwind, :install_and_run, [:my_app, ~w(--watch)]}
]
```

### Using npm packages anyway

```bash
cd assets
npm init -y
npm install chart.js sortablejs
```

```js
// assets/js/app.js
import Chart from "chart.js/auto"
import Sortable from "sortablejs"
```

esbuild resolves `node_modules` automatically. (Remember to run `npm ci --prefix assets` in your Dockerfile and CI.)

### Static files and images

Files in `priv/static/` are served by `Plug.Static` for the paths listed in `static_paths/0` in `my_app_web.ex` (`~w(assets fonts images favicon.ico robots.txt)`). Reference them with verified routes: `<img src={~p"/images/logo.png"} />`.

`mix phx.digest` (part of `assets.deploy`) creates fingerprinted copies like `app-3f2a1b.css` plus a manifest, and `~p` automatically points at the digested filename in production.

## 6. Internationalisation (i18n) with Gettext

> **In short:** Wrap user-facing text in `gettext("...")`, extract the strings into `.pot` files, translate them into `.po` files per language, and choose the locale per request.

```heex
<h1>{gettext("Welcome back, %{name}!", name: @user.name)}</h1>
<p>{ngettext("You have 1 task", "You have %{count} tasks", @count)}</p>
```

```bash
mix gettext.extract --merge          # collect strings into priv/gettext/*.pot and update .po files
mix gettext.merge priv/gettext --locale es
```

```po
# priv/gettext/es/LC_MESSAGES/default.po
msgid "Welcome back, %{name}!"
msgstr "¡Bienvenido de nuevo, %{name}!"
```

Set the locale per request with a plug (from a URL param, cookie, user setting or `Accept-Language` header):

```elixir
defmodule MyAppWeb.Plugs.Locale do
  import Plug.Conn
  @supported ~w(en es hi)

  def init(opts), do: opts

  def call(conn, _opts) do
    locale = conn.params["locale"] || get_session(conn, :locale) || "en"
    locale = if locale in @supported, do: locale, else: "en"
    Gettext.put_locale(MyAppWeb.Gettext, locale)
    conn |> put_session(:locale, locale) |> assign(:locale, locale)
  end
end
```

For LiveView, set the locale again in an `on_mount` hook (the WebSocket process is separate). Ecto validation messages are translated through `translate_error/1` in `core_components.ex`, using the `errors` domain.

## 7. Change tracking: how to keep templates fast

> **In short:** LiveView re-renders only the parts whose assigns changed. Some patterns break this tracking, so avoid them.

```heex
<%!-- ✅ tracked: re-renders only when @user changes --%>
<p>{@user.name}</p>

<%!-- ❌ passing the whole assigns map: always re-renders --%>
<.profile {assigns} />

<%!-- ❌ local variables computed inside the template from assigns break tracking --%>
<% total = Enum.sum(@prices) %>
<p>{total}</p>

<%!-- ✅ compute in the LiveView instead: assign(socket, total: Enum.sum(prices)) --%>
```

## Exercises

1. Build a `<.status_badge>` component with `attr ... values:` and call it with a wrong value to see the compile warning.
2. Build a `<.panel>` with a default slot, a named `:footer` slot, and a `:tab` slot with attributes.
3. Build `<.simple_table>` with `:let`, and use it for tasks.
4. Install `sortablejs` with npm and import it in `app.js`.
5. Add Spanish translations for three strings, plus a locale plug, and switch with `?locale=es`.

## Interview questions

<details>
<summary>What is HEEx and how is it different from EEx?</summary>

HEEx (HTML-aware EEx) understands HTML structure. It validates tags at compile time, supports `{...}` interpolation in attributes and bodies, special attributes (`:if`, `:for`, `:let`, `:key`), function components and slots. It also enables LiveView change tracking by separating static from dynamic parts. Plain EEx is just text templating, with no HTML awareness.

</details>

<details>
<summary>How do you pass content into a Phoenix component?</summary>

With slots. The default `inner_block` slot holds the content between the tags, rendered with `render_slot(@inner_block)`. Named slots (`<:footer>`) can have their own attributes and can be given multiple times. With `render_slot(slot, value)`, a component passes data back to the caller, who receives it with `:let`, which is equivalent to render props in React.

</details>

<details>
<summary>How does Phoenix handle CSS and JavaScript without Node?</summary>

It uses the standalone esbuild and Tailwind binaries, installed and run by the `esbuild` and `tailwind` Hex packages. Watchers rebuild in dev. `mix assets.deploy` builds minified assets and runs `phx.digest` for fingerprinted filenames. npm can still be used for third-party JS packages, and esbuild bundles them.

</details>
