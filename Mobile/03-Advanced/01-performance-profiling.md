# 01 · Performance and profiling

## 1. What "slow" means on mobile

> **In short:** Users judge three things — how fast the app opens, whether scrolling and gestures stay at 60 fps, and whether taps respond immediately.

| Area | Target | Usual cause when bad |
| --- | --- | --- |
| Cold start | < 2 s to interactive | Big bundle, work at module scope, eager native modules |
| Scrolling | 60 fps (120 on ProMotion) | Heavy list rows, unstable props, large images |
| Tap response | < 100 ms | Blocked JS thread |
| Navigation | < 300 ms | Expensive screen mount, synchronous data loading |
| Memory | No growth over time | Leaked listeners, unbounded caches, huge images |

⚠️ **Always measure in a release build on a real low-end Android device.** Development builds are slower in ways that don't reflect production, and iPhones hide problems that cheap Androids expose.

## 2. Measuring

> **In short:** Use the Perf Monitor for frame rates, the React DevTools Profiler for re-renders, and native profilers for startup and memory.

| Tool | Shows |
| --- | --- |
| **Perf Monitor** (dev menu) | JS fps and UI fps separately — the single most useful number |
| **React Native DevTools → Profiler** | Which components re-render and how long they take |
| `react-native-performance` | Startup markers, custom measurements |
| **Xcode Instruments** (Time Profiler, Allocations) | Native CPU, memory, startup |
| **Android Studio Profiler** / `adb shell am start -W` | CPU, memory, cold start timing |
| **Flashlight** (`flashlight test`) | Automated performance score on Android |
| Sentry / Firebase Performance | Real-user startup, slow/frozen frames |

Reading the two frame counters:
- **Low UI fps** → native rendering is heavy (too many views, shadows, large images, overdraw).
- **Low JS fps, smooth UI** → JS is busy but animations are on the UI thread (Reanimated working correctly).
- **Both low** → heavy renders blocking everything.

## 3. Startup time

> **In short:** Ship less JavaScript, do less at import time, and defer everything that isn't needed for the first screen.

```ts
// ❌ runs during bundle evaluation, before anything renders
import { analytics } from './analytics';
analytics.init();
const bigTable = buildLookupTable();         // 200 ms at startup

// ✅ defer
useEffect(() => { analytics.init(); }, []);
const bigTable = useMemo(buildLookupTable, []);
```

Checklist:
- **Hermes** enabled (default) — bytecode, no parse cost at launch.
- Lazy-load heavy screens and libraries (`React.lazy` + Suspense, or dynamic `import()`).
- Keep the splash screen until the first screen has data, then hide it — perceived speed matters.
- Audit dependencies: `npx expo-doctor`, bundle visualisers, and remove unused packages.
- With the New Architecture, **TurboModules load lazily** — avoid importing native modules you don't need on first screen.
- Measure with `adb shell am start -W com.example.taskmate/.MainActivity` (Android) and Instruments (iOS).

## 4. Re-render discipline

> **In short:** The same React rules as the web, but the cost of getting them wrong is visible — dropped frames instead of a slightly slow page.

```tsx
// Stable callbacks + memoized rows
const handleToggle = useCallback((id: string) => toggle(id), [toggle]);
const renderItem = useCallback(({ item }: { item: Task }) => <TaskRow task={item} onToggle={handleToggle} />, [handleToggle]);

const TaskRow = memo(function TaskRow({ task, onToggle }: Props) { … });
```

- Keep state **local** to the component that needs it; lifting everything to a screen-level `useState` re-renders the whole screen on every keystroke.
- Split contexts — one context value change re-renders every consumer.
- Use a selector-based store (Zustand) for global state so components subscribe to slices ([../../FE/15-Zustand-Redux/](../../FE/15-Zustand-Redux/)).
- `useDeferredValue`/`useTransition` for expensive filtered lists.
- Don't create objects/arrays/styles inline in hot paths; `StyleSheet.create` once.

## 5. Lists

> **In short:** Lists are the most common performance problem — fixed heights, memoized rows and FlashList solve most of it.

Covered in [../01-Fundamentals/03-lists-and-rendering.md](../01-Fundamentals/03-lists-and-rendering.md). The short version:
- `getItemLayout` when rows have a fixed height.
- `memo` + stable props for rows.
- `FlashList` for large or complex lists.
- Smaller images, fewer nested views per row.
- Never nest a vertical list inside a vertical ScrollView.

## 6. Images

> **In short:** Oversized images are the top memory and scroll-performance killer.

- Serve images at display size from a CDN (`?w=400`), not 4000 px originals.
- `expo-image` with `cachePolicy="memory-disk"`, `contentFit`, and a `placeholder`.
- Resize before upload (`expo-image-manipulator`).
- Prefer vector icons over bitmaps.
- Watch memory in a long scroll: if it climbs steadily, images aren't being released.

## 7. The JS thread

> **In short:** Anything expensive in JavaScript freezes touch handling — move it off the thread or out of the frame budget.

| Problem | Fix |
| --- | --- |
| Large `JSON.parse` | Parse on the server, paginate, or do it in a worklet/worker |
| Heavy computation | `InteractionManager.runAfterInteractions`, chunk with `setTimeout`, or `react-native-worklets` |
| Animations in JS | Reanimated (UI thread) or `useNativeDriver` |
| Gestures through JS | `react-native-gesture-handler` |
| Crypto / compression | Native modules (JSI-based libraries are fast) |
| Sync storage reads at startup | MMKV (fast) or defer |

```tsx
InteractionManager.runAfterInteractions(() => {
  prefetchNextScreenData();                  // don't compete with the navigation animation
});
```

## 8. Memory and leaks

> **In short:** Clean up every subscription, timer and watcher; unbounded caches and retained images are the usual leaks.

```tsx
useEffect(() => {
  const sub = Accelerometer.addListener(handler);
  const id = setInterval(poll, 5000);
  return () => { sub.remove(); clearInterval(id); };     // always
}, []);
```

Leak sources: event listeners, `AppState`/NetInfo subscriptions, location watchers, timers, WebSocket connections, growing in-memory caches, and closures capturing large objects. Profile with Instruments Allocations or Android Studio's Memory Profiler over a few minutes of use.

## 9. New Architecture performance notes

> **In short:** Fabric and TurboModules remove the bridge bottleneck, but they don't fix heavy renders or bad list code.

Wins you get: faster startup (lazy TurboModules), synchronous layout reads, view flattening, and concurrent React features. What stays your job: render counts, list virtualization, image sizes, and keeping the JS thread free.

If a third-party library is slow or broken, check whether it has New Architecture support — interop shims can be slower than native support.

## 10. A performance workflow

> **In short:** Reproduce on a slow device, measure, fix the biggest cost, re-measure, then add a regression guard.

1. Reproduce on a real low-end Android device, in a **release** build.
2. Watch the Perf Monitor to decide whether it's a JS or UI problem.
3. Profile the specific interaction (React Profiler for renders, Instruments for native).
4. Fix the single biggest cost; don't micro-optimise.
5. Re-measure with numbers, not vibes.
6. Add a budget: startup time and bundle size checked in CI (Flashlight, custom scripts).

---

## 11. Exercises

1. Measure cold start on a real Android device before and after deferring non-critical init.
2. Find a screen that re-renders too much with the React Profiler and fix it with `memo`/`useCallback`.
3. Render 10,000 items with FlatList, then FlashList; compare fps while flinging.
4. Load 50 full-resolution images and watch memory climb; fix with sized URLs and `expo-image`.
5. Block the JS thread for 2 s and observe the Perf Monitor; then move the work behind `runAfterInteractions`.
6. Add a startup-time marker with `react-native-performance` and report it to your analytics.
