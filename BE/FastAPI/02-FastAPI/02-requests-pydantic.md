# 02 · Path, query, body and Pydantic models

FastAPI decides where each parameter comes from by looking at your function signature:

| Declared as | Comes from |
| --- | --- |
| Name appears in the path (`/tasks/{task_id}`) | **Path** |
| Simple type (`int`, `str`, `bool`, `list[str]` with `Query`) not in the path | **Query string** |
| Pydantic model | **JSON body** |
| `Header()`, `Cookie()`, `Form()`, `File()` | Header, cookie, form field, uploaded file |

## 1. Path parameters

> **In short:** Values taken from the URL path, converted and validated by their type (`Path()` adds rules).

```python
from typing import Annotated
from enum import StrEnum
from fastapi import FastAPI, Path

app = FastAPI()

@app.get("/users/{user_id}")
def get_user(user_id: Annotated[int, Path(gt=0, description="The user's ID")]):
    return {"user_id": user_id}             # "/users/abc" → 422, "/users/0" → 422

class Status(StrEnum):
    todo = "todo"
    done = "done"

@app.get("/tasks/status/{status}")
def by_status(status: Status):              # only "todo" or "done" allowed; shown as a dropdown in docs
    return {"status": status}

@app.get("/files/{file_path:path}")         # capture slashes: /files/a/b/c.txt
def read_file(file_path: str): ...
```

⚠️ **Route order matters**: `/users/me` must be declared **before** `/users/{user_id}`, or "me" is treated as an ID (and fails int validation).

## 2. Query parameters

> **In short:** Optional or required `?key=value` options such as filters and pagination, validated with `Query()`.

```python
from fastapi import Query

@app.get("/tasks")
def list_tasks(
    q: Annotated[str | None, Query(min_length=2, max_length=50)] = None,  # optional
    done: bool | None = None,                    # ?done=true / false / 1 / 0 / yes / no
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
    tags: Annotated[list[str], Query()] = [],    # ?tags=a&tags=b → ['a', 'b']
    sort: Annotated[str, Query(pattern="^(created_at|title)$")] = "created_at",
):
    return {"q": q, "done": done, "page": page, "size": size, "tags": tags}
```

- With a default → optional; without a default → **required** (`422` if missing).
- `Annotated[type, Query(...)]` adds validation and docs. (Older style `q: str = Query(None)` still works, but `Annotated` is recommended.)

### Group query parameters in a model

> **In short:** Put related query parameters in one Pydantic model to reuse and validate them together.

```python
from pydantic import BaseModel, Field

class TaskFilters(BaseModel):
    model_config = {"extra": "forbid"}          # reject unknown query params
    q: str | None = None
    done: bool | None = None
    page: int = Field(1, ge=1)
    size: int = Field(20, ge=1, le=100)

@app.get("/tasks")
def list_tasks(filters: Annotated[TaskFilters, Query()]):
    ...
```

---

## 3. Request body with Pydantic

> **In short:** A Pydantic model parameter is read from the JSON body, validated, and returns a 422 error if invalid.

```python
from datetime import date
from pydantic import BaseModel, Field, EmailStr, field_validator, model_validator

class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200, examples=["Write docs"])
    description: str | None = None
    priority: int = Field(3, ge=1, le=5)
    due_date: date | None = None
    tags: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("title")
    @classmethod
    def clean_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("title must not be blank")
        return v

    @model_validator(mode="after")
    def check_dates(self):
        if self.due_date and self.due_date < date.today():
            raise ValueError("due_date cannot be in the past")
        return self

@app.post("/tasks", status_code=201)
def create_task(task: TaskCreate):
    return task
```

FastAPI reads the JSON body, validates it against the model, and gives you a `TaskCreate` instance. Invalid data → **422** with details:

```json
{
  "detail": [
    { "type": "string_too_short", "loc": ["body", "title"], "msg": "String should have at least 1 character", "input": "" }
  ]
}
```

`loc` tells the frontend exactly which field failed, which is handy for showing errors next to form fields.

### Body + path + query together

> **In short:** FastAPI works out where each parameter comes from by its type and name.

```python
@app.put("/projects/{project_id}/tasks/{task_id}")
def update_task(project_id: int, task_id: int, task: TaskCreate, notify: bool = False):
    ...
```

### Nested models

> **In short:** Models can contain other models and lists, matching nested JSON.

```python
class Address(BaseModel):
    city: str
    pincode: str = Field(pattern=r"^\d{6}$")

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    address: Address                     # nested object
    phones: list[str] = []

# Several bodies: FastAPI expects {"user": {...}, "address": {...}}
@app.post("/register")
def register(user: UserCreate, invite_code: Annotated[str, Body()]): ...
```

Use `Body(embed=True)` to expect `{"task": {...}}` instead of the bare object.

---

## 4. Pydantic v2 essentials

> **In short:** Model config, aliases, computed fields and the `model_validate`/`model_dump` methods.

```python
from pydantic import BaseModel, ConfigDict, Field, computed_field

class TaskOut(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,        # build from ORM objects (SQLAlchemy): TaskOut.model_validate(db_task)
        str_strip_whitespace=True,   # strip all strings
        extra="ignore",              # "forbid" to reject unknown fields
        populate_by_name=True,
    )

    id: int
    title: str
    done: bool
    owner_name: str = Field(alias="ownerName")   # accept/emit camelCase

    @computed_field
    @property
    def label(self) -> str:
        return f"#{self.id} {self.title}"
```

| Method | Does |
| --- | --- |
| `Model(**data)` / `Model.model_validate(data)` | Validate a dict (or object with `from_attributes`) |
| `Model.model_validate_json(text)` | Validate a JSON string |
| `obj.model_dump()` | → dict. Options: `exclude_unset=True` (only fields sent), `exclude_none=True`, `by_alias=True`, `mode="json"` |
| `obj.model_dump_json()` | → JSON string |
| `obj.model_copy(update={...})` | Copy with changes |
| `Model.model_json_schema()` | JSON Schema |

Handy types: `EmailStr`, `HttpUrl`, `SecretStr` (hidden in repr/logs), `UUID`, `datetime`, `Decimal`, `conint`/`constr` (older; prefer `Field`), `Literal["a", "b"]`.

### Partial updates (PATCH) with `exclude_unset`

> **In short:** Apply only the fields the client actually sent, so others aren't overwritten with None.

```python
class TaskUpdate(BaseModel):
    title: str | None = None
    done: bool | None = None
    priority: int | None = Field(None, ge=1, le=5)

@app.patch("/tasks/{task_id}")
def patch_task(task_id: int, changes: TaskUpdate):
    task = get_or_404(task_id)
    data = changes.model_dump(exclude_unset=True)    # only fields the client actually sent
    for field, value in data.items():
        setattr(task, field, value)
    return task
```

Without `exclude_unset`, fields the client didn't send would overwrite existing values with `None`.

### Separate models per use

> **In short:** Use different models for create, update and response, so inputs and outputs stay correct and safe.

A common pattern: `TaskBase` (shared fields) → `TaskCreate` (input), `TaskUpdate` (all optional), `TaskOut` (response, with `id`, timestamps; never secrets).

---

## 5. Headers and cookies

> **In short:** Read request headers and cookies with `Header()` and `Cookie()`.

```python
from fastapi import Header, Cookie

@app.get("/whoami")
def whoami(
    user_agent: Annotated[str | None, Header()] = None,     # reads "User-Agent" (underscores → hyphens)
    x_request_id: Annotated[str | None, Header()] = None,   # "X-Request-Id"
    session_id: Annotated[str | None, Cookie()] = None,
):
    return {"ua": user_agent, "request_id": x_request_id, "session": session_id}
```

## 6. Forms and file uploads

> **In short:** `Form()` for form fields and `UploadFile` for files, with size/type checks.

Forms and files need `python-multipart` (included in `fastapi[standard]`).

```python
from fastapi import Form, File, UploadFile

@app.post("/login-form")
def login(username: Annotated[str, Form()], password: Annotated[str, Form()]):
    ...

@app.post("/upload")
async def upload(file: UploadFile, description: Annotated[str, Form()] = ""):
    if file.content_type not in {"image/png", "image/jpeg"}:
        raise HTTPException(400, "Only PNG/JPEG allowed")
    contents = await file.read()            # ⚠️ reads all into memory: stream big files in chunks
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(413, "File too large")
    return {"filename": file.filename, "size": len(contents)}

@app.post("/upload-many")
async def upload_many(files: list[UploadFile]): ...
```

⚠️ You can't mix a JSON body model with `Form`/`File` in the same request (it's multipart, not JSON). Don't trust `file.filename` or `content_type`: they come from the client. In production, upload large files directly to object storage (S3 presigned URLs).

## 7. The raw `Request`

> **In short:** Access the full request object when the typed parameters aren't enough.

```python
from fastapi import Request

@app.get("/debug")
async def debug(request: Request):
    return {"client": request.client.host, "url": str(request.url), "headers": dict(request.headers)}
```

Use it only when you need something not covered by the parameter types.

---

## 8. Exercises

1. Build `GET /tasks` with query filters (`q`, `done`, `priority` 1–5, pagination) using a filter model.
2. Create `TaskCreate`, `TaskUpdate` and `TaskOut` models; implement PATCH with `exclude_unset`.
3. Add a validator that rejects titles containing only digits, and see the 422 response.
4. Add an avatar upload endpoint that accepts only images under 2 MB.
5. Read a custom `X-Client-Version` header and reject requests below version 2 with 426.
