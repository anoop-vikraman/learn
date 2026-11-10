# 08 · DOM, events, modules, errors and storage

## 1. What is the DOM?

The **DOM** (Document Object Model) is the browser's live, tree-shaped representation of the HTML page. JavaScript reads and changes the DOM to update what users see. (React does this for you, but knowing the DOM helps you understand React and debug it.)

```
document
 └─ html
     ├─ head
     └─ body
         ├─ h1#title
         └─ ul.list
             ├─ li
             └─ li
```

## 2. Selecting elements

```js
document.getElementById('title');            // one element by id, or null
document.querySelector('.list li');          // FIRST match of any CSS selector, or null
document.querySelectorAll('.list li');       // ALL matches → NodeList (static)
document.getElementsByClassName('item');     // live HTMLCollection (older API)

const items = document.querySelectorAll('li');
items.forEach((li) => console.log(li.textContent));   // NodeList has forEach
[...items].map((li) => li.textContent);                // convert to array for map/filter

element.closest('.card');    // nearest ancestor (or itself) matching the selector
element.parentElement;
element.children;            // child elements
```

⚠️ If your script runs before the HTML is parsed, selectors return `null`. Put `<script>` at the end of `<body>`, or use `<script defer src="app.js">`, or `type="module"` (deferred automatically).

## 3. Changing content, attributes and styles

```js
const title = document.querySelector('#title');

title.textContent = 'New title';            // ✅ safe: treated as plain text
title.innerHTML = '<em>New</em> title';     // parses HTML ⚠️ never with user input (XSS)

// Attributes
link.setAttribute('href', '/home');
link.getAttribute('href');
input.value = 'typed text';                 // form values: use the property
img.alt = 'Profile photo';
button.disabled = true;

// data-* attributes
// <div data-user-id="42">
div.dataset.userId;                         // '42' (always a string)

// Classes
box.classList.add('active');
box.classList.remove('hidden');
box.classList.toggle('open');               // add if missing, remove if present
box.classList.contains('active');           // true/false

// Inline styles (prefer toggling classes)
box.style.backgroundColor = 'red';          // camelCase property names
box.style.display = 'none';
```

## 4. Creating and removing elements

```js
const li = document.createElement('li');
li.textContent = 'New item';
li.classList.add('item');

list.append(li);              // add at the end (also accepts text)
list.prepend(li);             // add at the start
someEl.before(li); someEl.after(li);
li.remove();                  // remove from the page

// Adding many items efficiently: build first, insert once
const fragment = document.createDocumentFragment();
data.forEach((d) => {
  const item = document.createElement('li');
  item.textContent = d.name;
  fragment.append(item);
});
list.append(fragment);        // one DOM update instead of many
```

---

## 5. Events

```js
const button = document.querySelector('#save');

function handleClick(event) {
  console.log('clicked', event.target);
}

button.addEventListener('click', handleClick);
button.removeEventListener('click', handleClick);   // must pass the SAME function reference

button.addEventListener('click', () => {}, { once: true });   // runs only once
```

### Common events

| Event | When |
| --- | --- |
| `click`, `dblclick` | Mouse click |
| `input` | Every change in a text field |
| `change` | Value committed (on blur for text; immediately for checkboxes/selects) |
| `submit` | Form submitted |
| `keydown`, `keyup` | Keyboard (`event.key` → `'Enter'`, `'Escape'`, `'a'`) |
| `focus`, `blur` | Element gains/loses focus (don't bubble; `focusin`/`focusout` do) |
| `mouseenter`, `mouseleave` | Pointer enters/leaves (don't bubble) |
| `scroll`, `resize` | Scrolling, window resize (fire very often: throttle/debounce) |
| `DOMContentLoaded` | HTML parsed, DOM ready |
| `load` | Page and all images/styles loaded |

### The event object

```js
input.addEventListener('keydown', (e) => {
  e.key;              // 'Enter'
  e.target;           // the element that triggered the event
  e.currentTarget;    // the element the listener is attached to
  e.preventDefault(); // stop the browser's default action
  e.stopPropagation();// stop bubbling to parents
});
```

### Forms

```js
form.addEventListener('submit', (e) => {
  e.preventDefault();                          // ⚠️ otherwise the page reloads
  const data = new FormData(form);
  const values = Object.fromEntries(data);     // { email: '...', password: '...' } (needs name="" on inputs)
  console.log(values);
});
```

### Bubbling and event delegation

Events **bubble**: a click on a `<li>` also triggers listeners on its `<ul>`, `<body>` and `document`. **Event delegation** uses this: put **one** listener on the parent instead of one per child, which also works for items added later.

```js
list.addEventListener('click', (e) => {
  const item = e.target.closest('li');
  if (!item || !list.contains(item)) return;
  console.log('clicked item', item.dataset.id);
});
```

(The opposite phase, **capturing**, runs from the top down first; enable it with `addEventListener('click', fn, { capture: true })`.)

---

## 6. Modules: `import` and `export`

Modules let you split code into files. Each file has its own scope; you **export** what other files may use.

```js
// math.js
export const PI = 3.14159;                    // named export
export function add(a, b) { return a + b; }   // named export
export default function multiply(a, b) {      // default export (max one per file)
  return a * b;
}
```

```js
// app.js
import multiply, { add, PI } from './math.js';   // default (any name) + named (exact names)
import { add as sum } from './math.js';          // rename
import * as math from './math.js';               // everything as an object: math.add, math.default

const { default: lazyMultiply } = await import('./math.js');  // dynamic import: loads on demand
```

| | Named export | Default export |
| --- | --- | --- |
| How many per file | Any number | One |
| Import name | Must match (or use `as`) | Any name you choose |
| Import syntax | `import { add }` | `import add` |

In the browser, use `<script type="module" src="app.js">` and include the `.js` extension in import paths. Bundlers like Vite let you omit extensions and import packages by name (`import React from 'react'`).

*Older Node code uses **CommonJS**: `const x = require('./x')` and `module.exports = ...`. Modern code uses ES modules (`import`/`export`).*

---

## 7. Errors and `try`/`catch`

```js
try {
  const data = JSON.parse(text);   // may throw
  console.log(data);
} catch (error) {
  console.error(error.name, error.message);   // 'SyntaxError', 'Unexpected token...'
} finally {
  console.log('always runs');      // cleanup
}

// Throwing your own errors
function divide(a, b) {
  if (b === 0) throw new Error('Cannot divide by zero');
  return a / b;
}

// Custom error types
class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

try {
  throw new ValidationError('email', 'Invalid email');
} catch (e) {
  if (e instanceof ValidationError) showFieldError(e.field, e.message);
  else throw e;                     // re-throw errors you don't know how to handle
}
```

Built-in error types: `Error`, `TypeError` (wrong type, e.g. calling `undefined()`), `ReferenceError` (unknown variable), `SyntaxError` (bad syntax / bad JSON), `RangeError` (number out of range, stack overflow).

**Always throw `Error` objects, not strings**: they have a stack trace. `catch` without a variable is allowed: `catch { ... }`.

---

## 8. Browser storage

```js
// localStorage: stays after closing the browser; sessionStorage: cleared when the tab closes
localStorage.setItem('theme', 'dark');
localStorage.getItem('theme');        // 'dark' (null if missing)
localStorage.removeItem('theme');
localStorage.clear();

// ⚠️ Only strings are stored
localStorage.setItem('user', JSON.stringify({ name: 'A' }));
const user = JSON.parse(localStorage.getItem('user') ?? 'null');
localStorage.setItem('count', 5);     // stored as '5' (string)
```

- About 5 MB per origin, synchronous (blocks the thread: don't store huge data).
- **Any script on the page can read it**, so never store passwords; storing auth tokens there is risky (XSS).
- Cookies are sent to the server with every request; use them (httpOnly) for sessions.

---

## 9. Other useful browser APIs

```js
window.location.href;             // current URL
new URL(window.location.href).searchParams.get('q');   // read ?q=...
history.pushState({}, '', '/new-page');                 // change URL without reload (what routers use)

navigator.clipboard.writeText('copied!');               // copy to clipboard (returns a promise)

// Run code when an element becomes visible (lazy loading, infinite scroll)
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => { if (entry.isIntersecting) loadMore(); });
});
observer.observe(document.querySelector('#sentinel'));

requestAnimationFrame(() => { /* smooth animation step before the next repaint */ });
```

---

## 10. Mini project: a to-do list (no framework)

```html
<form id="todo-form">
  <input name="title" placeholder="What needs doing?" required />
  <button>Add</button>
</form>
<ul id="todo-list"></ul>
<script type="module" src="todo.js"></script>
```

```js
// todo.js
const form = document.querySelector('#todo-form');
const list = document.querySelector('#todo-list');
let todos = JSON.parse(localStorage.getItem('todos') ?? '[]');

function render() {
  list.innerHTML = '';
  for (const todo of todos) {
    const li = document.createElement('li');
    li.dataset.id = todo.id;
    li.textContent = todo.title;                    // textContent: safe from XSS
    li.classList.toggle('done', todo.done);
    const del = document.createElement('button');
    del.textContent = '✕';
    del.dataset.action = 'delete';
    li.append(del);
    list.append(li);
  }
  localStorage.setItem('todos', JSON.stringify(todos));
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = new FormData(form).get('title').trim();
  if (!title) return;
  todos = [...todos, { id: crypto.randomUUID(), title, done: false }];
  form.reset();
  render();
});

list.addEventListener('click', (e) => {               // event delegation
  const li = e.target.closest('li');
  if (!li) return;
  const id = li.dataset.id;
  todos = e.target.dataset.action === 'delete'
    ? todos.filter((t) => t.id !== id)
    : todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  render();
});

render();
```

Notice the pattern: **state (the `todos` array) → `render()` → DOM**. React automates exactly this.

---

## 11. Exercises

1. Build a counter page with +, − and reset buttons.
2. Add a "filter: all / active / done" control to the to-do app.
3. Add a search box that filters a list as you type (debounce it by 300 ms).
4. Split the to-do app into modules: `storage.js`, `render.js`, `main.js`.
