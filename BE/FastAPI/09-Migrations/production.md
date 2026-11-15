# Migrations in production

## 1. Checklist

> **In short:** What to verify before running migrations on production.

- [ ] Every migration reviewed in a PR (generated SQL checked with `alembic upgrade head --sql` for risky ones)
- [ ] Migrations run as **one separate deploy step**, before new code takes traffic, never by every app replica at startup
- [ ] Each migration is **backward compatible** with the version currently running
- [ ] `lock_timeout` and `statement_timeout` set for migration sessions
- [ ] Index creation uses `CONCURRENTLY`; constraints added `NOT VALID` then validated
- [ ] Big backfills run in batches, outside the schema migration
- [ ] Tested on a production-sized copy in staging
- [ ] Recent backup/PITR available before risky changes
- [ ] Rollback plan = roll forward or redeploy previous code (schema still compatible)
- [ ] Migration role separate from the app role (only the migrator can run DDL)

## 2. Where and how to run migrations

> **In short:** As one job per deploy with the new image, never from every replica at startup.

| Approach | Verdict |
| --- | --- |
| Each app container runs `alembic upgrade head` on startup | ❌ Replicas race each other; failures crash-loop the app; slow startups |
| Manual `alembic upgrade head` from a laptop | ❌ Not repeatable or audited; risky credentials |
| **One-off job in the deploy pipeline** using the new image (CI job, Kubernetes Job / Helm pre-upgrade hook, ECS one-off task, Cloud Run job) | ✅ Runs once, logged, fails the deploy before new code goes live |

Order of a typical deploy:

```
1. Build and push image (CI)
2. Run migrations with the NEW image (old code still serving traffic)
3. Roll out the new code
4. (Later deploy) run "contract" migrations that remove old columns
```

Because old code keeps running during and after step 2, **step 2 must not break it**.

## 3. Expand → migrate → contract (zero-downtime changes)

> **In short:** Split breaking changes into backward-compatible steps across deploys.

Split breaking changes into backward-compatible steps across several deploys.

### Example: rename `tasks.title` → `tasks.name`

> **In short:** A four-deploy rename that never breaks running code.

| Deploy | Migration | Code |
| --- | --- | --- |
| 1 · Expand | Add `name` (nullable) | Write **both** `title` and `name`; read `title` |
| 2 · Migrate | Backfill `name` from `title` (batched); add NOT NULL when complete | Read `name` (fallback to `title`), write both |
| 3 · Switch | — | Read and write only `name` |
| 4 · Contract | Drop `title` | — |

A direct `RENAME COLUMN` is instant in PostgreSQL, but the **currently running** code still queries `title` and fails until the rollout finishes. The multi-step approach avoids that error window. (For small apps that accept a few seconds of errors, a single-step rename during a quiet period may be acceptable: a conscious trade-off.)

### Other common cases

> **In short:** Safe recipes for adding, dropping, retyping and constraining columns and tables.

| Change | Safe approach |
| --- | --- |
| **Add a column** | Nullable or with a constant default: safe in one step |
| **Add NOT NULL column** | Add nullable → backfill → `SET NOT NULL` (or constant default in PG 11+) |
| **Drop a column** | Deploy code that no longer uses it first (and remove it from the SQLAlchemy model), **then** drop it in a later migration |
| **Drop a table** | Same: stop using it, wait, then drop (consider renaming to `_deprecated` first) |
| **Change a column type** | New column with the new type → dual write → backfill → switch reads → drop old |
| **Add a foreign key** | `ADD CONSTRAINT ... NOT VALID` then `VALIDATE CONSTRAINT` (doesn't block writes) |
| **Add a CHECK constraint** | Same `NOT VALID` + `VALIDATE` |
| **Add a unique constraint** | `CREATE UNIQUE INDEX CONCURRENTLY`, then `ADD CONSTRAINT ... UNIQUE USING INDEX` |
| **Add an index** | `CREATE INDEX CONCURRENTLY` |
| **Split a table / move data** | Dual write, backfill, switch reads, remove old path |
| **Rename a table** | Create a view with the old name during the transition, or the multi-step approach |

## 4. Locks: the hidden danger

> **In short:** DDL waiting for a lock can queue all traffic; set `lock_timeout` and retry.

Most `ALTER TABLE` statements take an **ACCESS EXCLUSIVE** lock. Even a statement that takes milliseconds can cause an outage:

```
long-running query holds a lock on `tasks`
→ ALTER TABLE tasks ... waits for it
→ every new query on `tasks` queues behind the ALTER (lock queue)
→ API requests pile up and time out
```

Protect yourself:

```python
# alembic/env.py, inside run_migrations_online, before running migrations
connection.execute(sa.text("SET lock_timeout = '5s'"))         # give up instead of blocking traffic
connection.execute(sa.text("SET statement_timeout = '15min'"))
```

- If a migration hits the lock timeout, it fails cleanly; **retry** later (automate retries with backoff).
- Run risky migrations at low-traffic times.
- Check for long-running transactions before migrating (`pg_stat_activity`).

### Operations that rewrite the whole table (slow + locked), to avoid on big tables

> **In short:** Type changes, volatile defaults and similar operations to avoid on big tables.

- Changing a column type (most cases)
- Adding a column with a **volatile** default (`DEFAULT now()` is fine as it's evaluated once in newer versions, but `DEFAULT gen_random_uuid()` rewrites)
- `VACUUM FULL`, `CLUSTER`
- Adding a stored generated column

Linters like **squawk** (PostgreSQL migration linter) can flag these in CI by checking the generated SQL.

## 5. Large tables and backfills

> **In short:** Batched, throttled, resumable backfills, watching load and replication lag.

- Keep the schema migration fast; run the backfill as a **separate batched job** (script/Celery task) after deploy, with progress logging, throttling (sleep between batches) and the ability to resume.
- Batch by primary key ranges (`WHERE id BETWEEN x AND y`) to use the index and keep transactions short.
- Monitor replication lag and DB load during backfills; slow down if replicas fall behind.
- For huge changes, consider online schema change tools or logical replication.

## 6. Rollbacks

> **In short:** Roll forward, keep the old code compatible, and delay destructive changes.

- **Prefer roll-forward**: fix with a new migration.
- Make the **previous app version compatible with the new schema** (expand/contract), so rolling back the app never needs a schema rollback.
- Destructive changes (drop column/table) are **irreversible** without a backup: delay them, and take a backup or verify PITR before running them.
- `alembic downgrade` in production is a last resort, rehearsed in staging first.

## 7. Process and communication

> **In short:** Label, review, plan and rehearse risky migrations.

- Mark PRs that contain migrations (label, CODEOWNERS requiring a DB-aware reviewer).
- For risky migrations, write a short plan: expected duration (measured on a production-sized copy), locks taken, rollback approach, monitoring.
- Separate risky migrations from feature code deploys when possible.
- Keep a changelog of schema changes for teams that consume the database (analytics, other services).
- Run migrations against staging with production-like data **before** production, every time.

## 8. Monitoring during migrations

> **In short:** Watch locks, errors, load and lag, ready to cancel.

Watch: lock waits (`pg_locks`, `pg_stat_activity.wait_event`), API error rate and latency, DB CPU/IO, replication lag, migration job logs. Have someone ready to cancel (`pg_cancel_backend`) if traffic starts queuing.

## 9. Routine

> **In short:** Per-PR, per-deploy and quarterly migration hygiene.

| When | Task |
| --- | --- |
| Every PR with a migration | Review SQL, check locks/rewrites (squawk), confirm backward compatibility |
| Every deploy | Migration job before rollout; monitor; verify `alembic current` matches `heads` |
| After contract steps | Remove dual-write code and feature flags |
| Quarterly | Clean up deprecated columns/tables still waiting for their contract step; consider squashing very old migrations |
