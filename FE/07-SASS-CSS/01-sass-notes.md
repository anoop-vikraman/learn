## 6. SASS / SCSS

SASS is a CSS preprocessor: variables, nesting, mixins and functions compile down to plain CSS. SCSS is its CSS-like syntax and the one everyone uses.

### Explained simply (read this first)

**SASS is CSS with programming features**, written in `.scss` files and compiled to normal `.css`. The browser never sees SASS.

**1. Variables: write a value once, reuse it.**

```scss
$primary: #2563eb;
$radius: 8px;

.button { background: $primary; border-radius: $radius; }
.link   { color: $primary; }
```

**2. Nesting: write CSS in the same shape as your HTML.** `&` means "the parent selector".

```scss
.card {
  padding: 16px;

  &:hover { box-shadow: 0 2px 8px rgba(0,0,0,.1); }   // .card:hover
  &__title { font-size: 1.25rem; }                    // .card__title  (BEM element)
  &--active { border-color: $primary; }               // .card--active (BEM modifier)
  .icon { width: 16px; }                              // .card .icon
}
```

**3. Mixins: reusable chunks of CSS, like functions that output styles.**

```scss
@mixin flex-center($direction: row) {
  display: flex;
  flex-direction: $direction;
  align-items: center;
  justify-content: center;
}

.modal { @include flex-center(column); }
.badge { @include flex-center; }
```

**4. Responsive mixin (very common in real projects):**

```scss
@use 'sass:map';
$breakpoints: (sm: 640px, md: 768px, lg: 1024px);

@mixin respond($size) {
  @media (min-width: map.get($breakpoints, $size)) { @content; }  // @content = the block you pass in
}

.sidebar {
  display: none;
  @include respond(md) { display: block; }
}
```

**5. Functions and loops: generate CSS.**

```scss
@use 'sass:math';
@function rem($px) { @return math.div($px, 16) * 1rem; }

h1 { font-size: rem(32); }   // 2rem

// Generate .mt-1 ... .mt-4 spacing utilities
@for $i from 1 through 4 {
  .mt-#{$i} { margin-top: #{$i * 4}px; }
}

// Loop over a map to make theme classes
$colors: (primary: #2563eb, danger: #dc2626, success: #16a34a);
@each $name, $color in $colors {
  .btn-#{$name} { background: $color; }
}
```

**6. Splitting files: partials + `@use`.** A file starting with `_` is a partial (only imported, never compiled alone).

```scss
// styles/_tokens.scss
$primary: #2563eb;
@mixin card { border-radius: 8px; padding: 16px; }

// components/Button.module.scss
@use '../styles/tokens' as t;      // namespaced: no global name clashes
.button { background: t.$primary; @include t.card; }
```

**`@use` vs `@import`, in one line:** `@import` dumps everything into one global space and can duplicate CSS; `@use` loads a file once and namespaces it (`t.$primary`). `@import` is deprecated.

**SASS variables vs CSS variables:**

```scss
// SASS variable: replaced at compile time, gone in the browser
$brand: #2563eb;

// CSS variable: lives in the browser, can change at runtime (themes)
:root { --brand: #{$brand}; }               // seed the CSS var from the SASS token
[data-theme='dark'] { --brand: #60a5fa; }
.button { background: var(--brand); }       // switches automatically with the theme
```

**Using SCSS with React (CSS Modules):**

```tsx
// Button.module.scss -> .primary { ... }
import styles from './Button.module.scss';
<button className={styles.primary}>Save</button>   // compiled to a unique name like Button_primary__x7f2
```

CSS Modules give each component its own class names, so styles never accidentally clash across components.

### Core concepts

- **Variables:** `$primary: #3b82f6;` are compile-time. CSS custom properties (`--primary`) are runtime: they can change with themes and be read by JS. A good answer: use both, SASS for build-time tokens and CSS variables for theming.
- **Nesting + `&`:** `&:hover`, `&--active` (BEM modifiers). Keep nesting at 3 levels or fewer.
- **Mixins vs placeholders:** `@mixin`/`@include` copy declarations and accept arguments. `%placeholder` + `@extend` group selectors, which can produce selector bloat and doesn't work across media queries.
- **Functions + control flow:** `@function`, `@if`, `@each`, `@for`, maps (`map.get($breakpoints, md)`).
- **Module system:** `@use 'tokens' as t;` and `@forward` replace the deprecated `@import`. `@use` namespaces members and loads each file once.
- **Partials:** `_buttons.scss` files aren't compiled on their own.
- Dart Sass is the current implementation (LibSass and node-sass are deprecated).

```scss
@use 'sass:map';
$breakpoints: (sm: 640px, md: 768px, lg: 1024px);

@mixin up($bp) {
  @media (min-width: map.get($breakpoints, $bp)) { @content; }
}

.card {
  padding: 1rem;
  &__title { font-weight: 600; }
  &--featured { border: 2px solid var(--primary); }
  @include up(md) { padding: 2rem; }
}
```

### Styling architecture questions

- BEM naming, CSS Modules (`styles.module.scss`, locally scoped class names), CSS-in-JS (styled-components, which has runtime cost) vs Tailwind (utility classes, zero runtime).
- How do you scope styles in a component library? (CSS Modules, Shadow DOM, or a prefix convention.)

### Gotchas

- `@import` is deprecated and causes duplicated CSS. Use `@use`.
- Deep nesting produces highly specific selectors that are hard to override.
- `@extend` across files or media queries behaves unexpectedly. Prefer mixins.
- SASS variables can't change at runtime (for dark mode, use CSS variables).
- Native CSS now has nesting, `:has()`, container queries and `@layer`, so be ready to say what SASS still adds (mixins, loops, maps, modules).

