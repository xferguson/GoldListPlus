# Product Requirements Document — Gold List Plus

> **Status:** v0.1 — seed. Maintained by the **product-designer** subagent.
> Source of truth for *what* the product does and *why*. The Tech Lead, QA Engineer, Implementer, and Code Reviewer all execute against this document.

## 1. Vision

An interactive, fully-offline Progressive Web App that implements the **Gold List Method** of language learning with **Anki-style flashcards used only as the testing mechanism** during distillation reviews. The app is hosted as a static site on GitHub Pages, installable on any modern phone or desktop, and works without a backend.

The product preserves the discipline of the Gold List Method: the user **manually re-writes** entries each distillation cycle, because the act of rewriting — not seeing an auto-generated list — is what cements long-term memory.

## 2. Glossary

| Term | Meaning |
|---|---|
| **Book** | A collection scoped to one topic / language pair. Has settings. |
| **List** | A single Gold-List sheet within a Book. Has a **tier**. Also called a Page internally. |
| **Tier** | One of `bronze`, `silver`, `gold`. Stored authoritatively on the List. |
| **Card** | One entry: source text + target text. Belongs to exactly one List. |
| **Review** | A flashcard pass through a due List, where the user rates each Card. |
| **Distillation** | The user authors the next-tier List by hand after a Review. |
| **Flag** | A visual marker on a Card after a Review indicating it is recommended for distillation. Computed from rating + Book settings. |

## 3. Method flow (the user-facing loop)

1. User creates a **Book** (e.g. "Japanese — en→ja").
2. User adds a **Bronze List** by hand-typing ~25 source+target pairs.
3. App schedules `reviewableAt = createdAt + distillationIntervalDays` (default 14).
4. On or after `reviewableAt`, the List shows as **due**. User starts a Review.
5. **Review:** each Card shown front-only, user flips (Space) and rates **Wrong / Hard / Moderate / Easy** (1–4).
6. After the last Card, the **Distillation Review** screen shows the whole List in the target language with each Card's score and a flag icon for Cards recommended for distillation:
   - `wrong` → **always flagged** (hardcoded, no setting).
   - `hard` → flagged unless `autoDropOnHard = true`. **Default: flagged.**
   - `moderate` → flagged unless `autoDropOnModerate = true`. **Default: dropped.**
   - `easy` → dropped unless `autoDropOnEasy = false`. **Default: dropped.**
7. User clicks **"Build Silver List"** → enters the Distillation Builder.
8. **Distillation Builder:**
   - Top half: empty next-tier List being built.
   - Bottom half: parent List with flag icons and scores.
   - To add an entry: user clicks **"Add entry"** → modal lets the user **select 0–N parent Cards** (multi-select) and then **manually type** source and target. The form does **NOT pre-fill** from parents. Saving creates a new Card on the next-tier List with `parentIds` recording the selection.
   - `parentIds = []` is allowed (a brand-new entry not derived from any parent).
9. User clicks **"Finalize"**:
   - New List is created with `tier = nextTier(parent.tier)` and `reviewableAt = now + intervalDays` (Silver) or `null` (Gold).
   - Parent List marked `reviewedAt = now`, linked as `parentPageId` on the new List.
   - **All Cards on the parent List are archived** (`archivedAt = now`). Their content is still reachable via `parentIds` references on descendant Cards.
10. Repeat: Silver → Gold after another 14+ days.
11. **Gold is terminal.** Gold Lists have `reviewableAt = null` and are not in the due queue. The user can open any Gold List and trigger a **"Review on demand"** at any time. On-demand reviews **record ReviewEvents** for stats but **do not produce a Distillation Builder** and **do not archive cards** — they are pure self-check.

## 4. Tier visual treatment

Every List page and every List summary card must display:

| Tier | Border colour | Border width | Header tag text |
|---|---|---|---|
| Bronze | `#B87333` (copper-orange) | 4px | `BRONZE LIST` |
| Silver | `#C0C0C0` (silver) | 4px | `SILVER LIST` |
| Gold | `#D4AF37` (gold) | 4px | `GOLD LIST` |

The tier label and the colour border are both required — colour alone is not accessible. Tag should be visually prominent (uppercase, letter-spaced, high contrast).

## 5. Functional requirements

### 5.1 Books
- Create a Book with `name`, `sourceLang` (BCP-47), `targetLang` (BCP-47), and overridable settings.
- **New-Book form:**
  - `name`, `sourceLang`, `targetLang` are all required. Submit is blocked while any is empty (post-trim); inline error text appears next to each empty required field on submit attempt or blur, and clears as soon as the field becomes non-empty.
  - `name` is trimmed and limited to 1–80 characters. Names are **not** unique — two Books may share a name.
  - `sourceLang` / `targetLang` are stored as BCP-47 strings but the form does **not** validate the format in v1; any non-empty trimmed string is accepted. Format validation may be revisited when Settings ships.
  - The user-visible fields do **not** pre-fill: name, source, and target start empty. Pre-filling languages risks silently mis-persisting the wrong locale.
  - The persisted `BookSettings` block is **not** shown in this form. It is written with the app defaults: `distillationIntervalDays = 14`, `headlistSize = 25`, `autoDropOnHard = false`, `autoDropOnModerate = true`, `autoDropOnEasy = true` (matching §3 step 6). When the Settings UI lands (§5.10), these defaults become user-overridable; the New-Book form's shape does not change.
  - Successful submit creates the Book and navigates to `/book/:bookId` (the per-Book overview route).
- Edit Book name, languages, and settings.
- Delete a Book (with confirmation). Deletes all Lists, Cards, and ReviewEvents.

### 5.2 Lists
- Create a Bronze List in a Book by hand-typing Cards. `headlistSize` (default 25) is a **soft warning** at creation, not enforced.
- Add / edit / reorder / delete Cards on a List **only while the List has never been reviewed** (`reviewedAt` unset).
- After review, the List is read-only except for the Distillation flow.
- Delete an entire List (with confirmation).

### 5.3 Review
- Show one Card at a time, source side first.
- Spacebar flips. Keys 1–4 rate Wrong / Hard / Moderate / Easy. Buttons present for touch.
- Each rating creates a `ReviewEvent`. The Card's "latest rating in this review" is the one used for flag computation.
- After the last Card, navigate to Distillation Review.

### 5.4 Distillation Review
- Show every Card in the just-reviewed List, displaying:
  - Source and target.
  - Score badge with the user's latest rating in this review.
  - Flag icon if the Card meets the flag rules in §3.6.
- Read-only. Single CTA: **"Build [Next Tier] List"** (or "Done — no next list" if parent is Gold; this case should not occur because Gold reviews don't reach this screen).

### 5.5 Distillation Builder
- Two-pane layout (top: new List; bottom: parent List with flag/score chips).
- "Add entry" opens a modal:
  - Multi-select chips for parent Cards. Zero allowed.
  - Two text inputs (source + target). **Both required**, **both empty** when modal opens, even if exactly one parent is selected.
  - Save adds the new Card to the new List with `parentIds` from the selection.
- Edit / remove / reorder entries in the new List before finalizing.
- "Finalize" CTA — confirms via modal, then:
  - Persists the new List with the correct tier and `reviewableAt` (or `null` for Gold).
  - Sets `archivedAt` on every parent-List Card.
  - Links parent ↔ child List references.
  - Navigates to the new List detail view.
- "Discard draft" deletes any in-flight builder state without mutating the parent List.
- **Finalizing with zero entries is allowed.** The user may finalize a Builder with no new entries — this creates an empty next-tier List, archives every parent Card, and is the explicit signal "I have dropped everything." The confirm modal should surface this state clearly (e.g. "Finalize with no entries? The next List will be empty."). The repo layer treats zero entries as a valid plan.

### 5.6 On-demand Gold review
- A Gold List shows a **"Review on demand"** button instead of a due indicator.
- The Review flow runs identically and records ReviewEvents.
- At the end, the user lands on a read-only **Gold Summary** screen (no flags, no Builder CTA, no archiving). Navigation contract: a non-Gold review ends at the Distillation Review screen; a Gold review ends at the Gold Summary screen instead. These are two distinct destinations — the Gold Summary is never a Builder entry point.

### 5.7 Dashboard
- Lists Books, each with a count of due Lists.
- "Due Now" panel: every List across all Books with `reviewableAt ≤ now` and tier ≠ gold, sorted by oldest-due first.

### 5.8 Per-Book overview
- Lists grouped by tier (Bronze, Silver, Gold) with the appropriate visual borders.
- Each row shows the List title, created date, due date (or "On demand" for Gold), and a status pill (Active / Reviewed / In Distillation).

### 5.9 Stats
- **Retention curve** per Book: percentage of Cards advancing from Bronze→Silver→Gold over time.
- **Items per tier** bar chart per Book.
- **Activity heatmap** (calendar) of distillation and review activity across all Books.

### 5.10 Settings
- Defaults for new Books (interval, headlist size, autoDrop settings).
- Backup & restore section containing Export and Import (see §5.10.1).
- (Chromium) Auto-sync: pick a file once, app writes on every mutation (debounced).
- Notifications permission and a per-Book toggle.

#### 5.10.1 Export / Import (Backup & restore)

Grouped on the Settings page under a section heading **"Backup & restore"** with helper copy: *"Your data never leaves your device unless you export it. Use Export to make a backup, and Import to restore one on this or another device."*

**Export**
- Triggered by a button labelled **"Export backup"**.
- Action is instant — no confirmation modal. While the export is being assembled the button is disabled and shows **"Exporting…"**; on completion the browser's normal file-save flow takes over.
- Filename is deterministic and timestamped: `goldlistplus-backup-YYYYMMDD-HHmmss.json` (UTC, zero-padded). The timestamp lets the user identify which export they are restoring from when multiple files sit in the same folder.
- After a successful export, an inline status line under the button shows for ~5 seconds: **"Exported N books, M lists, K cards, J reviews."** (Counts are required so the user can sanity-check the export is non-empty when they expected data.)
- The file's top-level shape is `{ version, exportedAt, books, pages, cards, reviews }`. `version` is the literal number `1`. `exportedAt` is a Unix epoch millisecond integer captured at export start. Each array contains every row of its table verbatim — no derived fields, no computed flags, no tier counts (Sacred rule #4: one source of truth per fact).

**Import**
- Triggered by a button labelled **"Import backup"** that opens the OS file picker (accept `.json` only).
- After file selection, the app parses and validates the file **before** mutating anything. On any validation failure the user sees an inline error under the Import button with `role="alert"`; the database is untouched. Failure cases and copy:
  - File is not valid JSON → **"That file isn't valid JSON. Pick an exported backup file."**
  - Top-level is not an object, or `version` is missing/not `1`, or `exportedAt` is missing/not a number, or any of `books` / `pages` / `cards` / `reviews` is missing or not an array → **"That file isn't a Gold List Plus backup."**
  - `version` is a number other than `1` → **"This backup was made by a newer version of Gold List Plus. Update the app and try again."**
- On successful parse, a confirmation modal appears: **"Import N books, M lists, K cards, J reviews? Existing entries with matching IDs will be overwritten. Other data on this device is kept."** with **"Import"** and **"Cancel"** buttons. The modal is required because import mutates the DB; the user must explicitly opt in.
- On confirm, the import runs as one atomic transaction (all four tables) and upserts every row by `id`. Rows in the DB whose `id` is not in the file are left alone — import is additive/overwriting, never destructive of unrelated data.
- **Foreign-key integrity:** before any write, the validator checks that every Page's `bookId`, every Card's `bookId` and `pageId`, every ReviewEvent's `cardId` and `pageId` resolves either to a row in the same file or to an existing row in the DB. If any reference is unresolvable the whole import is aborted with the inline error **"This backup is missing data it depends on (e.g. a list whose book isn't included). Nothing was imported."** This prevents the DB from being left in a half-imported state.
- After a successful import, the inline status line shows: **"Imported N books, M lists, K cards, J reviews (X overwritten)."** `X` is the count of rows whose `id` already existed in the DB and were replaced. No per-row warning UI — the count is enough for v1.
- **Idempotency:** because every row is upserted by `id` and the file's row wins fully (no partial merge, no field-level diff), importing the same file a second time replaces each row with the identical content. The second import is functionally a no-op from the user's perspective (counts may report all rows as "overwritten" the second time, which is honest and expected).
- **Collision policy:** when a row in the file shares an `id` with a row in the DB, the file's row replaces the DB row in full — no field-by-field merge. This is the deterministic rule that makes idempotency hold.

### 5.11 Reminders
- Lazily request notification permission from Settings (not on first launch).
- On app open: fire a local notification for each List with `reviewableAt ≤ now` AND tier ≠ gold AND `lastNotifiedAt < now − 24h`. Set `lastNotifiedAt = now` after firing.
- Where Notification Triggers API is supported (Chromium), schedule a `TimestampTrigger` at each new non-Gold List's `reviewableAt`.
- iOS reality: without a backend, no true Web Push. Notifications fire only on app open. Surface this in Settings copy.

## 6. Non-functional requirements

- **Offline-first.** App fully usable without network after first load.
- **Installable.** Lighthouse PWA audit ≥ 90 on installability, offline, manifest.
- **Accessible.** Keyboard navigable through every flow. Tier indicated by colour AND label.
- **Performance.** Cold launch interactive within 2 seconds on a 2020-era mid-range phone.
- **Privacy.** No analytics, no third-party fetches, no data leaves the device except via user-initiated export/sync.

## 7. Out of scope for v1

- TTS audio playback.
- Cloze deletions or rich-text formatting.
- Images on Cards.
- Dropbox/Google Drive/Gist OAuth sync.
- True Web Push notifications.
- Server-side anything.
- **Export/Import (v1 scope):**
  - No merge or conflict-resolution UI — collisions are full-row overwrites, period.
  - No pre-import preview of which rows will change.
  - No partial export (e.g. one Book, one List); export is always the whole database.
  - No encryption, compression, or password-protection of the export file.
  - No automated scheduled exports (auto-sync to a pinned file is a separate feature — §5.10 / TASK-019).
  - No CSV, Anki `.apkg`, or other interchange formats — JSON only.

## 8. Sacred rules (do not violate)

1. **Distillation is manual rewriting.** No auto-build, no pre-fill from parent Cards in the entry form.
2. **`wrong` is always flagged.** Hardcoded. No setting overrides this.
3. **Gold is terminal.** No `reviewableAt`. No Builder. No archiving on review.
4. **One source of truth per fact.** Tier on Page; rating history in ReviewEvent. No duplicated derived state.
5. **No backend, ever.**
