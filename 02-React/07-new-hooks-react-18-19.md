# New React hooks (React 18, 19 and 19.2): use cases and code

Interviewers like to ask "what's new in React?" and then "when would you actually use it?". For each hook below you'll find **what it does**, **when to use it**, a **code snippet** and **what to say**.

## Quick map

| Hook / API | Version | One-line purpose |
| --- | --- | --- |
| `useId` | 18 | Stable unique IDs that match between server and client |
| `useTransition` | 18 | Mark a state update as non-urgent and get `isPending` |
| `useDeferredValue` | 18 | Get a "lagging" copy of a value for expensive rendering |
| `useSyncExternalStore` | 18 | Subscribe safely to an external store |
| `useInsertionEffect` | 18 | Inject `<style>` tags before layout effects (CSS-in-JS libraries only) |
| `useActionState` | 19 | State + pending flag for a form action |
| `useFormStatus` | 19 | Read the parent `<form>`'s pending state from a child |
| `useOptimistic` | 19 | Show an optimistic value while an async action runs |
| `use` | 19 | Read a promise or context during render (can be conditional) |
| `useEffectEvent` | 19.2 | A non-reactive event function used inside an effect |
| `<Activity>` | 19.2 | Hide UI while keeping its state (not a hook, but often asked about with them) |

---

## 1. `useId` (React 18)

**What:** generates a unique ID that's stable across re-renders and **identical on the server and client**, so there are no hydration mismatches.

**Use cases:** connecting `<label htmlFor>` to inputs, and `aria-describedby` / `aria-labelledby` in reusable components that may appear many times on one page.

```tsx
import { useId } from 'react';

function EmailField({ errorMessage }: { errorMessage?: string }) {
  const fieldIdPrefix = useId();                   // e.g. ":r1:" (format varies by version)
  const inputId = `${fieldIdPrefix}-email`;
  const errorId = `${fieldIdPrefix}-error`;
  return (
    <div>
      <label htmlFor={inputId}>Email</label>
      <input
        id={inputId}
        type="email"
        aria-invalid={!!errorMessage}
        aria-describedby={errorMessage ? errorId : undefined}
      />
      {errorMessage && <p id={errorId} role="alert">{errorMessage}</p>}
    </div>
  );
}

// Render it twice on one page: the IDs never clash
<><EmailField /><EmailField errorMessage="Required" /></>;
```

**What the names mean:**
- `fieldIdPrefix`: the unique base id from `useId`; each `EmailField` instance gets its own.
- `inputId`: links the `<label>` to the `<input>` (`htmlFor` ↔ `id`), so clicking the label focuses the input.
- `errorId`: lets the input point at its error message (`aria-describedby`), so screen readers read the error aloud.
- `errorMessage`: optional validation text from the parent. When present, the input is marked invalid.

**Say:**
- "Why not `Math.random()` or a counter? Because the server and client would generate different values, which causes a hydration mismatch."
- "**Don't use it for list keys.** Keys should come from your data."

---

## 2. `useTransition` (React 18)

**What:** marks a state update as **non-urgent (a transition)**. React keeps urgent updates (typing, clicking) responsive and renders the transition in the background, where it can be interrupted. It returns `[isPending, startTransition]`.

**Use cases:** switching tabs that render heavy content, filtering a big list, navigation, and (in React 19) async actions.

```tsx
import { useState, useTransition } from 'react';

function ProductSearch({ products }: { products: Product[] }) {
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const typedText = event.target.value;
    setInputText(typedText);                 // urgent: the input updates immediately
    startTransition(() => {
      setSearchQuery(typedText);             // non-urgent: the heavy list can wait
    });
  };

  const matchingProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <>
      <input value={inputText} onChange={handleChange} />
      {isPending && <span>Updating…</span>}
      <ul style={{ opacity: isPending ? 0.6 : 1 }}>
        {matchingProducts.map((product) => <li key={product.id}>{product.name}</li>)}
      </ul>
    </>
  );
}
```

**What the names mean:**
- `inputText`: what the text box displays. It's updated urgently so typing never lags.
- `searchQuery`: what the list is filtered by. It's updated inside a transition, so it can lag behind `inputText`.
- `isPending`: `true` while React is still rendering the new `searchQuery`; we dim the list meanwhile.
- `startTransition`: wraps updates that are allowed to be slow or interrupted.
- `typedText`: the new input value, read once and used for both updates.
- `matchingProducts`: the products whose name contains the query. This is the expensive part.

**Tabs example: no flash of the Suspense fallback when switching**

```tsx
function Tabs() {
  const [activeTab, setActiveTab] = useState('home');
  const [isPending, startTransition] = useTransition();
  return (
    <>
      {['home', 'posts', 'settings'].map((tabName) => (
        <button key={tabName} onClick={() => startTransition(() => setActiveTab(tabName))} disabled={isPending}>
          {tabName}
        </button>
      ))}
      <Suspense fallback={<Spinner />}>
        {activeTab === 'posts' ? <SlowPosts /> : activeTab === 'settings' ? <Settings /> : <Home />}
      </Suspense>
    </>
  );
}
// Because the update is a transition, React keeps showing the OLD tab
// instead of replacing it with the Spinner while SlowPosts loads.
```

- `activeTab`: which tab's content is shown.
- `tabName`: one of the three tab names, used to render each button.
- `isPending`: `true` while the new tab is still loading or rendering in the background.

**React 19: async transitions (Actions)**

```tsx
const [isPending, startTransition] = useTransition();

const handleSave = () => {
  startTransition(async () => {
    const saveError = await updateName(name);  // isPending stays true for the whole async call
    if (saveError) { setErrorMessage(saveError); return; }
    startTransition(() => navigate('/profile'));  // a state update after await needs its own startTransition
  });
};
```

- `name`: the value being saved (from state, not shown here).
- `saveError`: what `updateName` returned. An error message means the save failed; nothing means it succeeded.
- `isPending`: stays `true` from the start of the async function until it finishes, with no manual boolean needed.

**Say:**
- "A transition isn't a debounce or delay. Every update is still rendered, but at lower priority and interruptibly."
- "You can't use a transition for controlled input values. The input itself must update urgently."
- "There's also a standalone `startTransition` import for when you don't need `isPending`, e.g. outside components."

---

## 3. `useDeferredValue` (React 18)

**What:** returns a **deferred copy** of a value. During urgent updates it returns the old value, and it catches up in a background render. It's like `useTransition`, but for when you **receive** the value (from props) rather than set it yourself.

**Use cases:** an expensive child that depends on a fast-changing value (search results, charts), especially when the value comes from props or a library you don't control.

```tsx
import { useDeferredValue, memo, useState } from 'react';

function SearchPage() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const isShowingOldResults = query !== deferredQuery;

  return (
    <>
      <input value={query} onChange={(event) => setQuery(event.target.value)} />
      <div style={{ opacity: isShowingOldResults ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        <SlowResults query={deferredQuery} />
      </div>
    </>
  );
}

// memo is REQUIRED: otherwise SlowResults re-renders on every urgent render anyway
const SlowResults = memo(function SlowResults({ query }: { query: string }) {
  const matchingItems = expensiveFilter(allItems, query);
  return <ul>{matchingItems.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;
});
```

**What the names mean:**
- `query`: the live input value, updated on every keystroke.
- `deferredQuery`: a copy of `query` that React lets lag behind while `SlowResults` re-renders in the background.
- `isShowingOldResults`: `true` while the results are still for an older query, so we fade them.
- `matchingItems`: the expensive filtered list, recomputed only when `SlowResults` gets a new `query` prop.

**React 19: initial value**

```tsx
const deferredQuery = useDeferredValue(query, '');  // first render uses '' and then renders the real value in the background
```

**`useTransition` vs `useDeferredValue` vs debounce:**

| | `useTransition` | `useDeferredValue` | Debounce |
| --- | --- | --- | --- |
| You control | The setter | Only the value | The call timing |
| Fixed delay | No | No | Yes (e.g. 300 ms) |
| Fast device | Updates almost instantly | Updates almost instantly | Always waits |
| Reduces network calls | No | No | **Yes** |
| Best for | Heavy **rendering** | Heavy **rendering** | **Network** requests |

**Say:** "For expensive rendering I'd use `useDeferredValue` or `useTransition`. For API calls on every keystroke, I'd still debounce, because deferring doesn't reduce the number of requests."

---

## 4. `useSyncExternalStore` (React 18)

**What:** the correct way to subscribe to data that lives **outside React** (a store, browser API, WebSocket). It prevents **tearing**, where different components show different values of the same store during a concurrent render.

**Signature:** `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)`

**Use cases:** state libraries (Zustand, Redux and Jotai use it internally), browser APIs (`navigator.onLine`, `matchMedia`, `localStorage`), third-party event sources.

```tsx
import { useSyncExternalStore } from 'react';

// Online/offline status
function subscribeToNetworkStatus(notifyReact: () => void) {
  window.addEventListener('online', notifyReact);
  window.addEventListener('offline', notifyReact);
  return () => {
    window.removeEventListener('online', notifyReact);
    window.removeEventListener('offline', notifyReact);
  };
}

export function useOnlineStatus() {
  return useSyncExternalStore(
    subscribeToNetworkStatus,
    () => navigator.onLine,   // getSnapshot: current value on the client
    () => true,               // getServerSnapshot: value during SSR
  );
}

function StatusBar() {
  const isOnline = useOnlineStatus();
  return <p>{isOnline ? '✅ Online' : '❌ Offline'}</p>;
}
```

**What the names mean:**
- `subscribeToNetworkStatus`: tells the browser to call `notifyReact` when the connection changes, and returns a function that stops listening. React calls both for you.
- `notifyReact`: a callback React passes in. Calling it means "something changed, read the snapshot again".
- `() => navigator.onLine`: the *snapshot*, the current value React shows.
- `() => true`: the snapshot used on the server, where `navigator` doesn't exist.
- `isOnline`: the boolean the component renders; it updates automatically.

**A store with selectors (how Zustand works):** see `03-extra-custom-hooks.md`.

**Gotchas:**
- `getSnapshot` must return the **same value** if nothing changed. Returning a new object every call (`() => ({ ...store })`) causes an infinite loop.
- Define `subscribe` **outside** the component, or memoize it. A new function on every render makes React resubscribe each time.

---

## 5. `useInsertionEffect` (React 18)

**What:** runs **before** `useLayoutEffect` and before React mutates the DOM, so injected styles exist before anything reads layout.

**Use case:** only **CSS-in-JS library authors** (styled-components, Emotion) injecting `<style>` tags. You'll almost never write it in app code.

```tsx
function useDynamicStyle(cssRule: string) {
  useInsertionEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = cssRule;
    document.head.appendChild(styleElement);
    return () => styleElement.remove();
  }, [cssRule]);
}
```

- `cssRule`: a CSS string such as `.btn { color: red }`.
- `styleElement`: the `<style>` tag added to `<head>`; the cleanup removes it when the rule changes or the component unmounts.

**Effect order:** `useInsertionEffect` → DOM mutations → `useLayoutEffect` → browser paint → `useEffect`.

**Say:** "It exists so CSS-in-JS libraries don't trigger extra layout recalculation. In app code I'd use `useEffect` or `useLayoutEffect`."

---

## 6. `useActionState` (React 19)

**What:** manages state that's updated by a **form action**. It returns `[state, formAction, isPending]`. The action receives `(previousState, formData)`. (It was called `useFormState` in the React DOM canaries.)

**Use cases:** form submission with server or client validation errors, a pending state without manual `useState` booleans, and progressive enhancement with Server Actions.

```tsx
import { useActionState } from 'react';

type NewsletterState = { error?: string; success?: boolean };

async function subscribeToNewsletter(previousState: NewsletterState, formData: FormData): Promise<NewsletterState> {
  const email = formData.get('email') as string;
  if (!email.includes('@')) return { error: 'Enter a valid email' };
  try {
    await api.post('/newsletter', { email });
    return { success: true };
  } catch {
    return { error: 'Something went wrong. Try again.' };
  }
}

export function NewsletterForm() {
  const [newsletterState, subscribeAction, isPending] = useActionState(subscribeToNewsletter, {});

  if (newsletterState.success) return <p>🎉 Subscribed!</p>;

  return (
    <form action={subscribeAction}>
      <input name="email" type="email" placeholder="you@example.com" />
      <button disabled={isPending}>{isPending ? 'Subscribing…' : 'Subscribe'}</button>
      {newsletterState.error && <p role="alert">{newsletterState.error}</p>}
    </form>
  );
}
```

**What the names mean:**
- `NewsletterState`: what the action can return: an `error` message, or `success: true`.
- `subscribeToNewsletter`: the action. React calls it with the previous state and the submitted form; whatever it returns becomes the new state.
- `previousState`: the last returned state (unused here, but useful for things like counting attempts).
- `formData`: the submitted fields; `formData.get('email')` reads the input with `name="email"`.
- `newsletterState`: the latest returned state, used to show the error or the success message.
- `subscribeAction`: the wrapped function to pass to `<form action>`.
- `isPending`: `true` while `subscribeToNewsletter` is running.

**Before React 19, the same thing needed:**
```tsx
const [errorMessage, setErrorMessage] = useState<string>();
const [isPending, setIsPending] = useState(false);
const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  setIsPending(true);
  // ...try/catch, setErrorMessage, finally setIsPending(false)
};
```

**Say:** "With `<form action={fn}>`, React handles the pending state, resets uncontrolled form fields after a successful submit, and with Server Actions the form even works before JavaScript loads."

---

## 7. `useFormStatus` (React 19, from `react-dom`)

**What:** lets a component read the status of the **parent `<form>`**: `{ pending, data, method, action }`. No prop drilling.

**Use case:** a reusable `SubmitButton` that disables itself and shows a spinner while any form it's placed in is submitting.

```tsx
import { useFormStatus } from 'react-dom';

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending: isSubmitting, data: submittedFormData } = useFormStatus();
  return (
    <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
      {isSubmitting ? `Saving ${submittedFormData?.get('title') ?? ''}…` : children}
    </button>
  );
}

// Works in ANY form that uses an action:
function NewPostForm() {
  return (
    <form action={createPost}>
      <input name="title" />
      <SubmitButton>Publish</SubmitButton>
    </form>
  );
}
```

**What the names mean:**
- `isSubmitting` (renamed from `pending`): `true` while the parent form's action is running.
- `submittedFormData` (renamed from `data`): the `FormData` being submitted, so the button can show "Saving My Post…". It's `null` when idle.
- `createPost`: the form's action function (client or server). `SubmitButton` doesn't need to know about it.

**Gotcha (asked often):** it must be called from a component rendered **inside** the `<form>`. Calling it in the same component that renders the `<form>` always returns `pending: false`.

---

## 8. `useOptimistic` (React 19)

**What:** shows a temporary **optimistic** value while an async action is in progress. When the action finishes (or fails), React automatically switches back to the real state.

**Signature:** `const [optimisticState, addOptimistic] = useOptimistic(state, updateFn)`

**Use cases:** likes, sending chat messages, adding todos, toggling checkboxes: anything where you want an instant UI response.

```tsx
import { useOptimistic, useRef } from 'react';

type Message = { id: string; text: string; isSending?: boolean };

function Chat({ messages, sendMessage }: {
  messages: Message[];
  sendMessage: (text: string) => Promise<void>;   // updates `messages` in the parent when it's done
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (currentMessages, newText: string) => [
      ...currentMessages,
      { id: `temp-${Date.now()}`, text: newText, isSending: true },
    ],
  );

  async function sendAction(formData: FormData) {
    const messageText = formData.get('message') as string;
    addOptimisticMessage(messageText);   // the UI updates instantly
    formRef.current?.reset();
    await sendMessage(messageText);      // if this throws, the optimistic message disappears
  }

  return (
    <>
      <ul>
        {optimisticMessages.map((message) => (
          <li key={message.id} style={{ opacity: message.isSending ? 0.5 : 1 }}>
            {message.text} {message.isSending && <small>(sending…)</small>}
          </li>
        ))}
      </ul>
      <form action={sendAction} ref={formRef}>
        <input name="message" />
        <button>Send</button>
      </form>
    </>
  );
}
```

**What the names mean:**
- `messages`: the real, confirmed messages from the parent.
- `sendMessage`: saves a message on the server; the parent then updates `messages`.
- `formRef`: a ref to the `<form>`, used to clear the input right after sending.
- `optimisticMessages`: what's rendered: `messages` plus any temporary ones while an action is running.
- `addOptimisticMessage`: adds a temporary message by running the updater `(currentMessages, newText) => …`.
- `isSending`: marks the temporary message so it can be shown faded with "(sending…)".
- `sendAction`: the form's action: show the message optimistically, clear the form, then save.

**Like-button example (inside a transition, not a form):**

```tsx
function LikeButton({ isLiked, likeCount, toggleLike }: Props) {
  const [optimisticLike, setOptimisticLike] = useOptimistic({ isLiked, likeCount });
  const [, startTransition] = useTransition();

  const handleClick = () =>
    startTransition(async () => {
      const countChange = optimisticLike.isLiked ? -1 : 1;
      setOptimisticLike({ isLiked: !optimisticLike.isLiked, likeCount: optimisticLike.likeCount + countChange });
      await toggleLike();
    });

  return <button onClick={handleClick}>{optimisticLike.isLiked ? '❤️' : '🤍'} {optimisticLike.likeCount}</button>;
}
```

- `isLiked` / `likeCount`: the real values from the server, passed in as props.
- `toggleLike`: the async call that saves the like or unlike.
- `optimisticLike`: what's displayed. It flips instantly on click, then returns to the real props when the transition ends.
- `setOptimisticLike`: with no updater function given, you pass the whole new optimistic value directly.
- `countChange`: `-1` when un-liking, `+1` when liking.
- `[, startTransition]`: the leading comma skips `isPending`, which isn't needed here.

**Say:**
- "`addOptimistic` must be called inside an action or `startTransition`."
- "How does it compare with TanStack Query's optimistic updates? `useOptimistic` is built in and reverts automatically. TanStack's version works on the cache, so other components that read the same query also see the optimistic value."

---

## 9. `use` (React 19)

**What:** reads the value of a **promise** or **context** during render. Unlike other hooks, it **can be called conditionally and inside loops**.

- **With a promise:** the component **suspends** until it resolves (the nearest `<Suspense>` shows a fallback). If it rejects, the nearest **error boundary** catches it.
- **With context:** works like `useContext`, but can be inside an `if`.

```tsx
import { use, Suspense } from 'react';

// 1. Reading a promise
function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise);        // suspends until resolved
  return <h1>{user.name}</h1>;
}

function Page({ userId }: { userId: string }) {
  // The promise must be created OUTSIDE the suspending component (or cached),
  // otherwise every render creates a new promise and it suspends forever.
  const userPromise = useMemo(() => fetchUser(userId), [userId]);
  return (
    <ErrorBoundary fallback={<p>Couldn't load user</p>}>
      <Suspense fallback={<Spinner />}>
        <UserProfile userPromise={userPromise} />
      </Suspense>
    </ErrorBoundary>
  );
}

// 2. Conditional context (impossible with useContext)
function Heading({ children, isThemed }: { children: React.ReactNode; isThemed: boolean }) {
  if (!isThemed) return <h2>{children}</h2>;
  const theme = use(ThemeContext);      // ✅ allowed after an early return
  return <h2 style={{ color: theme.primary }}>{children}</h2>;
}
```

**What the names mean:**
- `userPromise`: a promise for the user's data. `useMemo` keeps the *same* promise until `userId` changes.
- `user`: the resolved value. `UserProfile` suspends (the `Spinner` shows) until it's available.
- `ErrorBoundary`: catches the error if the promise rejects.
- `isThemed`: decides whether to read the theme at all. Because of the early return, `use` is sometimes skipped, which only `use` allows.
- `theme`: the context value, such as `{ primary: '#0af' }`.

**Typical real-world pattern (Next.js / RSC):** a Server Component starts the fetch and passes the promise to a Client Component, which calls `use(promise)`. The data streams in without a client-side waterfall.

```tsx
// Server Component
export default function Page() {
  const commentsPromise = getComments();   // not awaited, so it streams
  return (
    <Suspense fallback={<p>Loading comments…</p>}>
      <Comments commentsPromise={commentsPromise} />
    </Suspense>
  );
}

// Client Component
'use client';
export function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  const comments = use(commentsPromise);
  return comments.map((comment) => <p key={comment.id}>{comment.text}</p>);
}
```

- `commentsPromise`: started on the server *without* `await`, so the page HTML can stream before the comments are ready.
- `comments`: the resolved array, read on the client with `use`.

**Gotchas:**
- Not allowed inside `try/catch`. Use an error boundary instead.
- Creating the promise inside the same component during render suspends forever. Cache it, or create it in the parent, a loader or a Server Component.
- For most client-side data fetching, TanStack Query's `useSuspenseQuery` is still the practical choice (it adds caching and refetching).

---

## 10. `useEffectEvent` (React 19.2)

**What:** creates an **Effect Event**: a function that always sees the **latest** props and state, but **isn't reactive**, so it doesn't belong in the effect's dependency array and doesn't cause the effect to re-run.

**Problem it solves:** you want an effect to re-run when `roomId` changes, but **not** when `theme` changes, even though you use `theme` inside it.

```tsx
import { useEffect, useEffectEvent } from 'react';

function ChatRoom({ roomId, theme }: { roomId: string; theme: 'light' | 'dark' }) {
  // ❌ Before: theme in deps means changing the theme reconnects to the chat
  // useEffect(() => {
  //   const connection = createConnection(roomId);
  //   connection.on('connected', () => showNotification('Connected!', theme));
  //   connection.connect();
  //   return () => connection.disconnect();
  // }, [roomId, theme]);

  // ✅ After
  const onConnected = useEffectEvent(() => {
    showNotification('Connected!', theme);     // always reads the latest theme
  });

  useEffect(() => {
    const connection = createConnection(roomId);
    connection.on('connected', () => onConnected());
    connection.connect();
    return () => connection.disconnect();
  }, [roomId]);                                 // only reconnects when the room changes
}
```

**What the names mean:**
- `roomId`: which chat room to join. It's the only dependency, so only a room change reconnects.
- `theme`: affects how the notification looks, but shouldn't cause a reconnect.
- `onConnected`: an Effect Event. It always reads the *latest* `theme`, yet isn't a dependency.
- `connection`: the live chat connection; the cleanup disconnects it before reconnecting or unmounting.

**Other use cases:** logging analytics with the latest cart contents when the URL changes, or an interval callback that reads the latest state (replacing the `useRef` "latest callback" trick in `useInterval`).

**Rules:** call Effect Events **only from inside effects**, never during render or pass them to other components. Don't use them just to silence the exhaustive-deps lint rule.

**Say:** "Before 19.2 we did this by hand with a ref holding the latest callback. `useEffectEvent` makes it official and lint-aware."

---

## 11. `<Activity>` (React 19.2): not a hook, but often asked about with them

**What:** hides part of the UI **while keeping its state and DOM**. Effects are cleaned up while it's hidden and re-created when it becomes visible again, and React can pre-render hidden content at low priority.

```tsx
import { Activity } from 'react';

function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'inbox'>('home');
  return (
    <>
      <TabBar value={activeTab} onChange={setActiveTab} />
      <Activity mode={activeTab === 'home' ? 'visible' : 'hidden'}><Home /></Activity>
      <Activity mode={activeTab === 'inbox' ? 'visible' : 'hidden'}><Inbox /></Activity>
    </>
  );
}
// Switching back to Inbox keeps its scroll position, typed draft and form state,
// unlike {activeTab === 'inbox' && <Inbox />}, which unmounts it and loses all of that.
```

- `activeTab`: which tab is shown.
- `mode`: `'visible'` shows the content; `'hidden'` hides it with `display: none`, but keeps its state and DOM alive.

**Use cases:** tabs, back navigation that should restore state, pre-rendering the page a user is likely to visit next.

---

## React 19 non-hook API changes that go with these hooks

```tsx
// ref is a normal prop: no forwardRef needed
function Input({ ref, ...props }: React.ComponentProps<'input'>) {
  return <input ref={ref} {...props} />;
}

// Ref callbacks can return a cleanup function
<div ref={(divElement) => {
  const resizeObserver = new ResizeObserver(() => {});
  if (divElement) resizeObserver.observe(divElement);
  return () => resizeObserver.disconnect();
}} />;

// Context as a provider
<ThemeContext value="dark"><App /></ThemeContext>;   // instead of <ThemeContext.Provider>

// Document metadata from any component (hoisted into <head>)
function BlogPost({ post }: { post: Post }) {
  return (
    <article>
      <title>{post.title}</title>
      <meta name="description" content={post.excerpt} />
      <h1>{post.title}</h1>
    </article>
  );
}
```

- `ref` (in `Input`): received like a normal prop and forwarded to the real `<input>`.
- `divElement`: the DOM node React passes to a callback ref. The returned function runs on unmount.
- `resizeObserver`: watches the element's size; the cleanup disconnects it.
- `post`: the blog post. Its title and excerpt are moved into `<head>` automatically.

---

## Interview questions on new hooks

**Q: What problem do Actions solve?**
Every form used to need manual `isPending`, error state, `preventDefault` and optimistic logic. Actions (async functions in transitions or `<form action>`) handle pending state, errors, optimistic updates and form resets automatically, through `useActionState`, `useFormStatus` and `useOptimistic`.

**Q: Why can `use` be called conditionally when other hooks can't?**
Other hooks store state in a slot tied to their call order. `use` doesn't keep per-call state: it just reads a promise (suspending if needed) or the current context value, so call order doesn't matter.

**Q: `useTransition` vs `useDeferredValue`: which would you choose?**
`useTransition` when I own the state update (event handler). `useDeferredValue` when I only receive the value (prop or third-party hook). Both need the expensive part to be memoized or split out to actually help.

**Q: What is tearing, and which hook prevents it?**
During a concurrent (interruptible) render, an external store could change halfway through, so some components render the old value and others the new one. `useSyncExternalStore` forces a consistent snapshot.

**Q: `useFormStatus` returns `pending: false` even while submitting. Why?**
It was called in the component that renders the `<form>`, not in a child inside it. Move it into a child component (e.g. `SubmitButton`).

**Q: Does `useOptimistic` replace TanStack Query's optimistic updates?**
For a local, component-level optimistic UI, yes, it's simpler. When the same data is shown in several places (list + counter + detail page), cache-level optimistic updates in TanStack Query keep everything consistent.

**Q: When would you use `useId` vs `crypto.randomUUID()`?**
`useId` for element IDs in render, because it's SSR-safe and stable. `crypto.randomUUID()` for new **data** (e.g. a new todo's id), created in an event handler, never during render.
