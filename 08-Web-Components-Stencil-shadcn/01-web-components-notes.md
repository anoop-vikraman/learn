## 7. Web Components, Stencil, shadcn/ui

This combination usually means the team has a framework-agnostic design system (Web Components built with Stencil) alongside React apps. Be ready to explain how they fit together.

### Explained simply (read this first)

**Web Components = your own HTML tags, built into the browser.** Just like `<video>` or `<select>` are tags with built-in behaviour, you can create `<user-card>` and use it in React, Angular, Vue or plain HTML. No framework needed.

**A complete Web Component from scratch (vanilla JS):**

```js
class UserCard extends HTMLElement {
  static observedAttributes = ['name'];          // which attributes to watch

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });          // private DOM + private styles
  }

  connectedCallback() { this.render(); }          // like "componentDidMount"
  disconnectedCallback() { /* cleanup */ }        // like "unmount"
  attributeChangedCallback() { this.render(); }   // an observed attribute changed

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; border: 1px solid #ddd; padding: 12px; }  /* the <user-card> itself */
        h3 { color: var(--card-title-color, navy); }                     /* themable from outside */
      </style>
      <h3>${this.getAttribute('name') ?? 'Anonymous'}</h3>
      <slot></slot>                     <!-- children go here, like React's {children} -->
      <button part="action">Follow</button>
    `;
    this.shadowRoot.querySelector('button').onclick = () =>
      this.dispatchEvent(new CustomEvent('follow', {
        detail: { name: this.getAttribute('name') },
        bubbles: true,
        composed: true,                 // lets the event escape the shadow DOM
      }));
  }
}
customElements.define('user-card', UserCard);   // name must contain a hyphen
```

```html
<user-card name="Ann">
  <p>Frontend developer</p>
</user-card>

<style>
  user-card { --card-title-color: crimson; }   /* CSS variables pass through */
  user-card::part(action) { background: black; color: white; }  /* style an exposed part */
  h3 { color: red; }                           /* does NOT affect the h3 inside the shadow DOM */
</style>
```

**Shadow DOM, explained:** a private mini-document inside the element. Page styles can't get in and the component's styles can't leak out. The only ways in are CSS variables, inherited properties (font, color) and `::part()`.

**Attributes vs properties (a classic interview point):** attributes are always strings, set in HTML. Properties are JS values on the element object and can hold arrays and objects.

```js
el.setAttribute('name', 'Ann');            // attribute: string only
el.items = [{ id: 1 }, { id: 2 }];         // property: any JS value
```

**Using a Web Component in React:**

```tsx
// React 19: works naturally, including objects and custom events
<user-card name="Ann" items={items} onfollow={(e: CustomEvent) => console.log(e.detail)} />

// React 18 and earlier: props became string attributes, so use a ref
function UserCardWrapper({ items, onFollow }: Props) {
  const ref = useRef<HTMLElement & { items?: Item[] }>(null);
  useEffect(() => {
    const el = ref.current!;
    el.items = items;                                      // set as a property
    const handler = (e: Event) => onFollow((e as CustomEvent).detail);
    el.addEventListener('follow', handler);
    return () => el.removeEventListener('follow', handler); // cleanup
  }, [items, onFollow]);
  return <user-card ref={ref} name="Ann" />;
}
```

**Stencil = write Web Components the React way.** Stencil is a compiler: you write TSX with decorators, and it outputs standard Web Components (plus optional React/Angular/Vue wrappers).

```tsx
import { Component, Prop, State, Event, EventEmitter, Watch, h, Host } from '@stencil/core';

@Component({
  tag: 'ds-counter',
  styleUrl: 'ds-counter.scss',
  shadow: true,
})
export class DsCounter {
  @Prop() label = 'Count';                // input from outside (like React props)
  @Prop() start = 0;
  @State() count = 0;                     // internal state; changing it re-renders (like useState)
  @Event() countChanged: EventEmitter<number>;   // custom event out (like an onChange callback)

  componentWillLoad() { this.count = this.start; }   // before first render

  @Watch('start')                          // runs when the start prop changes
  onStartChange(newValue: number) { this.count = newValue; }

  private increment = () => {
    this.count++;
    this.countChanged.emit(this.count);
  };

  render() {
    return (
      <Host>
        <span>{this.label}: {this.count}</span>
        <button onClick={this.increment}>+</button>
        <slot />
      </Host>
    );
  }
}
```

**Stencil vs React mapping (easy to remember):**

| React | Stencil |
| --- | --- |
| props | `@Prop()` |
| `useState` | `@State()` |
| `onSomething` callback prop | `@Event()` + `.emit()` |
| `useEffect` on a prop | `@Watch('prop')` |
| `useRef` to the host element | `@Element()` |
| `useImperativeHandle` | `@Method()` (must be async) |
| mount / unmount | `componentDidLoad` / `disconnectedCallback` |

**Using the Stencil component from React with the generated wrapper:**

```tsx
import { DsCounter } from 'my-design-system-react';   // generated by the React output target
<DsCounter label="Clicks" start={5} onCountChanged={e => console.log(e.detail)} />
```

**shadcn/ui = copy-paste components you own.** Instead of `npm install some-ui-library`, you run a CLI that puts the component's source code in your project. You can change anything.

```bash
npx shadcn@latest init
npx shadcn@latest add button dialog
# creates src/components/ui/button.tsx, dialog.tsx in YOUR repo
```

```tsx
// What a shadcn component looks like inside (simplified)
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';   // cn = clsx + tailwind-merge (merges classes, later ones win)

const buttonVariants = cva('inline-flex items-center rounded-md text-sm font-medium', {
  variants: {
    variant: { default: 'bg-primary text-white', outline: 'border bg-transparent' },
    size:    { sm: 'h-8 px-3', lg: 'h-11 px-8' },
  },
  defaultVariants: { variant: 'default', size: 'sm' },
});

export function Button({ className, variant, size, ...props }:
  React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

// Usage
<Button variant="outline" size="lg">Cancel</Button>
```

The complex parts (focus traps in dialogs, keyboard navigation, ARIA) come from **Radix UI** primitives underneath; the looks come from **Tailwind**.

### Web Components

Three browser standards:

1. **Custom Elements:** `class MyEl extends HTMLElement`, registered with `customElements.define('my-el', MyEl)`. The name must contain a hyphen. Lifecycle: `constructor`, `connectedCallback`, `disconnectedCallback`, `attributeChangedCallback` (with `static observedAttributes`), `adoptedCallback`.
2. **Shadow DOM:** `this.attachShadow({ mode: 'open' })` encapsulates the DOM and styles. Outside CSS doesn't leak in, except inherited properties (color, font) and CSS custom properties. Style from outside with `::part()` and CSS variables; style slotted content inside with `::slotted()` and the host with `:host`.
3. **HTML templates + slots:** `<template>`, `<slot>` and named slots for content projection (like React `children`).

**Using them in React:** React 19 fully supports custom elements (passes properties, supports custom events). React 18 and earlier passed everything as string attributes and couldn't listen to custom events declaratively, so you needed refs and `addEventListener`, or generated React wrappers.

### Stencil

- A compiler (by the Ionic team) that outputs standard Web Components, with a React-like developer experience: TSX, decorators, a virtual DOM, lazy loading.
- Decorators: `@Component({ tag, styleUrl, shadow: true })`, `@Prop()` (public input), `@State()` (internal state that re-renders), `@Event()` + `EventEmitter` (custom events), `@Listen()`, `@Watch('prop')`, `@Method()` (public async method), `@Element()` (host element).
- Lifecycle: `componentWillLoad`, `componentDidLoad`, `componentShouldUpdate`, `componentWillUpdate`, `componentDidUpdate`, `disconnectedCallback`.
- **Output targets** generate framework wrappers (`@stencil/react-output-target`) so React apps get typed props and `onMyEvent` handlers.
- Props should be immutable inside the component (use `mutable: true` only deliberately). Objects and arrays must be passed as properties, not attributes.

```tsx
@Component({ tag: 'ds-button', styleUrl: 'ds-button.scss', shadow: true })
export class DsButton {
  @Prop() variant: 'primary' | 'ghost' = 'primary';
  @State() pressed = false;
  @Event() dsClick: EventEmitter<void>;
  render() {
    return <button class={this.variant} onClick={() => this.dsClick.emit()}><slot /></button>;
  }
}
```

### shadcn/ui

- **Not a component library you install as a dependency.** A CLI (`npx shadcn add button`) copies component source code into your repo, so you own and modify it.
- Built on Radix UI primitives (accessibility, keyboard handling, focus management) + Tailwind CSS. Variants use `cva` (class-variance-authority); classes are merged with a `cn()` helper (`clsx` + `tailwind-merge`).
- Pros: full control, no version lock-in, accessible defaults. Cons: you maintain the code, and upstream fixes don't arrive automatically.

### Likely questions

- Web Components vs React components? (Web Components are a browser standard that works in any framework, with style encapsulation. React offers richer state, ecosystem and SSR.)
- How do you pass complex data and handle events between React and a Web Component?
- Open vs closed shadow root?
- Why would a company use Stencil? (One design system shared across React, Angular, Vue and plain HTML apps.)
- How is shadcn different from MUI?

### Gotchas

- SSR with Shadow DOM is hard (Declarative Shadow DOM helps), and there can be a flash of unstyled content before definition (use `:not(:defined)`).
- Global styles and Tailwind don't reach inside Shadow DOM.
- Forms: custom elements don't join native forms unless they use `ElementInternals` (`static formAssociated = true`).
- Custom events must use `composed: true` to cross the shadow boundary (Stencil events are composed by default).
- `aria` references (`aria-labelledby`) don't cross shadow roots.

