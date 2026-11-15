# 04 · Architecture, accessibility and i18n

## 1. Project structure at scale

> **In short:** Keep routes thin and group everything else by feature, so a screen is a composition of feature modules rather than a 600-line file.

```
app/                          # Expo Router: routes only, thin
  _layout.tsx
  (app)/(tabs)/tasks.tsx      # imports a feature screen, nothing more
src/
  features/
    tasks/
      components/TaskRow.tsx
      screens/TaskListScreen.tsx
      hooks/useTasks.ts
      api/tasks.api.ts
      schemas/task.schema.ts
      types.ts
    auth/
    settings/
  components/ui/              # design system: Button, Card, Input, Text
  lib/                        # api client, storage, analytics, notifications
  hooks/                      # shared hooks
  theme/                      # colors, spacing, typography
  utils/
```

```tsx
// app/(app)/(tabs)/tasks.tsx
export { TaskListScreen as default } from '@/features/tasks/screens/TaskListScreen';
```

Rules that keep this healthy: features don't import each other's internals (go through a feature's `index.ts`), shared UI has no business logic, and `lib/` has no feature knowledge.

## 2. State management

> **In short:** Server state in TanStack Query, small global client state in Zustand or Context, everything else local — the same split as the web.

| State | Where |
| --- | --- |
| Server data (tasks, profile) | TanStack Query |
| Session/auth | Context (+ SecureStore) |
| UI preferences (theme, filters) | Zustand (+ MMKV persistence) |
| Form state | React Hook Form |
| Screen-local | `useState` |
| Navigation state | The router |

Mobile-specific notes: the app can be killed at any time, so **persist anything the user would hate to lose**; and avoid one giant store that re-renders every screen on each change.

## 3. Design system

> **In short:** Wrap primitives once so spacing, colours, typography and accessibility defaults are consistent and themeable.

```tsx
// src/components/ui/Button.tsx
type Props = { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean; disabled?: boolean };

export function Button({ title, onPress, variant = 'primary', loading, disabled }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: colors[variant], opacity: pressed || disabled ? 0.7 : 1, minHeight: 48 },
      ]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.label}>{title}</Text>}
    </Pressable>
  );
}
```

Options: hand-rolled (most control), **Tamagui** (performance-focused, themes), **Gluestack**, **React Native Paper** (Material), **NativeWind** (Tailwind classes).

## 4. Error boundaries and crash resilience

> **In short:** Catch render errors per screen so one broken component doesn't white-screen the app, and report everything to crash reporting.

```tsx
// src/components/ErrorBoundary.tsx
import { Component, type ReactNode } from 'react';
import * as Sentry from '@sentry/react-native';

export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { Sentry.captureException(error, { extra: { info } }); }
  render() {
    if (this.state.hasError) return this.props.fallback ?? <ErrorScreen onRetry={() => this.setState({ hasError: false })} />;
    return this.props.children;
  }
}
```

Expo Router supports `ErrorBoundary` exports per route; wrap risky screens individually. Also handle unhandled promise rejections and set a global JS exception handler so users see something better than a frozen screen.

## 5. Feature flags and remote config

> **In short:** Ship code dark and enable it remotely — essential on mobile where you can't roll back a binary quickly.

```ts
const flags = useFlags();
{flags.newTaskEditor ? <TaskEditorV2 /> : <TaskEditorV1 />}
```

Options: your own `/config` endpoint cached locally, Firebase Remote Config, Statsig, LaunchDarkly, or PostHog. Combine with **OTA updates** (next folder) for fast fixes, and always have a kill switch for risky features.

## 6. Monorepos

> **In short:** Sharing code between web and mobile works well for types, API clients and business logic — less well for UI.

```
apps/
  mobile/        # Expo
  web/           # Next.js
packages/
  api-client/    # fetch wrappers, generated types
  validation/    # Zod schemas shared by both
  core/          # domain logic
```

Use pnpm/npm workspaces (or Turborepo/Nx). Expo supports monorepos, but watch Metro's `watchFolders` and `nodeModulesPaths` configuration. Share **logic and types**, not components — RN and DOM primitives differ. (React Native Web can share components if you commit to it.)

## 7. Accessibility

> **In short:** Screen reader support, large touch targets and respecting system text size are both the right thing and a store-review consideration.

```tsx
<Pressable accessibilityRole="button" accessibilityLabel="Mark 'Buy milk' as done"
           accessibilityState={{ checked: task.done }} accessibilityHint="Double tap to toggle">
  <Text>{task.title}</Text>
</Pressable>

<View accessible accessibilityRole="header"><Text>Today</Text></View>

<Image source={...} accessibilityLabel="Attached photo of the receipt" />
<Image source={decorative} accessibilityElementsHidden importantForAccessibility="no" />
```

| Requirement | How |
| --- | --- |
| Labels on every interactive element | `accessibilityLabel` |
| Roles | `accessibilityRole="button" \| "header" \| "link" \| "image" \| "alert"` |
| State | `accessibilityState={{ selected, checked, disabled, busy }}` |
| Touch targets ≥ 44×44 pt | Padding or `hitSlop` |
| Dynamic type | Don't disable `allowFontScaling`; test at 200% |
| Contrast | 4.5:1 for body text |
| Motion | `useReducedMotion()` |
| Announcements | `AccessibilityInfo.announceForAccessibility('Task saved')` |
| Grouping | `accessible` on a container with a combined label |

Test with **VoiceOver** (iOS: triple-click side button) and **TalkBack** (Android). Navigate a full flow using only the screen reader once per release.

## 8. Internationalisation

> **In short:** Externalise strings early, use `Intl` for dates/numbers/currency, and plan for RTL if you target Arabic or Hebrew.

```bash
npx expo install expo-localization i18next react-i18next
```

```ts
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ml: { translation: ml } },
  lng: Localization.getLocales()[0]?.languageCode ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
```

```tsx
const { t } = useTranslation();
<Text>{t('tasks.count', { count: tasks.length })}</Text>     // handles pluralisation
<Text>{new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR' }).format(total)}</Text>
```

RTL: `I18nManager.forceRTL`, use `start`/`end` instead of `left`/`right` in styles, and test with the layout flipped. Retrofitting i18n is far more expensive than starting with it.

## 9. Code quality

> **In short:** TypeScript strict, ESLint with the RN plugin, Prettier, and CI gates — same discipline as any other codebase.

```bash
npx expo lint
```

Useful rules: `react-hooks/exhaustive-deps`, `react-native/no-inline-styles`, `react-native/no-unused-styles`, import ordering, and a boundary rule preventing cross-feature imports.

---

## 10. Exercises

1. Restructure TaskMate into `app/` routes + `src/features/*` and make routes one-line re-exports.
2. Build three design-system components (Button, Card, Input) with theme support and accessibility defaults.
3. Add an error boundary per screen and verify a thrown error shows a recovery UI.
4. Add a simple remote feature flag that hides a feature without a new build.
5. Make one full flow usable with VoiceOver/TalkBack only.
6. Externalise all strings to i18next and add a second language.
