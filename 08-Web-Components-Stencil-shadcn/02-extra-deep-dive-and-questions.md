# Web Components, Stencil, shadcn: deep dive and Q&A

## Custom element lifecycle callbacks

```js
class MyEl extends HTMLElement {
  static observedAttributes = ['size', 'disabled'];   // only these trigger attributeChangedCallback

  constructor() {
    super();                       // always call super first
    this.attachShadow({ mode: 'open' });
    // don't read attributes or children here: they may not be set yet
  }
  connectedCallback() {}           // added to the DOM: render, add listeners, fetch
  disconnectedCallback() {}        // removed: clean up listeners and timers (like effect cleanup)
  attributeChangedCallback(name, oldValue, newValue) {}  // an observed attribute changed
  adoptedCallback() {}             // moved to a new document (rare)
}
customElements.define('my-el', MyEl);   // the name MUST contain a hyphen
```

| Custom element | React equivalent |
| --- | --- |
| `constructor` | initial state |
| `connectedCallback` | `useEffect(() => {}, [])` |
| `disconnectedCallback` | effect cleanup |
| `attributeChangedCallback` | props change / `useEffect` on deps |

## Slots (Web Components' version of `children`)

```html
<!-- inside the shadow DOM template -->
<div class="card">
  <header><slot name="title">Default title</slot></header>
  <section><slot></slot></section>          <!-- default slot -->
  <footer><slot name="actions"></slot></footer>
</div>

<!-- usage -->
<my-card>
  <h2 slot="title">Hello</h2>
  <p>This goes in the default slot</p>
  <button slot="actions">OK</button>
</my-card>
```

Slotted content stays in the **light DOM**, so page styles still apply to it. The component can style it lightly with `::slotted(h2) { margin: 0; }` (top-level slotted elements only).

## Styling across the shadow boundary: the four tools

```css
/* Inside the component's shadow CSS */
:host { display: block; }                       /* the custom element itself */
:host([variant='primary']) { --bg: blue; }      /* host with an attribute */
:host-context(.dark) { --bg: #222; }            /* ancestor match (limited support) */
::slotted(p) { color: gray; }                   /* top-level slotted children */
.btn { background: var(--my-button-bg, #4f46e5); }   /* CSS custom properties pierce the shadow */
```

```html
<!-- Inside the component: expose a part -->
<button part="control label">Click</button>
```

```css
/* Outside (the page): */
my-button { --my-button-bg: hotpink; }          /* theme via custom properties */
my-button::part(control) { border-radius: 0; }  /* style exposed parts */
```

Say: "Custom properties and `::part` are the public styling API of a web component; everything else is encapsulated."

## `<template>` element

```js
const tpl = document.createElement('template');
tpl.innerHTML = `<style>p { color: teal }</style><p><slot></slot></p>`;

class TealText extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).appendChild(tpl.content.cloneNode(true)); // parsed once, cloned many times
  }
}
```

## Form-associated custom elements

```js
class RatingInput extends HTMLElement {
  static formAssociated = true;
  #internals = this.attachInternals();
  #value = 0;

  set value(v) {
    this.#value = v;
    this.#internals.setFormValue(String(v));   // participates in FormData / submit
    if (v === 0) this.#internals.setValidity({ valueMissing: true }, 'Please rate');
    else this.#internals.setValidity({});
  }
  get value() { return this.#value; }
}
```

## Events out of a web component

```js
this.dispatchEvent(new CustomEvent('rating-change', {
  detail: { value: 4 },
  bubbles: true,
  composed: true,       // crosses the shadow boundary
}));
```

---

## Stencil deep dive

### Full component with every decorator

```tsx
import { Component, Prop, State, Event, EventEmitter, Watch, Method, Element, Listen, Host, h } from '@stencil/core';

@Component({
  tag: 'ds-counter',
  styleUrl: 'ds-counter.scss',
  shadow: true,
})
export class DsCounter {
  @Element() el!: HTMLElement;                       // reference to the host element

  @Prop() label = 'Count';                           // public input (immutable inside)
  @Prop({ mutable: true, reflect: true }) value = 0; // reflect = mirror to an attribute
  @Prop() max?: number;

  @State() focused = false;                          // internal state, triggers re-render

  @Event({ eventName: 'dsChange' }) dsChange!: EventEmitter<number>; // custom event (composed by default)

  @Watch('value')                                    // like useEffect on a prop
  validate(newValue: number, oldValue: number) {
    if (this.max !== undefined && newValue > this.max) this.value = oldValue;
  }

  @Method()                                          // public async method: el.reset()
  async reset() { this.value = 0; }

  @Listen('keydown')                                 // host event listener
  onKey(e: KeyboardEvent) { if (e.key === 'ArrowUp') this.increment(); }

  private increment = () => {
    this.value++;
    this.dsChange.emit(this.value);
  };

  // Lifecycle
  connectedCallback() {}
  componentWillLoad() { /* before the first render: fetch data (can return a promise) */ }
  componentDidLoad() { /* after the first render: DOM is available */ }
  componentShouldUpdate(newV: any, oldV: any, prop: string) { return true; }
  componentWillUpdate() {}
  componentDidUpdate() {}
  disconnectedCallback() { /* cleanup */ }

  render() {
    return (
      <Host class={{ focused: this.focused }}>
        <span part="label">{this.label}: {this.value}</span>
        <button onClick={this.increment} onFocus={() => (this.focused = true)}>+</button>
        <slot />
      </Host>
    );
  }
}
```

### Stencil output targets (why companies choose Stencil)

```ts
// stencil.config.ts
import { Config } from '@stencil/core';
import { reactOutputTarget } from '@stencil/react-output-target';
import { sass } from '@stencil/sass';

export const config: Config = {
  namespace: 'design-system',
  plugins: [sass()],
  outputTargets: [
    { type: 'dist' },                               // lazy-loaded bundle
    { type: 'dist-custom-elements' },               // tree-shakable standalone elements
    reactOutputTarget({ outDir: '../react-lib/src/components' }), // typed React wrappers
    { type: 'docs-readme' },
    { type: 'www', serviceWorker: null },
  ],
};
```

React wrappers fix: passing objects/arrays as **properties** (not string attributes), mapping custom events to `onDsChange` props, and TypeScript typings.

### Stencil testing

```ts
import { newSpecPage } from '@stencil/core/testing';
import { DsCounter } from './ds-counter';

it('renders and increments', async () => {
  const page = await newSpecPage({ components: [DsCounter], html: `<ds-counter label="Clicks"></ds-counter>` });
  expect(page.root.shadowRoot.querySelector('span').textContent).toBe('Clicks: 0');
  page.root.shadowRoot.querySelector('button').click();
  await page.waitForChanges();
  expect(page.root.value).toBe(1);
});
// newE2EPage() runs in a real headless browser (Puppeteer) for E2E-style tests.
```

---

## shadcn/ui deep dive

### What's actually in a shadcn component

1. **Radix UI primitive** (or Base UI): headless behaviour + accessibility (focus trap, keyboard, ARIA).
2. **Tailwind classes**: styling.
3. **`cva`** (class-variance-authority): typed variants.
4. **`cn()`**: merges classes and resolves Tailwind conflicts.

```ts
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
// cn('px-2 py-1', isActive && 'bg-blue-500', 'px-4') → 'py-1 bg-blue-500 px-4' (px-4 wins)
```

```tsx
// components/ui/button.tsx (simplified)
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';

const buttonVariants = cva('inline-flex items-center rounded-md font-medium focus-visible:ring-2', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground hover:bg-primary/90',
      destructive: 'bg-destructive text-white',
      outline: 'border bg-background hover:bg-accent',
      ghost: 'hover:bg-accent',
    },
    size: { default: 'h-9 px-4', sm: 'h-8 px-3', lg: 'h-10 px-6', icon: 'size-9' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';   // asChild: render as the child element (e.g. <Link>)
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

// <Button asChild><a href="/docs">Docs</a></Button>  → renders an <a> with button styles
```

### Theming shadcn

Theme colours are CSS variables in `globals.css` (`--primary`, `--background`, etc.). Changing them, or toggling a `.dark` class, rethemes everything. `components.json` stores the config the CLI uses.

---

## Extra interview questions

**Q: Name the three (four) Web Components standards.**
Custom Elements, Shadow DOM, HTML Templates (`<template>`/`<slot>`), plus ES Modules for distribution.

**Q: Why do React and Web Components historically clash?**
Before React 19, React passed everything as **string attributes** (objects became `"[object Object]"`) and couldn't listen to custom events declaratively. Workarounds: refs to set properties and `addEventListener`, or generated wrappers (Stencil's React output target, `@lit/react`). React 19 sets properties when the element defines them and supports `on<eventname>` props.

**Q: Light DOM vs Shadow DOM?**
Light DOM is the regular DOM children the user writes. Shadow DOM is the component's private internal tree. Slots project light DOM into the shadow tree.

**Q: When would you NOT use shadow DOM?**
When you need global styles or Tailwind to apply, simpler SSR, or form or ARIA cross-references. Stencil supports `shadow: false` or `scoped: true` (emulated scoping).

**Q: Lit vs Stencil?**
Both make web components easier to write. Lit is a tiny runtime library (reactive properties, tagged-template rendering). Stencil is a compiler (TSX, decorators, lazy loading, framework wrapper generation). Stencil is often chosen for design systems that must serve many frameworks.

**Q: What is a headless component library?**
Behaviour and accessibility without styles: Radix, React Aria, Headless UI, TanStack Table. You bring the styling. shadcn = Radix (headless) + Tailwind (styles) + copy-paste ownership.

**Q: shadcn vs MUI vs Chakra?**
MUI and Chakra are npm dependencies with their own theming system and runtime styling, and updates come from upstream. shadcn components are **copied into your repo**: you own and edit the code, there's no version lock-in, and they're Tailwind-based. The trade-off is that you maintain them yourself (no automatic upstream fixes).

**Q: How would you build a design system used by React, Angular and plain HTML apps?**
Core components in Stencil or Lit (Web Components), shared design tokens (Style Dictionary → CSS variables + SCSS + JS), generated framework wrappers, Storybook for docs, visual regression tests (Chromatic), semantic versioning with changesets, and accessibility built in.
