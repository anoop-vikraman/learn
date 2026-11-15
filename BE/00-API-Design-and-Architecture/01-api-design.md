# 01 · API design

## 1. What makes an API good

> **In short:** Predictable, consistent, well-documented and hard to misuse — a client developer should be able to guess the next endpoint correctly.

| Property | Means |
| --- | --- |
| Consistent | Same naming, error shape, pagination and date format everywhere |
| Predictable | `/tasks/{id}` behaves like `/projects/{id}` |
| Evolvable | New fields don't break old clients |
| Documented | OpenAPI schema generated from code, not written by hand |
| Safe | Validated input, authorised access, rate limited |
| Efficient | Pagination, field selection, caching headers |

## 2. REST properly

> **In short:** Model **resources** as plural nouns, use HTTP methods for the verb, and let status codes carry the outcome.

```
GET    /tasks                     list (filter/sort/paginate via query string)
POST   /tasks                     create                      → 201 + Location
GET    /tasks/{id}                read one
PUT    /tasks/{id}                replace the whole resource
PATCH  /tasks/{id}                partial update
DELETE /tasks/{id}                delete                      → 204
GET    /projects/{id}/tasks       sub-collection
POST   /tasks/{id}/archive        an action that isn't CRUD (acceptable, used sparingly)
```

Rules: plural nouns, no verbs in paths (`/getTasks` ❌), lowercase with hyphens (`/task-templates`), nest only one level deep (`/projects/1/tasks/2/comments/3` is a smell — use `/comments/3`).

### Method semantics

> **In short:** Which methods are safe, idempotent and cacheable — and why retries make idempotency matter.

| Method | Safe (no change) | Idempotent | Cacheable |
| --- | --- | --- | --- |
| GET | ✅ | ✅ | ✅ |
| HEAD | ✅ | ✅ | ✅ |
| POST | ❌ | ❌ | rarely |
| PUT | ❌ | ✅ | ❌ |
| PATCH | ❌ | usually not | ❌ |
| DELETE | ❌ | ✅ | ❌ |

**Idempotent** = calling it five times leaves the same state as once. This matters because clients retry.

### Richardson maturity model (worth naming in an interview)

> **In short:** Levels 0–3 of REST maturity; good APIs live at level 2 (resources + verbs + status codes).

0. One endpoint, RPC over HTTP. 1. Resources. 2. **HTTP verbs + status codes** ← where good REST APIs live. 3. HATEOAS (hypermedia links) — rarely used in practice.

## 3. Status codes

> **In short:** Use the specific code; clients branch on it.

| Code | Meaning | Use |
| --- | --- | --- |
| 200 | OK | Successful GET/PUT/PATCH |
| 201 | Created | POST that created a resource (+ `Location`) |
| 202 | Accepted | Async work started (job queued) |
| 204 | No Content | Successful DELETE, or PUT with no body |
| 301/308 | Moved permanently | Renamed routes |
| 304 | Not Modified | Conditional GET with ETag |
| 400 | Bad Request | Malformed syntax/JSON |
| 401 | Unauthorized | **Not authenticated** |
| 403 | Forbidden | Authenticated but **not allowed** |
| 404 | Not Found | Missing — also for resources the user may not know exist |
| 405 | Method Not Allowed | Wrong verb |
| 409 | Conflict | Duplicate, version conflict |
| 410 | Gone | Permanently removed |
| 422 | Unprocessable Content | **Validation failed** (well-formed but invalid) |
| 429 | Too Many Requests | Rate limited (+ `Retry-After`) |
| 500 / 502 / 503 / 504 | Server errors | Never leak internals |

⚠️ 401 vs 403 is a classic interview trap. 401 = "who are you?", 403 = "I know who you are, and no."

Returning **404 instead of 403** for objects belonging to other users is deliberate: it avoids confirming the resource exists.

## 4. Request and response shape

> **In short:** One consistent envelope for errors, one for collections, ISO-8601 UTC dates, and no leaking internal fields.

```jsonc
// Collection
{
  "items": [ { "id": "…", "title": "…" } ],
  "total": 243,
  "page": 2,
  "size": 20
}

// Cursor variant
{ "items": [ … ], "nextCursor": "eyJpZCI6MTIzfQ" }

// Error — pick one format and never deviate
{
  "error": {
    "code": "validation_error",
    "message": "The request could not be processed",
    "fields": [ { "field": "email", "message": "Invalid email address" } ],
    "requestId": "b7c1…"
  }
}
```

Conventions worth fixing early: `camelCase` or `snake_case` (pick one), IDs as strings (UUIDs survive JS number limits), money as integer minor units or a decimal string, dates as `2026-11-12T08:30:00Z`, booleans named `isActive`/`hasPaid`.

**RFC 9457 Problem Details** is the standard alternative (`type`, `title`, `status`, `detail`, `instance`) if you want something off-the-shelf.

## 5. Pagination, filtering, sorting

> **In short:** Offset pagination is simple; cursor pagination scales and is stable while data changes.

```
GET /tasks?page=2&size=20                          offset
GET /tasks?cursor=eyJpZCI6MTIzfQ&limit=20          cursor (keyset)
GET /tasks?status=open&priority=1,2&q=report
GET /tasks?sort=-createdAt,title                   "-" = descending
GET /tasks?fields=id,title,status                  sparse fieldsets
```

| | Offset | Cursor |
| --- | --- | --- |
| Jump to page N | ✅ | ❌ |
| Performance at depth | ❌ degrades (DB walks skipped rows) | ✅ constant |
| Stable while inserting | ❌ items shift between pages | ✅ |
| Use for | Admin tables with page numbers | Feeds, infinite scroll, big tables |

Always cap `size` (e.g. ≤ 100) and always define a deterministic sort — unordered pagination returns duplicates.

## 6. Versioning

> **In short:** Version in the URL path for simplicity, and avoid breaking changes so you rarely need a v2.

| Approach | Example | Note |
| --- | --- | --- |
| **URL path** | `/api/v1/tasks` | Most common, visible, cache-friendly |
| Header | `Accept: application/vnd.app.v2+json` | Purist; harder to test/debug |
| Query param | `?version=2` | Easy but messy |
| Date-based | `API-Version: 2026-11-01` | Stripe's approach; powerful, more machinery |

**Non-breaking** (safe): adding endpoints, adding optional request fields, adding response fields. **Breaking**: removing/renaming fields, changing types, changing status codes or validation rules, changing defaults.

Lifecycle: ship v2 alongside v1 → mark v1 deprecated (`Deprecation` and `Sunset` headers, docs, emails) → monitor v1 traffic → remove after the announced date.

## 7. Idempotency

> **In short:** Clients retry; make retries safe with idempotency keys for creates and natural idempotency elsewhere.

```http
POST /payments
Idempotency-Key: 4f1a-…
```

Server: store the key with the result (unique constraint). Same key again → return the **stored response** instead of charging twice. Keep keys ~24 h.

GET/PUT/DELETE are naturally idempotent if implemented properly. POST isn't — hence the header.

## 8. Caching and conditional requests

> **In short:** Use `Cache-Control` for public data and ETags for conditional requests that save bandwidth.

```http
Cache-Control: public, max-age=60, stale-while-revalidate=300    # public lists
Cache-Control: private, no-store                                  # per-user data
ETag: "a1b2c3"
If-None-Match: "a1b2c3"      → 304 Not Modified
If-Match: "a1b2c3"           → 412 if changed (optimistic concurrency on writes)
```

## 9. Documentation

> **In short:** Generate OpenAPI from the code so docs can't drift, and generate typed clients from the schema.

- FastAPI generates OpenAPI automatically from type hints ([../FastAPI/02-FastAPI/01-intro-first-app.md](../FastAPI/02-FastAPI/01-intro-first-app.md)).
- Node: `zod-openapi` / `@asteasolutions/zod-to-openapi` + `swagger-ui-express`, or a schema-first framework.
- Frontend: generate a TypeScript client (`openapi-typescript`, `orval`) so the API contract is compile-time checked.
- Document auth, error codes, rate limits, pagination and a changelog — not just endpoints.

## 10. GraphQL

> **In short:** One endpoint, a typed schema, and clients request exactly the fields they need — great for varied clients and nested data, at the cost of caching and complexity.

```graphql
type Task { id: ID!, title: String!, done: Boolean!, project: Project, comments(first: Int): [Comment!]! }
type Query { task(id: ID!): Task, tasks(filter: TaskFilter, first: Int, after: String): TaskConnection! }
type Mutation { createTask(input: CreateTaskInput!): CreateTaskPayload! }
type Subscription { taskUpdated(projectId: ID!): Task! }
```

| Strength | Cost |
| --- | --- |
| No over-fetching or under-fetching | HTTP caching is hard (everything is a POST to `/graphql`) |
| One round trip for nested data | **N+1 queries** unless you add DataLoader batching |
| Strong typed schema + introspection | Query-complexity/depth limits needed or clients can DoS you |
| Great for many different clients | More server complexity; harder rate limiting and observability |
| Schema evolution without versions | File uploads and non-JSON responses are awkward |

Choose GraphQL when you have **many heterogeneous clients** (web, iOS, Android, partners) with different data needs, or deeply nested relational data. Choose REST when the API is simple, public, cache-heavy, or consumed by one client you control.

Servers: Strawberry/Ariadne (Python), Apollo Server/GraphQL Yoga/Pothos (Node). Federation (Apollo Federation) composes many services into one schema.

## 11. gRPC

> **In short:** Binary RPC over HTTP/2 with Protobuf contracts and generated clients — fast and strongly typed, ideal for **service-to-service** traffic, poor for browsers.

```protobuf
service TaskService {
  rpc GetTask (GetTaskRequest) returns (Task);
  rpc ListTasks (ListTasksRequest) returns (stream Task);     // server streaming
}
message Task { string id = 1; string title = 2; bool done = 3; }
```

| Strength | Cost |
| --- | --- |
| Compact binary, HTTP/2 multiplexing → low latency | Not human-readable; needs tooling to debug |
| Codegen for many languages; contract enforced | Browsers need grpc-web + a proxy |
| Bidirectional streaming built in | Extra build step; less ecosystem for public APIs |
| Deadlines, cancellation, backpressure | Load balancers must understand HTTP/2 |

Use gRPC **inside** your system (microservice ↔ microservice), REST or GraphQL at the edge.

## 12. Choosing

> **In short:** REST by default; GraphQL for many clients with varied data needs; gRPC between internal services.

| Need | Choose |
| --- | --- |
| Public API, third-party developers, CDN caching | **REST** |
| Mobile + web + partners with different field needs | **GraphQL** |
| Internal service-to-service, low latency, streaming | **gRPC** |
| TypeScript monorepo, one client | **tRPC** (end-to-end types, no schema language) |
| Webhooks / events out to customers | REST callbacks or a message bus |

Hybrid is normal: REST at the edge, gRPC internally, webhooks for integrations.

## 13. Webhooks (if you expose them)

> **In short:** Sign payloads, retry with backoff, make delivery at-least-once, and let consumers deduplicate.

- Sign with HMAC-SHA256 over the raw body plus a timestamp; document verification.
- Include an event ID so consumers can deduplicate; delivery is at-least-once.
- Retry with exponential backoff and a dead-letter after N attempts; expose a replay endpoint.
- Keep payloads small (IDs + type) and let consumers fetch details.
- Time out fast; a slow consumer must not block your worker.

---

## 14. Exercises

1. Design a REST API for a bookings system: resources, methods, status codes, pagination, error shape.
2. Write the OpenAPI snippet for one endpoint by hand, then compare it with what your framework generates.
3. Convert an offset-paginated endpoint to cursor pagination and explain the trade-off.
4. Add `Idempotency-Key` support to a create endpoint, backed by a unique constraint.
5. Model the same bookings API as a GraphQL schema; identify where N+1 would occur and how DataLoader fixes it.
6. Write a `.proto` for an internal service and explain why you'd use gRPC there and not at the edge.
