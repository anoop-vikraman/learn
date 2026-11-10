# 05 · TypeScript with React

Use `.tsx` for files containing JSX. React's types live in the `@types/react` and `@types/react-dom` packages (`npm install -D @types/react @types/react-dom`). The Vite `react-ts` template installs and configures them for you.

## 1. Typing props

```tsx
interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';   // optional, with a fixed set of values
  disabled?: boolean;
  onClick: () => void;
}

function Button({ label, variant = 'primary', disabled = false, onClick }: ButtonProps) {
  return (
    <button className={`btn btn-${variant}`} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}

<Button label="Save" onClick={() => save()} />               // ✅
<Button label="Save" variant="huge" onClick={save} />         // ❌ '"huge"' is not assignable
<Button variant="primary" onClick={save} />                   // ❌ Property 'label' is missing
```

### Should I use `React.FC`?

```tsx
const Button: React.FC<ButtonProps> = ({ label }) => <button>{label}</button>;
```

It works, but the common recommendation is to **type the props parameter directly** (as above): it's simpler, works well with generics and default values, and makes the return type inferred. Both are acceptable; be consistent.

### Return type

Usually inferred. If you write it: `function Button(props: ButtonProps): React.ReactElement` or `JSX.Element`. Components can also return `null`.

---

## 2. Typing `children`

```tsx
import type { ReactNode, PropsWithChildren } from 'react';

interface CardProps {
  title: string;
  children: ReactNode;            // anything React can render: JSX, string, number, array, null
}

function Card({ title, children }: CardProps) {
  return <section><h2>{title}</h2>{children}</section>;
}

// Shortcut: adds children?: ReactNode
function Panel({ title, children }: PropsWithChildren<{ title: string }>) { /* ... */ }
```

| Type | Accepts | Use for |
| --- | --- | --- |
| `ReactNode` | JSX, string, number, boolean, null, undefined, arrays | **`children` and most "renderable" props** |
| `ReactElement` / `JSX.Element` | only JSX elements | When you need exactly one element (e.g. to `cloneElement`) |
| `string` | text only | Labels, titles |
| `(data: T) => ReactNode` | function | Render props |

---

## 3. Extending native HTML element props

Make your component accept all normal attributes (`type`, `aria-*`, `onFocus`…) of the element it wraps:

```tsx
import type { ComponentProps } from 'react';

interface InputProps extends ComponentProps<'input'> {
  label: string;
  error?: string;
}

function Input({ label, error, id, ...rest }: InputProps) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={!!error} {...rest} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

<Input id="email" label="Email" type="email" placeholder="you@x.com" required />
```

Related types:
- `ComponentProps<'button'>`: all props of `<button>` (in React 19 this includes `ref`).
- `ComponentPropsWithoutRef<'button'>` / `ComponentPropsWithRef<'button'>`: explicit about `ref`.
- `ComponentProps<typeof MyComponent>`: props of another component.
- `Omit<ComponentProps<'button'>, 'type'>`: remove some to replace them.

---

## 4. Typing state

```tsx
const [count, setCount] = useState(0);                     // inferred: number
const [name, setName] = useState('');                      // inferred: string

// When the initial value doesn't show the full type, pass a type argument
const [user, setUser] = useState<User | null>(null);       // starts empty
const [todos, setTodos] = useState<Todo[]>([]);            // ⚠️ useState([]) would be never[]
const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

user.name;            // ❌ 'user' is possibly 'null'
user?.name;           // ✅
if (user) user.name;  // ✅

// Discriminated union for request state
type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: User[] };
const [state, setState] = useState<State>({ status: 'loading' });
```

The setter type is `React.Dispatch<React.SetStateAction<T>>`. You need it when passing a setter as a prop:

```tsx
interface FilterProps {
  value: string;
  onChange: React.Dispatch<React.SetStateAction<string>>;   // or simply: (value: string) => void
}
```

Prefer the simpler `(value: string) => void` for props, so the child doesn't depend on the parent using `useState`.

---

## 5. Typing events

```tsx
import type { ChangeEvent, FormEvent, MouseEvent, KeyboardEvent } from 'react';

function Form() {
  const [email, setEmail] = useState('');

  // Inline handlers: the event type is inferred automatically
  // <input onChange={(e) => setEmail(e.target.value)} />

  // Separate handlers need an explicit type
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value);

  const handleSelect = (e: ChangeEvent<HTMLSelectElement>) => console.log(e.target.value);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
  };

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => console.log(e.clientX);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') console.log('enter');
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onChange={handleChange} onKeyDown={handleKeyDown} />
      <button onClick={handleClick}>Send</button>
    </form>
  );
}
```

| Event | Type | Element type examples |
| --- | --- | --- |
| `onChange` (input/textarea/select) | `ChangeEvent<T>` | `HTMLInputElement`, `HTMLTextAreaElement`, `HTMLSelectElement` |
| `onSubmit` | `FormEvent<HTMLFormElement>` (some newer typings prefer `SubmitEvent`) | |
| `onClick`, `onMouseEnter` | `MouseEvent<T>` | `HTMLButtonElement`, `HTMLDivElement` |
| `onKeyDown` | `KeyboardEvent<T>` | |
| `onFocus`, `onBlur` | `FocusEvent<T>` | |
| `onDrag…` | `DragEvent<T>` | |
| Any | `SyntheticEvent<T>` | |

Handler type shortcuts for props: `React.ChangeEventHandler<HTMLInputElement>`, `React.MouseEventHandler<HTMLButtonElement>`.

**Tip:** don't memorize these. Write the handler inline, hover over `e`, and copy the type.

⚠️ `e.target` vs `e.currentTarget`: `currentTarget` is typed as the element the handler is on; `target` is typed more loosely (`EventTarget`) because it could be a child.

---

## 6. Typing refs

```tsx
// DOM ref: element type + null initial value
const inputRef = useRef<HTMLInputElement>(null);
useEffect(() => {
  inputRef.current?.focus();          // current: HTMLInputElement | null → use ?.
}, []);
<input ref={inputRef} />

// Mutable value ref
const timerRef = useRef<number | null>(null);
timerRef.current = window.setTimeout(() => {}, 1000);   // window.setTimeout returns number
// (In Node typings, setTimeout returns NodeJS.Timeout → use ReturnType<typeof setTimeout>)

const renderCount = useRef(0);        // inferred: MutableRefObject<number> / RefObject<number>
renderCount.current++;
```

### Passing a ref to your component

```tsx
// React 19: ref is a regular prop
interface TextInputProps extends ComponentProps<'input'> { label: string }
function TextInput({ label, ref, ...rest }: TextInputProps) {
  return <label>{label}<input ref={ref} {...rest} /></label>;
}

// React 18: forwardRef<RefType, PropsType>
const TextInput18 = forwardRef<HTMLInputElement, { label: string }>(function TextInput18({ label }, ref) {
  return <label>{label}<input ref={ref} /></label>;
});
```

---

## 7. Typing context

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react';

interface AuthContextValue {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
}

// null default + a custom hook that throws = no need to fake a default value
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const value: AuthContextValue = { user, login: setUser, logout: () => setUser(null) };
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;                          // narrowed: AuthContextValue (not null)
}
```

---

## 8. Typing `useReducer`

```tsx
interface Todo { id: string; text: string; done: boolean }

type State = { todos: Todo[]; filter: 'all' | 'active' | 'done' };

type Action =
  | { type: 'added'; text: string }
  | { type: 'toggled'; id: string }
  | { type: 'deleted'; id: string }
  | { type: 'filterChanged'; filter: State['filter'] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'added':
      return { ...state, todos: [...state.todos, { id: crypto.randomUUID(), text: action.text, done: false }] };
    case 'toggled':
      return { ...state, todos: state.todos.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t)) };
    case 'deleted':
      return { ...state, todos: state.todos.filter((t) => t.id !== action.id) };
    case 'filterChanged':
      return { ...state, filter: action.filter };
    default: {
      const _never: never = action;      // exhaustiveness check
      return state;
    }
  }
}

const [state, dispatch] = useReducer(reducer, { todos: [], filter: 'all' });
dispatch({ type: 'added', text: 'Learn TS' });   // ✅
dispatch({ type: 'added' });                     // ❌ Property 'text' is missing
dispatch({ type: 'renamed' });                   // ❌ not a valid action type
```

The discriminated union of actions gives you autocomplete and errors for wrong payloads.

---

## 9. Typing custom hooks

```tsx
// Return a tuple: add `as const`, otherwise TS infers (boolean | (() => void))[]
function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = () => setOn((v) => !v);
  return [on, toggle] as const;            // readonly [boolean, () => void]
}

// Generic hook
function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    const saved = localStorage.getItem(key);
    return saved !== null ? (JSON.parse(saved) as T) : initialValue;
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}

const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light');

// Object return (no as const needed)
function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  // ... fetch logic
  return { data, error, loading };
}

const { data: users } = useFetch<User[]>('/api/users');   // users: User[] | null
```

---

## 10. Generic components

A component that works with any item type while keeping types connected:

```tsx
interface ListProps<T> {
  items: T[];
  getKey: (item: T) => string | number;
  renderItem: (item: T) => React.ReactNode;
  emptyText?: string;
}

function List<T>({ items, getKey, renderItem, emptyText = 'Nothing here' }: ListProps<T>) {
  if (items.length === 0) return <p>{emptyText}</p>;
  return <ul>{items.map((item) => <li key={getKey(item)}>{renderItem(item)}</li>)}</ul>;
}

<List
  items={users}
  getKey={(u) => u.id}               // u is inferred as User
  renderItem={(u) => <strong>{u.name}</strong>}
/>
```

Arrow-function version in `.tsx`: `const List = <T,>(props: ListProps<T>) => { ... }` (the comma stops TS reading `<T>` as JSX).

### Generic select

```tsx
interface SelectProps<T extends string> {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}

function Select<T extends string>({ value, options, onChange }: SelectProps<T>) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

const SIZES = ['sm', 'md', 'lg'] as const;
const [size, setSize] = useState<(typeof SIZES)[number]>('md');
<Select value={size} options={SIZES} onChange={setSize} />   // onChange receives 'sm' | 'md' | 'lg'
```

---

## 11. Props patterns with unions

### Variant props that require different fields

```tsx
type AlertProps =
  | { kind: 'info'; message: string }
  | { kind: 'confirm'; message: string; onConfirm: () => void; onCancel: () => void };

function Alert(props: AlertProps) {
  if (props.kind === 'confirm') {
    return <div>{props.message}<button onClick={props.onConfirm}>OK</button><button onClick={props.onCancel}>Cancel</button></div>;
  }
  return <div>{props.message}</div>;
}

<Alert kind="confirm" message="Delete?" />   // ❌ missing onConfirm and onCancel
```

⚠️ Don't destructure discriminated-union props in the parameter list: narrowing works on `props.kind`, and destructured variables lose the link in some cases.

### Either/or props

```tsx
type IconButtonProps =
  | { icon: ReactNode; label: string; 'aria-label'?: never }
  | { icon: ReactNode; label?: never; 'aria-label': string };   // must have a label OR aria-label
```

---

## 12. Typing API data

```tsx
interface Product { id: number; title: string; price: number }

async function getProducts(): Promise<Product[]> {
  const res = await fetch('/api/products');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();                 // ⚠️ trusted, not checked: use Zod for untrusted APIs
}

// With TanStack Query: data is inferred from queryFn
const { data, isPending, error } = useQuery({ queryKey: ['products'], queryFn: getProducts });
// data: Product[] | undefined
```

---

## 13. Quick reference of React types

| Need | Type |
| --- | --- |
| Children / renderable prop | `React.ReactNode` |
| One JSX element | `React.ReactElement` |
| Inline style prop | `React.CSSProperties` |
| Props of an HTML element | `React.ComponentProps<'button'>` |
| Props of a component | `React.ComponentProps<typeof MyComp>` |
| A component as a prop | `React.ComponentType<Props>` (or `React.ElementType` for "any tag or component") |
| State setter | `React.Dispatch<React.SetStateAction<T>>` |
| DOM ref | `useRef<HTMLDivElement>(null)` → `React.RefObject<HTMLDivElement \| null>` |
| Ref prop | `React.Ref<HTMLInputElement>` |
| Events | `React.ChangeEvent<HTMLInputElement>`, `React.FormEvent<HTMLFormElement>`, `React.MouseEvent<HTMLButtonElement>`, `React.KeyboardEvent<…>` |
| Event handler props | `React.MouseEventHandler<HTMLButtonElement>`, `React.ChangeEventHandler<HTMLInputElement>` |

---

## 14. Exercises

1. Convert the to-do app from the React basics into TypeScript: `Todo` type, typed state, typed handlers.
2. Build an `Input` component that extends `ComponentProps<'input'>` and adds `label` and `error`.
3. Create a typed `ThemeContext` with a `useTheme` hook that throws outside the provider.
4. Rewrite the cart reducer with a discriminated `Action` union and an exhaustiveness check.
5. Build a generic `Table<T>` with `columns: { key: keyof T; header: string }[]` and `rows: T[]`.
6. Write `useFetch<T>` returning a discriminated union state.
