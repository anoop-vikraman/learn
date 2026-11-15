# PostgreSQL in production

General database practices are in [../03-Database-Concepts/production.md](../03-Database-Concepts/production.md). This page is PostgreSQL-specific.

## 1. Setup checklist

> **In short:** Everything to configure before PostgreSQL goes live.

- [ ] Managed service (RDS/Aurora, Cloud SQL/AlloyDB, Azure Flexible Server, Neon, Supabase, Crunchy Bridge) unless you have DBA expertise
- [ ] Supported major version (each gets 5 years of support); latest minor version
- [ ] Private network only; TLS required; `scram-sha-256` authentication
- [ ] Separate roles: owner/migrator, app, read-only; app is not superuser and not owner
- [ ] HA: standby in another availability zone with automatic failover
- [ ] Automated backups + WAL archiving (PITR); restore tested
- [ ] `pg_stat_statements` enabled; slow-query logging on
- [ ] Connection pooler (PgBouncer / RDS Proxy) if many app instances
- [ ] Timeouts: `statement_timeout`, `idle_in_transaction_session_timeout`, `lock_timeout` for migrations
- [ ] Monitoring and alerts (connections, replication lag, disk, CPU, slow queries, wraparound)
- [ ] Time zone UTC

## 2. Self-hosted setup notes (if not managed)

> **In short:** Hardware, packages or operators, HA tooling, backups and OS tuning.

- Dedicated machines/VMs with fast SSD/NVMe storage; separate volume for data (and optionally WAL).
- Use the official PGDG packages, or the official Docker image with a persistent volume. On Kubernetes, use an operator (**CloudNativePG**, Crunchy PGO, Zalando).
- HA with **Patroni** (+ etcd/Consul) or an operator; backups with **pgBackRest** or **WAL-G** to object storage.
- Tune `postgresql.conf` (see [04-indexes-performance.md](04-indexes-performance.md#6-key-configuration-settings)) and lock down `pg_hba.conf`.
- OS: disable transparent huge pages, set `vm.swappiness` low, use a modern filesystem (ext4/xfs), and monitor disk latency.

## 3. Connection management

> **In short:** Use PgBouncer and size pools so connections stay within limits.

Every PostgreSQL connection is a separate **process** using memory (several MB). Thousands of direct connections hurt performance.

```
app instances (each with a small pool) → PgBouncer (transaction pooling) → PostgreSQL (e.g. 100 connections)
```

- **PgBouncer** in **transaction mode** lets thousands of client connections share a small number of server connections.
- ⚠️ In transaction mode, session state doesn't persist between transactions: avoid session-level `SET` (use `SET LOCAL`), session advisory locks, `LISTEN`, and (for older PgBouncer versions) server-side prepared statements. Recent PgBouncer versions (1.21+) support protocol-level prepared statements.
- Size app pools so that `instances × workers × pool_size` fits the pooler/DB limits.
- Cloud options: RDS Proxy, Cloud SQL connector + PgBouncer, Supabase/Neon built-in poolers.

## 4. Backups and point-in-time recovery

> **In short:** Base backups + WAL archiving for PITR, `pg_dump` for logical copies, regular restore tests.

| Method | What | Use |
| --- | --- | --- |
| **Physical base backup + WAL archive** (pgBackRest, WAL-G, managed snapshots) | Copy of data files + continuous WAL | **Primary strategy**: PITR to any second within retention |
| **Logical dump** (`pg_dump` / `pg_dumpall`) | SQL or custom-format export | Moving data between versions/servers, single-table restores, extra safety copy |

```bash
pg_dump -Fc -d "$DATABASE_URL" -f tasks_$(date +%F).dump        # custom format (compressed)
pg_restore -d "$TARGET_URL" --clean --if-exists -j 4 tasks_2026-11-10.dump
pg_dump -Fc -t tasks -d "$DATABASE_URL" -f tasks_table.dump      # one table
```

- Keep backups in another region/account with retention + immutability (object lock).
- **Test restores** regularly: restore to a new instance, run sanity checks (row counts, latest timestamps), record how long it took.
- `pg_dump` takes a consistent snapshot without blocking normal reads/writes, but it's slow for very large databases and isn't PITR.

## 5. Replication and high availability

> **In short:** Streaming replicas, failover, replication slots and logical replication.

- **Streaming replication**: standbys replay the primary's WAL. Async by default; `synchronous_commit` + `synchronous_standby_names` for zero data loss (slower writes).
- **Hot standby**: replicas serve read-only queries.
- **Failover**: managed services or Patroni promote a standby automatically; apps connect through a stable endpoint and must **retry** on connection errors.
- **Replication slots** guarantee WAL is kept for a replica, but an abandoned slot makes WAL pile up until the **disk fills**: monitor `pg_replication_slots`.
- **Logical replication** (publications/subscriptions): replicate selected tables, across major versions; used for zero-downtime upgrades and feeding other systems (CDC with Debezium).

```sql
-- On the primary: replication status and lag
SELECT client_addr, state, sync_state,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) AS lag
FROM pg_stat_replication;

-- On a replica
SELECT now() - pg_last_xact_replay_timestamp() AS replica_delay;
```

## 6. Monitoring: what to watch

> **In short:** Connections, long queries, locks, lag, disk, slow queries, vacuum and wraparound.

| Area | Query / metric | Alert when |
| --- | --- | --- |
| Connections | `SELECT count(*) FROM pg_stat_activity;` vs `max_connections` | > 80% |
| Long queries / idle in transaction | `pg_stat_activity` where `now() - xact_start` large | > a few minutes |
| Locks / blocking | `pg_blocking_pids()` | Sustained blocking |
| Replication lag | `pg_stat_replication`, replica delay | > seconds/minutes (by requirement) |
| Disk usage and WAL | volume metrics, `pg_ls_waldir()` | > 75–80% |
| Slow queries | `pg_stat_statements`, slow-query log | p95 regression |
| Cache hit ratio | `pg_statio_user_tables` | < 99% on OLTP |
| Dead tuples / autovacuum | `pg_stat_user_tables` | Growing `n_dead_tup`, vacuum not running |
| Wraparound | `SELECT datname, age(datfrozenxid) FROM pg_database;` | > ~1 billion (hard limit ~2 billion) |
| Checkpoints | `pg_stat_bgwriter` / `pg_stat_checkpointer` | Frequent requested checkpoints |

Tools: Prometheus `postgres_exporter` + Grafana, pganalyze, Datadog, cloud Performance Insights / Query Insights.

## 7. Maintenance tasks

> **In short:** Autovacuum, bloat, indexes, statistics, partitions and version upgrades.

- **Autovacuum**: keep it on; tune for big busy tables; watch for tables it can't keep up with.
- **Bloat**: check periodically; fix with `REINDEX CONCURRENTLY` or `pg_repack` (never `VACUUM FULL` on live tables).
- **Indexes**: review unused/duplicate indexes monthly; add missing ones based on `pg_stat_statements`.
- **Statistics**: `ANALYZE` after big data loads.
- **Partition management**: create future partitions ahead of time, drop/archive old ones (`pg_partman`, `pg_cron`).
- **Minor upgrades** (17.1 → 17.2): bug and security fixes; apply promptly (short restart).
- **Major upgrades** (16 → 17): plan them. Options:
  - `pg_upgrade --link` (fast, needs downtime of minutes)
  - **Logical replication** to a new-version cluster, then switch over (near-zero downtime)
  - Managed services' blue/green upgrade features
  Test application compatibility and performance on the new version first.

## 8. Safe schema changes on a live database

> **In short:** Lock timeouts, concurrent indexes, NOT VALID constraints and batched backfills.

- Set `lock_timeout` in migrations (e.g. `SET lock_timeout = '5s'`) so a DDL statement waiting for a lock fails fast instead of queuing all traffic behind it.
- `CREATE INDEX CONCURRENTLY`; add constraints `NOT VALID` then `VALIDATE`.
- Adding a column with a constant default is instant (PG 11+); adding a volatile default or changing a column type rewrites the table: do it in steps.
- Backfill big updates in batches.
- Details and patterns: [../09-Migrations/production.md](../09-Migrations/production.md).

## 9. Security in production

> **In short:** Private access, TLS, least privilege, audit logging and prompt patching.

- No public endpoint; access via private network, VPN or bastion.
- `sslmode=verify-full` from apps where possible.
- Least-privilege roles; RLS for multi-tenant data where suitable.
- Rotate passwords (or use IAM auth); remove old roles.
- `log_connections`, `log_disconnections`, and `pgaudit` for audit requirements.
- Keep `postgres` superuser credentials in a break-glass vault.
- Patch minor versions promptly (security fixes).

## 10. Incident runbook (short)

> **In short:** First steps for common PostgreSQL incidents.

| Symptom | First steps |
| --- | --- |
| "too many connections" | Check `pg_stat_activity` by app/state; kill idle-in-transaction sessions; check pool sizes; add/verify PgBouncer |
| Sudden slowness | Top queries in `pg_stat_statements`; blocking locks; recent deploy or migration; CPU/IO saturation; autovacuum or checkpoint storms |
| Disk filling up | WAL growth (stuck replication slot, failing archiving), table/log growth, temp files from big sorts; free space quickly, then fix the cause |
| Replica lagging | Long queries on the replica, network, heavy write burst, replica undersized |
| Accidental data deletion | Stop further damage; PITR restore to a new instance just before the incident; copy the missing rows back |
| Primary down | Confirm automatic failover; verify app reconnects; investigate old primary before reusing it |

## 11. Routine

> **In short:** Daily to yearly maintenance schedule.

| How often | Task |
| --- | --- |
| Daily | Backups verified; alerts reviewed |
| Weekly | Top queries; slow-query log; disk growth; replication health |
| Monthly | Unused indexes, bloat, autovacuum health, connection usage; minor updates |
| Quarterly | Restore test + failover drill; access/role review; capacity planning |
| Yearly | Major version upgrade; DR plan review |
