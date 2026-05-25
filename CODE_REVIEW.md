# Code Review — Gold List Plus

> Parallel, strict, single-principle code review. Nine narrow specialists in parallel beat one polite generalist every time.

## Why this exists

Polite AI code review is a known failure mode: a single reviewer reads the diff, finds the obvious issues, softens its tone, and approves. The harder issues — Single-Responsibility violations, untestable seams, missing failure-path coverage, sensitive data in logs, speculative abstractions — get rounded off into "consider…" and slip through.

This project's review system replaces that single reviewer with **nine strict specialists** dispatched in parallel. Each owns one principle and refuses to wave its findings through. Their reports are consolidated by an orchestrator into a single merge verdict.

## The nine reviewers

Each lives at `.claude/agents/reviewer-<name>.md`. Each has its own detailed checklist, severity definitions, anti-pattern catalogue, and worked examples.

| Reviewer | Principle | Headline checks |
|---|---|---|
| `reviewer-complexity` | Cognitive load | CC > 10, cognitive complexity > 15, nesting > 3, function > 50 lines, params > 4, boolean params, mixed abstraction. |
| `reviewer-modularity` | Coupling & cohesion | ARCHITECTURE §3 layering violations, Law of Demeter chains, circular deps, god-files, concrete-instead-of-interface deps, dead public surface. |
| `reviewer-readability` | Naming & intent | Names describing mechanism not intent, misleading names (`getX` that mutates), vocabulary drift (`List` vs `Page`, `Tier` vs `stage`), magic numbers, broken lint. |
| `reviewer-scope` | PR coherence | > 400 lines non-generated non-test, bundled concerns, drive-by changes outside task `Files touched:`, speculative abstractions, dead-code-for-later. |
| `reviewer-responsibility` | Single Responsibility | "and" in function names, blank-line-separated phases, mode parameters switching behaviour, queries that write, commands returning unrelated derived data. |
| `reviewer-error-handling` | Failure modes | Swallowed catches, missing `db.transaction` for multi-write sequences, uncapped retries, lost error causes, string-sniffing error messages, missing failure-path tests. |
| `reviewer-observability` | Debuggability at 3am | String-concatenated log messages, wrong log levels, PII in logs (Card source/target text!), missing logs on new error paths, silent SW lifecycle. |
| `reviewer-security` | Threat model | XSS via `dangerouslySetInnerHTML`, missing validation at trust boundaries (file import, URL hash), SW scope widening beyond `/GoldListPlus/`, secrets in source, unaudited new deps. |
| `reviewer-testability` | Honest tests | `Date.now()` / `Math.random()` in `src/lib/**` (§3.6), tests that mock everything and assert on calls, mocking Dexie instead of fake-indexeddb, "manually verified" justifications. |

The orchestrator is `code-reviewer` (kept under that name so the existing subagent workflow in `CLAUDE.md` still routes to it).

## Severity levels

| Severity | Meaning | Effect on merge |
|---|---|---|
| **BLOCKER** | Principle violated in a way that will cause concrete harm. Security hole, data-loss path, untestable critical logic, complexity that guarantees future defects. | **Must be fixed before merge.** No exceptions. |
| **MAJOR** | Real violation, must be addressed before merge in normal circumstances. | Blocks merge unless explicitly waived with one-line justification + tracked follow-up. |
| **MINOR** | Should be fixed in this PR if cheap; otherwise file a follow-up. | Does not block. |
| **NIT** | Pure preference, not a violation. Used sparingly. | Does not block. |

Reviewers are biased toward `BLOCKER` / `MAJOR` for true violations. Inflating severity is bad; deflating it to be polite is worse.

## How to dispatch

### Full review (default — every PR)

Dispatch all nine reviewers in parallel.

**Recommended path:** invoke the `code-reviewer` orchestrator. It fires the nine specialists in parallel and returns one consolidated report.

```
Agent({
  subagent_type: "code-reviewer",
  description: "Code review TASK-NNN PR",
  prompt: "Review the diff origin/main..HEAD on branch feat/task-NNN. The PR claims TASK-NNN per docs/TASKS.md. Dispatch all nine specialists in parallel per CODE_REVIEW.md and return the consolidated report."
})
```

**Manual fallback:** if the harness restricts subagent-to-subagent dispatch (the orchestrator will report `BLOCKED` if so), the main thread dispatches all nine directly in a single message:

```
Agent({ subagent_type: "reviewer-complexity",     description: "...", prompt: "..." })
Agent({ subagent_type: "reviewer-modularity",     description: "...", prompt: "..." })
Agent({ subagent_type: "reviewer-readability",    description: "...", prompt: "..." })
Agent({ subagent_type: "reviewer-scope",          description: "...", prompt: "..." })
Agent({ subagent_type: "reviewer-responsibility", description: "...", prompt: "..." })
Agent({ subagent_type: "reviewer-error-handling", description: "...", prompt: "..." })
Agent({ subagent_type: "reviewer-observability",  description: "...", prompt: "..." })
Agent({ subagent_type: "reviewer-security",       description: "...", prompt: "..." })
Agent({ subagent_type: "reviewer-testability",    description: "...", prompt: "..." })
```

All nine dispatched together. Collect the nine reports, consolidate manually per the rules below.

### Each specialist's dispatch prompt — skeleton

Use the same skeleton for all nine specialists, varying only the principle name:

> You are reviewing the diff `<base>..<head>` (branch `<branch-name>`) which claims to implement `<task ID>` per `docs/TASKS.md`.
> Changed files: `<list from git diff --name-only>`.
> Apply your checklist from `.claude/agents/reviewer-<principle>.md` in full. Return your structured report exactly as specified there. Do not wave through; do not soften severity. Cross-principle findings get one-liners under `Cross-principle (defer)`.

Don't pre-summarize the diff. Don't pre-filter what each reviewer looks at. Each one inspects the actual code itself.

### Subset dispatch (targeted concerns)

For a security-only check, a complexity-only audit, or any narrow concern, dispatch just the relevant specialists. Examples:

- **Security audit of dependencies:** `reviewer-security` only, against the full codebase.
- **Refactor PR claimed to be behaviour-neutral:** `reviewer-scope` (to confirm coherence) + `reviewer-testability` (to confirm tests still constrain) + `reviewer-modularity` (to confirm layering held).
- **Performance regression hunt:** none of these reviewers cover performance specifically — file a separate task or add a `reviewer-performance` later.
- **Tightening tests on an already-merged feature:** `reviewer-testability` alone.

When dispatching a subset, document in the dispatch prompt which specialists you skipped and why, so the consolidated report shows the gap.

### Whole-codebase review

To audit the entire codebase (e.g. before a milestone, or quarterly), dispatch all nine against the full `src/` tree (no base ref — they review the current state, not a diff). Each specialist's checklist still applies; expect more findings, longer reports.

## Consolidation rules

When you have the nine reports, produce a single consolidated review with the structure documented in `.claude/agents/code-reviewer.md` under "Step 4 — Consolidate." Key rules:

1. **Group findings by severity across all specialists.** BLOCKERs first (from any reviewer), then MAJORs, then MINORs, then NITs. Tag each finding with which specialist filed it.
2. **Preserve specialist wording.** Do not soften, paraphrase, or downgrade. If reviewer-security said BLOCKER, it's a BLOCKER in the consolidated report.
3. **Surface contradictions.** If two specialists give opposing recommendations (rare but possible at the complexity-vs-modularity boundary, for example), list both views under `## Contradictions` and let the human decide. Do not silently pick one.
4. **Surface cross-principle defers.** Specialists file one-liners under `Cross-principle (defer)` when they spot something outside their lane. Promote these into the consolidated report so the human sees them; the relevant sibling reviewer should have flagged the issue too, but the cross-link is a useful sanity check.
5. **Compile a `## Verified` section.** Pull the most informative bullets from each specialist's `## Verified` section so a human reading the consolidated report knows what was actually inspected — not just what was flagged.

## Merge rule

| Verdict pattern | Merge decision |
|---|---|
| All nine specialists `APPROVE` | **Merge OK** (subject to PR requirements like CI). |
| Any one specialist `BLOCKER` | **REQUEST_CHANGES.** Fix the BLOCKER. Cannot merge. |
| Any one specialist `MAJOR` with no waiver | **REQUEST_CHANGES.** Fix the MAJOR, or attach a tech-lead-signed waiver with justification and a tracked follow-up. |
| Any specialist `NEEDS_INFO` | Overall `NEEDS_INFO`. Provide what the specialist asked for; re-run. |
| Only `MINOR` / `NIT` findings remain | **Merge OK at author's discretion**, with MINORs ideally addressed in-PR. |

`MAJOR` waivers are tracked in the PR description as:

> **Waiver:** reviewer-`<name>` MAJOR at `<file:lines>` — `<one-line justification>`. Follow-up: `<task ID or issue number>`.

The tech-lead second-pass (per `.claude/agents/tech-lead.md`) confirms waivers are legitimate, not laundering.

## When this workflow runs

Per `CLAUDE.md`'s subagent workflow, the code review happens:

1. **After the Implementer reports green tests.** The orchestrator (or main thread, manually) fires the nine specialists.
2. **Before the second-pass closure (QA → Tech Lead → Product Designer).** Any `BLOCKER` or unwaived `MAJOR` returns the work to the Implementer.
3. **On every PR, regardless of size.** Even a one-line change gets all nine — most will report `APPROVE` quickly with a brief `## Verified` list.

## Anti-patterns this system exists to prevent

These are the patterns one polite generalist tends to miss. If you find any of these slipping past the nine reviewers, the relevant reviewer's checklist needs tightening:

- `validateAndPersist(x)` shipping to main. Should be caught by **reviewer-responsibility** and **reviewer-readability**.
- A `useEffect` with 30 lines doing four things. Should be caught by **reviewer-complexity** and **reviewer-responsibility**.
- A new Dexie write path with no `db.transaction(...)` wrapper. Should be caught by **reviewer-error-handling**.
- `console.log(card)` where card contains user-typed text. Should be caught by **reviewer-observability** and **reviewer-security**.
- A repo function in `src/lib/**`. Should be caught by **reviewer-modularity** and **reviewer-testability**.
- An import file that bypasses `validateForeignKeys` before writing. Should be caught by **reviewer-security** and **reviewer-error-handling**.
- A test whose only assertions are `expect(mockX).toHaveBeenCalled()`. Should be caught by **reviewer-testability**.
- A 700-line PR titled "TASK-NNN + small refactor." Should be caught by **reviewer-scope**.

## Updating this system

The reviewers are agent files at `.claude/agents/reviewer-*.md`. Edits to a reviewer's checklist take effect immediately on the next dispatch. The orchestrator is at `.claude/agents/code-reviewer.md`. This file (`CODE_REVIEW.md`) is the human-readable index.

Adding a tenth reviewer? Create `.claude/agents/reviewer-<name>.md`, follow the structure of the existing nine, and update both `code-reviewer.md` (orchestrator's list of nine, now ten) and this file (the table and the dispatch command).

Removing a reviewer? Deprecate by stripping its system prompt down to "this reviewer is retired; never invoke" — don't delete the file, so future audits of what we used to enforce remain readable. Then update both `code-reviewer.md` and this file.
