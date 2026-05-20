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
- Export full database to JSON file.
- Import JSON file (idempotent — re-importing the same file is a no-op).
- (Chromium) Auto-sync: pick a file once, app writes on every mutation (debounced).
- Notifications permission and a per-Book toggle.

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

## 8. Sacred rules (do not violate)

1. **Distillation is manual rewriting.** No auto-build, no pre-fill from parent Cards in the entry form.
2. **`wrong` is always flagged.** Hardcoded. No setting overrides this.
3. **Gold is terminal.** No `reviewableAt`. No Builder. No archiving on review.
4. **One source of truth per fact.** Tier on Page; rating history in ReviewEvent. No duplicated derived state.
5. **No backend, ever.**
