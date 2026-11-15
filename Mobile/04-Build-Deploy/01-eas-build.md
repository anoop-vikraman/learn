# 01 · EAS Build

## 1. What EAS Build is

> **In short:** Expo Application Services builds your app binaries in the cloud — including **iOS builds without a Mac** — handling native toolchains, credentials and caching for you.

```
Your code (git) ──▶ EAS Build worker (macOS or Linux VM)
                      ├─ npm ci
                      ├─ npx expo prebuild        (generate ios/ and android/)
                      ├─ pod install / gradle
                      ├─ compile + sign with your credentials
                      └─ upload artifact
                           ├─ .ipa  (iOS, installable/submittable)
                           └─ .aab / .apk (Android)
```

Why teams use it instead of local Xcode/Gradle builds:
- **No Mac needed** for iOS.
- Credentials are managed and shared across the team, not stuck on one laptop.
- Reproducible environments — "works on my machine" disappears.
- Integrates with EAS Submit (stores) and EAS Update (OTA).

You can also run `eas build --local` to build on your own machine with the same configuration.

## 2. Setup

> **In short:** Install the CLI, log in, and let `eas build:configure` create `eas.json` and your project ID.

```bash
npm install -g eas-cli          # or use npx eas-cli
eas login
eas whoami
cd TaskMate
eas build:configure             # creates eas.json, adds extra.eas.projectId to app.json
```

## 3. Build profiles (`eas.json`)

> **In short:** Profiles describe *how* to build — development, preview and production are the standard three, plus variants per environment.

```json
{
  "cli": { "version": ">= 12.0.0", "appVersionSource": "remote" },

  "build": {
    "base": {
      "node": "22.x",
      "env": { "EXPO_PUBLIC_API_URL": "https://api.example.com" }
    },

    "development": {
      "extends": "base",
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "env": { "APP_VARIANT": "dev", "EXPO_PUBLIC_API_URL": "https://dev-api.example.com" },
      "ios": { "simulator": true },
      "android": { "buildType": "apk" }
    },

    "preview": {
      "extends": "base",
      "distribution": "internal",
      "channel": "preview",
      "env": { "APP_VARIANT": "preview", "EXPO_PUBLIC_API_URL": "https://staging-api.example.com" },
      "android": { "buildType": "apk" }
    },

    "production": {
      "extends": "base",
      "channel": "production",
      "autoIncrement": true,
      "android": { "buildType": "app-bundle" },
      "ios": { "resourceClass": "m-medium" }
    }
  },

  "submit": {
    "production": {
      "ios": { "appleId": "you@example.com", "ascAppId": "1234567890", "appleTeamId": "ABCDE12345" },
      "android": { "serviceAccountKeyPath": "./google-service-account.json", "track": "internal" }
    }
  }
}
```

| Key | Meaning |
| --- | --- |
| `developmentClient` | Includes `expo-dev-client` — needed to load JS from Metro and use the dev menu |
| `distribution` | `internal` (shareable install link / ad-hoc) vs `store` (default, for submission) |
| `channel` | Which **EAS Update channel** this binary listens to ([03](03-ota-updates.md)) |
| `autoIncrement` | Bumps `buildNumber`/`versionCode` automatically |
| `ios.simulator` | Builds for the iOS Simulator (can't be submitted) |
| `android.buildType` | `apk` (installable directly) vs `app-bundle` (**required** for Play Store) |
| `env` | Build-time environment variables (inlined into the bundle) |
| `extends` | Inherit from another profile |

## 4. The three builds you actually use

> **In short:** A development build for daily work, a preview build for testers, and a production build for the stores.

| | Development | Preview | Production |
| --- | --- | --- | --- |
| Purpose | Daily development with Metro | QA, stakeholders, E2E tests | Store release |
| Dev client | ✅ | ❌ | ❌ |
| JS source | Loaded from your machine | Bundled in | Bundled in, minified |
| Distribution | Internal | Internal link / TestFlight / internal track | App Store / Play Store |
| Android format | APK | APK | AAB |

```bash
eas build --profile development --platform ios
eas build --profile development --platform android
eas build --profile preview --platform all
eas build --profile production --platform all

eas build:list                      # history
eas build:view <id>                 # details and logs
eas build --local --profile preview --platform android    # build on your own machine
```

Install a development build, then:

```bash
npx expo start --dev-client
```

⚠️ You need a **new development build** whenever you add or update a library with native code, or change native config in `app.json`. Pure JS changes just reload.

## 5. Environment variables

> **In short:** Build-time values come from `eas.json` `env` or EAS environment variables; they're baked into the binary, so a secret in them is public.

```bash
eas env:create --name SENTRY_AUTH_TOKEN --value xxx --visibility secret --environment production
eas env:list
```

| Kind | Where | Visible to users? |
| --- | --- | --- |
| `EXPO_PUBLIC_*` | `eas.json` env / EAS env vars | **Yes** — inlined into the JS bundle |
| Build-only secrets (Sentry token, private registry) | EAS secret env vars | No — used only on the build worker |
| Runtime secrets (API keys with write access) | ❌ Nowhere in the app | — keep them on your server |

Use `APP_VARIANT` with `app.config.ts` so dev/preview/production get different names, icons and bundle IDs and can be installed side by side.

## 6. Build hooks and caching

> **In short:** `eas-build-*` npm scripts let you run steps around the build, and caching speeds repeat builds.

```json
// package.json
{
  "scripts": {
    "eas-build-pre-install": "echo 'before npm install'",
    "eas-build-post-install": "npx prisma generate || true",
    "eas-build-on-success": "node scripts/notify-slack.js",
    "eas-build-on-error": "node scripts/notify-slack.js --failed"
  }
}
```

EAS caches npm and CocoaPods by default. Keep builds fast by avoiding unnecessary dependencies and by using `--platform` to build only what you need.

## 7. Distributing internal builds

> **In short:** `distribution: "internal"` gives you a shareable install URL — the fastest way to get a build to a tester.

- **Android:** an APK anyone with the link can install.
- **iOS:** ad-hoc distribution requires each tester device's **UDID registered** in your Apple account:

```bash
eas device:create          # generates a registration link/QR for testers
eas device:list
```

For wider iOS testing use **TestFlight** instead ([05](05-store-submission.md)).

## 8. Troubleshooting

> **In short:** Most failures are dependency mismatches, native config problems or credentials — the build log tells you which.

| Error | Likely cause | Fix |
| --- | --- | --- |
| iOS build fails in `pod install` | Incompatible native dependency versions | `npx expo install --fix`, `npx expo-doctor`, check SDK support |
| Gradle out of memory | Big project / low resources | Larger `resourceClass`, `org.gradle.jvmargs` via a plugin |
| "No matching provisioning profile" | Credentials or bundle ID mismatch | `eas credentials`, verify `bundleIdentifier` |
| Works locally, fails on EAS | Uncommitted files, `.gitignore`, or local-only env | EAS builds from git — commit everything, or use `.easignore` deliberately |
| App crashes immediately in a production build | Missing env var, dev-only code, Hermes-incompatible dependency | Check device logs; test with `--profile preview` first |
| "Metro has encountered an error" in a build | Stale cache or bad import | `npx expo start -c`; check platform-specific imports |

```bash
eas build:view <id>                 # logs
npx expo-doctor                     # pre-flight check
npx expo prebuild --clean           # reproduce the native generation locally
```

## 9. Costs and alternatives

> **In short:** EAS has a free tier with limited concurrency; you can self-host builds if you need to.

- Free tier: limited monthly builds and a queue; paid plans add concurrency and faster workers.
- `eas build --local` runs on your own hardware (needs Xcode for iOS).
- Self-hosted alternatives: GitHub Actions with macOS runners + Fastlane, Bitrise, Codemagic, CircleCI.
- Teams often mix: EAS for convenience, with a fallback local/self-hosted path documented.

---

## 10. Exercises

1. Configure `eas.json` with development, preview and production profiles.
2. Build and install a development build on a real device; run `expo start --dev-client`.
3. Use `app.config.ts` + `APP_VARIANT` so dev and production can be installed side by side.
4. Build an internal preview APK and share the install link with someone.
5. Register an iOS device with `eas device:create` and install an ad-hoc preview build.
6. Add an `eas-build-on-error` hook that posts to a webhook.
