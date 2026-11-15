# App development

Turning a UI into a real app: data, auth, storage, device features and motion.

| # | Lesson | You will learn |
| --- | --- | --- |
| 01 | [Data fetching and offline](01-data-fetching-offline.md) | TanStack Query on mobile, caching and persistence, offline mutations, network state, optimistic updates, error/retry UX |
| 02 | [Storage, auth and security](02-storage-auth-security.md) | AsyncStorage vs MMKV vs SQLite, SecureStore and the Keychain/Keystore, token flows, biometrics, OAuth with `expo-auth-session`, mobile security |
| 03 | [Device APIs](03-device-apis.md) | Permissions, camera and image picker, location and maps, files and sharing, push notifications, haptics, sensors, background tasks |
| 04 | [Animations and gestures](04-animations-gestures.md) | Animated vs Reanimated, worklets and the UI thread, shared values, layout animations, Gesture Handler, shared element transitions |
| — | [**Production notes**](production.md) | API clients, token refresh, push infrastructure, offline sync pitfalls, privacy and battery |

By the end of this folder TaskMate logs in, syncs tasks, works offline, attaches photos, sends reminders and animates smoothly.
