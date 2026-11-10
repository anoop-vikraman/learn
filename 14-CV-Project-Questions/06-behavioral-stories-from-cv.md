# Behavioral stories built from your CV

Most behavioral questions can be answered with one of these six stories. Each one comes from a CV bullet, so it also backs up your CV.

**Before the interview: replace every `[bracket]` with what really happened, and add a number to each Result.** A story with a real number and a real lesson beats a perfect-sounding one.

| Question type | Use story |
| --- | --- |
| Tell me about a technical challenge | 1 (tax calculation) or 3 (SSO) |
| Ownership / initiative | 2 (API layer + feature flags) |
| A bug you're proud of fixing | 4 (inline edit / currency) |
| Performance improvement | 5 (list rendering + code splitting) |
| Working with others / disagreement | 6 (API contracts with backend) |
| Learning something quickly | 3 (Keycloak) or the rich text research |
| Mistake / failure | Story 7 template |

---

## Story 1: Dynamic tax calculation (technical challenge)

- **S:** In Procurement Phase 2, the Non-PO Bill form had many line items, each with its own tax rule depending on the vendor's state, tax code and [TDS category]. Finance needed totals that matched the accounting system to the paisa.
- **T:** I owned the module and had to make the calculation correct, instant to update, and easy to change when rules changed.
- **A:** I moved all tax logic into **pure functions** outside the components and sat with finance to write down [N] real scenarios, which became a **table-driven test suite**. In the form I used React Hook Form with `useFieldArray` and `useWatch`, so only the totals area re-rendered instead of the whole form. I agreed **rounding rules** with finance and made the backend the source of truth, showing a warning if totals differed.
- **R:** [Zero tax-mismatch bugs reported after release / the form stayed responsive with 50+ line items / a new tax rule took one function + one test row]. Lesson: get domain rules written down as test cases *before* coding.

## Story 2: Shared API layer and feature flags (ownership)

- **S:** Early on, each module called the API in its own way: tokens attached by hand, different error handling, base URLs hard-coded.
- **T:** Nobody was assigned to it, but it was slowing everyone down, so I proposed fixing it.
- **A:** I built a central **Axios instance with interceptors** for tokens (including a single shared token refresh), one normalized error shape and global error messages. When modules started shipping at different times, I added a **typed feature-flag config** that drove routes, menu items and UI guards from one place. I documented both and walked the team through them.
- **R:** [Removed ~N lines of duplicated code / new modules plugged in with no auth code / staging could show unfinished modules safely]. Lesson: small shared infrastructure early saves a lot later.

## Story 3: Keycloak SSO with legacy fallback (learning fast / ambiguity)

- **S:** We had to move to company-wide SSO with Keycloak, but [not all users were migrated / some environments had no Keycloak yet].
- **T:** Implement SSO without locking anyone out.
- **A:** I learned OIDC and the Authorization Code + PKCE flow, built a spike first, then designed a **common auth interface** with two implementations (Keycloak and legacy login), chosen by config. I handled token refresh, logout across apps, and the React StrictMode double-initialization bug.
- **R:** [Rolled out to N users with no login incidents / legacy path removed in a later release with a one-line config change]. Lesson: put risky integrations behind an interface so you can switch safely.

## Story 4: Inline-edit bugs in the Price Inspector (debugging)

- **S:** On Winmore, users reported that currency values in the Price Inspector table sometimes didn't save, and the inline dropdown got clipped and misplaced inside the scrolling table.
- **T:** Find and fix the root causes, not just the symptoms.
- **A:** I reproduced the bug and found [the blur handler committed the old value before the state update / the formatted string was parsed incorrectly]. I separated the **numeric value from the display string**, parsing on blur. For the dropdown, I replaced the unmaintained **Tether** library with a **portal + positioning** approach that flips near the screen edge, and added **Tab navigation** between editable cells. I wrote tests for each case.
- **R:** [The bug tickets closed and didn't reopen / editing became faster for users who now used Tab]. Lesson: reproduce first, and write the test that fails before fixing.

## Story 5: Performance (list rendering + code splitting)

- **S:** On Winmore, the Rule Builder debugger list was [slow / showing wrong rows], and the initial bundle was [X MB], so first load was slow.
- **T:** Improve rendering and load time.
- **A:** I used the **React DevTools Profiler** and found [index keys and unstable props re-rendering every row]. I switched to stable keys, memoized rows and stabilized callbacks. For load time I measured with **bundle analyzer**, then added **route-level lazy loading** and split out heavy libraries.
- **R:** [Re-renders per change dropped from all rows to one / initial bundle went from X to Y MB / load time improved by Z%]. Lesson: measure before and after; the cause is rarely where you first guess.

## Story 6: Agreeing API contracts with the backend (collaboration / disagreement)

- **S:** For the approval workflow, the first API design returned only the request status, and the frontend would have had to work out who could approve, reject or send back.
- **T:** Avoid duplicating permission logic in the UI.
- **A:** I explained the risk (two copies of the rules that would drift apart, plus a security gap) and proposed the API return `allowedActions` for the current user. I mocked the proposed response with **MSW** so we could see it working before the backend changed. We discussed it in [a short call] and the backend lead agreed.
- **R:** [The UI logic became simpler / no permission mismatches in QA]. Lesson: propose a concrete alternative, show it working, and keep the focus on the product, not on being right.

## Story 7: A mistake (template, fill with a real one)

Interviewers want ownership and a lesson, not a perfect record.

- **S:** [e.g. "I merged a change to the shared API interceptor that broke file uploads in another module."]
- **T:** Fix it quickly and make sure it couldn't happen again.
- **A:** [Owned it in standup, rolled back / hotfixed within N hours, found the cause (the interceptor forced a JSON content type), added a test covering multipart uploads.]
- **R:** [No user impact beyond QA / added a checklist item for shared-code changes.] Lesson: [changes to shared code need tests from every consumer's point of view.]

---

## Other behavioral questions your CV invites

<details>
<summary>"You've worked on three very different projects. How do you adapt?"</summary>

"Each time I spend the first week reading code, running the app and fixing small tickets to learn the domain. Fundamentals carry over (React patterns, testing, debugging); the domain (finance, logistics pricing, LLMs) I learn by talking to the people who use it."

</details>

<details>
<summary>"How do you handle unclear requirements?" (financial scenarios, research project)</summary>

"I ask for concrete examples, write them down as scenarios or test cases, confirm them with the product owner or finance, and build the simplest version first so feedback comes early."

</details>

<details>
<summary>"How do you balance quality (80% coverage, Storybook) with deadlines?"</summary>

"Tests on the risky parts (money, permissions, auth) aren't optional. Simpler UI gets lighter tests. If a deadline forces a shortcut, I make it visible with a ticket so it's paid back, not forgotten."

</details>

<details>
<summary>"What are you learning now?" / "Where do you see yourself in 3 years?"</summary>

Link it to your CV direction: deeper frontend architecture, design systems, performance, possibly full-stack with the FastAPI/Python you've started. Name one concrete thing you're learning this month.

</details>

<details>
<summary>"Do you have questions for us?"</summary>

Always ask 2–3: How is the frontend team structured? How do you share components (design system/Storybook)? What does the release process look like? What would success look like in my first 90 days? See [13-Behavioral-Final-Checklist](../13-Behavioral-Final-Checklist/) for more.

</details>
