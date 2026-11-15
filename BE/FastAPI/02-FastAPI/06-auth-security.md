# 06 · Authentication and security

- **Authentication**: who are you? (login)
- **Authorization**: what are you allowed to do? (roles, ownership)

## 1. Password hashing

> **In short:** Store slow, salted hashes (argon2/bcrypt) of passwords, never the passwords themselves.

**Never store plain passwords.** Store a slow, salted **hash**: argon2 (recommended) or bcrypt.

```bash
uv add "pwdlib[argon2]"          # the library FastAPI's docs currently use (passlib is unmaintained)
```

```python
# app/security.py
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()     # argon2

def hash_password(password: str) -> str:
    return password_hash.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return password_hash.verify(plain, hashed)
```

## 2. JWT access tokens

> **In short:** Signed tokens carrying the user ID and expiry; signed, not encrypted.

A **JWT** (JSON Web Token) is a signed string `header.payload.signature`. The server signs it with a secret; later it verifies the signature to trust the payload (e.g. the user ID). It's **signed, not encrypted**: anyone can read the payload, so never put secrets in it.

```bash
uv add pyjwt
```

```python
# app/security.py (continued)
from datetime import datetime, timedelta, timezone
import jwt

SECRET_KEY = settings.jwt_secret          # long random string from env: `openssl rand -hex 32`
ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 30

def create_access_token(subject: str, extra: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": subject, "iat": now, "exp": now + timedelta(minutes=ACCESS_TOKEN_MINUTES), **(extra or {})}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])   # verifies signature and exp
```

## 3. Login endpoint (OAuth2 password flow)

> **In short:** Check credentials and return an access token from `/auth/token`.

```python
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")   # enables the "Authorize" button in /docs

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

@router.post("/token", response_model=Token)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DbSession):
    user = db.scalars(select(User).where(User.email == form.username)).first()
    # same error for "no such user" and "wrong password": don't reveal which emails exist
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password",
                            headers={"WWW-Authenticate": "Bearer"})
    return Token(access_token=create_access_token(str(user.id), {"role": user.role}))

@router.post("/register", status_code=201, response_model=UserOut)
def register(data: UserCreate, db: DbSession):
    if db.scalars(select(User).where(User.email == data.email)).first():
        raise HTTPException(409, "Email already registered")
    user = User(email=data.email, hashed_password=hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
```

`OAuth2PasswordRequestForm` expects **form fields** `username` and `password` (OAuth2 spec), so the frontend sends `application/x-www-form-urlencoded` to `/auth/token`.

## 4. Getting the current user

> **In short:** A dependency that decodes the bearer token and loads the user, or returns 401.

```python
from jwt import InvalidTokenError

def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: DbSession) -> User:
    credentials_error = HTTPException(status.HTTP_401_UNAUTHORIZED, "Could not validate credentials",
                                      headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except (InvalidTokenError, KeyError, ValueError):
        raise credentials_error
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise credentials_error
    return user

CurrentUser = Annotated[User, Depends(get_current_user)]

@app.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user
```

The client sends `Authorization: Bearer <token>` on every request.

## 5. Authorization: roles and ownership

> **In short:** Check roles and make sure users can only access their own data (prevents BOLA/IDOR).

```python
def require_role(*roles: str):
    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(403, "Not enough permissions")
        return user
    return checker

@app.delete("/users/{user_id}", dependencies=[Depends(require_role("admin"))])
def delete_user(user_id: int, db: DbSession): ...

# Ownership: users may only touch their own tasks
@app.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: DbSession, user: CurrentUser):
    task = db.get(Task, task_id)
    if task is None or task.owner_id != user.id:
        raise HTTPException(404, "Task not found")    # 404 (not 403) avoids revealing that the ID exists
    return task
```

⚠️ The most common API vulnerability is **broken object-level authorization (BOLA/IDOR)**: forgetting the ownership check, so changing an ID in the URL shows someone else's data. Always filter by the current user (`where(Task.owner_id == user.id)`).

## 6. Token strategy: access + refresh tokens

> **In short:** Short-lived access tokens, revocable refresh tokens in httpOnly cookies, or server sessions.

| Token | Lifetime | Stored in | Purpose |
| --- | --- | --- | --- |
| Access token | Short (5–30 min) | Memory in the SPA | Sent with each API request |
| Refresh token | Long (days) | **httpOnly, Secure, SameSite cookie** | Get a new access token at `/auth/refresh` |

- JWTs can't be revoked before they expire, which is why access tokens are short-lived. Store refresh tokens (or their hashes/IDs) in the DB so you can revoke them on logout or password change, and **rotate** them on each use.
- Alternative: **server-side sessions** (a random session ID in an httpOnly cookie, data in Redis/DB). Simple and revocable; good for first-party web apps.
- For enterprise SSO (Keycloak, Auth0, Cognito, Azure AD), FastAPI **validates tokens issued by the identity provider** (verify the signature with its public JWKS keys, check `iss`, `aud`, `exp`) instead of issuing its own.

Where to keep tokens in the browser: avoid `localStorage` for long-lived tokens (any XSS can steal them). Cookies need **CSRF protection** (SameSite=Lax/Strict plus a CSRF token for state-changing requests if cross-site).

## 7. CORS

> **In short:** Allow your frontend's exact origins to call the API from the browser.

Browsers block a frontend on one origin (`http://localhost:5173`) from calling an API on another (`http://localhost:8000`) unless the API allows it.

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://app.example.com"],   # exact origins
    allow_credentials=True,           # needed for cookies / Authorization with credentials
    allow_methods=["*"],
    allow_headers=["*"],
)
```

⚠️ Don't use `allow_origins=["*"]` with credentials (browsers reject it, and it's unsafe). CORS is a **browser** protection, not authentication: tools like curl ignore it.

## 8. Other security essentials

> **In short:** Validation, rate limits, HTTPS, headers, secrets handling and safe error messages.

| Topic | What to do |
| --- | --- |
| Input validation | Pydantic models with limits (`max_length`, `ge/le`, `max_length` on lists) |
| SQL injection | ORM/parameterized queries only |
| Rate limiting | Limit login and expensive endpoints (e.g. `slowapi`, Redis-based limits, or at the gateway/proxy) |
| Brute force | Lock out or slow down after repeated failed logins |
| HTTPS | Always in production (TLS at the load balancer/proxy) |
| Security headers | `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, etc. (at the proxy or via middleware) |
| Secrets | From env/secret manager; long random JWT secret; rotate when leaked |
| Errors | Generic messages; no stack traces to clients |
| Docs | Consider disabling or protecting `/docs` in production (`FastAPI(docs_url=None)`) for internal APIs |
| Sensitive data | Never return password hashes; use separate response models |
| Logging | Log auth failures; never log passwords/tokens |

Reference: **OWASP API Security Top 10**.

---

## 9. Exercises

1. Implement register, login (`/auth/token`) and `/me` with argon2 + JWT; use "Authorize" in `/docs`.
2. Add an `is_active` flag and reject inactive users.
3. Add a `role` column and an admin-only endpoint.
4. Make sure users can only list, read, update and delete their own tasks; write a test proving user B can't read user A's task.
5. Add a refresh token in an httpOnly cookie and a `/auth/refresh` endpoint.
