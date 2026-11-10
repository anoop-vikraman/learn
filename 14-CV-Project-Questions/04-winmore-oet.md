# Winmore OET (Feb 2024 – Sep 2024)

> Cloud-based solutions for RFP and tender collaboration, customer solution onboarding and business process design.
>
> **Stack:** React, AWS, jQuery, Jest, mocking, CSS, HTML5, Git, JIRA

Your first project. Expect questions about **working in a large existing codebase**, **performance**, **testing** and **specific bugs you fixed**. For every bug bullet, be ready to explain **cause → how you found it → fix → how you prevented it coming back**.

---

## A. Overview

### A1. What was Winmore, and what was your role?

<details>
<summary>Model answer</summary>

> "Winmore is a SaaS platform for companies that respond to RFPs and tenders, for example logistics companies pricing freight bids. It has tools like a **Rule Builder** (configurable business rules), a **Record Builder** (custom data records and apps) and a **Price Inspector** table for reviewing and editing pricing.
>
> I joined an existing team and large codebase. I fixed bugs, wrote tests with Jest and RTL, improved list-rendering performance, worked on the AWS QuickSight integration and on build optimization through code splitting."

Know your **team size** and how work came to you (JIRA tickets, sprints).

</details>

### A2. How did you get productive in a large, unfamiliar codebase?

<details>
<summary>Answer</summary>

> "I started with small bug tickets, which forced me to trace data flow end to end. I used React DevTools to find which component rendered what, searched the code for UI text and API paths, read the existing tests to understand expected behaviour, and asked focused questions after trying first. I kept notes on the architecture, which I later shared with the next new joiner."

</details>

---

## B. List-rendering performance

### B1. "Fixed debugger list rendering issue in rule builder" and "enhanced the performance of list rendering". What was the problem and the fix?

<details>
<summary>Model answer (fill in your real cause)</summary>

Typical causes, pick the ones that applied:

| Symptom | Cause | Fix |
| --- | --- | --- |
| Items show wrong data after add/remove/reorder | `key={index}` | Stable `key={item.id}` |
| Whole list re-renders on every change | New object/function props each render; parent state too high | `React.memo` on rows + `useCallback`/`useMemo` for props; move state down |
| Slow with thousands of rows | All rows in the DOM | **Virtualization** (`react-window`, TanStack Virtual) |
| Lag while typing a filter | Filtering a big list on every keystroke | Debounce, `useMemo`, `useDeferredValue` |
| Expensive work in render | Sorting/formatting inside the row | Precompute once, memoize |

How you found it: **React DevTools Profiler** ("Highlight updates when components render"), flame graph showing which rows re-rendered and why.

> "In the Rule Builder debugger, the list used the array index as key, so when steps were added, React reused DOM nodes and rows showed the wrong state. I switched to stable IDs. I also wrapped rows in `React.memo` and stabilized the callbacks, which cut re-renders from every row to only the changed row."

</details>

### B2. Explain why index keys cause bugs.

<details>
<summary>Answer</summary>

React matches old and new children **by key**. If you delete item 0, every item's index shifts, so React thinks item 1 *is* the old item 0 and reuses its DOM and **its state** (input values, checkbox state, focus). Index keys are only safe for static lists that never reorder, insert or delete. See [02-React](../02-React/) for the full explanation.

</details>

### B3. How does virtualization work?

<details>
<summary>Answer</summary>

Only render the rows **visible in the viewport** (plus a small overscan). A tall spacer element keeps the scrollbar correct, and rows are absolutely positioned at `index * rowHeight`. 10,000 rows become about 20 DOM nodes. Trade-offs: variable row heights need measuring, Ctrl+F browser search won't find off-screen rows, and accessibility needs care (`aria-rowcount`, `aria-rowindex`).

</details>

---

## C. AWS QuickSight integration

### C1. What is QuickSight, and how did you integrate it?

<details>
<summary>Model answer</summary>

> "**Amazon QuickSight** is AWS's BI/dashboard service. We **embedded QuickSight dashboards** inside the Apps section of the Record Builder, so users saw analytics without leaving Winmore."

How embedding works:
1. The **backend** calls the QuickSight API (`GenerateEmbedUrlForRegisteredUser` / `…ForAnonymousUser`) with AWS credentials and gets a **short-lived embed URL**. AWS credentials never touch the browser.
2. The frontend gets that URL from our API and renders it with the **`amazon-quicksight-embedding-sdk`** into a container div (an iframe under the hood).
3. Handle loading, errors and expired URLs (fetch a new one), resize to fit the container, and pass parameters/filters (e.g. the current record ID) to the dashboard.

```ts
import { createEmbeddingContext } from 'amazon-quicksight-embedding-sdk';

useEffect(() => {
  let cancelled = false;
  (async () => {
    const { embedUrl } = await api.getQuicksightUrl(dashboardId);
    if (cancelled) return;
    const ctx = await createEmbeddingContext();
    await ctx.embedDashboard({ url: embedUrl, container: ref.current!, height: '700px' },
                             { parameters: [{ Name: 'recordId', Values: [recordId] }] });
  })();
  return () => { cancelled = true; };
}, [dashboardId, recordId]);
```

</details>

### C2. "Rewrote unit tests and schema to cope with QuickSight integration." What does that mean?

<details>
<summary>Answer</summary>

> "Adding QuickSight as a new app type changed the **app configuration schema** (a new type with fields like dashboard ID and parameters), so I updated the schema/validation and its types. Existing tests broke because they assumed the old set of app types, so I updated them and added new ones. I **mocked the embedding SDK** in Jest, since it needs a real browser iframe and network."

```ts
jest.mock('amazon-quicksight-embedding-sdk', () => ({
  createEmbeddingContext: jest.fn().mockResolvedValue({ embedDashboard: jest.fn().mockResolvedValue({}) }),
}));
```

</details>

### C3. Iframe security questions

<details>
<summary>Answers</summary>

- The embedding domain must be **allow-listed** in QuickSight.
- Embed URLs are short-lived and single-use; don't cache or log them.
- `sandbox` and `allow` attributes restrict what an iframe can do; `postMessage` is the safe way to talk to it (always check `event.origin`).
- `X-Frame-Options` / CSP `frame-ancestors` control who may embed *your* app.

</details>

---

## D. Code splitting and build optimization

### D1. "Worked on build optimization where code splitting had to be done for faster loading." What did you split, and how?

<details>
<summary>Model answer with code</summary>

```tsx
const RuleBuilder = lazy(() => import('./pages/RuleBuilder'));
const PriceInspector = lazy(() => import('./pages/PriceInspector'));

<Suspense fallback={<PageSkeleton />}>
  <Routes>
    <Route path="/rules" element={<RuleBuilder />} />
    <Route path="/pricing" element={<PriceInspector />} />
  </Routes>
</Suspense>
```

- **Route-level splitting** first: the biggest win for the least effort.
- **Heavy components** (charts, editors, the QuickSight SDK) loaded only when opened.
- **Vendor chunk** splitting with Webpack `splitChunks` so library code is cached separately from app code that changes often.
- Measured with **webpack-bundle-analyzer** / `source-map-explorer`, before and after. Have a number ready: "initial bundle went from [X] MB to [Y] MB" or "load time improved by [Z]%".
- Also checked: replacing big libraries (moment → date-fns), importing lodash per function, removing unused dependencies.

</details>

### D2. Follow-ups on code splitting

<details>
<summary>Answers</summary>

- **What does `import()` do?** The bundler creates a separate chunk, downloaded only when the import runs. It returns a promise.
- **Downsides?** A loading delay when navigating. Fix with **prefetching** on hover or idle (`/* webpackPrefetch: true */`), and good skeletons.
- **Chunk fails to load after a deploy** (old chunk names deleted)? Catch the error in an error boundary and reload the page once.
- **Tree shaking vs code splitting?** Tree shaking *removes* unused code; code splitting *divides* used code into chunks loaded later.

See [06-Build-Tools](../06-Build-Tools/).

</details>

---

## E. Fetching a JSON config from S3

### E1. "Added a fetch call that downloads a JSON config with generic block properties from S3 when Rule Builder loads." Why put config in S3, and what did you have to handle?

<details>
<summary>Model answer</summary>

**Why:** block definitions (types, default properties, labels) could be changed **without a frontend redeploy**: update the JSON in S3 and every user gets it.

What to handle:
- **Loading state**: the Rule Builder can't render blocks until the config arrives, so show a skeleton.
- **Errors**: show a retry, or fall back to a bundled default config.
- **Validation**: don't trust the shape; check it (a schema check or type guards) before using it.
- **Caching**: S3/CloudFront cache headers; add a version or `?v=` so updates aren't stuck in cache; fetch once per session (module-level cache or TanStack Query with a long `staleTime`).
- **CORS**: the S3 bucket needs a CORS configuration allowing our origin.
- **Race condition**: if the user leaves before it loads, abort or ignore the result.

```ts
const { data: blockConfig, isLoading, error } = useQuery({
  queryKey: ['rule-builder-config'],
  queryFn: () => fetch(CONFIG_URL).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
  staleTime: Infinity,
});
```

</details>

---

## F. Price Inspector table: inline edit

### F1. "Created a replacement for Tether in the dropdown used in inline edit." What is Tether, and why replace it?

<details>
<summary>Model answer</summary>

**Tether** (`tether.js` / `react-tether`) is an old library for **positioning an element relative to another** (dropdowns, tooltips). It's **unmaintained** and had problems with React versions, with scrolling inside tables, and with bundle size.

A dropdown inside a table cell has two problems:
1. **Clipping**: the table container has `overflow: auto`, so a dropdown inside it gets cut off.
2. **Positioning**: it must follow the cell when the table scrolls and flip upward near the bottom of the screen.

The replacement:
- Render the menu in a **portal** (`createPortal` into `document.body`), so overflow can't clip it.
- Position it with **Floating UI** (the successor to Popper.js) or by hand with `getBoundingClientRect()` of the cell, updating on scroll and resize.
- **Flip** when there isn't space below; close on outside click and Escape.

```tsx
const { refs, floatingStyles } = useFloating({
  placement: 'bottom-start',
  middleware: [offset(4), flip(), shift()],
  whileElementsMounted: autoUpdate,       // repositions on scroll/resize
});

<td ref={refs.setReference}>…</td>
{open && createPortal(<ul ref={refs.setFloating} style={floatingStyles} role="listbox">…</ul>, document.body)}
```

*(If you hand-wrote positioning instead of using Floating UI, explain your logic: `getBoundingClientRect`, scroll listeners, flipping.)*

**Gotcha with portals:** a click inside the portal counts as "outside" the cell in DOM terms, so outside-click detection must check both the cell and the menu. React synthetic events still bubble through the React tree, though.

</details>

### F2. "Solved issues regarding dropdown in inline edit." What kind of issues are typical?

<details>
<summary>Answer</summary>

Pick the real ones:
- The dropdown closing when its scrollbar was clicked (blur fired first). Fix: `onMouseDown={e => e.preventDefault()}` on the menu, or check `relatedTarget` in `onBlur`.
- The selected value not saved because the cell left edit mode before `onChange` ran (blur vs click ordering).
- The menu staying open, or in the wrong place, when the table scrolled.
- Keyboard: arrow keys moving the table cursor instead of the dropdown option. Fix: `stopPropagation` while the menu is open.
- z-index stacking under sticky table headers.

</details>

### F3. How did you implement Tab navigation in inline edit?

<details>
<summary>Model answer</summary>

Goal: like a spreadsheet, **Tab** saves the current cell and moves to the next editable cell, **Shift+Tab** goes back, wrapping to the next/previous row.

```ts
function onKeyDown(e: KeyboardEvent, row: number, col: number) {
  if (e.key !== 'Tab') return;
  e.preventDefault();                         // stop the browser's default focus jump
  commitEdit(row, col);
  const next = e.shiftKey ? prevEditable(row, col) : nextEditable(row, col);
  if (next) setEditing(next);                 // { row, col }; the cell focuses its input on mount
}

function nextEditable(row: number, col: number) {
  for (let r = row, c = col + 1; r < rows.length; r++, c = 0) {
    for (; c < columns.length; c++) if (columns[c].editable) return { row: r, col: c };
  }
  return null;
}
```

- Focus the new input on mount (`autoFocus` or a ref + `useEffect`), and select its text.
- **Enter** = save and move down, **Escape** = cancel.
- Skip read-only columns; scroll the new cell into view (`scrollIntoView({ block: 'nearest' })`).
- If validation fails, stay in the cell and show the error.

</details>

### F4. "Solved data updating issues with the currency field." What goes wrong with currency inputs?

<details>
<summary>Answer: pick the real cause</summary>

- **Formatted string vs number:** the input shows `1,234.50` but the state needs `1234.5`. Saving the formatted string, or `parseFloat('1,234.50') === 1`, breaks data. Keep the **raw number in state** and format only for display; format on blur, show raw while editing.
- **Cursor jumping** when re-formatting on every keystroke (commas inserted shift the caret).
- **Float precision:** `0.1 + 0.2`; store minor units or round to 2 decimals.
- **Locale:** `1.234,50` in Europe; use `Intl.NumberFormat` and a matching parser.
- **Stale update:** the edit saved the old value because state was read in a stale closure or the blur handler ran before the state update. Use the event's value or a functional update.
- **Empty vs zero:** clearing the field should be `null`, not `0`.
- **Currency change** in the same row not recalculating converted totals.

> "The bug was [X]. I fixed it by keeping the numeric value separate from the display string, parsing on blur, and added tests for '1,234.56', empty input and negative values."

</details>

### F5. "Rectified an issue where the weight break column's segment name does not get rendered." How would you debug a "value not showing" bug?

<details>
<summary>Answer: show your method</summary>

1. **Network tab:** is the value in the API response? If not, it's a backend issue.
2. **React DevTools:** does the component receive it as a prop or state? If not, look at the mapping/transform in between.
3. If the prop is there but not displayed: check the render logic (wrong field name, `value && …` hiding `0`, column config key mismatch, memoized component not updating because of mutation).

> "In my case [the column definition looked up the segment by the wrong key / the data was mutated in place so `memo` skipped the re-render / the name was nested one level deeper for weight-break columns]. I fixed it and added a test rendering a weight-break column with a segment name."

**Weight breaks** (logistics pricing): price tiers based on shipment weight, e.g. 0–45 kg, 45–100 kg, 100+ kg, each a column with its own rate.

</details>

---

## G. Testing and validation

### G1. "Wrote test cases using RTL and Jest." What's your testing approach?

<details>
<summary>Answer</summary>

Test **behaviour as the user sees it**, not implementation: query by role/label/text, interact with `userEvent`, assert what appears on screen. Mock the network (Jest mocks or MSW), not internal functions. Query priority: `getByRole` > `getByLabelText` > `getByText` > `getByTestId`. See [05-Testing](../05-Testing/).

</details>

### G2. "Implemented validation for newly added fields." How do you approach validation?

<details>
<summary>Answer</summary>

Validate **on blur** (not every keystroke) and on submit; show messages next to the field, linked with `aria-describedby`, with `aria-invalid`; disable submit or block it with focus moved to the first error. Validation rules live in one schema shared by the form. The backend validates again because client validation can be bypassed.

</details>

### G3. jQuery is in your Winmore stack. Why, and how does it fit with React?

<details>
<summary>Answer</summary>

> "Parts of the legacy app or some third-party widgets used jQuery. Mixing it with React is risky because **both try to control the same DOM**. React doesn't know about jQuery's changes and can overwrite them, or crash when nodes it expects have been moved."

Safe pattern: give jQuery a DOM node React **never touches**, set it up in `useEffect`, and clean up on unmount:

```tsx
function LegacyWidget({ options }) {
  const ref = useRef(null);
  useEffect(() => {
    const $el = $(ref.current).legacyPlugin(options);
    return () => $el.legacyPlugin('destroy');
  }, [options]);
  return <div ref={ref} />;                 // React renders nothing inside it
}
```

Long term: replace jQuery widgets with React components (the Tether replacement was part of that kind of cleanup).

</details>

---

## H. Rapid-fire follow-ups

<details>
<summary>Short answers</summary>

- **Which AWS services did you touch?** S3 (config files), QuickSight (embedded dashboards), [CloudFront / Cognito / Lambda: only if true]. Know the one-line purpose of each.
- **What's mocking, and when do you avoid it?** Replacing a real dependency with a fake in tests. Avoid mocking the thing you're testing, or so much that the test only checks the mocks.
- **What did you learn on Winmore?** Reading a large codebase, debugging with DevTools/Profiler, writing tests that don't break on refactors, measuring before optimizing.
- **Hardest bug?** Pick one of the inline-edit bugs and tell it in STAR form (see [06-behavioral-stories-from-cv.md](06-behavioral-stories-from-cv.md)).

</details>
