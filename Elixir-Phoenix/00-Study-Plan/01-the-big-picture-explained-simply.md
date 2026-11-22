# The big picture, explained simply

Read this before any code. It explains the whole stack using everyday analogies, so that every later lesson has a place to fit in your head. Nothing here needs to be memorised.

---

## 1. Elixir is a language; the BEAM is the engine underneath it

> **In short:** Elixir is to the BEAM what TypeScript is to Node.js: a nicer language that runs on a proven engine.

- **Erlang** is a language created in the 1980s at Ericsson to run telephone switches. Phone switches must **never go down**, must handle **huge numbers of calls at once**, and must keep working when one call goes wrong.
- To make that possible, Erlang has its own virtual machine called the **BEAM** (think "the V8 of Erlang").
- **Elixir** (2012) is a modern language that runs on the same BEAM. It has friendlier syntax and better tools, and it keeps all of the BEAM's superpowers.

So when people praise Elixir's concurrency or reliability, they are really praising the BEAM.

---

## 2. Processes: thousands of tiny workers

> **In short:** A BEAM "process" is a tiny independent worker with its own memory and its own inbox. You can have millions of them.

**Analogy: a big office.**

- Each **process** is one employee at their own desk.
- Each employee has their **own drawer** (memory). Nobody can open someone else's drawer.
- Employees talk only by putting **notes in each other's inbox** (messages).
- Each employee reads their inbox **one note at a time**.
- An office **manager** (the scheduler) makes sure every employee gets a fair share of time, so nobody can hog the office.

Compare this to Node.js, which is like **one very fast employee** juggling everyone's requests. If that one employee gets stuck on a hard task, everybody waits. In the BEAM office, the stuck employee just keeps working while everyone else carries on.

Why it matters for the web: Phoenix gives **every HTTP request and every WebSocket connection its own process**. One slow or crashing request never affects the others.

---

## 3. Immutability: nobody changes the original

> **In short:** Data never changes. You always make a new version.

**Analogy: a document with version history.** You never edit the original. Every edit saves a new version, and anyone holding the old version still sees it exactly as it was.

```elixir
list = [1, 2, 3]
new_list = [0 | list]   # new version: [0, 1, 2, 3]
list                    # still [1, 2, 3]
```

Why it matters: when employees (processes) pass notes, nobody can secretly change a note after it has been sent. That removes a whole class of bugs ("who changed this object?").

---

## 4. Pattern matching: "does this look like what I expect?"

> **In short:** Instead of writing lots of `if` statements, you describe the **shape** of the data you expect and Elixir picks the matching branch.

**Analogy: a mail-sorting machine.** Envelopes with a red stamp go in tray 1, envelopes with a blue stamp in tray 2, and anything else in tray 3.

```elixir
def handle({:ok, data}), do: "Success: #{data}"        # red stamp
def handle({:error, reason}), do: "Failed: #{reason}"  # blue stamp
def handle(_), do: "Unknown"                           # anything else
```

You'll use this everywhere. It's the single most important idea in the language.

---

## 5. OTP: the company handbook

> **In short:** OTP is a set of ready-made, battle-tested patterns for building workers and managers.

| OTP piece | Office analogy | What it really is |
| --- | --- | --- |
| **GenServer** | An employee with a job description: "I keep the stock count; ask me for it or tell me to change it" | A process that holds state and answers messages |
| **Supervisor** | A team lead who replaces anyone who collapses | A process that restarts crashed workers |
| **Application** | A whole department that can open or close as a unit | Your app plus its tree of supervisors |
| **Task** | A temp worker hired for one job | A process that does one thing and returns the result |
| **ETS** | A shared whiteboard anyone can read quickly | A fast in-memory table |
| **Registry** | The office phone directory | Look up a process by name |

### "Let it crash"

If an employee gets confused (an unexpected error), they don't try to patch things up themselves. They **stop**, and the team lead (supervisor) **brings in a fresh replacement** who starts from a clean state. This sounds strange, but it's very reliable: a fresh start is usually the fastest way to fix a confused worker.

You still handle **expected** problems normally ("user typed an invalid email" isn't a crash; it's a validation error you show on screen).

---

## 6. Phoenix: the web framework

> **In short:** Phoenix turns HTTP requests into calls to your Elixir code and sends back HTML or JSON. It's like Express, Django or Rails.

**Analogy: a restaurant.**

| Restaurant | Phoenix |
| --- | --- |
| Front door + security check | **Endpoint**: every request enters here (static files, parsing, sessions) |
| Host who reads your reservation and seats you | **Router**: looks at the URL and decides which controller handles it |
| Checks along the way (ID, coat check) | **Plugs**: small steps every request passes through (e.g. "is the user logged in?") |
| Waiter who takes your order | **Controller**: reads the request and asks the kitchen |
| Kitchen | **Context**: your business logic ("create a task", "register a user") |
| Pantry / storage room | **Ecto + database**: where data is saved and fetched |
| Plating the dish | **View / template**: turns data into HTML or JSON |

The restaurant's most important rule is that **waiters don't cook**. Controllers stay thin; the kitchen (contexts) holds the real logic. That way the same kitchen can serve the dining room (web pages), takeaway (JSON API) and catering (background jobs).

---

## 7. Ecto: the careful storekeeper

> **In short:** Ecto is how Elixir talks to databases. It checks everything before anything is saved.

- **Schema**: the label on each shelf ("tasks: title, done, due date").
- **Changeset**: a **checklist form** you fill in before storing something. "Is the title present? Is it long enough? Is the date in the future?" If the form has errors, nothing is stored, and the errors are shown to the user.
- **Repo**: the **only** person allowed into the storeroom. All reads and writes go through it.
- **Query**: a written request: "bring me all unfinished tasks for user 5, newest first".

Unlike many ORMs, Ecto never "magically" fetches related data behind your back. You ask for it explicitly, so there are no surprise slow queries.

---

## 8. LiveView: the page that stays connected

> **In short:** LiveView lets you build interactive pages (like React) while the state and logic live on the server. The browser and server stay connected through a WebSocket.

**Analogy: a phone call vs letters.**

- A classic web page is like **sending letters**: you ask for a page, get a page, and every change means another letter.
- A React app is like giving the customer **their own copy of the kitchen** (JavaScript in the browser) that occasionally phones the restaurant for ingredients (API calls).
- **LiveView is an open phone line.** The page stays connected. When you click a button, the server hears it, updates its copy of the state, works out exactly what changed on the page, and sends back only that small change.

What you gain: no separate API, no client-side state library, no duplicated validation, and real-time updates for free. What you trade: the page needs a live connection, so every click makes a round trip to the server. LiveView adds JS helpers for instant effects.

---

## 9. PubSub: the office loudspeaker

> **In short:** Any process can announce a message on a "channel name", and every process listening to that name hears it.

When Alice creates a task, the kitchen announces "new task on board 42!". Every open LiveView page showing board 42 is listening, so they all update instantly, even on other servers. That's how you get Google-Docs-style collaboration with a few lines of code.

**Presence** builds on this: it keeps a live list of "who's in the room right now".

---

## 10. Oban: the to-do list that survives power cuts

> **In short:** Oban stores background jobs (send email, generate report) in the database so they're never lost, and retries them if they fail.

A plain Task is like asking a temp worker to post a letter: if the building loses power, the job is forgotten. Oban writes the job into a **logbook** (Postgres) first, so after a restart it picks up where it left off.

---

## 11. How it all fits together: one click, start to finish

You click **"Add task"** on a LiveView board:

1. The browser sends an event over the open WebSocket to **your LiveView process**.
2. `handle_event` calls the **context**: `Tasks.create_task(scope, params)`.
3. The context builds a **changeset** (the checklist). If it's valid, the **Repo** inserts the task into **Postgres**.
4. The context **broadcasts** on **PubSub**: "task created on board 42".
5. The context also enqueues an **Oban** job: "remind the assignee tomorrow".
6. Every LiveView process watching board 42 receives the broadcast in `handle_info` and adds the task to its **stream**.
7. LiveView computes the tiny HTML difference and sends it to every connected browser.
8. If anything unexpected crashes along the way, a **supervisor** restarts that piece, and everyone else keeps working.

If you can explain those 8 steps in an interview, you understand the stack.

---

## 12. The learning path in one picture

```
Elixir syntax ──▶ pattern matching ──▶ Enum & recursion ──▶ structs & protocols
      │
      ▼
Processes ──▶ GenServer ──▶ Supervisors ──▶ (Tasks, ETS, Registry)
      │
      ▼
Phoenix: router → plugs → controllers → contexts → Ecto
      │
      ▼
LiveView: mount → events → assigns → streams → PubSub
      │
      ▼
Testing → Oban → Releases/Docker → Trial project → Interview
```

Next: skim the [glossary](02-glossary.md), then start [01-Elixir-Basics](../01-Elixir-Basics/).
