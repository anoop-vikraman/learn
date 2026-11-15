# Advanced: production notes

## 1. The release quality bar

> **In short:** Mobile releases are slow to fix — a bad build can sit on users' phones for days — so the bar before shipping is higher than on the web.

- [ ] Crash-free sessions > 99.5% in the previous release
- [ ] Tested on a real low-end Android device and the oldest supported iOS device
- [ ] Offline, slow network and permission-denied paths exercised
- [ ] Upgrade path tested: install previous version → update → data intact
- [ ] E2E suite green against the release build
- [ ] Source maps uploaded for the exact build
- [ ] Rollout plan: staged rollout percentage and who watches the dashboards

## 2. Performance budgets

> **In short:** Agree numbers and enforce them, or performance erodes one PR at a time.

| Budget | Typical target |
| --- | --- |
| Cold start (low-end Android, release) | < 2.5 s |
| JS bundle size | Track every release; alert on big jumps |
| App download size | iOS < 100 MB (cellular limit considerations); smaller is better |
| Scroll fps on the main list | ≥ 58 average |
| Memory after 5 minutes of use | Flat, not climbing |

Automate what you can (Flashlight for Android performance scores, a bundle-size check in CI) and review the rest each release.

## 3. Dependency and SDK upgrades

> **In short:** Upgrade continuously in small steps; mobile dependencies rot fast because the platforms move every year.

- **Expo SDK**: one version at a time, on a branch, with a device test pass (see [02-native-modules-plugins.md](02-native-modules-plugins.md#8-upgrading-the-expo-sdk)).
- **Platform requirements**: Apple and Google each raise minimum SDK/Xcode targets annually — missing the deadline blocks submissions.
- **Native libraries**: check New Architecture support before adopting; abandoned native libraries are the hardest kind of tech debt.
- Automate with Renovate/Dependabot, but review native-affecting updates manually.

## 4. Observability

> **In short:** You can't attach a debugger to a user's phone — instrument before you need it.

| Signal | Tool |
| --- | --- |
| Crashes (JS + native) | Sentry / Crashlytics, with source maps and dSYMs |
| ANRs and vitals | Play Console; iOS Xcode Organizer |
| Performance (startup, slow frames) | Sentry Performance / Firebase Performance |
| Analytics funnels | PostHog, Amplitude, Firebase |
| API errors from the app | Your backend logs, tagged with app version |
| Update adoption | EAS Update dashboard, store metrics |

Tag every event with **app version, build number, runtime version and update ID** so you can tell whether a crash came from a binary or an OTA update.

## 5. Incident handling on mobile

> **In short:** You have three levers — an OTA update, a store release, and a server-side switch — and they differ wildly in speed.

| Lever | Speed | Use for |
| --- | --- | --- |
| **Server-side flag / remote config** | Seconds | Disable a broken feature immediately |
| **OTA update (EAS Update)** | Minutes to hours | JS-only bugs, with a rollback available |
| **Store release** | Hours to days (review) | Native changes, permissions, SDK upgrades |

Runbook: detect (crash spike) → mitigate with a flag → fix and roll out an OTA update → verify adoption → post-mortem. Keep a **kill switch** for risky features and a documented rollback for every release channel.

## 6. Supporting multiple app versions

> **In short:** Old binaries live on for months — your backend must keep working for them.

- Version your API; never break an endpoint an old client depends on.
- Send a minimum-supported-version signal and show a blocking "update required" screen when needed.
- Track the version distribution and set a support window (e.g. the last two minor versions).
- Remember data migrations run on devices that skipped several versions.

## 7. Team practices

> **In short:** Treat native config, release notes and device testing as part of the definition of done.

- Native changes go through **config plugins**, never hand-edits to generated folders.
- Every PR states whether it needs a new dev client build.
- Release notes written as you go, not at submission time.
- A device-testing rotation so everyone feels the app on real hardware.
- Store assets (screenshots, descriptions) kept in the repo and updated with features.
