# 04 · CI/CD pipelines

## 1. What a mobile pipeline does

> **In short:** Check every PR, build a testable binary for every merge, and release to the stores (or OTA) from a tagged commit — with humans only approving, not clicking through Xcode.

```
PR                → lint · typecheck · unit tests                    (minutes)
Merge to main     → EAS build (preview) · E2E tests · notify testers (~15–30 min)
Tag v1.4.0        → EAS build (production) · submit to stores        (~30 min + review)
Hotfix (JS only)  → eas update --branch production --rollout 10%     (~2 min)
```

The key mobile-specific difference from web CI: builds are **slow and expensive**, so you don't build every commit — you build on merge and on tags.

## 2. PR checks with GitHub Actions

> **In short:** Fast, cheap checks on every pull request; no native builds here.

```yaml
# .github/workflows/pr.yml
name: PR checks
on: pull_request

concurrency:
  group: pr-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx expo lint
      - run: npm test -- --coverage --maxWorkers=2
      - run: npx expo-doctor
```

Optionally add a **fingerprint check** that tells reviewers whether this PR requires a new native build:

```yaml
      - name: Native fingerprint
        run: npx @expo/fingerprint . > fingerprint.json && cat fingerprint.json
```

## 3. Building with EAS from CI

> **In short:** Authenticate with an `EXPO_TOKEN`, then call `eas build --non-interactive`.

```bash
# Create a robot token in expo.dev → Account settings → Access tokens
# Add it as the repository secret EXPO_TOKEN
```

```yaml
# .github/workflows/build-preview.yml
name: Preview build
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
      - name: Build preview (both platforms)
        run: eas build --profile preview --platform all --non-interactive --no-wait
```

`--no-wait` returns immediately (the build continues on EAS); drop it when a later step needs the artifact.

## 4. Release pipeline

> **In short:** Tag a version, build production binaries, submit them to the stores, and publish a matching OTA update.

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*.*.*']

jobs:
  release:
    runs-on: ubuntu-latest
    environment: production            # require manual approval via GitHub environments
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - uses: expo/expo-github-action@v8
        with: { eas-version: latest, token: '${{ secrets.EXPO_TOKEN }}' }
      - run: npm ci
      - run: npm test

      - name: Build production
        run: eas build --profile production --platform all --non-interactive --wait

      - name: Submit to stores
        run: eas submit --profile production --platform all --non-interactive --latest

      - name: Publish matching OTA update
        run: eas update --branch production --message "Release ${{ github.ref_name }}" --non-interactive
```

## 5. OTA update pipeline

> **In short:** JS-only changes can ship through a lightweight workflow with a staged rollout and an easy rollback.

```yaml
# .github/workflows/ota.yml
name: OTA update
on:
  workflow_dispatch:
    inputs:
      branch:   { description: 'Update branch', default: 'preview', type: choice, options: [preview, production] }
      rollout:  { description: 'Rollout %', default: '10' }
      message:  { description: 'Update message', required: true }

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - uses: expo/expo-github-action@v8
        with: { eas-version: latest, token: '${{ secrets.EXPO_TOKEN }}' }
      - run: npm ci
      - run: npm test
      - name: Publish update
        run: |
          eas update --branch "${{ inputs.branch }}" \
            --message "${{ inputs.message }}" \
            --rollout-percentage "${{ inputs.rollout }}" \
            --non-interactive
```

⚠️ Gate production OTA updates behind the same test suite as a binary release — an OTA update reaches users **faster** than a store build, so a bad one hurts more.

## 6. EAS Workflows

> **In short:** Expo's own CI (`.eas/workflows/*.yml`) runs these pipelines on EAS infrastructure, with native understanding of builds, updates and fingerprints.

```yaml
# .eas/workflows/release.yml
name: Release
on:
  push:
    branches: [main]

jobs:
  test:
    steps:
      - uses: eas/checkout
      - uses: eas/install_node_modules
      - run: npm test

  build_ios:
    needs: [test]
    type: build
    params: { platform: ios, profile: production }

  build_android:
    needs: [test]
    type: build
    params: { platform: android, profile: production }

  submit:
    needs: [build_ios, build_android]
    type: submit
    params: { profile: production }
```

Useful built-in job types: `build`, `submit`, `update`, `fingerprint`, and `get_build` — plus conditional logic that skips a native build when the fingerprint hasn't changed (build only when you must).

| | GitHub Actions | EAS Workflows |
| --- | --- | --- |
| Where it runs | Your runners (+ EAS for builds) | EAS |
| Knows about fingerprints/channels | Via CLI | Natively |
| Reuse with web/backend CI | ✅ one place | ❌ mobile-focused |
| Best for | Teams already standardised on GitHub | Mobile-only repos wanting the least setup |

Alternatives: **Bitrise**, **Codemagic**, **CircleCI**, or GitHub Actions + **Fastlane** for teams building natively.

## 7. Versioning strategy

> **In short:** Semver for the user-visible version, auto-incremented build numbers, and a tag per release.

```json
// eas.json
{ "cli": { "appVersionSource": "remote" },
  "build": { "production": { "autoIncrement": true } } }
```

- `appVersionSource: "remote"` lets EAS own build numbers so two people can't collide.
- Bump `version` in `app.json` (or with a release script) for user-facing releases.
- Tag the commit (`v1.4.0`) — the tag is what the release workflow builds.
- Generate release notes from Conventional Commits (`release-please`, `changesets`).

## 8. Secrets in CI

> **In short:** Store `EXPO_TOKEN`, store API keys and Sentry tokens as encrypted CI secrets; never in the repo.

| Secret | Used for |
| --- | --- |
| `EXPO_TOKEN` | EAS CLI authentication |
| App Store Connect API key (`.p8`, key id, issuer id) | `eas submit` to iOS |
| Google Play service account JSON | `eas submit` to Android |
| `SENTRY_AUTH_TOKEN` | Source map upload |
| `EXPO_PUBLIC_*` values | Build-time config (not secret, but environment-specific) |

Scope secrets to environments (preview vs production) and require approval for production jobs.

## 9. Testing in the pipeline

> **In short:** Unit and component tests on every PR; E2E against a real build before release.

```yaml
  e2e:
    needs: [build]
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - run: curl -Ls https://get.maestro.mobile.dev | bash
      - name: Download the EAS build artifact
        run: eas build:download --platform ios --profile preview --output ./app.tar.gz
      - name: Boot simulator and install
        run: |
          xcrun simctl boot "iPhone 16"
          tar -xzf app.tar.gz && xcrun simctl install booted TaskMate.app
      - run: maestro test .maestro/
```

E2E runs are slow — run them on merge to main and before releases, not on every PR.

## 10. A pragmatic setup for a small team

> **In short:** Four workflows cover almost everything.

| Workflow | Trigger | Does |
| --- | --- | --- |
| `pr.yml` | Pull request | typecheck, lint, tests, fingerprint note |
| `preview.yml` | Push to `main` | EAS preview build + OTA to `preview` + notify |
| `release.yml` | Tag `v*` | production build + submit + OTA to `production` |
| `ota.yml` | Manual | staged OTA update with a rollout percentage |

---

## 11. Exercises

1. Add `pr.yml` with typecheck, lint and tests; make it fail on a type error.
2. Create an Expo robot token, add it as `EXPO_TOKEN`, and build a preview from CI.
3. Add a release workflow triggered by a `v*` tag, behind a GitHub environment approval.
4. Add a manual OTA workflow with branch and rollout-percentage inputs.
5. Add a fingerprint step and use it to decide whether a native build is needed.
6. Run a Maestro E2E suite in CI against a downloaded EAS build.
