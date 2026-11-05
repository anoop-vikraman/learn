# Build tools extra: real configs and Q&A

## A realistic `vite.config.ts`

```ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';            // or @vitejs/plugin-react-swc (faster)
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');      // read .env files in config (server side)
  return {
    plugins: [react(), visualizer({ filename: 'stats.html' })],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') }, // match tsconfig "paths"
    },
    server: {
      port: 3000,
      proxy: {
        '/api': { target: env.API_URL ?? 'http://localhost:4000', changeOrigin: true }, // avoids CORS in dev
      },
    },
    build: {
      sourcemap: true,
      target: 'es2020',
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],          // vendor chunk: cached separately
            query: ['@tanstack/react-query'],
          },
        },
      },
    },
    css: {
      preprocessorOptions: {
        scss: { additionalData: `@use "@/styles/tokens" as *;` }, // inject tokens into every SCSS file
      },
    },
  };
});
```

Env variables in Vite: `.env`, `.env.local`, `.env.[mode]`. Only variables prefixed `VITE_` are exposed to client code via `import.meta.env.VITE_API_URL`. Built-ins: `import.meta.env.MODE`, `DEV`, `PROD`, `BASE_URL`.

## A realistic `webpack.config.js`

```js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';
  return {
    entry: './src/index.tsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProd ? '[name].[contenthash].js' : '[name].js',  // cache-busting
      publicPath: '/',
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    module: {
      rules: [
        { test: /\.[jt]sx?$/, exclude: /node_modules/, use: 'babel-loader' },   // or swc-loader / ts-loader
        {
          test: /\.s?css$/,
          use: [isProd ? MiniCssExtractPlugin.loader : 'style-loader', 'css-loader', 'postcss-loader', 'sass-loader'],
          // loaders run RIGHT to LEFT: sass → postcss → css → style
        },
        { test: /\.(png|svg|jpe?g|gif|woff2?)$/, type: 'asset' },          // Webpack 5 asset modules
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({ template: './public/index.html' }),
      isProd && new MiniCssExtractPlugin({ filename: '[name].[contenthash].css' }),
    ].filter(Boolean),
    optimization: {
      splitChunks: { chunks: 'all' },   // pulls shared vendor code into separate chunks
      runtimeChunk: 'single',
    },
    devtool: isProd ? 'source-map' : 'eval-cheap-module-source-map',
    devServer: { historyApiFallback: true, hot: true, port: 3000 },  // SPA fallback + HMR
  };
};
```

## `babel.config.js`

```js
module.exports = {
  presets: [
    ['@babel/preset-env', { useBuiltIns: 'usage', corejs: 3 }],   // syntax + polyfills based on browserslist
    ['@babel/preset-react', { runtime: 'automatic' }],            // new JSX transform
    '@babel/preset-typescript',                                    // strips types (doesn't type-check!)
  ],
};
```

`package.json` → `"browserslist": [">0.5%", "last 2 versions", "not dead"]` tells Babel, Autoprefixer and others which browsers to support.

## Code splitting in React

```tsx
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./pages/Dashboard'));     // separate chunk
const Settings = lazy(() => import('./pages/Settings'));

<Suspense fallback={<PageSpinner />}>
  <Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/settings" element={<Settings />} />
  </Routes>
</Suspense>;

// Preload on hover
const loadSettings = () => import('./pages/Settings');
<Link to="/settings" onMouseEnter={loadSettings}>Settings</Link>;

// Lazy-load a heavy library only when needed
async function exportPdf() {
  const { jsPDF } = await import('jspdf');
  new jsPDF().text('Hello', 10, 10).save('a.pdf');
}
```

## Things that break tree shaking

```js
import _ from 'lodash';             // ❌ CommonJS, pulls in everything
import debounce from 'lodash/debounce'; // ✅ path import
import { debounce } from 'lodash-es';    // ✅ ESM build

// package.json of a library:
"sideEffects": false            // tells the bundler unused modules are safe to drop
"sideEffects": ["*.css"]        // except CSS imports
```

---

## Extra interview questions

**Q: What is HMR and how does it work?**
Hot Module Replacement swaps changed modules in the running app without a full reload, so state is preserved. The dev server watches files and pushes an update over a WebSocket. The client replaces the module, and React Fast Refresh re-renders components while keeping their hook state.

**Q: Why is Vite fast? (full answer)**
1. **No bundling in dev**: it serves source as native ES modules, and the browser requests only what the current page imports.
2. **Dependency pre-bundling with esbuild** (written in Go, 10–100× faster than JS tools): it converts CommonJS deps to ESM and merges many small files (lodash-es has 600 modules) into one.
3. **HMR is proportional to the change**, not to app size.
4. For **production**, it uses Rollup (Rolldown in newer versions) for optimised, tree-shaken bundles.

**Q: esbuild vs SWC vs Babel?**
All three transpile. Babel is JS, slow but endlessly pluggable. SWC is Rust (Next.js, Vite's react-swc plugin, Rspack). esbuild is Go (Vite's pre-bundling and minification). None of them **type-check**: you still run `tsc --noEmit`.

**Q: What are Turbopack, Rspack, Rolldown?**
Rust-based successors: Turbopack (Next.js), Rspack (a webpack-compatible API, a drop-in replacement), Rolldown (a Rust port of Rollup that Vite is adopting).

**Q: What is content hashing and why does it matter?**
`main.[contenthash].js`: the filename changes only when the content changes. So you can cache assets **forever** (`Cache-Control: max-age=31536000, immutable`) and just never cache `index.html`.

**Q: What does minification do?**
It removes whitespace and comments, shortens variable names, removes dead code and folds constants. Tools: Terser (JS), esbuild, SWC, and cssnano / Lightning CSS for CSS.

**Q: What is a polyfill vs transpiling?**
Transpiling rewrites **syntax** (`?.`, arrow functions, classes) into older syntax. Polyfills add missing **APIs** at runtime (`Promise`, `Array.prototype.flat`, `structuredClone`) via core-js.

**Q: What is PostCSS?**
A CSS transformer driven by plugins: Autoprefixer (vendor prefixes), Tailwind, cssnano, postcss-preset-env (future CSS today).

**Q: What is Module Federation?**
A webpack 5 / Rspack feature (also available for Vite) for **micro-frontends**: separately deployed apps share modules at runtime (`remotes` and `exposes`), with shared singletons like React.

**Q: How do you analyse and reduce bundle size? (step by step)**
1. Measure: `rollup-plugin-visualizer`, `webpack-bundle-analyzer`, `source-map-explorer`, Lighthouse.
2. Lazy-load routes and heavy components.
3. Swap heavy libraries: moment → date-fns or dayjs, lodash → lodash-es or native.
4. Check for duplicate dependency versions (`npm ls react`).
5. Make sure tree shaking works (ESM, `sideEffects`).
6. Compress (gzip/brotli at the CDN), and load images and fonts efficiently.

**Q: What is the difference between dependencies and devDependencies (for a frontend app)?**
For a bundled SPA it mostly matters for clarity and Docker installs (`npm ci --omit=dev` in production images that don't build). For **libraries**, `dependencies` get installed for consumers, and `peerDependencies` (like `react`) must be provided by the host app.

**Q: npm vs yarn vs pnpm?**
pnpm uses a content-addressable store with symlinks, so it uses less disk, installs faster and is strict (no phantom deps). All three have lockfiles, and `npm ci` / `pnpm install --frozen-lockfile` give reproducible CI installs.

**Q: What is a monorepo and what tools support it?**
Multiple packages in one repo with shared tooling. Tools: pnpm/npm workspaces, Turborepo or Nx (task caching, affected-only builds), Changesets (versioning).

**Q: Source map types?**
`source-map` (full, separate file; for production, upload to Sentry and don't serve publicly if the source is sensitive), `eval-cheap-module-source-map` (fast rebuilds in dev), `hidden-source-map` (generated but not referenced from the bundle).

**Q: ES modules vs CommonJS in the bundler context?**
ESM imports are **static**, so the bundler knows exactly what is used at build time, and that enables tree shaking. CJS `require` is dynamic, so the bundler must include whole modules.
