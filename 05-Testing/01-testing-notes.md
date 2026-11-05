## 4. Testing: Jest, Vitest, Testing Library

The philosophy to quote: "The more your tests resemble the way your software is used, the more confidence they give you." Test behaviour, not implementation details.

**What that means in practice:** a user never sees your `useState` variable, your function names or your CSS class names. They see text, buttons and inputs, and they click and type. So a good test does the same: render the component, interact with it like a person would, and check what appears on screen. If you later refactor the internals (e.g. swap `useState` for `useReducer`), a good test **still passes**, because the behaviour didn't change. A test that breaks on every refactor even though nothing visible changed is testing implementation details, and it slows the team down instead of protecting them.

**Why we test at all (say this if asked):** tests let you change code with confidence. They catch regressions before users do, document how a component is supposed to behave, and make refactoring safe. In CI, they're the gate that stops broken code from being merged.

### Explained simply (read this first)

**Three tools, three jobs:**

- **Jest or Vitest = the test runner.** It finds `*.test.ts` files, runs them, and gives you `describe`, `test`, `expect` and mocking. Vitest is basically "Jest, but built on Vite" with almost the same API.
- **jsdom = a fake browser** inside Node, so components can render without a real browser.
- **React Testing Library (RTL) = how you interact with components** in tests, the way a user would: find a button by its text, click it, check what appears.

**How they fit together:** when you run `npm test`, the **runner** (Vitest/Jest) starts Node, sets up **jsdom** so that `document` and `window` exist, then runs your test file. Inside the test, **RTL** renders your component into that fake DOM and gives you `screen` to find elements, and **user-event** simulates clicks and typing. **jest-dom** adds readable assertions like `toBeInTheDocument()`. If one piece is missing you get typical errors: no jsdom gives "document is not defined", and no jest-dom setup gives "toBeInTheDocument is not a function".

**Limits of jsdom:** it doesn't do real layout or painting, so `getBoundingClientRect()` returns zeros, CSS isn't really applied, and APIs like `IntersectionObserver`, `ResizeObserver` and `matchMedia` don't exist (you stub them). For things that need a real browser (layout, visual checks, full user flows), use E2E tools like Playwright or Vitest browser mode.

**The shape of every test: Arrange, Act, Assert.**

```ts
// sum.ts
export const sum = (a: number, b: number) => a + b;

// sum.test.ts
import { describe, test, expect } from 'vitest';   // with Jest these are globals
import { sum } from './sum';

describe('sum', () => {
  test('adds two numbers', () => {
    const a = 2, b = 3;            // Arrange
    const result = sum(a, b);      // Act
    expect(result).toBe(5);        // Assert
  });
});
```

**Reading this test line by line:**
- `describe` groups related tests. It's just a label that shows up in the output ("sum › adds two numbers") and lets you share setup with `beforeEach`.
- `test` (or its alias `it`) is one scenario. The name should read like a sentence describing the behaviour: "adds two numbers", "shows an error when the email is invalid".
- **Arrange** = prepare inputs, render the component, set up mocks. **Act** = do the one thing you're testing (call the function, click the button). **Assert** = check the result.
- Keep **one behaviour per test**. If a test fails, its name should tell you exactly what broke without reading the code.
- `expect(value)` wraps the value, and the **matcher** (`.toBe(5)`) does the comparison. Add `.not` to invert: `expect(x).not.toBe(0)`.

**Common matchers:** `toBe` (exact, for primitives), `toEqual` (deep equality, for objects/arrays), `toBeTruthy`, `toContain`, `toThrow`, `toHaveBeenCalledWith`, `toHaveLength`. `toBe({a:1})` fails because two objects are never the same reference; use `toEqual`.

**More matcher detail you'll actually use:**

```ts
expect(2 + 2).toBe(4);                              // primitives: uses Object.is
expect({ a: 1, b: { c: 2 } }).toEqual({ a: 1, b: { c: 2 } }); // deep compare
expect({ a: 1, extra: true }).toMatchObject({ a: 1 });         // partial match: ignores extra keys
expect(['react', 'vue']).toContain('react');
expect(0.1 + 0.2).toBeCloseTo(0.3);                 // floating point safe
expect(() => JSON.parse('{')).toThrow();             // pass a FUNCTION, not the call itself
await expect(fetchUser(999)).rejects.toThrow('Not found');    // async errors
await expect(fetchUser(1)).resolves.toEqual({ id: 1 });
expect(user).toEqual({ id: expect.any(Number), name: 'Ann' }); // flexible matching
```

Note on `toThrow`: `expect(fn()).toThrow()` runs `fn` **before** `expect` can catch the error, so the test crashes. Always wrap it: `expect(() => fn()).toThrow()`.

**Vitest setup for React:**

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,                     // use describe/test/expect without importing
    setupFiles: './src/setupTests.ts',
  },
});

// src/setupTests.ts
import '@testing-library/jest-dom/vitest';   // adds toBeInTheDocument, etc.
```

**What each option does:**
- `environment: 'jsdom'` tells Vitest to create the fake browser. Without it, tests run in plain Node and `document` doesn't exist. (`happy-dom` is a faster alternative with slightly less browser accuracy.)
- `globals: true` makes `describe`, `test`, `expect` and `vi` available everywhere without imports, like Jest. If you use it with TypeScript, add `"types": ["vitest/globals"]` to `tsconfig.json` so the editor knows about them.
- `setupFiles` runs **before every test file**. It's the place for global things: jest-dom matchers, MSW server start/stop, stubs for `matchMedia`, and `cleanup`.
- Install with: `npm i -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`.
- Add `"test": "vitest"` to `package.json`. `vitest` runs in watch mode locally, and `vitest run` runs once (use that in CI).

**Your first component test:**

```tsx
// Counter.tsx
export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </>
  );
}

// Counter.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('increments the count when clicked', async () => {
  const user = userEvent.setup();
  render(<Counter />);

  expect(screen.getByText('Count: 0')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /increment/i }));
  expect(screen.getByText('Count: 1')).toBeInTheDocument();
});
```

**What's happening step by step:**
1. `userEvent.setup()` creates a "virtual user". Call it **before** `render`, once per test.
2. `render(<Counter />)` mounts the component into jsdom's `document.body`. RTL automatically **unmounts and cleans up after each test**, so tests don't affect each other.
3. `screen` is the whole page. You query it the way a user scans a page: "find the button called Increment".
4. `{ name: /increment/i }` matches the button's **accessible name** (its visible text, `aria-label` or label). The `/i` regex makes it case-insensitive, so the test doesn't break if the text changes from "Increment" to "increment".
5. `await user.click(...)`: user-event actions are **async** (v14+). They fire the full sequence of events a real click produces (pointerdown, mousedown, focus, pointerup, mouseup, click), and React processes the state update.
6. We assert on **visible text**, not on the `count` variable. We never touch the component's internals.

Notice what we **didn't** do: no checking `useState` was called, no reading the component's state, no finding the button by its CSS class. If the button later becomes a styled `<Button>` component, this test still passes.

**Debugging tip:** when a query fails, RTL prints the current DOM. You can also call `screen.debug()` to print it anywhere, or `screen.logTestingPlaygroundURL()` to get a link that suggests the best query for each element.

**Why `getByRole`?** It finds elements the way screen readers do (button, textbox, heading, checkbox), so your test also checks accessibility. If you can't find something by role, real users with assistive tech probably can't either.

**Common roles you'll use:** `button`, `link` (an `<a>` with `href`), `textbox` (`<input type="text">`, `<textarea>`), `checkbox`, `radio`, `combobox` (`<select>`), `heading` (use `{ level: 2 }` for `<h2>`), `list` / `listitem`, `dialog`, `alert`, `img` (uses the `alt` text as its name), `table` / `row` / `cell`. A `<div onClick>` has **no role**, so `getByRole('button')` won't find it. That failing query is pointing out a real accessibility bug: use a `<button>`.

```tsx
screen.getByRole('heading', { name: /dashboard/i, level: 1 });
screen.getByRole('checkbox', { name: /accept terms/i });
screen.getByRole('link', { name: /home/i });
```

**Which query to use, simplified:**

| You want to... | Use | If not found |
| --- | --- | --- |
| Get something that should be there now | `getBy...` | Throws an error (test fails) |
| Check something is NOT there | `queryBy...` | Returns `null` |
| Wait for something to appear (after a fetch) | `await findBy...` | Rejects after \~1s timeout |

```tsx
expect(screen.queryByText('Error')).not.toBeInTheDocument();  // absence
expect(await screen.findByText('Loaded!')).toBeInTheDocument(); // async
```

**Why three variants exist:**
- `getBy` throws immediately if the element is missing, so you get a clear failure message with the DOM printed. That's what you want 90% of the time.
- You **can't** use `getBy` to check absence: it would throw before `expect(...).not` ever runs. That's why `queryBy` returns `null` instead.
- `findBy` keeps retrying (every 50 ms, for up to 1000 ms by default) until the element appears. Use it for anything that shows up **later**: after a fetch, a timeout, or an async state update. Don't forget the `await`.
- Each one also has an `...AllBy` version (`getAllByRole('listitem')`) that returns an **array** when you expect several matches. Plain `getBy` throws if it finds **more than one** match.

**Testing forms:**

```tsx
test('submits the email', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();                         // a fake function that records calls
  render(<LoginForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText(/email/i), 'a@b.com');
  await user.click(screen.getByRole('button', { name: /log in/i }));

  expect(onSubmit).toHaveBeenCalledWith({ email: 'a@b.com' });
  expect(onSubmit).toHaveBeenCalledTimes(1);
});
```

**Understanding this test:**
- `getByLabelText(/email/i)` finds the input connected to a `<label>Email</label>` (via `htmlFor`/`id` or by wrapping the input). If the test can't find the input by its label, the form isn't properly labelled for screen readers either.
- `user.type` types **one character at a time**, firing keydown, keypress, input and keyup for each, just like a real person. So `onChange` runs once per character, and any validation-as-you-type logic is exercised too.
- `vi.fn()` creates a **mock function** that remembers every call. The component doesn't know it's fake. We then check it was called with the right data, which proves the form gathered and submitted the values correctly.
- Also test the **unhappy path**: submitting with an invalid email should show an error message and **not** call `onSubmit`:

```tsx
test('shows a validation error and does not submit', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<LoginForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText(/email/i), 'not-an-email');
  await user.click(screen.getByRole('button', { name: /log in/i }));

  expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i);
  expect(onSubmit).not.toHaveBeenCalled();
});
```

Other useful user-event actions: `user.clear(input)`, `user.selectOptions(select, 'admin')`, `user.keyboard('{Enter}')`, `user.tab()` (to test keyboard navigation), `user.upload(fileInput, file)`, `user.hover(el)`.

**Mocking, explained.** A mock replaces a real thing (an API, a module, a timer) with a fake you control, so tests are fast and predictable.

**Why mock at all?** Real dependencies make tests **slow** (network calls), **flaky** (servers go down, data changes), and **hard to control** (how do you make a real API return a 500 error on demand?). A mock lets you decide exactly what happens: "this time the API returns two users", "this time it fails". The rule of thumb: mock things **at the edges** of your app (network, time, randomness, browser APIs), and keep your own components and hooks real.

```ts
// 1. Mock a function
const callback = vi.fn().mockReturnValue(42);

// 2. Mock a whole module (hoisted to the top of the file automatically)
vi.mock('./api', () => ({ fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'Ann' }) }));

// 3. Spy on an existing method
const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

// 4. Fake timers (for debounce, setTimeout)
vi.useFakeTimers();
search('re');
vi.advanceTimersByTime(500);   // jump 500ms forward instantly
expect(fetchResults).toHaveBeenCalledWith('re');
vi.useRealTimers();
```

**Each kind of mock explained:**
1. **`vi.fn()`** is a blank fake function. Pass it as a prop or callback and later ask it questions: was it called? How many times? With what arguments? You can program what it returns: `mockReturnValue` (sync), `mockResolvedValue` (returns a resolved promise), `mockRejectedValue` (returns a rejected promise), `mockImplementation(fn)` (custom logic), and the `...Once` versions for a single call.
2. **`vi.mock('./api')`** replaces **every export** of a module for the whole test file. Vitest moves this call to the top of the file ("hoisting"), so it's in place before your component imports `./api`. Use `vi.mocked(fetchUser)` to get proper TypeScript types on the mocked function.
3. **`vi.spyOn(obj, 'method')`** wraps a **real** method so you can watch calls, and optionally replace its behaviour. The example silences `console.error` (useful when testing error boundaries, which log loudly). Call `spy.mockRestore()`, or enable `restoreMocks` in config, to put the original back.
4. **Fake timers** replace `setTimeout`, `setInterval` and `Date` with a controllable clock. A test for a 500 ms debounce finishes in milliseconds instead of really waiting, and it's 100% deterministic. Always switch back with `vi.useRealTimers()` (in `afterEach`), or later tests will hang.

**Testing a component that fetches data, with MSW.** MSW intercepts network requests and returns fake responses, so your component code runs exactly as in production.

```tsx
// mocks/server.ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
export const server = setupServer(
  http.get('/api/users', () => HttpResponse.json([{ id: 1, name: 'Ann' }])),
);

// setupTests.ts
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// UserList.test.tsx
test('shows users', async () => {
  renderWithClient(<UserList />);
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
  expect(await screen.findByText('Ann')).toBeInTheDocument();
});

test('shows an error', async () => {
  server.use(http.get('/api/users', () => new HttpResponse(null, { status: 500 })));
  renderWithClient(<UserList />);
  expect(await screen.findByText(/error/i)).toBeInTheDocument();
});
```

**Why MSW beats mocking `fetch` or axios directly:**
- With `vi.mock('axios')`, your test is tied to the **HTTP library**. Switch from axios to fetch (or to TanStack Query with a different client) and every test breaks, even though the app works the same.
- MSW works at the **network level**, so your real `fetch` call, your real API client, your real TanStack Query setup and your real error handling all run. Only the server is fake.
- The same handlers can be reused in **Storybook** and in the **browser during development** (with a service worker), so you can build UI before the backend exists.

**How the lifecycle works:**
- `server.listen()` starts intercepting requests before any test runs.
- `server.use(...)` adds a **temporary override** for one test (like the 500 error above). It takes priority over the default handlers.
- `server.resetHandlers()` after each test removes those overrides, so the error from one test doesn't leak into the next.
- `server.close()` stops intercepting at the end.
- Tip: use `server.listen({ onUnhandledRequest: 'error' })` so a test fails loudly if the component calls an endpoint you forgot to mock.

**What the two tests cover:** the first checks the **loading state** (synchronously, right after render) and then the **success state** (with `findBy`, since data arrives later). The second checks the **error state**. Every fetching component should have tests for loading, success, error and usually **empty** (`HttpResponse.json([])`).

**A render helper for providers** (TanStack Query, Router):

```tsx
export function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); // fresh per test, no retries
  return render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}
```

**Why you need it:** components that call `useQuery`, `useNavigate` or `useContext(Theme)` crash if rendered alone ("No QueryClient set", "useNavigate() may be used only in the context of a Router"). In the real app those providers wrap everything in `main.tsx`, but a test renders just one component. Instead of repeating the providers in every test, put them in one helper.

**Why each detail matters:**
- A **new `QueryClient` per test**: the query cache would otherwise carry data from one test into the next ("why does my error test show the users from the previous test?").
- **`retry: false`**: TanStack Query retries failed queries 3 times with backoff by default. Your error test would wait several seconds and `findBy` would time out before the error appears.
- **`MemoryRouter`**: a router that keeps the URL in memory instead of the browser address bar, which is perfect for tests. Pass `initialEntries={['/users/1']}` to start on a specific route.
- Many teams name this helper `render` and re-export everything from RTL in a `test-utils.tsx` file, so tests just `import { render, screen } from '@/test/test-utils'`.

**Testing a custom hook:**

```tsx
import { renderHook, act } from '@testing-library/react';

test('useToggle flips the value', () => {
  const { result } = renderHook(() => useToggle());
  expect(result.current[0]).toBe(false);
  act(() => result.current[1]());          // act = "apply this state update"
  expect(result.current[0]).toBe(true);
});
```

**How `renderHook` works:** hooks can only run inside a component, so `renderHook` creates a tiny invisible test component that calls your hook. `result.current` always holds the hook's **latest** return value. Read it **after** the update: don't save `const [value] = result.current` at the top and expect it to change, because it's a snapshot (the same "each render is a snapshot" rule as in components).

**Why `act()` here?** In component tests, user-event already wraps actions in `act` for you. Here we call the hook's function directly, so we wrap it in `act` ourselves. That tells React to process the state update and re-render before we assert.

**Hooks with props or providers:**

```tsx
const { result, rerender } = renderHook(({ id }) => useUser(id), {
  initialProps: { id: 1 },
  wrapper: ({ children }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>,
});
rerender({ id: 2 });   // simulate the prop changing
```

**When to test a hook directly vs through a component:** test the hook directly if it's **reusable** and has its own logic (`useDebounce`, `useLocalStorage`). If the hook is only used by one component, test it **through that component**. That's closer to how users experience it.

### Jest vs Vitest

|  | Jest | Vitest |
| --- | --- | --- |
| Engine | Own runner, transforms with Babel or ts-jest | Built on Vite, reuses vite.config, native ESM + TS |
| Speed | Slower on big TS/ESM projects | Usually faster, with an instant watch mode |
| API | `jest.fn`, `jest.mock`, `jest.spyOn` | Jest-compatible: `vi.fn`, `vi.mock`, `vi.spyOn` |
| Environment | jsdom via config | `environment: 'jsdom'` or `'happy-dom'`; also has browser mode |
| Use when | Legacy, CRA, Webpack projects | Vite projects |

**The short version for interviews:** they do the same job with almost the same API. The real difference is the **transform pipeline**.
- Jest has to translate your TypeScript, JSX and ES modules through Babel or ts-jest. That's an extra config to maintain, and ESM support has historically been painful (e.g. ESM-only packages in `node_modules` need `transformIgnorePatterns` tweaks).
- Vitest reuses **the same Vite config and plugins as your app** (aliases like `@/`, env variables, SCSS handling). Tests are transformed exactly like your dev build, with no second config to keep in sync.
- **Watch mode:** Vitest uses Vite's module graph to re-run only the tests affected by the file you changed, so feedback is nearly instant.
- **Migrating** from Jest is usually small: replace `jest.` with `vi.`, set `globals: true` and `environment: 'jsdom'`, and fix a few `vi.mock` factories. Jest still has the biggest ecosystem and is the default in many older projects and React Native.
- **What to say:** "On a Vite project I'd pick Vitest: one config, native ESM and TypeScript, faster watch mode. On an existing Webpack/CRA project with hundreds of Jest tests, I wouldn't migrate just for the sake of it."

### React Testing Library

- **Query priority:** `getByRole` (with `{ name }`) > `getByLabelText` > `getByPlaceholderText` > `getByText` > `getByTestId` as a last resort.
- **Query variants:** `getBy` throws if missing; `queryBy` returns null (use it to assert absence); `findBy` returns a promise and waits (use it for async UI).
- **`userEvent` over `fireEvent`:** `userEvent` simulates real interactions (focus, keydown, input). Always `await user.click(...)` after `const user = userEvent.setup()`.
- **Assertions** come from `@testing-library/jest-dom`: `toBeInTheDocument`, `toHaveTextContent`, `toBeDisabled`.
- **Async:** `await screen.findByText(...)` or `await waitFor(() => expect(...))`.
- **Mocking the network:** prefer MSW (Mock Service Worker) over mocking `fetch` or axios directly.
- **Hooks:** `renderHook` from `@testing-library/react`.
- Wrap providers (QueryClientProvider, Router, Theme) in a custom `render` helper.

**Why the query priority is in that order:** it goes from "how **everyone** finds things" to "how **only developers** find things".
- **Role + name** is how sighted users *and* screen-reader users find a control ("the Save button").
- **Label** is how users find form fields.
- **Placeholder** is weaker, because placeholders disappear when you type and aren't a replacement for labels.
- **Text** is fine for non-interactive content (paragraphs, messages).
- **`data-testid`** is invisible to users. Use it only when nothing else works (e.g. a chart canvas or a container with no semantic role). It also doesn't catch accessibility problems.

**`waitFor` explained:** `waitFor(callback)` re-runs the callback until it stops throwing (or until the timeout, 1000 ms by default). Use it when you're waiting for something that **isn't an element appearing**, for example a mock being called:

```tsx
await waitFor(() => expect(onSave).toHaveBeenCalledWith({ title: 'New' }));
```

Put **only assertions** inside `waitFor`. A click inside it would run again on every retry.

**`within` scopes a query** to part of the page, e.g. "the delete button in Ann's row":

```tsx
const row = screen.getByRole('row', { name: /ann/i });
await user.click(within(row).getByRole('button', { name: /delete/i }));
```

```tsx
test('adds a todo', async () => {
  const user = userEvent.setup();
  render(<TodoApp />);
  await user.type(screen.getByRole('textbox', { name: /new todo/i }), 'Buy milk');
  await user.click(screen.getByRole('button', { name: /add/i }));
  expect(await screen.findByText('Buy milk')).toBeInTheDocument();
});
```

**What this test proves:** a user can type a todo and add it, and it appears in the list. It doesn't care whether todos are stored in `useState`, `useReducer`, Zustand or the server, which is exactly why it survives refactors. `findByText` (instead of `getByText`) also makes the test work if adding becomes async later, e.g. when saving moves to an API.

### Mocking essentials

- `vi.fn()` / `jest.fn()`: spy functions; check with `toHaveBeenCalledWith`.
- `vi.mock('./api')`: mocks a whole module. Mocks are hoisted above imports.
- `vi.spyOn(obj, 'method').mockReturnValue(...)`: wraps a single method.
- Fake timers: `vi.useFakeTimers()` + `vi.advanceTimersByTime(500)` for debounce tests.
- Reset between tests: `mockClear` (clears calls), `mockReset` (also clears the implementation), `mockRestore` (restores the original).

**The three resets compared, using `const fn = vi.fn().mockReturnValue(42)` that's been called twice:**

| Method | Call history | Fake return value (42) | Original method (for spies) |
| --- | --- | --- | --- |
| `mockClear()` | Cleared | Kept | Still mocked |
| `mockReset()` | Cleared | Removed (returns `undefined`) | Still mocked |
| `mockRestore()` | Cleared | Removed | **Original put back** |

Instead of calling these by hand, set `clearMocks: true` or `restoreMocks: true` in the test config so it happens automatically after every test. That prevents the classic bug "this test passes alone but fails when run with the others", caused by call counts carrying over.

**What NOT to mock:** your own child components, your own hooks, or React itself. If you mock everything the component uses, the test only checks that the mocks were wired together. It can pass while the real app is broken. Mocking is for things you **don't control** or that are **slow or non-deterministic**: network, time, randomness (`Math.random`, `crypto.randomUUID`), and browser APIs jsdom lacks.

### Likely questions

- Unit vs integration vs E2E? (Testing pyramid or "testing trophy". E2E tools: Playwright, Cypress.)
- Why avoid testing implementation details?
- How do you test a component that fetches data?
- `getBy` vs `queryBy` vs `findBy`?
- What is snapshot testing, and its downside? (Brittle diffs that people approve without reading.)

**Short model answers:**

- **Unit vs integration vs E2E:** a **unit** test checks one small piece alone (a utility function, a hook), so it's fast and precise. An **integration** test checks several pieces working together, like a form component with its inputs, validation and submit, with only the network mocked. An **E2E** test drives a real browser through the real app ("log in, add to cart, check out"). It gives the most confidence, but it's slowest and most brittle. The **pyramid** says "mostly unit tests". The **testing trophy** (Kent C. Dodds) says "mostly integration tests", because for UI that's where the confidence-per-effort is highest, with static checks (TypeScript, ESLint) as the base.
- **Why avoid implementation details:** tests that check internal state or private functions break when you refactor, even though nothing changed for the user. That's a **false negative**. They can also pass while the UI is broken, which is a **false positive**. Both erode trust in the test suite. Testing through the UI gives you tests that only fail when something users care about actually breaks.
- **How to test a data-fetching component:** render it with a fresh QueryClient (`retry: false`), mock the API with MSW, then assert the loading state, the success state with `findBy`, and the error and empty states with `server.use` overrides.
- **`getBy` vs `queryBy` vs `findBy`:** `getBy` throws if the element is missing (default for elements that should be there now), `queryBy` returns `null` (for asserting something is **not** there), and `findBy` returns a promise that waits up to ~1 s (for elements that appear asynchronously).
- **Snapshot testing:** `expect(container).toMatchSnapshot()` saves the rendered output to a file and fails when it changes. The downside: large snapshots change on every small markup tweak, so developers press "update snapshot" without reading the diff, and the test stops protecting anything. It's fine for **small, stable** outputs (an error message object, a config transform). Prefer explicit assertions for components.

### Gotchas

- "not wrapped in act(...)" warnings: you didn't await an async update. Use `findBy` or `waitFor`.
- Don't put side effects inside `waitFor`; only assertions.
- Forgetting `await` with `userEvent` v14.
- Shared mock state leaking between tests. Use `restoreMocks` / `clearMocks` in config.
- Testing internal state or class names instead of what the user sees.

**Why each one happens and how to fix it:**

- **The `act(...)` warning:** React is telling you "a state update happened after your test stopped watching". Typically a fetch resolved after the test's last assertion, so the component updated when nobody was looking. Don't silence it by wrapping things in `act` yourself. Instead **wait for the final UI state** with `await screen.findBy...` so the test only ends after the update has happened.
- **Side effects inside `waitFor`:** `waitFor` calls its callback **many times** (every 50 ms) until it passes. A `user.click()` inside would click repeatedly. Do the action first, then `waitFor` the assertion.

  ```tsx
  // ❌ await waitFor(() => { user.click(button); expect(x).toBe(1); });
  // ✅
  await user.click(button);
  await waitFor(() => expect(x).toBe(1));
  ```

- **Forgetting `await` with user-event:** since v14 every user-event call returns a promise. Without `await`, the assertion runs **before** the click or typing has finished, so the test fails randomly or passes for the wrong reason. Turn on the ESLint rules from `eslint-plugin-testing-library` (e.g. `await-async-events`) to catch it automatically.
- **Mock state leaking between tests:** a mock function's call count and fake return values persist across tests in the same file unless reset. Test B then sees calls from test A, and tests pass or fail depending on the **order** they run in. Set `restoreMocks: true` (or `clearMocks`) in config, and reset MSW handlers and fake timers in `afterEach`.
- **Testing internals or class names:** `expect(button).toHaveClass('btn-primary')` breaks when the design system renames a class and tells you nothing about behaviour. Check what the user experiences instead: `toBeDisabled()`, `toHaveTextContent()`, `toBeVisible()`, `toHaveAttribute('aria-expanded', 'true')`.
- **Bonus: tests that pass when they shouldn't.** Always see a test **fail** once (break the code temporarily or flip the assertion). A test that can't fail is worse than no test, because it gives false confidence.
