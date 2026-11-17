# 03 · Phoenix

Phoenix is the web framework. Think "Rails/Django productivity, with Node-beating concurrency and built-in real-time".

| # | Lesson | Level | You will learn |
| --- | --- | --- | --- |
| 01 | [Setup and project structure](01-setup-and-project-structure.md) | Beginner | `mix phx.new`, every folder explained, `my_app` vs `my_app_web`, config, generators, LiveDashboard |
| 02 | [Request lifecycle: router, plugs, controllers](02-request-lifecycle-router-plugs-controllers.md) | Beginner → Intermediate | `%Plug.Conn{}`, endpoint → router → pipeline → controller → view, writing plugs, verified routes, HEEx basics |
| 03 | [Ecto](03-ecto.md) | Intermediate | Repo, schemas, **changesets**, migrations, queries, associations and preloading, transactions, N+1 |
| 04 | [Contexts and JSON APIs](04-contexts-and-json-api.md) | Intermediate | Context boundaries, `phx.gen.json`, JSON views, `action_fallback`, error handling, pagination, CORS |
| 05 | [Authentication](05-authentication.md) | Intermediate | `phx.gen.auth` (Phoenix 1.8: magic links + scopes), sessions, plugs for auth, API tokens, authorization |
| 06 | [Channels, PubSub and Presence](06-channels-pubsub-presence.md) | Intermediate → Pro | WebSockets with Channels, `Phoenix.PubSub` broadcasts, Presence for "who's online", JS client |

**React developer's map:** Phoenix controllers ≈ Express route handlers; plugs ≈ middleware; Ecto ≈ Prisma + Zod-style validation; contexts ≈ a service layer; Channels ≈ Socket.IO; LiveView ≈ React, but the state lives on the server.
