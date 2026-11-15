# 05 · Databases with SQLAlchemy

**SQLAlchemy** is the most widely used Python database toolkit. It has two layers:
- **Core**: build SQL in Python (`select(...)`, `insert(...)`).
- **ORM**: map Python classes to tables, and rows to objects.

This lesson uses **SQLAlchemy 2.0** style with PostgreSQL. (Alternatives: **SQLModel**, which combines SQLAlchemy and Pydantic models, by FastAPI's author; or raw SQL with `asyncpg`/`psycopg`.) Database concepts are in [../03-Database-Concepts/](../03-Database-Concepts/).

```bash
uv add sqlalchemy "psycopg[binary]"         # sync driver (psycopg 3)
uv add asyncpg                              # async driver (optional, section 8)
```

## 1. Engine and session

> **In short:** The engine holds the connection pool (one per app); a session is a unit of work (one per request).

```python
# app/db.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = "postgresql+psycopg://app:secret@localhost:5432/tasks"

engine = create_engine(
    DATABASE_URL,
    pool_size=10,            # connections kept open
    max_overflow=20,         # extra connections under load
    pool_pre_ping=True,      # check connections before use (handles DB restarts)
    echo=False,              # True = log every SQL statement (useful while learning)
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

class Base(DeclarativeBase):
    pass
```

- The **engine** manages a **connection pool**; create **one per app**.
- A **session** is a unit of work: it tracks objects you load/add and sends changes in a transaction. Create **one per request** and close it.
- `expire_on_commit=False` keeps loaded attributes usable after commit (handy when returning objects from endpoints).

## 2. Models

> **In short:** SQLAlchemy 2.0 classes using `Mapped`/`mapped_column` describe tables, columns and relationships.

```python
# app/models.py
from datetime import datetime
from sqlalchemy import String, ForeignKey, func, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str]
    full_name: Mapped[str | None] = mapped_column(String(100))   # `| None` → nullable column
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    tasks: Mapped[list["Task"]] = relationship(back_populates="owner", cascade="all, delete-orphan")

class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    done: Mapped[bool] = mapped_column(default=False, server_default="false")
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    owner: Mapped["User"] = relationship(back_populates="tasks")
```

- `Mapped[int]` gives the Python type; `mapped_column(...)` gives column options.
- `default=` is set by Python; `server_default=` is set by the database (also applies to inserts from other tools).
- Create tables with **migrations (Alembic)**, not `Base.metadata.create_all()` in production (see [../09-Migrations/](../09-Migrations/)). `create_all` is fine for quick experiments and tests.

## 3. The session dependency

> **In short:** A yield dependency that opens a session per request and closes it afterwards.

```python
# app/deps.py
from typing import Annotated
from fastapi import Depends
from sqlalchemy.orm import Session
from app.db import SessionLocal

def get_db():
    with SessionLocal() as session:
        yield session

DbSession = Annotated[Session, Depends(get_db)]
```

## 4. CRUD

> **In short:** Create, read (filter, sort, paginate), update and delete with the 2.0 query style.

```python
from sqlalchemy import select, func, update, delete
from fastapi import HTTPException

# CREATE
@app.post("/tasks", status_code=201, response_model=TaskOut)
def create_task(data: TaskCreate, db: DbSession, user: CurrentUser):
    task = Task(**data.model_dump(), owner_id=user.id)
    db.add(task)
    db.commit()           # write to the DB (INSERT) and end the transaction
    db.refresh(task)      # reload DB-generated values (id, created_at)
    return task           # TaskOut has from_attributes=True, so it reads the ORM object

# READ one
@app.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: DbSession):
    task = db.get(Task, task_id)              # by primary key
    if task is None:
        raise HTTPException(404, "Task not found")
    return task

# READ many: filter, sort, paginate
@app.get("/tasks", response_model=list[TaskOut])
def list_tasks(db: DbSession, user: CurrentUser, done: bool | None = None, limit: int = 20, offset: int = 0):
    stmt = select(Task).where(Task.owner_id == user.id)
    if done is not None:
        stmt = stmt.where(Task.done == done)
    stmt = stmt.order_by(Task.created_at.desc()).limit(limit).offset(offset)
    return db.scalars(stmt).all()             # scalars() → model objects instead of rows

# UPDATE
@app.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, changes: TaskUpdate, db: DbSession):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    for field, value in changes.model_dump(exclude_unset=True).items():
        setattr(task, field, value)           # session tracks the change
    db.commit()                               # UPDATE ... SET only changed columns
    return task

# DELETE
@app.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, db: DbSession):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    db.delete(task)
    db.commit()
```

### Query cheat sheet (2.0 style)

> **In short:** The most common `select`, filter, join, aggregate, bulk and raw SQL patterns.

```python
db.scalars(select(User).where(User.email == email)).first()       # first or None
db.scalars(select(User).where(User.email == email)).one_or_none() # error if more than one
db.scalar(select(func.count()).select_from(Task).where(Task.done)) # a single value
db.execute(select(Task.id, Task.title)).all()                      # rows (tuples) of columns

select(Task).where(Task.title.ilike(f"%{q}%"))        # case-insensitive LIKE (parameterized: safe)
select(Task).where(Task.id.in_([1, 2, 3]))
select(Task).where(and_(Task.done, Task.owner_id == 1)) / or_(...)
select(Task).where(Task.due_date.is_(None))
select(User).join(User.tasks).where(Task.done).distinct()
select(Task.owner_id, func.count()).group_by(Task.owner_id)

db.execute(update(Task).where(Task.owner_id == uid).values(done=True))  # bulk update
db.execute(delete(Task).where(Task.done))                               # bulk delete
db.execute(text("SELECT now()")).scalar()                               # raw SQL (use :params, never f-strings)
```

⚠️ Never build SQL with f-strings from user input (SQL injection). Use the ORM/Core expressions or `text("... WHERE id = :id")` with `{"id": value}`.

## 5. Transactions

> **In short:** Commit groups of changes together, lock rows when needed, and handle constraint errors.

- A session starts a transaction automatically on first use; `commit()` saves, `rollback()` undoes.
- If an exception happens before `commit()`, nothing is saved (closing the session rolls back).
- Group operations that must succeed or fail together in **one commit**:

```python
def transfer(db: Session, from_id: int, to_id: int, amount: int):
    with db.begin():                        # commits at the end, rolls back on exception
        src = db.get(Account, from_id, with_for_update=True)   # row lock: SELECT ... FOR UPDATE
        dst = db.get(Account, to_id, with_for_update=True)
        if src.balance < amount:
            raise ValueError("Insufficient funds")
        src.balance -= amount
        dst.balance += amount
```

Handle constraint violations:

```python
from sqlalchemy.exc import IntegrityError

try:
    db.add(User(email=email, hashed_password=h))
    db.commit()
except IntegrityError:
    db.rollback()
    raise HTTPException(409, "Email already registered")
```

## 6. Relationships and the N+1 problem

> **In short:** Lazy loading related objects in loops causes many queries; eager-load with `selectinload`/`joinedload`.

```python
tasks = db.scalars(select(Task)).all()
for t in tasks:
    print(t.owner.email)      # ⚠️ each access runs another SELECT → 1 + N queries
```

This **N+1 problem** is one of the most common causes of slow APIs. Load related data up front:

```python
from sqlalchemy.orm import selectinload, joinedload

select(Task).options(joinedload(Task.owner))          # JOIN in the same query (good for many-to-one)
select(User).options(selectinload(User.tasks))        # second query with WHERE id IN (...) (good for one-to-many)
```

Set `lazy="raise"` on relationships to make accidental lazy loads fail loudly in development.

### Many-to-many

> **In short:** Use an association table with `secondary=` for links like tasks ↔ tags.

```python
from sqlalchemy import Table, Column

task_tags = Table(
    "task_tags", Base.metadata,
    Column("task_id", ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

class Tag(Base):
    __tablename__ = "tags"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    tasks: Mapped[list["Task"]] = relationship(secondary=task_tags, back_populates="tags")

# in Task: tags: Mapped[list["Tag"]] = relationship(secondary=task_tags, back_populates="tasks")
```

## 7. Response models with relationships

> **In short:** Pydantic models with `from_attributes` can serialize ORM objects, including nested relations.

```python
class OwnerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str

class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    done: bool
    owner: OwnerOut          # loaded relationship → nested object (eager-load it!)
```

## 8. Async SQLAlchemy

> **In short:** Async engine and session for `async def` endpoints; always eager-load relationships.

Use it with `async def` endpoints so database waits don't block the event loop.

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

engine = create_async_engine("postgresql+asyncpg://app:secret@localhost/tasks", pool_size=10, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

AsyncDb = Annotated[AsyncSession, Depends(get_db)]

@app.get("/tasks", response_model=list[TaskOut])
async def list_tasks(db: AsyncDb):
    result = await db.scalars(select(Task).options(selectinload(Task.owner)).limit(20))
    return result.all()

@app.post("/tasks", status_code=201, response_model=TaskOut)
async def create_task(data: TaskCreate, db: AsyncDb):
    task = Task(**data.model_dump(), owner_id=1)
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task
```

⚠️ In async mode, **lazy loading raises errors** (`MissingGreenlet`): always eager-load relationships you'll access.

**Sync or async?** Both are fine. Sync SQLAlchemy in `def` endpoints (thread pool) is simpler and fast enough for most apps. Async helps with very high concurrency. Don't mix a sync session into `async def` endpoints.

## 9. Repository pattern (optional structure)

> **In short:** Keep queries in repository classes, separate from business logic and endpoints.

```python
class TaskRepository:
    def __init__(self, db: Session):
        self.db = db
    def get(self, task_id: int) -> Task | None:
        return self.db.get(Task, task_id)
    def list_for_owner(self, owner_id: int, *, limit: int, offset: int) -> list[Task]:
        stmt = select(Task).where(Task.owner_id == owner_id).limit(limit).offset(offset)
        return list(self.db.scalars(stmt))
    def add(self, task: Task) -> Task:
        self.db.add(task)
        self.db.flush()          # get the id without committing
        return task
```

Endpoints → services (business rules) → repositories (queries). Keep it simple: add layers when the app grows.

---

## 10. Exercises

1. Create `User` and `Task` models, a session dependency and full CRUD for tasks.
2. Return each task with its owner's email; log SQL (`echo=True`) and fix the N+1 with `joinedload`.
3. Return `409` when registering an existing email (catch `IntegrityError`).
4. Add `Tag` with a many-to-many relationship and an endpoint that filters tasks by tag.
5. Convert the CRUD to async SQLAlchemy.
