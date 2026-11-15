# 03 · Joins, aggregation and subqueries

Sample data used below:

**users**: (1, Anoop), (2, Bina), (3, Chen: has no tasks)
**tasks**: (10, 'Write docs', user 1), (11, 'Review PR', user 1), (12, 'Plan sprint', user 2), (13, 'Orphan', user NULL)

## 1. Joins: combining tables

> **In short:** INNER, LEFT, FULL, CROSS and self joins combine rows from related tables.

```sql
-- INNER JOIN: only rows that match in both tables
SELECT u.full_name, t.title
FROM users u
JOIN tasks t ON t.user_id = u.id;
-- Anoop/Write docs, Anoop/Review PR, Bina/Plan sprint

-- LEFT JOIN: all rows from the left table, matching right rows or NULLs
SELECT u.full_name, t.title
FROM users u
LEFT JOIN tasks t ON t.user_id = u.id;
-- ... plus Chen/NULL

-- Find rows with NO match (anti-join)
SELECT u.full_name
FROM users u
LEFT JOIN tasks t ON t.user_id = u.id
WHERE t.id IS NULL;                       -- Chen

-- RIGHT JOIN: all rows from the right table (rarely used; swap the tables and use LEFT)
-- FULL OUTER JOIN: all rows from both sides, NULLs where there's no match
SELECT u.full_name, t.title
FROM users u
FULL JOIN tasks t ON t.user_id = u.id;    -- includes Chen/NULL and NULL/Orphan

-- CROSS JOIN: every combination (cartesian product)
SELECT s.size, c.color FROM sizes s CROSS JOIN colors c;

-- SELF JOIN: a table joined to itself (e.g. employees and their managers)
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id;
```

```
INNER:  A ∩ B        LEFT: all A (+ B where matching)
FULL:   A ∪ B        Anti-join: A without B  (LEFT JOIN … WHERE b.id IS NULL, or NOT EXISTS)
```

### Joining several tables

> **In short:** Chain joins across tables, watching out for row multiplication and conditions placed in WHERE vs ON.

```sql
SELECT p.name AS project, t.title, u.email
FROM tasks t
JOIN projects p ON p.id = t.project_id
JOIN users u    ON u.id = t.user_id
LEFT JOIN task_tags tt ON tt.task_id = t.id
WHERE p.archived = false;
```

⚠️ Joining one-to-many relationships **multiplies rows**: a user with 3 tasks appears 3 times. Keep this in mind when you `count` or `sum` after a join (double counting).

⚠️ A condition on the right table placed in `WHERE` turns a LEFT JOIN into an INNER JOIN. Put it in `ON` to keep unmatched left rows:

```sql
SELECT u.full_name, t.title
FROM users u
LEFT JOIN tasks t ON t.user_id = u.id AND t.done = false;   -- users with no open tasks still appear
```

## 2. Aggregate functions

> **In short:** `count`, `sum`, `avg`, `min` and `max` summarize many rows into one value.

```sql
SELECT count(*)            AS total_tasks,
       count(due_date)     AS with_due_date,     -- non-NULL values only
       count(DISTINCT user_id) AS users_with_tasks,
       sum(priority), avg(priority), min(created_at), max(created_at)
FROM tasks;
```

## 3. GROUP BY and HAVING

> **In short:** Group rows to aggregate per group; `HAVING` filters groups after aggregation.

```sql
-- Tasks per user
SELECT user_id, count(*) AS task_count
FROM tasks
GROUP BY user_id;

-- With names, including users with zero tasks
SELECT u.id, u.full_name, count(t.id) AS task_count        -- count(t.id) gives 0 for no tasks; count(*) would give 1
FROM users u
LEFT JOIN tasks t ON t.user_id = u.id
GROUP BY u.id, u.full_name
ORDER BY task_count DESC;

-- HAVING filters groups (WHERE filters rows before grouping)
SELECT user_id, count(*) AS open_tasks
FROM tasks
WHERE done = false                -- row filter
GROUP BY user_id
HAVING count(*) > 5;              -- group filter

-- Group by a computed value
SELECT date_trunc('month', created_at) AS month, count(*)
FROM tasks
GROUP BY 1                        -- 1 = first SELECT column
ORDER BY 1;
```

**Rule:** every column in `SELECT` must either be in `GROUP BY` or inside an aggregate function. (PostgreSQL allows other columns of a table if you group by its primary key.)

### Conditional aggregation

> **In short:** Count or sum only some rows per group with `FILTER` or `CASE`.

```sql
SELECT user_id,
       count(*) FILTER (WHERE done)       AS done_count,      -- PostgreSQL
       count(*) FILTER (WHERE NOT done)   AS open_count,
       sum(CASE WHEN priority = 1 THEN 1 ELSE 0 END) AS urgent  -- portable version
FROM tasks
GROUP BY user_id;

SELECT user_id, string_agg(title, ', ' ORDER BY title) AS titles, array_agg(id)
FROM tasks GROUP BY user_id;
```

## 4. CASE expressions

> **In short:** If/else logic inside SQL expressions.

```sql
SELECT title,
       CASE
           WHEN priority <= 2 THEN 'high'
           WHEN priority = 3 THEN 'medium'
           ELSE 'low'
       END AS priority_label
FROM tasks;
```

## 5. Subqueries

> **In short:** Queries inside queries: in WHERE, FROM or SELECT, with `IN` and `EXISTS`.

A query inside another query.

```sql
-- In WHERE (scalar subquery: returns one value)
SELECT * FROM tasks WHERE priority < (SELECT avg(priority) FROM tasks);

-- IN with a subquery
SELECT * FROM users WHERE id IN (SELECT user_id FROM tasks WHERE done = false);

-- EXISTS: true if the subquery returns any row (often fastest, NULL-safe)
SELECT * FROM users u
WHERE EXISTS (SELECT 1 FROM tasks t WHERE t.user_id = u.id AND t.priority = 1);

SELECT * FROM users u
WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.user_id = u.id);   -- users with no tasks

-- In FROM (derived table)
SELECT avg(task_count)
FROM (SELECT user_id, count(*) AS task_count FROM tasks GROUP BY user_id) AS per_user;

-- Correlated subquery in SELECT (runs per row: fine for small results)
SELECT u.full_name,
       (SELECT count(*) FROM tasks t WHERE t.user_id = u.id) AS task_count
FROM users u;
```

## 6. Common table expressions (WITH)

> **In short:** Name subqueries to make complex queries readable.

A CTE names a subquery, making complex queries readable.

```sql
WITH open_tasks AS (
    SELECT user_id, count(*) AS n
    FROM tasks
    WHERE done = false
    GROUP BY user_id
)
SELECT u.full_name, COALESCE(o.n, 0) AS open_tasks
FROM users u
LEFT JOIN open_tasks o ON o.user_id = u.id
ORDER BY open_tasks DESC;
```

Recursive CTEs and window functions are covered in [../04-PostgreSQL/03-advanced-sql.md](../04-PostgreSQL/03-advanced-sql.md).

## 7. Set operations

> **In short:** `UNION`, `INTERSECT` and `EXCEPT` combine the results of several queries.

```sql
SELECT email FROM customers
UNION                      -- combine and remove duplicates
SELECT email FROM newsletter_subscribers;

UNION ALL                  -- combine and keep duplicates (faster)
INTERSECT                  -- rows in both
EXCEPT                     -- rows in the first but not the second
```

The queries must return the same number of columns with compatible types.

## 8. Putting it together

> **In short:** A realistic report combining CTEs, joins, aggregates and window functions.

"For each project, show the number of open tasks, the number of overdue tasks, and the assignee with the most open tasks."

```sql
WITH open AS (
    SELECT t.project_id, t.user_id, t.due_date
    FROM tasks t
    WHERE t.done = false
),
per_user AS (
    SELECT project_id, user_id, count(*) AS n,
           row_number() OVER (PARTITION BY project_id ORDER BY count(*) DESC) AS rn
    FROM open
    GROUP BY project_id, user_id
)
SELECT p.name,
       count(o.project_id)                               AS open_tasks,   -- counts matched rows only (0 if none)
       count(*) FILTER (WHERE o.due_date < CURRENT_DATE) AS overdue,
       (SELECT u.full_name FROM per_user pu JOIN users u ON u.id = pu.user_id
        WHERE pu.project_id = p.id AND pu.rn = 1)        AS busiest
FROM projects p
LEFT JOIN open o ON o.project_id = p.id
GROUP BY p.id, p.name
ORDER BY open_tasks DESC;
```

---

## 9. Exercises

1. List every user with their number of done and open tasks (including users with none).
2. Find users who have no tasks, three ways: LEFT JOIN, NOT EXISTS, NOT IN (and explain the NULL risk of NOT IN).
3. Show the number of tasks created per month for the last 12 months.
4. Find users whose average task priority is below the overall average.
5. Show each user's tasks as a single comma-separated string.
6. Find duplicate emails (case-insensitive) in `users`.
