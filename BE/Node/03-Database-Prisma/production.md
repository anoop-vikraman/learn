# Prisma and the database in production

PostgreSQL operations (backups, HA, monitoring, vacuum) are in [../../FastAPI/04-PostgreSQL/production.md](../../FastAPI/04-PostgreSQL/production.md); general principles in [../../FastAPI/03-Database-Concepts/production.md](../../FastAPI/03-Database-Concepts/production.md).

## 1. Checklist

> **In short:** What to have in place before Prisma talks to a production database.

- [ ] Migrations applied with `prisma migrate deploy` as a separate deploy step
- [ ] Every migration reviewed; generated SQL edited for renames, backfills and concurrent indexes
- [ ] Backward-compatible schema changes (expand → migrate → contract)
- [ ] One PrismaClient per process; pool size set; PgBouncer/pooler for many instances or serverless
- [ ] App connects as a least-privilege role; migrations use a separate role
- [ ] Query logging of slow queries and errors; no PII in logs
- [ ] Indexes for every frequent filter/sort; N+1 queries removed
- [ ] `prisma generate` runs at build time; the Prisma CLI isn't needed at runtime (except for the migration job)

## 2. Running migrations in deployments

> **In short:** Run `prisma migrate deploy` once per release (CI job, Kubernetes Job, ECS one-off task) before the new code receives traffic.

```bash
npx prisma migrate deploy
```

- Never run `migrate dev`, `migrate reset` or `db push` against production.
- Don't run migrations from every app container on startup (replicas race each other, failures crash-loop the app).
- Keep the `prisma` CLI available to the migration job (often a separate build stage or image target).
- If a migration fails midway, fix forward; use `prisma migrate resolve` to mark its state after manual repair.
- Set a `lock_timeout` in risky migrations (`SET lock_timeout = '5s';` at the top of the SQL) so they fail fast instead of blocking traffic.

## 3. Connection pooling

> **In short:** Each PrismaClient keeps a pool; total connections = instances × pool size, which must stay below PostgreSQL's limit.

- Configure pool size with `connection_limit` in the URL (`?connection_limit=10&pool_timeout=10`), or in the driver adapter's pool settings with newer versions.
- Many instances, autoscaling or serverless functions → put **PgBouncer** (transaction mode) or a managed pooler (RDS Proxy, Supabase/Neon pooler, Prisma Accelerate) in front of PostgreSQL. With PgBouncer in transaction mode, add `pgbouncer=true` to the URL (disables prepared statements that don't survive pooling) and use a **direct** connection URL for migrations (`directUrl`).
- Disconnect cleanly on shutdown (`prisma.$disconnect()`).

## 4. Safe schema changes

> **In short:** Prisma generates naive SQL; on big live tables you must use online patterns.

| Change | Safe approach |
| --- | --- |
| Rename column/table | Expand/contract across deploys, or edited `RENAME` with a brief compatibility window |
| Add NOT NULL column | Nullable → backfill in batches → set NOT NULL |
| Add index | `CREATE INDEX CONCURRENTLY` in its own migration |
| Add FK/check | `NOT VALID` then `VALIDATE CONSTRAINT` (edited SQL) |
| Drop column | Remove from code + schema usage first, drop in a later release |
| Change type | New column, dual write, backfill, switch, drop old |

Run large backfills as separate batched jobs (a script or BullMQ job), not inside the migration. Details: [../../FastAPI/09-Migrations/production.md](../../FastAPI/09-Migrations/production.md).

## 5. Performance

> **In short:** Select only needed fields, eager-load relations, paginate with cursors, index your filters, and measure with query logs and `pg_stat_statements`.

- Use `select` to avoid fetching large columns you don't use.
- Replace loops of queries with `include`, `in` filters, `createMany`, `updateMany`.
- Cursor pagination for large lists.
- Add `@@index` for frequent `where`/`orderBy` combinations; verify with `EXPLAIN ANALYZE`.
- Log slow queries via Prisma's query events and PostgreSQL's `log_min_duration_statement`.
- Use read replicas for heavy reads (`@prisma/extension-read-replicas`) with awareness of replication lag.
- Cache hot reads in Redis.

```ts
const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
prisma.$on('query', (e) => { if (e.duration > 200) logger.warn({ ms: e.duration, query: e.query }, 'slow query'); });
```

## 6. Security

> **In short:** Least-privilege roles, TLS connections, no unsafe raw SQL, and never return sensitive fields.

- Separate DB roles: the app role can't run DDL; the migration role can.
- `sslmode=require` (or stricter) in the connection string for remote databases.
- Avoid `$queryRawUnsafe` with user input.
- Always `select` away `passwordHash` and secrets in API responses (or use an extension/DTO mapping).
- Scope every user-owned query by `ownerId`/`tenantId` (consider PostgreSQL RLS for multi-tenant apps).

## 7. Monitoring

> **In short:** Watch query latency, errors, pool waits and the database itself.

- Prisma metrics/OpenTelemetry tracing (`@prisma/instrumentation`) for query spans.
- Alert on pool timeouts (`P2024`), connection errors, slow-query rate.
- Database-side monitoring as described in the PostgreSQL production guide.

## 8. Routine

> **In short:** Regular database-related tasks for a Prisma app.

| How often | Task |
| --- | --- |
| Every PR with a schema change | Review generated SQL; check locks/rewrites; confirm backward compatibility |
| Every deploy | `migrate deploy` job; `migrate status` clean |
| Monthly | Review slow queries and missing indexes; update Prisma (read release notes) |
| Quarterly | Clean up contract-phase leftovers; restore test with the DB team |
