# 06 · Transactions and concurrency

## 1. Transactions

> **In short:** Group statements so they all succeed or all fail together.

A **transaction** groups statements so they **all succeed or all fail** together.

```sql
BEGIN;
UPDATE accounts SET balance = balance - 500 WHERE id = 1;
UPDATE accounts SET balance = balance + 500 WHERE id = 2;
COMMIT;            -- both changes become permanent and visible
-- or ROLLBACK;    -- neither change happens
```

If the server crashes between the two updates, the transaction never committed, so no money disappears.

### Savepoints: partial rollback

> **In short:** Undo part of a transaction without abandoning all of it.

```sql
BEGIN;
INSERT INTO orders ...;
SAVEPOINT before_items;
INSERT INTO order_items ...;      -- fails
ROLLBACK TO SAVEPOINT before_items;
COMMIT;                           -- the order is kept
```

In PostgreSQL, any error inside a transaction aborts it: everything until `ROLLBACK` fails with "current transaction is aborted".

## 2. ACID

> **In short:** Atomicity, Consistency, Isolation and Durability: the guarantees transactions give.

| Property | Meaning | Example |
| --- | --- | --- |
| **Atomicity** | All or nothing | Transfer: both updates or neither |
| **Consistency** | Constraints always hold before and after | Balance can't go below 0 if there's a CHECK |
| **Isolation** | Concurrent transactions don't see each other's half-done work (to a degree set by the isolation level) | Two transfers at once don't corrupt balances |
| **Durability** | Committed data survives crashes | Written to the write-ahead log (WAL) on disk before COMMIT returns |

## 3. Concurrency anomalies

> **In short:** Dirty reads, non-repeatable reads, phantoms, lost updates and write skew.

When transactions run at the same time, these problems can occur:

| Anomaly | What happens |
| --- | --- |
| **Dirty read** | T1 reads T2's uncommitted change; T2 rolls back; T1 used data that never existed |
| **Non-repeatable read** | T1 reads a row twice and gets different values because T2 committed an update in between |
| **Phantom read** | T1 runs the same query twice and gets different **sets of rows** because T2 inserted/deleted |
| **Lost update** | T1 and T2 both read a value, both write back a modified value; one write is lost |
| **Write skew** | Two transactions read overlapping data and each makes a change that's valid alone but breaks a rule together (e.g. both doctors go off-call) |

### Lost update example

> **In short:** Two transactions read the same value and one overwrites the other's change.

```
T1: SELECT stock FROM products WHERE id = 1;   -- 10
T2: SELECT stock FROM products WHERE id = 1;   -- 10
T1: UPDATE products SET stock = 9 WHERE id = 1; COMMIT;
T2: UPDATE products SET stock = 9 WHERE id = 1; COMMIT;   -- two items sold, stock only dropped by 1
```

## 4. Isolation levels

> **In short:** How strictly concurrent transactions are separated, and the trade-off with conflicts.

| Level | Dirty read | Non-repeatable read | Phantom | Notes |
| --- | --- | --- | --- | --- |
| Read Uncommitted | possible* | possible | possible | *PostgreSQL treats it as Read Committed |
| **Read Committed** | ❌ | possible | possible | **PostgreSQL default.** Each statement sees data committed before it started |
| Repeatable Read | ❌ | ❌ | ❌ in PostgreSQL | The transaction sees one snapshot. Conflicting writes fail with a serialization error |
| **Serializable** | ❌ | ❌ | ❌ | Behaves as if transactions ran one at a time. Prevents write skew; may fail with serialization errors you must **retry** |

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;
...
COMMIT;
```

Higher isolation = fewer anomalies but more conflicts and retries. Most apps use Read Committed plus **explicit locking or atomic updates** where it matters.

## 5. Fixing lost updates

> **In short:** Four techniques to stop concurrent writes from overwriting each other.

### 1. Atomic update (best when possible)

> **In short:** Compute the new value inside the UPDATE statement itself.

```sql
UPDATE products SET stock = stock - 1 WHERE id = 1 AND stock > 0 RETURNING stock;
-- 0 rows updated → out of stock
```

### 2. Pessimistic locking: lock the row while you work

> **In short:** `SELECT ... FOR UPDATE` makes other writers wait.

```sql
BEGIN;
SELECT stock FROM products WHERE id = 1 FOR UPDATE;   -- other transactions wanting this row WAIT
-- check and compute in app code
UPDATE products SET stock = 8 WHERE id = 1;
COMMIT;                                              -- lock released
```

Variants: `FOR UPDATE NOWAIT` (fail immediately if locked), `FOR UPDATE SKIP LOCKED` (skip locked rows: great for job queues), `FOR SHARE` (block writes but allow other readers).

### 3. Optimistic locking: detect conflicts with a version number

> **In short:** Update only if the version is unchanged; otherwise report a conflict.

```sql
-- read: version = 7
UPDATE documents
SET body = 'new text', version = version + 1
WHERE id = 1 AND version = 7;
-- 0 rows updated → someone else changed it first → tell the user / retry
```

No locks held while the user edits. Good for web forms and APIs (return `409 Conflict`). HTTP equivalent: `ETag` + `If-Match`.

| | Pessimistic | Optimistic |
| --- | --- | --- |
| Conflicts | Prevented by waiting | Detected at write time |
| Best when | Conflicts are common, transactions short | Conflicts are rare, long "think time" (user editing) |
| Risk | Waiting, deadlocks | Retries / user sees a conflict |

### 4. Constraints and unique indexes

> **In short:** Let the database reject duplicates instead of checking first.

A UNIQUE constraint makes "check then insert" race-free: just insert and handle the unique violation (or `ON CONFLICT`).

## 6. Locks and deadlocks

> **In short:** Transactions waiting on each other's locks; prevent with consistent ordering and short transactions.

Databases lock rows (and sometimes tables) during writes. A **deadlock** happens when two transactions each wait for a lock the other holds:

```
T1: locks row A, then wants row B
T2: locks row B, then wants row A   → deadlock
```

The database detects it and **aborts one** transaction ("deadlock detected"). Prevent deadlocks by:
- Locking rows in a **consistent order** (e.g. always by ascending ID).
- Keeping transactions **short** (never wait for user input or slow HTTP calls inside a transaction).
- Retrying on deadlock/serialization errors.

DDL like `ALTER TABLE` can take strong table locks that block all queries: see [../09-Migrations/production.md](../09-Migrations/production.md).

## 7. MVCC (how PostgreSQL does isolation)

> **In short:** Row versions let readers and writers avoid blocking each other; VACUUM cleans old versions.

PostgreSQL uses **Multi-Version Concurrency Control**: an UPDATE writes a **new version** of the row instead of overwriting it. Each transaction sees the versions that were committed when its snapshot was taken.

- **Readers never block writers, and writers never block readers.**
- Old row versions ("dead tuples") pile up and are cleaned by **VACUUM** (autovacuum). Long-running transactions prevent cleanup and cause **bloat**: avoid leaving transactions open ("idle in transaction").

## 8. Transactions in application code

> **In short:** Short transactions, no slow calls inside them, and retries on conflicts.

- One request → usually one transaction (commit at the end, roll back on error).
- Keep transactions short: do HTTP calls, emails and heavy computation **outside** them.
- Retry on serialization failures and deadlocks (with a limit and backoff).
- Don't rely on "read then write" without a lock, an atomic update or a constraint.

### Distributed operations: the outbox pattern

> **In short:** Save an event in the same transaction, then publish it reliably from a worker.

You can't wrap "save to DB" and "send to a message queue / external API" in one transaction. If the DB commits but the publish fails (or vice versa), they go out of sync. The **transactional outbox** pattern:
1. In the same DB transaction, save the data **and** an `outbox` row describing the event.
2. A background worker reads unsent outbox rows, publishes them, and marks them sent.
3. Consumers must be **idempotent** (handle duplicates), since delivery is at-least-once.

### Idempotency keys

> **In short:** Let clients retry safely without creating duplicates.

For APIs that create things (payments, orders), clients send an `Idempotency-Key` header. The server stores the key with the result (unique constraint) and returns the same result on retries instead of creating duplicates.

---

## 9. Exercises

1. In two `psql` sessions, reproduce a lost update, then fix it with an atomic update, `FOR UPDATE`, and a version column.
2. Create a deadlock between two sessions and read the error; fix it by consistent lock ordering.
3. Build a simple job queue table and claim jobs with `FOR UPDATE SKIP LOCKED` from two sessions.
4. Show a non-repeatable read in Read Committed and its absence in Repeatable Read.
5. Design an `Idempotency-Key` table for a "create payment" endpoint.
