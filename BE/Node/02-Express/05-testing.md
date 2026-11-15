# 05 · Testing Express APIs

## 1. Tools

> **In short:** Vitest runs tests, Supertest sends HTTP requests to your app without opening a port, and a real PostgreSQL database catches real bugs.

```bash
npm install -D vitest supertest @types/supertest @vitest/coverage-v8
```

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

(Jest works the same way; Node's built-in `node:test` is another option.)

## 2. First API test

> **In short:** Import the app (not the server), call routes with Supertest and assert on status and body.

```ts
// tests/health.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('GET /health/live', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

it('rejects invalid task input', async () => {
  const res = await request(app).post('/api/v1/tasks').set('Authorization', `Bearer ${token}`).send({ title: '' });
  expect(res.status).toBe(422);
  expect(res.body.error.fields[0].path).toBe('title');
});
```

## 3. A test database

> **In short:** Run tests against a separate PostgreSQL database, apply migrations once, and clean tables between tests.

```bash
# .env.test
DATABASE_URL=postgresql://app:secret@localhost:5433/tasks_test
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globalSetup: './tests/global-setup.ts',
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,          // tests share one DB: run files one at a time (or use one DB/schema per worker)
    env: { NODE_ENV: 'test' },
  },
});
```

```ts
// tests/global-setup.ts: runs once
import { execSync } from 'node:child_process';
export default function () {
  execSync('npx prisma migrate reset --force --skip-seed', { stdio: 'inherit' });
}

// tests/setup.ts: runs before each test file
import { beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "Task", "Project", "User" RESTART IDENTITY CASCADE');
});
afterAll(async () => { await prisma.$disconnect(); });
```

Alternatives: **Testcontainers** (`@testcontainers/postgresql`) to start a throwaway Postgres automatically; one schema per Vitest worker for parallel runs.

## 4. Factories and auth helpers

> **In short:** Small helper functions create valid users and tasks and sign tokens, keeping tests short and readable.

```ts
// tests/factories.ts
import { faker } from '@faker-js/faker';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/jwt.js';

export async function createUser(overrides: Partial<{ email: string; role: 'admin' | 'member' }> = {}) {
  const user = await prisma.user.create({
    data: { email: overrides.email ?? faker.internet.email().toLowerCase(), passwordHash: 'x', role: overrides.role ?? 'member' },
  });
  return { user, token: signAccessToken({ sub: user.id, role: user.role }) };
}

export function createTask(ownerId: string, overrides: Partial<{ title: string; done: boolean }> = {}) {
  return prisma.task.create({ data: { title: overrides.title ?? faker.lorem.words(3), done: overrides.done ?? false, ownerId } });
}
```

```ts
// tests/tasks.test.ts
describe('tasks API', () => {
  it('creates a task', async () => {
    const { token } = await createUser();
    const res = await request(app).post('/api/v1/tasks').set('Authorization', `Bearer ${token}`).send({ title: 'Write tests' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Write tests', done: false });
  });

  it('lists only my tasks', async () => {
    const me = await createUser();
    const other = await createUser();
    await createTask(me.user.id, { title: 'mine' });
    await createTask(other.user.id, { title: 'theirs' });
    const res = await request(app).get('/api/v1/tasks').set('Authorization', `Bearer ${me.token}`);
    expect(res.body.items.map((t: { title: string }) => t.title)).toEqual(['mine']);
  });

  it("can't read someone else's task", async () => {
    const me = await createUser();
    const other = await createUser();
    const task = await createTask(other.user.id);
    const res = await request(app).get(`/api/v1/tasks/${task.id}`).set('Authorization', `Bearer ${me.token}`);
    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/tasks')).status).toBe(401);
  });
});
```

## 5. Unit-testing services

> **In short:** Test business rules directly by calling services, with fakes for external dependencies.

```ts
import { vi } from 'vitest';

it('enqueues an email when a task is created', async () => {
  const queue = { add: vi.fn() };
  const service = createTasksService({ prisma, queue: queue as never });
  const { user } = await createUser();
  const task = await service.create(user.id, { title: 'x', priority: 3 });
  expect(queue.add).toHaveBeenCalledWith('task-created', { taskId: task.id });
});
```

## 6. Mocking modules and HTTP calls

> **In short:** `vi.mock` replaces modules; MSW or `nock` intercept outgoing HTTP calls to third-party APIs.

```ts
vi.mock('../src/lib/email.js', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
```

For outgoing `fetch` calls, **MSW** (`msw/node`) works in Node just like in the browser.

## 7. What to test

> **In short:** Status codes and bodies for each route, validation, auth and ownership, business rules and edge cases.

- Happy path per endpoint; validation errors (422); 401/403/404 paths; duplicates (409); pagination boundaries.
- Business rules in services (fast unit tests).
- A few end-to-end flows: register → login → create → list.

## 8. Coverage and CI

> **In short:** Measure coverage with V8, set a threshold, and run tests with a PostgreSQL service in CI.

```ts
// vitest.config.ts
test: { coverage: { provider: 'v8', thresholds: { lines: 80, branches: 75 } } }
```

See [../05-Docker-CI-CD/02-ci-cd-node.md](../05-Docker-CI-CD/02-ci-cd-node.md).

---

## 9. Exercises

1. Set up Vitest + Supertest and test the health route.
2. Configure a test database with migrations and table truncation between tests.
3. Write CRUD, validation, auth and ownership tests for tasks.
4. Unit-test a service with a fake queue.
5. Add a coverage threshold and make the test command fail below it.
