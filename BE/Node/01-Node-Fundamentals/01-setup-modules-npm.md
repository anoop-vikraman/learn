# 01 · Setup, modules and npm

## 1. Installing Node.js

> **In short:** Install an LTS version with a version manager (nvm, fnm or Volta) so you can switch versions per project.

```bash
# nvm (macOS/Linux). Windows: nvm-windows or fnm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install --lts
nvm use --lts
node --version     # v24.x
npm --version
```

- **LTS** (Long-Term Support, even-numbered releases) is what you use for servers. Odd versions are short-lived "current" releases.
- Pin the version per project in `.nvmrc` (`24`) and in `package.json` `"engines"`.

## 2. Running code

> **In short:** Run files with `node file.js`, experiment in the REPL, and use `--watch` to restart on changes.

```bash
node                      # REPL: try JavaScript interactively (.exit to quit)
node app.js               # run a file
node --watch app.js       # restart automatically when files change (built in)
node --env-file=.env app.js   # load environment variables from a file (built in)
```

```js
// app.js
console.log('Hello from Node', process.version);
```

Global objects in Node: `process`, `console`, `globalThis`, `setTimeout`/`setInterval`/`setImmediate`, `fetch`, `URL`, `structuredClone`, `Buffer`. There's no `window` or `document`.

## 3. Modules: CommonJS vs ES modules

> **In short:** Node supports two module systems; prefer ES modules (`import`/`export`) for new code by setting `"type": "module"` in package.json.

### ES modules (ESM): modern standard

> **In short:** `import`/`export` syntax, file extensions required, `node:` prefix for built-ins.

```js
// math.js
export const add = (a, b) => a + b;
export default function multiply(a, b) { return a * b; }

// app.js
import multiply, { add } from './math.js';     // ⚠️ file extension required in ESM
import { readFile } from 'node:fs/promises';    // built-in modules use the node: prefix
import express from 'express';                  // packages by name
```

### CommonJS (CJS): older, still everywhere

> **In short:** `require`/`module.exports`, loaded synchronously; common in older packages.

```js
// math.cjs
const add = (a, b) => a + b;
module.exports = { add };

// app.cjs
const { add } = require('./math.cjs');
const fs = require('node:fs');
```

| | ES modules | CommonJS |
| --- | --- | --- |
| Syntax | `import` / `export` | `require` / `module.exports` |
| Enabled by | `"type": "module"` in package.json, or `.mjs` files | Default, or `.cjs` files |
| Loading | Async, statically analysed (tree-shakable) | Synchronous, at runtime |
| Top-level `await` | ✅ | ❌ |
| `__dirname`, `__filename` | Use `import.meta.dirname` / `import.meta.filename` | ✅ |

Recent Node versions can `require()` ES modules synchronously in most cases, and ESM can import CJS packages, so mixing mostly works.

## 4. npm and package.json

> **In short:** npm installs packages from the npm registry; package.json lists your project's metadata, dependencies and scripts.

```bash
npm init -y                       # create package.json
npm install express               # add a dependency (saved to "dependencies")
npm install -D typescript vitest  # dev dependency ("devDependencies")
npm uninstall express
npm install                       # install everything listed (uses package-lock.json)
npm ci                            # clean, exact install from the lock file (use in CI/Docker)
npm outdated                      # see newer versions
npm update                        # update within allowed ranges
npm audit                         # known vulnerabilities
npx tsc --init                    # run a package's binary without installing it globally
```

```json
{
  "name": "task-api",
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "node --watch --env-file=.env src/server.js",
    "start": "node src/server.js",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "express": "^5.1.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

Run scripts with `npm run dev`, `npm test`, `npm start`.

### Semantic versioning and ranges

> **In short:** Versions are MAJOR.MINOR.PATCH; `^` allows minor and patch updates, `~` allows patches only.

| Range | Allows |
| --- | --- |
| `5.1.0` | Exactly 5.1.0 |
| `^5.1.0` | ≥5.1.0 <6.0.0 (default when you `npm install`) |
| `~5.1.0` | ≥5.1.0 <5.2.0 |

MAJOR = breaking changes, MINOR = new features, PATCH = bug fixes.

### Lock files

> **In short:** `package-lock.json` records the exact version of every installed package; commit it so every machine installs the same tree.

Use `npm ci` in CI and Docker builds: it installs exactly what's locked and fails if the lock and package.json disagree.

### Other package managers

> **In short:** pnpm, Yarn and Bun as npm alternatives; use one per project.

**pnpm** (fast, disk-efficient, strict), **Yarn**, **Bun** (also a runtime). Pick one per project; don't mix lock files. `corepack` can pin the package manager version.

## 5. Environment variables

> **In short:** Configuration and secrets come from environment variables, read via `process.env` (always strings).

```js
const port = Number(process.env.PORT ?? 3000);
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL is required');
```

```bash
PORT=4000 node app.js
node --env-file=.env app.js        # built-in .env loading (no dotenv package needed)
```

- Never commit `.env`; commit `.env.example`.
- Validate env vars at startup (with Zod, see lesson 04).
- `NODE_ENV=production` is a convention many libraries (Express included) use to enable production optimizations.

## 6. Project setup essentials

> **In short:** A typical backend project has `src/`, a `.gitignore`, a formatter/linter, and scripts for dev, test and build.

```
task-api/
  src/
    server.js
    app.js
  tests/
  .env.example
  .gitignore          # node_modules, .env, dist, coverage
  .nvmrc
  package.json
  package-lock.json
  eslint.config.js
```

Tools: **ESLint** (lint), **Prettier** or **Biome** (format), **Vitest**/**Jest** (tests), **tsx** (run TypeScript, lesson 04).

---

## 7. Exercises

1. Install Node with nvm, pin it with `.nvmrc`, and print `process.version`.
2. Create a project with `"type": "module"`, a `math.js` module and an `app.js` that imports it.
3. Add `dev` and `start` scripts using `--watch` and `--env-file`.
4. Install a package, inspect `package-lock.json`, delete `node_modules`, and reinstall with `npm ci`.
5. Read `PORT` from the environment with a default, and fail clearly if `DATABASE_URL` is missing.
