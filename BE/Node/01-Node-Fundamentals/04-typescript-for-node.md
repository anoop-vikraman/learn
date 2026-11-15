# 04 · TypeScript for Node

TypeScript basics are in [../../../FE/03-TypeScript/basics/](../../../FE/03-TypeScript/basics/). This lesson covers setting it up for a backend.

## 1. Why TypeScript on the server

> **In short:** Types catch mistakes in request handling, database calls and config before they reach production, and make large codebases easier to change.

Remember: types are erased at runtime. Data from requests, env vars and APIs must still be **validated** (section 6).

## 2. Setup

> **In short:** Install TypeScript, Node's type definitions and a fast runner like `tsx`.

```bash
npm install -D typescript @types/node tsx
npx tsc --init
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",              // match Node's module rules (ESM + CJS)
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true,                 // stack traces point at .ts lines
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
```

With `"module": "NodeNext"` and `"type": "module"`, relative imports need the **`.js` extension even in `.ts` files** (`import { app } from './app.js'`), because that's the file that exists at runtime.

## 3. Running and building

> **In short:** Use `tsx` in development, and compile to JavaScript with `tsc` for production.

```json
"scripts": {
  "dev": "tsx watch --env-file=.env src/server.ts",
  "build": "tsc",
  "start": "node dist/server.js",
  "typecheck": "tsc --noEmit"
}
```

- `tsx` strips types on the fly (very fast), but **doesn't type-check**: run `npm run typecheck` in CI.
- Newer Node versions can run `.ts` files directly by stripping types (`node src/server.ts`) if you only use erasable syntax (no enums, no parameter properties). Compiling with `tsc` remains the most common production setup.
- Bundlers like `tsup`/`esbuild` can produce a single output file if you prefer.

## 4. Typing common Node and Express code

> **In short:** `@types/node` and library types give you autocomplete for built-ins; add your own types for domain data.

```ts
import type { Request, Response, NextFunction } from 'express';

interface Task {
  id: string;
  title: string;
  done: boolean;
  ownerId: string;
  createdAt: Date;
}

type CreateTaskInput = Pick<Task, 'title'>;

export async function createTask(req: Request<{}, Task, CreateTaskInput>, res: Response<Task>) {
  const task = await taskService.create(req.body.title, req.user!.id);
  res.status(201).json(task);
}
```

### Extending Express's `Request`

> **In short:** Declaration merging adds typed fields like `req.user` to Express's request.

```ts
// src/types/express.d.ts
import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; role: 'admin' | 'member' };
    requestId?: string;
  }
}
```

## 5. Errors in TypeScript

> **In short:** Caught errors are `unknown`; narrow them with `instanceof` and model domain errors as classes.

```ts
export class AppError extends Error {
  constructor(public readonly statusCode: number, message: string, public readonly code = 'app_error') {
    super(message);
    this.name = new.target.name;
  }
}
export class NotFoundError extends AppError {
  constructor(resource: string) { super(404, `${resource} not found`, 'not_found'); }
}

try {
  await doThing();
} catch (err) {
  if (err instanceof AppError) { /* known */ }
  else throw err;
}
```

(Parameter properties like `public readonly statusCode` aren't erasable syntax; write normal fields if you run TS with type stripping.)

## 6. Runtime validation with Zod

> **In short:** Zod validates unknown data at runtime and gives you the matching TypeScript type from the same schema.

```bash
npm install zod
```

```ts
import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  priority: z.number().int().min(1).max(5).default(3),
  dueDate: z.coerce.date().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

const result = createTaskSchema.safeParse(req.body);
if (!result.success) return res.status(422).json({ errors: result.error.issues });
const input = result.data;      // fully typed and validated
```

### Validating environment variables at startup

> **In short:** Parse `process.env` with Zod once, so missing config fails fast with a clear error.

```ts
// src/config.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().default('http://localhost:5173').transform((s) => s.split(',')),
});

export const config = envSchema.parse(process.env);   // throws at startup if anything is wrong
```

The app fails immediately with a clear message instead of crashing later on the first request that needs a missing value.

## 7. Path aliases (optional)

> **In short:** Aliases like `@/services/x` avoid long relative paths, but need runtime support too.

Node's built-in way is **subpath imports** in package.json, which works at runtime without extra tools:

```json
"imports": { "#src/*": "./dist/*" }
```

```ts
import { config } from '#src/config.js';
```

---

## 8. Exercises

1. Convert the raw `http` task server from lesson 03 to TypeScript with `tsx`.
2. Add `build`, `start` and `typecheck` scripts and run the compiled output.
3. Create `config.ts` that validates env vars with Zod and fails at startup when `DATABASE_URL` is missing.
4. Define `AppError` and `NotFoundError` and narrow a caught `unknown` error.
5. Extend Express's `Request` type with a `user` property.
