# 03 · Testing React Native apps

## 1. The testing pyramid on mobile

> **In short:** Many unit tests, a solid layer of component tests with React Native Testing Library, and a few E2E flows on real devices — plus manual testing on low-end hardware.

| Level | Tool | Covers |
| --- | --- | --- |
| Unit | Jest / Vitest | Pure logic, hooks, reducers, formatters |
| Component | **React Native Testing Library** | Screens render, user interactions work |
| Integration | RNTL + MSW | A screen with mocked network and navigation |
| **E2E** | **Maestro** (simple) or **Detox** (powerful) | Real flows on a simulator/device |
| Manual / device cloud | BrowserStack, Firefox/Sauce, real phones | Platform quirks, performance, store builds |

## 2. Setup

> **In short:** `jest-expo` configures Jest for the Expo/RN environment; RNTL gives you user-centric queries.

```bash
npx expo install -- --save-dev jest jest-expo @testing-library/react-native @testing-library/jest-native
```

```json
// package.json
{
  "scripts": { "test": "jest", "test:watch": "jest --watch" },
  "jest": {
    "preset": "jest-expo",
    "setupFilesAfterEnv": ["<rootDir>/jest.setup.ts"],
    "transformIgnorePatterns": [
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))"
    ],
    "collectCoverageFrom": ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "!**/*.d.ts"]
  }
}
```

⚠️ `transformIgnorePatterns` is the #1 source of "unexpected token export" errors — RN libraries ship untranspiled ESM and must be allow-listed.

```ts
// jest.setup.ts
import '@testing-library/jest-native/extend-expect';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
```

## 3. Component tests

> **In short:** Render a component, query the way a user perceives it (text, labels, roles), interact, and assert on what's visible.

```tsx
import { render, screen, fireEvent, userEvent, waitFor } from '@testing-library/react-native';
import { TaskForm } from '../components/TaskForm';

test('shows a validation error for an empty title', async () => {
  const onSubmit = jest.fn();
  render(<TaskForm onSubmit={onSubmit} />);

  fireEvent.press(screen.getByRole('button', { name: /save/i }));

  expect(await screen.findByText('Title is required')).toBeVisible();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('submits a valid task', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  render(<TaskForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText('Task title'), 'Write tests');
  await user.press(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Write tests' })));
});
```

Query priority, best first: `getByRole` → `getByLabelText` (accessibility label) → `getByText`/`getByPlaceholderText` → `getByTestId` (last resort).

```tsx
<Pressable accessibilityRole="button" accessibilityLabel="Delete task" testID="delete-task">
```

Writing for testability also improves accessibility — the same labels serve both.

## 4. Testing hooks and data

> **In short:** `renderHook` for custom hooks; wrap in the providers the hook needs and mock the network.

```tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

test('useTasks loads tasks', async () => {
  const { result } = renderHook(() => useTasks('open'), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toHaveLength(2);
});
```

Mock HTTP with **MSW** (`msw/native`) so you test your real fetch code rather than a stubbed client.

## 5. Mocking native modules

> **In short:** Native modules don't exist in Jest — mock them, and prefer wrapping them in your own module so there's one place to mock.

```ts
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
  CameraView: 'CameraView',
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
```

## 6. End-to-end with Maestro

> **In short:** Maestro drives a real build with simple YAML flows and is far easier to set up than Detox — the usual recommendation for Expo apps.

```yaml
# .maestro/create-task.yaml
appId: com.example.taskmate
---
- launchApp:
    clearState: true
- tapOn: "Email"
- inputText: "demo@example.com"
- tapOn: "Password"
- inputText: "password123"
- tapOn: "Sign in"
- assertVisible: "Tasks"
- tapOn:
    id: "add-task"
- inputText: "Buy milk"
- tapOn: "Save"
- assertVisible: "Buy milk"
```

```bash
maestro test .maestro/            # against a running simulator/emulator with the app installed
```

**Detox** (grey-box, JS-based, synchronises with the app) is more powerful and more work to maintain; choose it when you need fine-grained control or already have it.

E2E tests run against a **development or preview build**, not Expo Go — which makes them a natural CI step after EAS Build ([../04-Build-Deploy/04-ci-cd-pipelines.md](../04-Build-Deploy/04-ci-cd-pipelines.md)).

## 7. What to test

> **In short:** Test behaviour users depend on — auth, core flows, offline, permissions and error paths — not implementation details.

| Priority | Examples |
| --- | --- |
| Must | Login/logout, create/edit/delete the core entity, navigation between main screens |
| Must | Validation errors, API error handling, empty states |
| Should | Offline queueing, permission denied paths, deep links |
| Should | Hooks with tricky logic (token refresh, sync) |
| Nice | Snapshot tests for design-system components (keep them small and intentional) |
| Don't | Styling details, third-party library internals, exact snapshot trees of whole screens |

## 8. Running tests in CI

> **In short:** Unit and component tests on every PR; E2E on a schedule or before release, because they're slow.

```yaml
# .github/workflows/test.yml (sketch)
- uses: actions/setup-node@v4
  with: { node-version-file: .nvmrc, cache: npm }
- run: npm ci
- run: npx tsc --noEmit
- run: npm test -- --coverage --maxWorkers=2
```

Add `npx expo-doctor` and an ESLint run. E2E typically runs on macOS runners (iOS simulator) or an Android emulator action, against an EAS build artifact.

## 9. Manual testing that still matters

> **In short:** Some classes of bug only appear on real hardware — budget time for them before every release.

- A real **low-end Android** device (performance, memory, ANRs).
- **Offline and flaky network** (airplane mode mid-request, 3G throttling).
- **Permissions denied** and later granted from Settings.
- **Dark mode**, **large font sizes**, and screen readers.
- **Interruptions**: incoming call, app backgrounded for an hour, OS killing the app.
- **Deep links** from a cold start.
- **Upgrade path**: install the previous version, then update over it (data migrations!).

---

## 10. Exercises

1. Set up jest-expo + RNTL and test the task form's validation and submit paths.
2. Mock `expo-secure-store` and test the auth context's session-restore logic.
3. Test `useTasks` with MSW covering success, empty and 500 responses.
4. Write a Maestro flow for login → create task → verify it appears.
5. Add a CI job running type-check, lint and tests with coverage.
6. Do a manual pass on a low-end Android device and write down every issue you find.
