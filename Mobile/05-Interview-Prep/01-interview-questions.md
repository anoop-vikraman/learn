# React Native interview questions

Open the Markdown preview, read the question, answer **out loud**, then expand to compare.

---

## A. Fundamentals and internals

<details>
<summary>How does React Native work? Walk me through it.</summary>

Your JavaScript runs in a JS engine (**Hermes**) inside a native app. React reconciles your components; React Native maps host components like `<View>` and `<Text>` to **real native views** (`UIView`, `ViewGroup`) — it's not a WebView. Layout is computed by **Yoga**, a C++ Flexbox engine, into a shadow tree, and the result is committed to the native view hierarchy on the UI thread.

Communication between JS and native used to go over an asynchronous, JSON-serialized **bridge**. The **New Architecture** replaces it with **JSI**, a C++ layer that lets JS hold references to native objects and call them directly — with **Fabric** as the renderer and **TurboModules** (lazily loaded) for native APIs, generated type-safely by **Codegen**.

</details>

<details>
<summary>What's the difference between the old bridge and the New Architecture?</summary>

| | Old bridge | New Architecture |
| --- | --- | --- |
| Transport | Async, batched, JSON-serialized | **JSI** — direct C++ references, can be synchronous |
| Renderer | Paper (async, JS-driven) | **Fabric** — C++ shadow tree, concurrent-React compatible |
| Native modules | All initialized at startup | **TurboModules** — lazily loaded |
| Type safety | Manual, drift-prone | **Codegen** from TS/Flow specs |

Practical effects: faster startup, no serialization bottleneck, synchronous layout measurement, and React 18 features (Suspense, transitions) working properly. It's the default since RN 0.76 / Expo SDK 52.

</details>

<details>
<summary>What is Hermes and why does it matter?</summary>

Hermes is the JS engine built for React Native. Its big win is that JavaScript is **precompiled to bytecode at build time**, so the app doesn't parse and compile JS at launch — startup is faster and memory use lower. It has no JIT, trading peak throughput for startup and memory, which is the right trade on phones. It's the default engine and supports Chrome DevTools-protocol debugging.

</details>

<details>
<summary>Describe the threads in a React Native app.</summary>

- **JS thread** — your React code and business logic. Blocking it means gestures lag and taps feel dead.
- **UI (main) thread** — native rendering and touch handling. Blocking it freezes everything.
- **Shadow/background threads** — Yoga layout and Fabric's C++ work.

This is why **Reanimated** runs animations as worklets on the UI thread and **Gesture Handler** processes touches natively: they stay smooth even when the JS thread is busy. It's also why `useNativeDriver: true` exists in the classic `Animated` API.

</details>

<details>
<summary>React Native vs Flutter vs native vs Ionic?</summary>

- **React Native** — JS/TS, renders real native views, huge ecosystem, share logic with web React teams. Best when you have React skills and want near-native UX.
- **Flutter** — Dart, paints its own widgets with its own engine. Extremely consistent UI across platforms, excellent performance, smaller talent overlap with web teams.
- **Native (Swift/Kotlin)** — best performance and immediate access to new OS features; two codebases, two teams.
- **Ionic/Cordova** — web app in a WebView; cheapest, least native feel.

Honest answer: pick native for deeply platform-specific or performance-critical apps (AR, heavy graphics), RN/Flutter for typical product apps, and say which you'd choose for *their* product.

</details>

---

## B. Components, layout and lists

<details>
<summary>How is styling in React Native different from CSS?</summary>

Styles are JavaScript objects with camelCase keys and **unitless numbers** (density-independent pixels). There's **no cascade or inheritance** (except some text properties within nested `<Text>`), no CSS Grid, no media queries (use `useWindowDimensions`), and no shorthand like `margin: 0 auto`.

Everything is **Flexbox via Yoga**, with `flexDirection: 'column'` as the default (the web defaults to `row`). Shadows differ per platform (`shadowX` on iOS, `elevation` on Android), and `transform` is an array.

</details>

<details>
<summary>ScrollView vs FlatList — when and why?</summary>

`ScrollView` renders **all** children immediately; `FlatList` virtualizes, rendering only items near the viewport and recycling the rest. Use `ScrollView` for a bounded amount of content (a form, a settings page) and `FlatList` for anything data-driven or unbounded — a 1,000-item ScrollView will blow up memory and startup time.

</details>

<details>
<summary>How do you optimize a slow FlatList?</summary>

1. **Memoize rows** with `React.memo` and keep props stable (`useCallback` for handlers, pass IDs not closures).
2. **Stable `keyExtractor`** — never the index for dynamic lists.
3. **`getItemLayout`** when row height is fixed — skips measurement and enables `scrollToIndex`.
4. Tune `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, `removeClippedSubviews`.
5. **Simplify rows** — fewer nested views, smaller images (`expo-image` with sized URLs).
6. Switch to **FlashList** for large or complex lists (it recycles components).
7. Never nest a vertical FlatList inside a vertical ScrollView.

</details>

<details>
<summary>Why must text be inside a &lt;Text&gt; component?</summary>

Because `<View>` maps to a native container view that cannot render text directly — on iOS a `UIView` isn't a `UILabel`. Text rendering requires a text node, so RN enforces it with the "Text strings must be rendered within a `<Text>` component" error. `<Text>` also nests and inherits font styles, which is how you do rich text.

</details>

<details>
<summary>How do you handle different screen sizes and safe areas?</summary>

`useWindowDimensions()` for sizes that update on rotation (not `Dimensions.get`, which is read once), Flexbox for proportional layout, and `react-native-safe-area-context` (`SafeAreaView` or `useSafeAreaInsets`) to avoid notches, status bars and home indicators. Breakpoints for tablets, `PixelRatio`/`hairlineWidth` for crisp lines, and testing on a small device and a tablet.

</details>

---

## C. Navigation

<details>
<summary>How does navigation work in React Native?</summary>

There's no URL bar, so navigation is a **stack of screens** managed by a library — **React Navigation**, usually via **Expo Router**, which adds file-based routing on top (files in `app/` become routes, like Next.js).

Patterns: stack (push/pop with a back gesture), tabs, drawers, and modals. Expo Router gives typed routes, automatic deep linking and nested layouts. Params are passed through the route and arrive as strings.

</details>

<details>
<summary>useEffect vs useFocusEffect?</summary>

A screen deeper in a stack stays **mounted** when you navigate away, so `useEffect(..., [])` doesn't run again when you come back. `useFocusEffect` runs on every focus and its cleanup runs on blur — use it for analytics screen views, refetching, starting/stopping polling, and subscribing to things that should pause when the screen isn't visible.

</details>

<details>
<summary>How do you implement an auth flow?</summary>

Keep session state in context, bootstrapped from SecureStore at launch, and gate navigation on it:
- A protected layout (`app/(app)/_layout.tsx`) that renders `<Redirect href="/login" />` when there's no session.
- `router.replace('/(app)')` after login so the back gesture can't return to the login screen.
- A splash screen held until the session check finishes, so you don't flash the wrong screen.
- Logout clears tokens, the query cache, local storage and cached files.

</details>

<details>
<summary>How do deep links work?</summary>

Register a custom scheme (`taskmate://`) and, for production, **universal links** (iOS, via `associatedDomains` + an `apple-app-site-association` file) and **App Links** (Android, via intent filters + `assetlinks.json`). Expo Router maps URLs to routes automatically from the file structure. You must handle links in two states: the app already running, and a cold start launched by the link. Always validate link parameters — they're untrusted input.

</details>

---

## D. State, data and offline

<details>
<summary>How do you manage state in a React Native app?</summary>

Same split as the web: **server state** in TanStack Query (caching, retries, background refetch, pagination), **global client state** in Zustand or Context (session, theme, filters), **form state** in React Hook Form, and everything else local with `useState`.

Mobile-specific additions: persist the query cache so the app opens with data offline, wire `AppState` into Query's `focusManager` and NetInfo into `onlineManager`, and persist anything the user would hate to lose because the OS can kill the app at any time.

</details>

<details>
<summary>How do you build offline support?</summary>

1. **Cache reads** — persist the TanStack Query cache (AsyncStorage/MMKV) so screens render instantly offline.
2. **Queue writes** — pause mutations offline and `resumePausedMutations()` on reconnect, with mutation defaults so they survive a restart.
3. **Idempotency** — generate client-side IDs and send them as idempotency keys so replays don't duplicate data.
4. **Conflict policy** — decide up front (last-write-wins, server-wins, merge) and track `updatedAt`.
5. **Communicate state** — an offline banner and per-item "pending sync" indicators.

For heavy offline-first apps, a sync engine (WatermelonDB, PowerSync, Replicache) is worth it.

</details>

<details>
<summary>Where do you store a token, and why?</summary>

**Access token in memory**, **refresh token in `expo-secure-store`** (iOS Keychain / Android Keystore, encrypted by the OS). AsyncStorage and MMKV are plain files in the app sandbox — readable on a rooted/jailbroken device — so they're fine for preferences, not credentials.

Refresh must be **single-flight** (one shared promise), or ten parallel 401s trigger ten refreshes and rotate the token out from under you. On logout: revoke server-side, delete from SecureStore, and clear the query cache so the next user doesn't see the previous user's data.

</details>

<details>
<summary>Can you keep a secret in a mobile app?</summary>

No. Anyone can unzip an IPA/APK and read the bundle, and `EXPO_PUBLIC_*` values are inlined at build time. Anything that must stay secret lives on your backend; keys that must ship (Maps, analytics) should be restricted by bundle ID and usage quota. Every authorisation decision happens server-side — client checks are UX.

</details>

---

## E. Performance

<details>
<summary>An app feels janky. How do you debug it?</summary>

1. Reproduce in a **release build on a real low-end Android device**.
2. Open the **Perf Monitor** and read the two frame counters: low **UI fps** means heavy native rendering (too many views, big images, overdraw); low **JS fps** means the JS thread is blocked.
3. Use the **React DevTools Profiler** to find components re-rendering too often or too slowly.
4. Use **Instruments**/**Android Studio Profiler** for native CPU, memory and startup.
5. Fix the single biggest cost — usually list rows, image sizes or an unmemoized tree — then re-measure.
6. Add a budget so it doesn't regress.

</details>

<details>
<summary>How do you improve app startup time?</summary>

Ship less JS and do less at import time: Hermes (bytecode, default), lazy-load heavy screens and libraries, move initialization out of module scope into effects, and avoid eagerly importing native modules (TurboModules load lazily in the New Architecture). Keep the splash visible until the first screen has data so the app feels ready rather than empty, and measure with `adb shell am start -W` or `react-native-performance`.

</details>

<details>
<summary>Why are Reanimated animations smoother than Animated?</summary>

Reanimated compiles animation callbacks into **worklets** that run on the **UI thread** with their own JS context, driven by shared values — so animation frames don't depend on the JS thread at all. Classic `Animated` runs on the JS thread unless you set `useNativeDriver: true`, which only supports `transform` and `opacity`. Combined with Gesture Handler (native touch processing), you get gesture-driven animations that stay at 60 fps while JS is busy.

</details>

<details>
<summary>How do you avoid memory leaks?</summary>

Clean up everything in effect teardowns: event listeners, `AppState`/NetInfo subscriptions, timers and intervals, location watchers, sensor listeners and WebSockets. Bound in-memory caches (`lru-cache`), don't retain large objects in closures, and size images to their display size — full-resolution photos in a long list are the most common memory problem. Verify by profiling memory over several minutes of real use.

</details>

---

## F. Native and platform

<details>
<summary>When do you need to write native code, and how?</summary>

Only when no JS library exists for a platform capability, you need performance JS can't reach, or you must integrate a vendor's native SDK. Often what's actually needed is a **config plugin** (to add a permission, Info.plist key or Gradle line), not a native module.

For real native code, the **Expo Modules API** gives a Swift/Kotlin DSL that generates the JS bindings and works with the New Architecture. In bare RN you write a TypeScript **spec**, run **Codegen**, and implement the generated TurboModule/Fabric interface.

</details>

<details>
<summary>What is CNG / prebuild, and why not commit ios/ and android/?</summary>

**Continuous Native Generation**: `npx expo prebuild` generates the native projects from `app.json` and config plugins, the way `node_modules` is generated from `package.json`. Keeping them out of git means SDK upgrades are a config change instead of a merge conflict, and every developer gets identical native projects. If you need a native tweak, express it as a **config plugin** so it survives `prebuild --clean`.

</details>

<details>
<summary>Expo Go vs development build?</summary>

**Expo Go** is a prebuilt sandbox app containing Expo's own modules — great for learning and quick prototypes, but it can't include third-party native code. A **development build** is your own binary (your native dependencies + `expo-dev-client`) that still loads JS from Metro with Fast Refresh. The moment you add a library with native code, you move to a development build.

</details>

<details>
<summary>How do you handle platform differences?</summary>

`Platform.OS`/`Platform.select` for small differences, `.ios.tsx`/`.android.tsx` files for substantial ones, and respecting each platform's conventions: Android's hardware back button, iOS swipe-back, native date pickers, share sheets, elevation vs shadow, and typography. Test both platforms for every feature — "it works on iOS" is not done.

</details>

---

## G. Build, release and OTA

<details>
<summary>What is EAS Build and why use it?</summary>

Expo Application Services builds your binaries in the cloud: it checks out your repo, runs prebuild, installs pods/Gradle, compiles and signs with managed credentials, and gives you an `.ipa`/`.aab`. Benefits: **iOS builds without a Mac**, shared team credentials instead of one laptop, reproducible environments, and direct integration with EAS Submit and EAS Update. You configure profiles (development/preview/production) in `eas.json`, and you can also run `--local`.

</details>

<details>
<summary>Explain OTA updates. What can and can't you ship?</summary>

The JS bundle and assets inside the binary can be **replaced at runtime**, so a JS fix reaches users in minutes instead of waiting for store review.

**Can:** JS/TS code, UI, styles, copy, assets, bug fixes, flag-gated features.
**Cannot:** anything native — new native libraries, permission changes, SDK/RN upgrades, app icon, splash screen.

Both stores permit it as long as you don't change the app's core purpose or bypass review for new functionality.

</details>

<details>
<summary>What is a runtime version and why does it matter?</summary>

It identifies the **native layer** an update is compatible with — an update is only delivered to binaries with a matching runtime version. Policies: `appVersion`, `sdkVersion`, a custom string, or **`fingerprint`** (a hash of your native dependencies and config), which is the safest because it changes automatically whenever native changes.

Get it wrong and you cause the classic disaster: you add a native library, publish a JS update that imports it, and every user on the old binary crashes at launch.

</details>

<details>
<summary>Channels vs branches in EAS Update?</summary>

A **branch** is a line of updates (like a git branch); a **channel** is what a built binary subscribes to (set per build profile). You map branches to channels, so the same installed binary can be pointed at a different update stream later — which also means `eas channel:edit production --branch previous-good` rolls everyone back instantly without publishing anything.

</details>

<details>
<summary>A bad update is crashing users. What do you do?</summary>

1. **Confirm** with crash reporting, filtered by `update_id`, that the new update is the cause.
2. **Mitigate immediately** — `eas update:roll-back-to-embedded --branch production` (revert to the JS that shipped in the binary), or republish the last good update group, or repoint the channel. If the feature is flag-gated, flip the flag first — that's seconds, not minutes.
3. **Verify** the crash rate recovers as devices pick up the rollback.
4. **Fix**, test, and re-publish with a **small rollout percentage** (10% → 50% → 100%).
5. Post-mortem: why did tests miss it, and should production updates have been staged?

This is also the argument for staged rollouts on OTA updates, not just store releases.

</details>

<details>
<summary>Describe a CI/CD pipeline for a React Native app.</summary>

- **PR:** typecheck, lint, unit/component tests, plus a **fingerprint** check that flags whether a native build is needed. No native builds here — they're slow and expensive.
- **Merge to main:** EAS **preview** build for both platforms, E2E (Maestro) against it, notify testers.
- **Tag `v*`:** EAS **production** build → `eas submit` to TestFlight/Play internal → publish a matching OTA update to the production channel. Gated behind a manual approval environment.
- **Manual OTA workflow:** branch + rollout-percentage inputs for JS-only hotfixes, running the same tests.

Secrets: `EXPO_TOKEN`, App Store Connect API key, Play service account, Sentry token — scoped per environment. EAS Workflows can replace GitHub Actions for the mobile-specific parts.

</details>

<details>
<summary>What happens if you lose your Android keystore?</summary>

If you enrolled in **Play App Signing** (default for new apps), Google holds the app signing key and you can request an upload-key reset — recoverable. If you did **not**, you can never publish an update to that listing again; you'd have to ship a new app and lose your users, reviews and ranking. That's why the keystore and its passwords belong in a team password manager with more than one custodian.

</details>

---

## H. Testing and quality

<details>
<summary>How do you test a React Native app?</summary>

- **Unit** (Jest): logic, hooks, reducers.
- **Component** (React Native Testing Library): render screens, query by role/label/text, fire user events, assert on what's visible. `jest-expo` preset; mock native modules.
- **Integration**: screens with MSW-mocked network and a mocked router.
- **E2E** (Maestro, or Detox): real flows against a real build on a simulator/device.
- **Manual**: low-end Android, offline, permissions denied, dark mode, large fonts, screen readers, interruptions, and the upgrade path from the previous version.

</details>

<details>
<summary>What's the hardest part of testing mobile apps?</summary>

Native modules don't exist in Jest (so they must be mocked, which reduces realism), E2E is slow and flaky compared with the web, and the matrix of devices, OS versions and network conditions is huge. The pragmatic answer: heavy component-level coverage with RNTL, a small number of high-value E2E flows, crash reporting as the real safety net, and staged rollouts so problems hit few users.

</details>

---

## I. Scenario questions

<details>
<summary>"Users report the app is slow to open on cheap Android phones. How do you investigate?"</summary>

Reproduce on a comparable device with a **release** build. Measure cold start (`adb shell am start -W`) to get a number. Then look at the usual suspects in order: bundle size and what runs at module scope, eagerly-initialized SDKs (analytics, crash reporting, feature flags), synchronous storage reads before first render, large images on the first screen, and how much JS the first route pulls in. Fix the biggest contributor, re-measure, and add a startup-time metric to analytics so you can see it for real users, not just your device.

</details>

<details>
<summary>"How would you add offline support to an existing online-only app?"</summary>

Incrementally. First persist the read cache so screens render offline with a staleness indicator. Then pick the one or two most important mutations and make them queueable with client-generated IDs and idempotency keys, replaying on reconnect. Add a conflict policy and surface sync state per item. Only then consider a full sync engine. I'd also add network-state detection and make sure every request has a timeout and a retry affordance, because "offline" in practice is usually "terrible network", not "no network".

</details>

<details>
<summary>"Your app needs a feature the store review might reject. How do you handle it?"</summary>

Read the specific guideline first and design within it rather than hoping. If it's genuinely borderline, ship it **behind a flag that's off at review time** only when that's honest about the app's purpose — not to sneak functionality past review, which violates policy and risks removal. Provide reviewers with demo credentials and a note in App Review explaining the feature. If rejected, fix the cited guideline and respond in Resolution Center; appeal only when you're confident the reviewer misunderstood.

</details>

<details>
<summary>"The same feature is needed on web and mobile. How do you share code?"</summary>

Share **logic, types and API clients**, not UI. A monorepo with `packages/api-client`, `packages/validation` (Zod schemas), and `packages/core` (domain logic), consumed by a Next.js app and an Expo app. UI stays separate because the primitives differ (`div` vs `View`) and the interaction patterns differ. React Native Web can share components if the team commits to it, but it constrains both sides. Watch Metro's monorepo configuration (`watchFolders`, `nodeModulesPaths`).

</details>

<details>
<summary>"How do you decide between an OTA update and a store release?"</summary>

By whether the change touches native code. JS-only (logic, UI, copy, assets) → OTA, staged, with rollback ready. Anything native (new library, permission, SDK upgrade, icon) → new binary. Emergencies get a third lever: a server-side feature flag, which is instant. I'd put the question in the PR template and add a fingerprint check in CI so nobody has to remember.

</details>

---

## J. Rapid fire

<details>
<summary>Short answers</summary>

- **`Pressable` vs `TouchableOpacity`** — Pressable is the modern API with press state, hover/focus and `hitSlop`; Touchables are legacy.
- **`SafeAreaView`** — use the one from `react-native-safe-area-context`, not core RN (core's is iOS-only and less capable).
- **`useNativeDriver`** — hands the animation to native; only `transform` and `opacity`.
- **`keyExtractor`** — stable unique id; index keys break recycling and state.
- **AsyncStorage vs MMKV** — async vs synchronous and much faster; neither is secure.
- **SecureStore** — Keychain/Keystore, small values, for tokens.
- **`expo-image` vs `Image`** — caching, transitions, placeholders, better memory behaviour.
- **FlashList** — recycling list; don't keep local state in rows.
- **`GestureHandlerRootView`** — must wrap the app or gestures silently fail on Android.
- **Metro** — RN's bundler; platform extensions (`.ios.tsx`), Fast Refresh, cache issues fixed with `-c`.
- **Yoga** — the C++ Flexbox layout engine.
- **`.aab` vs `.apk`** — Play Store requires App Bundles; APKs for direct install.
- **TestFlight vs internal testing** — Apple's vs Google's pre-release distribution.
- **`eas submit --latest`** — upload the most recent build to the store.
- **Push without a server** — `expo-notifications` local/scheduled notifications.
- **Why push doesn't work in the simulator** — no APNs/FCM registration; use a real device.

</details>

---

## K. Questions to ask them

- Expo or bare React Native, and are you on the New Architecture yet?
- Do you use EAS Build and EAS Update, or your own pipeline?
- What's your release cadence, and how do you handle hotfixes — OTA, flags, or store releases?
- What's your current crash-free rate and cold start time?
- How do you test on real devices — a device lab, a cloud service, or developers' phones?
- Is there a shared design system, and is any code shared with the web app?
