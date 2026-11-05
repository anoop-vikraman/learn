# React machine-coding round: complete solutions

Practise typing each one in **15–25 minutes**. Before coding, say: "Let me clarify requirements… I'll start with state shape, then UI, then edge cases (empty, loading, error, accessibility)."

Under each solution, **What the names mean** explains every variable in a line or two. Clear names matter in a live round: the interviewer reads your code as you type it.

---

## 1. Todo list with filter (the most common)

```tsx
import { useMemo, useState, FormEvent } from 'react';

type Todo = { id: string; text: string; isDone: boolean };
type TodoFilter = 'all' | 'active' | 'done';

export default function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [activeFilter, setActiveFilter] = useState<TodoFilter>('all');

  const addTodo = (event: FormEvent) => {
    event.preventDefault();
    const trimmedText = newTodoText.trim();
    if (!trimmedText) return;
    setTodos((previousTodos) => [...previousTodos, { id: crypto.randomUUID(), text: trimmedText, isDone: false }]);
    setNewTodoText('');
  };

  const toggleTodo = (todoId: string) =>
    setTodos((previousTodos) =>
      previousTodos.map((todo) => (todo.id === todoId ? { ...todo, isDone: !todo.isDone } : todo)),
    );

  const deleteTodo = (todoId: string) =>
    setTodos((previousTodos) => previousTodos.filter((todo) => todo.id !== todoId));

  // derived state: compute it, don't store it
  const visibleTodos = useMemo(
    () =>
      todos.filter((todo) => {
        if (activeFilter === 'done') return todo.isDone;
        if (activeFilter === 'active') return !todo.isDone;
        return true;                                    // 'all'
      }),
    [todos, activeFilter],
  );
  const remainingCount = todos.filter((todo) => !todo.isDone).length;

  return (
    <section>
      <form onSubmit={addTodo}>
        <label htmlFor="new-todo">New todo</label>
        <input id="new-todo" value={newTodoText} onChange={(event) => setNewTodoText(event.target.value)} />
        <button type="submit">Add</button>
      </form>

      <div role="group" aria-label="Filter">
        {(['all', 'active', 'done'] as const).map((filterOption) => (
          <button
            key={filterOption}
            aria-pressed={activeFilter === filterOption}
            onClick={() => setActiveFilter(filterOption)}
          >
            {filterOption}
          </button>
        ))}
      </div>

      {visibleTodos.length === 0 ? (
        <p>Nothing here.</p>
      ) : (
        <ul>
          {visibleTodos.map((todo) => (
            <li key={todo.id}>
              <label>
                <input type="checkbox" checked={todo.isDone} onChange={() => toggleTodo(todo.id)} />
                <span style={{ textDecoration: todo.isDone ? 'line-through' : 'none' }}>{todo.text}</span>
              </label>
              <button onClick={() => deleteTodo(todo.id)} aria-label={`Delete ${todo.text}`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <p>{remainingCount} item(s) left</p>
    </section>
  );
}
```

**What the names mean:**
- `todos`: the single source of truth, the full list of todo items.
- `newTodoText`: what's typed in the "New todo" input (a controlled input).
- `activeFilter`: which filter button is selected: `'all'`, `'active'` or `'done'`.
- `trimmedText`: the input without surrounding spaces, so blank todos are rejected.
- `previousTodos`: the latest list, passed into the functional update. That's safer than reading `todos` directly.
- `toggleTodo` / `deleteTodo`: create a *new* array (`map`/`filter`) instead of mutating, so React sees the change.
- `visibleTodos`: **derived** from `todos` + `activeFilter`. It's computed during render, never stored in state.
- `remainingCount`: how many todos are not done yet.
- `filterOption`: one of the three filter names, used to render each filter button.
- `aria-pressed`: tells screen readers which filter button is currently on.

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

- `user`: a simulated user from `@testing-library/user-event`; it types and clicks like a real person.
- `getByLabelText` / `getByRole`: find elements the way a user or screen reader would, not by CSS class.
- `queryByText`: returns `null` instead of throwing, which is the right query when checking that something is *gone*.

---

## 2. Autocomplete / typeahead with debounce, keyboard nav, abort

```tsx
export function Autocomplete({ onSelect }: { onSelect: (selectedValue: string) => void }) {
  const [inputText, setInputText] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isListOpen, setIsListOpen] = useState(false);
  const debouncedInputText = useDebounce(inputText, 300);

  useEffect(() => {
    if (debouncedInputText.length < 2) { setSuggestions([]); return; }
    const abortController = new AbortController();
    fetch(`/api/countries?q=${encodeURIComponent(debouncedInputText)}`, { signal: abortController.signal })
      .then((response) => response.json())
      .then((countryNames: string[]) => {
        setSuggestions(countryNames);
        setIsListOpen(true);
        setHighlightedIndex(-1);
      })
      .catch((fetchError) => { if (fetchError.name !== 'AbortError') console.error(fetchError); });
    return () => abortController.abort();
  }, [debouncedInputText]);

  const selectSuggestion = (suggestion: string) => {
    setInputText(suggestion);
    setIsListOpen(false);
    onSelect(suggestion);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isListOpen) return;
    const lastIndex = suggestions.length - 1;
    if (event.key === 'ArrowDown') {
      event.preventDefault();                                        // stop the cursor jumping to the end
      setHighlightedIndex((currentIndex) => Math.min(currentIndex + 1, lastIndex));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((currentIndex) => Math.max(currentIndex - 1, 0));
    }
    if (event.key === 'Enter' && highlightedIndex >= 0) selectSuggestion(suggestions[highlightedIndex]);
    if (event.key === 'Escape') setIsListOpen(false);
  };

  return (
    <div className="autocomplete">
      <input
        role="combobox"
        aria-expanded={isListOpen}
        aria-controls="suggestion-list"
        aria-activedescendant={highlightedIndex >= 0 ? `suggestion-${highlightedIndex}` : undefined}
        value={inputText}
        onChange={(event) => setInputText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {isListOpen && suggestions.length > 0 && (
        <ul id="suggestion-list" role="listbox">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion}
              id={`suggestion-${index}`}
              role="option"
              aria-selected={index === highlightedIndex}
              onMouseDown={() => selectSuggestion(suggestion)}  /* mousedown fires before input blur */
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**What the names mean:**
- `onSelect`: a callback from the parent, called with the value the user picked.
- `inputText`: exactly what's in the text box, updated on every keystroke.
- `debouncedInputText`: `inputText` after the user pauses for 300 ms. Only this triggers a fetch.
- `suggestions`: the list of matches returned by the API.
- `highlightedIndex`: which suggestion the arrow keys are on; `-1` means none.
- `isListOpen`: whether the dropdown is shown. Escape or selecting closes it.
- `abortController`: cancels the previous request when the user keeps typing, so old results never overwrite new ones.
- `selectSuggestion`: fills the input, closes the list and notifies the parent.
- `lastIndex`: stops the highlight moving past the last item.
- `aria-activedescendant`: tells screen readers which option is highlighted while focus stays in the input.

Points to mention: debounce, abort stale requests, keyboard support, ARIA combobox, a cache (`Map` of query → results) as a bonus, and highlighting the matched text.

---

## 3. Compound Tabs component (Context + composition)

```tsx
import { createContext, useContext, useId, useState, ReactNode } from 'react';

type TabsContextValue = {
  selectedTab: string;
  selectTab: (tabValue: string) => void;
  idPrefix: string;
};
const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const tabsContext = useContext(TabsContext);
  if (!tabsContext) throw new Error('Tabs.* must be used inside <Tabs>');
  return tabsContext;
}

export function Tabs({ defaultValue, children }: { defaultValue: string; children: ReactNode }) {
  const [selectedTab, selectTab] = useState(defaultValue);
  const idPrefix = useId();
  return <TabsContext.Provider value={{ selectedTab, selectTab, idPrefix }}>{children}</TabsContext.Provider>;
}

Tabs.List = function TabList({ children }: { children: ReactNode }) {
  return <div role="tablist">{children}</div>;
};

Tabs.Trigger = function Tab({ value, children }: { value: string; children: ReactNode }) {
  const { selectedTab, selectTab, idPrefix } = useTabsContext();
  const isSelected = selectedTab === value;
  return (
    <button
      role="tab"
      id={`${idPrefix}-tab-${value}`}
      aria-selected={isSelected}
      aria-controls={`${idPrefix}-panel-${value}`}
      tabIndex={isSelected ? 0 : -1}
      onClick={() => selectTab(value)}
    >
      {children}
    </button>
  );
};

Tabs.Panel = function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  const { selectedTab, idPrefix } = useTabsContext();
  if (selectedTab !== value) return null;
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${value}`} aria-labelledby={`${idPrefix}-tab-${value}`}>
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

**What the names mean:**
- `TabsContext`: shares state between `<Tabs>` and its sub-components without passing props by hand.
- `selectedTab`: the `value` of the tab that's currently open.
- `selectTab`: switches the open tab (it's the `useState` setter).
- `idPrefix`: a unique id from `useId`, so two `<Tabs>` on one page never clash on element ids.
- `useTabsContext`: reads the context and throws a helpful error if a sub-component is used outside `<Tabs>`.
- `value` (on Trigger/Panel): links a tab button to its panel. They match when the strings are equal.
- `isSelected`: whether this tab is the open one. It drives `aria-selected` and `tabIndex`.
- `tabIndex={isSelected ? 0 : -1}`: only the selected tab is reachable with the Tab key (the "roving tabindex" pattern). A full version adds ArrowLeft/ArrowRight handling to move between tabs; mention it as a next step.

---

## 4. Accordion (single or multiple open)

```tsx
type AccordionItem = { id: string; title: string; content: ReactNode };

export function Accordion({ items, allowMultiple = false }: { items: AccordionItem[]; allowMultiple?: boolean }) {
  const [openItemIds, setOpenItemIds] = useState<Set<string>>(new Set());

  const toggleItem = (itemId: string) =>
    setOpenItemIds((previousOpenIds) => {
      const nextOpenIds = new Set(allowMultiple ? previousOpenIds : []);
      if (previousOpenIds.has(itemId)) nextOpenIds.delete(itemId);
      else nextOpenIds.add(itemId);
      return nextOpenIds;
    });

  return (
    <div>
      {items.map(({ id, title, content }) => {
        const isOpen = openItemIds.has(id);
        return (
          <div key={id}>
            <h3>
              <button aria-expanded={isOpen} aria-controls={`panel-${id}`} onClick={() => toggleItem(id)}>
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

**What the names mean:**
- `items`: the sections to show, each with an `id`, a `title` (the header) and `content` (the body).
- `allowMultiple`: if `false`, opening one section closes the others.
- `openItemIds`: a `Set` of the ids of open sections. Checking it with `.has()` is fast.
- `previousOpenIds` / `nextOpenIds`: we build a **new** `Set`, because mutating the old one wouldn't trigger a re-render. Single mode starts from an empty set, which closes everything else.
- `isOpen`: whether this section is expanded. It drives `aria-expanded` and the `hidden` attribute.

---

## 5. Modal with portal, Escape to close, focus handling

```tsx
import { createPortal } from 'react-dom';

export function Modal({ isOpen, onClose, title, children }: {
  isOpen: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocusedElement = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';            // scroll lock
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previouslyFocusedElement?.focus();                // restore focus
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return createPortal(
    <div className="backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}    // clicks inside don't close
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

**What the names mean:**
- `isOpen`: controlled by the parent. `false` renders nothing.
- `onClose`: the parent's function to close the modal, called by Escape, the backdrop or the Close button.
- `dialogRef`: the dialog box element; we focus it when it opens so keyboard users land inside it.
- `previouslyFocusedElement`: whatever had focus before (usually the button that opened the modal). Focus goes back there on close.
- `handleKeyDown`: closes on Escape. Named so the cleanup can remove the same function.
- `document.body.style.overflow = 'hidden'`: stops the page behind from scrolling.
- `tabIndex={-1}`: makes the `<div>` focusable by code without adding it to the Tab order.
- `createPortal(..., document.body)`: renders the modal at the end of `<body>`, so a parent's `overflow` or `z-index` can't clip it.

Mention: the native `<dialog>` element with `showModal()` gives focus trapping and Escape for free, and in production you'd use Radix/shadcn Dialog for a full focus trap.

---

## 6. Pagination component + paginated table

```tsx
type PageItem = number | 'ellipsis';

function Pagination({ currentPage, totalPages, onPageChange }: {
  currentPage: number; totalPages: number; onPageChange: (pageNumber: number) => void;
}) {
  const pageItems = useMemo(() => {
    // 1 … 4 5 [6] 7 8 … 20
    const items: PageItem[] = [];
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      const isFirstOrLast = pageNumber === 1 || pageNumber === totalPages;
      const isNearCurrent = Math.abs(pageNumber - currentPage) <= 2;
      if (isFirstOrLast || isNearCurrent) items.push(pageNumber);
      else if (items[items.length - 1] !== 'ellipsis') items.push('ellipsis');
    }
    return items;
  }, [currentPage, totalPages]);

  return (
    <nav aria-label="Pagination">
      <button disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>Prev</button>
      {pageItems.map((pageItem, position) =>
        pageItem === 'ellipsis' ? (
          <span key={`ellipsis-${position}`}>…</span>
        ) : (
          <button
            key={pageItem}
            aria-current={pageItem === currentPage ? 'page' : undefined}
            onClick={() => onPageChange(pageItem)}
          >
            {pageItem}
          </button>
        ),
      )}
      <button disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)}>Next</button>
    </nav>
  );
}

function UsersTable() {
  const [currentPage, setCurrentPage] = useState(1);
  const { data: usersPage, isPending, isError, isPlaceholderData } = useQuery({
    queryKey: ['users', currentPage],
    queryFn: () => fetchUsers(currentPage),
    placeholderData: keepPreviousData,   // no spinner flash between pages
  });
  if (isPending) return <Spinner />;
  if (isError) return <p role="alert">Failed to load</p>;
  return (
    <>
      <table style={{ opacity: isPlaceholderData ? 0.5 : 1 }}>…</table>
      <Pagination currentPage={currentPage} totalPages={usersPage.totalPages} onPageChange={setCurrentPage} />
    </>
  );
}
```

**What the names mean:**
- `currentPage`: the page being shown (1-based).
- `totalPages`: how many pages exist, from the API response.
- `onPageChange`: tells the parent which page to show next.
- `pageItems`: what to render in the bar: page numbers plus `'ellipsis'` markers for skipped ranges.
- `isFirstOrLast` / `isNearCurrent`: always show page 1 and the last page, plus 2 pages either side of the current one.
- `position`: the index in `pageItems`, used only to give the ellipsis spans unique keys (there can be two).
- `aria-current="page"`: tells screen readers which page button is the current page.
- `usersPage`: the API response for one page (rows plus `totalPages`).
- `isPlaceholderData`: `true` while the *previous* page is still shown and the next one loads, so we dim the table.

---

## 7. Star rating (hover preview, keyboard accessible)

```tsx
export function StarRating({ rating, onRatingChange, maxStars = 5 }: {
  rating: number; onRatingChange: (newRating: number) => void; maxStars?: number;
}) {
  const [hoveredStar, setHoveredStar] = useState(0);
  const starNumbers = Array.from({ length: maxStars }, (_, index) => index + 1);   // [1, 2, 3, 4, 5]
  const displayedRating = hoveredStar || rating;   // preview the hover; otherwise show the saved rating

  return (
    <div role="radiogroup" aria-label="Rating" onMouseLeave={() => setHoveredStar(0)}>
      {starNumbers.map((starNumber) => (
        <button
          key={starNumber}
          role="radio"
          aria-checked={rating === starNumber}
          aria-label={`${starNumber} star${starNumber > 1 ? 's' : ''}`}
          onMouseEnter={() => setHoveredStar(starNumber)}
          onClick={() => onRatingChange(starNumber)}
          style={{ color: starNumber <= displayedRating ? 'gold' : 'lightgray' }}
        >
          ★
        </button>
      ))}
    </div>
  );
}
```

**What the names mean:**
- `rating`: the saved rating, controlled by the parent.
- `onRatingChange`: called with the clicked star number.
- `maxStars`: how many stars to draw.
- `hoveredStar`: the star under the mouse; `0` means not hovering.
- `starNumbers`: `[1…maxStars]`, built from `Array.from`. The `_` means "ignore this argument".
- `displayedRating`: how many stars to colour gold. The hover preview wins while hovering.

---

## 8. Countdown / stopwatch (refs, intervals, cleanup)

```tsx
export function Stopwatch() {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const startTimestampRef = useRef(0);

  useEffect(() => {
    if (!isRunning) return;
    startTimestampRef.current = Date.now() - elapsedMs;     // resume from where we paused
    const intervalId = setInterval(() => setElapsedMs(Date.now() - startTimestampRef.current), 10);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  const formatTime = (totalMs: number) => {
    const minutes = String(Math.floor(totalMs / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((totalMs / 1000) % 60)).padStart(2, '0');
    const hundredths = String(Math.floor((totalMs % 1000) / 10)).padStart(2, '0');
    return `${minutes}:${seconds}.${hundredths}`;
  };

  return (
    <div>
      <output>{formatTime(elapsedMs)}</output>
      <button onClick={() => setIsRunning((wasRunning) => !wasRunning)}>{isRunning ? 'Pause' : 'Start'}</button>
      <button onClick={() => { setIsRunning(false); setElapsedMs(0); }}>Reset</button>
    </div>
  );
}
```

**What the names mean:**
- `elapsedMs`: total running time in milliseconds; this is what's displayed.
- `isRunning`: whether the stopwatch is ticking. Start/Pause flips it.
- `startTimestampRef`: the moment the clock "started", adjusted on resume so paused time isn't counted. It's a ref because changing it shouldn't re-render.
- `intervalId`: the 10 ms timer, cleared when paused or unmounted.
- `formatTime`: turns milliseconds into `MM:SS.hh`.
- `minutes` / `seconds` / `hundredths`: each part of the display, padded to 2 digits.
- The eslint comment: `elapsedMs` is read only once, when resuming, on purpose. Adding it to the deps would restart the interval every tick.

Why `Date.now()` instead of counting ticks? `setInterval` drifts, and background tabs are throttled.

---

## 9. Form with validation (controlled, no library)

```tsx
type FormValues = { email: string; password: string };
type FormErrors = Partial<Record<keyof FormValues, string>>;
type FieldName = keyof FormValues;

const validate = (formValues: FormValues): FormErrors => {
  const validationErrors: FormErrors = {};
  if (!/^\S+@\S+\.\S+$/.test(formValues.email)) validationErrors.email = 'Enter a valid email';
  if (formValues.password.length < 8) validationErrors.password = 'At least 8 characters';
  return validationErrors;
};

export function SignupForm({ onSubmit }: { onSubmit: (formValues: FormValues) => Promise<void> }) {
  const [formValues, setFormValues] = useState<FormValues>({ email: '', password: '' });
  const [touchedFields, setTouchedFields] = useState<Partial<Record<FieldName, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const errors = validate(formValues);                        // derived, not stored
  const isFormValid = Object.keys(errors).length === 0;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name: fieldName, value: fieldValue } = event.target;
    setFormValues((previousValues) => ({ ...previousValues, [fieldName]: fieldValue }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouchedFields({ email: true, password: true });   // show every error on submit
    if (!isFormValid) return;
    setIsSubmitting(true);
    try { await onSubmit(formValues); } finally { setIsSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {(['email', 'password'] as const).map((fieldName) => {
        const shouldShowError = touchedFields[fieldName] && errors[fieldName];
        return (
          <div key={fieldName}>
            <label htmlFor={fieldName}>{fieldName}</label>
            <input
              id={fieldName}
              name={fieldName}
              type={fieldName === 'password' ? 'password' : 'email'}
              value={formValues[fieldName]}
              onChange={handleChange}
              onBlur={() => setTouchedFields((previousTouched) => ({ ...previousTouched, [fieldName]: true }))}
              aria-invalid={!!shouldShowError}
              aria-describedby={`${fieldName}-error`}
            />
            {shouldShowError && <span id={`${fieldName}-error`} role="alert">{errors[fieldName]}</span>}
          </div>
        );
      })}
      <button disabled={isSubmitting}>{isSubmitting ? 'Submitting…' : 'Sign up'}</button>
    </form>
  );
}
```

**What the names mean:**
- `FormValues`: the shape of the form data. `FormErrors` has the same keys, each an optional message.
- `validate`: a pure function: values in, errors out. It's easy to unit-test on its own.
- `formValues`: what the user has typed, one object for all fields.
- `touchedFields`: which fields the user has left (blurred). Errors only appear after that, so the form doesn't shout while you type.
- `isSubmitting`: `true` while `onSubmit` is running. It disables the button so you can't double-submit.
- `errors`: **derived** from `formValues` on every render, so it can never be out of sync.
- `isFormValid`: no error messages means the form can be submitted.
- `fieldName` / `fieldValue`: read from the input's `name` and `value`, so one `handleChange` works for every field (`[fieldName]` is a computed key).
- `shouldShowError`: the field was touched *and* has an error.
- `noValidate`: turns off the browser's built-in validation popups so ours are used.

Mention: in real projects, **React Hook Form + Zod** (uncontrolled inputs, so fewer re-renders, plus schema validation shared with TypeScript types).

---

## 10. File/folder explorer (recursive component)

```tsx
type FileTreeNode = { id: string; name: string; children?: FileTreeNode[] };

function TreeNode({ node, depth = 0 }: { node: FileTreeNode; depth?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isFolder = Boolean(node.children);
  return (
    <li style={{ paddingLeft: depth * 16 }}>
      <span onClick={() => isFolder && setIsExpanded((wasExpanded) => !wasExpanded)}>
        {isFolder ? (isExpanded ? '📂' : '📁') : '📄'} {node.name}
      </span>
      {isFolder && isExpanded && (
        <ul>
          {node.children!.map((childNode) => (
            <TreeNode key={childNode.id} node={childNode} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
```

**What the names mean:**
- `FileTreeNode`: one file or folder. Folders have a `children` array; files don't. The type refers to itself, which is what makes it a tree.
- `node`: the file or folder this component draws.
- `depth`: how deeply nested it is, used to indent (16px per level).
- `isExpanded`: whether this folder's contents are shown. Each `TreeNode` has its own state.
- `isFolder`: `true` if `node.children` exists.
- `childNode`: each item inside the folder, rendered by the **same** component. That's the recursion.

---

## 11. Progress bar, traffic light, carousel: quick sketches

```tsx
// Progress bar: clamp + aria
const ProgressBar = ({ progress }: { progress: number }) => {
  const clampedPercent = Math.min(100, Math.max(0, progress));
  return (
    <div role="progressbar" aria-valuenow={clampedPercent} aria-valuemin={0} aria-valuemax={100} className="track">
      <div className="fill" style={{ transform: `scaleX(${clampedPercent / 100})`, transformOrigin: 'left' }} />
    </div>
  );
};

// Traffic light: state machine via config
const LIGHT_SEQUENCE = {
  red:    { nextLight: 'green',  durationMs: 4000 },
  green:  { nextLight: 'yellow', durationMs: 3000 },
  yellow: { nextLight: 'red',    durationMs: 1000 },
} as const;
type LightColor = keyof typeof LIGHT_SEQUENCE;

function TrafficLight() {
  const [currentLight, setCurrentLight] = useState<LightColor>('red');
  useEffect(() => {
    const { nextLight, durationMs } = LIGHT_SEQUENCE[currentLight];
    const timeoutId = setTimeout(() => setCurrentLight(nextLight), durationMs);
    return () => clearTimeout(timeoutId);
  }, [currentLight]);
  return <div className={`light ${currentLight}`} aria-live="polite">{currentLight}</div>;
}

// Carousel: index math with wrap-around
function Carousel({ imageUrls }: { imageUrls: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const moveBy = (step: number) =>
    setCurrentIndex((previousIndex) => (previousIndex + step + imageUrls.length) % imageUrls.length);
  return (
    <div>
      <button onClick={() => moveBy(-1)} aria-label="Previous">‹</button>
      <img src={imageUrls[currentIndex]} alt={`Slide ${currentIndex + 1} of ${imageUrls.length}`} />
      <button onClick={() => moveBy(1)} aria-label="Next">›</button>
    </div>
  );
}
```

**What the names mean:**
- `progress` / `clampedPercent`: the raw value, then the same value forced into 0–100 so bad input can't break the bar. `scaleX` animates more smoothly than changing `width`.
- `LIGHT_SEQUENCE`: a config object. Each light says which light comes next and how long it lasts. Adding a light means editing data, not logic.
- `LightColor`: the type `'red' | 'green' | 'yellow'`, taken from the config keys.
- `currentLight`: which light is on. Each change schedules the next one with `setTimeout`.
- `imageUrls`: the slides to show.
- `currentIndex`: which slide is visible.
- `moveBy(step)`: `-1` goes back, `+1` goes forward. Adding `imageUrls.length` before `%` makes going back from slide 0 wrap to the last slide instead of going negative.

---

## Checklist the interviewer is silently scoring

- [ ] Clarified requirements first
- [ ] Sensible state shape (minimal, derived values computed)
- [ ] Immutable updates, functional `setState`
- [ ] Stable `key`s (ids, not index)
- [ ] Empty, loading and error states handled
- [ ] Cleanup for timers, listeners and fetches
- [ ] Accessibility: labels, roles, keyboard, focus
- [ ] Clear names: `isOpen`, `highlightedIndex`, `visibleTodos`, not `o`, `i`, `arr`
- [ ] Talked about trade-offs and what you'd add with more time (tests, memoization, virtualization)
