# 04 · Server Actions and forms

## 1. What a Server Action is

> **In short:** A function marked `'use server'` that runs on the server but can be called directly from client code — Next.js turns it into an automatic POST endpoint.

```tsx
// app/tasks/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';

export async function createTask(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;
  await db.task.create({ data: { title } });
  revalidatePath('/tasks');
}
```

```tsx
// app/tasks/page.tsx — a Server Component
import { createTask } from './actions';

export default function Page() {
  return (
    <form action={createTask}>
      <input name="title" required />
      <button type="submit">Add task</button>
    </form>
  );
}
```

This form **works without JavaScript** (progressive enhancement): the browser posts it, the server runs the action and re-renders. With JS enabled, Next.js intercepts it and updates the page without a reload.

## 2. Where to declare them

> **In short:** Either put `'use server'` at the top of a file of actions (recommended), or inline it inside a Server Component function.

```ts
// A file of actions — importable from Client Components too
'use server';
export async function createTask(fd: FormData) { /* … */ }
export async function deleteTask(id: string) { /* … */ }
```

```tsx
// Inline in a Server Component (handy for closing over data)
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  async function toggle() {
    'use server';
    await db.task.update({ where: { id }, data: { done: true } });
    revalidatePath(`/tasks/${id}`);
  }

  return <form action={toggle}><button>Done</button></form>;
}
```

⚠️ Closed-over values (`id` above) are **encrypted and sent to the client**, then back with the request. Don't close over secrets.

## 3. Validation and typed results with `useActionState`

> **In short:** Return a state object from the action and render errors with `useActionState`, which also gives you a pending flag.

```ts
// app/tasks/actions.ts
'use server';
import { z } from 'zod';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  priority: z.coerce.number().int().min(1).max(5).default(3),
});

export type FormState = { ok: boolean; errors?: Record<string, string[]>; message?: string };

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();                              // auth check INSIDE the action
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }
  try {
    await db.task.create({ data: { ...parsed.data, ownerId: user.id } });
  } catch {
    return { ok: false, message: 'Could not save the task. Please try again.' };
  }
  revalidatePath('/tasks');
  return { ok: true };
}
```

```tsx
// app/tasks/TaskForm.tsx
'use client';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createTask, type FormState } from './actions';

const initial: FormState = { ok: false };

export function TaskForm() {
  const [state, formAction, isPending] = useActionState(createTask, initial);

  return (
    <form action={formAction}>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" aria-invalid={!!state.errors?.title} aria-describedby="title-error" />
      {state.errors?.title && <p id="title-error" role="alert">{state.errors.title[0]}</p>}

      <SubmitButton />
      {state.message && <p role="alert">{state.message}</p>}
      {state.ok && <p role="status">Saved</p>}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();        // must be INSIDE the <form>
  return <button disabled={pending}>{pending ? 'Saving…' : 'Add task'}</button>;
}
```

| Hook | Gives you | Note |
| --- | --- | --- |
| `useActionState(action, initialState)` | `[state, formAction, isPending]` | The action's first arg becomes the previous state |
| `useFormStatus()` | `{ pending, data, method, action }` | Only works in a component **inside** the form |
| `useOptimistic(state, reducer)` | `[optimisticState, addOptimistic]` | Instant UI feedback, auto-reverted on failure |

## 4. Optimistic updates

> **In short:** `useOptimistic` shows the expected result immediately and rolls back automatically if the action fails.

```tsx
'use client';
import { useOptimistic, startTransition } from 'react';

export function TaskList({ tasks }: { tasks: Task[] }) {
  const [optimisticTasks, addOptimistic] = useOptimistic(
    tasks,
    (current, newTask: Task) => [...current, newTask],
  );

  async function action(formData: FormData) {
    const title = String(formData.get('title'));
    startTransition(() => {
      addOptimistic({ id: 'temp', title, done: false } as Task);
    });
    await createTask(formData);                 // on error, React reverts to `tasks`
  }

  return (
    <>
      <form action={action}><input name="title" /><button>Add</button></form>
      <ul>{optimisticTasks.map((t) => <li key={t.id} style={{ opacity: t.id === 'temp' ? 0.5 : 1 }}>{t.title}</li>)}</ul>
    </>
  );
}
```

## 5. Calling actions outside forms

> **In short:** Actions are just functions — call them from an event handler inside `startTransition`, or bind arguments with `.bind`.

```tsx
'use client';
import { useTransition } from 'react';

export function DeleteButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await deleteTask(id); })}
    >
      {isPending ? 'Deleting…' : 'Delete'}
    </button>
  );
}
```

```tsx
// Bind extra arguments and keep the no-JS form working
<form action={deleteTask.bind(null, task.id)}>
  <button>Delete</button>
</form>
```

⚠️ Don't put IDs in hidden inputs if the user shouldn't control them — a client can change them. Either bind them server-side or re-check ownership in the action.

## 6. Security

> **In short:** Every Server Action is a public HTTP endpoint — authenticate, authorise and validate inside the action itself, never relying on the UI that called it.

```ts
'use server';

export async function deleteTask(id: string) {
  const user = await requireUser();                        // 1. authentication
  const task = await db.task.findUnique({ where: { id } });
  if (!task || task.ownerId !== user.id) throw new Error('Not found');   // 2. authorisation
  const parsed = z.string().uuid().safeParse(id);          // 3. validation
  if (!parsed.success) throw new Error('Invalid id');
  await db.task.delete({ where: { id } });
  revalidatePath('/tasks');
}
```

Checklist:
- **Auth in every action.** Hiding the button is UI, not security.
- **Validate every input** with Zod; never trust `formData`.
- Check **ownership** of the record (BOLA/IDOR is the most common API flaw).
- Rate-limit sensitive actions (login, password reset, anything expensive).
- Next.js protects against CSRF by checking `Origin`/`Host` on action POSTs, and action IDs are non-guessable — but that doesn't replace authorisation.
- Don't return internal error details; log them and return a generic message.

## 7. Redirects and cookies after a mutation

> **In short:** Call `redirect()` after a successful action (outside any try/catch) and set cookies with the `cookies()` API.

```ts
'use server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export async function login(_prev: State, formData: FormData) {
  const result = await verifyCredentials(formData);
  if (!result.ok) return { error: 'Invalid email or password' };

  const cookieStore = await cookies();                      // async in Next 15
  cookieStore.set('session', result.token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7,
  });

  redirect('/dashboard');                                   // throws — must be outside try/catch
}
```

## 8. Revalidating after mutations

> **In short:** After writing data, call `revalidatePath` or `revalidateTag` so the server caches and the client Router Cache both refresh.

```ts
revalidatePath('/tasks');              // one route
revalidatePath('/tasks/[id]', 'page'); // a dynamic route pattern
revalidatePath('/', 'layout');         // everything under a layout
revalidateTag('tasks');                // every fetch tagged 'tasks'
```

Without this, the user submits a form and sees the old list — the single most common Server Action bug.

## 9. Server Actions vs Route Handlers

> **In short:** Use Server Actions for your own app's mutations; use Route Handlers for public APIs, webhooks, and non-React clients.

| | Server Action | Route Handler (`route.ts`) |
| --- | --- | --- |
| Called by | Your React app (forms, handlers) | Anything: mobile apps, webhooks, curl |
| Shape | A function with typed args | HTTP request/response |
| Progressive enhancement | ✅ works without JS | ❌ |
| Good for | Create/update/delete in the app | Public API, webhooks, file downloads, OAuth callbacks, SSE |

## 10. Forms with React Hook Form

> **In short:** For complex client-side forms, keep React Hook Form for the UX and call the Server Action in `onSubmit` — sharing one Zod schema for both sides.

```tsx
'use client';
const form = useForm<CreateTask>({ resolver: zodResolver(schema) });

const onSubmit = form.handleSubmit(async (values) => {
  const result = await createTaskFromObject(values);        // a Server Action taking a plain object
  if (!result.ok) form.setError('root', { message: result.message });
});
```

You lose no-JS support but gain live validation — a reasonable trade for logged-in dashboards.

---

## 11. Exercises

1. Build an "add task" form with a Server Action; disable JS in DevTools and confirm it still works.
2. Add Zod validation and field errors with `useActionState`, plus a `useFormStatus` submit button.
3. Add optimistic insert with `useOptimistic`; make the action throw and watch it revert.
4. Add a delete button that calls the action from `startTransition`.
5. Add an ownership check and prove another user's ID can't delete your task (call the action's endpoint manually).
6. Forget `revalidatePath`, see the stale list, then add it back.
