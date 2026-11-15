# 02 · Transactions, migrations and seeding

## 1. Transactions

> **In short:** Group writes so they all succeed or all fail, either as a batch array or as an interactive callback.

```ts
// Batch: independent operations in one transaction
const [order, _] = await prisma.$transaction([
  prisma.order.create({ data: { userId, total } }),
  prisma.cart.deleteMany({ where: { userId } }),
]);

// Interactive: logic between queries; throwing rolls everything back
await prisma.$transaction(async (tx) => {
  const from = await tx.account.update({ where: { id: fromId }, data: { balance: { decrement: amount } } });
  if (from.balance < 0) throw new AppError(422, 'Insufficient funds');   // → rollback
  await tx.account.update({ where: { id: toId }, data: { balance: { increment: amount } } });
}, { timeout: 10_000, isolationLevel: 'Serializable' });
```

Rules:
- Use `tx` (not `prisma`) inside the callback, or those queries run outside the transaction.
- Keep transactions short: no HTTP calls, emails or slow work inside.
- Serializable transactions may fail with write conflicts (`P2034`): retry them.

Concepts (ACID, isolation, locking): [../../FastAPI/03-Database-Concepts/06-transactions-concurrency.md](../../FastAPI/03-Database-Concepts/06-transactions-concurrency.md).

## 2. Concurrency: avoiding lost updates

> **In short:** Prefer atomic updates (`increment`, conditional `updateMany`); use version columns for optimistic locking.

```ts
// Atomic decrement only if stock is available
const result = await prisma.product.updateMany({
  where: { id: productId, stock: { gte: qty } },
  data: { stock: { decrement: qty } },
});
if (result.count === 0) throw new AppError(409, 'Out of stock');

// Optimistic locking with a version column
const res = await prisma.document.updateMany({
  where: { id, version: clientVersion },
  data: { body, version: { increment: 1 } },
});
if (res.count === 0) throw new ConflictError('Document was changed by someone else');
```

For row locks (`SELECT ... FOR UPDATE`) use raw SQL inside an interactive transaction.

## 3. Raw SQL

> **In short:** For queries the client can't express, use tagged-template raw queries, which are parameterized and safe.

```ts
const rows = await prisma.$queryRaw<{ day: Date; count: bigint }[]>`
  SELECT date_trunc('day', "createdAt") AS day, count(*) AS count
  FROM tasks
  WHERE "ownerId" = ${userId}::uuid
  GROUP BY 1 ORDER BY 1
`;

await prisma.$executeRaw`UPDATE tasks SET priority = 1 WHERE "dueDate" < now()`;
```

⚠️ `$queryRawUnsafe` with string concatenation is open to SQL injection; only use it with trusted, fixed SQL. Note that `count(*)` comes back as `bigint`.

**TypedSQL** (`prisma/sql/*.sql` files with generated types) is another option for complex reporting queries.

## 4. The migration workflow

> **In short:** Change the schema → `migrate dev` generates SQL → review and commit it → CI checks it → `migrate deploy` applies it in each environment.

| Command | Where | Does |
| --- | --- | --- |
| `prisma migrate dev --name x` | Local | Generate + apply a migration, regenerate client |
| `prisma migrate dev --create-only` | Local | Generate SQL without applying, so you can edit it first |
| `prisma migrate deploy` | CI/staging/production | Apply pending migrations only (never generates, never resets) |
| `prisma migrate status` | Anywhere | Show applied/pending migrations |
| `prisma migrate diff` | CI | Compare schema vs migrations vs DB (detect drift or missing migrations) |
| `prisma migrate resolve` | Recovery | Mark a failed migration as rolled back/applied |
| `prisma db push` | Prototyping only | Sync schema without migration files: ⚠️ never in production |

Applied migrations are tracked in the `_prisma_migrations` table.

## 5. Editing generated SQL (important)

> **In short:** Use `--create-only` to fix generated SQL before applying it: renames, data backfills, concurrent indexes and NOT NULL columns.

```bash
npx prisma migrate dev --create-only --name rename_title_to_name
```

Prisma sees a rename as **drop + add** (data loss). Edit the file:

```sql
-- Generated (dangerous):
-- ALTER TABLE "tasks" DROP COLUMN "title", ADD COLUMN "name" VARCHAR(200) NOT NULL;

-- Fixed:
ALTER TABLE "tasks" RENAME COLUMN "title" TO "name";
```

Other common edits:
- **New NOT NULL column on a table with data**: add it nullable or with a default, backfill with `UPDATE`, then set NOT NULL.
- **Indexes on big tables**: `CREATE INDEX CONCURRENTLY` must run outside a transaction; put it in its **own** migration file (PostgreSQL won't run it inside a transaction block).
- **Data migrations**: add `UPDATE`/`INSERT` statements in the migration SQL.

Then apply with `npx prisma migrate dev`. Zero-downtime patterns (expand → migrate → contract, lock timeouts) are in [../../FastAPI/09-Migrations/production.md](../../FastAPI/09-Migrations/production.md); they apply to Prisma exactly the same way.

Rules:
- Never edit a migration already applied in a shared environment; add a new one.
- Commit the migration and the schema change together.

## 6. Seeding

> **In short:** A seed script fills reference data in every environment and fake data in development; make it idempotent and refuse to add fake data in production.

```bash
npm install -D @faker-js/faker
```

```json
// package.json (newer Prisma versions configure this in prisma.config.ts instead)
"prisma": { "seed": "tsx prisma/seed.ts" }
```

```ts
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function seedReference() {
  for (const name of ['urgent', 'bug', 'feature', 'docs']) {
    await prisma.tag.upsert({ where: { name }, update: {}, create: { name } });   // idempotent
  }
}

async function seedFake() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed fake data in production');
  faker.seed(42);                                                                 // reproducible
  const passwordHash = await argon2.hash('password123');

  await prisma.user.upsert({
    where: { email: 'admin@example.com' }, update: {},
    create: { email: 'admin@example.com', passwordHash, role: 'admin', name: 'Admin' },
  });

  const users = await Promise.all(
    Array.from({ length: 20 }, () =>
      prisma.user.create({ data: { email: faker.internet.email().toLowerCase(), passwordHash, name: faker.person.fullName() } })),
  );

  await prisma.task.createMany({                                                  // bulk insert
    data: users.flatMap((u) =>
      Array.from({ length: 25 }, () => ({
        title: faker.lorem.sentence({ min: 3, max: 6 }),
        done: faker.datatype.boolean({ probability: 0.4 }),
        priority: faker.helpers.weightedArrayElement([
          { value: 1, weight: 5 }, { value: 2, weight: 15 }, { value: 3, weight: 50 }, { value: 4, weight: 20 }, { value: 5, weight: 10 },
        ]),
        ownerId: u.id,
        createdAt: faker.date.past({ years: 1 }),
      }))),
  });
}

async function main() {
  await seedReference();
  if (process.argv.includes('--fake')) await seedFake();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

```bash
npx prisma db seed                       # runs the configured seed command
npx tsx prisma/seed.ts --fake            # reference + fake data (dev)
```

Seeding concepts and production rules: [../../FastAPI/10-Seeding/](../../FastAPI/10-Seeding/).

## 7. Extending the client

> **In short:** Client extensions add reusable behaviour such as soft-delete filters or computed fields.

```ts
export const db = prisma.$extends({
  result: {
    task: {
      isOverdue: {
        needs: { dueDate: true, done: true },
        compute: (t) => !t.done && !!t.dueDate && t.dueDate < new Date(),
      },
    },
  },
});
```

---

## 8. Exercises

1. Transfer money between two accounts in an interactive transaction that rolls back on insufficient funds.
2. Decrement stock atomically with `updateMany` and handle "out of stock".
3. Rename a column safely using `--create-only` and an edited migration.
4. Add a NOT NULL `status` column to tasks with a backfill.
5. Write an idempotent seed with reference tags and 500 fake tasks; run it twice.
