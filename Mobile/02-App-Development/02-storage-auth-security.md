# 02 · Storage, auth and security

## 1. Choosing a storage option

> **In short:** AsyncStorage for simple key-value data, MMKV when you need speed or synchronous reads, SQLite for structured/offline data, SecureStore for anything sensitive.

| Option | Speed | Sync API | Encrypted | Use for |
| --- | --- | --- | --- | --- |
| **AsyncStorage** | OK | ❌ async | ❌ | Preferences, small cached JSON |
| **MMKV** (`react-native-mmkv`) | Very fast | ✅ | Optional | Hot paths, query persistence, settings |
| **expo-sqlite** | Fast | both | ❌ (SQLCipher possible) | Relational/offline data, large datasets |
| **expo-secure-store** | Slower | ❌ | ✅ Keychain / Keystore | Tokens, refresh tokens, PINs |
| **expo-file-system** | — | ❌ | ❌ | Images, documents, downloads |

⚠️ Nothing in AsyncStorage/MMKV is safe on a rooted or jailbroken device — it's plain files in the app sandbox.

```ts
// AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';
await AsyncStorage.setItem('theme', 'dark');
const theme = await AsyncStorage.getItem('theme');          // string | null
await AsyncStorage.multiSet([['a', '1'], ['b', '2']]);
await AsyncStorage.removeItem('theme');
```

```ts
// MMKV — synchronous, so no loading flash on startup
import { MMKV } from 'react-native-mmkv';
export const storage = new MMKV({ id: 'app', encryptionKey: undefined });

storage.set('theme', 'dark');
const theme = storage.getString('theme');                   // no await
storage.set('onboarded', true);
storage.delete('theme');
```

```ts
// SQLite
import * as SQLite from 'expo-sqlite';
const db = await SQLite.openDatabaseAsync('taskmate.db');
await db.execAsync(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, done INTEGER DEFAULT 0)`);
await db.runAsync('INSERT INTO tasks (id, title) VALUES (?, ?)', [id, title]);
const rows = await db.getAllAsync<Task>('SELECT * FROM tasks WHERE done = ?', [0]);
```

(**Drizzle ORM** has an `expo-sqlite` driver if you want typed queries and migrations.)

## 2. SecureStore

> **In short:** `expo-secure-store` keeps small values in the iOS Keychain and Android Keystore, encrypted by the OS and optionally behind biometrics.

```ts
import * as SecureStore from 'expo-secure-store';

await SecureStore.setItemAsync('refreshToken', token, {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,   // not restored to a new device
  requireAuthentication: false,                                      // true = Face ID/fingerprint to read
});

const token = await SecureStore.getItemAsync('refreshToken');
await SecureStore.deleteItemAsync('refreshToken');
```

Limits: ~2 KB per value, string values only, and it needs a development build (not available in Expo Go on all platforms).

## 3. Token strategy

> **In short:** Short-lived access token in memory, long-lived refresh token in SecureStore, refreshed transparently with a single in-flight request.

```ts
// lib/auth/tokens.ts
let accessToken: string | null = null;                       // memory only: gone when the app is killed
let refreshPromise: Promise<string | null> | null = null;

export async function getAccessToken() {
  if (accessToken && !isExpired(accessToken)) return accessToken;
  return refreshAccessToken();
}

export function refreshAccessToken(): Promise<string | null> {
  refreshPromise ??= (async () => {
    try {
      const refresh = await SecureStore.getItemAsync('refreshToken');
      if (!refresh) return null;
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) { await signOut(); return null; }
      const data = await res.json();
      accessToken = data.accessToken;
      await SecureStore.setItemAsync('refreshToken', data.refreshToken);   // rotation
      return accessToken;
    } finally {
      refreshPromise = null;                                  // allow the next refresh later
    }
  })();
  return refreshPromise;
}
```

The shared `refreshPromise` is important: without it, ten parallel 401s trigger ten refreshes and the server rotates the token out from under you.

**Why not cookies?** Mobile apps aren't browsers: there's no same-origin policy and no automatic cookie handling across app restarts, so bearer tokens in secure storage are the norm. (Cookies do work with `fetch` + a cookie manager, but tokens are simpler.)

## 4. Auth context

> **In short:** Hold session state in a context that bootstraps from SecureStore on launch, and gate navigation on it.

```tsx
// lib/auth/AuthContext.tsx
type AuthState = { user: User | null; isLoading: boolean };

const AuthContext = createContext<{
  user: User | null; isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
} | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, isLoading: true });

  useEffect(() => {
    (async () => {                                            // restore the session at launch
      const token = await refreshAccessToken();
      setState({ user: token ? await api.getMe() : null, isLoading: false });
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { accessToken, refreshToken, user } = await api.login(email, password);
    setAccessToken(accessToken);
    await SecureStore.setItemAsync('refreshToken', refreshToken);
    setState({ user, isLoading: false });
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    await SecureStore.deleteItemAsync('refreshToken');
    setAccessToken(null);
    queryClient.clear();                                      // ⚠️ don't leak the previous user's cache
    setState({ user: null, isLoading: false });
  }, []);

  return <AuthContext value={{ ...state, signIn, signOut }}>{children}</AuthContext>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
```

Then guard routes as shown in [../01-Fundamentals/04-navigation-expo-router.md](../01-Fundamentals/04-navigation-expo-router.md#6-auth-flows).

## 5. OAuth and social login

> **In short:** Use `expo-auth-session` with PKCE and the system browser — never an embedded WebView, which the providers reject and which can't share sessions.

```ts
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const redirectUri = AuthSession.makeRedirectUri({ scheme: 'taskmate', path: 'auth/callback' });

const [request, response, promptAsync] = AuthSession.useAuthRequest(
  {
    clientId: process.env.EXPO_PUBLIC_OAUTH_CLIENT_ID!,
    scopes: ['openid', 'profile', 'email'],
    redirectUri,
    usePKCE: true,                                            // required for public clients
  },
  { authorizationEndpoint: 'https://auth.example.com/authorize', tokenEndpoint: 'https://auth.example.com/token' },
);

// On success exchange the code — ideally on YOUR backend, which holds the client secret
```

Mobile-specific ones: **Sign in with Apple** (`expo-apple-authentication`, **required** on iOS if you offer other social logins), Google (`@react-native-google-signin/google-signin`), and hosted options (Clerk, Auth0, Supabase, Firebase Auth).

## 6. Biometrics

> **In short:** Use biometrics to unlock a locally-stored token, not as authentication by itself — the server must still verify a real credential.

```ts
import * as LocalAuthentication from 'expo-local-authentication';

const hasHardware = await LocalAuthentication.hasHardwareAsync();
const isEnrolled = await LocalAuthentication.isEnrolledAsync();

if (hasHardware && isEnrolled) {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock TaskMate',
    fallbackLabel: 'Use passcode',
    disableDeviceFallback: false,
  });
  if (result.success) await unlockWithStoredToken();
}
```

Always offer a non-biometric path (passcode/password) — biometrics fail, change, and some users disable them.

## 7. Mobile security checklist

> **In short:** Assume the device is hostile: the binary is readable, traffic can be intercepted, and storage can be dumped on a rooted device.

| Risk | Mitigation |
| --- | --- |
| Secrets in the bundle | There are none — keep them server-side; `EXPO_PUBLIC_*` is public |
| Tokens stolen from storage | SecureStore (Keychain/Keystore), short-lived access tokens, rotation, revocation on logout |
| Traffic interception | HTTPS everywhere; consider certificate pinning for high-value apps |
| Reverse engineering | Obfuscation raises the bar slightly; never rely on client-side secrets or checks |
| Rooted/jailbroken devices | Detect and degrade if the data warrants it (banking); don't block everyone |
| Deep link injection | Validate and sanitise all deep-link params before acting on them |
| Clipboard/screenshot leaks | `FLAG_SECURE` on Android, blur on app switcher for sensitive screens |
| PII in logs/crash reports | Scrub before sending; disclose data collection in store listings |
| Over-broad permissions | Request only what you use, when you use it |
| Outdated dependencies | `npm audit`, Expo SDK upgrades, watch RN security advisories |

**The rule:** every authorisation decision happens on the server. Client checks are UX.

## 8. Logout and account deletion

> **In short:** Clear tokens, caches and any cached files — and provide in-app account deletion, which both stores require.

```ts
async function signOut() {
  await api.logout().catch(() => {});          // revoke server-side (refresh token)
  await SecureStore.deleteItemAsync('refreshToken');
  setAccessToken(null);
  queryClient.clear();
  storage.clearAll();                           // MMKV
  await AsyncStorage.clear();
  await FileSystem.deleteAsync(cacheDir, { idempotent: true });
  router.replace('/login');
}
```

---

## 9. Exercises

1. Store a theme preference in MMKV and read it synchronously at startup (no flash).
2. Implement the token module with SecureStore and a shared refresh promise; test 10 parallel 401s.
3. Build `AuthProvider` with session restore on launch and route guards.
4. Add biometric unlock that gates reading the stored refresh token.
5. Add Sign in with Apple on iOS.
6. Implement full logout that clears tokens, the query cache and cached files; verify nothing of the old user remains.
