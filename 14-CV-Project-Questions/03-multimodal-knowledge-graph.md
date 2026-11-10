# Multimodal Knowledge Graph (Apr 2025 – Sep 2025)

> Explored multimodal LLMs to process data and populate a knowledge graph. You built the UI: users upload different file types, query the graph in natural language, and see the results.
>
> **Stack:** React, CSS, HTML5, Git, JSON, UI/UX Design

Interviewers find AI projects interesting, so expect curiosity questions about LLMs and knowledge graphs, then deep questions about the **chat UI**, **async state** and **media handling**.

---

## A. Project overview

### A1. What is a knowledge graph, and what did this app do?

<details>
<summary>Model answer</summary>

> "A knowledge graph stores information as **entities (nodes) and relationships (edges)**, for example *Vendor A* —supplies→ *Product B*. Instead of searching text, you can ask questions that follow relationships.
>
> The app let users **ingest** files (documents, markdown, images, audio, video). A multimodal LLM on the backend extracted entities and relationships and wrote them into the graph [Neo4j / other]. Users then **asked questions in natural language** in a chat; the backend turned the question into a graph query (or used retrieval over the graph, sometimes called GraphRAG) and the LLM wrote the answer.
>
> I built the frontend: the chat interface, all upload and preview flows, layout, theming and the API integration."

Be clear about **what was yours (frontend)** and what the backend/ML team did. If asked about model internals, it's fine to say "that was the ML team's part; from the frontend side, I…".

</details>

### A2. What does "multimodal" mean?

<details>
<summary>Answer</summary>

A model that accepts **more than one type of input**: text, images, audio, video. Examples: GPT-4o, Gemini, Claude (text + images). For the UI, every input type needs its own upload, validation, preview and error handling.

</details>

### A3. The tech list is only React/CSS/HTML. No TypeScript, no state library? Why?

<details>
<summary>Answer</summary>

> "It was a research-style project with a small team, so we kept the stack light: plain React with hooks, `useReducer` + Context for chat state, and CSS. In hindsight TypeScript would have helped with the different message shapes (text, image, video, error), because a discriminated union fits that perfectly."

</details>

---

## B. Chat interface

### B1. How did you model chat state?

<details>
<summary>Model answer with code</summary>

A reducer, because many actions change the same list (send, receive, fail, retry, clear):

```ts
type Message =
  | { id: string; role: 'user'; kind: 'text'; text: string; status: 'sending' | 'sent' | 'failed' }
  | { id: string; role: 'user'; kind: 'image' | 'video' | 'audio' | 'file'; file: File; previewUrl: string; status: 'sending' | 'sent' | 'failed' }
  | { id: string; role: 'assistant'; kind: 'text'; text: string };

type Action =
  | { type: 'SEND'; message: Message }
  | { type: 'SENT'; id: string }
  | { type: 'FAILED'; id: string }
  | { type: 'RECEIVED'; message: Message }
  | { type: 'CLEAR' };

function chatReducer(state: Message[], action: Action): Message[] {
  switch (action.type) {
    case 'SEND':     return [...state, action.message];
    case 'SENT':     return state.map(m => m.id === action.id ? { ...m, status: 'sent' } : m);
    case 'FAILED':   return state.map(m => m.id === action.id ? { ...m, status: 'failed' } : m);
    case 'RECEIVED': return [...state, action.message];
    case 'CLEAR':    return [];
  }
}
```

The user's message appears **immediately** (optimistic), marked `sending`. If the request fails it becomes `failed` and shows a **Retry** button.

</details>

### B2. "Ensured safe state management during async operations." What could go wrong, and how did you prevent it?

<details>
<summary>Model answer: this is the key question for this project</summary>

Problems with async in a chat:

| Problem | Example | Fix |
| --- | --- | --- |
| **Stale closure** | `setMessages([...messages, reply])` uses the `messages` from when the request started, so a message sent meanwhile disappears | Functional update `setMessages(prev => [...prev, reply])` or a reducer |
| **Response after Clear** | The user clicks Clear while a reply is pending; the reply then shows up in the empty chat | Track a conversation/session id, or abort pending requests on clear; ignore responses whose id doesn't match |
| **Update after unmount** | The user leaves the page mid-request | `AbortController` in the effect cleanup |
| **Double submit** | Enter pressed twice | Disable send while `sending`, or ignore if a request is in flight |
| **Out-of-order replies** | Two quick messages; the second answer arrives first | Attach each reply to its request id; render by order |

```ts
const sessionRef = useRef(0);

async function send(text: string) {
  const session = sessionRef.current;
  const id = crypto.randomUUID();
  dispatch({ type: 'SEND', message: { id, role: 'user', kind: 'text', text, status: 'sending' } });
  try {
    const reply = await chatApi.send(text, { signal: controllerRef.current.signal });
    if (session !== sessionRef.current) return;   // chat was cleared meanwhile
    dispatch({ type: 'SENT', id });
    dispatch({ type: 'RECEIVED', message: { id: reply.id, role: 'assistant', kind: 'text', text: reply.text } });
  } catch (e) {
    if (session === sessionRef.current && !isAbort(e)) dispatch({ type: 'FAILED', id });
  }
}

function clear() {
  sessionRef.current++;
  controllerRef.current.abort();
  controllerRef.current = new AbortController();
  dispatch({ type: 'CLEAR' });
  chatApi.clear();
}
```

</details>

### B3. How did retry work?

<details>
<summary>Answer</summary>

A failed message keeps its original payload (text or file). **Retry** sets it back to `sending` and resends the same payload with the **same id**, so it doesn't duplicate in the list. For automatic retries use **exponential backoff** (1 s, 2 s, 4 s), only for network errors or 5xx, never for 4xx validation errors.

</details>

### B4. How did you implement auto-scroll? What about when the user has scrolled up to read old messages?

<details>
<summary>Model answer with code</summary>

Only auto-scroll if the user is **already near the bottom**; otherwise show a "New messages ↓" button.

```tsx
const listRef = useRef<HTMLDivElement>(null);
const bottomRef = useRef<HTMLDivElement>(null);
const [atBottom, setAtBottom] = useState(true);

const onScroll = () => {
  const el = listRef.current!;
  setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
};

useEffect(() => {
  if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages, atBottom]);

return (
  <div ref={listRef} onScroll={onScroll} className="messages" role="log" aria-live="polite">
    {messages.map(m => <MessageBubble key={m.id} message={m} />)}
    <div ref={bottomRef} />
  </div>
);
```

Notes: images load later and change the height, so scroll again on image `onLoad`. `role="log"` + `aria-live="polite"` lets screen readers announce new replies.

</details>

### B5. What does "message threading" mean in your app?

<details>
<summary>Answer</summary>

Say what it really was. Common meanings: grouping consecutive messages by the same sender; linking each assistant reply to the user message it answers (reply-to id); or separate **conversations** listed in the sidebar, each with its own history. Explain the data shape you used (e.g. `conversations: { id, title, messages[] }`).

</details>

### B6. Did you stream LLM responses token by token? How would you?

<details>
<summary>Answer</summary>

If you did, explain it. If not, this is a great "how would you improve it" answer:

```ts
const res = await fetch('/api/chat', { method: 'POST', body: JSON.stringify({ text }), signal });
const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
let text = '';
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  text += value;
  dispatch({ type: 'UPDATE_ASSISTANT', id, text });   // re-render with partial text
}
```

Or **Server-Sent Events** (`EventSource`, but it's GET-only, so POST bodies need fetch streaming). Add a **Stop** button that calls `controller.abort()`. Batch updates with `requestAnimationFrame` if re-rendering every token is too slow.

</details>

### B7. How do you keep a long chat fast?

<details>
<summary>Answer</summary>

- `React.memo` on `MessageBubble`, so old messages don't re-render when a new one arrives (stable `key` and props).
- Keep the **input's state local** to the input component, so typing doesn't re-render the message list. This is the most common chat performance bug.
- Virtualize very long histories (`react-virtuoso` handles variable heights and "stick to bottom" well).
- Revoke object URLs for removed media.

</details>

---

## C. File uploads and previews (image, video, audio, markdown)

### C1. How did you implement file upload with preview?

<details>
<summary>Model answer with code</summary>

```tsx
const ACCEPT = { image: ['image/png', 'image/jpeg', 'image/webp'], video: ['video/mp4', 'video/webm'], audio: ['audio/mpeg', 'audio/wav', 'audio/webm'] };
const MAX_MB = 20;

function onFileChange(e: ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!Object.values(ACCEPT).flat().includes(file.type)) return showError('Unsupported file type');
  if (file.size > MAX_MB * 1024 * 1024) return showError(`Max ${MAX_MB} MB`);
  setPending({ file, url: URL.createObjectURL(file) });
  e.target.value = '';                      // allow selecting the same file again
}

useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);
```

Rendering by type:

```tsx
{type.startsWith('image/') && <img src={url} alt={file.name} />}
{type.startsWith('video/') && <video src={url} controls />}
{type.startsWith('audio/') && <audio src={url} controls />}
```

Upload with `FormData`:

```ts
const fd = new FormData();
fd.append('file', file);
await axios.post('/ingest', fd, { onUploadProgress: (e) => setProgress(Math.round((e.loaded / (e.total ?? 1)) * 100)) });
```

</details>

### C2. `URL.createObjectURL` vs `FileReader.readAsDataURL`: which and why?

<details>
<summary>Answer</summary>

| | `createObjectURL` | `readAsDataURL` |
| --- | --- | --- |
| Speed | Instant: a reference to the file in memory | Reads the whole file and base64-encodes it (~33% bigger) |
| Async | Sync | Async (callback/promise) |
| Large video | Good | Bad: huge strings, can freeze the tab |
| Cleanup | **Must call `URL.revokeObjectURL`** or it leaks memory | Garbage-collected |

Use object URLs for previews, especially video and audio.

</details>

### C3. Is checking `file.type` enough for validation?

<details>
<summary>Answer</summary>

No. `file.type` comes from the file **extension**, and the user can rename `virus.exe` to `photo.png`. Frontend checks are for UX only. The **backend must validate** (magic bytes, size limits, virus scanning). Also use the `accept` attribute on the input to filter the picker.

</details>

### C4. How did you implement image zoom?

<details>
<summary>Model answer</summary>

Clicking an image opens a modal (a portal) with zoom in/out/reset and drag-to-pan:

```tsx
const [scale, setScale] = useState(1);
const [pos, setPos] = useState({ x: 0, y: 0 });

const onWheel = (e: WheelEvent) => setScale(s => clamp(s - e.deltaY * 0.001, 1, 5));

<img
  src={url}
  style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, transition: 'transform 0.1s' }}
  onWheel={onWheel}
  onPointerDown={startDrag}
/>
```

Use **CSS `transform`** (GPU-composited, no layout reflow), not width/height changes. Close on Escape, trap focus in the modal, restore focus when it closes. Pinch-to-zoom on mobile uses pointer events with two pointers.

</details>

### C5. How did voice upload work? Did you record from the microphone?

<details>
<summary>Answer</summary>

If you recorded in the browser, explain **MediaRecorder**:

```ts
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
const chunks: Blob[] = [];
recorder.ondataavailable = (e) => chunks.push(e.data);
recorder.onstop = () => {
  const blob = new Blob(chunks, { type: 'audio/webm' });
  setAudio({ blob, url: URL.createObjectURL(blob) });
  stream.getTracks().forEach(t => t.stop());   // turn off the mic indicator
};
recorder.start();
```

Points: needs **HTTPS** (or localhost) and user permission; handle "permission denied"; Safari supports different formats (mp4/aac), so check `MediaRecorder.isTypeSupported`.

If it was only *uploading* audio files, say that, and that recording would be the next step.

</details>

### C6. How did markdown file upload work? How did you render markdown safely?

<details>
<summary>Answer</summary>

Read the file with `await file.text()`, then either send it to the ingest API or render a preview with `react-markdown`.

**Safety:** markdown can contain raw HTML (`<img onerror=...>`), which is an XSS risk. `react-markdown` does **not** render raw HTML by default, which is safe. If you used `marked` + `dangerouslySetInnerHTML`, you must sanitize with **DOMPurify**. LLM output is untrusted input too, so the same rule applies to rendering assistant replies as markdown.

</details>

### C7. "Did research and implemented rich text formatting for input messages." What did you research and choose?

<details>
<summary>Model answer</summary>

Options you probably compared:

| Option | Pros | Cons |
| --- | --- | --- |
| Plain `<textarea>` + markdown syntax | Simple, light | Users must know markdown |
| `contentEditable` by hand | No dependency | Very buggy (cursor, paste, browser differences) |
| **Tiptap** (ProseMirror) | Headless, extensible, good React support | Larger bundle |
| **Lexical** (Meta) | Fast, modern, accessible | Newer, fewer plugins at the time |
| Slate / Draft.js | Flexible / older | Draft.js is unmaintained |
| Quill | Easy to start | Harder to customize in React |

> "I chose **[X]** because [we only needed bold/italic/lists/code, and it serialized to markdown/HTML that the backend accepted]."

Follow-ups: **sanitize pasted HTML** (users paste from Word or web pages), keyboard shortcuts (Ctrl+B), Enter to send vs Shift+Enter for a new line.

</details>

---

## D. Layout, components, config and theming

### D1. How did you build the responsive layout with the mobile navbar and sidebar?

<details>
<summary>Answer</summary>

CSS Grid for the shell (`grid-template-columns: 260px 1fr` on desktop), and on small screens the sidebar becomes an **off-canvas drawer** toggled by a hamburger button, with a backdrop. Media queries (or container queries) for breakpoints, `100dvh` instead of `100vh` so the mobile browser toolbar doesn't hide the input box, and the input fixed at the bottom with `position: sticky`. Accessibility: the toggle has `aria-expanded` and `aria-controls`, Escape closes the drawer, and focus moves into it.

</details>

### D2. How did you build reusable components like the tooltip and error modal?

<details>
<summary>Answer</summary>

- **Modal:** rendered with `createPortal` into `document.body` (escapes `overflow: hidden` and z-index issues), with focus trap, Escape to close, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and focus returned to the trigger on close. One global error modal fed by a context (`showError(message)`) so any component can trigger it.
- **Tooltip:** shows on hover **and focus** (keyboard users), `aria-describedby` linking it to the trigger, positioned with Floating UI or CSS, with a short delay to avoid flicker.

See [02-React/08-portals.md](../02-React/08-portals.md).

</details>

### D3. "Configured environment-based API setup and global theming." How?

<details>
<summary>Answer</summary>

- **API:** base URL from env variables (`VITE_API_URL` / `REACT_APP_API_URL`), one API module wrapping fetch/Axios, different `.env` files per environment.
- **Theming:** **CSS custom properties** on `:root`, with a dark theme overriding them under `[data-theme='dark']`. Toggle by setting the attribute on `<html>`, save the choice in `localStorage`, default to `prefers-color-scheme`.

```css
:root { --bg: #fff; --text: #111; --accent: #4f46e5; }
[data-theme='dark'] { --bg: #0f1115; --text: #e8e8e8; }
body { background: var(--bg); color: var(--text); }
```

Why CSS variables over JS themes: they change at runtime without re-rendering React, and work in plain CSS.

</details>

### D4. What's a web app manifest? Why update favicon and manifest?

<details>
<summary>Answer</summary>

`manifest.json` describes the app for installation (PWA): `name`, `short_name`, `icons` (several sizes), `theme_color`, `background_color`, `display: standalone`, `start_url`. Updating branding meant new icons in all sizes, the favicon, `theme_color`, and the `<title>`/meta tags. A full PWA also needs a service worker.

</details>

---

## E. Rapid-fire follow-ups

<details>
<summary>Short answers</summary>

- **How did you handle very large uploads?** Size limits, a progress bar, cancel via `AbortController`; for very large files, chunked or resumable uploads, or direct-to-S3 presigned URLs.
- **What does "ingest" do vs "send"?** Ingest = add a file's knowledge to the graph (slow, may be async with status polling). Send = ask a question.
- **How did you show long-running ingestion?** A status badge (uploading → processing → done/failed) with polling or a status endpoint.
- **What's hallucination, and how can the UI help?** The LLM making things up. The UI can show **sources/citations** (the graph nodes used), let users give feedback, and make clear the answer is AI-generated.
- **How would you test the chat?** RTL + MSW: type, press Enter, assert the user message appears, then the mocked reply; simulate a 500 and assert the Retry button; `jest.useFakeTimers` for debounce or retry delays.
- **Biggest challenge?** Pick one: async ordering/clear bugs, video previews leaking memory before revoking URLs, or auto-scroll fighting the user.

</details>
