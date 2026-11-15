# Mobile: React Native + Expo

Build iOS and Android apps with **React Native** and **Expo**, from your first screen to app-store releases with EAS Build, CI/CD pipelines and over-the-air updates.

**Prerequisites:** JavaScript ([../FE/01-JavaScript/basics/](../FE/01-JavaScript/basics/)), React ([../FE/02-React/basics/](../FE/02-React/basics/)) and TypeScript basics ([../FE/03-TypeScript/basics/](../FE/03-TypeScript/basics/)). Everything you know about components, props, state, hooks and context carries over.

| # | Folder | Covers |
| --- | --- | --- |
| 01 | [Fundamentals](01-Fundamentals/) | **How React Native works internally** (bridge → JSI/Fabric/TurboModules), setup with Expo, core components, styling with Flexbox, lists, navigation with Expo Router, forms and input |
| 02 | [App development](02-App-Development/) | Data fetching and offline, storage, auth and secure storage, device APIs (camera, location, notifications, files), animations and gestures, platform differences |
| 03 | [Advanced](03-Advanced/) | Performance and profiling, native modules and config plugins, testing, architecture at scale, accessibility, debugging |
| 04 | [Build and deploy](04-Build-Deploy/) | **EAS Build**, app signing, build profiles, **EAS Update (OTA)**, **CI/CD pipelines**, store submission and release management |
| 05 | [Interview prep](05-Interview-Prep/) | Q&A with answers, a cheat sheet, and how to talk about mobile work in interviews |

Each lesson has a one-line `> **In short:**` summary under every section, runnable code, and exercises. Build-and-deploy and production topics appear in folder 04 and in each folder's own production notes.

## Suggested path

1. **Week 1:** `01-Fundamentals/` 00 → 05, building a small task app.
2. **Week 2:** `02-App-Development/` — add API data, auth, storage and one device API.
3. **Week 3:** `03-Advanced/` performance + testing, then `04-Build-Deploy/` end to end: a real build on EAS, an OTA update, and a CI pipeline.
4. **Interview week:** `05-Interview-Prep/`, plus re-read `01-Fundamentals/00-how-react-native-works.md`.

## The example app

The lessons build **TaskMate**: a task manager with login, a task list with offline support, camera attachments, push notifications and OTA updates — the same domain as the FE and BE tracks, so the three fit together.

## Versions

Examples target **Expo SDK 54+ / React Native 0.81+** with the **New Architecture** (the default since SDK 52) and **Expo Router v6**. Where the old architecture differs, it's flagged.
