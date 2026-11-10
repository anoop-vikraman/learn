# 02 · Props, state and events

## 1. Props: passing data into a component

**Props** (properties) are the inputs of a component, like arguments of a function. The parent passes them; the child receives them as **one object**.

```jsx
function Welcome(props) {
  return <h1>Hello, {props.name}! You are {props.age}.</h1>;
}

// Usually destructured directly in the parameter list:
function Welcome2({ name, age }) {
  return <h1>Hello, {name}! You are {age}.</h1>;
}

<Welcome name="Anoop" age={25} />
```

### Passing different types

```jsx
<Profile
  name="Anoop"                      // string: quotes
  age={25}                          // number: braces
  isAdmin={true}                    // boolean
  isActive                          // shorthand for isActive={true}
  tags={['react', 'ts']}            // array
  address={{ city: 'Kochi' }}       // object (double braces)
  onSave={handleSave}               // function
  icon={<StarIcon />}               // JSX
/>
```

### Default values

```jsx
function Button({ label = 'Click me', variant = 'primary', size = 'md' }) {
  return <button className={`btn btn-${variant} btn-${size}`}>{label}</button>;
}

<Button />                          // 'Click me', primary, md
<Button label="Save" variant="success" />
```

Defaults apply only when the prop is **missing or `undefined`**, not `null`.

### Spreading props

```jsx
const user = { name: 'Anoop', age: 25 };
<Welcome {...user} />               // same as name="Anoop" age={25}

// Forwarding remaining props to a native element
function Input({ label, ...rest }) {
  return (
    <label>
      {label}
      <input {...rest} />           {/* type, value, onChange, placeholder... */}
    </label>
  );
}
```

### Props are read-only

A component must **never change its props**. If something needs to change, it should be **state** (in this component or a parent).

```jsx
function Bad({ count }) {
  count = count + 1;   // ❌ don't modify props
}
```

---

## 2. State: data that changes over time

**State** is a component's own memory: data that changes because of user actions or other events. When state changes, React **re-renders** the component with the new value.

Why not a normal variable? A normal variable is reset on every render, and changing it doesn't tell React to re-render.

```jsx
function BrokenCounter() {
  let count = 0;
  return <button onClick={() => { count++; }}>{count}</button>;   // ❌ always shows 0
}
```

### `useState`

```jsx
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  //     ^value  ^setter          ^initial value (used only on the first render)

  return (
    <div>
      <p>You clicked {count} times</p>
      <button onClick={() => setCount(count + 1)}>+1</button>
      <button onClick={() => setCount(0)}>Reset</button>
    </div>
  );
}
```

Each `<Counter />` on the page has **its own separate** count.

### How state updates work (important)

**1. Updates are not immediate.** The setter schedules a re-render; the variable keeps its old value until the next render.

```jsx
function handleClick() {
  setCount(count + 1);
  console.log(count);   // still the OLD value
}
```

**2. Updates are batched.** Several updates in one event cause one re-render.

**3. Use an updater function when the new value depends on the old one.**

```jsx
// ❌ All three read the same `count` (say 0) → result is 1
setCount(count + 1);
setCount(count + 1);
setCount(count + 1);

// ✅ Each receives the latest value → result is 3
setCount((c) => c + 1);
setCount((c) => c + 1);
setCount((c) => c + 1);
```

**4. Setting the same value skips the re-render.** React compares with `Object.is`.

**5. Lazy initial state.** If the initial value is expensive to compute, pass a function so it runs only once:

```jsx
const [todos, setTodos] = useState(() => JSON.parse(localStorage.getItem('todos') ?? '[]'));
// ❌ useState(JSON.parse(...)) would parse on EVERY render (result ignored after the first)
```

---

## 3. Updating objects and arrays: never mutate

React decides whether to re-render by checking if the state is a **new reference**. If you mutate the existing object/array, the reference is the same, so React may not re-render, and you get bugs.

### Objects

```jsx
const [user, setUser] = useState({ name: 'Anoop', age: 25, address: { city: 'Kochi' } });

// ❌ Mutation: same object, React may ignore it
user.age = 26;
setUser(user);

// ✅ Create a new object with spread
setUser({ ...user, age: 26 });
setUser((prev) => ({ ...prev, age: prev.age + 1 }));

// ✅ Nested: copy every level you change
setUser((prev) => ({ ...prev, address: { ...prev.address, city: 'Pune' } }));
```

### Arrays

```jsx
const [todos, setTodos] = useState([]);

// Add
setTodos((prev) => [...prev, { id: crypto.randomUUID(), text, done: false }]);

// Remove
setTodos((prev) => prev.filter((t) => t.id !== id));

// Update one item
setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

// Insert at position
setTodos((prev) => [...prev.slice(0, index), newTodo, ...prev.slice(index)]);

// Sort / reverse: copy first (sort and reverse mutate)
setTodos((prev) => [...prev].sort((a, b) => a.text.localeCompare(b.text)));
// or prev.toSorted(...)
```

| Avoid (mutates) | Use instead |
| --- | --- |
| `push`, `unshift` | `[...arr, item]`, `[item, ...arr]` |
| `pop`, `shift`, `splice` | `filter`, `slice`, `toSpliced` |
| `arr[i] = x` | `map`, `with(i, x)` |
| `sort`, `reverse` | `[...arr].sort()`, `toSorted`, `toReversed` |

(Libraries like **Immer** let you write mutating code safely, if nested updates get painful.)

---

## 4. Events

```jsx
function Buttons() {
  function handleClick() {
    alert('Clicked!');
  }

  return (
    <>
      <button onClick={handleClick}>Pass the function</button>
      <button onClick={() => alert('Hi')}>Inline arrow</button>
      <button onClick={() => deleteItem(42)}>Pass arguments with an arrow</button>
    </>
  );
}
```

⚠️ **Pass the function, don't call it:**

```jsx
<button onClick={handleClick}>      ✅ React calls it on click
<button onClick={handleClick()}>    ❌ called immediately during render (and can cause infinite loops)
<button onClick={() => handleClick(id)}>  ✅ arrow when you need arguments
```

### The event object

```jsx
function SearchBox() {
  function handleChange(e) {
    console.log(e.target.value);   // what was typed
  }
  function handleKeyDown(e) {
    if (e.key === 'Enter') search();
  }
  return <input onChange={handleChange} onKeyDown={handleKeyDown} />;
}
```

React passes a **SyntheticEvent**, a wrapper with the same interface as the native event (`target`, `preventDefault()`, `stopPropagation()`, `key`...) that works the same in every browser.

### Common events

`onClick`, `onDoubleClick`, `onChange` (fires on **every keystroke** in React, unlike HTML), `onSubmit`, `onKeyDown`, `onFocus`, `onBlur`, `onMouseEnter`, `onMouseLeave`, `onScroll`. Each has a `...Capture` version for the capture phase.

### Naming convention

- Handler functions inside a component: `handleClick`, `handleSubmit`, `handleNameChange`.
- Props that accept handlers: `onClick`, `onSave`, `onDelete`.

```jsx
function DeleteButton({ onDelete }) {
  return <button onClick={onDelete}>Delete</button>;
}

<DeleteButton onDelete={() => removeTodo(todo.id)} />
```

---

## 5. Lifting state up

When **two components need the same data**, move the state to their **closest common parent** and pass it down as props. Children change it by calling functions passed from the parent. This keeps one **single source of truth**.

```jsx
function TemperatureApp() {
  const [celsius, setCelsius] = useState(20);   // state lives in the parent

  return (
    <>
      <CelsiusInput value={celsius} onChange={setCelsius} />
      <FahrenheitDisplay celsius={celsius} />
    </>
  );
}

function CelsiusInput({ value, onChange }) {
  return <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />;
}

function FahrenheitDisplay({ celsius }) {
  return <p>{(celsius * 9) / 5 + 32} °F</p>;   // derived value, not separate state
}
```

**Data flows down** (props), **events flow up** (callbacks). This is called **one-way data flow**.

---

## 6. Props vs state

| | Props | State |
| --- | --- | --- |
| Who owns it | The parent | The component itself |
| Can the component change it? | ❌ No (read-only) | ✅ Yes, with the setter |
| Changing it causes re-render | ✅ (when the parent re-renders with new props) | ✅ |
| Purpose | Configure a component from outside | Remember things that change inside |

### Don't store what you can calculate (derived state)

```jsx
// ❌ Extra state that can get out of sync
const [items, setItems] = useState([]);
const [count, setCount] = useState(0);

// ✅ Compute it during render
const [items, setItems] = useState([]);
const count = items.length;
const total = items.reduce((sum, i) => sum + i.price, 0);
const visibleItems = items.filter((i) => i.name.includes(search));
```

Also don't copy props into state (`useState(props.value)`): the state won't update when the prop changes.

---

## 7. When does a component re-render?

1. Its **state** changes.
2. Its **parent re-renders** (by default, all children re-render too, even if their props didn't change).
3. A **context** it uses changes.

Re-rendering means React calls your function again and compares the new JSX with the old one; it only touches the real DOM where something actually changed. Re-renders are usually cheap; see lesson 06 for optimizing them.

---

## 8. Example: a small feature combining everything

```jsx
import { useState } from 'react';

function LikeButton({ liked, onToggle }) {
  return (
    <button onClick={onToggle} aria-pressed={liked}>
      {liked ? '❤️ Liked' : '🤍 Like'}
    </button>
  );
}

function Post({ post, onLikeToggle }) {
  return (
    <article>
      <h3>{post.title}</h3>
      <LikeButton liked={post.liked} onToggle={() => onLikeToggle(post.id)} />
    </article>
  );
}

export default function Feed() {
  const [posts, setPosts] = useState([
    { id: 1, title: 'Learning React', liked: false },
    { id: 2, title: 'State is memory', liked: true },
  ]);

  const likedCount = posts.filter((p) => p.liked).length;   // derived

  function handleLikeToggle(id) {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, liked: !p.liked } : p)));
  }

  return (
    <section>
      <p>You liked {likedCount} posts</p>
      {posts.map((post) => (
        <Post key={post.id} post={post} onLikeToggle={handleLikeToggle} />
      ))}
    </section>
  );
}
```

---

## 9. Exercises

1. Counter with a "step" input: + and − change the count by the step.
2. A `Toggle` that shows/hides a paragraph, with the button text changing between "Show" and "Hide".
3. A profile editor with `name` and `email` in **one** state object; update each field immutably.
4. Two sibling components, `ColorPicker` and `Preview`, sharing a selected color through their parent.
5. Explain why calling `setCount(count + 1)` three times adds only 1, and fix it.
