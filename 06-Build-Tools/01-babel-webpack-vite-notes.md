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

### Gotchas

- Vite's dev mode (unbundled ESM) and build (Rollup) can behave differently. Always test `vite build && vite preview`.
- `process.env` doesn't exist in Vite client code. Use `import.meta.env`.
- Env variables are inlined at build time: anything exposed to the client is public. Never put secrets there.
- Babel transpiling does not equal polyfilling.

