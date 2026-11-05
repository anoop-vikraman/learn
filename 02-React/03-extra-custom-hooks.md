# Custom hooks you should be able to write from memory

Interviewers often say "write a hook that…". Every hook below is small and correct, and comes with the point to *say* while you write it.

## useDebounce

```tsx
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);       // the cleanup resets the timer on every keystroke
  }, [value, delay]);

  return debounced;
}

// Usage: a search box that only fetches when typing pauses
function Search() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 400);
  const { data } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: ({ signal }) => fetch(`/api/search?q=${debouncedQuery}`, { signal }).then((r) => r.json()),
    enabled: debouncedQuery.length > 1,
  });
  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}
```

## useFetch (race-condition safe, with abort)

```tsx
type FetchState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined; error: Error };

export function useFetch<T>(url: string): FetchState<T> & { refetch: () => void } {
  const [state, setState] = useState<FetchState<T>>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);   // fetch doesn't reject on 4xx/5xx
        return res.json() as Promise<T>;
      })
      .then((data) => setState({ status: 'success', data }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ status: 'error', error });
      });

    return () => controller.abort();     // cancels the old request when the url changes or the component unmounts
  }, [url, reloadKey]);

  return { ...state, refetch: () => setReloadKey((k) => k + 1) };
}
```

> Say: "In production I'd use TanStack Query, which adds caching, dedupe, retries and background refetch, but this shows I understand the race condition."

## useLocalStorage

```tsx
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    // lazy initializer: read storage only on the first render
    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota exceeded or private mode */
    }
  }, [key, value]);

  // sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) setValue(JSON.parse(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  return [value, setValue] as const;    // `as const` gives a tuple type, like useState
}
```

## usePrevious

```tsx
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);   // React 19 types require an initial value
  useEffect(() => {
    ref.current = value;    // runs AFTER render, so during render ref still holds the previous value
  }, [value]);
  return ref.current;
}
```

## useInterval (Dan Abramov's pattern: no stale closures)

```tsx
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  // always keep the latest callback without restarting the interval
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;           // pass null to pause
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

// Usage
function Timer() {
  const [count, setCount] = useState(0);
  const [running, setRunning] = useState(true);
  useInterval(() => setCount(count + 1), running ? 1000 : null); // safe: always fresh `count`
  return <button onClick={() => setRunning((r) => !r)}>{count}</button>;
}
```

## useToggle and useBoolean

```tsx
export function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn((v) => !v), []);
  return [on, toggle, setOn] as const;
}
```

## useOnClickOutside (dropdowns, modals)

```tsx
export function useOnClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T>,
  handler: (e: MouseEvent | TouchEvent) => void,
) {
  useEffect(() => {
    const listener = (e: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler(e);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}
```

## useMediaQuery (with useSyncExternalStore: the "correct" modern way)

```tsx
import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,   // client snapshot
    () => false,                               // server snapshot (SSR)
  );
}

// const isMobile = useMediaQuery('(max-width: 768px)');
```

## useWindowSize (throttled with requestAnimationFrame)

```tsx
export function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setSize({ width: window.innerWidth, height: window.innerHeight }),
      );
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return size;
}
```

## useIntersectionObserver (lazy images, infinite scroll)

```tsx
export function useInView<T extends Element>(options?: IntersectionObserverInit) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), options);
    observer.observe(el);
    return () => observer.disconnect();
  }, [options?.root, options?.rootMargin, options?.threshold]);

  return { ref, inView };
}

// Infinite scroll with TanStack Query
function Feed() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(/* ... */);
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin: '200px' });
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);
  return (
    <>
      {data?.pages.flatMap((p) => p.items).map((item) => <Post key={item.id} {...item} />)}
      <div ref={ref}>{isFetchingNextPage ? 'Loading…' : null}</div>
    </>
  );
}
```

## useEventListener (generic, always uses the latest handler)

```tsx
export function useEventListener<K extends keyof WindowEventMap>(
  type: K,
  handler: (e: WindowEventMap[K]) => void,
  target: Window | HTMLElement | null = window,
) {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => { handlerRef.current = handler; });

  useEffect(() => {
    if (!target) return;
    const listener = (e: Event) => handlerRef.current(e as WindowEventMap[K]);
    target.addEventListener(type, listener);
    return () => target.removeEventListener(type, listener);
  }, [type, target]);
}
```

## useAsync (generic wrapper around any promise function)

```tsx
export function useAsync<T, Args extends unknown[]>(fn: (...args: Args) => Promise<T>) {
  const [state, setState] = useState<{ loading: boolean; data?: T; error?: unknown }>({ loading: false });
  const latestCall = useRef(0);

  const run = useCallback(async (...args: Args) => {
    const callId = ++latestCall.current;
    setState({ loading: true });
    try {
      const data = await fn(...args);
      if (callId === latestCall.current) setState({ loading: false, data }); // ignore stale responses
      return data;
    } catch (error) {
      if (callId === latestCall.current) setState({ loading: false, error });
      throw error;
    }
  }, [fn]);

  return { ...state, run };
}
```

## A tiny global store with useSyncExternalStore (how Zustand works)

```tsx
function createStore<S>(initial: S) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState: (updater: (s: S) => S) => {
      state = updater(state);
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const counterStore = createStore({ count: 0, user: 'Anoop' });

function useStore<S, R>(store: ReturnType<typeof createStore<S>>, selector: (s: S) => R): R {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

// Only re-renders when `count` changes, not when `user` changes:
function Counter() {
  const count = useStore(counterStore, (s) => s.count);
  return <button onClick={() => counterStore.setState((s) => ({ ...s, count: s.count + 1 }))}>{count}</button>;
}
```

> Say: "Selectors are why external stores beat Context for frequently changing state. A Context consumer re-renders on *any* change to the value."

## Rules for writing custom hooks (say these)

1. The name starts with `use`, so the linter can enforce the rules of hooks.
2. Each call has its own **isolated state**. Hooks share logic, not state.
3. Return a tuple (`as const`) for 1–2 values and an object for more.
4. Wrap returned functions in `useCallback` if consumers may put them in deps.
5. Always clean up subscriptions, timers and listeners.
