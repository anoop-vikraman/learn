# 02 · Native modules and config plugins

## 1. When you need native code

> **In short:** Only when no JS library exists for a platform capability, you need performance JS can't reach, or you must integrate a vendor's native SDK.

| Situation | Solution |
| --- | --- |
| A feature exists as an Expo/community module | Just install it |
| A vendor ships a native SDK (payments, chat, MDM) | Config plugin + native module wrapper |
| CPU-heavy work (image processing, crypto) | Native module over JSI, or a worklet |
| You need to change native build config (permissions, entitlements, Gradle) | **Config plugin** — no native module needed |

Most "we need native code" turns out to be "we need a config plugin".

## 2. Continuous Native Generation and prebuild

> **In short:** `npx expo prebuild` generates `ios/` and `android/` from `app.json` and your plugins — treat those folders as build output, not source.

```bash
npx expo prebuild                 # generate native projects
npx expo prebuild --clean         # regenerate from scratch (discards manual edits!)
npx expo run:ios                  # build and run locally
npx expo run:android
```

Keeping native folders **git-ignored** means SDK upgrades are a config change rather than a merge conflict. If you must hand-edit native files, move that change into a config plugin instead so it survives regeneration.

## 3. Config plugins

> **In short:** A config plugin is a JS function that modifies the generated native projects — permissions, Info.plist keys, Gradle lines, entitlements, build settings.

```js
// plugins/withTaskMateConfig.js
const { withInfoPlist, withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withTaskMateConfig(config) {
  // iOS: add an Info.plist key
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.NSCameraUsageDescription = 'Attach photos to your tasks.';
    cfg.modResults.ITSAppUsesNonExemptEncryption = false;      // avoids an export-compliance prompt
    return cfg;
  });

  // Android: add a permission
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] ?? [];
    manifest['uses-permission'].push({ $: { 'android:name': 'android.permission.VIBRATE' } });
    return cfg;
  });

  // Android: append to build.gradle
  config = withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes('multiDexEnabled')) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /defaultConfig\s?{/,
        'defaultConfig {\n        multiDexEnabled true',
      );
    }
    return cfg;
  });

  return config;
};
```

```json
// app.json
{ "expo": { "plugins": ["./plugins/withTaskMateConfig"] } }
```

Most mods you'll use: `withInfoPlist`, `withEntitlementsPlist`, `withXcodeProject`, `withAndroidManifest`, `withAppBuildGradle`, `withProjectBuildGradle`, `withGradleProperties`, `withDangerousMod` (arbitrary file access — last resort).

Verify with `npx expo prebuild --clean` and inspect the generated files.

## 4. Writing a native module with the Expo Modules API

> **In short:** The Expo Modules API gives you a clean Swift/Kotlin DSL that generates the JS bindings, and it works with the New Architecture.

```bash
npx create-expo-module@latest --local expo-task-widget     # a local module inside your app
```

```swift
// modules/expo-task-widget/ios/ExpoTaskWidgetModule.swift
import ExpoModulesCore

public class ExpoTaskWidgetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoTaskWidget")

    Constants(["version": "1.0.0"])

    Function("getBadgeCount") { () -> Int in
      UIApplication.shared.applicationIconBadgeNumber
    }

    AsyncFunction("setBadgeCount") { (count: Int) in
      UIApplication.shared.applicationIconBadgeNumber = count
    }

    Events("onBadgeChanged")
  }
}
```

```kotlin
// modules/expo-task-widget/android/src/main/java/.../ExpoTaskWidgetModule.kt
class ExpoTaskWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoTaskWidget")
    Function("getBadgeCount") { 0 }
    AsyncFunction("setBadgeCount") { count: Int -> /* … */ }
  }
}
```

```ts
// modules/expo-task-widget/index.ts
import { requireNativeModule } from 'expo-modules-core';
const ExpoTaskWidget = requireNativeModule('ExpoTaskWidget');

export function getBadgeCount(): number { return ExpoTaskWidget.getBadgeCount(); }
export async function setBadgeCount(count: number): Promise<void> { return ExpoTaskWidget.setBadgeCount(count); }
```

Types are converted automatically, `AsyncFunction` returns a promise, and `View` definitions let you expose native views as React components.

## 5. TurboModules and Fabric (bare RN)

> **In short:** Without Expo Modules you write a TypeScript spec, run Codegen, and implement the generated interface in ObjC++/Java.

```ts
// specs/NativeTaskWidget.ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getBadgeCount(): number;                    // can be synchronous over JSI
  setBadgeCount(count: number): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeTaskWidget');
```

Codegen reads the spec at build time and generates C++/Java/ObjC glue, so JS and native signatures can't drift. **Fabric components** follow the same pattern with a `codegenNativeComponent` spec for native views.

The Expo Modules API is a friendlier wrapper over the same machinery — prefer it unless you're in a bare project with existing conventions.

## 6. Platform-specific code in JS

> **In short:** Use file extensions for substantial differences and `Platform` checks for small ones.

```
components/
  BiometricPrompt.ios.tsx
  BiometricPrompt.android.tsx
  BiometricPrompt.tsx          # shared types/fallback
```

```ts
import { Platform } from 'react-native';
const shadow = Platform.select({ ios: { shadowOpacity: 0.1 }, android: { elevation: 4 } });
```

## 7. Patching third-party libraries

> **In short:** `patch-package` lets you fix a dependency's bug locally and keep the fix in git until upstream merges it.

```bash
npm install -D patch-package
# edit node_modules/some-lib/...
npx patch-package some-lib        # writes patches/some-lib+1.2.3.patch
# add "postinstall": "patch-package" to package.json scripts
```

Always open an upstream PR too — patches rot when you upgrade. Alternatives: fork the package, or write a config plugin if the problem is in native config rather than JS.

## 8. Upgrading the Expo SDK

> **In short:** Expo upgrades are mostly `expo install --fix` plus a prebuild, which is why generated native projects pay off.

```bash
npx expo install expo@latest
npx expo install --fix                 # align all packages with the new SDK
npx expo-doctor                        # check for problems
npx expo prebuild --clean              # regenerate native projects
# read the SDK changelog; test on both platforms; rebuild dev clients
```

Do upgrades one SDK at a time, behind a branch, with a real device test pass. Expo publishes a changelog and codemods for breaking changes.

## 9. Debugging native issues

> **In short:** When something only breaks in a build, open the native IDE — JS tooling can't see native crashes.

| Problem | Where to look |
| --- | --- |
| iOS build failure | Xcode build log; Pods; `npx expo prebuild --clean`; `pod install` |
| Android build failure | Gradle output; `cd android && ./gradlew assembleDebug --stacktrace` |
| Native crash at launch | Xcode device logs / `adb logcat`; Crashlytics/Sentry native reports |
| Works in Expo Go, not in a build | A native module missing from the dev client — rebuild it |
| Works in debug, not release | Minification/ProGuard rules, missing Babel plugin, dev-only code |

---

## 10. Exercises

1. Write a config plugin that adds an Android permission and an iOS Info.plist key; verify with `prebuild --clean`.
2. Create a local Expo module with one sync and one async function, and call it from JS.
3. Expose a native view (a simple colored square with a prop) through the Expo Modules API.
4. Patch a dependency with `patch-package` and confirm the patch applies on a clean install.
5. Upgrade an app one Expo SDK version and document every change you had to make.
