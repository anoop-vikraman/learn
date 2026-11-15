# Database concepts: from scratch to advanced

These lessons teach the ideas behind relational databases and SQL. They apply to PostgreSQL, MySQL, SQLite, SQL Server and others. PostgreSQL-specific features are in [../04-PostgreSQL/](../04-PostgreSQL/).

To practise, run PostgreSQL in Docker (`docker run --name pg -e POSTGRES_PASSWORD=secret -p 5432:5432 -d postgres:17`) and connect with `psql`, DBeaver, pgAdmin or VS Code's database extension.

| # | Lesson | Level | You will learn |
| --- | --- | --- | --- |
| 01 | [What is a database?](01-intro-relational-model.md) | Beginner | DBMS, tables, rows, columns, keys, relational vs NoSQL, SQL sub-languages |
| 02 | [SQL basics](02-sql-basics.md) | Beginner | CREATE TABLE, INSERT, SELECT, WHERE, ORDER BY, LIMIT, UPDATE, DELETE, NULL |
| 03 | [Joins, aggregation and subqueries](03-joins-aggregation-subqueries.md) | Intermediate | INNER/LEFT/RIGHT/FULL joins, GROUP BY, HAVING, subqueries, UNION, CASE |
| 04 | [Database design and normalization](04-design-normalization.md) | Intermediate | Relationships, ER diagrams, keys, constraints, 1NF–3NF, denormalization |
| 05 | [Indexes and query performance](05-indexes-performance.md) | Advanced | B-tree indexes, composite indexes, query plans, when indexes help or hurt |
| 06 | [Transactions and concurrency](06-transactions-concurrency.md) | Advanced | ACID, isolation levels, anomalies, locking, deadlocks, MVCC, optimistic locking |
| 07 | [Scaling and NoSQL](07-scaling-nosql.md) | Advanced | Replication, sharding, partitioning, CAP, caching, NoSQL types, choosing a database |
| — | [**Production**](production.md) | — | Backups, high availability, security, monitoring, capacity and maintenance (database-agnostic) |
