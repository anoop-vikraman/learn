## 4. Testing: Jest, Vitest, Testing Library

The philosophy to quote: "The more your tests resemble the way your software is used, the more confidence they give you." Test behaviour, not implementation details.

### Explained simply (read this first)

**Three tools, three jobs:**

- **Jest or Vitest = the test runner.** It finds `*.test.ts` files, runs them, and gives you `describe`, `test`, `expect` and mocking. Vitest is basically "Jest, but built on Vite" with almost the same API.
- **jsdom = a fake browser** inside Node, so components can render without a real browser.
- **React Testing Library (RTL) = how you interact with components** in tests, the way a user would: find a button by its text, click it, check what appears.

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

**Common matchers:** `toBe` (exact, for primitives), `toEqual` (deep equality, for objects/arrays), `toBeTruthy`, `toContain`, `toThrow`, `toHaveBeenCalledWith`, `toHaveLength`. `toBe({a:1})` fails because two objects are never the same reference; use `toEqual`.

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

**Why `getByRole`?** It finds elements the way screen readers do (button, textbox, heading, checkbox), so your test also checks accessibility. If you can't find something by role, real users with assistive tech probably can't either.

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

**Mocking, explained.** A mock replaces a real thing (an API, a module, a timer) with a fake you control, so tests are fast and predictable.

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

**A render helper for providers** (TanStack Query, Router):

```tsx
export function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); // fresh per test, no retries
  return render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}
```

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

### Jest vs Vitest

|  | Jest | Vitest |
| --- | --- | --- |
| Engine | Own runner, transforms with Babel or ts-jest | Built on Vite, reuses vite.config, native ESM + TS |
| Speed | Slower on big TS/ESM projects | Usually faster, with an instant watch mode |
| API | `jest.fn`, `jest.mock`, `jest.spyOn` | Jest-compatible: `vi.fn`, `vi.mock`, `vi.spyOn` |
| Environment | jsdom via config | `environment: 'jsdom'` or `'happy-dom'`; also has browser mode |
| Use when | Legacy, CRA, Webpack projects | Vite projects |

### React Testing Library

- **Query priority:** `getByRole` (with `{ name }`) > `getByLabelText` > `getByPlaceholderText` > `getByText` > `getByTestId` as a last resort.
- **Query variants:** `getBy` throws if missing; `queryBy` returns null (use it to assert absence); `findBy` returns a promise and waits (use it for async UI).
- **`userEvent` over `fireEvent`:** `userEvent` simulates real interactions (focus, keydown, input). Always `await user.click(...)` after `const user = userEvent.setup()`.
- **Assertions** come from `@testing-library/jest-dom`: `toBeInTheDocument`, `toHaveTextContent`, `toBeDisabled`.
- **Async:** `await screen.findByText(...)` or `await waitFor(() => expect(...))`.
- **Mocking the network:** prefer MSW (Mock Service Worker) over mocking `fetch` or axios directly.
- **Hooks:** `renderHook` from `@testing-library/react`.
- Wrap providers (QueryClientProvider, Router, Theme) in a custom `render` helper.

```tsx
test('adds a todo', async () => {
  const user = userEvent.setup();
  render(<TodoApp />);
  await user.type(screen.getByRole('textbox', { name: /new todo/i }), 'Buy milk');
  await user.click(screen.getByRole('button', { name: /add/i }));
  expect(await screen.findByText('Buy milk')).toBeInTheDocument();
});
```

### Mocking essentials

- `vi.fn()` / `jest.fn()`: spy functions; check with `toHaveBeenCalledWith`.
- `vi.mock('./api')`: mocks a whole module. Mocks are hoisted above imports.
- `vi.spyOn(obj, 'method').mockReturnValue(...)`: wraps a single method.
- Fake timers: `vi.useFakeTimers()` + `vi.advanceTimersByTime(500)` for debounce tests.
- Reset between tests: `mockClear` (clears calls), `mockReset` (also clears the implementation), `mockRestore` (restores the original).

### Likely questions

- Unit vs integration vs E2E? (Testing pyramid or "testing trophy". E2E tools: Playwright, Cypress.)
- Why avoid testing implementation details?
- How do you test a component that fetches data?
- `getBy` vs `queryBy` vs `findBy`?
- What is snapshot testing, and its downside? (Brittle diffs that people approve without reading.)

### Gotchas

- "not wrapped in act(...)" warnings: you didn't await an async update. Use `findBy` or `waitFor`.
- Don't put side effects inside `waitFor`; only assertions.
- Forgetting `await` with `userEvent` v14.
- Shared mock state leaking between tests. Use `restoreMocks` / `clearMocks` in config.
- Testing internal state or class names instead of what the user sees.

