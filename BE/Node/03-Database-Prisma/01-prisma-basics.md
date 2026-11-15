# 01 · Prisma basics

## 1. How Prisma works

> **In short:** You write a schema; Prisma generates a typed client from it; at runtime the client turns your method calls into SQL sent to PostgreSQL through a connection pool.

```
schema.prisma ──prisma generate──▶ typed Prisma Client (in node_modules or your output folder)
      │
      └──prisma migrate dev──▶ SQL migration files ──▶ database schema

app code: prisma.task.findMany({ where: { done: false } })
      └──▶ query engine / driver adapter builds SQL ──▶ pooled connection ──▶ PostgreSQL
```

Because the client is generated from your schema, `prisma.task.create({ data: { titel: 'x' } })` is a **compile-time error**, and query results are typed exactly (including relations you `include`).

*(Version note: Prisma has been moving from a Rust query engine to a TypeScript engine with "driver adapters" such as `@prisma/adapter-pg`, and newer versions use a `prisma-client` generator with an explicit `output` path. The concepts and query API below are the same; check the setup steps in the docs for the version you install.)*

## 2. Setup

> **In short:** Install the Prisma CLI and client, initialize the project, and point `DATABASE_URL` at PostgreSQL.

```bash
npm install @prisma/client
npm install -D prisma
npx prisma init --datasource-provider postgresql
```

```bash
# .env
DATABASE_URL="postgresql://app:secret@localhost:5432/tasks?schema=public"
```

Start PostgreSQL with Docker (see [../../FastAPI/04-PostgreSQL/01-setup-psql.md](../../FastAPI/04-PostgreSQL/01-setup-psql.md)).

## 3. The schema

> **In short:** `schema.prisma` declares the datasource, the client generator and your models with fields, types, defaults, relations and indexes.

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  admin
  member
}

model User {
  id           String    @id @default(uuid()) @db.Uuid
  email        String    @unique
  passwordHash String
  name         String?
  role         Role      @default(member)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  projects     Project[]
  tasks        Task[]
}

model Project {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  ownerId   String   @db.Uuid
  owner     User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  tasks     Task[]
  createdAt DateTime @default(now())

  @@index([ownerId])
}

model Task {
  id          String    @id @default(uuid()) @db.Uuid
  title       String    @db.VarChar(200)
  description String?
  done        Boolean   @default(false)
  priority    Int       @default(3) @db.SmallInt
  dueDate     DateTime? @db.Date
  ownerId     String    @db.Uuid
  owner       User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  projectId   String?   @db.Uuid
  project     Project?  @relation(fields: [projectId], references: [id], onDelete: SetNull)
  tags        Tag[]                              // implicit many-to-many
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([ownerId, done, createdAt(sort: Desc)])
  @@map("tasks")                                 // table name in the DB
}

model Tag {
  id    String @id @default(uuid()) @db.Uuid
  name  String @unique
  tasks Task[]
}
```

| Syntax | Meaning |
| --- | --- |
| `String?` | Optional (nullable) |
| `Task[]` | List side of a relation |
| `@id`, `@default(uuid())`, `@default(now())`, `@updatedAt` | Primary key and automatic values |
| `@unique`, `@@unique([a, b])` | Unique constraints |
| `@@index([...])` | Indexes (remember: foreign keys aren't indexed automatically in PostgreSQL) |
| `@relation(fields, references, onDelete)` | Foreign key and its delete behaviour |
| `@db.Uuid`, `@db.VarChar(200)` | Exact database column types |
| `@map` / `@@map` | Different column/table names in the DB (e.g. snake_case) |

## 4. Migrations in development

> **In short:** `prisma migrate dev` compares the schema with the database, writes a SQL migration file, applies it and regenerates the client.

```bash
npx prisma migrate dev --name init          # create + apply migration, regenerate client
npx prisma migrate dev --name add_task_tags # after each schema change
npx prisma generate                         # regenerate the client only
npx prisma studio                           # GUI to browse/edit data
npx prisma migrate reset                    # ⚠️ drop DB, re-apply all migrations, run seed (dev only)
npx prisma format                           # format schema.prisma
```

Migration files live in `prisma/migrations/<timestamp>_<name>/migration.sql`: plain SQL, committed to git, reviewed in PRs. More in lesson 02 and [production.md](production.md).

## 5. The client singleton

> **In short:** Create one PrismaClient per process and reuse it; each instance has its own connection pool.

```ts
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});
```

⚠️ Creating a new `PrismaClient` per request exhausts database connections.

## 6. CRUD

> **In short:** Each model gets methods like `create`, `findUnique`, `findMany`, `update`, `delete`, with fully typed arguments and results.

```ts
// CREATE
const task = await prisma.task.create({
  data: { title: 'Write docs', ownerId: user.id, tags: { connectOrCreate: [{ where: { name: 'docs' }, create: { name: 'docs' } }] } },
});

// READ one
const byId = await prisma.task.findUnique({ where: { id } });            // by unique field → or null
const mine = await prisma.task.findFirst({ where: { id, ownerId } });    // any filter → or null
const must = await prisma.task.findUniqueOrThrow({ where: { id } });     // throws if missing

// READ many
const open = await prisma.task.findMany({
  where: { ownerId, done: false },
  orderBy: { createdAt: 'desc' },
  take: 20,
  skip: 0,
});

// UPDATE
const updated = await prisma.task.update({ where: { id }, data: { done: true } });
await prisma.task.updateMany({ where: { ownerId, dueDate: { lt: new Date() } }, data: { priority: 1 } });

// UPSERT
await prisma.tag.upsert({ where: { name: 'urgent' }, update: {}, create: { name: 'urgent' } });

// DELETE
await prisma.task.delete({ where: { id } });                              // throws if missing
await prisma.task.deleteMany({ where: { done: true, ownerId } });

// COUNT / AGGREGATE / GROUP BY
const total = await prisma.task.count({ where: { ownerId } });
const stats = await prisma.task.aggregate({ where: { ownerId }, _avg: { priority: true }, _count: true });
const byDone = await prisma.task.groupBy({ by: ['done'], where: { ownerId }, _count: { _all: true } });
```

## 7. Filtering

> **In short:** `where` supports equality, comparisons, text search, lists, null checks, relation filters and AND/OR/NOT combinations.

```ts
await prisma.task.findMany({
  where: {
    ownerId,
    title: { contains: q, mode: 'insensitive' },         // ILIKE '%q%'
    priority: { gte: 2, lte: 4 },
    dueDate: { not: null },
    projectId: { in: projectIds },
    tags: { some: { name: 'urgent' } },                  // relation filter
    OR: [{ done: false }, { updatedAt: { gt: lastWeek } }],
    NOT: { title: { startsWith: '[archived]' } },
  },
});
```

## 8. Selecting fields and loading relations

> **In short:** `select` picks exactly which fields to return (and hides secrets); `include` adds related records in the same call.

```ts
// Only what the API needs (never return passwordHash)
const users = await prisma.user.findMany({ select: { id: true, email: true, name: true } });

// Related data
const project = await prisma.project.findUnique({
  where: { id },
  include: {
    owner: { select: { id: true, email: true } },
    tasks: { where: { done: false }, orderBy: { createdAt: 'desc' }, take: 10 },
    _count: { select: { tasks: true } },
  },
});
```

Result types follow your `select`/`include` exactly, so `project.tasks` exists only because you included it.

## 9. The N+1 problem

> **In short:** Querying related data inside a loop runs one query per item; load relations up front with `include` or a single `in` query.

```ts
// ❌ 1 + N queries
const tasks = await prisma.task.findMany({ take: 50 });
for (const t of tasks) {
  t.owner = await prisma.user.findUnique({ where: { id: t.ownerId } });
}

// ✅ one call
const tasksWithOwner = await prisma.task.findMany({ take: 50, include: { owner: { select: { id: true, email: true } } } });
```

Turn on query logging in development to spot repeated queries.

## 10. Pagination

> **In short:** Offset pagination with `skip`/`take` is simple; cursor pagination with `cursor` scales to large tables and infinite scroll.

```ts
// Offset
const [items, total] = await prisma.$transaction([
  prisma.task.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * size, take: size }),
  prisma.task.count({ where }),
]);

// Cursor (keyset)
const pageItems = await prisma.task.findMany({
  where,
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: size + 1,
  ...(cursor && { cursor: { id: cursor }, skip: 1 }),
});
const hasMore = pageItems.length > size;
const nextCursor = hasMore ? pageItems[size - 1].id : null;
```

## 11. Handling Prisma errors

> **In short:** Known errors have codes (P2002 unique violation, P2025 record not found); map them to 409 and 404.

```ts
import { Prisma } from '@prisma/client';

try {
  await prisma.user.create({ data: { email, passwordHash } });
} catch (err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') throw new ConflictError('Email already registered');
    if (err.code === 'P2025') throw new NotFoundError('User');
  }
  throw err;
}
```

You can do this mapping once in the central error handler.

---

## 12. Exercises

1. Write the schema above, run `migrate dev`, and inspect the generated SQL.
2. Implement the task service (create, list with filters and pagination, get, update, delete) with Prisma.
3. Return tasks with their owner's email and project name in one query.
4. Map P2002 to 409 and P2025 to 404 in the error handler.
5. Add an index for "a user's open tasks, newest first" and check the query plan with `EXPLAIN` in psql.
