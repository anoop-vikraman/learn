# CV overview: intro, timeline and tricky questions

## Your timeline at a glance

| Period | Project | Main themes |
| --- | --- | --- |
| Feb 2024 – Sep 2024 | Winmore OET | Bug fixing, RTL/Jest tests, list performance, AWS QuickSight, code splitting, inline-edit table |
| *(Sep 2024 – Apr 2025)* | *Not on the CV: be ready to explain this period* | |
| Apr 2025 – Sep 2025 | Multimodal Knowledge Graph | LLM chat UI, multimodal uploads, async state |
| Sep 2025 – Jul 2026 | Procurement Phase 2 | Owner of modules, SSO, architecture, CI/CD, Storybook, 80% coverage |

The story the CV tells: **started as a contributor fixing bugs and writing tests → built a full UI on my own → owned modules and frontend architecture.** Use that arc in your intro.

---

## 1. Tell me about yourself.

<details>
<summary>Model answer (about 90 seconds)</summary>

> "I'm a frontend developer at QBurst with about **[X] years** of experience, mainly in **React and TypeScript**.
>
> Most recently I worked on **Procurement Phase 2**, a rebuild of our organization's procurement tool covering purchase requests, multi-level approvals and expense recording, integrated with our accounting system. I owned the frontend for the **Vendor Management, Provision Entry and Non-PO Bill** modules, and I also set up shared pieces: the **Axios API layer**, **Keycloak SSO**, **feature flags** and **multi-environment builds**. We kept test coverage above 80% with Jest and RTL and documented components in Storybook.
>
> Before that I built the frontend for an **LLM-based knowledge-graph app**: a chat interface where users upload text, images, video and audio and query the graph in natural language.
>
> I started on **Winmore**, an AWS-based RFP/tender platform, where I learned a lot about performance, testing and working in a large existing codebase.
>
> I'm now looking for a role where I can **[own features end-to-end at larger scale / go deeper into frontend architecture / work on a product]**, and **[specific reason this company fits]**."

Present → past → future. Don't list every technology; the CV already does that.

</details>

## 2. Walk me through your most challenging project.

<details>
<summary>How to answer</summary>

Pick **Procurement Phase 2**. Structure:

1. **Business problem**, one line: "The old procurement tool was slow and disconnected from accounting; finance re-entered data by hand."
2. **Your scope:** three modules + shared infrastructure.
3. **One hard technical problem, in depth.** Good choices:
   - Dynamic tax calculation in a complex form (correctness + performance)
   - Keycloak SSO with a legacy-login fallback (auth edge cases)
   - PDF viewer with coordinate-based extraction (unusual, memorable)
4. **Result:** coverage > 80%, modules shipped, [any number: time saved, bugs reduced, users onboarded].
5. **What you'd do differently**, which shows maturity: "I'd have introduced TanStack Query from day one instead of [hand-rolled fetching]" or "I'd agree the API contracts with OpenAPI earlier."

</details>

## 3. What's the gap between Sep 2024 and Apr 2025?

<details>
<summary>How to answer</summary>

There is no project listed for about 7 months. Interviewers *will* notice. Prepare a short, honest answer:

- Internal project / bench time: "I was on [internal tool / R&D / training], working on [X]." If you used that time to learn TypeScript, Zustand, TanStack Query or FastAPI, say so; it explains why those appear in your skills.
- Or a short project not worth listing: "I was on a short engagement doing [X]; I left it off to keep the CV focused."

Keep it to two sentences and steer back to what you learned. Consider adding the period to the CV so the question doesn't come up at all.

</details>

## 4. Your CV says "Multimodel knowledge graph". Is that a typo?

<details>
<summary>Note</summary>

The right term is **multimodal** (multiple *modes* of input: text, image, audio, video), not "multimodel". The description itself says "multimodal LLMs". **Fix it on the CV.** If asked: "Yes, multimodal. The app accepts text, images, audio and video and sends them to multimodal LLMs."

</details>

## 5. You list both Formik and React Hook Form for the same project. Why both?

<details>
<summary>Model answer</summary>

Adjust to what really happened. A plausible, honest answer:

> "The legacy screens were built with Formik. New modules used React Hook Form because it uses uncontrolled inputs and re-renders far less on big forms like the Non-PO Bill with many line items. We migrated screen by screen rather than rewriting everything. Yup schemas worked with both (`yupResolver` for RHF), so validation rules carried over."

If you only used one of them, remove the other from the CV.

</details>

## 6. You list Python, SQL and FastAPI, but none of your projects use them. How strong are you there?

<details>
<summary>How to answer</summary>

Be honest about the level:

> "My professional work is frontend. I've used Python and FastAPI for [personal projects / building mock APIs / understanding what our backend team builds], and SQL for [querying data while debugging / a side project]. It helps me read backend code and discuss API contracts. I wouldn't call myself a backend developer."

Then be ready for one basic question on each (see [05-skills-section.md](05-skills-section.md)).

</details>

## 7. "Skilled in creating software solutions within a Linux environment." What does that mean in practice?

<details>
<summary>Model answer</summary>

> "I develop on Linux day to day: terminal-based git, npm scripts, environment variables, debugging ports and processes (`lsof -i :3000`, `kill`), reading logs, SSH into servers, file permissions, and shell scripts for builds. Our CI/CD runners were Linux containers too, so I'm comfortable debugging pipeline failures there."

Possible follow-ups: `chmod 755` meaning, `grep -r`, finding which process holds a port, difference between `export VAR=x` and `VAR=x cmd`.

</details>

## 8. What does "UI/UX Design" on your skills list mean? Do you design?

<details>
<summary>Model answer</summary>

> "I'm not a designer, but I work closely with them. I turn Figma designs into components, point out missing states (loading, empty, error, disabled), suggest UX improvements for complex flows like multi-level approvals, and care about accessibility and responsive layouts. On the knowledge-graph project there was no dedicated designer early on, so I made layout and theming decisions myself."

</details>

## 9. Rate yourself in React / JavaScript / TypeScript out of 10.

<details>
<summary>How to answer</summary>

Never say 10. Say **7–8** and justify it: "8 in React: comfortable with hooks, performance, architecture and testing; I'm still deepening Server Components and concurrent features." Then expect a hard question to test it.

</details>

## 10. Why are you looking to leave? / Why this company?

<details>
<summary>How to answer</summary>

Positive, forward-looking, never negative about QBurst:

> "I've grown a lot at QBurst, from bug fixes to owning modules and setting up architecture. I'd now like [a product company / larger scale / deeper ownership / a specific domain], and [this company's product / stack / engineering culture] matches that."

</details>

## 11. Questions to prepare about the CV itself

- How big was each team? Who did you report to? How many frontend devs?
- What was the backend stack? (You integrated with it.)
- How long were sprints? How did releases work?
- What was the hardest bug on each project?
- What did you learn from each project?

Write a one-line answer to each now. These come up as quick follow-ups.
