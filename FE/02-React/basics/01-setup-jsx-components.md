# 01 · Setup, JSX and components

## 1. What is React?

React is a JavaScript **library for building user interfaces** out of **components**: small, reusable pieces like `Button`, `Navbar` or `ProductCard`.

The key idea: **UI = f(state)**. You describe what the screen should look like for the current data, and React updates the real page (the DOM) when the data changes. You don't write "find this element and change its text"; you change the data and React works out the DOM updates.

```
 state/props  ──▶  your component function  ──▶  JSX (description of UI)  ──▶  React updates the DOM
      ▲                                                                              │
      └──────────────────────── user clicks / types / data arrives ◀────────────────┘
```

## 2. Creating a project

You need **Node.js** (LTS) installed. The standard way to start is **Vite**:

```bash
npm create vite@latest my-app -- --template react      # or: --template react-ts for TypeScript
cd my-app
npm install
npm run dev          # opens http://localhost:5173 with hot reload
```

*(Create React App is deprecated. For full-stack apps with routing and server rendering, the React docs recommend frameworks like Next.js or React Router's framework mode.)*

### The files that matter

```
my-app/
  index.html          # the single HTML page; has <div id="root"></div>
  package.json        # dependencies and scripts (dev, build, preview)
  vite.config.js
  src/
    main.jsx          # entry point: mounts <App /> into #root
    App.jsx           # your root component
    index.css
```

```jsx
// src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**StrictMode** is a development-only helper: it renders components twice and runs effects twice to expose bugs. It does nothing in production. If you see something logged twice in development, this is why.

Commands: `npm run dev` (develop), `npm run build` (production files in `dist/`), `npm run preview` (test the build locally).

---

## 3. JSX

**JSX** lets you write HTML-like code inside JavaScript. It isn't HTML: a build tool turns it into JavaScript function calls.

```jsx
const element = <h1 className="title">Hello</h1>;
// becomes roughly: jsx('h1', { className: 'title', children: 'Hello' })
```

### JSX rules

**1. Return one root element.** Wrap siblings in a parent or a **Fragment** (`<>...</>`), which adds no extra DOM element.

```jsx
// ❌ Error: two root elements
return <h1>Title</h1><p>Text</p>;

// ✅
return (
  <>
    <h1>Title</h1>
    <p>Text</p>
  </>
);
```

**2. Close every tag**, including self-closing ones: `<img />`, `<input />`, `<br />`.

**3. Use camelCase attribute names**, and a few renamed ones:

| HTML | JSX |
| --- | --- |
| `class` | `className` |
| `for` (on label) | `htmlFor` |
| `onclick` | `onClick` |
| `tabindex` | `tabIndex` |
| `style="color: red"` | `style={{ color: 'red' }}` (an object, camelCase keys) |
| `<!-- comment -->` | `{/* comment */}` |

`aria-*` and `data-*` attributes stay as they are: `aria-label="Close"`, `data-id="5"`.

**4. Use `{ }` to insert JavaScript expressions.**

```jsx
const name = 'Anoop';
const user = { avatar: '/me.png' };

<h1>Hello, {name}!</h1>
<p>2 + 2 = {2 + 2}</p>
<p>{name.toUpperCase()}</p>
<img src={user.avatar} alt={`${name}'s avatar`} />
<div style={{ fontSize: 20, marginTop: '1rem' }} />   {/* outer { } = JS, inner { } = object */}
```

Only **expressions** (things that produce a value) work inside `{ }`: variables, function calls, ternaries, `map`. **Statements** like `if`, `for` and `const` don't; put them before the `return`.

### What renders

```jsx
{'text'}       // text
{42}           // 42
{['a', 'b']}   // ab   (arrays render each item)
{true} {false} {null} {undefined}   // render NOTHING
{0}            // renders 0 ⚠️ (common bug with &&, see lesson 03)
{{ a: 1 }}     // ❌ Error: Objects are not valid as a React child
```

---

## 4. Components

A **component** is a JavaScript function that **returns JSX**.

```jsx
function Greeting() {
  return <h1>Hello!</h1>;
}

// Arrow function version: same thing
const Greeting2 = () => <h1>Hello!</h1>;

// Using it
function App() {
  return (
    <div>
      <Greeting />
      <Greeting />
    </div>
  );
}
```

### Component rules

- **Names must start with a capital letter**: `<Greeting />`. Lowercase `<greeting />` is treated as an HTML tag.
- **Return JSX, `null` (render nothing), a string/number, or an array.** Returning `undefined` is allowed in React 18+ but usually means you forgot `return`.
- **Never define a component inside another component.** It's recreated on every render, which resets its state and is slow.

```jsx
// ❌
function Parent() {
  function Child() { return <p>child</p>; }   // new component type every render
  return <Child />;
}

// ✅ define at the top level of the file
function Child() { return <p>child</p>; }
function Parent() { return <Child />; }
```

- **Components must be pure while rendering**: same props/state → same JSX, and no side effects (no API calls, no changing outside variables) in the function body. Side effects go in event handlers or `useEffect`.

### One component per file (usually)

```jsx
// src/components/Header.jsx
export default function Header() {
  return <header><h1>My Shop</h1></header>;
}

// src/App.jsx
import Header from './components/Header';

export default function App() {
  return <Header />;
}
```

---

## 5. Composition and `children`

Build big UIs by **combining** small components. Anything you put between a component's tags arrives as the special **`children`** prop.

```jsx
function Card({ children, title }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="card-body">{children}</div>
    </div>
  );
}

function App() {
  return (
    <Card title="Profile">
      <p>Name: Anoop</p>          {/* ← these elements are `children` */}
      <button>Edit</button>
    </Card>
  );
}
```

This lets you make generic wrappers (`Card`, `Modal`, `Layout`, `Button`) without them knowing what's inside.

You can also pass JSX through other props ("slots"):

```jsx
<Layout sidebar={<Menu />} header={<Header />}>
  <MainContent />
</Layout>
```

---

## 6. A first complete example

```jsx
// src/App.jsx
const products = [
  { id: 1, name: 'Pen', price: 10 },
  { id: 2, name: 'Notebook', price: 60 },
];

function ProductCard({ name, price }) {
  return (
    <article className="product">
      <h3>{name}</h3>
      <p>₹{price}</p>
    </article>
  );
}

export default function App() {
  return (
    <main>
      <h1>Shop</h1>
      {products.map((p) => (
        <ProductCard key={p.id} name={p.name} price={p.price} />
      ))}
    </main>
  );
}
```

(Props, `map` and `key` are explained in the next two lessons.)

---

## 7. Tools to install

- **React Developer Tools** browser extension: inspect components, their props and state, and profile renders.
- **ESLint** with `eslint-plugin-react-hooks` (Vite templates include it): catches hook mistakes.
- **Prettier**: automatic formatting.

---

## 8. Exercises

1. Create a Vite React project and replace `App` with your own heading and paragraph.
2. Make `Header`, `Footer` and `Main` components in separate files and compose them in `App`.
3. Make a `Card` component that uses `children` and a `title` prop; use it three times with different content.
4. Convert this HTML to JSX: `<label for="email" class="lbl">Email</label><input type="email" tabindex="1"><br>`.
