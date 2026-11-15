# React Native + Expo cheat sheet

Fast revision. Everything here is explained in the lesson folders.

---

## Architecture in six lines

| Term | One line |
| --- | --- |
| **Hermes** | The JS engine; precompiles to bytecode at build time → fast startup, low memory, no JIT |
| **JSI** | C++ layer letting JS hold references to native objects and call them directly (replaces the bridge) |
| **Fabric** | The new renderer: immutable C++ shadow tree, concurrent-React compatible, view flattening |
| **TurboModules** | Native modules loaded **lazily** over JSI |
| **Codegen** | Generates native glue from TS specs so JS/native signatures can't drift |
| **Yoga** | C++ Flexbox layout engine (why RN layout is Flexbox-only) |

**Threads:** JS (your code) · UI/main (rendering, touch) · shadow/background (layout). Keep the JS thread free.

---

## Core components

| RN | Web | Note |
| --- | --- | --- |
| `View` | `div` | No text directly inside |
| `Text` | `span`/`p` | **All text must be here**; nests and inherits |
| `Image` / `expo-image` | `img` | Needs dimensions; `expo-image` adds caching + placeholders |
| `Pressable` | `button` | Press state, `hitSlop`, `android_ripple` |
| `ScrollView` | `overflow:auto` | Renders everything — bounded content only |
| `FlatList` / `SectionList` / `FlashList` | virtual list | Anything unbounded |
| `TextInput` | `input` | `value` + `onChangeText` |
| `Modal`, `Switch`, `ActivityIndicator` | — | |
| `SafeAreaView` (safe-area-context) | — | Notches, home indicator |
| `KeyboardAvoidingView` | — | `behavior`: `padding` (iOS) / `height` (Android) |

---

## Styling

```ts
StyleSheet.create({ box: { flex: 1, flexDirection: 'row', gap: 8, padding: 16 } })
style={[styles.box, isActive && styles.active, { marginTop: 4 }]}
```

- Unitless numbers; camelCase keys; **no cascade**, no Grid, no media queries.
- `flexDirection` defaults to **`column`** (web: `row`); `flexShrink` defaults to 0.
- Shadows: `shadowColor/Opacity/Radius/Offset` (iOS) + `elevation` (Android).
- `transform: [{ translateX: 4 }, { scale: 1.1 }]`.
- Responsive: `useWindowDimensions()` (not `Dimensions.get`), `useSafeAreaInsets()`.
- Platform: `Platform.OS`, `Platform.select({...})`, `Button.ios.tsx` / `Button.android.tsx`.

---

## FlatList props worth knowing

```tsx
<FlatList
  data={items}
  keyExtractor={(i) => i.id}                                   // stable, never index
  renderItem={renderItem}                                      // useCallback
  getItemLayout={(_, i) => ({ length: H, offset: H * i, index: i })}
  initialNumToRender={10} maxToRenderPerBatch={10} windowSize={5}
  removeClippedSubviews
  ItemSeparatorComponent={Sep} ListEmptyComponent={Empty} ListFooterComponent={Footer}
  refreshControl={<RefreshControl refreshing={r} onRefresh={refetch} />}
  onEndReached={loadMore} onEndReachedThreshold={0.5}
  contentContainerStyle={{ padding: 16 }}                      // ⚠️ not `style`
/>
```

⚠️ Never nest a vertical FlatList in a vertical ScrollView. Memoize rows with `memo` + stable props.

---

## Expo Router

| File | Route |
| --- | --- |
| `app/index.tsx` | `/` |
| `app/tasks/[id].tsx` | `/tasks/42` |
| `app/(tabs)/_layout.tsx` | tab navigator, group not in URL |
| `app/+not-found.tsx` | 404 |

```tsx
<Link href="/tasks" />  <Link href={{ pathname: '/tasks/[id]', params: { id } }} asChild />
const router = useRouter();  router.push/replace/back/dismiss/setParams
const { id } = useLocalSearchParams<{ id: string }>();          // strings!
useFocusEffect(useCallback(() => { … }, []));                   // runs on focus, not just mount
<Stack.Screen options={{ title, presentation: 'modal' }} />
```

---

## Data and storage

| Need | Tool |
| --- | --- |
| Server state | TanStack Query (+ `focusManager` with AppState, `onlineManager` with NetInfo) |
| Persist cache | `@tanstack/react-query-persist-client` + AsyncStorage/MMKV |
| Preferences | MMKV (sync, fast) or AsyncStorage |
| Structured/offline data | `expo-sqlite` (+ Drizzle) |
| **Tokens** | `expo-secure-store` (Keychain/Keystore) |
| Files | `expo-file-system` (`documentDirectory` persists, `cacheDirectory` doesn't) |

Offline writes: pause → `resumePausedMutations()` → client-generated IDs + idempotency keys.

---

## Device APIs (Expo)

| Need | Package |
| --- | --- |
| Camera / photos | `expo-camera`, `expo-image-picker`, `expo-image-manipulator` |
| Location | `expo-location` (stop watchers on blur!) |
| Notifications | `expo-notifications` (+ `expo-device`; no push in simulators) |
| Files / sharing | `expo-file-system`, `expo-sharing`, `expo-document-picker` |
| Biometrics | `expo-local-authentication` |
| Haptics / clipboard / sensors | `expo-haptics`, `expo-clipboard`, `expo-sensors` |
| Background | `expo-task-manager` + `expo-background-task` (OS decides when) |
| Auth | `expo-auth-session` (PKCE, system browser), `expo-apple-authentication` |

Permissions: request **in context**, handle `denied` + `canAskAgain: false` with a Settings link, and add purpose strings in `app.json`.

---

## Animation and gestures

```tsx
const x = useSharedValue(0);
const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
x.value = withSpring(100);          // withTiming / withSequence / withRepeat / withDecay
runOnJS(setState)(value);           // call JS-thread code from a worklet

<Animated.View entering={FadeIn} exiting={FadeOut} layout={LinearTransition} />

const pan = Gesture.Pan().onUpdate((e) => { x.value = e.translationX; });
<GestureDetector gesture={pan}><Animated.View style={style} /></GestureDetector>
```

- Reanimated = **UI thread** worklets; classic `Animated` needs `useNativeDriver: true` (transform/opacity only).
- `GestureHandlerRootView` must wrap the app.
- Animate `transform`/`opacity`, not `width`/`height`/`top`.
- Respect `useReducedMotion()`.

---

## EAS commands

```bash
eas build --profile development --platform ios        # dev client build
eas build --profile preview --platform all            # internal testers
eas build --profile production --platform all         # store build
eas build --local --profile preview --platform android
eas build:list / build:view <id>

eas update --branch production --message "fix"        # OTA
eas update --branch production --rollout-percentage 10
eas update:roll-back-to-embedded --branch production  # emergency rollback
eas channel:edit production --branch known-good
eas channel:list / branch:list / update:list

eas submit --platform all --latest
eas credentials
eas device:create                                     # register an iOS test device
eas env:create --name X --value y --visibility secret
```

```bash
npx expo start --dev-client      npx expo start -c        # clear Metro cache
npx expo install --fix           npx expo-doctor
npx expo prebuild --clean        npx expo run:android
```

---

## OTA rules

| ✅ OTA | ❌ New build |
| --- | --- |
| JS, UI, styles, copy, assets, bug fixes | Native libraries, permissions, SDK/RN upgrade, icon, splash |

- **Runtime version** gates compatibility → use the **`fingerprint`** policy.
- **Channel** = what a binary listens to; **branch** = a line of updates; map one to the other.
- Default behaviour: check on launch, download in background, apply **next** launch.
- Staged rollout + `roll-back-to-embedded` = your safety net.
- Stores allow JS updates that don't change the app's purpose or add unreviewed features.

---

## Build profiles (`eas.json`)

| Profile | `developmentClient` | `distribution` | Android format | Channel |
| --- | --- | --- | --- | --- |
| development | ✅ | internal | apk | development |
| preview | ❌ | internal | apk | preview |
| production | ❌ | store | **app-bundle** | production |

---

## Testing

```bash
jest-expo preset + @testing-library/react-native
transformIgnorePatterns ← the #1 setup gotcha
maestro test .maestro/        # E2E against a real build
```

Query priority: `getByRole` → `getByLabelText` → `getByText` → `getByTestId`.

---

## Numbers worth quoting

| Thing | Number |
| --- | --- |
| Frame budget | 16.7 ms (60 fps) / 8.3 ms (120 Hz) |
| Touch target | 44×44 pt (iOS), 48×48 dp (Android) |
| Cold start target | < 2 s to interactive |
| Crash-free sessions | > 99.5% |
| Contrast ratio | 4.5:1 body text |
| Apple Developer | $99/year · Google Play $25 once |
| Store review | hours to a few days; OTA ≈ minutes |

---

## Top 12 gotchas

1. Text outside `<Text>` → error.
2. Missing `flex: 1` → content collapses or won't scroll.
3. Index keys in lists → wrong state after reorder/delete.
4. Inline `renderItem`/handlers → every row re-renders.
5. `Dimensions.get` at module scope → stale after rotation.
6. Vertical FlatList inside vertical ScrollView → virtualization dies.
7. `useEffect([])` on a stacked screen → doesn't re-run on back; use `useFocusEffect`.
8. Secrets in `EXPO_PUBLIC_*` → publicly readable.
9. Forgetting a new dev client build after adding native code.
10. Wrong runtime version → OTA update crashes old binaries.
11. No `GestureHandlerRootView` → gestures silently fail on Android.
12. Lost keystore without Play App Signing → can never update the app again.
