# 07 · Scaling and NoSQL

## 1. Scaling steps (in the order you usually need them)

> **In short:** Optimize, pool, cache, scale up, add replicas, partition, then shard last.

1. **Optimize queries and indexes** (lesson 05): often 10–100× gains for free.
2. **Connection pooling** (PgBouncer) so many app instances don't exhaust DB connections.
3. **Caching** frequently read data (Redis, HTTP caches).
4. **Vertical scaling**: a bigger server (more CPU/RAM/faster disks). Simple and effective for a long time.
5. **Read replicas** for read-heavy workloads.
6. **Partitioning** very large tables.
7. **Sharding** across several databases: complex, a last resort.
8. Move specific workloads to specialized stores (search engine, analytics warehouse, cache).

## 2. Replication

> **In short:** Copies of the database for high availability and read scaling, with lag to manage.

Copies of the database on other servers.

```
           writes
App ───────────────▶ Primary ──WAL stream──▶ Replica 1 (reads)
   └── reads ───────────────────────────────▶ Replica 2 (reads)
```

| Type | Meaning | Trade-off |
| --- | --- | --- |
| **Asynchronous** | Primary commits without waiting for replicas | Fast; replicas lag slightly; a crash may lose the last few transactions |
| **Synchronous** | Primary waits for at least one replica to confirm | No data loss on failover; slower writes |

Uses: **high availability** (promote a replica if the primary fails: **failover**), **read scaling**, backups and analytics without loading the primary.

⚠️ **Replication lag**: a user saves something and immediately reads from a replica that doesn't have it yet. Solutions: read-your-own-writes from the primary for that user/session for a few seconds, or read critical data from the primary.

**Multi-primary** (writes on several nodes) exists but brings conflict resolution problems; most apps use single-primary.

## 3. Partitioning

> **In short:** Split a huge table into pieces inside one database (by date, list or hash).

Splitting one big table into smaller pieces **within one database**:

```sql
CREATE TABLE events (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    created_at TIMESTAMPTZ NOT NULL,
    payload JSONB
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2026_11 PARTITION OF events
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
```

- Queries filtering by the partition key only touch relevant partitions (**partition pruning**).
- Dropping old data is instant (`DROP TABLE events_2025_01`) instead of a huge DELETE.
- Types: **range** (dates), **list** (region), **hash** (spread evenly).
- Good for time-series, logs, events, very large tables (hundreds of millions of rows).

## 4. Sharding

> **In short:** Spread data across several servers by a shard key; powerful but complex.

Splitting data across **several database servers**, each holding a subset (a **shard**), chosen by a **shard key** (e.g. `tenant_id`, `user_id`).

| Pros | Cons |
| --- | --- |
| Scale writes and storage beyond one machine | Cross-shard joins and transactions are hard or impossible |
| Isolate big tenants | Rebalancing data when shards grow is painful |
| | Every query needs the shard key; app/infra complexity |

Choose a key that spreads load evenly and keeps related data together. Tools: Citus (PostgreSQL), Vitess (MySQL), or distributed SQL databases (CockroachDB, YugabyteDB, Spanner). Most apps never need sharding.

## 5. CAP theorem and consistency

> **In short:** During network partitions, choose consistency or availability; also understand consistency models.

In a distributed system, when a **network partition** (P) happens, you must choose between:
- **Consistency (C)**: every read sees the latest write (or gets an error), or
- **Availability (A)**: every request gets a response (possibly stale).

**PACELC** adds: even without a partition, there's a trade-off between **Latency** and **Consistency**.

| Consistency model | Meaning |
| --- | --- |
| **Strong** | Reads always see the latest committed write |
| **Eventual** | Replicas converge "eventually"; reads may be stale for a while |
| **Read-your-writes** | You always see your own writes |
| **Causal** | Related operations are seen in order |

Relational databases on a single primary give strong consistency. Many NoSQL systems let you tune it (e.g. Cassandra's quorum reads/writes).

## 6. Caching

> **In short:** Cache layers (CDN, Redis, DB buffers) and the main caching patterns.

| Layer | Example |
| --- | --- |
| Browser/CDN | `Cache-Control`, ETags for public data |
| Application cache | Redis/Memcached: query results, computed values, sessions |
| Database | Its own buffer cache (shared_buffers) and OS page cache |

Patterns (details in [../05-Redis/02-caching-patterns.md](../05-Redis/02-caching-patterns.md)):
- **Cache-aside**: read cache → on miss, read DB and fill the cache.
- **Write-through**: write to cache and DB together.
- **TTL expiry** + **invalidation** on writes.

"There are only two hard things in computer science: cache invalidation and naming things." Cache what's read often and changes rarely, and always set a TTL.

## 7. NoSQL database types

> **In short:** Key-value, document, wide-column, graph, search, time-series, vector and analytical stores.

| Type | Data model | Examples | Good for |
| --- | --- | --- | --- |
| **Key-value** | `key → value` | Redis, DynamoDB, Memcached | Caching, sessions, counters, rate limits |
| **Document** | JSON-like documents in collections | MongoDB, Couchbase, Firestore | Flexible/nested data read as a whole (catalogues, CMS content) |
| **Wide-column** | Rows with dynamic columns, partitioned by key | Cassandra, ScyllaDB, HBase, Bigtable | Huge write volumes, time-series, known query patterns |
| **Graph** | Nodes and edges | Neo4j, Amazon Neptune | Relationships: social networks, recommendations, fraud detection |
| **Search** | Inverted indexes | Elasticsearch, OpenSearch, Meilisearch, Typesense | Full-text search, faceting, log analytics |
| **Time-series** | Timestamped measurements | TimescaleDB, InfluxDB, Prometheus | Metrics, IoT |
| **Vector** | Embeddings + similarity search | pgvector, Pinecone, Qdrant, Weaviate | Semantic search, RAG for LLM apps |
| **Analytical (OLAP)** | Columnar storage | ClickHouse, BigQuery, Snowflake, Redshift, DuckDB | Aggregations over billions of rows, dashboards |

### Document model example (MongoDB)

> **In short:** Data read together is stored together in one JSON-like document.

```json
{
  "_id": "order_123",
  "customer": { "id": 7, "name": "Anoop" },
  "items": [
    { "sku": "PEN", "qty": 2, "price": 10 },
    { "sku": "BOOK", "qty": 1, "price": 250 }
  ],
  "status": "paid"
}
```

Data read together is stored together (no joins). The trade-off: duplicated data (customer name) must be updated in many documents, and queries across documents are less flexible.

### Data modelling differs

> **In short:** NoSQL data is often modelled around access patterns first.

- **Relational**: model the data, then write any query you need.
- **NoSQL (especially DynamoDB/Cassandra)**: model around the **access patterns** first; queries you didn't plan for may be impossible or expensive.

## 8. OLTP vs OLAP

> **In short:** Transactional workloads vs analytical workloads, and why they need different storage.

| | OLTP (transactions) | OLAP (analytics) |
| --- | --- | --- |
| Workload | Many small reads/writes | Few huge read queries |
| Example | "Create order", "get user 42" | "Revenue per region per month for 3 years" |
| Storage | Row-oriented (PostgreSQL) | Column-oriented (ClickHouse, BigQuery) |

Don't run heavy analytics on the production OLTP primary: use a replica, or copy data to a warehouse (ETL/ELT, change data capture).

## 9. Choosing a database

> **In short:** Default to PostgreSQL and add specialized stores only for measured needs.

1. **Default: PostgreSQL.** It covers relational data, JSON documents (JSONB), full-text search, geospatial (PostGIS), vectors (pgvector) and time-series (TimescaleDB) well enough for most apps.
2. Add **Redis** for caching, rate limiting, queues and ephemeral data.
3. Add a specialized store only when a **measured** need appears: a search engine for advanced search, a warehouse for analytics, a wide-column store for massive write throughput.
4. Consider operational cost: every extra database must be deployed, backed up, monitored, secured and understood by the team.

**Polyglot persistence** (several databases, each for what it does best) is fine, but it has a cost, and keeping data in sync between stores is a hard problem in its own right.

---

## 10. Exercises

1. Draw an architecture with a primary, two replicas and PgBouncer; mark which queries go where.
2. Partition an `events` table by month and show partition pruning with EXPLAIN.
3. Pick a shard key for a multi-tenant SaaS and list the queries that become hard.
4. Model an e-commerce order in both a relational schema and a MongoDB document; compare the trade-offs.
5. For each case pick a database and justify: product search with typo tolerance, chat message history at huge scale, a social "friends of friends" feature, a monthly revenue dashboard.
