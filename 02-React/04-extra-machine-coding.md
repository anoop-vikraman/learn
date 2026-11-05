# React machine-coding round: complete solutions

Practise typing each one in **15–25 minutes**. Before coding, say: "Let me clarify requirements… I'll start with state shape, then UI, then edge cases (empty, loading, error, accessibility)."

---

## 1. Todo list with filter (the most common)

```tsx
import { useMemo, useState, FormEvent } from 'react';

type Todo = { id: string; text: string; done: boolean };
type Filter = 'all' | 'active' | 'done';

export default function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const addTodo = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setTodos((prev) => [...prev, { id: crypto.randomUUID(), text: trimmed, done: false }]);
    setText('');
  };

  const toggle = (id: string) =>
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  const remove = (id: string) => setTodos((prev) => prev.filter((t) => t.id !== id));

  // derived state: compute it, don't store it
  const visible = useMemo(
    () => todos.filter((t) => (filter === 'all' ? true : filter === 'done' ? t.done : !t.done)),
    [todos, filter],
  );
  const remaining = todos.filter((t) => !t.done).length;

  return (
    <section>
      <form onSubmit={addTodo}>
        <label htmlFor="new-todo">New todo</label>
        <input id="new-todo" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Add</button>
      </form>

      <div role="group" aria-label="Filter">
        {(['all', 'active', 'done'] as const).map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p>Nothing here.</p>
      ) : (
        <ul>
          {visible.map((t) => (
            <li key={t.id}>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />
                <span style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
              </label>
              <button onClick={() => remove(t.id)} aria-label={`Delete ${t.text}`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <p>{remaining} item(s) left</p>
    </section>
  );
}
```

**Test for it (RTL):**

```tsx
it('adds, completes and filters todos', async () => {
  const user = userEvent.setup();
  render(<TodoApp />);
  await user.type(screen.getByLabelText(/new todo/i), 'Buy milk');
  await user.click(screen.getByRole('button', { name: /add/i }));
  expect(screen.getByText('Buy milk')).toBeInTheDocument();

  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'active' }));
  expect(screen.queryByText('Buy milk')).not.toBeInTheDocument();
});
```

---

## 2. Autocomplete / typeahead with debounce, keyboard nav, abort

```tsx
export function Autocomplete({ onSelect }: { onSelect: (v: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(query, 300);

  useEffect(() => {
    if (debounced.length < 2) { setResults([]); return; }
    const controller = new AbortController();
    fetch(`/api/countries?q=${encodeURIComponent(debounced)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: string[]) => { setResults(data); setOpen(true); setActive(-1); })
      .catch((e) => { if (e.name !== 'AbortError') console.error(e); });
    return () => controller.abort();
  }, [debounced]);

  const choose = (value: string) => {
    setQuery(value);
    setOpen(false);
    onSelect(value);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && active >= 0) choose(results[active]);
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="autocomplete">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="ac-list"
        aria-activedescendant={active >= 0 ? `ac-${active}` : undefined}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {open && results.length > 0 && (
        <ul id="ac-list" role="listbox">
          {results.map((r, i) => (
            <li
              key={r}
              id={`ac-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={() => choose(r)}  /* mousedown fires before input blur */
            >
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Points to mention: debounce, abort stale requests, keyboard support, ARIA combobox, a cache (`Map` of query → results) as a bonus, and highlighting the matched text.

---

## 3. Compound Tabs component (Context + composition)

```tsx
import { createContext, useContext, useId, useState, ReactNode } from 'react';

type TabsCtx = { active: string; setActive: (v: string) => void; baseId: string };
const TabsContext = createContext<TabsCtx | null>(null);

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs.* must be used inside <Tabs>');
  return ctx;
}

export function Tabs({ defaultValue, children }: { defaultValue: string; children: ReactNode }) {
  const [active, setActive] = useState(defaultValue);
  const baseId = useId();
  return <TabsContext.Provider value={{ active, setActive, baseId }}>{children}</TabsContext.Provider>;
}

Tabs.List = function TabList({ children }: { children: ReactNode }) {
  return <div role="tablist">{children}</div>;
};

Tabs.Trigger = function Tab({ value, children }: { value: string; children: ReactNode }) {
  const { active, setActive, baseId } = useTabs();
  const selected = active === value;
  return (
    <button
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => setActive(value)}
    >
      {children}
    </button>
  );
};

Tabs.Panel = function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  const { active, baseId } = useTabs();
  if (active !== value) return null;
  return (
    <div role="tabpanel" id={`${baseId}-panel-${value}`} aria-labelledby={`${baseId}-tab-${value}`}>
      {children}
    </div>
  );
};

// Usage
<Tabs defaultValue="profile">
  <Tabs.List>
    <Tabs.Trigger value="profile">Profile</Tabs.Trigger>
    <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Panel value="profile">Profile content</Tabs.Panel>
  <Tabs.Panel value="settings">Settings content</Tabs.Panel>
</Tabs>;
```

---

## 4. Accordion (single or multiple open)

```tsx
type Item = { id: string; title: string; content: ReactNode };

export function Accordion({ items, multiple = false }: { items: Item[]; multiple?: boolean }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(multiple ? prev : []);
      prev.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div>
      {items.map(({ id, title, content }) => {
        const isOpen = openIds.has(id);
        return (
          <div key={id}>
            <h3>
              <button aria-expanded={isOpen} aria-controls={`panel-${id}`} onClick={() => toggle(id)}>
                {title} {isOpen ? '−' : '+'}
              </button>
            </h3>
            <div id={`panel-${id}`} role="region" hidden={!isOpen}>{content}</div>
          </div>
        );
      })}
    </div>
  );
}
```

---

## 5. Modal with portal, Escape to close, focus handling

```tsx
import { createPortal } from 'react-dom';

export function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';            // scroll lock
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus();                       // restore focus
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}            // clicks inside don't close
      >
        <h2 id="modal-title">{title}</h2>
        {children}
        <button onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body,
  );
}
```

Mention: the native `<dialog>` element with `showModal()` gives focus trapping and Escape for free, and in production you'd use Radix/shadcn Dialog for a full focus trap.

---

## 6. Pagination component + paginated table

```tsx
function Pagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (p: number) => void;
}) {
  const pages = useMemo(() => {
    // 1 … 4 5 [6] 7 8 … 20
    const range: (number | '…')[] = [];
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - page) <= 2) range.push(p);
      else if (range[range.length - 1] !== '…') range.push('…');
    }
    return range;
  }, [page, totalPages]);

  return (
    <nav aria-label="Pagination">
      <button disabled={page === 1} onClick={() => onChange(page - 1)}>Prev</button>
      {pages.map((p, i) =>
        p === '…' ? <span key={`gap-${i}`}>…</span> : (
          <button key={p} aria-current={p === page ? 'page' : undefined} onClick={() => onChange(p)}>{p}</button>
        ),
      )}
      <button disabled={page === totalPages} onClick={() => onChange(page + 1)}>Next</button>
    </nav>
  );
}

function UsersTable() {
  const [page, setPage] = useState(1);
  const { data, isPending, isError, isPlaceholderData } = useQuery({
    queryKey: ['users', page],
    queryFn: () => fetchUsers(page),
    placeholderData: keepPreviousData,   // no spinner flash between pages
  });
  if (isPending) return <Spinner />;
  if (isError) return <p role="alert">Failed to load</p>;
  return (
    <>
      <table style={{ opacity: isPlaceholderData ? 0.5 : 1 }}>…</table>
      <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
    </>
  );
}
```

---

## 7. Star rating (hover preview, keyboard accessible)

```tsx
export function StarRating({ value, onChange, max = 5 }: {
  value: number; onChange: (v: number) => void; max?: number;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
          onMouseEnter={() => setHover(star)}
          onClick={() => onChange(star)}
          style={{ color: star <= (hover || value) ? 'gold' : 'lightgray' }}
        >
          ★
        </button>
      ))}
    </div>
  );
}
```

---

## 8. Countdown / stopwatch (refs, intervals, cleanup)

```tsx
export function Stopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now() - elapsed;     // resume from where we paused
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 10);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const format = (ms: number) =>
    `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms / 1000) % 60)).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`;

  return (
    <div>
      <output>{format(elapsed)}</output>
      <button onClick={() => setRunning((r) => !r)}>{running ? 'Pause' : 'Start'}</button>
      <button onClick={() => { setRunning(false); setElapsed(0); }}>Reset</button>
    </div>
  );
}
```

Why `Date.now()` instead of counting ticks? `setInterval` drifts, and background tabs are throttled.

---

## 9. Form with validation (controlled, no library)

```tsx
type Values = { email: string; password: string };
type Errors = Partial<Record<keyof Values, string>>;

const validate = (v: Values): Errors => {
  const e: Errors = {};
  if (!/^\S+@\S+\.\S+$/.test(v.email)) e.email = 'Enter a valid email';
  if (v.password.length < 8) e.password = 'At least 8 characters';
  return e;
};

export function SignupForm({ onSubmit }: { onSubmit: (v: Values) => Promise<void> }) {
  const [values, setValues] = useState<Values>({ email: '', password: '' });
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const errors = validate(values);                        // derived, not stored
  const isValid = Object.keys(errors).length === 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!isValid) return;
    setSubmitting(true);
    try { await onSubmit(values); } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {(['email', 'password'] as const).map((field) => (
        <div key={field}>
          <label htmlFor={field}>{field}</label>
          <input
            id={field}
            name={field}
            type={field === 'password' ? 'password' : 'email'}
            value={values[field]}
            onChange={handleChange}
            onBlur={() => setTouched((t) => ({ ...t, [field]: true }))}
            aria-invalid={!!(touched[field] && errors[field])}
            aria-describedby={`${field}-error`}
          />
          {touched[field] && errors[field] && <span id={`${field}-error`} role="alert">{errors[field]}</span>}
        </div>
      ))}
      <button disabled={submitting}>{submitting ? 'Submitting…' : 'Sign up'}</button>
    </form>
  );
}
```

Mention: in real projects, **React Hook Form + Zod** (uncontrolled inputs, so fewer re-renders, plus schema validation shared with TypeScript types).

---

## 10. File/folder explorer (recursive component)

```tsx
type Node = { id: string; name: string; children?: Node[] };

function TreeNode({ node, depth = 0 }: { node: Node; depth?: number }) {
  const [open, setOpen] = useState(false);
  const isFolder = !!node.children;
  return (
    <li style={{ paddingLeft: depth * 16 }}>
      <span onClick={() => isFolder && setOpen((o) => !o)}>
        {isFolder ? (open ? '📂' : '📁') : '📄'} {node.name}
      </span>
      {isFolder && open && (
        <ul>{node.children!.map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} />)}</ul>
      )}
    </li>
  );
}
```

---

## 11. Progress bar, traffic light, carousel: quick sketches

```tsx
// Progress bar: clamp + aria
const ProgressBar = ({ value }: { value: number }) => {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="track">
      <div className="fill" style={{ transform: `scaleX(${pct / 100})`, transformOrigin: 'left' }} />
    </div>
  );
};

// Traffic light: state machine via config
const LIGHTS = { red: { next: 'green', ms: 4000 }, green: { next: 'yellow', ms: 3000 }, yellow: { next: 'red', ms: 1000 } } as const;
function TrafficLight() {
  const [light, setLight] = useState<keyof typeof LIGHTS>('red');
  useEffect(() => {
    const id = setTimeout(() => setLight(LIGHTS[light].next), LIGHTS[light].ms);
    return () => clearTimeout(id);
  }, [light]);
  return <div className={`light ${light}`} aria-live="polite">{light}</div>;
}

// Carousel: index math with wrap-around
function Carousel({ images }: { images: string[] }) {
  const [i, setI] = useState(0);
  const go = (d: number) => setI((prev) => (prev + d + images.length) % images.length);
  return (
    <div>
      <button onClick={() => go(-1)} aria-label="Previous">‹</button>
      <img src={images[i]} alt={`Slide ${i + 1} of ${images.length}`} />
      <button onClick={() => go(1)} aria-label="Next">›</button>
    </div>
  );
}
```

---

## Checklist the interviewer is silently scoring

- [ ] Clarified requirements first
- [ ] Sensible state shape (minimal, derived values computed)
- [ ] Immutable updates, functional `setState`
- [ ] Stable `key`s (ids, not index)
- [ ] Empty, loading and error states handled
- [ ] Cleanup for timers, listeners and fetches
- [ ] Accessibility: labels, roles, keyboard, focus
- [ ] Talked about trade-offs and what you'd add with more time (tests, memoization, virtualization)
