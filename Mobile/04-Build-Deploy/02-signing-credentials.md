# 02 · App signing and credentials

Credentials are where most first-time mobile releases get stuck. Understanding them once saves days.

## 1. Why apps are signed

> **In short:** Both platforms require every app to be cryptographically signed so the OS and the store can verify who published it and that the binary wasn't tampered with.

A signature ties the app to **you**. Lose the signing identity and, depending on the platform, you may be unable to ship updates to existing users at all.

## 2. iOS credentials

> **In short:** iOS needs a **distribution certificate** (identifies you) and a **provisioning profile** (ties the certificate, app ID and devices together) — EAS can create and store both.

| Item | What it is |
| --- | --- |
| **Apple Developer account** | $99/year; required to ship to the App Store or TestFlight |
| **App ID / Bundle Identifier** | `com.example.taskmate` — permanent once published |
| **Distribution certificate** | Your signing identity (`.p12` + private key). Limited number per account |
| **Provisioning profile** | Links certificate + App ID + capabilities (+ device UDIDs for ad-hoc) |
| **Push key (APNs)** | `.p8` key for push notifications — one per team, reusable |
| **App Store Connect API key** | For automated submission (`.p8` + key ID + issuer ID) |

```bash
eas credentials                       # interactive management
eas credentials --platform ios
```

EAS can generate everything for you on first build (recommended), or you can upload existing credentials. Capabilities (push, associated domains, app groups) are configured from your `app.json` entitlements during prebuild.

## 3. Android credentials

> **In short:** Android apps are signed with a **keystore**; losing the original upload key is recoverable **only** if you enrolled in Play App Signing.

| Item | What it is |
| --- | --- |
| **Keystore** (`.jks`) | Contains the signing key; protected by passwords |
| **Upload key** | What you sign uploads with |
| **App signing key** | What Google re-signs with, if you use **Play App Signing** |
| **Service account JSON** | Credentials for automated Play Console uploads |

```bash
eas credentials --platform android
```

✅ **Enable Play App Signing** (default for new apps). Google holds the app signing key; if you lose your upload key, you can request a reset. Without it, a lost keystore means you can never update that app listing again — you'd have to publish a new app and lose all your users and reviews.

## 4. EAS-managed vs manual credentials

> **In short:** Let EAS manage them unless your organisation requires holding the keys itself.

| | EAS-managed (remote) | Manual (local `credentials.json`) |
| --- | --- | --- |
| Setup | Automatic on first build | You provide files |
| Team sharing | Built in (everyone with project access) | You distribute files yourself |
| Rotation | `eas credentials` | Manual |
| Suits | Most teams | Strict compliance, existing CI, enterprise policy |

```json
// credentials.json (manual mode) — ⚠️ never commit the referenced files
{
  "android": {
    "keystore": {
      "keystorePath": "credentials/release.jks",
      "keystorePassword": "$KEYSTORE_PASSWORD",
      "keyAlias": "upload",
      "keyPassword": "$KEY_PASSWORD"
    }
  },
  "ios": {
    "provisioningProfilePath": "credentials/profile.mobileprovision",
    "distributionCertificate": { "path": "credentials/dist.p12", "password": "$CERT_PASSWORD" }
  }
}
```

## 5. Backing up credentials

> **In short:** Export and store credentials in your team's password manager — treat them like production database passwords.

```bash
eas credentials                       # → download/export options per platform
```

What to back up and where:
- Android **keystore** + passwords → password manager / secrets vault (two custodians, not one laptop).
- iOS **distribution certificate** (`.p12`) + password, **push key** (`.p8`), **App Store Connect API key**.
- Document which Apple Team ID and Google account own the apps.

**The disaster scenario:** the one developer with the keystore leaves, the password is undocumented, Play App Signing was never enabled — the app can no longer be updated. This happens; don't let it.

## 6. Multiple environments

> **In short:** Give each variant its own bundle ID so dev, staging and production are separate apps with separate credentials.

```ts
// app.config.ts
const variant = process.env.APP_VARIANT ?? 'production';
const ids = {
  dev:        { ios: 'com.example.taskmate.dev',     android: 'com.example.taskmate.dev' },
  preview:    { ios: 'com.example.taskmate.preview', android: 'com.example.taskmate.preview' },
  production: { ios: 'com.example.taskmate',         android: 'com.example.taskmate' },
}[variant]!;
```

Each bundle ID gets its own credentials automatically — and testers can keep all three installed.

## 7. Push notification credentials

> **In short:** iOS push needs an APNs key uploaded to EAS/Expo; Android needs an FCM service account.

```bash
eas credentials                        # iOS → Push Notifications → set up a push key
# Android: upload the FCM v1 service account JSON from Firebase
```

A single APNs `.p8` key works for all your apps in a team and doesn't expire — back it up.

## 8. Security practices

> **In short:** Least privilege, rotation and no secrets in git.

- Never commit `.p12`, `.jks`, `.p8`, service-account JSON or `credentials.json` — add them to `.gitignore`.
- Use App Store Connect **API keys** with limited roles rather than a personal Apple ID password in CI.
- Google service accounts: grant only the release permissions needed on the specific app.
- Rotate when someone leaves; audit who has access to the Expo organisation, Apple team and Play Console.
- Enable 2FA on Apple and Google accounts (Apple requires it).

---

## 9. Exercises

1. Run `eas credentials` and inspect what exists for each platform.
2. Build for iOS with EAS-managed credentials and look at the generated provisioning profile.
3. Confirm Play App Signing is enabled for your Android app, and document where the upload key lives.
4. Export your Android keystore and store it in a password manager with its passwords.
5. Set up an App Store Connect API key and a Google service account for automated submission.
6. Configure three bundle IDs via `APP_VARIANT` and install dev + production side by side.
