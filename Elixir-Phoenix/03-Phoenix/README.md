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
| 07 | [HEEx, components, assets, layouts, i18n](07-heex-assets-layouts-i18n.md) | Intermediate | Full HEEx syntax, `attr`/`slot`/`:let`, core components, root and app layouts, esbuild + Tailwind without Node, npm packages, static files, Gettext translations, change tracking |
| 08 | [Ecto advanced](08-ecto-advanced.md) | Pro | All association types, many-to-many tags, embeds and JSONB, schemaless changesets, upserts, dynamic filters, subqueries and window functions, locking, UUIDs, custom types, soft deletes, multi-tenancy, migrations in depth |
| 09 | [Sessions, cookies, tokens, emails, uploads](09-sessions-cookies-emails-uploads.md) | Intermediate | How cookie sessions work, signed and encrypted cookies, flash, CSRF explained, `Phoenix.Token`, Swoosh emails + providers, controller uploads, S3, downloads and streaming CSV |
| 10 | [HTTP clients, webhooks, GraphQL](10-http-clients-webhooks-graphql.md) | Pro | Req clients and testing, resilience, receiving webhooks (raw body + HMAC + idempotency), sending webhooks, Absinthe GraphQL with Dataloader, REST vs GraphQL |

**Suggested order:** 01 → 06 is the core (weeks 2–3). Read 07 alongside LiveView, 08 and 09 while building the trial project, and 10 when you need integrations or before the interview.

**React developer's map:** Phoenix controllers ≈ Express route handlers; plugs ≈ middleware; Ecto ≈ Prisma + Zod-style validation; contexts ≈ a service layer; Channels ≈ Socket.IO; LiveView ≈ React, but the state lives on the server.
