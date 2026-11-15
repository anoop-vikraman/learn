# 04 · Database design and normalization

Good design makes data correct by construction and queries simple. Bad design causes duplicated, contradictory data that no amount of application code fully fixes.

## 1. The design process

> **In short:** Entities → attributes → relationships → keys and constraints → normalize → plan for queries.

1. **List the entities** (nouns): User, Project, Task, Comment, Tag.
2. **List their attributes**: Task has title, status, due date…
3. **Find the relationships** and their **cardinality**: a project has many tasks; a task has many tags and a tag has many tasks.
4. **Choose keys** and **constraints**.
5. **Normalize**, then denormalize deliberately only where needed for performance.
6. **Think about queries**: what will the app ask most often? Plan indexes.

## 2. Relationships

> **In short:** How tables connect: one-to-many, one-to-one, many-to-many and self-referencing.

### One-to-many (most common)

> **In short:** Put the foreign key on the "many" side.

A user has many tasks; a task belongs to one user. Put the **foreign key on the "many" side**.

```sql
CREATE TABLE tasks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    ...
);
```

### One-to-one

> **In short:** A foreign key with a unique constraint, or simply the same table.

A user has one profile. FK with a UNIQUE constraint (or share the primary key). Often you can just put the columns in the same table; split when the extra data is large, optional or sensitive.

```sql
CREATE TABLE profiles (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    avatar_url TEXT
);
```

### Many-to-many

> **In short:** A junction table holding pairs of foreign keys.

A task has many tags; a tag is on many tasks. Use a **junction (join/association) table**.

```sql
CREATE TABLE tags (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE task_tags (
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id  BIGINT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),     -- junction tables can hold extra data
    PRIMARY KEY (task_id, tag_id)                    -- composite key: no duplicate pairs
);
```

### Self-referencing

> **In short:** A foreign key to the same table, for trees and hierarchies.

Employees and managers; comments with replies; categories with sub-categories:

```sql
CREATE TABLE comments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    parent_id BIGINT REFERENCES comments(id) ON DELETE CASCADE,   -- NULL = top-level comment
    body TEXT NOT NULL
);
```

## 3. ER diagrams

> **In short:** Diagrams that show tables and their relationships at a glance.

An **Entity-Relationship diagram** shows tables and links. Common notation (crow's foot):

```
users ||──o{ tasks        one user, zero or many tasks
tasks }o──o{ tags         many-to-many (via task_tags)
users ||──|| profiles     one-to-one
```

Tools: dbdiagram.io, DrawSQL, Mermaid `erDiagram`, pgAdmin/DBeaver ER views.

## 4. Keys

> **In short:** Primary, natural, surrogate, composite and foreign keys, and integer vs UUID IDs.

| Key | Meaning |
| --- | --- |
| **Primary key** | Uniquely identifies a row; NOT NULL; one per table |
| **Natural key** | A real-world unique value (email, ISBN, tax ID) |
| **Surrogate key** | An artificial ID (`BIGINT` identity or `UUID`) with no business meaning |
| **Composite key** | Several columns together (`(task_id, tag_id)`) |
| **Candidate / alternate key** | Other columns that are unique (enforce with UNIQUE) |
| **Foreign key** | References a key in another table |

**Recommendation:** use a **surrogate primary key** (business values like emails can change) and enforce natural keys with **UNIQUE** constraints.

**Integer vs UUID IDs:**

| | `BIGINT` identity | `UUID` |
| --- | --- | --- |
| Size / index speed | 8 bytes, fastest | 16 bytes |
| Guessable | Yes (`/users/42` → try 43) | No |
| Generate outside the DB / merge data from several DBs | Hard | Easy |
| Ordering | Naturally ordered | Random v4 hurts index locality; **UUIDv7** (time-ordered) fixes that |

Never rely on unguessable IDs for security: always check authorization.

## 5. Constraints: let the database protect your data

> **In short:** NOT NULL, UNIQUE, CHECK and foreign keys enforce correct data at the source.

```sql
CREATE TABLE orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
    total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
    coupon_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, coupon_code)          -- each coupon once per user
);
```

### Foreign key actions

> **In short:** What happens to child rows when a parent is deleted: restrict, cascade or set null.

| `ON DELETE` | When the parent row is deleted |
| --- | --- |
| `NO ACTION` / `RESTRICT` (default) | Refuse if children exist |
| `CASCADE` | Delete the children too (e.g. a task's comments) |
| `SET NULL` | Set the FK to NULL (e.g. a task whose assignee left) |
| `SET DEFAULT` | Set the FK to its default |

Application-level validation is for user-friendly messages; **database constraints are the last line of defence**: they hold even when a bug, a script or another service writes data.

## 6. Normalization

> **In short:** Organize tables so each fact is stored once, avoiding update, insert and delete anomalies.

Normalization organises data to **remove redundancy**, so each fact is stored once. This prevents **anomalies**:

- **Update anomaly**: a customer's address is stored on every order; you update one row and the others are now wrong.
- **Insert anomaly**: you can't add a product until someone orders it.
- **Delete anomaly**: deleting the last order also deletes the only record of the customer.

### Unnormalized → 1NF → 2NF → 3NF

> **In short:** Step by step from one messy table to clean, normalized tables.

**Start (bad):**

| order_id | customer_name | customer_email | products | total |
| --- | --- | --- | --- | --- |
| 1 | Anoop | a@x.com | Pen x2, Book x1 | 270 |

**First Normal Form (1NF):** every column holds **one atomic value**; no repeating groups or lists in a cell.

| order_id | customer_name | customer_email | product | qty | unit_price |
| --- | --- | --- | --- | --- | --- |
| 1 | Anoop | a@x.com | Pen | 2 | 10 |
| 1 | Anoop | a@x.com | Book | 1 | 250 |

**Second Normal Form (2NF):** 1NF + every non-key column depends on the **whole** primary key. With key `(order_id, product)`, `customer_name` depends only on `order_id` → move it out.

- `orders(order_id, customer_name, customer_email)`
- `order_items(order_id, product, qty, unit_price)`

**Third Normal Form (3NF):** 2NF + no non-key column depends on **another non-key column** (no transitive dependencies). `customer_email` depends on the customer, not the order → move customers out. Product details depend on the product → move them out.

- `customers(id, name, email)`
- `products(id, name, price)`
- `orders(id, customer_id → customers, created_at)`
- `order_items(order_id → orders, product_id → products, qty, unit_price_at_purchase)`

> "Every non-key attribute must provide a fact about the key, the whole key, and nothing but the key."

**BCNF** (Boyce-Codd) is a slightly stricter 3NF; 4NF/5NF handle rarer multi-valued cases. **3NF is the practical target** for most apps.

Note `unit_price_at_purchase`: it **looks** duplicated, but it's a different fact (the historical price), not redundancy. Prices change; past orders mustn't.

## 7. Denormalization (on purpose)

> **In short:** Duplicate data deliberately for read speed, accepting the cost of keeping it in sync.

Sometimes you **deliberately** store derived or duplicated data to make reads faster:

- A `task_count` column on `projects` instead of counting every time.
- A copy of the author's name on comments for a feed.
- Reporting tables or **materialized views** for dashboards.

Costs: you must keep the copies in sync (triggers, application code, background jobs) and accept possible staleness. **Normalize first, measure, then denormalize specific hot paths.**

## 8. Common design patterns

> **In short:** Timestamps, soft delete, audit logs, multi-tenancy, money and flexible attributes.

| Pattern | How |
| --- | --- |
| **Timestamps** | `created_at`, `updated_at` (TIMESTAMPTZ, UTC) on every table |
| **Soft delete** | `deleted_at TIMESTAMPTZ NULL` instead of deleting; filter `WHERE deleted_at IS NULL`. ⚠️ Unique constraints need partial indexes; GDPR may require real deletion |
| **Audit log** | An append-only `audit_events(actor_id, action, entity, entity_id, before, after, at)` table |
| **Status fields** | `TEXT` + CHECK constraint, or a PostgreSQL ENUM type, or a lookup table |
| **Lookup tables** | `countries(code, name)` instead of free text |
| **Multi-tenancy** | `tenant_id` on every row (+ row-level security), schema per tenant, or DB per tenant |
| **Money** | `NUMERIC(12,2)` or integer minor units (paise/cents) + a currency column. Never FLOAT |
| **Polymorphic links** | Avoid "commentable_type + commentable_id" (no FK possible); prefer separate FKs or tables |
| **Flexible attributes** | A `JSONB` column for truly variable data, real columns for anything you filter/join on often |
| **Versioning / history** | History tables or temporal tables for "what did it look like on date X" |

## 9. Naming conventions

> **In short:** Consistent snake_case names for tables, columns, foreign keys and booleans.

- Tables: plural `snake_case` (`users`, `task_tags`); be consistent.
- Columns: `snake_case`; FK named `<singular>_id` (`user_id`).
- Booleans: `is_active`, `has_paid`.
- Timestamps: `<verb>_at` (`created_at`, `deleted_at`).
- Avoid reserved words (`user`, `order`, `group`) as table names, or always quote them.

---

## 10. Exercises

1. Design a schema for an online course platform: users, courses, lessons, enrollments, progress, reviews. Draw the ER diagram.
2. Normalize this table to 3NF: `invoice(invoice_no, date, client_name, client_address, item_code, item_desc, qty, price)`.
3. Add soft delete to `users` while keeping emails unique among non-deleted users.
4. Decide where to use CASCADE, SET NULL and RESTRICT in your course schema, and justify each.
5. Identify one place where denormalization would help your design, and how you'd keep it in sync.
