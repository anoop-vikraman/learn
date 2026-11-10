# SASS + core CSS extra: patterns and Q&A

React interviews often include general CSS questions, so this file covers both.

## SASS: more features with code

### Maps + loops for design tokens

```scss
@use 'sass:map';

$colors: (
  'primary': #4f46e5,
  'danger': #dc2626,
  'success': #16a34a,
);

$spacing: (0: 0, 1: 0.25rem, 2: 0.5rem, 3: 1rem, 4: 1.5rem);

@each $name, $value in $colors {
  .text-#{$name} { color: $value; }
  .bg-#{$name}   { background-color: $value; }
}

@each $key, $value in $spacing {
  .m-#{$key} { margin: $value; }
  .p-#{$key} { padding: $value; }
}

.button { background: map.get($colors, 'primary'); }
```

### SASS tokens → CSS custom properties (best of both: build-time + runtime theming)

```scss
:root {
  @each $name, $value in $colors {
    --color-#{$name}: #{$value};
  }
}

[data-theme='dark'] {
  --color-primary: #818cf8;
}

.button { background: var(--color-primary); }  // switches at runtime with no rebuild
```

### `@extend` with placeholder vs `@mixin`

```scss
%card-base {                 // placeholder: never output on its own
  border-radius: 8px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.1);
}
.card    { @extend %card-base; padding: 1rem; }
.modal   { @extend %card-base; padding: 2rem; }
// Output: .card, .modal { border-radius…; box-shadow… }  ← grouped selectors

@mixin card-base($radius: 8px) {   // mixin: copies declarations, accepts arguments
  border-radius: $radius;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.1);
}
```
Say: "I prefer mixins. `@extend` can create unexpected selector groups and doesn't work across media queries."

### `@forward` to build a public API for your styles

```scss
// styles/_index.scss
@forward 'tokens';
@forward 'mixins';

// component.module.scss
@use '../styles' as s;
.title { color: s.$color-primary; @include s.respond(md) { font-size: 2rem; } }
```

### Built-in modules

```scss
@use 'sass:math';
@use 'sass:color';

.box {
  width: math.div(100%, 3);                    // `/` for division is deprecated
  background: color.adjust($primary, $lightness: -10%);
  border-color: color.mix($primary, white, 20%);
}

@function rem($px, $base: 16) { @return math.div($px, $base) * 1rem; }
h1 { font-size: rem(32); }  // 2rem
```

### BEM with SASS nesting

```scss
.card {
  padding: 1rem;
  &__title { font-weight: 600; }          // .card__title
  &__body  { color: #444; }               // .card__body
  &--featured { border: 2px solid gold; } // .card--featured
  &:hover { box-shadow: 0 4px 12px rgb(0 0 0 / 0.15); }
  .dark & { background: #222; }           // .dark .card
}
```
BEM = **B**lock, **E**lement, **M**odifier: flat, predictable, low-specificity class names. CSS Modules make BEM less necessary because class names are already scoped.

---

## Core CSS questions (asked in almost every frontend interview)

**Q: Explain the box model.**
Content → padding → border → margin. With `box-sizing: content-box` (the default), `width` is content only. With `border-box`, `width` includes padding and border. Everyone sets `*, *::before, *::after { box-sizing: border-box; }`.

**Q: Specificity: how is it calculated?**
(inline, IDs, classes/attributes/pseudo-classes, elements/pseudo-elements). `#nav .item a` = (0,1,1,1). `!important` overrides everything (avoid it). `:where()` has 0 specificity, while `:is()` takes the highest specificity among its arguments.

**Q: Flexbox vs Grid?**
Flexbox is **one-dimensional** (a row OR a column), content-driven: navbars, button groups, centering. Grid is **two-dimensional** (rows AND columns), layout-driven: page layouts, card galleries.

```css
/* Center anything */
.center { display: grid; place-items: center; }
.center-flex { display: flex; justify-content: center; align-items: center; }

/* Responsive card grid without media queries */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }

/* Holy grail layout */
.layout {
  display: grid;
  grid-template: "header header" auto "sidebar main" 1fr "footer footer" auto / 240px 1fr;
  min-height: 100dvh;
}
```

**Q: `position` values?**
`static` (default), `relative` (offset from its normal position, and becomes the containing block for absolute children), `absolute` (relative to the nearest positioned ancestor, removed from flow), `fixed` (relative to the viewport; but a `transform` on an ancestor breaks it), `sticky` (relative until a threshold, then sticks within its parent).

**Q: What is a stacking context and why doesn't my z-index work?**
`z-index` only compares elements within the **same stacking context**. New contexts are created by `position` + `z-index`, `opacity < 1`, `transform`, `filter`, `isolation: isolate`, and more. A modal with `z-index: 9999` inside a parent with `transform` can still sit under other content. That's why modals use **portals**.

**Q: `display: none` vs `visibility: hidden` vs `opacity: 0`?**
`none`: removed from layout and from the accessibility tree. `visibility: hidden`: keeps its space, not clickable, hidden from screen readers. `opacity: 0`: keeps its space, **still clickable** and focusable. For "visually hidden but readable by screen readers", use the `.sr-only` clip pattern.

**Q: `em` vs `rem` vs `%` vs `vw`/`vh` vs `dvh`?**
`em` is relative to the parent's font size (it compounds), `rem` to the root font size (predictable, respects user settings), `%` to the parent dimension, `vw`/`vh` to the viewport. `dvh`/`svh` handle mobile browser toolbars.

**Q: Pseudo-class vs pseudo-element?**
A pseudo-class is a **state** (`:hover`, `:focus-visible`, `:nth-child`, `:has()`). A pseudo-element is a **part** (`::before`, `::after`, `::placeholder`, `::marker`).

**Q: What is `:has()`?**
The "parent selector": `.card:has(img)` styles cards that contain an image, and `form:has(:invalid) button { opacity: .5 }`.

**Q: How do you make responsive designs?**
Mobile-first `min-width` media queries, fluid units (`rem`, `%`, `clamp()`), flex/grid with `auto-fill`, responsive images (`srcset`, `sizes`, `<picture>`), and **container queries** (`@container (min-width: 400px)`) for component-level responsiveness.

```css
h1 { font-size: clamp(1.5rem, 4vw + 1rem, 3rem); }  /* fluid typography */

.card-wrapper { container-type: inline-size; }
@container (min-width: 500px) { .card { display: flex; } }
```

**Q: What causes layout shift (CLS) and how do you prevent it?**
Images without dimensions, late-loading fonts, injected banners. Prevent it with `width`/`height` or `aspect-ratio` on media, reserved space for ads and banners, `font-display: optional`/`swap` with size-adjusted fallbacks.

**Q: Which CSS properties are cheap to animate?**
`transform` and `opacity`, which are compositor-only and run on the GPU. Animating `width`, `top` or `margin` triggers layout on every frame. Respect `prefers-reduced-motion`.

**Q: CSS Modules vs CSS-in-JS vs Tailwind vs SASS: when to choose which?**
| Approach | Pros | Cons |
| --- | --- | --- |
| SASS + CSS Modules | Scoped, zero runtime, familiar CSS | Context switching between files |
| CSS-in-JS runtime (styled-components, Emotion) | Dynamic styles from props, colocated | Runtime cost, issues with RSC/streaming SSR |
| Zero-runtime CSS-in-JS (vanilla-extract, Linaria, Panda) | Type-safe, no runtime | Build setup |
| Tailwind | Fast to build, consistent design tokens, tiny CSS output | Long class lists, a learning curve |

**Q: What is `rem`-based spacing and why use design tokens?**
Tokens (colour, spacing, typography, radius) are named values shared between design (Figma) and code. They keep things consistent and make theming possible, e.g. light/dark through CSS variables.

**Q: How do you implement dark mode?**
```css
:root { --bg: #fff; --text: #111; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #111; --text: #eee; } }
[data-theme='dark'] { --bg: #111; --text: #eee; }   /* manual toggle wins */
body { background: var(--bg); color: var(--text); }
```
In React: store the preference in `localStorage` and set `document.documentElement.dataset.theme`. To avoid a flash, set the attribute in an inline script in `<head>` before React loads.

**Q: CSS cascade layers?**
`@layer reset, base, components, utilities;` controls precedence by layer order instead of specificity. It's great for taming third-party CSS.

**Q: Logical properties?**
`margin-inline-start` instead of `margin-left` adapts to RTL languages automatically.
