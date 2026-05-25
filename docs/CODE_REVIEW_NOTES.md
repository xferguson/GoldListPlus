# Code Review Notes — Gold List Plus

> Append-only archive of code review findings, precedents, and lessons learned across the project's PRs. Maintained by the `code-reviewer` orchestrator. Reviewers read this **only when relevant** (to check whether a finding has precedent, or whether a recurring pattern is being repeated) — it is NOT loaded into context by default.

## How this document is used

- **Orchestrator** (`code-reviewer` agent, see `.claude/agents/code-reviewer.md`): reads this file when consolidating a review, ONLY if a specialist's finding suggests a recurrence or contradiction with a prior decision. Appends a new entry under `## Reviews` after each consolidated review that produced noteworthy findings (BLOCKERs, MAJORs, waivers, or first-of-a-kind precedents). Approvals with no findings do not need to be logged — silence is the default.
- **Specialists** (`reviewer-*.md`): do NOT read this file as part of their normal checklist. Their job is to evaluate the current diff against their principle. If they want to check precedent, they say so in their report; the orchestrator looks it up.
- **`reviewer-generic` specifically**: reads this file only when a project-rule finding might intersect a prior waiver or recorded decision.
- **Humans**: read this file when triaging recurring issues, considering loosening or tightening a rule, or deciding whether to elevate a recurring `MAJOR` into a `BLOCKER`-by-default rule.

## Format

Each entry follows this template:

```
### YYYY-MM-DD — PR #N — <branch> — <one-line headline>

**Scope:** <task ID / one-line summary of the change>
**Verdict:** APPROVE | REQUEST_CHANGES (resolved) | WAIVED-MAJOR
**Specialists:** <list of reviewers that filed findings>

**Findings:**
- [SEVERITY] <reviewer-name> @ <file:lines> — <one-line summary of the issue> — <how it was resolved or waived>

**Precedent / lesson:**
<one-paragraph takeaway. What does this teach future reviewers? What pattern do we now watch for?>

**Waivers (if any):**
- <reviewer-name> MAJOR — <justification> — follow-up: <task ID or issue link>
```

Entries are chronological (newest first). Append a new entry only when:
- A `BLOCKER` was filed and fixed.
- A `MAJOR` was filed and either fixed or waived.
- A `MINOR` introduced a non-obvious precedent worth recording.
- A review pattern recurs across PRs — codify the pattern.

Do NOT log clean approvals. Do NOT log every `MINOR` and `NIT`. The signal here is precedent, not paper-trail.

## Precedents established (cross-cutting lessons)

Lessons that apply across all future PRs, surfaced from individual review entries. The orchestrator can scan this section as a quick refresher; specialists may read it if their own finding pattern-matches.

### P-001 — Empty-table `where().equals().toArray() === []` tests prove declaration, not behaviour

**Established:** TASK-003 helper-patch follow-up (in PR #1, post-merge audit by the user).
**Reviewer surface:** reviewer-testability, reviewer-generic.
**Rule:** A test of an index/filter/query that uses an empty table and asserts `[]` only proves the symbol is declared (because Dexie throws on un-indexed `where()`). It does NOT prove the index filters correctly. The fix is the typed `assertIndexFilters(table, indexName, matchingValue, nonMatchingValue, rowFactory)` helper, used in `src/db/db.test.ts`.
**Anti-pattern to flag on sight:** `await expect(db.X.where('Y').equals('Z').toArray()).resolves.toEqual([])` as the *only* coverage for index `Y`.
**Source skill:** `.claude/skills/behaviour-over-declaration/SKILL.md`.

### P-002 — Sacred rule recurrences are BLOCKERs, full stop

**Established:** general project policy from PRD §8.
**Reviewer surface:** reviewer-generic (primary), all specialists (defer).
**Rule:** Violations of PRD §8 sacred rules are not subject to waiver. They are encoded in tests and in `reviewer-generic`'s anti-pattern list. If a violation appears, it's a `BLOCKER` regardless of context. The five rules: (1) Distillation is manual rewriting, (2) `wrong` is always flagged, (3) Gold tier is terminal, (4) one source of truth per fact, (5) no backend.

### P-003 — New dependencies require `docs/ARCHITECTURE.md` §8 ledger entry

**Established:** project policy.
**Reviewer surface:** reviewer-generic, reviewer-security, reviewer-scope.
**Rule:** Adding to `package.json` `dependencies` or `devDependencies` requires a row in `docs/ARCHITECTURE.md` §8 with purpose and at least one alternative considered. Missing entry = `MAJOR`. The ledger is the audit trail for the supply chain.

### P-004 — File-size limits per ARCHITECTURE §6 are tech-lead-enforced on second pass

**Established:** post-TASK-003 standards work (PR #2-style standards branch).
**Reviewer surface:** reviewer-complexity (line-count threshold component), tech-lead second-pass audit.
**Rule:** Hard caps per bucket in ARCHITECTURE.md §6. Violation = kickback to implementer for a split. Bypass requires a `// rationale-for-size:` comment AND a TASKS.md exception note. The reviewer-complexity agent also catches these as part of its checks.

### P-005 — Route tests must use real repos + `fake-indexeddb`, never `vi.mock('../../db/repos/*')`

**Established:** CHORE-003 (2026-05-25).
**Reviewer surface:** reviewer-testability, reviewer-generic.
**Rule:** `vi.mock('../../db/repos/{books,pages,cards,reviews}')` in any `src/routes/**/*.test.tsx` is a `BLOCKER`. Mocking the entire repo layer lets tests pass against a `return undefined`-stubbed production; collaboration-shape assertions (`expect(mock).toHaveBeenCalledWith(...)`) do not observe outcomes. The fix is the close/delete/open dance from `src/db/repos/pages.test.ts:35-47` plus outcome reads against the real repo wrappers. Rejection-path tests inject via `vi.spyOn(db.X, 'add').mockRejectedValueOnce(...)` at the Dexie layer (not at the repo) so the SUT's real `repo.create` codepath runs.
**Anti-pattern to flag on sight:** any `vi.mock('../../db/repos/...')` in `src/routes/**/*.test.tsx`.
**Reference implementation:** `src/db/repos/pages.test.ts:35-47`; `src/routes/Book/NewBook.test.tsx` rejection-path tactic.

### P-006 — AC wording-bug resolution: honour same-bullet rationale over literal floor, when an honesty check corroborates

**Established:** CHORE-003 (2026-05-25).
**Reviewer surface:** reviewer-generic, tech-lead second-pass.
**Rule:** If an AC bullet contains both a literal threshold AND a parenthetical justification that contradicts it, AND a separate honesty check (mutation trap, behavioural assertion, independent test) corroborates the rationale's intent, the spirit wins. The CHORE-003 example: AC-4 mandated a `-10` deletion AND the chore forbade adding new tests AND AC-5's `≥ 515` floor justified itself with "no coverage regression — the empty-table tests being deleted were shadowed by the filter block." Three reviewers (generic + tech-lead second-pass + the orchestrator-run mutation trap) independently confirmed coverage survived. The literal floor was the wording bug, not a real requirement. Future reviewers facing this pattern: surface it explicitly in the consolidated verdict, do NOT paper over it. The rationale-clause-plus-honesty-check criterion prevents this from becoming a "spirit beats letter whenever convenient" loophole.

### P-007 — `waitForElementToBeRemoved` is a latent race against any async write that awaits a repo

**Established:** CHORE-003 (2026-05-25).
**Reviewer surface:** reviewer-testability, reviewer-generic.
**Rule:** `waitForElementToBeRemoved(() => queryByTestId(X))` requires `X` to be present at the moment the matcher's first check fires. With real Dexie (or any awaited async write), the removal microtask can resolve first, and the matcher throws `"element(s) ... are already removed"` — a 1-in-3 flake under load. The robust primitive for "click-then-assert-gone with async write" is `await waitFor(() => expect(queryByTestId(X)).not.toBeInTheDocument())`. Acceptable use of `waitForElementToBeRemoved`: elements removed by a synchronous state transition (e.g. a Save button rendered only in edit-mode, removed when edit-mode exits) where presence-at-call-time is guaranteed.
**Anti-pattern to flag on sight:** `waitForElementToBeRemoved` targeting an element removed by a route-layer write that awaits a repo function. The give-away: the same test's preceding statement is `await user.click(...)` followed immediately by `await waitForElementToBeRemoved(...)`.

## Reviews

> Newest first. Append, never edit historical entries — corrections go in a new entry referencing the old.

### 2026-05-25 — PR #TBD — `worktree-GoldListPlus-CHORE-003` — CHORE-003 test refactor: `vi.mock` → real-repo + fake-indexeddb

**Scope:** CHORE-003 — replace `vi.mock('../../db/repos/*')` with real-repo + `fake-indexeddb` seeding in three route test files (`Book.test.tsx`, `NewBook.test.tsx`, `ListDetail.test.tsx`); delete the shadowed empty-table describe block in `db.test.ts:62-130`. Pure test refactor; zero production code changes.
**Verdict:** REQUEST_CHANGES (resolved) → APPROVE
**Specialists:** 8/10 returned APPROVE on first pass (complexity, responsibility, scope, security, observability, error-handling, testability, modularity). 2/10 returned REQUEST_CHANGES (readability, generic). Both addressed by a follow-up QA pass; re-run was clean.

**Findings:**
- [BLOCKER] reviewer-generic @ `src/routes/ListDetail/ListDetail.test.tsx:374,549` — `waitForElementToBeRemoved` race-condition flake with real Dexie (1-in-3 false-fail observed in CI-style cold runs). The matcher requires the element to be present at call time, but with real Dexie the delete-write microtask can resolve before the matcher's first check, throwing `"element(s) ... are already removed"`. **Resolved** by replacing both sites with `await waitFor(() => expect(queryByTestId(removedId)).not.toBeInTheDocument())`, which polls the post-condition without requiring presence at call time. 3-run stability verified.
- [MAJOR] reviewer-readability @ `src/routes/Book/NewBook.test.tsx:314,316` — `describe` block + matrix block comment still describe the mechanism the chore was removing (`"calls books.create with the right shape"`, `"// - books.create called exactly once"`) even though every `it` body underneath was correctly renamed to outcome-style. **Resolved** by renaming the `describe` to `"successful submit persists with defaults and navigates"` and the comment line to `"// - exactly one Book row written"`.
- [MAJOR] reviewer-readability @ `src/routes/Book/Book.test.tsx:237` — `it('AC-3c: after pages.create resolves, ...')` still names the repo function the test no longer awaits directly. **Resolved** by renaming to `"AC-3c: after the new Bronze List is persisted, navigation lands on ..."`.
- [MINOR] reviewer-readability @ `src/routes/ListDetail/ListDetail.test.tsx:20-22` and `src/routes/Book/Book.test.tsx:13-15` — file header comments described seeding via repos but the `seed()` helper writes via raw `db.*.add` / `db.*.bulkAdd` (a deliberate choice for fixtures with non-canonical shapes). **Resolved** by tightening both comments to say writes go through real repos and fixtures seed via raw `db.*.add`.

**Precedent / lesson:**
This chore resolves the candidate-precedent flagged in the 2026-05-25 baseline review entry below: the `vi.mock('../../db/repos/*')` pattern recurring across three route test files. The fix is now codified in three places (each refactored file's `beforeEach`/`afterEach` mirrors `src/db/repos/pages.test.ts:35-47` with a `// Pattern lifted from ...` comment), so a future contributor re-introducing `vi.mock('../../db/repos/*')` will be visible to grep and should be kicked back in PR review. Promoting to **P-005** below.

Two **process precedents** worth recording from this chore:

1. **AC wording-bug resolution by spirit.** CHORE-003's AC-5 said `≥ 515 total tests` literally, but AC-4 mandated a `-10` deletion AND the same chore's out-of-scope list forbade adding new tests — mechanically inconsistent. Both `reviewer-generic` and the Tech Lead second-pass agreed to honour the AC's parenthetical justification ("no coverage regression — the empty-table tests being deleted were shadowed") over the literal floor. The mutation trap independently confirmed coverage survived (3 file-targeted mutations each killed ≥7 tests in the corresponding refactored file). Future reviewers facing literal-vs-spirit tension in an AC bullet should look for a same-bullet rationale clause and weight it heavily — but only when an independent honesty check (mutation trap, behavioural assertion) corroborates the spirit interpretation. Recording as **P-006**.

2. **`waitForElementToBeRemoved` is a latent race against real async writes.** The matcher's "element must be present at call time" semantics work when the trigger and the removal happen on the same microtask (the in-memory mock case), but become a 1-in-3 flake when the removal awaits a real Dexie transaction. The robust primitive for "click-then-assert-gone with async write" is `await waitFor(() => expect(queryByTestId(id)).not.toBeInTheDocument())`. The `reviewer-testability` and `reviewer-generic` reviewers should flag any `waitForElementToBeRemoved` call that targets an element removed by a route-layer write that awaits a repo. Recording as **P-007**.

**Waivers:** none. All BLOCKER + MAJOR findings were resolved in the same PR.

### 2026-05-25 — PR #TBD — `worktree-GoldListPlus-CHORE-004` — CHORE-004 tightens `parseExport` to per-row schema validation

**Scope:** CHORE-004 from the 2026-05-25 baseline. Adds a `malformed-row` `ImportError` variant to `src/lib/sync/exportImport.ts`, four per-table row validators with an allowlist sieve, and per-table user copy in `src/routes/Settings/index.tsx`. Closes the two reviewer-security MAJORs from the baseline run (per-row schema not validated; prototype-pollution-adjacent imports).
**Verdict:** REQUEST_CHANGES → APPROVE after one kickback round. 5 commits total (PRD + Red + Green + kickback Red + kickback Green).
**Specialists:** 7 APPROVE on first pass (complexity, modularity, readability, scope, responsibility, testability, generic). 3 REQUEST_CHANGES on first pass (security, observability, error-handling).

**Findings (kickback round):**
- [MAJOR] reviewer-security @ `src/lib/sync/exportImport.ts:126,167` — `Array.isArray(cardIds)` / `Array.isArray(parentIds)` validated container only; elements passed through as `string[]`. Allowed injection of `[123]`, `[null]`, `[{__proto__: {polluted: true}}]`, mixed-valid-bad. **Fixed in `780fb5d`** — both validators now require `.every((x) => isNonEmptyString(x))`. 11 new tests pin the rejection across 6 pages.cardIds × 5 cards.parentIds element-injection vectors.
- [MAJOR] reviewer-observability @ `src/routes/Settings/index.tsx` `errorCopy` — chore's whole new developer-facing `reason` diagnostic was constructed and dropped. **Fixed in `780fb5d`** — `handleFileChange` now calls `console.warn('settings.import: malformed row', { table, index, reason })` before `setErrorText`. User-facing copy is unchanged. 1 new test asserts the structured warn payload.

**Findings (deferred — pre-existing on `main`, outside chore lane):**
- [MAJOR] reviewer-error-handling @ `src/routes/Settings/index.tsx:123` — `await readFileText(file)` not in try/catch; FileReader rejection becomes unhandled promise.
- [MAJOR] reviewer-observability + reviewer-error-handling @ `src/routes/Settings/index.tsx:103,158` — bare `catch {}` swallows `Error` on both export and import paths; user sees opaque "Export failed." / "Import failed." with nothing in DevTools console.
- Recommend tech-lead spawn a follow-up chore (CHORE-009 candidate) scoped to Settings error-boundary hardening.

**Precedent / lesson:**
The chore's targeted MAJORs (per-row schema, prototype-pollution-adjacent) closed cleanly, but the panel surfaced an adjacent class of findings the implementer hadn't pre-empted: **array element validation must be element-wise, not container-only.** `Array.isArray(x)` proves "x is an array" — it does NOT prove "x's elements satisfy the typed contract the rest of the codebase relies on." This applies wherever an untrusted boundary (file import, IndexedDB read, URL param) yields a `T[]`-typed value: validate the elements, not just the array-ness. Candidate for `P-005` if it appears in one more PR. Also: when a chore introduces a new diagnostic field, the chore is unfinished until the field is reachable by a developer — "developer-facing" without console output is dead code.

**Waivers:** none. The 3 pre-existing MAJORs are *deferred* (file follow-up chore), not waived.


### 2026-05-25 — baseline — `claude/gracious-knuth-665964` — first run of the 10-reviewer orchestrator against existing codebase

**Scope:** Baseline review of the whole codebase at HEAD `be0c896` (no PR diff). First exercise of the 10-specialist orchestrator + consolidator pipeline introduced in PR #14. All ten reviewers fired in parallel against the entire `src/` tree (~53 production files, ~3490 LOC non-test) and `docs/`.
**Verdict:** REQUEST_CHANGES (consolidated). The full consolidated report lives in the conversation transcript that produced this run; copying it verbatim would exceed the archive's signal/noise budget.
**Specialists:** all 10 filed findings. 9 returned `REQUEST_CHANGES` (every specialist except none-clean); `reviewer-generic` was the most lenient (1 MAJOR, 1 MINOR).

**Headline counts:**
- **11 BLOCKERs** across 5 specialists: reviewer-readability (2), reviewer-responsibility (3), reviewer-error-handling (3), reviewer-observability (3), reviewer-testability (3). One BLOCKER (`ListDetail` add/delete outside transaction) was filed by both error-handling and responsibility from different angles — reinforcement, not contradiction. One BLOCKER cluster (route tests mocking Dexie repos) recurs across 3 test files, instantiating a candidate new precedent.
- **~45 MAJORs** across all 10 specialists, concentrated in: `ListDetail/index.tsx` (CardRow + 2-write handlers), `Settings/index.tsx` + `syncActions.ts` (4-phase orchestrator, generic 'Import failed' copy, layering violation, prototype-pollution-adjacent imports), `NewBook.tsx` (copy-pasted input blocks, abbreviated locals), `parseExport` (envelope-shape-only validation — malicious backup writes directly to Dexie).
- **~15 MINORs / ~5 NITs** — author's discretion.

**Top findings (severity-ordered, deduped across specialists):**
- [BLOCKER] reviewer-testability — `ListDetail.test.tsx` / `Book.test.tsx` / `NewBook.test.tsx` mock entire Dexie repo layer via `vi.mock`. §8 dependency-ledger explicitly forbids; tests pass with stubbed no-ops. **Recurs across 3 files** — candidate precedent.
- [BLOCKER] reviewer-error-handling + reviewer-responsibility — `ListDetail/index.tsx:50-66` `onAddSuccess`/`onDelete` perform 2 Dexie writes outside transaction; partial failure leaves orphan/stale state. Filed from both error-handling and responsibility angles.
- [BLOCKER] reviewer-readability — `src/lib/distillation.ts:88` user-facing `Page.title` interpolates lowercase tier token; should use `tierLabel(childTier)`.
- [BLOCKER] reviewer-readability + reviewer-modularity — `DAY_MS = 86_400_000` declared in 2 production files + 8 test files; `src/lib/time.ts` pre-allocated in §2 module map but never created.
- [BLOCKER] reviewer-observability + reviewer-error-handling — 4 production `catch {}` bind nothing and log nothing; no React `ErrorBoundary` anywhere; `useRegisterSW({})` has no callbacks wired.
- [BLOCKER] reviewer-modularity — `Settings/syncActions.ts` imports `db` directly from UI/route layer. ADR-017 permits a transactional access point but its stated preference is per-repo `listAll()`; impl shipped the carve-out without the preferred form.
- [BLOCKER] reviewer-responsibility — `ListDetail/index.tsx` declares two components (`ListDetail` route + `CardRow`) in one file; `Book/index.tsx:onNewBronzeList` bundles 4 responsibilities including interval arithmetic that belongs in `src/lib/distillation.ts`.
- [BLOCKER] reviewer-generic — suite/typecheck/lint all green; PRD §8 sacred rules all hold; data-model invariants intact; SW scope correct. **The only generic BLOCKER class did not fire** — this is the cleanest specialist verdict, which itself is information: the codebase is well-organised at the macro level; rot is concentrated in handler-layer hygiene.

**Precedent / lesson:**
The very first 10-reviewer run produced 11 BLOCKERs and ~45 MAJORs against a codebase that the previous single-generalist reviewer had passed across 13 PRs. This validates the defence-in-depth thesis: ten strict single-principle reviewers DO find things one polite generalist does not. The findings cluster predictably — `ListDetail`/`Settings` handler layer (where IO meets UI), test hygiene (where the `vi.mock` shortcut is most tempting), and project-rule drift (the `DAY_MS`-everywhere literal, the `Page.title` lowercase tier token). None of these are catastrophic on their own; collectively they represent a meaningful hygiene gap that a single-pass review missed. **The `vi.mock('../../db/repos/*')` pattern recurring across 3 route-test files is a strong candidate for promotion to a new `P-NNN` precedent** ("route tests must use fake-indexeddb, not mocked repos") — flag for promotion if it appears in one more PR. The `bare catch {}` pattern (4 sites, 2 specialists filing) is similarly recurring and should be elevated if seen again.

**Waivers:** none — this is a baseline diagnostic, not a merge-gate review. The findings here are intended to seed follow-up TASKS, not to block a specific PR. The tech-lead should slice these into `chore:` tasks (suggested: chore-001 `extract DAY_MS to src/lib/time.ts`; chore-002 `add ErrorBoundary + log to UpdatePrompt SW callbacks`; chore-003 `replace vi.mock repo stubs with fake-indexeddb in route tests`; chore-004 `tighten parseExport to per-row schema validation`; chore-005 `wrap ListDetail 2-write handlers in db.transaction`).

**Full detail:** consolidated report in the conversation transcript that produced this baseline run (not copied here per archive policy — it runs ~400 lines including the 10 raw specialist reports verbatim).

### 2026-05-25 — PR #14 — `chore/code-review-subagents` — establish 10 parallel reviewers + notes archive

**Scope:** Introduce 9 single-principle reviewer subagents + 1 reviewer-generic, an orchestrator that dispatches all 10 in parallel, a CODE_REVIEW.md workflow document, and this code-review-notes archive.
**Verdict:** PENDING (this PR itself).
**Specialists:** N/A — this PR creates the system, so its own review is necessarily bootstrapped.

**Precedent / lesson:**
The choice to make `reviewer-generic` intentionally cross-cutting (overlapping with sibling specialists on architecture, layering, naming where they intersect project rules) is deliberate defence in depth. Findings caught by both generic and a specialist are reinforced, not duplicated; both file from their angle. This is the one place in the system where "single-principle focus" is consciously relaxed because the project's specific operating contract IS one principle taken as a whole.

This entry should be backfilled with the consolidated review of this PR once dispatched against itself (the meta-pass).

### Backfill — PRs #1 through #13 — pre-orchestrator era

The 13 PRs predating the orchestrator (#1 through #13) were reviewed by the previous single-generalist `code-reviewer` agent. Their findings live in PR comments and commit messages on `main`. Future reviewers needing precedent for those PRs should fetch the relevant PR via `gh pr view <N>` rather than reproducing them here — the bulk-backfill cost outweighs the benefit since most findings are already encoded in the resulting code on `main` and in the `Precedents established` section above.

| PR # | Branch | Task | Notable precedent |
|---|---|---|---|
| #13 | feat/task-018-export-import-json | TASK-018 | Import path requires `validateForeignKeys` before any Dexie write (reviewer-security, reviewer-error-handling will flag if bypassed). |
| #12 | feat/task-011-bronze-list-creation | TASK-011 | `nextBronzeTitle` gap-reuse algorithm — pure logic in `src/lib/bronzeTitle.ts`. |
| #11 | feat/task-021-pwa-update-prompt | TASK-021 | SW lifecycle visibility via `UpdatePrompt` component (ADR-013). |
| #10 | feat/task-010-create-book-ui | TASK-010 | Dashboard "New Book" flow; defaults from settings. |
| #9 | feat/task-008-tier-visual-primitives | TASK-008 | `TierBadge`, `TierBorder`, `Modal` components — establishes the visual primitive layer. |
| #8 | feat/task-009-review-session-store | TASK-009 | `useReviewSessionStore` is in-flight review state ONLY, not persistent. |
| #7 | feat/task-007-route-shell | TASK-007 | Flat HashRouter tree + `Layout.tsx` global shell. |
| #6 | docs/task-007-009-route-shell | docs (TASK-007..009) | Module-map and ADR entries pre-implementation. |
| #1-#5 | (earlier) | TASK-001..006 | Foundation: scaffold, schema, IDs, distillation logic, repos. PR #1 also established Precedent P-001 (empty-table tests). |

Entries for #1-#13 are deliberately summary-level. The full review history is reconstructable via `git log --merges` and `gh pr view <N> --comments` on demand; do not bloat this document with reproductions.

## Conventions for appending

1. **Date format:** `YYYY-MM-DD` (ISO).
2. **PR number:** as returned by `gh pr list` or visible in the merge commit.
3. **Severity counts:** if a review had > 5 findings, list the top 3-5 by severity and link to the PR for the full set.
4. **Waiver tracking:** every `MAJOR` waiver MUST include a follow-up reference (task ID or GitHub issue). Unfollowed waivers accumulate as technical debt and are surfaced by the tech-lead second-pass.
5. **Cross-link to precedents:** if a new finding instantiates an existing precedent (P-001, P-002, …), reference the precedent ID rather than re-explaining the rule.
6. **Promotion to precedent:** when a `MAJOR` finding has appeared in 2+ unrelated PRs, promote it to a `## Precedents established` entry (next `P-NNN`).

This file is *append-mostly*. Historical entries are evidence, not editorial copy. Corrections go in new entries that reference the older ones.
