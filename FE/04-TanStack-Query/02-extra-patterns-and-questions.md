# TanStack Query extra: advanced patterns and Q&A

## Query key factory (the scalable pattern)

```ts
export const todoKeys = {
  all: ['todos'] as const,
  lists: () => [...todoKeys.all, 'list'] as const,
  list: (filters: { status?: string; page?: number }) => [...todoKeys.lists(), filters] as const,
  details: () => [...todoKeys.all, 'detail'] as const,
  detail: (id: number) => [...todoKeys.details(), id] as const,
};

// Invalidate hierarchically:
queryClient.invalidateQueries({ queryKey: todoKeys.all });     // everything todo-related
queryClient.invalidateQueries({ queryKey: todoKeys.lists() }); // only lists, not details
```

## `queryOptions`: one definition, reused everywhere (v5)

```ts
import { queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query';

export const todoQuery = (id: number) =>
  queryOptions({
    queryKey: todoKeys.detail(id),
    queryFn: ({ signal }) => api.getTodo(id, signal),
    staleTime: 60_000,
  });

useQuery(todoQuery(5));
useSuspenseQuery(todoQuery(5));
queryClient.prefetchQuery(todoQuery(5));
queryClient.getQueryData(todoQuery(5).queryKey); // typed!
```

## Dependent (serial) queries with `enabled`

```ts
const { data: user } = useQuery({ queryKey: ['user', email], queryFn: () => getUser(email) });

const { data: projects } = useQuery({
  queryKey: ['projects', user?.id],
  queryFn: () => getProjects(user!.id),
  enabled: !!user?.id,     // waits until user is loaded
});
```

Or with `skipToken` (type-safe, v5):

```ts
useQuery({
  queryKey: ['projects', userId],
  queryFn: userId ? () => getProjects(userId) : skipToken,
});
```

## Parallel and dynamic queries with `useQueries`

```ts
const results = useQueries({
  queries: userIds.map((id) => ({ queryKey: ['user', id], queryFn: () => getUser(id) })),
  combine: (results) => ({
    data: results.map((r) => r.data),
    pending: results.some((r) => r.isPending),
  }),
});
```

## Transform data with `select` (component re-renders only if the selected value changes)

```ts
const { data: todoCount } = useQuery({
  queryKey: ['todos'],
  queryFn: fetchTodos,
  select: (todos) => todos.length,
});

// Stable selector to avoid re-running on every render:
const selectDone = (todos: Todo[]) => todos.filter((t) => t.done);
useQuery({ queryKey: ['todos'], queryFn: fetchTodos, select: selectDone });
```

## Cancellation (`signal` is passed automatically)

```ts
useQuery({
  queryKey: ['search', term],
  queryFn: async ({ signal }) => {
    const res = await fetch(`/api/search?q=${term}`, { signal });
    if (!res.ok) throw new Error('Search failed');
    return res.json();
  },
});
// When `term` changes or the component unmounts, the previous request is aborted.
```

## Prefetching (hover, route loaders)

```tsx
function TodoLink({ id }: { id: number }) {
  const queryClient = useQueryClient();
  return (
    <Link
      to={`/todos/${id}`}
      onMouseEnter={() => queryClient.prefetchQuery(todoQuery(id))}
    >
      Todo {id}
    </Link>
  );
}

// React Router loader
export const loader = (qc: QueryClient) => ({ params }) => qc.ensureQueryData(todoQuery(+params.id));
```

## Seed the detail cache from the list (`initialData`)

```ts
useQuery({
  queryKey: ['todo', id],
  queryFn: () => getTodo(id),
  initialData: () => queryClient.getQueryData<Todo[]>(['todos'])?.find((t) => t.id === id),
  initialDataUpdatedAt: () => queryClient.getQueryState(['todos'])?.dataUpdatedAt,
});
```

`initialData` vs `placeholderData`: `initialData` **is put in the cache** (treated as real data). `placeholderData` is **shown only**, never cached (`keepPreviousData` is a placeholder helper).

## Update cache directly after a mutation (instead of refetching)

```ts
const updateTodo = useMutation({
  mutationFn: api.updateTodo,
  onSuccess: (updated) => {
    queryClient.setQueryData(todoKeys.detail(updated.id), updated);
    queryClient.setQueryData<Todo[]>(todoKeys.lists(), (old) =>
      old?.map((t) => (t.id === updated.id ? updated : t)),
    );
  },
});
```

## Optimistic update: the "via the UI" approach (v5, simpler)

```tsx
const addTodo = useMutation({
  mutationFn: api.addTodo,
  onSettled: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
});

return (
  <ul>
    {todos.map((t) => <li key={t.id}>{t.text}</li>)}
    {addTodo.isPending && <li style={{ opacity: 0.5 }}>{addTodo.variables.text}</li>}
    {addTodo.isError && <li style={{ color: 'red' }}>Failed. <button onClick={() => addTodo.mutate(addTodo.variables)}>Retry</button></li>}
  </ul>
);
```

## Mutation lifecycle order

`onMutate` → (request) → `onSuccess` / `onError` → `onSettled`. Callbacks defined on `useMutation` run first, then those passed to `mutate(vars, { onSuccess })`. The `mutate` callbacks **don't run if the component unmounted**. Use `mutateAsync` if you need a promise (wrap it in try/catch).

## Global error handling

```ts
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.state.data !== undefined) toast.error(`Background refresh failed: ${error.message}`);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error: any) => error?.status !== 404 && failureCount < 3,
    },
  },
});
```

## Suspense + Error Boundary integration

```tsx
import { QueryErrorResetBoundary, useSuspenseQuery } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';

function TodoDetails({ id }: { id: number }) {
  const { data } = useSuspenseQuery(todoQuery(id)); // data is never undefined
  return <h2>{data.title}</h2>;
}

<QueryErrorResetBoundary>
  {({ reset }) => (
    <ErrorBoundary onReset={reset} fallbackRender={({ resetErrorBoundary }) => (
      <button onClick={resetErrorBoundary}>Try again</button>
    )}>
      <Suspense fallback={<Spinner />}>
        <TodoDetails id={1} />
      </Suspense>
    </ErrorBoundary>
  )}
</QueryErrorResetBoundary>;
```

## Polling and refetch controls

```ts
useQuery({
  queryKey: ['job', jobId],
  queryFn: () => getJob(jobId),
  refetchInterval: (query) => (query.state.data?.status === 'done' ? false : 2000), // stop when done
  refetchOnWindowFocus: false,
});
```

## SSR / Next.js hydration (concept)

Prefetch on the server into a QueryClient, `dehydrate(queryClient)`, and pass the result to `<HydrationBoundary state={...}>`. The client cache starts filled, so no loading spinner and no double fetch. Set `staleTime > 0` so the client doesn't immediately refetch.

## Status flags in v5: know the difference

| Flag | Meaning |
| --- | --- |
| `isPending` | No data yet (`status === 'pending'`) |
| `isLoading` | `isPending && isFetching`: first load in progress |
| `isFetching` | Any fetch in flight, including background refetch |
| `isError` / `error` | Last fetch failed |
| `isSuccess` | Has data |
| `isPlaceholderData` | Showing placeholder (e.g. previous page) |
| `isRefetching` | `isFetching && !isPending` |
| `fetchStatus` | `'fetching' \| 'paused' \| 'idle'` (paused = offline) |

v4 → v5 renames: `cacheTime` → `gcTime`, `isLoading` (v4) → `isPending`, `keepPreviousData: true` → `placeholderData: keepPreviousData`, the object syntax is the only signature, and `onSuccess`/`onError` were **removed from useQuery** (use effects or the global QueryCache callbacks).

---

## Extra interview questions

**Q: Server state vs client state?**
Server state is owned remotely, shared, asynchronous, and can go stale without you knowing. Client state is owned by the browser and synchronous (modal open, theme). Mixing them into Redux causes manual caching and sync bugs. TanStack Query manages server state, Zustand or Context manage client state.

**Q: What's "stale-while-revalidate"?**
Show cached (stale) data immediately and refetch in the background, then update when the fresh data arrives. That's TanStack Query's default behaviour.

**Q: When does a refetch happen automatically?**
When a query is **stale** and one of these happens: a new component mounts that uses it (`refetchOnMount`), the window regains focus (`refetchOnWindowFocus`), the network reconnects (`refetchOnReconnect`), or `refetchInterval` fires. It also happens on `invalidateQueries`.

**Q: What happens to a query when no component uses it?**
It becomes **inactive**. After `gcTime` (default 5 min) it is garbage-collected. If a component remounts before then, cached data shows instantly (then refetches if stale).

**Q: Default retry behaviour?**
Queries retry **3 times** with exponential backoff on the client (0 on the server). Mutations don't retry by default.

**Q: How does deduplication work?**
Multiple components calling `useQuery` with the same key at the same time result in **one** network request, and they all subscribe to the same cache entry.

**Q: `invalidateQueries` vs `refetchQueries` vs `resetQueries` vs `removeQueries`?**
- invalidate: mark as stale and refetch the **active** ones (most common after mutations).
- refetch: force a refetch now.
- reset: go back to initial data/state, then refetch active ones.
- remove: delete from the cache entirely.

**Q: How do you handle an auth token / 401 globally?**
Use an axios/fetch wrapper that attaches the token. On 401, refresh the token or redirect to login, and use `QueryCache.onError` for global handling. Don't put the token in the query key unless the data really differs per token.

**Q: TanStack Query vs SWR vs RTK Query?**
SWR is smaller with a simpler API, but has fewer features (weaker mutations, no devtools by default). RTK Query is integrated with Redux and generated from endpoint definitions, and suits Redux shops. TanStack Query has the richest feature set (infinite queries, mutations, devtools, framework-agnostic).

**Q: How do you test components using TanStack Query?**
A fresh `QueryClient` per test with `retry: false`, wrap the component in a provider via a render helper, and mock the network with MSW. Use `findBy` or `waitFor` for async results.

**Q: How do you implement infinite scroll? (code)**
```ts
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: ['posts'],
  queryFn: ({ pageParam }) => fetchPosts({ cursor: pageParam }),
  initialPageParam: 0,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined, // undefined = no more pages
  maxPages: 5,  // optional: limit memory
});
const posts = data?.pages.flatMap((p) => p.items) ?? [];
```
Trigger `fetchNextPage` with an IntersectionObserver sentinel (see `02-React/03-extra-custom-hooks.md`).
