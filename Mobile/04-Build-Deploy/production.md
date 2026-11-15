# Build and deploy: production notes

## 1. The release model

> **In short:** Decide, per change, whether it ships as an OTA update or a store build — and make that decision explicit in every PR.

```
JS-only change ──▶ OTA update (minutes, staged rollout, instant rollback)
Native change  ──▶ New binary (hours to days, store review, no rollback)
Emergency      ──▶ Server-side feature flag (seconds)
```

A PR template question — *"Does this require a new native build?"* — plus a fingerprint check in CI keeps teams from shipping an OTA update that an old binary can't run.

## 2. Environments

> **In short:** Three app variants, three channels, three backends — installed side by side and never confused.

| Variant | Bundle ID | EAS profile | Update channel | Backend |
| --- | --- | --- | --- | --- |
| Development | `com.example.app.dev` | `development` | `development` | dev API |
| Preview / QA | `com.example.app.preview` | `preview` | `preview` | staging API |
| Production | `com.example.app` | `production` | `production` | production API |

Drive it with `APP_VARIANT` in `app.config.ts` so the name, icon and API URL differ visibly — testers should never wonder which build they're using.

## 3. Credential hygiene

> **In short:** Treat signing credentials like production secrets; losing the Android upload key without Play App Signing is unrecoverable.

- Play App Signing **enabled**; upload key and passwords in the team password manager with at least two custodians.
- iOS distribution certificate, APNs key and App Store Connect API key backed up and documented.
- CI uses scoped robot tokens and API keys, never personal accounts.
- Access reviewed when people join or leave; 2FA enforced everywhere.
- Document which Apple Team and Google account own each app.

## 4. Build and update discipline

> **In short:** Reproducible builds from git, correct runtime versions, and gated production updates.

- Builds come from a **tagged commit**, never a dirty working tree.
- `appVersionSource: "remote"` + `autoIncrement` so build numbers never collide.
- Runtime version policy: **fingerprint** (or `appVersion` with discipline) so OTA updates can't reach incompatible binaries.
- Production OTA updates run the same test suite as a release, and start at a small rollout percentage.
- Every binary release publishes a matching OTA update so all users converge on the same JS.

## 5. Monitoring a release

> **In short:** Watch crash rate, adoption and errors for 24–48 hours, tagged by build and update ID.

| Signal | Where | Act when |
| --- | --- | --- |
| Crash-free sessions | Sentry / Crashlytics | Drops below your baseline (e.g. 99.5%) |
| ANR rate (Android) | Play Console vitals | Above Google's bad-behaviour threshold |
| New issues by release | Sentry, filtered on `release` + `update_id` | Any spike |
| Update adoption | EAS Update dashboard | Stalled rollout = delivery problem |
| API errors by app version | Backend logs | Old versions failing against a new API |
| Store reviews | App Store Connect / Play Console | Repeated reports of the same issue |

## 6. Rollback playbook

> **In short:** Three levers, in order of speed — practise them before you need them.

1. **Feature flag / remote config** — disable the broken feature in seconds.
2. **OTA rollback** — `eas update:roll-back-to-embedded --branch production`, or republish the last good update group, or repoint the channel. Verify crash rate recovers.
3. **Store rollout halt** — stop a staged rollout so new users don't get the bad binary (existing installs keep it; fix via OTA or a new release).

Document who can run each step, and keep the commands in the repo README.

## 7. Cost and quota

> **In short:** Builds and updates cost money or queue time — optimise what you build, not just how.

- Don't build on every commit; build on merge and on tags.
- Use the fingerprint to **skip** native builds when nothing native changed.
- Build only the platform you need while iterating (`--platform android`).
- Prefer OTA updates for JS fixes — cheaper and faster than a build.
- Watch EAS plan limits (concurrency, monthly builds, update bandwidth) and have a local-build fallback documented.

## 8. Checklist

> **In short:** The short version of everything in this folder.

- [ ] `eas.json` has development/preview/production profiles with channels
- [ ] Credentials managed, backed up and documented; Play App Signing on
- [ ] Runtime version policy set to `fingerprint`
- [ ] CI: PR checks, preview build on merge, release on tag, manual OTA workflow
- [ ] Secrets stored as scoped CI secrets; production jobs require approval
- [ ] Source maps uploaded per build; crash reports tagged with update ID
- [ ] Staged rollout used for both store releases and production OTA updates
- [ ] Rollback playbook written and rehearsed
