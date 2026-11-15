# 05 · Forms, input and the keyboard

Forms on mobile are harder than on the web: the keyboard covers content, there's no tab key, and typing is expensive — so this is worth getting right.

## 1. TextInput

> **In short:** `TextInput` is controlled with `value` + `onChangeText`, and its many props control the keyboard, autofill and return key.

```tsx
import { TextInput } from 'react-native';

<TextInput
  value={email}
  onChangeText={setEmail}                 // gives the string directly (no event.target.value)
  placeholder="you@example.com"
  keyboardType="email-address"
  autoCapitalize="none"
  autoCorrect={false}
  autoComplete="email"                    // enables OS autofill
  textContentType="emailAddress"          // iOS autofill hint
  returnKeyType="next"
  onSubmitEditing={() => passwordRef.current?.focus()}
  blurOnSubmit={false}
  style={styles.input}
/>

<TextInput
  ref={passwordRef}
  value={password}
  onChangeText={setPassword}
  secureTextEntry
  textContentType="password"
  returnKeyType="done"
  onSubmitEditing={submit}
/>
```

| Prop | Use |
| --- | --- |
| `keyboardType` | `default`, `email-address`, `numeric`, `phone-pad`, `decimal-pad`, `url` |
| `autoCapitalize` | `none` for emails, usernames, passwords |
| `textContentType` / `autoComplete` | OS autofill and SMS one-time-code support (`oneTimeCode`) |
| `returnKeyType` | `next`, `done`, `search`, `send` |
| `multiline` + `numberOfLines` | Textareas (set `textAlignVertical: 'top'` on Android) |
| `maxLength` | Hard input limits |
| `editable={false}` | Read-only |
| `onFocus` / `onBlur` | Validation timing, styling |

⚠️ `keyboardType="numeric"` still gives you a **string** — convert it yourself, and remember iOS numeric keypads have no "done" key unless you add an accessory or a `keyboardType="number-pad"` with a dismiss button.

## 2. Keyboard avoidance

> **In short:** Wrap scrollable forms so the keyboard doesn't cover the focused field — `KeyboardAvoidingView` works but behaves differently per platform.

```tsx
import { KeyboardAvoidingView, Platform, ScrollView, Keyboard, TouchableWithoutFeedback } from 'react-native';

<KeyboardAvoidingView
  style={{ flex: 1 }}
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={headerHeight}        // account for the navigation header
>
  <ScrollView
    contentContainerStyle={{ padding: 16, gap: 12 }}
    keyboardShouldPersistTaps="handled"        // buttons work on the first tap while the keyboard is open
    keyboardDismissMode="on-drag"
  >
    {/* fields */}
  </ScrollView>
</KeyboardAvoidingView>
```

In practice many teams use **`react-native-keyboard-controller`** (or `KeyboardAwareScrollView`) because it behaves consistently on both platforms and animates with the keyboard.

Android also needs the right `softwareKeyboardLayoutMode` / `windowSoftInputMode`; Expo's default usually works, but check with edge-to-edge enabled.

```tsx
// Dismiss on tap outside
<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
  <View style={{ flex: 1 }}>{children}</View>
</TouchableWithoutFeedback>
```

## 3. A simple controlled form

> **In short:** For two or three fields, `useState` plus a validation function is enough.

```tsx
export default function LoginScreen() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    const next: typeof errors = {};
    if (!form.email.includes('@')) next.email = 'Enter a valid email';
    if (form.password.length < 8) next.password = 'At least 8 characters';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try { await login(form); } catch { setErrors({ password: 'Invalid email or password' }); }
    finally { setSubmitting(false); }
  }

  return (
    <View style={{ gap: 12, padding: 16 }}>
      <Field label="Email" value={form.email} onChangeText={set('email')} error={errors.email}
             keyboardType="email-address" autoCapitalize="none" />
      <Field label="Password" value={form.password} onChangeText={set('password')} error={errors.password} secureTextEntry />
      <Pressable onPress={submit} disabled={submitting} style={styles.button}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
    </View>
  );
}
```

## 4. React Hook Form + Zod

> **In short:** For anything bigger, React Hook Form keeps re-renders low and Zod gives you one schema shared with your backend types.

```bash
npx expo install react-hook-form @hookform/resolvers zod
```

```tsx
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  priority: z.coerce.number().int().min(1).max(5),
  notes: z.string().max(2000).optional(),
});
type FormValues = z.infer<typeof schema>;

export function TaskForm({ onSubmit }: { onSubmit: (v: FormValues) => Promise<void> }) {
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', priority: 3 },
    mode: 'onBlur',
  });

  return (
    <View style={{ gap: 12 }}>
      <Controller
        control={control}
        name="title"
        render={({ field: { value, onChange, onBlur } }) => (
          <>
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder="Title"
              style={[styles.input, errors.title && styles.inputError]}
              accessibilityLabel="Task title"
            />
            {errors.title && <Text style={styles.error}>{errors.title.message}</Text>}
          </>
        )}
      />
      <Pressable onPress={handleSubmit(onSubmit)} disabled={isSubmitting} style={styles.button}>
        <Text style={styles.buttonText}>{isSubmitting ? 'Saving…' : 'Save'}</Text>
      </Pressable>
    </View>
  );
}
```

`Controller` is needed because RN inputs aren't DOM inputs — RHF can't register them by ref the way it does on the web.

## 5. Other input components

> **In short:** Use platform pickers and native components rather than rebuilding them.

| Need | Component |
| --- | --- |
| Date/time | `@react-native-community/datetimepicker` (native pickers) |
| Select / dropdown | `@react-native-picker/picker`, or a bottom sheet with a list |
| Switch | `Switch` (core) |
| Slider | `@react-native-community/slider` |
| Checkbox | `expo-checkbox` |
| Segmented control | `@react-native-segmented-control/segmented-control` (iOS look) |
| Bottom sheet | `@gorhom/bottom-sheet` |
| Search | `TextInput` + debounce, or the native header search option |

```tsx
// Debounced search
const [query, setQuery] = useState('');
const deferred = useDeferredValue(query);          // or a useDebounce hook
const { data } = useQuery({ queryKey: ['search', deferred], queryFn: () => search(deferred), enabled: deferred.length > 1 });
```

## 6. Form UX on mobile

> **In short:** Small screens punish bad forms — minimise fields, validate kindly, and keep the submit button reachable.

- Show errors **after blur or submit**, not on every keystroke.
- Keep the primary action visible above the keyboard (sticky footer).
- Use the right keyboard type and autofill hints — it saves real typing.
- Chain fields with `returnKeyType="next"` + `onSubmitEditing` focus.
- Disable the submit button while submitting and show a spinner.
- Warn before discarding a dirty form (`gestureEnabled: false` + a confirm dialog).
- Give haptic feedback on success/failure (`expo-haptics`).
- Save drafts for long forms (AsyncStorage/MMKV) — apps get backgrounded and killed.

## 7. Accessibility

> **In short:** Label every input, group errors with the field, and keep targets large.

```tsx
<TextInput
  accessibilityLabel="Email address"
  accessibilityHint="Used to sign you in"
  accessible
  style={{ minHeight: 48 }}
/>
{error && <Text accessibilityRole="alert">{error}</Text>}
```

Test with VoiceOver (iOS) and TalkBack (Android) — screen readers are also how accessibility audits are done in app review.

---

## 8. Exercises

1. Build a login form with email/password, proper keyboard types, and next/done field chaining.
2. Add `KeyboardAvoidingView` and confirm the submit button stays visible on a small device.
3. Rebuild the add-task form with React Hook Form + Zod and inline errors shown on blur.
4. Add a date picker for a due date that uses the native picker on both platforms.
5. Add a debounced search input over the task list.
6. Save a half-filled form to storage and restore it after killing the app.
