# Custom hooks you should be able to write from memory

Interviewers often say "write a hook that…". Every hook below is small and correct, and comes with the point to *say* while you write it. Under each snippet, **What the names mean** explains every variable in a line or two.

## useDebounce

```tsx
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timeoutId);       // the cleanup resets the timer on every keystroke
  }, [value, delayMs]);

  return debouncedValue;
}

// Usage: a search box that only fetches when typing pauses
function SearchBox() {
  const [searchText, setSearchText] = useState('');
  const debouncedSearchText = useDebounce(searchText, 400);
  const { data: searchResults } = useQuery({
    queryKey: ['search', debouncedSearchText],
    queryFn: ({ signal }) =>
      fetch(`/api/search?q=${debouncedSearchText}`, { signal }).then((response) => response.json()),
    enabled: debouncedSearchText.length > 1,
  });
  return <input value={searchText} onChange={(event) => setSearchText(event.target.value)} />;
}
```

**What the names mean:**
- `value`: the fast-changing input (it changes on every keystroke).
- `delayMs`: how many milliseconds the value must stay the same before it's accepted.
- `debouncedValue`: the settled copy the hook returns. It only updates after the user pauses.
- `timeoutId`: the pending timer. Clearing it in the cleanup restarts the countdown on every change.
- `searchText`: what's in the input right now.
- `debouncedSearchText`: what we actually search for. It's in the `queryKey`, so a new value starts a new fetch.
- `signal`: an abort signal from TanStack Query, so an outdated request is cancelled.
- `enabled`: don't search until at least 2 characters are typed.

## useFetch (race-condition safe, with abort)

```tsx
type FetchState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined; error: Error };

export function useFetch<T>(url: string): FetchState<T> & { refetch: () => void } {
  const [fetchState, setFetchState] = useState<FetchState<T>>({ status: 'loading' });
  const [reloadCounter, setReloadCounter] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();
    setFetchState({ status: 'loading' });

    fetch(url, { signal: abortController.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);   // fetch doesn't reject on 4xx/5xx
        return response.json() as Promise<T>;
      })
      .then((responseData) => setFetchState({ status: 'success', data: responseData }))
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setFetchState({ status: 'error', error: fetchError });
      });

    return () => abortController.abort();     // cancels the old request when the url changes or the component unmounts
  }, [url, reloadCounter]);

  const refetch = () => setReloadCounter((previousCount) => previousCount + 1);
  return { ...fetchState, refetch };
}
```

**What the names mean:**
- `FetchState<T>`: a union of the 3 possible states. TypeScript then knows `data` exists only when `status === 'success'`.
- `url`: what to fetch. It's in the dependency array, so a new URL means a new request.
- `fetchState`: the current state object (`status` plus `data` or `error`).
- `reloadCounter`: a number whose only job is to change. Bumping it re-runs the effect, which is how `refetch` works.
- `abortController`: cancels the request; its `signal` is passed to `fetch`.
- `response` / `responseData`: the raw HTTP response, then the parsed JSON body.
- `fetchError`: the failure. `AbortError` means *we* cancelled it, so it isn't shown as an error.
- `refetch`: lets the component trigger the same request again (a "Retry" button, for example).

> Say: "In production I'd use TanStack Query, which adds caching, dedupe, retries and background refetch, but this shows I understand the race condition."

## useLocalStorage

```tsx
export function useLocalStorage<T>(storageKey: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    // lazy initializer: read storage only on the first render
    try {
      const savedJson = window.localStorage.getItem(storageKey);
      return savedJson !== null ? (JSON.parse(savedJson) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(storedValue));
    } catch {
      /* quota exceeded or private mode */
    }
  }, [storageKey, storedValue]);

  // sync across tabs
  useEffect(() => {
    const handleStorageChange = (storageEvent: StorageEvent) => {
      if (storageEvent.key === storageKey && storageEvent.newValue !== null) {
        setStoredValue(JSON.parse(storageEvent.newValue));
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [storageKey]);

  return [storedValue, setStoredValue] as const;    // `as const` gives a tuple type, like useState
}

// Usage
const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light');
```

**What the names mean:**
- `storageKey`: the name the value is saved under in `localStorage` (`'theme'` above).
- `initialValue`: used when nothing has been saved yet, or the saved data is broken.
- `storedValue` / `setStoredValue`: works like `useState`, but every change is also written to `localStorage`.
- `savedJson`: the raw string from storage. `localStorage` only stores strings, hence `JSON.parse`/`JSON.stringify`.
- `handleStorageChange`: the `storage` event fires in *other* tabs when one tab changes storage, which keeps them in sync.
- `storageEvent.key` / `storageEvent.newValue`: which key changed, and its new string value.

## usePrevious

```tsx
export function usePrevious<T>(value: T): T | undefined {
  const previousValueRef = useRef<T | undefined>(undefined);   // React 19 types require an initial value
  useEffect(() => {
    previousValueRef.current = value;    // runs AFTER render, so during render the ref still holds the previous value
  }, [value]);
  return previousValueRef.current;
}

// Usage
const previousCount = usePrevious(count);   // undefined on the first render
```

**What the names mean:**
- `value`: the value whose previous version you want.
- `previousValueRef`: a ref, so updating it doesn't trigger another render. It always holds the value from the *last* render.
- The return value is read during render, *before* the effect updates the ref, so you get the old value.

## useInterval (Dan Abramov's pattern: no stale closures)

```tsx
export function useInterval(callback: () => void, delayMs: number | null) {
  const latestCallbackRef = useRef(callback);

  // always keep the latest callback without restarting the interval
  useEffect(() => {
    latestCallbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null) return;           // pass null to pause
    const intervalId = setInterval(() => latestCallbackRef.current(), delayMs);
    return () => clearInterval(intervalId);
  }, [delayMs]);
}

// Usage
function Timer() {
  const [count, setCount] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  useInterval(() => setCount(count + 1), isRunning ? 1000 : null); // safe: always fresh `count`
  return <button onClick={() => setIsRunning((wasRunning) => !wasRunning)}>{count}</button>;
}
```

**What the names mean:**
- `callback`: the function to run on each tick. It's a new function every render, and that's fine.
- `delayMs`: milliseconds between ticks. `null` pauses the interval.
- `latestCallbackRef`: always holds the newest `callback`, so the interval never runs an old one that sees stale `count`.
- `intervalId`: needed to stop the interval in the cleanup.
- `isRunning`: whether the timer ticks. Clicking the button flips it.
- `wasRunning`: the previous `isRunning` value, given to the updater function.

## useToggle and useBoolean

```tsx
export function useToggle(initialValue = false) {
  const [isOn, setIsOn] = useState(initialValue);
  const toggle = useCallback(() => setIsOn((wasOn) => !wasOn), []);
  return [isOn, toggle, setIsOn] as const;
}

// Usage
const [isMenuOpen, toggleMenu, setIsMenuOpen] = useToggle();
```

**What the names mean:**
- `isOn`: the current boolean.
- `toggle`: flips it. `useCallback` keeps the same function every render, so it's safe in dependency arrays.
- `setIsOn`: also returned, for setting a specific value (for example `setIsMenuOpen(false)` on Escape).

## useOnClickOutside (dropdowns, modals)

```tsx
export function useOnClickOutside<T extends HTMLElement>(
  containerRef: React.RefObject<T>,
  onOutsideClick: (event: MouseEvent | TouchEvent) => void,
) {
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const clickedInside = containerRef.current?.contains(event.target as Node);
      if (!containerRef.current || clickedInside) return;
      onOutsideClick(event);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [containerRef, onOutsideClick]);
}

// Usage
const dropdownRef = useRef<HTMLDivElement>(null);
useOnClickOutside(dropdownRef, () => setIsOpen(false));
```

**What the names mean:**
- `containerRef`: points at the element that counts as "inside" (the dropdown).
- `onOutsideClick`: what to do when the user clicks anywhere else, usually close the menu.
- `handlePointerDown`: listens on the whole `document`, then checks where the click landed.
- `clickedInside`: `true` if the clicked element is the container or anything inside it (`.contains`).
- `event.target`: the element that was actually clicked.

## useMediaQuery (with useSyncExternalStore: the "correct" modern way)

```tsx
import { useSyncExternalStore } from 'react';

export function useMediaQuery(mediaQuery: string): boolean {
  return useSyncExternalStore(
    (notifyReact) => {
      const mediaQueryList = window.matchMedia(mediaQuery);
      mediaQueryList.addEventListener('change', notifyReact);
      return () => mediaQueryList.removeEventListener('change', notifyReact);
    },
    () => window.matchMedia(mediaQuery).matches,   // client snapshot
    () => false,                                    // server snapshot (SSR)
  );
}

// const isMobile = useMediaQuery('(max-width: 768px)');
```

**What the names mean:**
- `mediaQuery`: a CSS media query string, such as `'(max-width: 768px)'`.
- `notifyReact`: a callback React gives you. Call it when the query result might have changed.
- `mediaQueryList`: the browser object for that query; it fires `change` when the result flips.
- `.matches`: `true` if the query currently matches. This is the snapshot React reads.
- `() => false`: the value used during server rendering, where there's no window.

## useWindowSize (throttled with requestAnimationFrame)

```tsx
export function useWindowSize() {
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    let animationFrameId = 0;
    const handleResize = () => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() =>
        setWindowSize({ width: window.innerWidth, height: window.innerHeight }),
      );
    };
    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  return windowSize;
}
```

**What the names mean:**
- `windowSize`: the current `{ width, height }` of the browser window in pixels.
- `animationFrameId`: the pending frame callback. Resize fires dozens of times a second; cancelling and rescheduling means at most one state update per frame.
- `handleResize`: the listener; the cleanup removes it and cancels any pending frame.

## useIntersectionObserver (lazy images, infinite scroll)

```tsx
export function useInView<T extends Element>(observerOptions?: IntersectionObserverInit) {
  const targetRef = useRef<T>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const targetElement = targetRef.current;
    if (!targetElement) return;
    const observer = new IntersectionObserver(
      ([observedEntry]) => setIsInView(observedEntry.isIntersecting),
      observerOptions,
    );
    observer.observe(targetElement);
    return () => observer.disconnect();
  }, [observerOptions?.root, observerOptions?.rootMargin, observerOptions?.threshold]);

  return { targetRef, isInView };
}

// Infinite scroll with TanStack Query
function Feed() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(/* ... */);
  const { targetRef: bottomSentinelRef, isInView: isBottomVisible } =
    useInView<HTMLDivElement>({ rootMargin: '200px' });

  useEffect(() => {
    if (isBottomVisible && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [isBottomVisible, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allPosts = data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      {allPosts.map((post) => <Post key={post.id} {...post} />)}
      <div ref={bottomSentinelRef}>{isFetchingNextPage ? 'Loading…' : null}</div>
    </>
  );
}
```

**What the names mean:**
- `observerOptions`: `rootMargin: '200px'` means "count it as visible 200px *before* it scrolls on screen", so loading starts early.
- `targetRef`: attach this to the element you want to watch.
- `isInView`: `true` while that element is visible in the viewport.
- `observedEntry.isIntersecting`: the browser's answer to "is it visible right now?".
- The dependencies are the individual option fields, not the `observerOptions` object, because an inline object is new every render.
- `bottomSentinelRef`: an empty `<div>` at the end of the list. When it becomes visible, the user has reached the bottom.
- `allPosts`: every loaded page flattened into one array.
- `hasNextPage` / `isFetchingNextPage`: guards that stop it fetching past the end, or twice at once.

## useEventListener (generic, always uses the latest handler)

```tsx
export function useEventListener<EventName extends keyof WindowEventMap>(
  eventName: EventName,
  handler: (event: WindowEventMap[EventName]) => void,
  eventTarget: Window | HTMLElement | null = window,
) {
  const latestHandlerRef = useRef(handler);
  useLayoutEffect(() => { latestHandlerRef.current = handler; });

  useEffect(() => {
    if (!eventTarget) return;
    const stableListener = (event: Event) => latestHandlerRef.current(event as WindowEventMap[EventName]);
    eventTarget.addEventListener(eventName, stableListener);
    return () => eventTarget.removeEventListener(eventName, stableListener);
  }, [eventName, eventTarget]);
}

// Usage
useEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
```

**What the names mean:**
- `EventName`: a TypeScript generic restricted to real window events (`'keydown'`, `'resize'`…). The `event` type is then inferred correctly, such as `KeyboardEvent` for `'keydown'`.
- `handler`: your function. It can change every render without re-subscribing.
- `eventTarget`: what to listen on; the default is `window`.
- `latestHandlerRef`: updated after every render, so the listener always calls the newest handler.
- `stableListener`: the one function that's actually attached. It stays the same, so add and remove match.

## useAsync (generic wrapper around any promise function)

```tsx
export function useAsync<Result, Args extends unknown[]>(asyncFunction: (...args: Args) => Promise<Result>) {
  const [asyncState, setAsyncState] = useState<{ isLoading: boolean; data?: Result; error?: unknown }>({
    isLoading: false,
  });
  const latestCallIdRef = useRef(0);

  const run = useCallback(async (...args: Args) => {
    const thisCallId = ++latestCallIdRef.current;
    setAsyncState({ isLoading: true });
    try {
      const result = await asyncFunction(...args);
      if (thisCallId === latestCallIdRef.current) setAsyncState({ isLoading: false, data: result }); // ignore stale responses
      return result;
    } catch (error) {
      if (thisCallId === latestCallIdRef.current) setAsyncState({ isLoading: false, error });
      throw error;
    }
  }, [asyncFunction]);

  return { ...asyncState, run };
}

// Usage
const { run: saveProfile, isLoading, error } = useAsync(api.saveProfile);
<button onClick={() => saveProfile(formValues)} disabled={isLoading}>Save</button>
```

**What the names mean:**
- `asyncFunction`: any function that returns a promise (an API call, for example).
- `Result` / `Args`: generics for what it resolves to and the arguments it takes, so `run` has the same signature.
- `asyncState`: `isLoading`, plus either `data` or `error`.
- `latestCallIdRef`: counts calls. Each call remembers its own number in `thisCallId`.
- `thisCallId === latestCallIdRef.current`: "am I still the newest call?". If not, a later call started, so this result is ignored. That prevents race conditions.
- `run`: what you call to start the async work. It also returns the result, so you can `await` it.

## A tiny global store with useSyncExternalStore (how Zustand works)

```tsx
function createStore<State>(initialState: State) {
  let currentState = initialState;
  const listeners = new Set<() => void>();
  return {
    getState: () => currentState,
    setState: (updater: (previousState: State) => State) => {
      currentState = updater(currentState);
      listeners.forEach((notifyListener) => notifyListener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);   // unsubscribe
    },
  };
}

const appStore = createStore({ count: 0, userName: 'Anoop' });

function useStore<State, Selected>(
  store: ReturnType<typeof createStore<State>>,
  selector: (state: State) => Selected,
): Selected {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

// Only re-renders when `count` changes, not when `userName` changes:
function Counter() {
  const count = useStore(appStore, (state) => state.count);
  const increment = () => appStore.setState((previousState) => ({ ...previousState, count: previousState.count + 1 }));
  return <button onClick={increment}>{count}</button>;
}
```

**What the names mean:**
- `currentState`: the store's data. It lives outside React, in a closure.
- `listeners`: every subscribed component's callback. A `Set` prevents duplicates.
- `setState(updater)`: computes the new state from the previous one, then tells every listener.
- `subscribe(listener)`: adds a callback and returns an unsubscribe function, exactly the shape `useSyncExternalStore` expects.
- `selector`: picks the slice a component cares about. React re-renders only when that slice's value changes (compared with `Object.is`).
- `appStore`: the single shared store instance; any component can read or update it.

> Say: "Selectors are why external stores beat Context for frequently changing state. A Context consumer re-renders on *any* change to the value."

> Gotcha: the selector must return the same reference when nothing changed. `(state) => ({ count: state.count })` creates a new object every time, causing endless re-renders. Return primitives, or memoize.

## Rules for writing custom hooks (say these)

1. The name starts with `use`, so the linter can enforce the rules of hooks.
2. Each call has its own **isolated state**. Hooks share logic, not state.
3. Return a tuple (`as const`) for 1–2 values and an object for more.
4. Wrap returned functions in `useCallback` if consumers may put them in deps.
5. Always clean up subscriptions, timers and listeners.
6. Name things for what they *mean*: `isOpen`, `timeoutId`, `latestCallbackRef`, not `flag`, `t`, `ref`.
