# Databases in production (general principles)

These apply to any database. PostgreSQL specifics are in [../04-PostgreSQL/production.md](../04-PostgreSQL/production.md).

## 1. Managed vs self-hosted

> **In short:** Managed services handle operations for you; self-hosting gives control but needs expertise.

| | Managed (RDS, Cloud SQL, Azure, Neon, Supabase…) | Self-hosted (VMs / Kubernetes) |
| --- | --- | --- |
| Setup, patching, backups, failover | Done for you | Your job |
| Control and tuning | Limited | Full |
| Cost | Higher per resource, lower people-cost | Cheaper hardware, needs DB expertise |
| Recommendation | **Default for most teams** | When you have specific needs and in-house expertise |

## 2. Backups and recovery

> **In short:** Define RPO/RTO, use full backups plus PITR, follow 3-2-1 and test restores.

**A backup that hasn't been restored is not a backup.**

- Define targets:
  - **RPO** (Recovery Point Objective): how much data you can lose (e.g. 5 minutes).
  - **RTO** (Recovery Time Objective): how long recovery may take (e.g. 1 hour).
- Combine **full backups** (daily) + **continuous transaction-log archiving** for **point-in-time recovery (PITR)**: restore to just before "someone ran DELETE without WHERE".
- Follow **3-2-1**: 3 copies, 2 different media/services, 1 off-site (another region/account).
- Encrypt backups; restrict who can access and delete them (protect against ransomware and accidental deletion: immutable/locked storage).
- **Test restores regularly** (monthly/quarterly), and time them against your RTO.
- Keep retention that matches business and legal needs.

## 3. High availability

> **In short:** A standby replica with automatic failover, plus a disaster recovery plan.

- Run a **primary with at least one standby replica**, preferably in another availability zone.
- **Automatic failover** (managed services, Patroni, cloud HA). Apps reconnect via a stable endpoint/DNS.
- Practise failover; apps must handle dropped connections and retry.
- For disaster recovery: cross-region replicas or backups, with a documented runbook.

## 4. Security

> **In short:** Private networking, encryption, least-privilege roles, secret management and auditing.

| Area | Practice |
| --- | --- |
| Network | DB in a **private network**; no public internet access; security groups allow only app servers and bastion/VPN |
| Encryption | TLS for connections; encryption at rest (disk/backup) |
| Authentication | Strong unique passwords or IAM/certificate auth; rotate credentials |
| Least privilege | Separate roles: app role (only DML on its tables), migration role (DDL), read-only role (analytics), admin (rarely used). The app must **not** connect as superuser |
| Secrets | In a secret manager, never in code or images |
| Injection | Parameterized queries only |
| Auditing | Log connections, DDL and privileged actions; review access regularly |
| Data protection | Minimize personal data; mask/anonymize data copied to dev/staging; meet GDPR/DPDP needs (deletion, retention) |

## 5. Monitoring

> **In short:** The metrics to watch and alert on: resources, connections, queries, lag and backups.

Watch and alert on:

| Metric | Why |
| --- | --- |
| CPU, memory, disk I/O, **disk space** | Running out of disk can stop the database |
| Connections (used vs max) | Exhaustion → app errors |
| Query latency, slow queries, top queries by total time | Find what to optimize |
| Transactions per second, errors, deadlocks | Health and contention |
| Replication lag | Stale reads, failover data-loss risk |
| Cache hit ratio | Too low → more RAM or better queries/indexes |
| Locks and long-running transactions | Blocked queries, bloat |
| Backup success and age | Failed backups go unnoticed otherwise |

Tools: cloud dashboards (CloudWatch, Cloud Monitoring), Prometheus exporters + Grafana, Datadog, pganalyze, PMM.

## 6. Capacity planning

> **In short:** Track growth and keep headroom for CPU, disk and connections.

- Track growth of data size, rows per table and traffic monthly; project 6–12 months ahead.
- Keep headroom: CPU < ~70% at peak, disk < ~70–80% used, connections < ~80% of max.
- Load-test schema changes and new features against production-sized data.
- Archive or partition old data before tables get unmanageable.

## 7. Schema changes

> **In short:** Versioned, reviewed, backward-compatible migrations applied by CI/CD.

- Always via **versioned migrations**, reviewed like code, applied by CI/CD (never by hand on production).
- Use **backward-compatible** steps so old and new app versions work during deploys (expand → migrate → contract).
- Watch for locking DDL on large tables; use online techniques.
- Details: [../09-Migrations/production.md](../09-Migrations/production.md).

## 8. Operational hygiene

> **In short:** Separate environments, runbooks, restricted access and timeouts.

- Separate databases (or servers) for production, staging and development; never test against production.
- Staging with production-like volume (anonymized) to catch slow queries before release.
- A **runbook** for common incidents: failover, restore, disk full, connection exhaustion, runaway query (how to find and cancel it).
- Limit direct production access; use read-only accounts and audited sessions for investigations; require a second person for destructive operations.
- Set statement and idle-transaction timeouts to stop runaway queries.

## 9. Maintenance routine

> **In short:** Daily, weekly, monthly, quarterly and yearly database tasks.

| How often | Task |
| --- | --- |
| Daily (automated) | Backups, backup verification alerts, monitoring |
| Weekly | Review slow queries and errors; check disk growth |
| Monthly | Review unused/duplicate indexes, table bloat, connection usage; apply minor version updates |
| Quarterly | **Restore test**; failover drill; access review; credential rotation; capacity review |
| Yearly | Major version upgrade plan; review backup retention and DR plan |
