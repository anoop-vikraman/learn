# 03 · Responses, status codes and errors

## 1. Response models: control what you send back

> **In short:** The return type or `response_model` validates and filters output, so secrets aren't leaked.

Declare the response shape with a **return type annotation** or `response_model=`. FastAPI then **validates and filters** the output: fields not in the model are removed, which prevents leaking data like password hashes.

```python
from pydantic import BaseModel, EmailStr

class UserIn(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: int
    email: EmailStr

class UserInDB(UserOut):
    hashed_password: str

@app.post("/users", status_code=201)
def create_user(user: UserIn) -> UserOut:
    db_user = UserInDB(id=1, email=user.email, hashed_password=hash_pw(user.password))
    return db_user               # ✅ hashed_password is filtered out because the return type is UserOut
```

Return annotation vs `response_model`:

```python
@app.get("/users/{id}", response_model=UserOut)   # use when you return a different type (e.g. ORM object, dict)
def get_user(id: int):
    return db.get(User, id)
```

If both are present, `response_model` wins. Other options:

```python
@app.get("/tasks", response_model=list[TaskOut])
@app.get("/tasks/{id}", response_model=TaskOut, response_model_exclude_none=True)
@app.get("/raw", response_model=None)             # disable response validation (e.g. returning a Response)
```

## 2. Status codes

> **In short:** Set the right HTTP status per endpoint (201, 204…), or change it at runtime.

```python
from fastapi import status

@app.post("/tasks", status_code=status.HTTP_201_CREATED)
def create(...): ...

@app.delete("/tasks/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(id: int) -> None: ...          # 204 must have no body

# Change it dynamically
from fastapi import Response

@app.put("/tasks/{id}")
def upsert(id: int, task: TaskCreate, response: Response):
    if id not in tasks:
        response.status_code = status.HTTP_201_CREATED
    ...
```

## 3. Errors with `HTTPException`

> **In short:** Raise `HTTPException` to stop and return an error status with details.

```python
from fastapi import HTTPException

@app.get("/tasks/{task_id}")
def get_task(task_id: int):
    task = tasks.get(task_id)
    if task is None:
        raise HTTPException(
            status_code=404,
            detail="Task not found",                # string, dict or list: becomes {"detail": ...}
            headers={"X-Error": "task-missing"},    # optional
        )
    return task
```

`raise` (not `return`) the exception: it stops the function immediately, even from inside helper functions and dependencies.

## 4. Custom exceptions and handlers

> **In short:** Raise domain exceptions in services and map them to HTTP responses in one place.

Keep business logic free of HTTP details: raise your own exceptions in services, and map them to responses in one place.

```python
# app/errors.py
class AppError(Exception):
    status_code = 400
    code = "app_error"
    def __init__(self, message: str):
        self.message = message

class NotFoundError(AppError):
    status_code = 404
    code = "not_found"

class ConflictError(AppError):
    status_code = 409
    code = "conflict"
```

```python
# main.py
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )

# services/tasks.py
def get_task(db, task_id: int):
    task = db.get(Task, task_id)
    if not task:
        raise NotFoundError(f"Task {task_id} not found")
    return task
```

### Customizing validation errors

> **In short:** Reshape the default 422 error into your API's own error format.

```python
from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "validation_error", "fields": [
            {"field": ".".join(map(str, e["loc"][1:])), "message": e["msg"]} for e in exc.errors()
        ]}},
    )
```

### Catch-all for unexpected errors

> **In short:** Log unknown errors and return a generic 500 without internal details.

```python
import logging
logger = logging.getLogger(__name__)

@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"error": {"code": "internal_error", "message": "Something went wrong"}})
```

⚠️ Never return stack traces or internal messages to clients in production.

**Pick one error format for the whole API** and document it, so the frontend can handle errors in one place. A standard option is **RFC 9457 "Problem Details"** (`type`, `title`, `status`, `detail`).

---

## 5. Response types

> **In short:** Return JSON, HTML, files, redirects or streams with the matching `Response` classes.

```python
from fastapi.responses import (
    JSONResponse, HTMLResponse, PlainTextResponse, RedirectResponse,
    FileResponse, StreamingResponse, ORJSONResponse,
)

@app.get("/legacy")
def legacy():
    return RedirectResponse("/new", status_code=308)

@app.get("/report.pdf")
def report():
    return FileResponse("reports/latest.pdf", media_type="application/pdf", filename="report.pdf")

@app.get("/export.csv")
def export():
    def rows():
        yield "id,title\n"
        for t in tasks.values():
            yield f"{t.id},{t.title}\n"
    return StreamingResponse(rows(), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=tasks.csv"})

@app.get("/custom")
def custom():
    return JSONResponse(content={"ok": True}, status_code=202, headers={"Cache-Control": "no-store"})
```

⚠️ When you return a `Response` object directly, FastAPI **skips** response-model validation and serialization; you're responsible for the content.

### Setting headers and cookies

> **In short:** Add response headers and secure cookies through the `Response` parameter.

```python
@app.post("/login")
def login(response: Response):
    response.set_cookie(
        "session", "token-value",
        httponly=True, secure=True, samesite="lax", max_age=3600,
    )
    response.headers["X-Login"] = "ok"
    return {"ok": True}
```

---

## 6. Documenting endpoints

> **In short:** Tags, summaries, descriptions and documented error responses for clearer `/docs`.

```python
@app.get(
    "/tasks/{task_id}",
    summary="Get a task",
    description="Returns a single task by ID.",
    tags=["tasks"],                      # groups endpoints in /docs
    responses={404: {"description": "Task not found"}},
    deprecated=False,
)
def get_task(task_id: int) -> TaskOut:
    """The docstring is also used as the description (Markdown supported)."""
```

---

## 7. Exercises

1. Add `UserIn`, `UserOut` and `UserInDB` models; confirm the hash never appears in responses.
2. Create `NotFoundError`/`ConflictError` with one handler; use them in a service function.
3. Make validation errors return `{"error": {"code": "validation_error", "fields": [...]}}`.
4. Add a CSV export endpoint with `StreamingResponse`.
5. Add tags, summaries and error responses so `/docs` is fully documented.
