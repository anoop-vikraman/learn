# PostgreSQL: from basics to advanced

PostgreSQL ("Postgres") is a powerful open-source relational database. Learn the general concepts first in [../03-Database-Concepts/](../03-Database-Concepts/); these lessons focus on what's specific to PostgreSQL.

| # | Lesson | Level | You will learn |
| --- | --- | --- | --- |
| 01 | [Setup and psql](01-setup-psql.md) | Beginner | Installing (Docker), connecting, psql commands, databases, schemas, roles basics |
| 02 | [Data types and constraints](02-data-types-constraints.md) | Beginner → Intermediate | Numeric, text, dates/times, UUID, boolean, arrays, JSONB, enums, ranges, identity columns, constraints |
| 03 | [Advanced SQL](03-advanced-sql.md) | Intermediate → Advanced | CTEs, recursive queries, window functions, JSONB queries, full-text search, upserts, LATERAL, views, materialized views |
| 04 | [Indexes and performance](04-indexes-performance.md) | Advanced | Index types (B-tree, GIN, GiST, BRIN), EXPLAIN, pg_stat_statements, VACUUM, configuration basics |
| 05 | [Security, functions and extensions](05-security-functions-extensions.md) | Advanced | Roles and privileges, row-level security, functions, triggers, extensions (pg_trgm, pgvector, PostGIS…) |
| — | [**Production**](production.md) | — | Managed vs self-hosted, configuration, connection pooling, backups/PITR, replication/HA, monitoring, vacuum, upgrades |
