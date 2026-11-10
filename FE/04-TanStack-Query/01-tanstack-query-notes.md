## 3. TanStack Query (v5)

The main idea: TanStack Query manages **server state** (async data you don't own: caching, deduping, background refetching). It is not a replacement for client state like a modal's open flag.

### Explained simply (read this first)

**Think of TanStack Query as a smart cache between your components and your API.** You ask for data by a name (the query key). If it's already in the cache, you get it instantly. If it's old ("stale"), you still get the cached copy right away while it quietly refetches in the background.

**The problem it solves.** Without it, every component that fetches needs this boilerplate, and it still has no caching:

```tsx
// Without TanStack Query
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);
useEffect(() => {
  let ignore = false;
  fetch('/api/todos').then(r => r.json())
    .then(d => { if (!ignore) setData(d); })
    .catch(e => { if (!ignore) setError(e); })
    .finally(() => { if (!ignore) setLoading(false); });
  return () => { ignore = true; };
}, []);

// With TanStack Query: same result + caching, dedupe, retries, refetch on focus
const { data, isPending, error } = useQuery({ queryKey: ['todos'], queryFn: fetchTodos });
```

**Setup (once, at the top of the app):**

```tsx
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },  // data is "fresh" for 30s
});

createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
```

**A typical fetch function:**

```ts
async function fetchTodos(): Promise<Todo[]> {
  const res = await fetch('/api/todos');
  if (!res.ok) throw new Error('Failed to fetch todos'); // important: fetch doesn't throw on 404/500
  return res.json();
}
```

**Reading data in a component:**

```tsx
function TodoList() {
  const { data: todos, isPending, isError, error, isFetching } = useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  });

  if (isPending) return <p>Loading...</p>;            // first load, nothing cached
  if (isError)   return <p>Error: {error.message}</p>;
  return (
    <>
      {isFetching && <small>Refreshing...</small>}     {/* background refetch */}
      <ul>{todos.map(t => <li key={t.id}>{t.title}</li>)}</ul>
    </>
  );
}
```

**Query keys work like dependency arrays.** Put every variable the fetch uses in the key. When the key changes, it fetches the new data, and each key is cached separately.

```tsx
function Todo({ id }: { id: number }) {
  const { data } = useQuery({
    queryKey: ['todos', id],                         // ['todos', 1], ['todos', 2] cached separately
    queryFn: () => fetch(`/api/todos/${id}`).then(r => r.json()),
    enabled: !!id,                                   // don't run until we have an id
  });
}
```

**staleTime vs gcTime, with an analogy.** Think of milk in the fridge:

- `staleTime` = the "best before" date. Before it, the data is fresh and is used without refetching. After it, the data is still shown, but React Query refetches it in the background.
- `gcTime` = how long the milk stays in the fridge after nobody is using it. After 5 minutes (default) with no component reading that key, it's thrown out of memory.

**Changing data: mutations + invalidation.** After you create, update or delete something, tell the cache "the todos list is out of date", and every component showing it refetches automatically.

```tsx
function AddTodo() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (title: string) =>
      fetch('/api/todos', { method: 'POST', body: JSON.stringify({ title }), headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });  // marks ['todos'] AND ['todos', id] stale
    },
  });

  return (
    <button onClick={() => mutation.mutate('New todo')} disabled={mutation.isPending}>
      {mutation.isPending ? 'Adding...' : 'Add'}
    </button>
  );
}
```

**Optimistic update = update the screen first, fix it if the server says no.**

```tsx
useMutation({
  mutationFn: toggleTodo,
  onMutate: async (id: number) => {
    await queryClient.cancelQueries({ queryKey: ['todos'] });          // 1. stop in-flight refetches
    const previous = queryClient.getQueryData<Todo[]>(['todos']);      // 2. save a backup
    queryClient.setQueryData<Todo[]>(['todos'], old =>                 // 3. update the cache now
      old?.map(t => t.id === id ? { ...t, done: !t.done } : t));
    return { previous };
  },
  onError: (_err, _id, context) => {
    queryClient.setQueryData(['todos'], context?.previous);           // 4. roll back on failure
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: ['todos'] }), // 5. resync with server
});
```

**Pagination without flashing a spinner on each page:**

```tsx
const [page, setPage] = useState(1);
const { data, isPlaceholderData } = useQuery({
  queryKey: ['todos', page],
  queryFn: () => fetchTodosPage(page),
  placeholderData: keepPreviousData,   // keep showing page 1 while page 2 loads
});
<button disabled={isPlaceholderData || !data?.hasMore} onClick={() => setPage(p => p + 1)}>Next</button>
```

**Infinite scroll:**

```tsx
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchFeed(pageParam),
  initialPageParam: 0,
  getNextPageParam: lastPage => lastPage.nextCursor ?? undefined, // undefined = no more pages
});
const allItems = data?.pages.flatMap(p => p.items) ?? [];
```

**Reusable, type-safe query definitions** (a pattern interviewers like):

```ts
export const todoQueries = {
  all:    () => queryOptions({ queryKey: ['todos'], queryFn: fetchTodos }),
  detail: (id: number) => queryOptions({ queryKey: ['todos', id], queryFn: () => fetchTodo(id) }),
};

useQuery(todoQueries.detail(5));
queryClient.prefetchQuery(todoQueries.detail(6));   // e.g. on hover, before the user clicks
```

### Core concepts

- **Query key:** an array that uniquely identifies the data, such as `['todos', { status, page }]`. When the key changes, the data is refetched. Everything the query function uses should be in the key.
- **`staleTime`** (default 0): how long data counts as fresh. Fresh data is served from cache with no refetch.
- **`gcTime`** (renamed from `cacheTime` in v5, default 5 min): how long an *unused* query stays in memory before it's garbage collected.
- **Automatic refetch** of stale queries on mount, on window focus and on reconnect. All configurable.
- **Statuses:** `status` is `pending | error | success` (v5 renamed `loading` to `pending`). `fetchStatus` is `fetching | paused | idle`. `isLoading` = pending and fetching for the first time.
- **Mutations:** `useMutation` + `queryClient.invalidateQueries({ queryKey: ['todos'] })` in `onSuccess`/`onSettled`.
- **Optimistic updates:** in `onMutate`, cancel queries, snapshot the old data, `setQueryData`; roll back in `onError`; invalidate in `onSettled`.
- Other features: `enabled` (dependent queries), `select` (transform or subscribe to a slice), `placeholderData: keepPreviousData` (pagination), `useInfiniteQuery`, `prefetchQuery`, `useSuspenseQuery`, `retry` (3 by default, with exponential backoff).

```tsx
const todosQuery = (status: string) => queryOptions({
  queryKey: ['todos', status],
  queryFn: ({ signal }) => fetch(`/api/todos?status=${status}`, { signal }).then(r => r.json()),
  staleTime: 60_000,
});

const { data, isPending, error } = useQuery(todosQuery('open'));

const qc = useQueryClient();
const addTodo = useMutation({
  mutationFn: createTodo,
  onSuccess: () => qc.invalidateQueries({ queryKey: ['todos'] }),
});
```

### Likely questions

- Why use TanStack Query instead of `useEffect` + `useState`? (It handles caching, deduping, race conditions, retries, background updates and loading/error state, and lets you delete a lot of Redux code.)
- `staleTime` vs `gcTime`?
- How do you implement optimistic updates?
- How do you handle pagination or infinite scroll?
- How do you share a query between components? (Use the same key: it's deduped and fetched once.)

**Model answers (say each in about 30–60 seconds):**

**Q1. Why use TanStack Query instead of `useEffect` + `useState`?**

> "Data from an API is *server state*: it lives on the server, it can change without us knowing, and it's shared across many components. `useEffect` + `useState` treats it like local state, so you end up hand-writing everything else yourself. TanStack Query gives you that out of the box: a cache keyed by query key, deduping (ten components asking for the same key make one request), race-condition handling, retries with backoff, background refetching on focus and reconnect, and consistent `isPending`/`error`/`data` flags. On my projects it also let us delete most of the Redux code that only existed to store API responses."

What the hand-written version usually gets wrong:

```tsx
// ❌ The useEffect version: no cache, no dedupe, no retry, and a race condition
useEffect(() => {
  setLoading(true);
  fetch(`/api/users/${id}`)
    .then(r => r.json())
    .then(data => setUser(data))        // if id changes fast, an OLD response can land last
    .catch(setError)
    .finally(() => setLoading(false));
}, [id]);

// ✅ TanStack Query: cached per id, deduped, retried, older requests cancelled or ignored
const { data: user, isPending, error } = useQuery({
  queryKey: ['user', id],
  queryFn: ({ signal }) => fetchUser(id, signal),
});
```

Closing line: *"useEffect is for syncing with external systems; TanStack Query is a purpose-built server-state cache."*

---

**Q2. `staleTime` vs `gcTime`?**

> "They control two different things. `staleTime` answers *'should I refetch?'*. While data is fresh, TanStack Query serves it from cache and doesn't refetch on mount or focus. The default is 0, so data is stale immediately. `gcTime` answers *'should I keep it in memory?'*. Once no component is using a query, it becomes inactive; after `gcTime` (default 5 minutes) it's deleted. Stale data is still shown instantly while a background refetch runs. That's stale-while-revalidate."

| | `staleTime` | `gcTime` (was `cacheTime` in v4) |
|---|---|---|
| Question it answers | "Is this data fresh enough to skip a refetch?" | "How long do I keep unused data in memory?" |
| Default | `0` (always stale) | 5 minutes |
| Clock starts | When the data was fetched | When the last observer unmounts |
| Effect when it expires | Next mount/focus/reconnect triggers a background refetch | Cache entry is removed; the next use shows a loading state |
| Typical setting | 30s–5min for data that rarely changes; `Infinity` for static data | Usually left at the default |

```ts
useQuery({ queryKey: ['countries'], queryFn: fetchCountries, staleTime: Infinity }); // never refetch
useQuery({ queryKey: ['feed'], queryFn: fetchFeed, staleTime: 30_000 });            // fresh for 30s
```

Common follow-up: *"Can `gcTime` be shorter than `staleTime`?"* Yes. The data is removed once it's unused, even if it was still "fresh".

---

**Q3. How do you implement optimistic updates?**

> "Update the cache before the server responds, so the UI feels instant, and roll back if the request fails. There are four steps: in `onMutate`, cancel in-flight queries for that key so they don't overwrite my change, snapshot the current data, and write the optimistic value with `setQueryData`. In `onError`, restore the snapshot. In `onSettled`, invalidate so we resync with the real server data either way."

```tsx
const qc = useQueryClient();

const toggleTodo = useMutation({
  mutationFn: (todo: Todo) => api.updateTodo({ ...todo, done: !todo.done }),

  onMutate: async (todo) => {
    await qc.cancelQueries({ queryKey: ['todos'] });            // 1. stop refetches overwriting us
    const previous = qc.getQueryData<Todo[]>(['todos']);        // 2. snapshot
    qc.setQueryData<Todo[]>(['todos'], (old = []) =>            // 3. optimistic write (immutably!)
      old.map(t => (t.id === todo.id ? { ...t, done: !t.done } : t)),
    );
    return { previous };                                        // becomes `context`
  },

  onError: (_err, _todo, context) => {
    qc.setQueryData(['todos'], context?.previous);              // 4a. roll back
    toast.error('Could not update todo');
  },

  onSettled: () => qc.invalidateQueries({ queryKey: ['todos'] }), // 4b. resync with server
});
```

Mention the simpler v5 option too: *"If only one component shows the pending item, I skip the cache and render `mutation.variables` while `mutation.isPending`. No rollback needed, because if it fails the item disappears."* (See `02-extra-patterns-and-questions.md`.) React 19's `useOptimistic` is another option for form actions.

---

**Q4. How do you handle pagination or infinite scroll?**

> "For classic page-number pagination I use `useQuery` with the page in the key and `placeholderData: keepPreviousData`, so the old page stays on screen while the next one loads instead of flashing a spinner. For infinite scroll I use `useInfiniteQuery`: I provide `initialPageParam` and a `getNextPageParam` that reads the cursor from the last page, and I call `fetchNextPage` when an IntersectionObserver sentinel at the bottom of the list becomes visible."

```tsx
// Pagination: page is part of the key, previous page shown while the next loads
const [page, setPage] = useState(1);
const { data, isPlaceholderData } = useQuery({
  queryKey: ['projects', page],
  queryFn: () => fetchProjects(page),
  placeholderData: keepPreviousData,
});
<button disabled={isPlaceholderData || !data?.hasMore} onClick={() => setPage(p => p + 1)}>Next</button>

// Infinite scroll: pages accumulate in data.pages
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchFeed({ cursor: pageParam }),
  initialPageParam: null as string | null,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined, // undefined → hasNextPage = false
});
const items = data?.pages.flatMap(p => p.items) ?? [];
```

Points that show experience:
- **Cursor vs offset:** cursors don't skip or duplicate rows when items are inserted while the user scrolls.
- **`maxPages`** (v5) caps how many pages stay in memory for very long feeds.
- **Prefetch the next page** with `qc.prefetchQuery(['projects', page + 1])` so "Next" is instant.
- **Very long lists** also need virtualization (TanStack Virtual), not just infinite loading.

---

**Q5. How do you share a query between components?**

> "Just call `useQuery` with the same query key in each component. They all subscribe to the same cache entry, so if they mount together there's only one network request (deduping), and when it resolves they all update. There's no need to lift state up or put it in Context or Redux. To avoid key typos and keep the options consistent, I define the query once with `queryOptions` or a custom hook and reuse it."

```tsx
// queries/user.ts: one definition, reused everywhere
export const userQuery = (id: string) =>
  queryOptions({ queryKey: ['user', id], queryFn: () => fetchUser(id), staleTime: 60_000 });

// Header.tsx
const { data: user } = useQuery(userQuery(id));
// ProfilePage.tsx: same key → same cache entry, no second request
const { data: user } = useQuery(userQuery(id));
// Avatar.tsx: subscribe to just one field; re-renders only when it changes
const { data: avatarUrl } = useQuery({ ...userQuery(id), select: u => u.avatarUrl });
```

Follow-up to expect: *"What if the two components use different options?"* The cached data is shared, but options like `select`, `enabled` and `staleTime` apply per observer. Each component checks staleness against its own `staleTime` when it mounts, so the component with the shortest `staleTime` can trigger refetches that every other component then sees. That's another reason to centralize options in `queryOptions`.

### Gotchas

- `fetch` doesn't reject on 4xx/5xx. Throw in `queryFn` when `!res.ok`, or the query reports success.
- With the default `staleTime` of 0, data refetches on every mount and window focus, which surprises people.
- Leaving variables out of the query key gives you stale or wrong cached data.
- Copying query data into `useState` creates two sources of truth.
- Create the `QueryClient` once (outside the component, or in `useState`), not on every render.
- In tests: a new `QueryClient` per test, with `retry: false`.

