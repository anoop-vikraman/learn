# 04 · System design for backend interviews

## 1. The framework

> **In short:** Clarify → estimate → define the API → design the data model → draw the architecture → go deep on one area → discuss scale, failure and trade-offs. Never start by drawing boxes.

| Step | Minutes (45-min interview) | Do |
| --- | --- | --- |
| 1. **Clarify requirements** | 5 | Functional + non-functional; write them down; ask what's out of scope |
| 2. **Estimate scale** | 3 | Users, QPS, storage, read:write ratio |
| 3. **API design** | 5 | A handful of endpoints — makes the rest concrete |
| 4. **Data model** | 5 | Tables/collections, keys, indexes, which database and why |
| 5. **High-level design** | 10 | Client → LB → services → cache → DB → queue → workers |
| 6. **Deep dive** | 10 | Pick (or accept) the hard part and go deep |
| 7. **Scale, failure, trade-offs** | 7 | Bottlenecks, caching, sharding, what breaks, what you'd monitor |

**The single biggest scoring behaviour:** state trade-offs out loud. "I'd use X; the cost is Y; I'd accept that because Z."

## 2. Questions to ask first

> **In short:** Five minutes of clarification prevents designing the wrong system.

- Who uses it, and how many? Read-heavy or write-heavy?
- What are the core features — and what's explicitly out of scope?
- How fresh must data be? Is eventual consistency acceptable?
- What's the latency target? Availability target?
- Mobile clients? Offline? Multi-region?
- Is there an existing stack I should assume?

## 3. Capacity estimation

> **In short:** Round aggressively — the numbers only need to be the right order of magnitude.

**Numbers worth memorising:**

| Quantity | Value |
| --- | --- |
| Seconds in a day | ~86,400 ≈ **100k** |
| 1 million writes/day | ~12 writes/s |
| L1 cache / RAM read | ns / ~100 ns |
| SSD random read | ~100 µs |
| Network round trip (same DC) | ~0.5 ms |
| Cross-continent round trip | ~150 ms |
| A single Postgres instance | thousands of simple QPS; tens of thousands of rows/s with batching |
| Redis | ~100k+ ops/s per instance |
| Typical row | ~1 KB |

```
Example: 10M DAU, each posts 2 items/day, reads 100 items/day
Writes: 20M/day ÷ 86,400 ≈ 230/s  (peak ×3 ≈ 700/s)
Reads:  1B/day  ÷ 86,400 ≈ 11,600/s  (peak ≈ 35,000/s)
Read:write ≈ 50:1  → read-heavy → caching and replicas matter most
Storage: 20M × 1 KB = 20 GB/day ≈ 7 TB/year → partition by time, archive old data
```

## 4. The default architecture

> **In short:** Most answers are a variation of this; name each box and why it's there.

```
Clients (web/mobile)
   │
 CDN  ──────────────── static assets, cached public responses
   │
 Load balancer / API gateway ── TLS, routing, rate limiting, auth check
   │
 Stateless API servers (N replicas, autoscaled)
   │           │                  │
 Cache       Database          Message queue
 (Redis)     (Postgres          (Redis/RabbitMQ/Kafka)
             primary +               │
             read replicas)      Workers (async jobs)
   │
 Object storage (S3) for files  ·  Search (OpenSearch)  ·  Analytics warehouse
```

Then add: observability (logs/metrics/traces), secrets management, CI/CD, and backups.

## 5. Worked example — URL shortener

> **In short:** Read-heavy, simple data, and all about key generation, caching and redirect latency.

**Requirements:** shorten a URL, redirect, optional custom alias, expiry, click analytics. 100M URLs, 10:1 read:write.

**API**
```
POST /urls          { "url": "https://…", "alias?": "promo", "expiresAt?": "…" } → 201 { "short": "https://s.io/aB3xK" }
GET  /{code}        → 302 Location: <original>
GET  /urls/{code}/stats → { clicks, createdAt }
```

**Key generation** — the heart of the question:

| Option | Trade-off |
| --- | --- |
| Hash (MD5/SHA) then truncate | Collisions must be detected and retried |
| **Base62 of an auto-increment ID** | No collisions, but sequential codes are guessable/enumerable |
| **Pre-generated key pool** | Fast, no collisions at write time; needs a key service |
| Random 7 chars + unique constraint | Simple; retry on conflict. 62⁷ ≈ 3.5 trillion |

Pick random base62 with a unique constraint and retry, or a counter sharded per server (Snowflake-style) if enumeration doesn't matter.

**Storage:** `urls(code PK, long_url, user_id, created_at, expires_at)`. 100M × ~500 B ≈ 50 GB — one Postgres can hold this; partition or shard by `code` later.

**Read path:** Redis cache `code → long_url` with a long TTL (URLs are immutable) → DB on miss. Cache hit ratio should be very high because of the long tail/head distribution. Serve redirects from the edge if latency matters.

**Analytics:** don't write a row per click synchronously — push click events to a queue/Kafka and aggregate in a worker, or use approximate counters in Redis.

**Trade-offs to voice:** 301 (cached by browsers, faster, breaks analytics) vs **302** (always hits you, enables analytics).

## 6. Worked example — social feed

> **In short:** The whole question is fan-out on write vs fan-out on read, with a hybrid for celebrities.

**API:** `POST /posts`, `GET /feed?cursor=…`, `POST /users/{id}/follow`.

| Strategy | How | Good | Bad |
| --- | --- | --- | --- |
| **Fan-out on write** (push) | On post, insert into every follower's feed list (Redis) | Feed reads are O(1), fast | A celebrity with 10M followers = 10M writes |
| **Fan-out on read** (pull) | On read, query posts from everyone you follow and merge | Cheap writes | Slow reads, heavy DB work |
| **Hybrid** ✅ | Push for normal users; pull for celebrities and merge at read time | Balanced | More complex |

**Data:** `posts(id, author_id, body, created_at)`, `follows(follower_id, followee_id)`, feed cache per user in a Redis sorted set (score = timestamp), capped at ~1000 entries.

**Deep-dive topics they'll push on:** cursor pagination (stable while new posts arrive), ranking vs chronological, deleted/blocked content filtering at read time, and cache invalidation when a post is edited.

## 7. Worked example — chat

> **In short:** WebSockets plus a message store, and the interesting parts are connection routing, ordering and delivery state.

- **Connections:** clients hold WebSockets to any instance; a **connection registry** (Redis: `user → instance`) plus **pub/sub** routes a message to the instance holding the recipient's socket.
- **Storage:** messages in a store partitioned by conversation, ordered by a monotonic ID (Snowflake or per-conversation sequence) — Cassandra/DynamoDB for huge scale, Postgres partitioned by time for normal scale.
- **Delivery:** persist first, then deliver; mark sent/delivered/read with acknowledgements. Offline users get **push notifications**.
- **Ordering:** per-conversation sequence numbers; clients reorder and deduplicate by message ID.
- **Scale:** connections are the bottleneck (memory per socket) — plan connections per instance and use sticky routing or a shared registry.
- **Extras they may ask:** typing indicators (ephemeral, pub/sub only, never stored), unread counts (denormalized counters), end-to-end encryption (server stores ciphertext; search becomes client-side).

## 8. Worked example — distributed rate limiter

> **In short:** Pick an algorithm, store counters in Redis, and handle the failure mode explicitly.

| Algorithm | Behaviour |
| --- | --- |
| Fixed window | Simple; allows 2× bursts at window edges |
| Sliding window log | Accurate; stores a timestamp per request (memory) |
| Sliding window counter | Good approximation, cheap |
| **Token bucket** | Allows bursts up to a cap, limits average rate — usually the best answer |
| Leaky bucket | Smooths output to a constant rate |

```lua
-- Token bucket in Redis (atomic via Lua): refill based on elapsed time, then try to take one token
```

Discuss: per-user vs per-IP vs per-API-key keys; returning **429 + `Retry-After`** and `X-RateLimit-*` headers; where it runs (gateway vs app); and **fail-open vs fail-closed** when Redis is down (fail-open for general traffic, fail-closed for login).

## 9. Topics interviewers probe

> **In short:** Be ready to go one level deeper on any box you draw.

| Topic | One-line answer |
| --- | --- |
| Why this database? | Relational + transactions → Postgres; huge write volume with known access patterns → wide-column; search → OpenSearch |
| How do you cache? | Cache-aside with TTL + invalidation on write; watch stampedes and per-user keys |
| How do you scale reads? | Replicas + caching; accept replication lag or read-your-writes from the primary |
| How do you scale writes? | Batch, partition by time, then shard by a key chosen for even distribution |
| Consistency? | Strong where money/identity is involved; eventual for feeds, counters, search |
| Single points of failure? | LB redundancy, DB failover, multi-AZ, queue durability |
| How would you monitor it? | RED metrics per service, queue depth, DB saturation, alert on user-facing symptoms |
| Security? | TLS, authN/authZ at the edge **and** in services, least privilege, secrets manager, rate limits |
| Cost? | Cheapest architecture that meets the SLO; don't shard before you must |

## 10. Mistakes that lose points

> **In short:** Most failures are process failures, not knowledge failures.

1. Drawing boxes before clarifying requirements.
2. Jumping to microservices/Kafka for a problem that needs one Postgres.
3. Skipping capacity estimation, then being unable to justify any choice.
4. Not stating trade-offs — "I'd use Redis" without saying what it costs.
5. Silence while thinking (narrate instead).
6. Ignoring failure modes, monitoring and data migration.
7. Refusing to make a decision when the interviewer asks you to choose.

---

## 11. Practice list

Work through these with a timer, 45 minutes each, out loud:

1. URL shortener · 2. Social feed · 3. Chat · 4. Rate limiter
5. Ride-hailing dispatch · 6. Ticket booking (seat-locking concurrency) · 7. Notification service (multi-channel, retries)
8. File storage/Dropbox (chunking, dedupe) · 9. Job scheduler (cron at scale) · 10. Analytics pipeline (ingest → aggregate → query)
11. E-commerce checkout (inventory, payments, idempotency) · 12. Multi-tenant SaaS (isolation, noisy neighbours)
