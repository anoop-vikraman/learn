# 02 · Core components and styling

## 1. The core components

> **In short:** React Native gives you a small set of primitives that map to native views; everything else you build from them.

| Component | Web equivalent | Notes |
| --- | --- | --- |
| `View` | `<div>` | The layout box. No text inside it directly |
| `Text` | `<span>`/`<p>` | **All text must be inside `<Text>`**; nests and inherits styles |
| `Image` | `<img>` | Needs explicit dimensions (or flex); `expo-image` is better for caching |
| `Pressable` | `<button>` | The modern touchable: gives you pressed/hovered/focused state |
| `ScrollView` | `overflow: auto` | Renders **all** children — small content only |
| `FlatList` / `SectionList` | Virtualized list | For long lists ([03](03-lists-and-rendering.md)) |
| `TextInput` | `<input>` | ([05](05-forms-input-keyboard.md)) |
| `Modal` | Dialog | Native modal presentation |
| `ActivityIndicator` | Spinner | |
| `Switch`, `Button` | Checkbox, button | `Button` is intentionally unstyleable; use `Pressable` |
| `SafeAreaView` (from `react-native-safe-area-context`) | — | Avoids notches, status bars and home indicators |
| `KeyboardAvoidingView` | — | Moves content above the keyboard |
| `StatusBar` (expo-status-bar) | — | Controls the status bar style |

```tsx
import { View, Text, Image, Pressable } from 'react-native';

<View style={{ padding: 16 }}>
  <Text style={{ fontSize: 18, fontWeight: '600' }}>
    Hello <Text style={{ color: 'tomato' }}>world</Text>     {/* nesting works */}
  </Text>
  <Image source={{ uri: 'https://example.com/a.png' }} style={{ width: 80, height: 80, borderRadius: 40 }} />
  <Image source={require('../assets/logo.png')} />           {/* local assets infer size */}
</View>
```

## 2. Pressable and touch feedback

> **In short:** `Pressable` is the recommended touchable; it exposes press state for styling and supports long press, delays and hit slop.

```tsx
<Pressable
  onPress={handlePress}
  onLongPress={handleLongPress}
  delayLongPress={400}
  hitSlop={8}                                   // easier to tap small targets
  android_ripple={{ color: '#e0e7ff' }}
  accessibilityRole="button"
  accessibilityLabel="Add task"
  style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
>
  {({ pressed }) => <Text style={[styles.text, pressed && { opacity: 0.7 }]}>Add</Text>}
</Pressable>
```

Minimum touch target: **44×44 pt (iOS) / 48×48 dp (Android)** — use `hitSlop` or padding to reach it.

Older APIs you'll meet: `TouchableOpacity`, `TouchableHighlight`, `TouchableWithoutFeedback`. They still work; `Pressable` supersedes them.

## 3. StyleSheet and style objects

> **In short:** Styles are plain JS objects in camelCase with unitless numbers; `StyleSheet.create` groups them and arrays merge them.

```tsx
import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    // Shadows differ per platform:
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },  // iOS
    elevation: 3,                                                                                      // Android
  },
  title: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
});

<View style={styles.card}>
  <Text style={[styles.title, isActive && { color: '#4f46e5' }, { marginTop: 4 }]}>Title</Text>
</View>
```

Key differences from CSS:
- **No cascade or inheritance** (except some text properties inside nested `<Text>`).
- **No units** — numbers are density-independent pixels. Percentages work as strings for some properties: `width: '50%'`.
- **No shorthand** like `margin: '0 auto'` — use `marginHorizontal`, `marginVertical`.
- Transform is an array: `transform: [{ translateX: 10 }, { scale: 1.2 }]`.
- `overflow: 'hidden'` on Android doesn't always clip shadows/children the way you expect.

## 4. Flexbox layout

> **In short:** Everything is Flexbox via Yoga, with `flexDirection: 'column'` as the default — the main difference from the web.

```tsx
<View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
```

| Property | Default in RN | Web default |
| --- | --- | --- |
| `flexDirection` | `column` | `row` |
| `alignContent` | `flex-start` | `stretch` |
| `flexShrink` | `0` | `1` |
| `position` | `relative` | `static` |

```tsx
// Common patterns
{ flex: 1 }                                                   // fill available space
{ flexDirection: 'row', alignItems: 'center' }                // horizontal, vertically centred
{ justifyContent: 'center', alignItems: 'center' }            // centred both ways
{ position: 'absolute', bottom: 24, right: 24 }               // floating action button
{ flexGrow: 1, flexBasis: 0 }                                 // equal columns
```

There is **no CSS Grid**; build grids with flex-wrap or a list with `numColumns`.

## 5. Dimensions, responsiveness and safe areas

> **In short:** Use `useWindowDimensions` for sizes that react to rotation, and `react-native-safe-area-context` to keep content out of notches and home indicators.

```tsx
import { useWindowDimensions, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

function Screen() {
  const { width, height } = useWindowDimensions();       // updates on rotation
  const insets = useSafeAreaInsets();                     // { top, bottom, left, right }
  const isTablet = width >= 768;

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ flexDirection: isTablet ? 'row' : 'column' }}>…</View>
    </View>
  );
}
```

⚠️ Use `useWindowDimensions` rather than `Dimensions.get('window')`, which is read once and won't update on rotation or split-screen.

`PixelRatio` and `StyleSheet.hairlineWidth` help with crisp thin lines on high-density screens.

## 6. Platform differences

> **In short:** Branch with `Platform.OS`/`Platform.select`, or use `.ios.tsx`/`.android.tsx` files for bigger differences.

```tsx
import { Platform } from 'react-native';

const styles = StyleSheet.create({
  header: {
    paddingTop: Platform.OS === 'ios' ? 12 : 0,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 4 },
      default: {},
    }),
  },
});

if (Platform.OS === 'android' && Platform.Version >= 33) { /* notification permission */ }
```

```
components/
  DatePicker.ios.tsx
  DatePicker.android.tsx
  DatePicker.tsx          ← fallback; Metro picks the right one automatically
```

Respect platform conventions: back navigation (Android hardware back button vs iOS swipe), share sheets, date pickers, and typography.

## 7. Images

> **In short:** `expo-image` is the better default — it caches, transitions and handles placeholders; plain `Image` is fine for simple local assets.

```tsx
import { Image } from 'expo-image';

<Image
  source={{ uri: task.photoUrl }}
  placeholder={{ blurhash }}
  contentFit="cover"
  transition={200}
  cachePolicy="memory-disk"
  style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12 }}
/>
```

Tips: use `aspectRatio` instead of hard-coding heights, serve appropriately-sized images from your CDN, and prefer vector icons (`@expo/vector-icons`) over PNGs.

## 8. Dark mode and theming

> **In short:** Read the system scheme with `useColorScheme` and provide colours through a theme object or context.

```tsx
import { useColorScheme } from 'react-native';

const scheme = useColorScheme();                 // 'light' | 'dark' | null
const colors = scheme === 'dark' ? darkTheme : lightTheme;
```

Set `"userInterfaceStyle": "automatic"` in `app.json`. For a manual override, store the user's choice and wrap the app in a theme context.

## 9. NativeWind (Tailwind for RN)

> **In short:** NativeWind lets you write Tailwind classes that compile to RN styles — popular if your team already uses Tailwind on the web.

```bash
npx expo install nativewind tailwindcss react-native-reanimated
```

```tsx
<View className="flex-1 items-center justify-center bg-white dark:bg-slate-900 p-4">
  <Text className="text-xl font-semibold text-slate-900 dark:text-white">Hello</Text>
</View>
```

Alternatives: **StyleSheet** (zero dependencies, fastest), **Tamagui** or **Gluestack** (component libraries with themes), **Restyle** (typed design-system props).

## 10. Common styling mistakes

> **In short:** Most layout bugs come from missing `flex: 1`, text outside `<Text>`, or expecting CSS behaviour.

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Missing `flex: 1` on a container | Content collapses or doesn't scroll | Add `flex: 1` to the screen root |
| Raw string outside `<Text>` | "Text strings must be rendered within a `<Text>` component" | Wrap it |
| `height: '100%'` everywhere | Unexpected layout | Use `flex: 1` |
| Expecting shadows to work cross-platform | Android shows nothing | Add `elevation` |
| `Dimensions.get` at module scope | Wrong size after rotation | `useWindowDimensions` |
| Ignoring safe areas | Content under the notch | `SafeAreaView` / insets |
| Tiny tap targets | Users mis-tap | ≥44pt, `hitSlop` |

---

## 11. Exercises

1. Build a `TaskCard` with an avatar, title, subtitle and a right-aligned chevron using Flexbox only.
2. Add a pressed state and an Android ripple to the card.
3. Make the card shadow look right on both platforms.
4. Create a layout that's one column on phones and two on tablets using `useWindowDimensions`.
5. Add dark mode support with `useColorScheme` and a theme object.
6. Replace `Image` with `expo-image` and add a blurhash placeholder.
