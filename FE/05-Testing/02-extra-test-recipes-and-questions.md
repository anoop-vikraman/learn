# Testing extra: recipes, examples and Q&A

## Mocking modules (Vitest syntax; Jest is the same with `jest.` instead of `vi.`)

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getUser } from './api';
import { formatUser } from './formatUser';

vi.mock('./api', () => ({
  getUser: vi.fn(),
}));

describe('formatUser', () => {
  beforeEach(() => vi.mocked(getUser).mockReset());

  it('formats the name', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 1, first: 'Anoop', last: 'V' });
    await expect(formatUser(1)).resolves.toBe('Anoop V');
    expect(getUser).toHaveBeenCalledWith(1);
  });

  it('handles errors', async () => {
    vi.mocked(getUser).mockRejectedValue(new Error('404'));
    await expect(formatUser(1)).rejects.toThrow('404');
  });
});
```

### Partial mock: keep the real module, override one export

```ts
vi.mock('./utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils')>();
  return { ...actual, generateId: vi.fn(() => 'fixed-id') };
});
```

### spyOn vs mock vs fn

```ts
const fn = vi.fn();                         // standalone fake function
const spy = vi.spyOn(console, 'error').mockImplementation(() => {}); // wrap a real method
spy.mockRestore();                          // put the original back
vi.mock('./module');                        // replace an entire module (hoisted to the top!)
```

## Fake timers (debounce, intervals)

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('debounces the search call', async () => {
  const onSearch = vi.fn();
  // advanceTimers lets userEvent work with fake timers
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<SearchBox onSearch={onSearch} delay={300} />);

  await user.type(screen.getByRole('searchbox'), 'react');
  expect(onSearch).not.toHaveBeenCalled();

  act(() => vi.advanceTimersByTime(300));
  expect(onSearch).toHaveBeenCalledTimes(1);
  expect(onSearch).toHaveBeenCalledWith('react');
});
```

Unit test for a plain debounce function:

```ts
it('calls once after the delay', () => {
  vi.useFakeTimers();
  const fn = vi.fn();
  const d = debounce(fn, 100);
  d('a'); d('b'); d('c');
  vi.advanceTimersByTime(99);
  expect(fn).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(fn).toHaveBeenCalledExactlyOnceWith('c');
});
```

## MSW: success, error and loading states

```ts
// src/mocks/handlers.ts
import { http, HttpResponse, delay } from 'msw';

export const handlers = [
  http.get('/api/users', async () => {
    await delay(50);
    return HttpResponse.json([{ id: 1, name: 'Ada' }]);
  }),
];

// src/mocks/server.ts
import { setupServer } from 'msw/node';
export const server = setupServer(...handlers);

// vitest.setup.ts
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

```tsx
it('shows users', async () => {
  renderWithProviders(<Users />);
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
  expect(await screen.findByText('Ada')).toBeInTheDocument();
});

it('shows an error when the API fails', async () => {
  server.use(http.get('/api/users', () => new HttpResponse(null, { status: 500 })));
  renderWithProviders(<Users />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});

it('shows empty state', async () => {
  server.use(http.get('/api/users', () => HttpResponse.json([])));
  renderWithProviders(<Users />);
  expect(await screen.findByText(/no users/i)).toBeInTheDocument();
});
```

## Testing a mutation (POST) and checking the request body

```tsx
it('submits the form', async () => {
  let body: unknown;
  server.use(
    http.post('/api/todos', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ id: 99, text: 'New' }, { status: 201 });
    }),
  );
  const user = userEvent.setup();
  renderWithProviders(<AddTodo />);
  await user.type(screen.getByLabelText(/todo/i), 'New');
  await user.click(screen.getByRole('button', { name: /add/i }));
  await waitFor(() => expect(body).toEqual({ text: 'New' }));
});
```

## Testing context / providers with a custom render

```tsx
// test-utils.tsx
export function renderWithProviders(ui: React.ReactElement, { route = '/', user = null } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.history.pushState({}, '', route);
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialUser={user}>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    ),
  };
}
```

## Testing custom hooks with `renderHook`

```tsx
import { renderHook, act } from '@testing-library/react';

it('useCounter increments', () => {
  const { result } = renderHook(() => useCounter(5));
  act(() => result.current.increment());
  expect(result.current.count).toBe(6);
});

it('useDebounce updates after delay', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ v }) => useDebounce(v, 200), { initialProps: { v: 'a' } });
  rerender({ v: 'ab' });
  expect(result.current).toBe('a');
  act(() => vi.advanceTimersByTime(200));
  expect(result.current).toBe('ab');
});
```

## Testing a component that throws (error boundary)

```tsx
it('renders fallback on crash', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});  // silence React's error log
  const Bomb = () => { throw new Error('boom'); };
  render(<ErrorBoundary fallback={<p>Oops</p>}><Bomb /></ErrorBoundary>);
  expect(screen.getByText('Oops')).toBeInTheDocument();
});
```

## Accessibility test with jest-axe / vitest-axe

```tsx
import { axe } from 'vitest-axe';
it('has no a11y violations', async () => {
  const { container } = render(<LoginForm />);
  expect(await axe(container)).toHaveNoViolations();
});
```

## Useful jest-dom matchers

`toBeInTheDocument`, `toBeVisible`, `toBeDisabled`, `toBeEnabled`, `toHaveValue`, `toBeChecked`, `toHaveTextContent`, `toHaveAttribute`, `toHaveClass`, `toHaveFocus`, `toHaveAccessibleName`, `toHaveAccessibleDescription`, `toBeRequired`, `toBeInvalid`.

## `within` (scope queries to part of the page)

```tsx
const row = screen.getByRole('row', { name: /ada/i });
await user.click(within(row).getByRole('button', { name: /delete/i }));
```

## Playwright E2E example (know the shape)

```ts
import { test, expect } from '@playwright/test';

test('user can log in', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('a@b.com');
  await page.getByLabel('Password').fill('secret123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

// Mock network in Playwright
await page.route('**/api/users', (route) => route.fulfill({ json: [{ id: 1, name: 'Ada' }] }));
```

## Vitest config with coverage

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'cobertura'],   // cobertura for GitLab MR coverage visualisation
      thresholds: { lines: 80, branches: 75 },
    },
  },
});
```

---

## Extra interview questions

**Q: What is the testing trophy?**
Kent C. Dodds' alternative to the pyramid: **static** (TypeScript, ESLint) at the base, a few **unit** tests, **mostly integration** tests (components with their children, and the network mocked at the boundary), and a few **E2E** tests. "The more your tests resemble the way your software is used, the more confidence they give you."

**Q: What should you test in a React component?**
Behaviour a user sees: rendered output for given props or state, interactions (click, type), async states (loading, error, empty), accessibility roles. Not: internal state values, method calls on instances, CSS class names, or exact implementation.

**Q: How do you decide what to mock?**
Mock at the **boundaries**: network (MSW), time (fake timers), randomness, browser APIs jsdom lacks (`matchMedia`, `IntersectionObserver`, `ResizeObserver`). Avoid mocking your own child components or hooks; that tests the wiring, not the behaviour.

**Q: `fireEvent` vs `userEvent`?**
`fireEvent` dispatches a single DOM event. `userEvent` simulates real interactions: typing triggers keydown, keypress, input and keyup for each character, plus focus changes and pointer events. Prefer `userEvent` (and remember to `await`).

**Q: What is `act()`?**
It makes sure all state updates, effects and re-renders are processed before you assert. RTL's `render`, `userEvent` and `findBy` already wrap `act`. You need it manually mainly for fake timers or direct hook calls.

**Q: `waitFor` vs `findBy`?**
`findBy*` = `waitFor` + `getBy*`, and is preferred for waiting for an element. Use `waitFor` for other async assertions (`expect(mock).toHaveBeenCalled()`). The default timeout is 1000 ms.

**Q: How do you test `localStorage`, `matchMedia`, `IntersectionObserver` in jsdom?**
`localStorage` exists in jsdom (clear it in `beforeEach`). For the others, add a stub in the setup file:
```ts
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })),
});
class IO { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); }
vi.stubGlobal('IntersectionObserver', IO);
```

**Q: What is code coverage, and is 100% the goal?**
The percentage of lines, branches and functions executed by tests. It shows untested code but **not** test quality. Aim for meaningful coverage of critical paths (around 70–80%) instead of chasing 100%.

**Q: What makes a test flaky, and how do you fix it?**
Real timers and network, shared state between tests, test order dependence, animations, not awaiting async work, unstable selectors. Fixes: MSW, fake timers, a fresh QueryClient and cleanup per test, role-based queries, `findBy` instead of fixed `sleep`s.

**Q: How do you test a component that uses React Router?**
Wrap it in `MemoryRouter` with `initialEntries`, or use `createMemoryRouter` + `RouterProvider` for data routers. Assert navigation by checking that the new page content appears.

**Q: Jest vs Vitest: migration gotchas?**
`jest.fn` → `vi.fn`, `jest.mock` → `vi.mock` (also hoisted), `globals: true` for `describe`/`it` without imports, `environment: 'jsdom'`, ESM-native (no Babel transform), and `vi.mock` factory must return all used exports.

**Q: What is TDD?**
Red (write a failing test), green (minimum code to pass), refactor. It's useful for pure logic and bug fixes: write a test that reproduces the bug first.
