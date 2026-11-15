# Database with Prisma

**Prisma** is a TypeScript ORM: you describe your data model in a `schema.prisma` file, Prisma generates a fully typed client, and **Prisma Migrate** turns schema changes into SQL migrations. These lessons use PostgreSQL.

Learn the database ideas first: [../../FastAPI/03-Database-Concepts/](../../FastAPI/03-Database-Concepts/) (SQL, design, indexes, transactions) and [../../FastAPI/04-PostgreSQL/](../../FastAPI/04-PostgreSQL/).

| # | Lesson | You will learn |
| --- | --- | --- |
| 01 | [Prisma basics](01-prisma-basics.md) | How Prisma works, setup, schema, models and relations, migrations in development, CRUD, filtering, pagination, select/include, N+1 |
| 02 | [Transactions, migrations and seeding](02-transactions-migrations-seeding.md) | Transactions, concurrency, raw SQL, migration workflow and customizing SQL, seeding with Faker |
| — | [**Production**](production.md) | Connection pooling, `migrate deploy`, zero-downtime changes, performance, monitoring |

Alternatives: **Drizzle ORM** (SQL-like, lightweight, very type-safe), **Kysely** (type-safe query builder), **TypeORM**, **MikroORM**, or plain `pg`/`postgres` with SQL.
