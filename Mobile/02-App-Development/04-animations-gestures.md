# 04 · Animations and gestures

## 1. Why animations are different on mobile

> **In short:** Users notice dropped frames immediately, and the JS thread is often busy — so good animations run on the **UI thread**, not in JavaScript.

The budget is 16.7 ms per frame (60 fps) — or 8.3 ms on 120 Hz displays. If your animation is driven by JS state updates, a slow render or a heavy list anywhere in the app will make it stutter.

## 2. Animated vs Reanimated

> **In short:** The built-in `Animated` API is fine for simple fades and slides with `useNativeDriver`; **Reanimated** runs animation logic on the UI thread and is the standard for anything interactive.

| | `Animated` (core) | `react-native-reanimated` |
| --- | --- | --- |
| Where it runs | JS thread, or native with `useNativeDriver` | **UI thread** (worklets) |
| Animatable properties with native driver | transform + opacity only | Any style property, including layout |
| Gesture-driven animation | Awkward | First-class with Gesture Handler |
| Layout animations | Limited (`LayoutAnimation`) | Built in (`entering`, `exiting`, `layout`) |
| Complexity | Lower | Slightly higher, far more capable |

```tsx
// Core Animated — simple fade
const opacity = useRef(new Animated.Value(0)).current;

useEffect(() => {
  Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
}, []);

<Animated.View style={{ opacity }}>…</Animated.View>
```

⚠️ `useNativeDriver: true` only supports `transform` and `opacity`. Animating `height` or `backgroundColor` with it throws.

## 3. Reanimated basics

> **In short:** A **shared value** lives on both threads; `useAnimatedStyle` maps it to styles that update on the UI thread without re-rendering React.

```bash
npx expo install react-native-reanimated react-native-gesture-handler
```

```tsx
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, withSequence, withRepeat, Easing } from 'react-native-reanimated';

function LikeButton() {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function onPress() {
    scale.value = withSequence(withSpring(1.3, { damping: 8 }), withSpring(1));
  }

  return (
    <Pressable onPress={onPress}>
      <Animated.View style={[styles.heart, animatedStyle]} />
    </Pressable>
  );
}
```

| Helper | Does |
| --- | --- |
| `withTiming(to, { duration, easing })` | Duration-based |
| `withSpring(to, { damping, stiffness })` | Physics-based (feels native) |
| `withDecay({ velocity })` | Momentum after a fling |
| `withDelay`, `withSequence`, `withRepeat` | Composition |
| `interpolate(value, input[], output[], Extrapolation.CLAMP)` | Map one range to another |
| `runOnJS(fn)(args)` | Call JS-thread code (setState, navigation) from a worklet |
| `runOnUI(fn)()` | Run a worklet from the JS thread |

**Worklets** are the key concept: functions marked (automatically by the Babel plugin) to run on the UI thread with their own JS context. They can't close over arbitrary JS-thread objects — that's why you need `runOnJS` to call back into React.

```tsx
// Scroll-driven header
const scrollY = useSharedValue(0);
const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });

const headerStyle = useAnimatedStyle(() => ({
  opacity: interpolate(scrollY.value, [0, 100], [0, 1], Extrapolation.CLAMP),
  transform: [{ translateY: interpolate(scrollY.value, [0, 100], [-20, 0], Extrapolation.CLAMP) }],
}));

<Animated.FlatList onScroll={onScroll} scrollEventThrottle={16} data={data} renderItem={renderItem} />
```

## 4. Layout animations

> **In short:** Reanimated animates mount, unmount and layout changes with one prop — the easiest big win for polish.

```tsx
import Animated, { FadeIn, FadeOut, SlideInRight, LinearTransition } from 'react-native-reanimated';

<Animated.View
  entering={FadeIn.duration(200)}
  exiting={FadeOut.duration(150)}
  layout={LinearTransition.springify()}       // animates position changes when siblings are added/removed
>
  <TaskRow task={task} />
</Animated.View>
```

Perfect for list insert/delete, expanding cards, and reordering.

## 5. Gesture Handler

> **In short:** `react-native-gesture-handler` processes touches natively, so gestures stay responsive even when the JS thread is busy — and composes directly with Reanimated.

```tsx
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

function DraggableCard() {
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((e) => { x.value = e.translationX; y.value = e.translationY; })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 120) {
        x.value = withTiming(Math.sign(e.translationX) * 500);
        runOnJS(onDismiss)();                     // back to the JS thread for React work
      } else {
        x.value = withSpring(0);
        y.value = withSpring(0);
      }
    });

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, style]} />
    </GestureDetector>
  );
}
```

```tsx
// Composition
const composed = Gesture.Simultaneous(Gesture.Pinch(), Gesture.Rotation());
const either = Gesture.Race(Gesture.Tap(), Gesture.LongPress());
const ordered = Gesture.Exclusive(Gesture.Tap().numberOfTaps(2), Gesture.Tap());
```

⚠️ `GestureHandlerRootView` must wrap your app (usually in the root `_layout.tsx`), or gestures silently do nothing on Android.

Gesture types: `Tap`, `LongPress`, `Pan`, `Pinch`, `Rotation`, `Fling`, `Hover`, `Native`.

## 6. Common animation patterns

> **In short:** A handful of patterns cover most product work — skeleton shimmer, collapsing headers, bottom sheets, swipe actions and screen transitions.

| Pattern | Approach |
| --- | --- |
| Skeleton shimmer | `withRepeat(withTiming(...))` on a translateX gradient |
| Collapsing header | `useAnimatedScrollHandler` + `interpolate` |
| Bottom sheet | `@gorhom/bottom-sheet` (built on Reanimated + GH) |
| Swipe to delete | `ReanimatedSwipeable` from Gesture Handler |
| Pull to refresh (custom) | Pan gesture + interpolation |
| Shared element transition | `react-native-reanimated` shared transitions, or Expo Router's `Stack` animations |
| Tab bar indicator | Shared value tied to the active index |
| Progress ring | `react-native-svg` + animated props |

Screen transitions are usually configured on the navigator, not hand-built:

```tsx
<Stack screenOptions={{ animation: 'slide_from_right', animationDuration: 250 }} />
```

## 7. Performance rules

> **In short:** Animate transform and opacity, keep work off the JS thread, and measure on a real low-end Android device.

- Prefer `transform`/`opacity` — animating `width`, `height`, `top` or `margin` triggers layout on every frame.
- Never `setState` on every frame; use shared values.
- Use `runOnJS` sparingly — it crosses threads.
- Memoize animated components and avoid re-creating gesture objects each render.
- Turn on the FPS monitor (dev menu → Perf Monitor) and watch **both** JS and UI frame rates.
- Respect `useReducedMotion()` — some users disable animation for accessibility or motion sickness.

```tsx
import { useReducedMotion } from 'react-native-reanimated';
const reduceMotion = useReducedMotion();
const duration = reduceMotion ? 0 : 300;
```

## 8. Debugging animations

> **In short:** Watch the two frame-rate counters: low UI fps means the animation itself is heavy; low JS fps with smooth animation means Reanimated is doing its job.

- Perf Monitor shows JS and UI fps separately.
- `console.log` inside a worklet needs `runOnJS` (or Reanimated's logger).
- If an animation only breaks in release builds, check for a missing Babel plugin or a stale Metro cache.

---

## 9. Exercises

1. Animate a like button with a spring scale sequence.
2. Build a collapsing header driven by scroll position with `interpolate`.
3. Add `entering`/`exiting`/`layout` animations to task list rows.
4. Build a swipe-to-dismiss card with Pan + `runOnJS` to remove it from state.
5. Block the JS thread with a busy loop while a Reanimated animation runs — confirm it stays smooth, then repeat with `Animated` and `useNativeDriver: false`.
6. Respect `useReducedMotion` throughout.
