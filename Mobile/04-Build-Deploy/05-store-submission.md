# 05 · Store submission and release

## 1. Before your first submission

> **In short:** Set up developer accounts, app listings and legal pages early — approvals and verification can take days.

| Platform | Needs |
| --- | --- |
| **Apple** | Apple Developer Program ($99/year), 2FA, App Store Connect app record, bundle ID |
| **Google** | Play Console account ($25 one-time), **identity verification**, app record, package name |
| Both | Privacy policy URL, support contact, data-safety disclosures, age rating, screenshots |

Google now requires identity/organisation verification and (for new personal accounts) a closed-testing period with testers before production access — budget time for this.

## 2. EAS Submit

> **In short:** `eas submit` uploads a finished build to App Store Connect or Google Play using stored API credentials.

```bash
eas submit --platform ios --latest
eas submit --platform android --latest
eas submit --profile production --platform all --latest --non-interactive
```

```json
// eas.json
{ "submit": {
    "production": {
      "ios": { "appleId": "you@example.com", "ascAppId": "1234567890", "appleTeamId": "ABCDE12345" },
      "android": { "serviceAccountKeyPath": "./play-service-account.json", "track": "internal", "releaseStatus": "draft" }
    }
} }
```

Android tracks: `internal` → `alpha` (closed) → `beta` (open) → `production`. Promote through the Play Console or by submitting to a higher track.

Build-and-submit in one step: `eas build --profile production --platform all --auto-submit`.

## 3. Testing distribution

> **In short:** TestFlight for iOS and internal/closed testing for Android let real users try the build before it's public.

| Channel | Audience | Review? |
| --- | --- | --- |
| **TestFlight internal** | Up to 100 team members | No review |
| **TestFlight external** | Up to 10,000 testers | Light review for the first build of a version |
| **Play internal testing** | Up to 100 testers | No review, available in minutes |
| **Play closed/open testing** | Larger groups | Reviewed |
| EAS internal distribution | Anyone with the link (iOS needs registered UDIDs) | None |

Always ship a release candidate to TestFlight/internal testing first — it catches signing, environment and store-config problems that never appear in development.

## 4. Store listing assets

> **In short:** Screenshots and descriptions sell the app, and both stores reject listings that don't match the product.

| Asset | Requirement |
| --- | --- |
| App icon | 1024×1024 PNG, no alpha, no rounded corners |
| iPhone screenshots | Required for 6.7" (and 6.5"/5.5" depending on support); 3–10 per size |
| Android screenshots | Phone + tablet; feature graphic 1024×500 |
| Description | Short (80 chars) + full; keyword-aware but no keyword stuffing |
| Privacy policy URL | Mandatory |
| What's new | Per release; users read this |
| Demo account | Give reviewers working credentials — missing this is a top rejection reason |

Generate screenshots consistently (Fastlane `snapshot`, or a script driving Maestro) so they stay current.

## 5. Review: the common rejections

> **In short:** Most rejections are predictable — incomplete functionality, missing privacy items, permissions without justification, or broken reviewer access.

| Rejection | Prevention |
| --- | --- |
| Reviewer couldn't log in | Provide demo credentials; make sure they work and aren't rate-limited |
| Crashes on the reviewer's device | Test the exact production build on a real device |
| Missing privacy policy / inaccurate data disclosures | Fill them in truthfully, including third-party SDKs |
| Permission with no clear purpose string or in-app justification | Specific strings; request in context |
| No account deletion (apps with sign-up) | Add in-app deletion |
| Missing Sign in with Apple when other social logins exist | Add it on iOS |
| Payments outside IAP for digital goods | Use in-app purchase where required |
| "Minimum functionality" / looks like a website wrapper | Add real native value |
| Beta/placeholder content, broken links | Ship finished builds |
| Android target SDK too old | Keep up with the annual requirement |

If rejected: read the exact guideline cited, fix it, and reply in Resolution Center with what changed. Appeals are possible but slow; rebuilding correctly is usually faster.

## 6. Staged rollouts

> **In short:** Release to a small percentage first and watch crash metrics before going wide.

- **Google Play:** staged rollout (e.g. 5% → 20% → 50% → 100%); you can **halt** a rollout, which stops new users getting the bad build.
- **Apple:** phased release over 7 days for automatic updates; you can pause it. Users who manually update still get it immediately.
- Watch: crash-free rate, ANR rate, 1-star review velocity, key funnel metrics, API error rate.
- Remember you **cannot un-ship a binary** — only halt the rollout and submit a fix. This is why OTA updates matter for JS bugs.

## 7. Release checklist

> **In short:** Run this list before every store submission.

- [ ] Version bumped; build number auto-incremented; git tagged
- [ ] Tested on real iOS and low-end Android devices in a **production** build
- [ ] Crash reporting active; source maps/dSYMs uploaded for this build
- [ ] OTA channel and runtime version correct for this binary
- [ ] Demo credentials valid; deep links work from a cold start
- [ ] Store listing updated: screenshots, what's new, data safety
- [ ] Permissions and purpose strings match current features
- [ ] Backend deployed and backward-compatible with the previous app version
- [ ] Staged rollout plan + who is watching dashboards for the next 24 h
- [ ] Rollback plan written down (halt rollout, OTA rollback, feature flag)

## 8. After release

> **In short:** The release isn't done when it's approved — watch adoption and quality for the first few days.

- Monitor crash-free sessions, ANRs and new Sentry issues for 24–48 hours.
- Watch version adoption; some users take weeks to update.
- Read new reviews — they surface bugs your telemetry misses.
- Keep the previous version's API contract working until adoption is high.
- Write down anything that went wrong in the process and fix the process, not just the bug.

---

## 9. Exercises

1. Create app records in App Store Connect and Play Console with correct bundle IDs.
2. Submit a build to TestFlight with `eas submit` and install it as an external tester.
3. Upload to the Play internal testing track and install from the tester link.
4. Fill in data-safety/privacy answers and a privacy policy page.
5. Prepare screenshots for the required device sizes.
6. Write your team's release checklist and rollback playbook in the repo.
