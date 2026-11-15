# 03 · OTA updates with EAS Update

## 1. What an OTA update is

> **In short:** Your app's JavaScript bundle and assets live inside the binary but can be **replaced at runtime** — so you can ship JS fixes in minutes without a store review.

```
Store release (binary) ──▶ contains JS bundle v1 + native code
                             │
EAS Update publish      ──▶ new JS bundle v2 on the CDN
                             │
App launches ──▶ checks for an update ──▶ downloads v2 ──▶ applies on next launch
```

What this buys you: a crash fix live in 10 minutes instead of 1–3 days, feature flags you can actually flip, and A/B of JS behaviour per channel.

## 2. What can and cannot be updated

> **In short:** JavaScript and assets, yes; anything native, no — that always needs a new binary.

| ✅ OTA-updatable | ❌ Needs a new build |
| --- | --- |
| JS/TS code, business logic, UI | Adding/removing a native library |
| Images, fonts and other bundled assets | Changing permissions or Info.plist/Manifest entries |
| Styles, copy, layout | Upgrading the Expo SDK or React Native |
| Bug fixes, new screens built from existing primitives | App icon, splash screen, app name |
| Config read from JS | Native config plugin changes |

The dividing line is the **runtime version**: if the native side changed, the runtime version must change, and old binaries must not receive the new JS.

## 3. Runtime versions (the critical concept)

> **In short:** The runtime version identifies the native layer an update is compatible with — updates are only delivered to binaries with a **matching** runtime version.

```json
// app.json
{ "expo": { "runtimeVersion": { "policy": "appVersion" } } }
```

| Policy | Runtime version is | Behaviour |
| --- | --- | --- |
| `appVersion` | Your `version` (e.g. `1.4.0`) | New runtime per app version — safe, common |
| `sdkVersion` | The Expo SDK version | Updates span app versions on the same SDK |
| `fingerprint` | A hash of your **native** dependencies and config | **Most accurate**: changes automatically only when native changes |
| Custom string | Whatever you set | Full manual control |

`fingerprint` is the modern recommendation: Expo computes a hash of everything that affects the native build, so you physically cannot ship an incompatible update.

⚠️ **The classic OTA disaster:** add a native library, publish a JS update that imports it, and every user on the old binary crashes on launch because the native module doesn't exist. Correct runtime versioning prevents exactly this.

## 4. Setup

> **In short:** Install `expo-updates`, configure channels in `eas.json`, and build a binary that listens to a channel.

```bash
npx expo install expo-updates
eas update:configure
```

```json
// app.json
{
  "expo": {
    "runtimeVersion": { "policy": "fingerprint" },
    "updates": {
      "url": "https://u.expo.dev/your-project-id",
      "fallbackToCacheTimeout": 0,
      "checkAutomatically": "ON_LOAD"
    }
  }
}
```

```json
// eas.json — each build profile listens to one channel
{ "build": {
    "preview":    { "channel": "preview" },
    "production": { "channel": "production" }
} }
```

## 5. Channels and branches

> **In short:** A **branch** is a line of updates; a **channel** is what a binary subscribes to; you map branches to channels so the same build can receive different update streams over time.

```
git branch  ──publish──▶  update branch  ──mapped to──▶  channel  ──▶  installed binaries
 main                      "production"                  production      store release
 release/2.0               "staging"                     preview         testers
```

```bash
eas update --branch production --message "Fix crash on task detail"
eas update --branch preview --message "New onboarding flow"
eas update --auto                              # infers branch from the current git branch

eas channel:list
eas branch:list
eas update:list --branch production
eas channel:edit production --branch hotfix-2026-11   # point production at a different branch
```

That last command is powerful: you can repoint a channel to a known-good branch to **roll back everyone instantly**, without publishing anything new.

## 6. How the client applies updates

> **In short:** By default the app checks on launch, downloads in the background, and applies the update the **next** time it starts.

```
Launch → check for update → (found) download in background → run the OLD bundle this session
Next launch → run the NEW bundle
```

Take control when you need faster rollout:

```tsx
import * as Updates from 'expo-updates';

export function useUpdateCheck() {
  const { isUpdateAvailable, isUpdatePending } = Updates.useUpdates();

  useEffect(() => {
    if (isUpdatePending) {
      Alert.alert('Update ready', 'Restart to apply the latest version?', [
        { text: 'Later', style: 'cancel' },
        { text: 'Restart', onPress: () => Updates.reloadAsync() },
      ]);
    }
  }, [isUpdatePending]);
}

// Manual check (e.g. when the app returns to the foreground)
async function checkNow() {
  if (__DEV__) return;                                  // updates don't apply in dev
  const result = await Updates.checkForUpdateAsync();
  if (result.isAvailable) {
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
  }
}
```

Useful values: `Updates.updateId`, `Updates.runtimeVersion`, `Updates.channel`, `Updates.createdAt` — send these with crash reports so you know which bundle a crash came from.

⚠️ Don't force a reload mid-task; it feels like a crash. Prompt, or apply on next launch.

## 7. Rollout and rollback

> **In short:** Roll out gradually, watch crash rates, and have a one-command rollback.

```bash
# Gradual rollout
eas update --branch production --message "v1.4.1 fix" --rollout-percentage 10
eas update:edit --rollout-percentage 50
eas update:edit --rollout-percentage 100

# Rollback options
eas update:republish --group <previous-update-group-id>     # re-publish a known-good update
eas channel:edit production --branch previous-good          # repoint the channel
eas update:roll-back-to-embedded --branch production        # revert to the JS inside the binary
```

`roll-back-to-embedded` is the safety net: it tells clients to use the bundle that shipped in the store build, which is always compatible.

**Playbook when a bad update ships:** detect (crash spike in Sentry) → `roll-back-to-embedded` or republish the last good group → confirm the crash rate drops → fix → re-publish with a small rollout percentage.

## 8. Store policies

> **In short:** Both stores allow OTA JS updates, but not to change what the app fundamentally does or to bypass review.

- **Apple** (guideline 3.3.2 / 2.5.2): interpreted code may be downloaded if it doesn't change the app's primary purpose, doesn't add features outside what was reviewed, and doesn't introduce new native capabilities.
- **Google Play**: similar — no changing the app's core behaviour or violating policy through updates.

Safe: bug fixes, UI tweaks, copy, flag-gated features reviewed earlier. Risky: enabling a payment flow that bypasses in-app purchase, switching the app's purpose, or shipping content you'd never submit.

## 9. OTA in the release process

> **In short:** Decide per change whether it's an OTA update or a store release, and keep the two in sync.

| Change | Path |
| --- | --- |
| Copy fix, styling, JS bug | OTA to `production` |
| New screen using existing libraries | OTA (ideally behind a flag) |
| New native library, SDK upgrade, permission | New build + store submission |
| Urgent crash fix | OTA immediately, then roll into the next binary |

Always **publish an update to the matching branch when you ship a new binary**, so users who install the store build and users who update OTA converge on the same JS.

## 10. Alternatives and history

> **In short:** EAS Update is Expo's service; Microsoft's CodePush was the classic alternative, and self-hosting the update protocol is possible.

- **CodePush** (App Center) was the long-time standard; App Center retired in 2025, and the community now points to EAS Update or self-hosted options.
- **Self-hosted**: Expo's update protocol is open; projects like `expo-open-ota` let you serve updates from your own infrastructure (useful for compliance or cost).
- **react-native-code-push** still exists for bare RN with self-hosted backends.

---

## 11. Exercises

1. Configure `expo-updates` with the `fingerprint` runtime policy and build a preview binary.
2. Change a string, publish with `eas update --branch preview`, and watch the app pick it up on the second launch.
3. Add an in-app "update available — restart?" prompt using `Updates.useUpdates()`.
4. Publish an intentionally broken update, then recover with `update:roll-back-to-embedded`.
5. Do a 10% → 100% staged rollout and inspect the update list.
6. Add `Updates.updateId` and `runtimeVersion` as tags in Sentry.
