# 04 · Navigation with Expo Router

## 1. File-based routing

> **In short:** Expo Router maps files in `app/` to screens, exactly like Next.js maps files to pages — and it's built on React Navigation underneath.

```
app/
  _layout.tsx              # root layout: providers + the root navigator
  index.tsx                # /
  (tabs)/
    _layout.tsx            # tab navigator
    index.tsx              # /(tabs)/ → the first tab
    tasks.tsx              # /tasks
    settings.tsx           # /settings
  tasks/
    [id].tsx               # /tasks/42
    new.tsx                # /tasks/new
  (auth)/
    login.tsx              # /login
  +not-found.tsx           # unmatched routes
```

| Convention | Meaning |
| --- | --- |
| `_layout.tsx` | A navigator/layout wrapping the folder's screens |
| `(group)` | Groups files without adding a URL segment |
| `[param]` | Dynamic segment |
| `[...rest]` | Catch-all |
| `+not-found.tsx` | 404 screen |
| `+html.tsx`, `+native-intent.ts` | Web/deep-link entry customisation |

Benefits over manual React Navigation: deep links work automatically, routes are typed (`experiments.typedRoutes`), and the structure is obvious to a new developer.

## 2. Stack navigation

> **In short:** A stack pushes screens on top of each other with a back gesture and header, which is the default pattern for drill-down flows.

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: '#fff' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="tasks/[id]" options={{ title: 'Task' }} />
      <Stack.Screen name="tasks/new" options={{ presentation: 'modal', title: 'New task' }} />
      <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
    </Stack>
  );
}
```

```tsx
// Per-screen options, set from inside the screen
import { Stack } from 'expo-router';

export default function TaskScreen() {
  const { task } = useTask();
  return (
    <>
      <Stack.Screen options={{ title: task.title, headerRight: () => <EditButton /> }} />
      <TaskDetails task={task} />
    </>
  );
}
```

Useful `presentation` values: `card` (default), `modal`, `transparentModal`, `fullScreenModal`.

## 3. Tabs

> **In short:** A tab layout is a `_layout.tsx` exporting `<Tabs>`; each file in the group becomes a tab.

```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#4f46e5', headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="tasks"
        options={{ title: 'Tasks', tabBarBadge: openCount || undefined,
                   tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} /> }}
      />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
```

Other navigators: `<Drawer>` (needs `react-native-gesture-handler` + `react-native-reanimated`), and React Navigation's material top tabs.

## 4. Navigating

> **In short:** `<Link>` for declarative navigation, `useRouter()` for imperative, and `router.replace` when the user shouldn't go back.

```tsx
import { Link, useRouter, useLocalSearchParams, useSegments, usePathname } from 'expo-router';

<Link href="/tasks">Tasks</Link>
<Link href={{ pathname: '/tasks/[id]', params: { id: task.id } }} asChild>
  <Pressable><Text>{task.title}</Text></Pressable>          {/* asChild: style your own component */}
</Link>

const router = useRouter();
router.push('/tasks/42');            // add to the stack
router.replace('/(tabs)');           // replace (after login)
router.back();
router.dismiss();                    // close a modal
router.setParams({ filter: 'open' });
```

```tsx
// Reading params in the target screen
const { id, filter } = useLocalSearchParams<{ id: string; filter?: string }>();
```

⚠️ Params arrive as **strings** (or arrays) — convert and validate them. For large objects, pass an id and fetch, don't serialize the object into the URL.

## 5. Layouts and shared UI

> **In short:** Layouts wrap their folder's screens, so put providers, auth guards and shared chrome there.

```tsx
// app/_layout.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [client] = useState(() => new QueryClient());
  const { isLoading } = useAuthBootstrap();

  useEffect(() => { if (!isLoading) SplashScreen.hideAsync(); }, [isLoading]);
  if (isLoading) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <Stack />
          <StatusBar style="auto" />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

## 6. Auth flows

> **In short:** Keep auth state in context and either redirect with `<Redirect>` in a protected layout, or use route groups for signed-in vs signed-out stacks.

```tsx
// app/(app)/_layout.tsx — everything inside requires a session
import { Redirect, Stack } from 'expo-router';

export default function AppLayout() {
  const { session, isLoading } = useSession();
  if (isLoading) return <SplashPlaceholder />;
  if (!session) return <Redirect href="/login" />;
  return <Stack />;
}
```

```
app/
  (app)/          ← protected
    _layout.tsx
    (tabs)/…
  (auth)/         ← public
    login.tsx
    register.tsx
```

After login: `router.replace('/(app)')` so the back gesture can't return to the login screen.

## 7. Deep links and universal links

> **In short:** Expo Router turns your file structure into a URL scheme automatically; register a custom scheme and (for production) associated domains.

```json
// app.json
{ "expo": { "scheme": "taskmate",
  "ios": { "associatedDomains": ["applinks:tasks.example.com"] },
  "android": { "intentFilters": [{ "action": "VIEW", "autoVerify": true,
    "data": [{ "scheme": "https", "host": "tasks.example.com" }],
    "category": ["BROWSABLE", "DEFAULT"] }] } } }
```

```bash
npx uri-scheme open taskmate://tasks/42 --ios          # test a deep link
```

`taskmate://tasks/42` and `https://tasks.example.com/tasks/42` both open the task screen. Universal links (iOS) and App Links (Android) also need `apple-app-site-association` and `assetlinks.json` served from your domain.

## 8. Modals, headers and gestures

> **In short:** Modals are just screens with `presentation: 'modal'`; headers and back behaviour are configured per screen.

```tsx
<Stack.Screen
  name="tasks/new"
  options={{
    presentation: 'modal',
    title: 'New task',
    headerLeft: () => <Button title="Cancel" onPress={() => router.back()} />,
    gestureEnabled: false,              // prevent swipe-dismiss while a form is dirty
  }}
/>
```

Android hardware back:

```tsx
import { useFocusEffect } from 'expo-router';
import { BackHandler } from 'react-native';

useFocusEffect(useCallback(() => {
  const sub = BackHandler.addEventListener('hardwareBackPress', () => { confirmDiscard(); return true; });
  return () => sub.remove();
}, []));
```

## 9. Screen lifecycle

> **In short:** `useFocusEffect` runs when a screen gains focus — unlike `useEffect`, it re-runs when you navigate back to a screen that stayed mounted.

```tsx
import { useFocusEffect } from 'expo-router';

useFocusEffect(useCallback(() => {
  analytics.screen('TaskList');
  const id = setInterval(refetch, 30_000);
  return () => clearInterval(id);         // runs on blur
}, [refetch]));
```

This is a common interview question: a screen deeper in a stack stays mounted, so `useEffect(..., [])` does **not** run again when you come back to it.

## 10. React Navigation directly

> **In short:** Expo Router is built on React Navigation, so you can drop to its APIs when you need something the router doesn't expose.

```tsx
import { useNavigation } from 'expo-router';
const navigation = useNavigation();
navigation.setOptions({ title: 'Updated' });
```

If you join a project using React Navigation without Expo Router, the concepts (stacks, tabs, params, options) are identical — only the setup is manual.

---

## 11. Exercises

1. Build the `(tabs)` layout with Home, Tasks and Settings tabs and icons.
2. Add `tasks/[id]` with a title from the task, and navigate from a list row.
3. Add `tasks/new` as a modal with a Cancel button.
4. Add an `(app)`/`(auth)` split with a `<Redirect>` guard; log in and confirm you can't swipe back to login.
5. Register the `taskmate://` scheme and open `taskmate://tasks/42` from the terminal.
6. Use `useFocusEffect` to log analytics only when a screen is focused; prove `useEffect` doesn't fire on back navigation.
