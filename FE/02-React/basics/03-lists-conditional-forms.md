# 03 · Lists, conditional rendering and forms

## 1. Rendering lists with `map`

```jsx
const fruits = ['Apple', 'Banana', 'Cherry'];

function FruitList() {
  return (
    <ul>
      {fruits.map((fruit) => (
        <li key={fruit}>{fruit}</li>
      ))}
    </ul>
  );
}
```

### Lists of objects

```jsx
const users = [
  { id: 101, name: 'Anoop', role: 'Dev' },
  { id: 102, name: 'Bina', role: 'Design' },
];

function UserList() {
  return (
    <ul>
      {users.map((user) => (
        <UserRow key={user.id} user={user} />
      ))}
    </ul>
  );
}

function UserRow({ user }) {
  return <li>{user.name}: {user.role}</li>;
}
```

### Filter and sort before rendering

```jsx
const visible = users
  .filter((u) => u.name.toLowerCase().includes(search.toLowerCase()))
  .toSorted((a, b) => a.name.localeCompare(b.name));

return (
  <ul>
    {visible.map((u) => <UserRow key={u.id} user={u} />)}
  </ul>
);
```

### Empty state

```jsx
{visible.length === 0 ? <p>No users found.</p> : <ul>{visible.map(/* ... */)}</ul>}
```

---

## 2. Keys

Every item in a list needs a **`key`** prop: a string or number that is **unique among siblings** and **stable** (the same item keeps the same key across renders). React uses keys to match items between renders, so it knows which item was added, removed or moved.

```jsx
{todos.map((todo) => <TodoItem key={todo.id} todo={todo} />)}   // ✅ ID from the data
```

### Rules

- ✅ Use a stable ID from your data (database ID, or `crypto.randomUUID()` **created when the item is created**).
- ❌ Don't generate keys during render: `key={Math.random()}` or `key={crypto.randomUUID()}` gives a new key every render, so React destroys and recreates every item (slow, and inputs lose focus and state).
- ⚠️ **Index as key** (`key={index}`) is only OK if the list **never** reorders, filters, or has items inserted/removed. Otherwise state and input values end up attached to the wrong items.
- The key goes on the **outermost element returned by `map`**, not inside the child component.
- Keys don't need to be globally unique, only among siblings.
- `key` isn't passed to the component as a prop: `props.key` is `undefined`. Pass `id` separately if the child needs it.
- Fragments with keys need the long form: `<Fragment key={item.id}>...</Fragment>`.

Missing keys cause the console warning "Each child in a list should have a unique key prop".

**Bonus trick:** changing a component's `key` **resets** it (React treats it as a new component):

```jsx
<ProfileForm key={userId} userId={userId} />   // form state resets when switching users
```

---

## 3. Conditional rendering

### if / else before the return

```jsx
function Dashboard({ user, isLoading, error }) {
  if (isLoading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!user) return <LoginPrompt />;
  return <h1>Welcome, {user.name}</h1>;
}
```

### Ternary `? :` inside JSX: either/or

```jsx
<p>{isLoggedIn ? 'Welcome back!' : 'Please sign in'}</p>
{isEditing ? <EditForm /> : <ProfileView />}
```

### `&&`: show something or nothing

```jsx
{hasError && <p className="error">Something went wrong</p>}
{cart.length > 0 && <CartBadge count={cart.length} />}
```

⚠️ **The `0` bug:** if the left side is the number `0`, React renders `0`:

```jsx
{messages.length && <Badge />}        // ❌ shows "0" when there are no messages
{messages.length > 0 && <Badge />}    // ✅
{!!messages.length && <Badge />}      // ✅
```

### Return `null` to render nothing

```jsx
function Warning({ show, text }) {
  if (!show) return null;
  return <div className="warning">{text}</div>;
}
```

### Lookup object for many cases

```jsx
const statusIcon = { success: '✅', error: '❌', pending: '⏳' };
<span>{statusIcon[status] ?? '❔'}</span>

const views = { list: <ListView />, grid: <GridView />, map: <MapView /> };
return views[viewMode];
```

### Conditional classes and styles

```jsx
<li className={todo.done ? 'todo done' : 'todo'}>
<li className={`todo ${todo.done ? 'done' : ''}`}>
<button className={['btn', isActive && 'active', size].filter(Boolean).join(' ')}>
<div style={{ opacity: isDisabled ? 0.5 : 1 }}>
```

(The tiny `clsx` library makes this neater: `clsx('btn', { active: isActive })`.)

---

## 4. Forms: controlled inputs

A **controlled input** gets its value from React state and updates that state on every change. React state is the single source of truth.

```jsx
function NameForm() {
  const [name, setName] = useState('');

  return (
    <input
      value={name}                              // state → input
      onChange={(e) => setName(e.target.value)} // input → state
    />
  );
}
```

⚠️ If you set `value` without `onChange`, the input becomes read-only (React warns you). For a read-only field, use `readOnly`; for a starting value without control, use `defaultValue`.

### Different input types

```jsx
// Text, email, password, textarea: use value
<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
<textarea value={bio} onChange={(e) => setBio(e.target.value)} />       {/* value, not children */}

// Number: e.target.value is ALWAYS a string
<input type="number" value={age} onChange={(e) => setAge(e.target.value === '' ? '' : Number(e.target.value))} />

// Checkbox: use checked + e.target.checked
<input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />

// Radio buttons: same name, checked compares the value
{['small', 'medium', 'large'].map((size) => (
  <label key={size}>
    <input type="radio" name="size" value={size} checked={selected === size} onChange={(e) => setSelected(e.target.value)} />
    {size}
  </label>
))}

// Select: value on the <select>, not selected on <option>
<select value={country} onChange={(e) => setCountry(e.target.value)}>
  <option value="">Choose…</option>
  <option value="in">India</option>
  <option value="us">USA</option>
</select>
```

### One state object for the whole form

```jsx
function SignupForm() {
  const [form, setForm] = useState({ name: '', email: '', password: '', agree: false });

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));   // computed key
  }

  return (
    <form>
      <input name="name" value={form.name} onChange={handleChange} />
      <input name="email" type="email" value={form.email} onChange={handleChange} />
      <input name="password" type="password" value={form.password} onChange={handleChange} />
      <label>
        <input name="agree" type="checkbox" checked={form.agree} onChange={handleChange} /> I agree
      </label>
    </form>
  );
}
```

### Submitting

```jsx
function handleSubmit(e) {
  e.preventDefault();               // ⚠️ stop the browser from reloading the page
  if (!form.email.includes('@')) {
    setErrors({ email: 'Enter a valid email' });
    return;
  }
  saveUser(form);
}

<form onSubmit={handleSubmit}>
  {/* inputs */}
  <button type="submit">Sign up</button>   {/* buttons in a form default to type="submit" */}
  <button type="button" onClick={reset}>Reset</button>  {/* type="button" so it doesn't submit */}
</form>
```

Use `onSubmit` on the `<form>` (not `onClick` on the button), so pressing **Enter** also submits.

### Validation and showing errors

```jsx
function validate(values) {
  const errors = {};
  if (!values.name.trim()) errors.name = 'Name is required';
  if (!/^\S+@\S+\.\S+$/.test(values.email)) errors.email = 'Invalid email';
  if (values.password.length < 8) errors.password = 'At least 8 characters';
  return errors;
}

const [errors, setErrors] = useState({});
const [touched, setTouched] = useState({});

<input
  id="email"
  name="email"
  value={form.email}
  onChange={handleChange}
  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
  aria-invalid={!!errors.email}
  aria-describedby="email-error"
/>
{touched.email && errors.email && <p id="email-error" role="alert">{errors.email}</p>}
```

For larger forms, libraries like **React Hook Form** (+ Zod/Yup for validation) handle this with less code and fewer re-renders.

### Uncontrolled inputs (the alternative)

The DOM keeps the value; you read it when needed (on submit), with `FormData` or a ref.

```jsx
function QuickForm() {
  function handleSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));   // { email: '...' }
    console.log(data);
  }
  return (
    <form onSubmit={handleSubmit}>
      <input name="email" defaultValue="" />
      <button>Send</button>
    </form>
  );
}
```

| | Controlled | Uncontrolled |
| --- | --- | --- |
| Value lives in | React state | The DOM |
| Read the value | Anytime (state) | On submit / via ref |
| Instant validation, formatting, dependent fields | Easy | Harder |
| Re-renders on typing | Yes | No |
| Use for | Most forms where UI reacts to input | Simple forms, file inputs (`<input type="file">` is always uncontrolled) |

### Accessibility basics for forms

- Every input needs a **label**: `<label htmlFor="email">Email</label><input id="email" />`, or wrap the input in the label.
- Use the right `type` (`email`, `tel`, `number`) for mobile keyboards and built-in validation.
- Link errors with `aria-describedby`, mark invalid fields with `aria-invalid`.
- Don't rely on placeholder text instead of labels.

---

## 5. Putting it together: a to-do app

```jsx
import { useState } from 'react';

export default function TodoApp() {
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('all');

  function addTodo(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setTodos((prev) => [...prev, { id: crypto.randomUUID(), text: trimmed, done: false }]);
    setText('');
  }

  const toggle = (id) => setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id) => setTodos((prev) => prev.filter((t) => t.id !== id));

  const visible = todos.filter((t) => (filter === 'all' ? true : filter === 'done' ? t.done : !t.done));
  const remaining = todos.filter((t) => !t.done).length;

  return (
    <section>
      <form onSubmit={addTodo}>
        <label htmlFor="new-todo">New to-do</label>
        <input id="new-todo" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={!text.trim()}>Add</button>
      </form>

      <div role="group" aria-label="Filter">
        {['all', 'active', 'done'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}>{f}</button>
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

      <p>{remaining} item{remaining === 1 ? '' : 's'} left</p>
    </section>
  );
}
```

---

## 6. Exercises

1. Render a table of products from an array, with an "Out of stock" badge using `&&`.
2. Add a search input that filters the products as you type, with an empty-state message.
3. Build a signup form with name, email, password, a country select and a terms checkbox; show errors after each field is blurred.
4. In the to-do app, add an uncontrolled `<input placeholder="note" />` inside each `<li>` and change the keys to `index`. Add three items, type a note in the first one, then delete the first item. The note jumps to the wrong item. Switch back to `key={t.id}` and explain the difference.
