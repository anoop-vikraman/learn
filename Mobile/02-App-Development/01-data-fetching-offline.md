# 01 · Data fetching and offline

## 1. Why a data library on mobile

> **In short:** Networks are slow and unreliable and apps get backgrounded constantly, so caching, retries and background refetching matter far more than on the web — TanStack Query gives you all of it.

Hand-rolled `useEffect` + `fetch` on mobile means re-implementing: caching between screens, refetch on focus/reconnect, retries with backoff, pagination, request deduplication and offline behaviour.

```bash
npx expo install @tanstack/react-query @react-native-community/netinfo
```

## 2. Setup with mobile-specific wiring

> **In short:** Add app-state focus handling and online detection so Query knows when the app is visible and connected.

```tsx
// app/_layout.tsx
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';

// Tell Query when the device is online
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected && state.isInternetReachable !== false)),
);

export default function RootLayout() {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,          // don't refetch on every screen focus
        gcTime: 24 * 60 * 60 * 1000,
        retry: 2,
        refetchOnReconnect: true,
      },
    },
  }));

  // Treat "app returned to foreground" as a window focus event
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) =>
      focusManager.setFocused(status === 'active'));
    return () => sub.remove();
  }, []);

  return <QueryClientProvider client={client}>{/* … */}</QueryClientProvider>;
}
```

## 3. Queries and mutations

> **In short:** `useQuery` reads, `useMutation` writes, and invalidation after a write keeps the cache honest.

```tsx
export function useTasks(filter: 'all' | 'open') {
  return useQuery({
    queryKey: ['tasks', filter],
    queryFn: ({ signal }) => api.getTasks(filter, { signal }),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTask) => api.createTask(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
```

```tsx
function TaskList() {
  const { data, isPending, isError, error, refetch, isRefetching } = useTasks('open');

  if (isPending) return <ListSkeleton />;
  if (isError) return <ErrorState message={error.message} onRetry={refetch} />;

  return (
    <FlatList
      data={data}
      keyExtractor={(t) => t.id}
      renderItem={({ item }) => <TaskRow task={item} />}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      ListEmptyComponent={<EmptyState />}
    />
  );
}
```

Full Query reference: [../../FE/04-TanStack-Query/](../../FE/04-TanStack-Query/).

## 4. Optimistic updates

> **In short:** Update the cache immediately, roll back on failure — essential on mobile where a round trip can take seconds.

```tsx
const qc = useQueryClient();

useMutation({
  mutationFn: ({ id, done }: { id: string; done: boolean }) => api.toggleTask(id, done),
  onMutate: async ({ id, done }) => {
    await qc.cancelQueries({ queryKey: ['tasks'] });
    const previous = qc.getQueryData<Task[]>(['tasks', 'open']);
    qc.setQueryData<Task[]>(['tasks', 'open'], (old) =>
      old?.map((t) => (t.id === id ? { ...t, done } : t)) ?? []);
    return { previous };
  },
  onError: (_err, _vars, ctx) => {
    qc.setQueryData(['tasks', 'open'], ctx?.previous);     // rollback
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
  onSettled: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
});
```

## 5. Persisting the cache

> **In short:** Persist the query cache to storage so the app opens with data instead of spinners, even offline.

```bash
npx expo install @tanstack/react-query-persist-client @tanstack/query-async-storage-persister react-native-mmkv
```

```tsx
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

const persister = createAsyncStoragePersister({ storage: AsyncStorage });

<PersistQueryClientProvider
  client={queryClient}
  persistOptions={{
    persister,
    maxAge: 24 * 60 * 60 * 1000,
    buster: appVersion,                       // invalidate the cache when the app updates
    dehydrateOptions: {
      shouldDehydrateQuery: (q) => q.state.status === 'success' && !q.queryKey.includes('private'),
    },
  }}
>
  {children}
</PersistQueryClientProvider>
```

⚠️ Don't persist sensitive data in plain storage — exclude it, or use an encrypted persister.

## 6. Offline mutations

> **In short:** Queue writes made while offline and replay them on reconnect, with idempotency so retries don't duplicate data.

```tsx
// Give every mutation type a default so it can be resumed after a restart
queryClient.setMutationDefaults(['createTask'], {
  mutationFn: (input: CreateTask) => api.createTask(input),
  retry: 3,
});

const mutation = useMutation({ mutationKey: ['createTask'] });

// On app start, after the cache is restored:
queryClient.resumePausedMutations();
```

Rules for a sane offline experience:
- Generate a **client-side id** (`crypto.randomUUID()`) and send it as an **idempotency key**, so a replayed request can't create duplicates.
- Show queued items with a "pending sync" indicator.
- Decide a **conflict policy** up front: last-write-wins (simple), server-wins, or merge. Record `updatedAt` so you can detect conflicts.
- Cap the queue and surface permanent failures to the user instead of retrying forever.

For heavy offline-first apps, consider a sync engine: **WatermelonDB**, **PowerSync**, **Legend-State**, **RxDB** or **Replicache**.

## 7. Network state

> **In short:** Detect connectivity and tell the user — silent failures are the worst mobile experience.

```tsx
import NetInfo from '@react-native-community/netinfo';

export function useIsOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false)), []);
  return online;
}

// A persistent banner beats a toast that disappears
{!online && <Banner tone="warning">You're offline — changes will sync when you reconnect</Banner>}
```

⚠️ `isConnected` means "attached to a network", not "the internet works" — captive portals and dead Wi-Fi are common. `isInternetReachable` is the better signal.

## 8. The API client

> **In short:** Centralise base URL, auth headers, timeouts, error shape and refresh logic in one module.

```ts
// lib/api.ts
const BASE = process.env.EXPO_PUBLIC_API_URL!;

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export async function apiFetch<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth = true, ...rest } = init;
  const token = auth ? await getAccessToken() : null;

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    signal: rest.signal ?? AbortSignal.timeout(15_000),      // always time out
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...rest.headers,
    },
  });

  if (res.status === 401) { await refreshOrLogout(); throw new ApiError(401, 'Session expired'); }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error?.message ?? `HTTP ${res.status}`, body?.error?.code);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
```

Mobile-specific details: generous timeouts (mobile networks are slow), retry on network errors but not 4xx, and never log tokens.

## 9. Error and loading UX

> **In short:** Skeletons beat spinners, errors need a retry affordance, and empty states should explain what to do next.

| State | Pattern |
| --- | --- |
| First load | Skeleton matching the final layout |
| Refreshing | `RefreshControl` or a subtle top bar; keep showing old data |
| Error | Message + Retry button; keep stale data visible if you have it |
| Empty | Illustration + one-line explanation + primary action |
| Offline | Persistent banner, queued-change indicators |
| Slow (> 10 s) | "Still working…" message so it doesn't feel frozen |

## 10. Other options

> **In short:** TanStack Query is the default; SWR, RTK Query, Apollo (GraphQL) and plain fetch all appear in real codebases.

| Tool | Fits |
| --- | --- |
| **TanStack Query** | Most REST apps; best offline/persistence story |
| **RTK Query** | Teams already using Redux Toolkit |
| **Apollo Client / urql** | GraphQL backends (normalized cache) |
| **tRPC** | TypeScript monorepo with end-to-end types |
| **Plain fetch + context** | Tiny apps only |

---

## 11. Exercises

1. Wire up TanStack Query with AppState focus and NetInfo online detection.
2. Convert the task list to `useQuery` with skeleton, error-retry and empty states.
3. Add optimistic toggling with rollback; test it with the server returning 500.
4. Persist the cache and confirm the app shows tasks instantly in airplane mode.
5. Queue a task created offline, reconnect, and verify it syncs exactly once (idempotency key).
6. Add an offline banner and a per-item "pending sync" indicator.
