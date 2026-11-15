# 01 · What is a database?

## 1. Why not just files?

> **In short:** Databases handle concurrent access, fast search, valid data, crash recovery and permissions, which files can't.

You could save data in JSON or CSV files, but as soon as several users read and write at once, you need: fast search across millions of records, no corrupted data when two writes collide, rules that keep data valid, recovery after crashes, and access control. A **database management system (DBMS)** provides all of that.

## 2. The relational model

> **In short:** Data lives in tables of rows and columns, linked by primary and foreign keys.

A **relational database** stores data in **tables** (relations).

**users**

| id | email | full_name | created_at |
| --- | --- | --- | --- |
| 1 | anoop@example.com | Anoop V | 2026-01-10 |
| 2 | bina@example.com | Bina K | 2026-02-03 |

**tasks**

| id | title | done | user_id |
| --- | --- | --- | --- |
| 10 | Write docs | false | 1 |
| 11 | Review PR | true | 1 |
| 12 | Plan sprint | false | 2 |

| Term | Meaning |
| --- | --- |
| **Table** (relation) | A set of rows about one kind of thing |
| **Row** (record, tuple) | One item (one user) |
| **Column** (field, attribute) | One property, with a **data type** (integer, text, date…) |
| **Schema** | The structure: tables, columns, types, constraints. (In PostgreSQL also a namespace grouping tables) |
| **Primary key (PK)** | Column(s) uniquely identifying each row (`users.id`) |
| **Foreign key (FK)** | Column referencing another table's PK (`tasks.user_id → users.id`), linking rows |
| **Constraint** | A rule the DB enforces: NOT NULL, UNIQUE, CHECK, FK |
| **Index** | A data structure that speeds up lookups (lesson 05) |
| **Query** | A request to read or change data, written in SQL |

The power of the relational model: data is stored **once** and **linked by keys**, and you combine tables at query time with **joins**.

## 3. SQL

> **In short:** The declarative language for defining, querying, changing and securing relational data.

**SQL** (Structured Query Language) is the standard language for relational databases. It's **declarative**: you describe *what* you want, and the database's **query planner** decides *how* to get it.

```sql
SELECT title FROM tasks WHERE user_id = 1 AND done = false;
```

| Sub-language | Commands | Purpose |
| --- | --- | --- |
| **DDL** (Data Definition) | `CREATE`, `ALTER`, `DROP`, `TRUNCATE` | Define structure |
| **DML** (Data Manipulation) | `INSERT`, `UPDATE`, `DELETE`, `MERGE` | Change data |
| **DQL** (Data Query) | `SELECT` | Read data |
| **DCL** (Data Control) | `GRANT`, `REVOKE` | Permissions |
| **TCL** (Transaction Control) | `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT` | Transactions |

Every database has its own dialect on top of standard SQL (PostgreSQL, MySQL, SQL Server's T-SQL, Oracle's PL/SQL).

## 4. Popular relational databases

> **In short:** PostgreSQL, MySQL, SQLite, commercial and cloud-managed options.

| Database | Notes |
| --- | --- |
| **PostgreSQL** | Open source, feature-rich (JSONB, full-text search, extensions), very standards-compliant. Great default |
| **MySQL / MariaDB** | Open source, widely used in web hosting |
| **SQLite** | A file-based database inside your app; great for mobile, desktop, tests, small sites |
| **SQL Server**, **Oracle** | Commercial, enterprise |
| Cloud managed | AWS RDS/Aurora, Google Cloud SQL/AlloyDB, Azure Database, Neon, Supabase |

## 5. Relational vs NoSQL (overview)

> **In short:** Tables with strong consistency vs flexible models built to scale out; start with PostgreSQL.

| | Relational (SQL) | NoSQL |
| --- | --- | --- |
| Data model | Tables with a fixed schema | Documents, key-value, wide-column, graph |
| Relationships | Joins, foreign keys | Usually embedded data or app-level links |
| Consistency | Strong, ACID transactions | Varies (many offer tunable or eventual consistency) |
| Scaling | Vertical first; replicas for reads; sharding is harder | Often designed for horizontal scaling |
| Best for | Most business apps: users, orders, payments, anything relational | Specific needs: caching, huge write volumes, flexible documents, graphs |

Details in lesson 07. **Default advice:** start with PostgreSQL unless you have a specific reason not to.

## 6. How an application talks to the database

> **In short:** App → ORM → driver → pooled connections → database server.

```
FastAPI app → driver (psycopg / asyncpg) → TCP connection (pooled) → PostgreSQL server
             ↑ ORM (SQLAlchemy) builds SQL for you
```

- A **driver** speaks the database's network protocol.
- Opening connections is expensive, so apps keep a **connection pool**.
- An **ORM** (Object-Relational Mapper) maps tables to classes. It saves time, but you still need to understand the SQL it generates.

## 7. Key vocabulary you'll meet later

> **In short:** Transactions, ACID, normalization, query plans, replication and migrations.

- **Transaction**: a group of operations that succeed or fail together (lesson 06).
- **ACID**: Atomicity, Consistency, Isolation, Durability (lesson 06).
- **Normalization**: organising tables to avoid duplicated data (lesson 04).
- **Query plan**: how the DB executes a query (lesson 05).
- **Replication**: copies of the database on other servers (lesson 07).
- **Migration**: a versioned script that changes the schema ([../09-Migrations/](../09-Migrations/)).

---

## 8. Exercises

1. Start PostgreSQL in Docker and connect with `psql -h localhost -U postgres`.
2. On paper, design tables for a library: books, authors, members, loans. Mark the primary and foreign keys.
3. For each of these, say whether you'd choose relational or NoSQL and why: a bank ledger, a product catalogue with very different attributes per category, a session cache, a social graph of friends.
