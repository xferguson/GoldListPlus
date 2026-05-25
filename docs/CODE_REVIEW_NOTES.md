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

## Reviews

> Newest first. Append, never edit historical entries — corrections go in a new entry referencing the old.

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
