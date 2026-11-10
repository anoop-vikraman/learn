# Portals: render outside the parent DOM, stay inside the React tree

## What is a portal?

`createPortal(children, domNode, key?)` renders `children` into a **different DOM node** (usually `document.body` or a `#modal-root`), but the component still sits in the **same place in the React tree**.

Think of it like a teleporter: the **DOM** output appears somewhere else, but **React** still treats the component as a child of its parent. Props, context, state and **event bubbling** all keep working as if nothing moved.

```tsx
import { createPortal } from 'react-dom';

function Tooltip({ text }: { text: string }) {
  return createPortal(<div className="tooltip">{text}</div>, document.body);
}
```

- First argument (`<div className="tooltip">…`): *what* to render.
- Second argument (`document.body`): *where* in the real DOM to put it.
- `text`: the tooltip's message, passed in as a prop like any normal component.

## Why do we need portals? (the CSS problem)

A modal rendered normally inside a card ends up trapped by its ancestors:

```html
<div class="card" style="overflow: hidden; transform: translateZ(0); z-index: 1">
  <div class="modal">I get clipped and stuck under other content 😢</div>
</div>
```

- `overflow: hidden` on an ancestor **clips** it.
- `z-index` only works **within the stacking context**, so an ancestor with `transform`, `opacity < 1`, `filter` or `position` + `z-index` traps it.
- `position: fixed` breaks if an ancestor has `transform`.

A portal moves the DOM node to `<body>`, so none of these ancestor styles apply.

## Use cases

1. **Modals and dialogs**
2. **Tooltips and popovers** (escape `overflow: hidden` containers)
3. **Dropdown menus / select lists** inside scrollable tables
4. **Toast notifications** (one container in a corner of the page)
5. **Full-screen overlays, lightboxes, drawers**
6. Rendering React into **non-React DOM**: a widget inside a third-party map or chart container, or into a different window (`window.open`) or an iframe

---

## Example 1: a reusable Modal with portal (production-quality)

```html
<!-- index.html -->
<body>
  <div id="root"></div>
  <div id="modal-root"></div>
</body>
```

```tsx
import { useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocusedElement = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();                         // move focus into the dialog

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';            // lock background scroll

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previouslyFocusedElement?.focus();                // restore focus on close
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="modal"
        onClick={(event) => event.stopPropagation()}    // clicks inside don't close it
      >
        <h2 id="modal-title">{title}</h2>
        {children}
        <button onClick={onClose} aria-label="Close dialog">✕</button>
      </div>
    </div>,
    document.getElementById('modal-root')!,
  );
}

// Usage
function DeleteButton() {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  return (
    <>
      <button onClick={() => setIsConfirmOpen(true)}>Delete</button>
      <Modal isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)} title="Delete item?">
        <p>This can't be undone.</p>
        <button onClick={() => { deleteItem(); setIsConfirmOpen(false); }}>Yes, delete</button>
      </Modal>
    </>
  );
}
```

**What the names mean:**
- `isOpen`: whether the modal is shown. The parent owns this state, so it's a *controlled* modal.
- `onClose`: the parent's function to hide it, called by Escape, a backdrop click or the ✕ button.
- `title`: shown as the heading, and also used as the dialog's accessible name through `aria-labelledby`.
- `dialogRef`: the dialog box element. We focus it on open so keyboard and screen-reader users land inside.
- `previouslyFocusedElement`: whatever had focus before opening (usually the Delete button). Focus returns there on close.
- `handleKeyDown`: closes on Escape. Named so the same function can be removed in the cleanup.
- `event.stopPropagation()`: stops a click inside the box from bubbling to the backdrop, which would close it.
- `document.getElementById('modal-root')!`: the portal target from `index.html`.
- `isConfirmOpen`: in the usage example, tracks whether the "Delete item?" confirmation is open.

```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 0.5);
  display: grid;
  place-items: center;
  z-index: 1000;
}
.modal { background: white; border-radius: 8px; padding: 1.5rem; max-width: 480px; width: 90%; }
```

---

## Example 2: a generic `<Portal>` component (SSR-safe)

`document` doesn't exist on the server, so only create the portal after mount:

```tsx
import { useEffect, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Portal({ children, containerId = 'portal-root' }: { children: ReactNode; containerId?: string }) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let containerElement = document.getElementById(containerId);
    let didCreateContainer = false;
    if (!containerElement) {
      containerElement = document.createElement('div');
      containerElement.id = containerId;
      document.body.appendChild(containerElement);
      didCreateContainer = true;
    }
    setPortalContainer(containerElement);
    return () => {
      if (didCreateContainer) containerElement!.remove();
    };
  }, [containerId]);

  return portalContainer ? createPortal(children, portalContainer) : null;   // nothing on the server or first render
}

// <Portal><Toast message="Saved!" /></Portal>
```

**What the names mean:**
- `containerId`: the id of the DOM element to render into (default `'portal-root'`).
- `portalContainer`: that element, stored in state. It starts as `null`, so the first render (and the server render) outputs nothing, which avoids touching `document` on the server.
- `containerElement`: found with `getElementById`, or created if it doesn't exist yet.
- `didCreateContainer`: remembers whether *we* created the element, so the cleanup only removes what we added.

---

## Example 3: a tooltip positioned relative to its trigger

```tsx
function TooltipTrigger({ label, children }: { label: string; children: ReactNode }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const tooltipId = useId();

  const showTooltip = () => {
    const triggerRect = triggerRef.current!.getBoundingClientRect();
    setTooltipPosition({
      top: triggerRect.top + window.scrollY - 8,            // 8px above the trigger
      left: triggerRect.left + triggerRect.width / 2,       // horizontally centred
    });
  };
  const hideTooltip = () => setTooltipPosition(null);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        aria-describedby={tooltipPosition ? tooltipId : undefined}
        tabIndex={0}
      >
        {children}
      </span>
      {tooltipPosition &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            className="tooltip"
            style={{
              position: 'absolute',
              top: tooltipPosition.top,
              left: tooltipPosition.left,
              transform: 'translate(-50%, -100%)',
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
```

**What the names mean:**
- `label`: the tooltip text. `children` is the thing you hover over.
- `triggerRef`: the hovered element, measured to work out where to place the tooltip.
- `tooltipPosition`: `{ top, left }` in page pixels while visible, `null` while hidden. One state value controls both visibility and position.
- `tooltipId`: links the trigger to the tooltip via `aria-describedby`, so screen readers announce the label.
- `triggerRect`: the trigger's size and viewport position from `getBoundingClientRect()`. We add `window.scrollY` because the tooltip uses page coordinates.
- `translate(-50%, -100%)`: shifts the tooltip left by half its width and up by its full height, so it sits centred above the point.
- `tabIndex={0}`: makes the `<span>` focusable, so keyboard users can trigger the tooltip too.

In production, use **Floating UI** (or Radix Tooltip/Popover) for collision detection, flipping and scroll handling.

---

## Example 4: a toast system (Context + portal)

```tsx
type Toast = { id: string; message: string };
const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [activeToasts, setActiveToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string) => {
    const toastId = crypto.randomUUID();
    setActiveToasts((currentToasts) => [...currentToasts, { id: toastId, message }]);
    setTimeout(
      () => setActiveToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId)),
      3000,                                                  // auto-dismiss after 3 seconds
    );
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {createPortal(
        <div className="toast-container" aria-live="polite" role="status">
          {activeToasts.map((toast) => <div key={toast.id} className="toast">{toast.message}</div>)}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

// Anywhere: const showToast = useToast(); showToast('Saved!');
```

**What the names mean:**
- `ToastContext`: shares *one function*, `showToast`, with the whole app. The default `() => {}` does nothing if there's no provider.
- `useToast`: a shortcut hook to grab that function.
- `activeToasts`: the toasts currently on screen.
- `showToast`: adds a toast, then removes it after 3 seconds. `useCallback` keeps it the same function, so consumers don't re-render.
- `toastId`: a unique id so the timer removes exactly *this* toast, even if several are showing.
- `currentToasts`: the latest list, passed into the updater. That matters because the timer fires 3 seconds later, when `activeToasts` from this render would be stale.
- `aria-live="polite"`: screen readers announce new toasts without interrupting the user.

---

## Event bubbling through portals (the #1 portal interview question)

Events from inside a portal bubble up through the **React tree**, not the DOM tree.

```tsx
function Parent() {
  return (
    <div onClick={() => console.log('Parent caught the click!')}>
      <Child />
    </div>
  );
}

function Child() {
  return createPortal(<button>Click me</button>, document.body);
}
```

Clicking the button logs **"Parent caught the click!"**, even though in the DOM the button lives in `<body>`, outside the parent `<div>`.

**Why it matters:**
- ✅ Handy: a parent can handle events from its modal, and context works.
- ⚠️ Surprise: clicking inside a modal can trigger an `onClick` on the card that opened it. Fix with `event.stopPropagation()` on the modal content, or check `event.currentTarget.contains(event.target as Node)`.
- ⚠️ **Native** DOM listeners (`document.addEventListener`) follow the **DOM** tree. A "click outside" hook using `containerRef.current.contains(event.target)` treats clicks inside a portaled dropdown as "outside". Fix: check the portal node too, or keep a ref to it.

## Context works through portals

```tsx
<ThemeContext.Provider value="dark">
  <Modal>…</Modal>   {/* useContext(ThemeContext) inside the portal still returns "dark" */}
</ThemeContext.Provider>
```

---

## Accessibility checklist for portaled modals

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing to the title.
- Move focus into the dialog on open and **restore** it to the trigger on close.
- **Trap focus**: Tab shouldn't escape into the page behind (use `focus-trap-react`, or the `inert` attribute on `#root`).
- Escape closes the dialog.
- Prevent background scroll.
- Hide the background from screen readers: `inert` on the app root (modern), or `aria-hidden="true"`.

```tsx
useEffect(() => {
  if (!isOpen) return;
  const appRootElement = document.getElementById('root')!;
  appRootElement.inert = true;          // page behind can't be focused or clicked, and screen readers skip it
  return () => { appRootElement.inert = false; };
}, [isOpen]);
```

- `appRootElement`: the `<div id="root">` holding the rest of the app. The modal lives *outside* it (in the portal), so it stays usable.
- `inert`: an HTML attribute that disables focus, clicks and screen-reader access for everything inside the element.

### Modern alternative: the native `<dialog>` element

```tsx
function NativeDialog({ isOpen, onClose, children }: { isOpen: boolean; onClose: () => void; children: ReactNode }) {
  const dialogElementRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (isOpen) dialogElementRef.current?.showModal();   // renders in the browser's "top layer", so no portal or z-index needed
    else dialogElementRef.current?.close();
  }, [isOpen]);
  return <dialog ref={dialogElementRef} onClose={onClose}>{children}</dialog>;
}
```

- `dialogElementRef`: the real `<dialog>` element. React can't open it with a prop, so we call its `showModal()` and `close()` methods.
- `onClose`: the browser fires it when the dialog closes (Escape, for example), so the parent can set `isOpen` back to `false`.

`showModal()` gives you the top layer, a backdrop (`::backdrop`), Escape to close and focus handling for free. The newer **Popover API** (`popover` attribute) does the same for menus and tooltips. Say: "Portals are still common because libraries like Radix use them, but the top layer is reducing the need."

---

## Testing portals with React Testing Library

`screen` queries the whole `document.body`, so portaled content is found automatically:

```tsx
it('opens and closes the modal', async () => {
  const user = userEvent.setup();
  render(<DeleteButton />);
  await user.click(screen.getByRole('button', { name: /delete/i }));
  expect(screen.getByRole('dialog', { name: /delete item/i })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
```

- `user`: a simulated user that clicks and types like a real person.
- `getByRole('dialog', { name: /delete item/i })`: finds the dialog by its role and accessible name (the title linked by `aria-labelledby`).
- `user.keyboard('{Escape}')`: presses the Escape key.
- `queryByRole`: returns `null` instead of throwing, which is what you want when checking that something is gone.

If the portal targets `#modal-root`, create that element in the test setup (or have the component fall back to `document.body`). Don't use `container.querySelector`: the portal isn't inside `container`.

---

## Interview questions on portals

**Q: What is a portal and when would you use it?**
It renders children into a DOM node outside the parent hierarchy while keeping them in the React tree. I'd use it for modals, tooltips, dropdowns and toasts, to escape `overflow: hidden` and stacking-context (`z-index`) problems.

**Q: How do events behave in a portal?**
They bubble through the **React component tree**, so a parent's `onClick` fires for clicks inside its portaled child, even though the DOM node lives elsewhere. Native `addEventListener` handlers follow the DOM tree.

**Q: Does context work inside a portal?**
Yes. A portal is still a React child, so it receives context, props and state updates normally.

**Q: How do you make portals work with SSR?**
`document` doesn't exist on the server. Render the portal only after mount (a `useEffect` that sets a mounted flag or the container element), or render `null` on the server.

**Q: Why might a "click outside to close" hook break with portals?**
It usually checks `ref.current.contains(event.target)` with a native listener. That uses the DOM tree, where the portaled menu is outside the ref. Fix: include the portal element's ref in the check, or rely on React's synthetic events.

**Q: Portal vs native `<dialog>`?**
`<dialog>.showModal()` uses the browser's top layer, which solves z-index and stacking without a portal and comes with Escape handling and focus behaviour. Portals work in all setups and give full control. Many libraries (Radix, MUI) still use portals.

**Q: Can you have multiple portals?**
Yes, as many as you like, even nested. Each is just a child in the React tree. React also lets you pass a `key` as the third argument when you render portals in a list.
