# 00 · How React Native works internally

This is the chapter interviewers probe hardest, because it separates "I used RN" from "I understand RN". Read it now for the shape, and again after you've shipped something.

## 1. What React Native actually is

> **In short:** Your JavaScript runs in a JS engine inside a native app, and React Native translates your components into **real native views** (UIView/ViewGroup) — not a WebView.

```
┌──────────────────────────────────────────────────────────────┐
│ Your React code: components, hooks, state                    │
├──────────────────────────────────────────────────────────────┤
│ React (reconciler) — decides what changed                    │
├──────────────────────────────────────────────────────────────┤
│ React Native: host components (<View>, <Text>), modules      │
├──────────────────────────────────────────────────────────────┤
│ JSI — C++ layer letting JS and native call each other        │
├───────────────────────────┬──────────────────────────────────┤
│ Fabric (renderer)         │ TurboModules (native APIs)       │
├───────────────────────────┴──────────────────────────────────┤
│ Native platform: UIKit/SwiftUI (iOS) · Android View system   │
└──────────────────────────────────────────────────────────────┘
```

`<View>` becomes a `UIView` on iOS and an `android.view.ViewGroup` on Android. `<Text>` becomes `UILabel`/`TextView`. That's why RN apps feel native: they *are* native views, driven by JavaScript.

Compare: **Cordova/Ionic** render HTML in a WebView; **Flutter** paints its own widgets on a canvas with Skia/Impeller; **RN** drives the platform's own view system.

## 2. The JavaScript engine: Hermes

> **In short:** Expo and RN ship **Hermes**, a JS engine built for mobile — it precompiles your JS to bytecode at build time, so apps start faster and use less memory.

| | Hermes | JSC (old default) |
| --- | --- | --- |
| Startup | Fast: bytecode is precompiled at build time, no parse at launch | Parses/compiles JS at launch |
| Memory | Lower | Higher |
| Bundle on disk | Bytecode (`.hbc`) | Plain JS |
| Debugging | Chrome DevTools protocol / React Native DevTools | Safari/Chrome |

Hermes has no JIT — it trades peak throughput for startup time and memory, which is the right trade on phones.

## 3. The old architecture: the bridge

> **In short:** Originally JS and native communicated through an asynchronous, batched, JSON-serialized **bridge**, which was the source of most RN performance complaints.

```
JS thread  ──[ serialize to JSON ]──▶ bridge queue ──▶ Native/UI thread
           ◀──[ deserialize ]──────── async, batched ───
```

Problems:
- **Asynchronous only** — JS could never read a native value synchronously (e.g. measuring a view).
- **Serialization cost** — every call turned into JSON; high-frequency work (scroll handlers, animations driven from JS) dropped frames.
- **Three separate threads** with no shared memory, so coordination was expensive.

The classic symptom: a gesture or animation handled in JS stutters because the JS thread is busy, even though the UI thread is free.

## 4. The New Architecture (default since RN 0.76 / Expo SDK 52)

> **In short:** JSI lets JavaScript hold references to C++/native objects and call them **synchronously**, removing the bridge; Fabric is the new renderer and TurboModules the new native-module system.

### JSI (JavaScript Interface)

> **In short:** A C++ API exposing native objects to JS directly — no JSON, no queue, optionally synchronous.

A lightweight C++ API that exposes native objects to JS as **HostObjects**. JS can call native functions directly — no JSON, no queue, optionally synchronous. It also makes the engine swappable (Hermes, JSC, V8).

### Fabric (the renderer)

> **In short:** An immutable C++ shadow tree with thread-safe layout, enabling concurrent React and view flattening.

- Builds an immutable **shadow tree** in C++ shared between threads.
- Layout (Yoga, also C++) can run on any thread.
- Supports **synchronous, priority-aware** updates, which is what makes React 18 concurrent features (Suspense, transitions) work properly on native.
- Enables **view flattening** (removing redundant native views) for a shallower hierarchy.

### TurboModules

> **In short:** Native modules loaded lazily over JSI instead of all at startup, cutting launch time.

Native modules are **lazily loaded** (only when first used) instead of all at startup, and are called over JSI. Startup time drops, especially in apps with many native dependencies.

### Codegen

> **In short:** Generates the native glue from TS specs at build time, so JS and native signatures can't drift.

At build time, RN reads your TypeScript/Flow spec files and **generates** the C++/Java/ObjC glue for Fabric components and TurboModules — so the JS and native sides can't drift out of sync and calls are type-safe.

### Bridgeless mode

> **In short:** With everything on JSI the bridge is gone entirely; some old libraries need an interop shim.

With everything on JSI, the bridge is gone entirely (the default in recent versions). Some older third-party libraries need an interop layer or an update.

**Interview answer in one line:** "The old architecture passed JSON over an async bridge; the New Architecture uses JSI so JS can call C++/native directly, with Fabric rendering and lazily-loaded TurboModules, which removes the serialization bottleneck and enables synchronous layout and concurrent React."

## 5. The threads

> **In short:** Three main threads — JS, UI (main), and shadow/background — and keeping the JS thread free is the core of RN performance.

| Thread | Runs | Blocking it causes |
| --- | --- | --- |
| **JS thread** | Your React code, business logic, most library code | Janky gestures, delayed taps, frozen lists |
| **UI (main) thread** | Native rendering, touch handling, native animations | The whole app freezes |
| **Shadow / background** | Layout (Yoga), Fabric's C++ work, some module work | Slow layout |

That split explains two important libraries:
- **Reanimated** runs animation code on the **UI thread** via worklets, so animations keep 60 fps even when the JS thread is busy.
- **Gesture Handler** processes touches natively instead of routing them through JS.

It also explains `useNativeDriver: true` in the classic Animated API: it hands the animation to native so it doesn't depend on the JS thread.

## 6. The render pipeline

> **In short:** React reconciles → a shadow tree is built and laid out with Yoga → native views are created/updated on the UI thread.

```
State change
  → React reconciler diffs the element tree           (JS thread)
  → New immutable shadow tree created                 (C++)
  → Yoga computes Flexbox layout                      (any thread)
  → Diff committed as native view operations          (UI thread)
  → UIKit / Android View system draws                 (UI thread)
```

**Yoga** is Facebook's cross-platform Flexbox engine — which is why RN layout is Flexbox everywhere (no CSS Grid, no floats), with `flexDirection: 'column'` as the default (unlike the web).

## 7. The Metro bundler

> **In short:** Metro bundles your JS for the device, serves it over a dev server with Fast Refresh, and produces the bundle (or Hermes bytecode) that ships in the binary.

- **Development:** the app downloads the bundle from Metro; saving a file triggers **Fast Refresh**, which preserves component state where it can.
- **Production:** the bundle is built, minified, converted to Hermes bytecode and embedded in the app binary — this is also the artifact **OTA updates** replace (see [../04-Build-Deploy/](../04-Build-Deploy/)).
- Metro understands platform extensions: `Button.ios.tsx`, `Button.android.tsx`, `Button.web.tsx`.

## 8. Where Expo fits

> **In short:** Expo is a framework and toolchain on top of React Native: a large set of native modules, a config-driven build system (prebuild), cloud builds (EAS), OTA updates and a file-based router.

| | Bare React Native | Expo |
| --- | --- | --- |
| Native projects (`ios/`, `android/`) | You maintain them | Generated from `app.json` by **prebuild** (CNG) — usually not committed |
| Adding native libraries | Edit Podfile/Gradle manually | Config plugins, usually automatic |
| Building | Xcode / Android Studio locally | **EAS Build** in the cloud (or locally) |
| Updates without the store | Roll your own (CodePush) | **EAS Update** built in |
| Device APIs | Pick libraries yourself | `expo-camera`, `expo-location`, `expo-notifications`… |
| Can you use native code? | Yes | Yes — development builds + config plugins |

The old "Expo = no native code" limitation is gone: with **development builds** you can use any native library. The modern recommendation (including from the React Native team) is to start with Expo.

**Expo Go** is the sandbox app for trying things quickly; it only contains Expo's own prebuilt modules. The moment you add a third-party native library you move to a **development build** — a custom version of your app that includes your native dependencies plus the dev client.

## 9. How a React Native app starts

> **In short:** The native app launches, creates a JS runtime, loads the bundle, runs your JS, and React mounts a native view hierarchy.

```
1. OS launches the native app (AppDelegate / MainActivity)
2. React Native host initializes: Hermes runtime + JSI + TurboModule registry
3. The JS bundle (bytecode in release, from Metro in dev) is loaded and executed
4. Your root component renders → shadow tree → Yoga layout → native views
5. First frame drawn; splash screen hidden
```

Startup optimizations follow directly from this list: Hermes bytecode, lazy TurboModules, smaller bundles, deferring work out of module scope, and keeping the first screen simple.

## 10. React Native vs the web: what's different

> **In short:** Same React, different primitives — no DOM, no CSS cascade, Flexbox-only layout, and platform APIs instead of browser APIs.

| Web | React Native |
| --- | --- |
| `<div>`, `<span>`, `<img>`, `<button>` | `<View>`, `<Text>`, `<Image>`, `<Pressable>` |
| CSS files, cascade, media queries | JS style objects, no cascade, `useWindowDimensions` |
| `display: block` default | Everything is Flexbox, `flexDirection: 'column'` |
| `px`, `rem`, `%` | Unitless density-independent numbers, `%` for some props |
| `onClick` | `onPress` |
| `localStorage` | AsyncStorage / MMKV / SecureStore |
| Router + URLs | Navigation stacks + deep links |
| All text in any element | **Text must be inside `<Text>`** |
| `overflow` scrolling anywhere | Explicit `ScrollView`/`FlatList` |
| DevTools + Lighthouse | React Native DevTools, Flipper, Xcode Instruments, Android Profiler |

## 11. Mental model in one paragraph

> **In short:** A summary of the whole chapter.

A React Native app is a native app that runs your JavaScript in Hermes. React reconciles your components, Yoga lays them out as a shadow tree in C++, and the result is committed to real native views on the UI thread. In the New Architecture, JS talks to native directly through JSI — Fabric for rendering and lazily-loaded TurboModules for native APIs — instead of posting JSON over the old asynchronous bridge. The JS thread is a single thread you must keep free, which is why animations and gestures are pushed onto the UI thread. Expo wraps all of this with a module library, config-based native project generation, cloud builds and over-the-air updates.

---

## 12. Exercises

1. Explain the bridge vs JSI to a friend in two minutes, without notes.
2. In a new Expo app, add a button that runs a 3-second busy loop; observe that scrolling freezes, and explain which thread is blocked.
3. Animate a box with `Animated` and `useNativeDriver: false` while the JS thread is busy, then with Reanimated; compare smoothness.
4. Find `newArchEnabled` in `app.json` and check which architecture your app uses.
5. Build a release bundle and locate the Hermes bytecode file inside the app package.
