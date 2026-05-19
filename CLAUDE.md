# Gold List Plus — Working Notes for Claude

## What this project is

A Progressive Web App that implements the **Gold List Method** of language learning with **Anki-style flashcards used only as the testing mechanism** during distillation reviews. Static site, deploys to GitHub Pages, fully offline, no backend ever.

Read first, in this order:
1. [docs/PRD.md](docs/PRD.md) — what the product does and why. Includes a "sacred rules" section that overrides everything else.
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, module map, layering rules, ADRs, dependency ledger.
3. [docs/TASKS.md](docs/TASKS.md) — the work queue with explicit acceptance criteria per task.

## Working methodology — five subagents (use them)

Every meaningful piece of work flows through these subagents in order:

1. **`product-designer`** — owns `docs/PRD.md`. Clarifies requirements, surfaces questions.
2. **`tech-lead`** — owns `docs/ARCHITECTURE.md` and `docs/TASKS.md`. Translates PRD changes into ADRs and tasks with AC.
3. **`qa-engineer`** — writes failing tests for a task's AC (Red phase). Confirms Red via `npm run test`.
4. **`implementer`** — writes the minimum code to make the tests pass (Green phase). No scope creep.
5. **`code-reviewer`** — review-only. Verifies against PRD + AC + ARCHITECTURE. Approves or kicks back.

After Code Reviewer approves, the work returns through **QA → Tech Lead → Product Designer** for a final sanity check. Any agent may kick work back to a previous step with a written reason.

Definitions live in [.claude/agents/](.claude/agents/). They auto-load at session start; you can dispatch via the Agent tool.

The main thread's job is **orchestration**: dispatch the right subagent for the right phase, collect the artefact, advance. The main thread does NOT write production code, tests, or design docs directly — it routes the work.

**Always finish a task by pushing the branch and opening a PR** once all reviews (Code Reviewer + second-pass QA + Tech Lead + Product Designer) have approved. The PR is where the user reads every reviewer's verdict in one place and leaves feedback. Do not stop at "committed locally" — push and open the PR by default. Use `gh pr create` against `main`; mirror the TASK-003 / PR #1 style.

## Sacred product rules (PRD §8 — never violate)

1. **Distillation is manual rewriting.** No auto-built next list. The entry form does NOT pre-fill from parent Cards.
2. **`wrong` rating is always flagged for distillation.** Hardcoded. No setting overrides this.
3. **Gold tier is terminal.** Gold lists have `reviewableAt = null`, no Builder, no archiving on review.
4. **One source of truth per fact.** Tier on Page; rating history in ReviewEvent. No duplicated derived state.
5. **No backend, ever.**

## Stack quick reference

- Vite 6 + React 19 + TypeScript strict
- Tailwind 4 via `@tailwindcss/vite`
- Dexie 4 over IndexedDB (with `fake-indexeddb` in tests)
- Zustand 5 for state
- React Router 7 with **HashRouter** (GH Pages safe)
- Recharts for stats
- vite-plugin-pwa (Workbox) with `registerType: 'autoUpdate'`
- vitest 3 + React Testing Library
- ESLint flat config

## Verification commands

```
npm run dev         # local dev server on :5173
npm run build       # production build to dist/ (also runs tsc -b)
npm run test        # vitest run, watch with test:watch
npm run typecheck   # tsc -b --noEmit
npm run lint        # eslint .
```

All four are currently green on `main` of the scaffold.

## Things easy to forget

- `base: '/GoldListPlus/'` in `vite.config.ts` must match the GH Pages repo name. Manifest `scope` and `start_url` must agree.
- HashRouter not BrowserRouter. Don't "fix" it.
- Card has no `notes` field. Archive is `archivedAt: number | undefined` — no boolean.
- Tier is `'bronze' | 'silver' | 'gold'` string union, not numeric stage.
- Pure logic in `src/lib/**` takes `now: number` as a parameter — no `Date.now()` calls in there.
- Repos in `src/db/repos/` are the only callers of `src/db/db.ts`.
