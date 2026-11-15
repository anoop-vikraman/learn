# Build and deploy

Getting the app from your laptop onto real devices and into the stores — then updating it safely.

| # | Lesson | You will learn |
| --- | --- | --- |
| 01 | [EAS Build](01-eas-build.md) | How EAS works, `eas.json` profiles, dev/preview/production builds, local builds, environment variables, troubleshooting |
| 02 | [App signing and credentials](02-signing-credentials.md) | iOS certificates, provisioning profiles, Android keystores, EAS-managed vs manual credentials, what must never be lost |
| 03 | [OTA updates with EAS Update](03-ota-updates.md) | How OTA works, runtime versions, channels and branches, rollout and rollback, what can and can't be updated, store policy |
| 04 | [CI/CD pipelines](04-ci-cd-pipelines.md) | GitHub Actions and EAS Workflows: build, test, update, submit; release strategy, versioning, secrets |
| 05 | [Store submission and release](05-store-submission.md) | App Store Connect and Play Console, EAS Submit, review rejections, staged rollouts, TestFlight/internal testing |
| — | [**Production notes**](production.md) | Release checklist, rollback playbook, credential hygiene, cost and quota management |

**Order matters here:** read 01 → 02 → 03 before setting anything up; the credential and runtime-version decisions are hard to change later.
