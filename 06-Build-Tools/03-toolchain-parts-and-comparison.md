# The frontend toolchain: every part, how they differ, comparison tables

The earlier files explain Babel, Webpack and Vite one by one. This file zooms out: **what are all the pieces of a modern frontend build, what does each one do, and how are they different?** Interviewers often mix up the terms on purpose ("Is Babel a bundler?"), so knowing the categories is what makes your answers clear.

---

## 1. The big picture: from your code to the browser

You write code the browser can't use directly: TypeScript, JSX, SCSS, hundreds of separate files and npm packages. The build toolchain turns it into a few small, optimised files that every target browser understands.

```
 YOUR SOURCE                         TOOLCHAIN                                  OUTPUT (dist/)
 ───────────                         ─────────                                  ──────────────
 package.json ──► Package manager (npm/pnpm) ──► node_modules/
                                                                                  
 App.tsx ─┐                                                                       
 utils.ts ├──► Type checker (tsc --noEmit)  → only reports errors, outputs nothing
          │                                                                       
          ├──► Transpiler (Babel/SWC/esbuild) → strips types, JSX → JS, modern → older syntax
          │                                                                       
 styles.scss ─► CSS tools (Sass → PostCSS/Autoprefixer)                           
 logo.svg ────► Asset handling (copy, inline, hash filenames)                     
          │                                                                       
          └──► BUNDLER (Webpack/Rollup/Rolldown/esbuild)                          
                 follows imports → dependency graph → tree shaking → code splitting
                       │                                                          
                       ▼                                                          
                 Minifier (Terser/esbuild/SWC, cssnano/Lightning CSS) ──►  index.html
                                                                           assets/index-a1b2c3.js
                                                                           assets/Settings-9f8e7d.js
                                                                           assets/index-44aa11.css
                                                                           + source maps

 Alongside: Dev server + HMR (dev only), Linter + Formatter, Test runner, CI scripts
```

**Analogy: a restaurant kitchen.**
- **Package manager** = the supplier who delivers ingredients (libraries).
- **Transpiler** = the prep cook who translates recipes into what this kitchen can cook (TS/JSX → JS).
- **Type checker** = the food inspector who checks for mistakes but doesn't cook anything.
- **Bundler** = the head chef who combines everything into plated dishes (bundles) and leaves out what isn't ordered (tree shaking).
- **Minifier** = vacuum-packs the dish to the smallest size.
- **Dev server** = the tasting counter where you try dishes instantly while still cooking.
- **Linter / formatter** = the kitchen rules and the person who keeps the station tidy.

---

## 2. Master table: every part at a glance

| Part | Job in one line | Input → Output | Popular tools | When it runs |
| --- | --- | --- | --- | --- |
| **Package manager** | Install and lock dependencies | `package.json` → `node_modules` + lockfile | npm, pnpm, Yarn, Bun | Install time, CI |
| **Transpiler / compiler** | Translate syntax (TS, JSX, modern JS) | `.tsx` → `.js` | Babel, SWC, esbuild, tsc | Dev + build |
| **Type checker** | Find type errors | `.ts` → error report (no files) | `tsc --noEmit`, vue-tsc | Editor, CI, pre-commit |
| **Bundler** | Combine modules into optimised files | Many modules → few bundles/chunks | Webpack, Rollup, Rolldown, esbuild, Rspack, Parcel, Turbopack | Build (some also in dev) |
| **Dev server + HMR** | Serve the app locally and hot-reload changes | Source → browser, live | Vite, webpack-dev-server, Next.js dev | Dev only |
| **Minifier** | Shrink code for production | Readable JS/CSS → tiny JS/CSS | Terser, esbuild, SWC, cssnano, Lightning CSS | Production build |
| **CSS preprocessor** | Add variables, nesting, mixins to CSS | `.scss` → `.css` | Sass, Less, Stylus | Dev + build |
| **CSS postprocessor** | Transform finished CSS (prefixes, future syntax) | `.css` → `.css` | PostCSS (+ Autoprefixer, Tailwind), Lightning CSS | Dev + build |
| **Polyfills** | Add missing runtime APIs to old browsers | Code that uses `Promise.any` → works in old browsers | core-js, polyfill services | Build (injected) / runtime |
| **Browserslist** | Single list of target browsers for all tools | `"> 0.5%, not dead"` → config for Babel, Autoprefixer… | browserslist | Read by other tools |
| **Asset handling** | Process images, fonts, SVGs | `logo.png` → `logo-a1b2.png` or inline base64 | Built into Vite/Webpack 5, SVGR, imagemin | Dev + build |
| **Linter** | Catch bugs and bad patterns | Code → warnings/errors | ESLint, Oxlint, Biome | Editor, pre-commit, CI |
| **Formatter** | Make code style consistent | Messy code → formatted code | Prettier, Biome, dprint | On save, pre-commit |
| **Test runner** | Run automated tests | `*.test.ts` → pass/fail report | Vitest, Jest, Playwright (E2E) | Dev (watch), CI |
| **Task runner / monorepo tool** | Run and cache scripts across packages | `npm run build` × N packages → cached builds | npm scripts, Turborepo, Nx | Dev + CI |
| **Git hooks** | Run checks before commit/push | `git commit` → lint-staged runs ESLint/Prettier | Husky, lint-staged, lefthook | On commit |
| **Meta-framework / build tool** | Bundles all of the above with sensible defaults | Project → ready-to-deploy app | Vite, Next.js, Remix/React Router, Astro | Everything |

---

## 3. Each part explained

### 3.1 Package manager

**What it does:** reads `package.json`, downloads each dependency (and their dependencies) from the npm registry into `node_modules`, and writes a **lockfile** recording the exact version of every package installed.

**Why the lockfile matters:** `package.json` says `"react": "^19.0.0"`, meaning "any 19.x". Without a lockfile, two developers (or CI) could get different versions. The lockfile pins exact versions, so `npm ci` installs **the same tree everywhere**.

| | npm | pnpm | Yarn (Berry) | Bun |
| --- | --- | --- | --- | --- |
| Lockfile | `package-lock.json` | `pnpm-lock.yaml` | `yarn.lock` | `bun.lock` |
| `node_modules` layout | Flat (hoisted) | Symlinks to a global content-addressed store | Plug'n'Play (no node_modules) or node_modules | Flat |
| Disk usage | High (copy per project) | **Very low** (shared store) | Low with PnP | Medium |
| Speed | OK | Fast | Fast | **Very fast** |
| Strictness | Allows "phantom" deps | **Strict**: you can only import what you declared | Strict with PnP | Like npm |
| CI install command | `npm ci` | `pnpm install --frozen-lockfile` | `yarn install --immutable` | `bun install --frozen-lockfile` |

**Phantom dependency:** with npm's flat layout, you can `import 'lodash'` even if only a dependency of yours installed it. It works until that dependency drops lodash, and then your app breaks. pnpm prevents this.

**`dependencies` vs `devDependencies` vs `peerDependencies`:**
- `dependencies`: needed at runtime (react, @tanstack/react-query).
- `devDependencies`: needed only to build or test (vite, vitest, typescript, eslint).
- `peerDependencies`: for **libraries**: "the app using me must provide this" (a component library declares `react` as a peer so the app doesn't end up with two copies of React).

### 3.2 Transpiler / compiler

**What it does:** translates code **file by file** from one syntax to another. It doesn't know about other files or bundling.
- Removes TypeScript types: `const x: number = 1` → `const x = 1`
- Turns JSX into function calls: `<h1>Hi</h1>` → `jsx('h1', { children: 'Hi' })`
- Downlevels modern syntax for older targets: `a?.b ?? c` → longer ES2019 code

"Transpiler" (source-to-source at the same level) and "compiler" are used loosely. Everyone understands both.

| | Babel | tsc (TypeScript) | SWC | esbuild |
| --- | --- | --- | --- | --- |
| Written in | JavaScript | TypeScript (a Go port is in progress) | Rust | Go |
| Speed | Slowest | Slow | **~20–70× faster than Babel** | **~10–100× faster than Babel** |
| Type checks? | ❌ No (just strips types) | ✅ **Yes**, the only one that does | ❌ No | ❌ No |
| Plugins | **Huge ecosystem** (custom transforms, React Compiler, macros) | None for transforms | Some (Rust/Wasm plugins) | Limited |
| Also bundles? | ❌ | ❌ | Basic (spack, rarely used) | ✅ Yes |
| Also minifies? | Via babel-minify (rare) | ❌ | ✅ | ✅ |
| Used by | CRA (legacy), many Webpack setups, React Compiler | Type-checking in CI, library `.d.ts` output | Next.js, Rspack, `@vitejs/plugin-react-swc`, Deno | Vite (dev transforms + pre-bundling), tsup |

**Key point to say:** "Babel, SWC and esbuild **only remove** types. They don't check them. That's why fast setups still run `tsc --noEmit` in CI or in the editor. Transpiling and type-checking are two separate jobs."

### 3.3 Type checker

**What it does:** reads your whole project, understands how files relate, and reports type errors. With `--noEmit` it **produces no output files**: it's purely a safety check.

**Why it's separate from transpiling:** type-checking needs the **whole program** (to know what `fetchUser` returns, it has to read another file), so it's slow. Transpiling needs only **one file at a time**, so it's fast and parallel. Modern setups split them: the fast transpiler runs in dev and build, and `tsc` runs in the editor and CI.

`isolatedModules: true` in `tsconfig.json` guarantees every file can be transpiled alone, which esbuild, SWC and Babel require. It flags things like re-exporting a type without `export type`.

### 3.4 Bundler

**What it does:** starts from an **entry file** (`main.tsx`), follows every `import` to build a **dependency graph** of your code + node_modules, and outputs a small number of optimised files.

Core jobs of a bundler:
1. **Resolve modules**: figure out what `import x from 'react'` or `'@/utils'` points to.
2. **Transform** each file (through loaders or plugins that call the transpiler, Sass, etc.).
3. **Tree shaking**: drop exports nobody imports.
4. **Code splitting**: put `import()`-ed code into separate chunks loaded on demand.
5. **Optimise output**: minify, scope-hoist (merge modules into fewer function scopes), add content hashes to filenames.
6. **Generate** HTML/asset references and source maps.

**Why bundle at all if browsers support ES modules?** Without bundling, a big app makes **thousands of requests** (lodash-es alone is about 600 files). You'd also lose tree shaking, minification across modules and long-term caching with hashed filenames. That's why even Vite bundles for production.

| | Webpack | Rollup | Rolldown | esbuild | Rspack | Parcel | Turbopack |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Written in | JS | JS | **Rust** | **Go** | **Rust** | JS + Rust | **Rust** |
| Speed | Slow on big apps | Medium | Very fast | **Fastest** | Very fast | Fast | Very fast |
| Config | Powerful but verbose | Simple, plugin-based | Rollup-compatible | Minimal | **Webpack-compatible** | **Zero-config** | Built into Next.js |
| Tree shaking | Good | **Excellent** (the pioneer) | Excellent | Good | Good | Good | Good |
| Code splitting | Excellent | Good | Good | Basic | Excellent | Good | Excellent |
| HMR | ✅ | ❌ (needs a dev server) | Via Vite | ❌ built in | ✅ | ✅ | ✅ |
| Best for | Legacy/complex enterprise apps, Module Federation | **Libraries** | Vite's future engine | Tools, libraries, fast scripts | Migrating big Webpack apps for speed | Quick projects | Next.js apps |
| Used by | CRA, Angular CLI (older), many enterprises | Vite (prod build), most npm libraries | Vite (default engine from Vite 8) | Vite (dev), tsup, Angular CLI (newer) | ByteDance, Rsbuild | Standalone | Next.js |

### 3.5 Dev server + HMR

**What it does:** serves your app on `localhost`, transforms files **on request**, and pushes changes to the browser over a WebSocket.

**HMR (Hot Module Replacement):** swaps only the changed module in the running page. **React Fast Refresh** builds on it to re-render the edited component **while keeping its state** (the form you half-filled stays filled). A **full reload** loses all state.

| | webpack-dev-server | Vite dev server |
| --- | --- | --- |
| Startup | Bundles the **whole app first** (slow on big apps) | Starts instantly, **no bundling** |
| How files reach the browser | From an in-memory bundle | As **native ES modules**, transformed on request with esbuild |
| HMR speed | Grows with app size | Constant, roughly the size of the changed file |
| Dependencies | Bundled with your code | **Pre-bundled once** with esbuild, cached in `node_modules/.vite` |

Other dev-server features: **proxy** (`/api` → backend, avoids CORS in dev), HTTPS, an error overlay in the browser, and SPA history fallback.

### 3.6 Minifier

**What it does:** makes production code as small as possible **without changing behaviour**.
- Removes whitespace and comments
- Renames local variables (`userProfileData` → `a`)
- Removes dead code (`if (false) {...}`, `if (process.env.NODE_ENV !== 'production')` branches)
- Simplifies expressions (`!0` instead of `true`)

| | Terser | esbuild | SWC | cssnano | Lightning CSS |
| --- | --- | --- | --- | --- | --- |
| Minifies | JS | JS + CSS | JS | CSS | CSS |
| Speed | Slow | Very fast | Very fast | Medium | Very fast |
| Output size | **Smallest** (by a few %) | Slightly larger | Close to Terser | Good | Good |
| Default in | Webpack 5 | Vite (JS) | Next.js | Many PostCSS setups | Vite (option), Parcel |

**Minification ≠ compression.** Minifying rewrites code. **Compression** (gzip/Brotli) is done by the server or CDN at download time. You want both: minify at build time, compress when serving.

**Obfuscation ≠ minification.** Obfuscation deliberately makes code hard to understand. Minification only makes it small. Neither one protects secrets: anything shipped to the browser is public.

### 3.7 CSS tooling

| | Preprocessor (Sass/Less) | Postprocessor (PostCSS) | CSS Modules | Tailwind | Lightning CSS |
| --- | --- | --- | --- | --- | --- |
| Input | `.scss` / `.less` | Plain CSS | `.module.css` | Utility classes in your markup | CSS |
| What it adds | Variables, nesting, mixins, loops, partials | Plugins: Autoprefixer, future CSS, minify | **Scoped** class names (`.btn` → `.btn_x7a2`) | Generates only the CSS for classes you use | Prefixing, nesting, minify, in Rust |
| Runs | Before PostCSS | After the preprocessor | During bundling | As a PostCSS/Vite plugin | Replaces PostCSS + cssnano |
| Solves | Repetition in CSS | Browser compatibility | Global name clashes | Writing CSS by hand at all | Speed |

**Typical order in a pipeline:** `.scss` → **Sass** → CSS → **PostCSS** (Tailwind, Autoprefixer) → **CSS Modules** scoping → **minify** → hashed `.css` file.

### 3.8 Polyfills and browserslist

**Transpiling vs polyfilling (a very common confusion):**

| | Transpiling | Polyfilling |
| --- | --- | --- |
| Fixes | Missing **syntax** | Missing **APIs / built-ins** |
| Example | `a?.b` → `a == null ? void 0 : a.b` | Adds `Array.prototype.at`, `Promise.any`, `structuredClone` |
| How | Rewrites your code at build time | Adds extra code that runs at runtime |
| Tool | Babel, SWC, esbuild | core-js (via Babel `useBuiltIns`), or manual imports |
| Can't do | Add new functions | Change syntax (`?.` would still be a syntax error) |

**Browserslist** is the single source of truth for "which browsers do we support?". Babel, SWC, Autoprefixer, Lightning CSS and esbuild targets all read it:

```json
// package.json
"browserslist": ["> 0.5%", "last 2 versions", "not dead"]
```

Run `npx browserslist` to see the exact list. Vite sets its own modern default build target and uses `@vitejs/plugin-legacy` when you need old browsers.

### 3.9 Asset handling

What bundlers do with non-JS files:
- **Small files** (under ~4 KB): inlined as base64 data URLs, so there's no extra request.
- **Larger files**: copied to `dist/assets` with a **content hash** in the name (`logo-a1b2c3.png`) so they can be cached forever.
- **SVG**: as a URL, inline, or as a **React component** (SVGR: `import Logo from './logo.svg?react'`).
- **`public/` folder**: copied as-is, without hashing. Use it for `favicon.ico`, `robots.txt` and files that need a fixed URL.

### 3.10 Linter vs formatter vs type checker

People often mix these three up. They're different jobs:

| | Linter | Formatter | Type checker |
| --- | --- | --- | --- |
| Question it answers | "Is this code **likely buggy** or bad practice?" | "Does this code **look** consistent?" | "Do the **types** line up?" |
| Example catch | Missing `useEffect` dependency, unused variable, `==` instead of `===`, hooks called conditionally | Quotes, semicolons, indentation, line length | Passing `string` where `number` is expected, possibly-undefined access |
| Changes code? | Some rules auto-fix | **Always** rewrites formatting | Never |
| Tools | ESLint (+ react-hooks, jsx-a11y, testing-library plugins), Oxlint, Biome | Prettier, Biome, dprint | tsc |
| Configured by | `eslint.config.js` (flat config) | `.prettierrc` | `tsconfig.json` |

Rule of thumb: let **Prettier handle formatting** and turn off ESLint's style rules (`eslint-config-prettier`), so the two tools never fight. **Biome** and **Oxlint** are Rust-based, much faster alternatives: Biome covers both linting and formatting.

### 3.11 Test runner

Runs your `*.test.ts` files and reports results (see the `05-Testing/` folder). It's part of the toolchain because it **reuses the build config**: Vitest uses your `vite.config.ts`, while Jest needs its own Babel or ts-jest transform.

### 3.12 Task runners and monorepo tools

- **npm scripts** (`"build": "tsc --noEmit && vite build"`) are the simplest task runner, and the one every project has.
- **Turborepo / Nx**: in a monorepo with many packages, they run tasks in the right order (build the `ui` package before the `web` app), **cache results** (skip rebuilding unchanged packages, locally and in CI) and run only **affected** packages.
- **Changesets**: versioning and changelogs for published packages.

---

## 4. Commonly confused pairs (quick table)

| These two… | Difference |
| --- | --- |
| **Transpiler vs bundler** | A transpiler translates **one file's syntax**. A bundler **combines many files** into bundles (and calls the transpiler on each). Babel is not a bundler; Webpack is not a transpiler. |
| **Bundler vs build tool** | A bundler is one component. A build tool (Vite, Next.js) **packages a bundler + dev server + transpiler + CSS + config** into one experience. |
| **Transpiling vs polyfilling** | Syntax rewrite at build time vs adding missing APIs at runtime. |
| **Type-checking vs transpiling** | tsc checks the whole program for errors. Babel, SWC and esbuild just strip types, file by file. |
| **Minifying vs compressing** | Rewriting code smaller (build time) vs gzip/Brotli on the wire (server/CDN). |
| **Loader vs plugin (Webpack)** | A loader transforms **individual files** (`.scss` → CSS). A plugin hooks into the **whole build** (generate HTML, extract CSS, define env vars). |
| **Dev build vs production build** | Dev: fast, unminified, source maps, HMR, warnings. Prod: minified, tree-shaken, split, hashed, no dev-only checks. |
| **Linter vs formatter** | Bugs and patterns vs appearance. |
| **`dependencies` vs `devDependencies`** | Needed at runtime vs only for building and testing. |
| **Code splitting vs tree shaking** | Splitting **moves** code into chunks loaded later. Tree shaking **deletes** code that's never used. |
| **Source map vs minified file** | The minified file runs in production. The source map maps it back to your original code for debugging. |
| **ESM vs CommonJS** | `import`/`export` (static, tree-shakable) vs `require`/`module.exports` (dynamic, harder to tree-shake). |

---

## 5. Build tools compared (Vite vs Webpack vs others as complete setups)

| | **Vite** | **Webpack** (+ dev server) | **Rspack / Rsbuild** | **Parcel** | **Next.js** (Turbopack/Webpack) | **CRA** |
| --- | --- | --- | --- | --- | --- | --- |
| Type | Build tool | Bundler (you assemble the rest) | Bundler / build tool | Build tool | Full React framework | Build tool |
| Dev approach | Native ESM, no bundling | Bundles everything first | Bundles, but in Rust | Bundles, cached | Bundles (Turbopack) | Webpack |
| Prod bundler | Rollup → Rolldown | Webpack | Rspack | Parcel | Turbopack / Webpack | Webpack |
| Transpiler | esbuild (or SWC plugin) | Babel / SWC / ts-loader | SWC (built in) | SWC | SWC | Babel |
| Config | Small `vite.config.ts` | Large `webpack.config.js` | Webpack-like / small | **None needed** | `next.config.js` | Hidden (eject) |
| Cold start (big app) | ⚡ ~instant | 🐢 tens of seconds | ⚡ fast | Fast | Fast | 🐢 slow |
| SSR / routing built in | No (use a framework on top) | No | No | No | **Yes** | No |
| Status in 2026 | **Default for new SPAs** | Mature, huge legacy footprint | Growing (Webpack migration path) | Niche | Default for React full-stack | **Deprecated** (Feb 2025) |

**What to say:** "For a new React SPA I'd use Vite. If we need SSR, routing and server components, Next.js or React Router's framework mode. For a large existing Webpack app that's slow, Rspack is a mostly drop-in speed-up without rewriting the config."

---

## 6. Webpack concepts vs Vite equivalents

| Concept | Webpack | Vite |
| --- | --- | --- |
| Entry point | `entry: './src/index.tsx'` | `index.html` (`<script type="module" src="/src/main.tsx">`) |
| Output | `output: { path, filename: '[name].[contenthash].js' }` | `build.outDir`, hashing by default |
| Transform files | **Loaders** (`babel-loader`, `sass-loader`, `css-loader`) | Built in (TS, JSX, CSS, Sass after `npm i sass`) or plugins |
| Extend the build | **Plugins** (`HtmlWebpackPlugin`, `MiniCssExtractPlugin`, `DefinePlugin`) | Plugins (Rollup-compatible API) |
| Path aliases | `resolve.alias` | `resolve.alias` |
| Env variables | `DefinePlugin` / `process.env.X` | `import.meta.env.VITE_X` |
| Dev server | `devServer: { hot, historyApiFallback, proxy }` | `server: { port, proxy }`; SPA fallback is automatic |
| Code splitting | `optimization.splitChunks` + `import()` | Automatic on `import()`, plus `manualChunks` |
| Mode | `mode: 'development' \| 'production'` | `vite` (dev) / `vite build` (prod) |
| Source maps | `devtool: 'source-map'` | `build.sourcemap: true` |
| Micro-frontends | **Module Federation** (built in) | Community plugin |

---

## 7. Dev vs production build: what changes

| | Development (`vite` / `webpack serve`) | Production (`vite build` / `webpack --mode production`) |
| --- | --- | --- |
| Goal | **Fast feedback** | **Fast for users** |
| Bundling | None (Vite) or quick incremental (Webpack) | Full bundle + optimisation |
| Minified | ❌ | ✅ |
| Tree shaking | ❌ (mostly) | ✅ |
| Filenames | Plain | Content-hashed for caching |
| Source maps | Full and fast (inline/eval) | Separate files, or hidden and uploaded to Sentry |
| React | Dev build with warnings, Strict Mode double-invokes | Production build, much smaller and faster |
| `process.env.NODE_ENV` / `import.meta.env.MODE` | `development` | `production` |
| HMR | ✅ | ❌ |

**Gotcha:** Vite dev (esbuild + native ESM) and Vite build (Rollup) are **different pipelines**. Something can work in dev and break in build (CommonJS interop, dynamic imports with variables, case-sensitive paths on Linux CI). Always run `vite build && vite preview` before shipping.

---

## 8. Walkthrough: what happens to `App.tsx` during `npm run build`

Assume `"build": "tsc --noEmit && vite build"`.

1. **`tsc --noEmit`** type-checks the whole project. Any type error stops the build here, before anything is produced.
2. **Vite reads `index.html`** and finds `<script type="module" src="/src/main.tsx">`, the entry point.
3. **The bundler (Rollup/Rolldown) resolves imports**: `main.tsx` → `App.tsx` → `react`, `./App.module.scss`, `./logo.svg`, `lazy(() => import('./Settings'))`… building the dependency graph.
4. **Each file is transformed**:
   - `App.tsx` → **esbuild** strips types and compiles JSX → plain JS.
   - `App.module.scss` → **Sass** → CSS → **PostCSS** (Autoprefixer) → **CSS Modules** gives scoped class names → JS object `{ title: 'title_x7a2' }`.
   - `logo.svg` → copied as `logo-a1b2.svg`, and the import becomes its URL.
5. **Tree shaking** removes exports nobody imports (e.g. unused functions from `utils.ts` and `lodash-es`).
6. **Code splitting**: `import('./Settings')` becomes its own chunk `Settings-9f8e.js`, loaded only when the route is visited. Shared vendor code may go into its own chunk.
7. **`import.meta.env.VITE_API_URL`** is **replaced with the literal string** at build time (which is why these values are public).
8. **Minification**: esbuild minifies JS, and CSS is minified too.
9. **Hashing + HTML**: files get content hashes, and `index.html` is rewritten to reference them (`<script src="/assets/index-a1b2c3.js">`, plus preload links for chunks).
10. **Output** lands in `dist/`, ready to be served by Nginx or a CDN (see `11-Docker/`).

---

## 9. Interview questions on the toolchain

**Q: Name the parts of a modern frontend build pipeline.**
Package manager, transpiler, type checker, bundler, dev server with HMR, CSS processing, asset handling, minifier, plus linting, formatting and testing around it. Build tools like Vite combine most of these with good defaults.

**Q: Is Babel a bundler? Is Webpack a compiler?**
No and no. Babel transpiles single files' syntax. Webpack bundles modules and delegates transpiling to loaders like `babel-loader` or `swc-loader`.

**Q: Why do we still need `tsc` if Vite/esbuild handles TypeScript?**
esbuild only **strips** types for speed. It never reports type errors. `tsc --noEmit` (in the editor and CI) is what actually checks types.

**Q: Why are new tools written in Rust or Go?**
JS tooling is single-threaded and interpreted. Rust and Go are compiled to native code and use all CPU cores in parallel, so esbuild, SWC, Rspack, Rolldown, Turbopack, Biome and Oxlint are 10–100× faster. This matters hugely on large codebases and in CI.

**Q: What does Vite use under the hood?**
esbuild for dev transforms and dependency pre-bundling, Rollup for production builds (moving to Rolldown, a Rust Rollup-compatible bundler), and native ES modules in the browser during development.

**Q: When would you choose Rollup over Webpack?**
For **libraries**: Rollup produces clean, flat ESM output with excellent tree shaking and multiple formats (ESM + CJS). Webpack shines for **apps** with complex needs (Module Federation, unusual loaders).

**Q: What's the role of browserslist?**
One shared definition of supported browsers that Babel/SWC (syntax targets), core-js (polyfills) and Autoprefixer (CSS prefixes) all read, so every tool targets the same browsers.

**Q: What is Module Federation and which tools support it?**
A way for separately built and deployed apps to share code at runtime (micro-frontends). It's built into Webpack 5 and Rspack, and available for Vite via plugins.

**Q: CRA is deprecated. What would you migrate to and how?**
Vite for a plain SPA: install Vite + `@vitejs/plugin-react`, move `index.html` to the root with a module script tag, rename `REACT_APP_*` to `VITE_*` and switch `process.env` to `import.meta.env`, then replace Jest with Vitest (or keep Jest with a Babel config). Use Next.js or React Router's framework mode if you also want SSR or routing conventions.

**Q: How would you speed up a slow build?**
Measure first (`--profile`, Rsdoctor, or timing each step). Swap Babel for SWC/esbuild, move from Webpack to Rspack or Vite, enable caching (Webpack's `cache: { type: 'filesystem' }`, Turborepo remote cache), run type-checking in parallel instead of inside the bundler (`fork-ts-checker-webpack-plugin`), and cut unnecessary dependencies and huge barrel files.
