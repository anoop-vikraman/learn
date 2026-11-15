# App development: production notes

## 1. API clients

> **In short:** One client module with base URL, auth, timeouts, retries and a normalized error shape — and defensive defaults because mobile networks fail often.

- **Always set timeouts** (`AbortSignal.timeout(15_000)`); a hung request holds a spinner forever.
- Retry idempotent requests with backoff + jitter; never retry non-idempotent POSTs without an idempotency key.
- Normalize errors into `{ status, code, message }` so the UI can branch on `code`.
- Add an app version / platform header so the backend can diagnose and, if needed, force upgrades.
- Support a **minimum supported version** response (e.g. 426) that shows a "please update" screen — you can't force everyone onto a new binary.

## 2. Token refresh in production

> **In short:** Single in-flight refresh, rotation, revocation on logout, and a graceful path when refresh fails.

- Share one refresh promise so parallel 401s don't race (see [02-storage-auth-security.md](02-storage-auth-security.md#3-token-strategy)).
- Rotate refresh tokens and revoke the old one server-side; detect reuse as a theft signal.
- If refresh fails, clear the session and route to login **without** losing unsaved work where possible.
- Handle clock skew: don't rely solely on local time to decide expiry.

## 3. Push notification infrastructure

> **In short:** Tokens change, devices go stale, and delivery is never guaranteed — design the backend accordingly.

- Store tokens per **device**, not per user (one user, many devices); include platform and app version.
- Re-register on every launch; delete tokens the push service reports as invalid.
- Expo Push Service vs direct FCM/APNs: Expo is far simpler; go direct when you need advanced targeting or already have infrastructure.
- Respect quiet hours and user preferences; let users turn categories off in-app.
- Never put sensitive content in a notification body (it shows on the lock screen).
- Test the three states: foreground, background tap, cold-start tap.

## 4. Offline sync pitfalls

> **In short:** The hard parts are duplicates, conflicts and unbounded queues — decide the policy before writing code.

| Pitfall | Mitigation |
| --- | --- |
| Duplicate records after a retry | Client-generated IDs + idempotency keys |
| Conflicting edits | Timestamps/versions + a documented policy (last-write-wins, server-wins, merge) |
| Queue grows forever | Cap it; surface permanent failures to the user |
| Stale UI after sync | Invalidate queries after replaying mutations |
| Users think it saved | Show per-item sync state, not just a global spinner |
| Cache leaks between accounts | Clear all caches on logout |

## 5. Performance and battery

> **In short:** Background work, location and polling are the top battery complaints — and battery complaints become one-star reviews.

- Stop location watchers, sensors and timers when the screen loses focus.
- Prefer push over polling; if you must poll, back off when backgrounded.
- Batch network requests; don't sync on every keystroke.
- Compress images before upload; cap attachment sizes.
- Watch app size: every MB reduces install conversion on slow networks.

## 6. Privacy and compliance

> **In short:** Store listings require accurate data disclosures, and permissions you request must match what you actually do.

- iOS **Privacy Nutrition Labels** and Android **Data Safety** must match reality, including SDKs (analytics, crash reporting, ads).
- iOS **App Tracking Transparency** if you track across apps.
- Provide a privacy policy URL and in-app **account deletion**.
- Scrub PII from logs and crash reports.
- Children's apps (COPPA) and health/finance data have extra rules.

## 7. Monitoring what matters on mobile

> **In short:** Track crash-free rate, ANRs, cold start, API errors and adoption of the latest version.

| Metric | Target/why |
| --- | --- |
| Crash-free sessions | > 99.5%; the primary quality signal |
| Android ANRs | Google surfaces these in Play Console and penalises bad ones |
| Cold start time | < 2 s to first interactive screen |
| API error rate / p95 latency | Mobile users abandon quickly |
| Version adoption | How fast users move to new binaries/OTA updates |
| Permission grant rates | Low rates mean your prompts need better context |

Tools: Sentry/Bugsnag, Firebase Crashlytics + Performance, Play Console vitals, App Store Connect metrics.

## 8. Checklist

> **In short:** Verify these before shipping features in this folder.

- [ ] Every network call has a timeout and a visible error state with retry
- [ ] Tokens in SecureStore; access token in memory; refresh is single-flight
- [ ] Logout clears tokens, query cache, local storage and cached files
- [ ] Offline: data visible, mutations queued, duplicates impossible, state communicated
- [ ] Permissions requested in context with honest purpose strings and a Settings fallback
- [ ] Push tokens registered/refreshed; taps deep-link correctly from cold start
- [ ] Location/sensor watchers stopped on blur
- [ ] Images resized before upload; cache directory bounded
- [ ] Animations run on the UI thread; reduced-motion respected
