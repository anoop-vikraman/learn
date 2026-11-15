# Fundamentals: production notes

Build, signing and release topics live in [../04-Build-Deploy/](../04-Build-Deploy/). This page covers what to get right in the app itself before you ever run a production build.

## 1. App identity and configuration

> **In short:** Bundle identifiers, app names and schemes are hard to change after launch — decide them deliberately and manage variants from day one.

- `ios.bundleIdentifier` / `android.package`: **permanent** once published. Reverse-DNS, e.g. `com.company.taskmate`.
- Separate identifiers per variant (`.dev`, `.staging`) so all three can be installed side by side.
- `scheme` for deep links; register universal/app links before launch so shared URLs work.
- `app.config.ts` + `APP_VARIANT` to switch name, icon, identifier and API URL per environment.

## 2. Versioning

> **In short:** `version` is what users see; the native build numbers are what the stores order releases by — let EAS manage them automatically.

```json
{ "expo": { "version": "1.4.0", "ios": { "buildNumber": "42" }, "android": { "versionCode": 42 } } }
```

- Use **semver** for `version`; bump `patch` for fixes, `minor` for features.
- `autoIncrement` in `eas.json` avoids "this build number already exists" rejections.
- Keep the **runtime version** in mind: it determines which OTA updates a binary can receive ([../04-Build-Deploy/03-ota-updates.md](../04-Build-Deploy/03-ota-updates.md)).

## 3. Assets

> **In short:** Ship correctly-sized icons and splash screens, and keep bundled assets small — app size affects install conversion.

| Asset | Requirement |
| --- | --- |
| App icon | 1024×1024 PNG, **no transparency** (iOS rejects it), no rounded corners |
| Android adaptive icon | Foreground + background layers, keep content in the safe zone |
| Splash | Simple, centred; matches the first screen's background to avoid a flash |
| Images | Compress (WebP/AVIF where supported); prefer remote + cache for large media |
| Fonts | Only the weights you use; load with `expo-font` and hold the splash until ready |

## 4. Environment variables and secrets

> **In short:** `EXPO_PUBLIC_*` values are embedded in the bundle and readable by anyone — real secrets belong on your server.

- Never ship API keys with write access, payment secrets or admin tokens.
- Restrict third-party keys that must be in the app (Maps, analytics) by bundle ID and usage.
- Use EAS **secrets/environment variables** for build-time values that shouldn't be in git.
- Assume the bundle is public: anyone can extract an APK and read it.

## 5. Crash reporting and analytics

> **In short:** Install crash reporting before your first release — you can't debug a production crash you never saw.

```bash
npx expo install @sentry/react-native
```

- Upload source maps with each build so stack traces are readable.
- Tag events with app version, runtime version and update ID so you know which OTA update a crash came from.
- Add breadcrumbs for navigation and network calls.
- Respect privacy: no PII in logs; follow the store's data-disclosure rules.

## 6. Permissions

> **In short:** Request permissions only when needed, with a clear reason — vague or premature prompts cause denials and store rejections.

```json
["expo-camera", { "cameraPermission": "TaskMate uses the camera to attach photos to tasks." }]
```

- iOS requires a purpose string for every permission; a missing or generic one is a rejection reason.
- Ask **in context** ("Attach a photo?" → then the prompt), not at app launch.
- Handle denial gracefully and offer a link to Settings.
- Android 13+ needs explicit notification permission.

## 7. Store requirements

> **In short:** Apple and Google both reject apps for predictable reasons — check these before submitting.

| Requirement | Notes |
| --- | --- |
| Privacy policy URL | Mandatory on both stores |
| Data safety / privacy nutrition labels | Must match what the app actually collects |
| Account deletion | Required if the app supports account creation |
| Sign in with Apple | Required if you offer other third-party logins on iOS |
| Permission purpose strings | Specific and honest |
| Target SDK level (Android) | Google enforces a minimum each year |
| No private APIs, no hidden features | Instant rejection |
| Age rating, content, test credentials | Provide a demo login for reviewers |

## 8. Offline and poor networks

> **In short:** Phones lose connectivity constantly — treat offline as a normal state, not an error.

- Cache data (TanStack Query persistence, MMKV) and show stale content with an indicator.
- Queue mutations and retry when connectivity returns.
- Detect state with `expo-network` / `@react-native-community/netinfo`.
- Set timeouts on every request; show actionable errors with retry.

Covered in depth in [../02-App-Development/01-data-fetching-offline.md](../02-App-Development/01-data-fetching-offline.md).

## 9. Pre-release checklist

> **In short:** Run through this before every store submission.

- [ ] Tested on a **real low-end Android device**, not just a simulator
- [ ] Works offline and on a slow 3G profile
- [ ] No console errors/warnings; LogBox clean
- [ ] Crash reporting active with source maps
- [ ] Permissions prompt in context with clear strings
- [ ] Deep links open the right screens
- [ ] Dark mode and large font sizes don't break layouts
- [ ] Safe areas correct on a notched device and a device with a home indicator
- [ ] App size reviewed; unused assets and libraries removed
- [ ] Privacy policy, data disclosures and account deletion in place
- [ ] Version and build number bumped
