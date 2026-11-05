## 5. Build tools: Webpack, Babel, Vite

The one-line distinction: **Babel transforms code** (syntax), a **bundler** (Webpack, or Rollup/Rolldown inside Vite) combines modules into optimized files, and **Vite is a dev server + build tool** that skips bundling during development.

### Explained simply (read this first)

**Why do we need build tools at all?** Browsers don't understand JSX or TypeScript, older browsers don't understand the newest JS, and loading 2,000 small files is slow. Build tools fix all three:

1. **Translate** JSX/TS/new JS into plain JS browsers understand (Babel, SWC, esbuild).
2. **Bundle** many files into a few optimized ones (Webpack, Rollup).
3. **Optimize:** minify, remove unused code, split into chunks, add hashes for caching.

**Babel in one example: it translates syntax.**

```js
// You write:
const greet = (name) => <h1>Hi {name}</h1>;
const city = user?.address?.city ?? 'Unknown';

// Babel outputs (roughly):
var greet = function (name) { return _jsx('h1', { children: ['Hi ', name] }); };
var city = (_user$address = user == null ? void 0 : user.address) == null ? void 0 : ... ;
```

```json
// babel.config.json
{
  "presets": [
    ["@babel/preset-env", { "useBuiltIns": "usage", "corejs": 3 }],
    ["@babel/preset-react", { "runtime": "automatic" }],
    "@babel/preset-typescript"
  ]
}
```

Think of a **preset** as a playlist of plugins. `browserslist` (in package.json, for example `"> 0.5%, not dead"`) tells Babel which browsers to support, so it only translates what's needed.

**Webpack in one picture:** start at the entry file, follow every `import` to build a dependency graph, run each file through the right loader, then output bundles.

```js
// webpack.config.js
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  mode: 'production',                         // minify + tree shake
  entry: './src/index.tsx',                   // where to start
  output: {
    path: __dirname + '/dist',
    filename: '[name].[contenthash].js',      // hash changes only when content changes -> cache busting
    clean: true,
  },
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: {
    rules: [                                  // LOADERS: transform one file type each
      { test: /\.tsx?$/, use: 'babel-loader', exclude: /node_modules/ },
      { test: /\.s[ac]ss$/, use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'] }, // runs right-to-left
      { test: /\.(png|svg)$/, type: 'asset' },
    ],
  },
  plugins: [                                  // PLUGINS: act on the whole build
    new HtmlWebpackPlugin({ template: './public/index.html' }),
    new MiniCssExtractPlugin(),
  ],
  optimization: { splitChunks: { chunks: 'all' } }, // separate vendor code into its own chunk
  devServer: { hot: true, historyApiFallback: true },
};
```

**Loader vs plugin, the easy way to remember:** a loader is a translator for *one file at a time* ("turn this .scss into CSS"). A plugin is a manager for *the whole build* ("generate index.html", "extract all CSS into one file").

Note the order: `sass-loader` runs first (SCSS to CSS), then `css-loader` (resolves `@import`/`url()`), then the extract or style loader.

**Vite: why it feels instant.** Webpack bundles your whole app before the dev server starts. Vite doesn't bundle in dev: the browser asks for files one by one via native `import`, and Vite translates only the file requested. A 2,000-file app starts as fast as a 10-file app.

```ts
// vite.config.ts: usually this short
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': '/src' } },
  server: {
    port: 3000,
    proxy: { '/api': 'http://localhost:4000' },   // avoids CORS in dev
  },
  build: { sourcemap: true },
});
```

```ts
// Environment variables in Vite
// .env:  VITE_API_URL=https://api.example.com
const url = import.meta.env.VITE_API_URL;   // only VITE_* are exposed to the browser
```

**Tree shaking = shaking the tree so dead leaves fall off.** If you import one function from a library, unused exports are removed from the bundle. It only works with ES modules (`import`/`export`), not CommonJS (`require`).

```js
import { debounce } from 'lodash-es';   // good: only debounce is bundled
import _ from 'lodash';                  // bad: the whole library (CommonJS)
```

**Code splitting = load code only when needed:**

```tsx
const AdminPage = lazy(() => import('./AdminPage'));  // becomes a separate file, loaded on visit
```

**Source maps** map the minified production code back to your original files, so error stack traces and DevTools show real line numbers.

### Babel

- A transpiler: converts modern JS, JSX and TS syntax into code your target browsers support.
- **Presets** are bundles of plugins: `@babel/preset-env` (driven by `browserslist`), `preset-react`, `preset-typescript`.
- **Syntax vs polyfills:** Babel rewrites syntax (arrow functions, optional chaining). Missing APIs (`Promise`, `Array.prototype.flat`) need polyfills via core-js (`useBuiltIns: 'usage'`).
- Babel's TypeScript preset strips types without checking them. Run `tsc --noEmit` separately.
- Faster alternatives: SWC and esbuild.

### Webpack

- **Entry:** the starting file. **Output:** where the bundles go.
- **Loaders** transform individual files: `babel-loader`, `ts-loader`, `css-loader`, `sass-loader`, `style-loader`.
- **Plugins** work on the whole build: `HtmlWebpackPlugin`, `MiniCssExtractPlugin`, `DefinePlugin`.
- **Mode:** `development` or `production` (production enables minification and tree shaking).
- **Code splitting:** dynamic `import()` creates separate chunks; `SplitChunksPlugin` extracts vendor code.
- **Tree shaking:** removes unused exports. Needs ES modules and `sideEffects: false` in package.json.
- **Cache busting:** `[contenthash]` in filenames. **HMR:** hot module replacement.
- **Module Federation:** loads code from separately deployed apps at runtime (micro-frontends).

### Vite

- **Dev:** serves native ES modules straight to the browser and transforms files on request, so startup is near-instant regardless of app size. Dependencies are pre-bundled with esbuild.
- **Build:** a production bundle with Rollup (newer versions use Rolldown, a Rust port of Rollup).
- Fast HMR, built-in TS/JSX/CSS/SASS support (just install `sass`), plugins compatible with Rollup.
- Environment variables: `import.meta.env.VITE_*` (only variables with the `VITE_` prefix are exposed to the client).

### Likely questions

- Why is Vite faster than Webpack in development?
- Loader vs plugin in Webpack?
- What is tree shaking and what breaks it? (CommonJS `require`, and modules with side effects.)
- How do you reduce bundle size? (Code splitting, lazy routes, tree shaking, analyze the bundle with `rollup-plugin-visualizer` or `webpack-bundle-analyzer`, replace heavy libraries.)
- What is a source map?

**Model answers (say each in about 30–60 seconds):**

**Q: Why is Vite faster than Webpack in development?**

Webpack **bundles the entire app before the dev server can start**. On a big project that means crawling thousands of modules, transforming each one through loaders and writing a bundle to memory, which can take 30+ seconds. Every change then has to rebuild part of that bundle, so HMR gets slower as the app grows.

Vite skips bundling in development and does three things differently:
1. **Native ES modules.** The browser itself requests files via `import` statements. Vite only transforms the files the **current page actually imports**, on demand. A route you never open is never processed.
2. **Dependency pre-bundling with esbuild.** `node_modules` packages rarely change but often consist of hundreds of files (lodash-es is about 600 modules) or are CommonJS. On first start, Vite bundles them once with esbuild (written in Go, 10–100× faster than JS-based tools), converts them to ESM and caches the result in `node_modules/.vite`, with strong browser caching on top.
3. **HMR proportional to the change.** When you edit a file, Vite only invalidates that module and its boundary. The update cost stays roughly constant whether the app has 50 or 5,000 modules.

For **production**, Vite still bundles (with Rollup, or Rolldown in newer versions), because shipping thousands of unbundled files would be slow for users.

> One-liner: "Webpack bundles first and serves second. Vite serves native ES modules immediately, transforms only what's requested, and pre-bundles dependencies with esbuild."

**Q: Loader vs plugin in Webpack?**

| | Loader | Plugin |
| --- | --- | --- |
| Works on | **One file at a time**, as it's imported | The **whole build** (the compilation lifecycle) |
| Job | Transform a file's content into JS Webpack understands | Anything else: generate files, optimise, inject variables |
| Configured in | `module.rules` (`test` + `use`) | `plugins: [new SomePlugin()]` |
| Examples | `babel-loader`, `ts-loader`, `sass-loader`, `css-loader`, `style-loader` | `HtmlWebpackPlugin`, `MiniCssExtractPlugin`, `DefinePlugin`, `BundleAnalyzerPlugin` |

Webpack natively understands only JavaScript and JSON. **Loaders** teach it how to import other file types: `sass-loader` turns SCSS into CSS, `css-loader` resolves `@import`/`url()` and turns CSS into a JS module, and `style-loader` injects it into the page. Loaders are **chained and run right to left** (bottom to top): `use: ['style-loader', 'css-loader', 'sass-loader']` runs sass first.

**Plugins** hook into events of the whole build (`emit`, `compilation`, `done`) to do things no single file transform could: create `index.html` with the bundle's script tags injected, extract all CSS into one file, replace `process.env.NODE_ENV` across the code, or analyse bundle size.

> Easy way to remember: "A loader is a **translator** for one file. A plugin is a **manager** for the whole build."

**Q: What is tree shaking and what breaks it?**

Tree shaking is **dead-code elimination for unused exports**. If you `import { debounce } from 'lodash-es'`, the bundler includes `debounce` (and whatever it depends on) and drops the other ~300 functions. It works because ES module `import`/`export` statements are **static**: the bundler can see at build time exactly which exports are used, without running the code. The bundler marks unused exports, and the minifier then removes them.

What breaks it:
- **CommonJS** (`require` / `module.exports`): imports can be dynamic (`require(name)`) and exports can be modified at runtime, so the bundler has to keep the whole module. That's why `import _ from 'lodash'` pulls in all of lodash, while `lodash-es` or `lodash/debounce` doesn't.
- **Side effects**: if a module does something when imported (patches a global, adds CSS, registers a polyfill), the bundler can't safely remove it even if you use none of its exports. Libraries declare `"sideEffects": false` (or a list like `["*.css"]`) in `package.json` to say "removing unused modules is safe".
- **Importing everything**: `import * as utils from './utils'` used dynamically (`utils[name]()`) means the bundler can't know which exports are needed.
- **Babel converting ESM to CommonJS**: with `@babel/preset-env`'s `modules: 'commonjs'`, the bundler never sees ESM. Use `modules: false` so the bundler handles modules.
- **Barrel files with side effects**: an `index.ts` that re-exports everything can drag in modules with top-level code. It also slows down dev servers and tests.
- **Development mode**: tree shaking only fully happens in production builds.

> Say: "Tree shaking relies on static ES module syntax. CommonJS and side-effectful modules prevent it, which is why libraries ship ESM builds and set `sideEffects: false`."

**Q: How do you reduce bundle size?**

Answer it as a process, measure first:
1. **Measure.** Run `rollup-plugin-visualizer` (Vite) or `webpack-bundle-analyzer` to see a treemap of what's in each chunk. Check Lighthouse and the Network tab for what users actually download. Optionally add a size budget in CI (`size-limit`).
2. **Code-split routes and heavy components.** `React.lazy(() => import('./pages/Reports'))` + `<Suspense>`, so users download the reports page (and its chart library) only when they visit it.
3. **Lazy-load heavy libraries on demand**: `const { jsPDF } = await import('jspdf')` inside the click handler for "Export PDF".
4. **Make tree shaking work**: use ESM builds (`lodash-es`, per-function imports), avoid `import *`, check `sideEffects`.
5. **Replace heavy dependencies**: moment.js (~70 KB+ with locales) → date-fns or dayjs, full lodash → native methods, a big UI kit → headless components. Check sizes on bundlephobia before adding a package.
6. **Remove duplicates**: two versions of the same library (`npm ls react`, `npm dedupe`).
7. **Split vendor chunks** for better caching (`manualChunks` / `splitChunks`). This doesn't shrink the total, but returning users re-download less after a deploy.
8. **Assets**: compress images (WebP/AVIF), use SVG sprites or icon components that tree-shake (import single icons, not the whole set), subset fonts.
9. **Serve efficiently**: gzip/Brotli compression at the server/CDN, long-term caching with content-hashed filenames, HTTP/2.

> Say: "I'd measure first with a bundle analyzer, then lazy-load routes and heavy libraries, fix anything that blocks tree shaking, and swap oversized dependencies. In a past project that type of change [give your own number if you have one]."

**Q: What is a source map?**

Production code is **minified and bundled**: variable names are shortened, everything is on one line, and many files are merged. If an error happens, the stack trace says something like `index-a1b2c3.js:1:48213`, which is useless.

A **source map** (`.js.map` file) is a JSON file that maps every position in the generated code back to the **original file, line, column and name**. Browser DevTools and error trackers use it to show `src/components/Cart.tsx:42` and let you set breakpoints in your real TypeScript.

The bundle points to its map with a comment at the end: `//# sourceMappingURL=index-a1b2c3.js.map`.

Production options:
- **Public source maps**: easy debugging in DevTools, but anyone can read your original source code.
- **Hidden source maps** (`hidden-source-map` in Webpack, or generate them but don't deploy the `.map` files): upload them to **Sentry** or a similar error tracker, so you get readable stack traces privately. This is the common choice.
- **None**: smallest deploy, but unreadable production errors.

In development, bundlers use fast, cheaper map types (e.g. Webpack's `eval-cheap-module-source-map`) to keep rebuilds quick. Vite generates them automatically in dev, and `build.sourcemap: true` (or `'hidden'`) controls production.

> One-liner: "A source map links minified production code back to the original source, so stack traces and debugging point to real files and lines. In production I usually upload them privately to Sentry instead of serving them publicly."

### Gotchas

- Vite's dev mode (unbundled ESM) and build (Rollup) can behave differently. Always test `vite build && vite preview`.
- `process.env` doesn't exist in Vite client code. Use `import.meta.env`.
- Env variables are inlined at build time: anything exposed to the client is public. Never put secrets there.
- Babel transpiling does not equal polyfilling.

