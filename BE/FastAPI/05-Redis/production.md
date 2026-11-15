# Redis in production

## 1. Setup checklist

> **In short:** What to configure before relying on Redis in production.

- [ ] Managed service (ElastiCache/MemoryDB, Memorystore, Azure Cache, Upstash, Redis Cloud) or a well-configured self-hosted setup
- [ ] Decide per use: **cache** (data loss acceptable) vs **store/queue** (data must survive). Consider separate instances for each
- [ ] `maxmemory` and an eviction policy set deliberately
- [ ] Persistence configured to match the use (or off for pure cache)
- [ ] Replica + automatic failover for anything important
- [ ] Private network, password/ACL users, TLS, dangerous commands restricted
- [ ] Monitoring: memory, evictions, hit rate, latency, connections, replication
- [ ] Client timeouts, retries and connection pooling configured in the app

## 2. Memory and eviction

> **In short:** Set `maxmemory` and pick an eviction policy that matches the use (cache vs queue).

Redis keeps everything in RAM. When memory fills up, behaviour depends on `maxmemory-policy`:

| Policy | Evicts | Use for |
| --- | --- | --- |
| `noeviction` (default) | Nothing: writes fail with errors | Queues, locks, data you can't lose (Celery broker, sessions) |
| `allkeys-lru` | Least recently used keys | **Pure cache** |
| `allkeys-lfu` | Least frequently used | Cache with stable hot keys |
| `volatile-lru` / `volatile-lfu` / `volatile-ttl` | Only keys with a TTL | Mixed instance (cache keys have TTLs, important keys don't) |

```
maxmemory 2gb
maxmemory-policy allkeys-lru
```

- Leave headroom: set `maxmemory` to ~70–80% of available RAM (forking for persistence and replication buffers needs extra memory).
- **Don't mix** a cache that evicts with a Celery broker that must not lose data in one instance; use separate instances or databases with `noeviction` for queues.
- Find big keys: `redis-cli --bigkeys`, `--memkeys`, `MEMORY USAGE key`. Keep values small; split big hashes/lists.
- Always set TTLs on cache keys.

## 3. Persistence

> **In short:** No persistence, RDB snapshots, AOF, or both, depending on how much loss is acceptable.

| Mode | How | Data loss on crash | Notes |
| --- | --- | --- | --- |
| None | Memory only | Everything | Fine for a pure cache |
| **RDB** snapshots | Periodic point-in-time dump (`save 900 1`) | Since last snapshot (minutes) | Compact, fast restarts, good for backups |
| **AOF** (append-only file) | Logs every write; `appendfsync everysec` | ~1 second | More durable; larger files, rewritten periodically |
| RDB + AOF | Both | ~1 second | Recommended when data matters |

Back up RDB files to object storage for anything you can't rebuild. Managed services offer snapshots.

## 4. High availability and scaling

> **In short:** Replicas, Sentinel failover and Redis Cluster sharding.

| Setup | What it gives | When |
| --- | --- | --- |
| Single instance | Nothing if it dies | Dev, non-critical cache |
| **Primary + replicas** | Read scaling, a hot copy | Most production use |
| **Sentinel** | Monitors primary, **automatic failover**, tells clients the new primary | Self-hosted HA |
| **Redis Cluster** | Shards data across several primaries (16,384 hash slots), each with replicas | Data or throughput beyond one node |

Cluster caveats: multi-key commands, transactions and Lua scripts only work when all keys are in the **same hash slot**; use **hash tags** `{user:42}:cart` and `{user:42}:profile` to colocate related keys. Clients must be cluster-aware (`redis.asyncio.cluster.RedisCluster`).

Replication is asynchronous: on failover, the last writes can be lost. Design for it (DB as source of truth, idempotent consumers).

## 5. Security

> **In short:** Never expose Redis publicly; use ACL users, TLS and restrict dangerous commands.

- **Never expose Redis to the internet.** Bind to private interfaces; firewall/security groups allow only app servers. (Exposed Redis instances get compromised within hours.)
- Enable authentication: **ACL users** with least privilege (Redis 6+), not just a single shared password.

```
user app on >long-password ~cache:* ~session:* +@read +@write +@string +@hash -@dangerous
user default off
```

- **TLS** for connections (`rediss://` URLs), especially across networks.
- Disable or rename dangerous commands for app users: `FLUSHALL`, `FLUSHDB`, `KEYS`, `CONFIG`, `DEBUG`, `SHUTDOWN`.
- Run in protected mode, as a non-root user; keep it patched.
- Don't store sensitive data unencrypted unless necessary; Redis isn't designed as a secure vault.

## 6. Client configuration (Python)

> **In short:** Timeouts, retries, pool size, and falling back gracefully when the cache is down.

```python
from redis.asyncio import Redis
from redis.backoff import ExponentialBackoff
from redis.retry import Retry

redis_client = Redis.from_url(
    settings.redis_url,                       # rediss://user:pass@host:6380/0 for TLS
    decode_responses=True,
    socket_timeout=2,                         # don't hang requests on a slow Redis
    socket_connect_timeout=2,
    health_check_interval=30,
    retry=Retry(ExponentialBackoff(cap=1, base=0.05), retries=3),
    max_connections=50,                       # pool size per process
)
```

- One client (pool) per process, created at startup (lifespan), closed on shutdown.
- **Fail gracefully when the cache is down**: catch Redis errors in cache code and fall back to the database, so a cache outage slows the app instead of breaking it. (Queues, locks and rate limits need a deliberate decision: fail open or closed.)

## 7. Monitoring

> **In short:** Memory, evictions, hit rate, latency, slow commands, connections and replication.

| Metric | Command / source | Watch for |
| --- | --- | --- |
| Memory used vs maxmemory | `INFO memory` (`used_memory`, `maxmemory`) | Approaching the limit |
| Evictions | `INFO stats` → `evicted_keys` | Rising (cache too small) or any eviction on a queue instance |
| Hit rate | `keyspace_hits / (hits + misses)` | Dropping hit rate |
| Latency | `LATENCY DOCTOR`, `--latency`, client metrics | Spikes |
| Slow commands | `SLOWLOG GET 10` | `KEYS`, big `HGETALL`/`LRANGE`, long Lua scripts |
| Connections | `INFO clients` → `connected_clients`, `blocked_clients` | Leaks, pool exhaustion |
| Replication | `INFO replication` → link status, offset lag | Broken link, lag |
| Persistence | `INFO persistence` → last save status, AOF rewrite | Failed saves (often disk/memory issues) |
| CPU | host metrics | Redis's main thread saturated (~100% of one core) |

Tools: `redis_exporter` + Prometheus/Grafana, managed-service dashboards, RedisInsight.

## 8. Operational practices

> **In short:** Avoid blocking commands, namespace and version keys, separate instances, test failover.

- Never run `KEYS *`, `FLUSHALL` or huge `DEL`s on production; use `SCAN` and `UNLINK` (non-blocking delete).
- Avoid very large keys and long-running Lua scripts (they block everything).
- Namespace keys by app/feature and **version** cache keys when data shapes change.
- Use separate instances (or at least logical databases) for cache vs broker vs sessions so one can't evict or flush the others.
- Plan capacity: track memory growth; size for peak + headroom.
- Test failover: confirm clients reconnect and the app survives a brief Redis outage.
- Upgrade minor/patch versions regularly; read release notes for major versions (and licence implications: Valkey is the open-source alternative).

## 9. Routine

> **In short:** Ongoing, weekly, monthly and quarterly Redis tasks.

| How often | Task |
| --- | --- |
| Continuously | Alerts on memory, evictions, latency, replication, connection count |
| Weekly | Review slowlog and big keys; hit rate trends |
| Monthly | Capacity check; remove unused key namespaces; patch updates |
| Quarterly | Failover drill; restore test from snapshot (if Redis holds important data); review ACL users and passwords |
