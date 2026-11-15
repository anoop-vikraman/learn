# Talking about mobile work in interviews

Knowing React Native isn't enough — you have to **narrate** experience credibly. This file is about delivery.

---

## 1. If you haven't shipped a mobile app yet

> **In short:** Build one real app end to end and talk about it honestly — "I built and released this" beats "I've read about it" every time.

The minimum credible story is an app that:
1. Has **auth** (login, token storage, logout).
2. Talks to a **real API** with loading, error and empty states.
3. Works **offline** at least for reads.
4. Uses one **device API** (camera, notifications, location).
5. Was **built with EAS** and installed on a real device by someone else.
6. Received at least one **OTA update**.

That's TaskMate from these lessons. Six bullet points of real experience, and you can answer almost every question in [01-interview-questions.md](01-interview-questions.md) from something you actually did.

**Never claim store releases you haven't done.** Say: "I've built and distributed through EAS internal distribution and TestFlight; I haven't owned a public store release, but I know the submission flow and the common rejection reasons." Interviewers respect precision and punish bluffing.

---

## 2. Your two-minute project story

> **In short:** Context → your scope → one hard technical problem in depth → result with a number → what you'd change.

> "TaskMate is a task manager I built with Expo and React Native. It has Keycloak-style JWT auth with refresh tokens in SecureStore, a task list that works offline through a persisted TanStack Query cache with a mutation queue, photo attachments via the camera, and local reminders.
>
> The hardest part was offline sync. My first version created duplicate tasks whenever a queued mutation retried, because the server generated IDs. I moved to client-generated UUIDs sent as idempotency keys, so a replay is a no-op server-side, and added a per-item sync indicator so users can see what hasn't reached the server.
>
> I shipped it through EAS Build with development, preview and production profiles, distributed previews to three testers, and used EAS Update with the fingerprint runtime policy for JS fixes. One update introduced a crash on the detail screen; I rolled back with `update:roll-back-to-embedded` in about two minutes, which taught me to stage OTA rollouts at 10% first.
>
> If I rebuilt it, I'd put the sync engine behind a cleaner abstraction from the start instead of growing it from TanStack Query defaults."

Why this works: it's specific, admits a failure, shows recovery, and ends with reflection.

---

## 3. STAR stories to prepare

> **In short:** Have four stories ready, each with a number in the result.

| Story | Prompt it answers |
| --- | --- |
| **A performance fix** | "Tell me about optimizing something" |
| **A production incident** | "Tell me about something that went wrong" |
| **A technical decision with a trade-off** | "Tell me about a design decision you made" |
| **Working with others** (design, backend, QA) | "Tell me about a disagreement / collaboration" |

### Example: performance

- **S:** The task list stuttered badly on a mid-range Android device once users had a few hundred tasks with photos.
- **T:** I owned the list screen and wanted smooth scrolling on low-end hardware.
- **A:** I profiled with the Perf Monitor and saw JS fps dropping to ~30 while UI fps stayed high — so it was render cost, not native. The React Profiler showed every row re-rendering on each scroll because `renderItem` was an inline arrow and the toggle handler was recreated per row. I memoized the row, moved to `useCallback` passing IDs, added `getItemLayout` for the fixed row height, and switched thumbnails to `expo-image` with CDN-sized URLs instead of full-resolution photos.
- **R:** Scroll stayed at ~58–60 fps with 1,000 items, and memory stopped climbing during long scrolls. I added a Flashlight performance check so it doesn't regress.

### Example: incident

- **S:** An OTA update I published crashed the app at launch for users on the previous binary.
- **T:** Stop the bleeding, then prevent a repeat.
- **A:** Crash reports (tagged with `update_id`) pointed at a native module that existed in my new dev build but not in the shipped binary — my runtime version policy was `appVersion`, so the update was delivered to an incompatible build. I ran `eas update:roll-back-to-embedded`, confirmed the crash rate fell, then switched the project to the **fingerprint** runtime policy and added a staged 10% rollout for production updates.
- **R:** Recovery took under 10 minutes; the misconfiguration can't recur because the fingerprint changes automatically when native code does.

---

## 4. Whiteboard/system-design answers

> **In short:** For "design a mobile app that…", answer in layers: data flow, offline, auth, native needs, release strategy.

**Template:**

1. **Clarify** — platforms, offline requirements, scale, existing backend, team skills.
2. **Architecture** — Expo + Expo Router; feature-folder structure; TanStack Query for server state, Zustand for client state.
3. **Data** — REST/GraphQL, pagination strategy (cursor), caching and persistence, conflict policy for offline writes.
4. **Auth** — short-lived access token in memory, refresh token in SecureStore, single-flight refresh, biometric unlock.
5. **Native needs** — camera/location/push; which need config plugins and therefore a dev client.
6. **Performance** — list virtualization, image sizing, animations on the UI thread, startup budget.
7. **Release** — EAS profiles, channels, fingerprint runtime versions, staged rollouts, OTA for JS fixes, feature flags as the instant kill switch.
8. **Observability** — crash-free rate, ANRs, cold start, update adoption.
9. **Trade-offs** — say what you'd *not* build first and why.

Mentioning release strategy and observability unprompted is what makes you sound senior; most candidates stop at step 3.

---

## 5. Live coding on mobile

> **In short:** They usually ask for a small screen — narrate your choices and don't forget the mobile-specific details.

Likely tasks: a searchable/filterable list, a form with validation, a counter with persistence, a screen that fetches with loading/error states, or a swipe-to-delete row.

Say these out loud as you go — they're the marks:
- "I'll use `FlatList` rather than `map` so this virtualizes."
- "`keyExtractor` from the item id, not the index."
- "I'll memoize the row and the callback so rows don't re-render on every keystroke."
- "Wrapping in `SafeAreaView` so it isn't under the notch."
- "This input needs `keyboardType` and `autoCapitalize: none`."
- "I'd debounce the search before hitting the API."
- "Empty and error states — not just the happy path."
- "Minimum 44pt touch target."

---

## 6. Answering "what don't you know?"

> **In short:** Name a real gap, show what you'd do about it, and don't pick something central to the role.

Good: "I haven't written a Fabric native view component — I've used the Expo Modules API for a simple native module and I know the Codegen spec flow, but I'd expect to pair with someone the first time." Bad: "I'm a perfectionist", or silence.

---

## 7. Red flags to avoid

> **In short:** These phrases cost offers.

| Don't say | Say instead |
| --- | --- |
| "React Native is just a WebView" | "It renders real native views; Ionic uses a WebView" |
| "I've shipped apps to the stores" (if you haven't) | "I've distributed via TestFlight/internal; I know the submission flow" |
| "OTA updates let you ship anything" | "JS and assets only — native changes need a new binary and a matching runtime version" |
| "Performance is fine, it works on my iPhone" | "I test release builds on a low-end Android" |
| "I'd use Redux for everything" | "Server state in Query, client state in Zustand/Context" |
| Blaming a previous team for everything | Describe the problem and what *you* changed |

---

## 8. Questions that make you look senior

Ask two or three of these:

- Are you on the New Architecture, and if not, what's blocking it?
- How do you decide between an OTA update and a store release?
- What's your crash-free rate, and how do you track cold start?
- How do you test on real devices — a lab, a cloud service, or developer phones?
- Who owns the signing credentials, and is Play App Signing enabled?
- How much code is shared with the web app, and has that worked out?

---

## 9. The week before

- [ ] Re-read [../01-Fundamentals/00-how-react-native-works.md](../01-Fundamentals/00-how-react-native-works.md) and [../04-Build-Deploy/03-ota-updates.md](../04-Build-Deploy/03-ota-updates.md)
- [ ] Answer every question in [01-interview-questions.md](01-interview-questions.md) out loud
- [ ] Rehearse the two-minute project story until it's 120 seconds, not 300
- [ ] Have your four STAR stories with real numbers
- [ ] Be able to draw the thread model and the OTA flow on paper
- [ ] Open your own app on your phone before the call, so you can reference real screens
- [ ] Skim [02-cheat-sheet.md](02-cheat-sheet.md) the morning of
