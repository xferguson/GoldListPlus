# Architecture — Gold List Plus

> **Maintained by the tech-lead subagent.** Records architectural decisions (ADRs), the module map, and cross-cutting rules. Implementers and Reviewers enforce what's written here.

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Build / dev | **Vite** | Fast HMR, first-class TS, easy GH Pages deploy with `base`. |
| Framework | **React 18 + TypeScript (strict)** | User preference; type safety on distillation logic. |
| Styling | **Tailwind CSS** | Mobile-first utility classes; no runtime CSS-in-JS overhead. |
| State | **Zustand** | Lightweight, no provider boilerplate, fits a single-tenant local app. |
| Routing | **React Router with HashRouter** | GitHub Pages serves `404.html` for unknown sub-paths; hash routing avoids that. |
| Storage | **Dexie.js over IndexedDB** | Typed tables, simple migrations, well-tested wrapper. |
| PWA | **vite-plugin-pwa (Workbox)** | Manifest, SW precache, runtime caching, auto-update prompt — all in one plugin. |
| Charts | **Recharts** | React-native, tree-shakable. |
| Testing | **vitest + React Testing Library + fake-indexeddb** | Co-located unit tests, fast watcher, real Dexie against in-memory IDB. |
| CI/CD | **GitHub Actions → `actions/deploy-pages`** | Native Pages deployment, no third-party tokens. |

## 2. Module map

```
src/
├── main.tsx                     # entry, mounts <App/>, registers SW
├── App.tsx                      # router + global layout shell
├── db/
│   ├── db.ts                    # Dexie schema, tables, migrations
│   ├── ids.ts                   # ULID helpers
│   └── repos/
│       ├── books.ts             # Book CRUD
│       ├── pages.ts             # List CRUD, due queries
│       ├── cards.ts             # Card CRUD, archive
│       └── reviews.ts           # ReviewEvent append + queries
├── lib/
│   ├── distillation.ts          # pure: flagCardForDistillation, flagsForPage, nextTier, finalizePage
│   ├── tiers.ts                 # tier constants, visual mapping (colour, label, border)
│   ├── time.ts                  # pure date math helpers
│   ├── sync/
│   │   ├── exportImport.ts      # versioned JSON dump + restore
│   │   └── fileHandle.ts        # File System Access pinned-file
│   └── notifications.ts         # permission, on-open notifier, TimestampTrigger feature-detect
├── stores/
│   ├── useAppStore.ts           # current Book, theme
│   └── useReviewSessionStore.ts # in-flight review state
├── routes/
│   ├── Dashboard/
│   ├── Book/                    # per-Book overview
│   ├── ListDetail/
│   ├── Review/                  # flashcard flow
│   ├── Distill/
│   │   ├── ReviewSummary/       # post-review flag screen
│   │   └── Builder/             # next-list builder
│   ├── Stats/
│   └── Settings/
├── components/
│   ├── TierBadge.tsx
│   ├── TierBorder.tsx
│   ├── Flashcard.tsx
│   ├── RatingButtons.tsx
│   └── Modal.tsx
└── index.css                    # Tailwind entry
```

## 3. Layering rules (enforced in review)

1. **UI never imports Dexie or `src/db/db.ts` directly.** UI imports repos.
2. **`src/lib/**` (except `src/lib/sync/fileHandle.ts`) is pure.** No React, no Dexie, no `window` access.
3. **Repos own all Dexie I/O.** They expose typed async functions that return plain objects, never `Table` instances or `Collection`s.
4. **Zustand stores hold only ephemeral session state.** Persistent data lives in IndexedDB. Stores may cache reads but never become the source of truth.
5. **`finalizePage`** in `src/lib/distillation.ts` returns a *plan* (new List + new Cards + parent-archive list). A repo function `pages.finalize(plan)` executes the plan inside a single Dexie transaction.
6. **No global `Date.now()` calls in `src/lib/**`.** Functions accept a `now: number` parameter. Tests inject. UI passes `Date.now()` at the call site.

## 4. Data model (canonical)

> The canonical row types (`Book`, `BookSettings`, `Page`, `Card`, `ReviewEvent`, `Tier`, `Rating`) are exported from `src/db/db.ts`. Repos and `src/lib/**` import types from there; there is no separate `src/db/types.ts`.

```ts
type Tier = 'bronze' | 'silver' | 'gold';
type Rating = 'wrong' | 'hard' | 'moderate' | 'easy';

type Book = {
  id: string;
  name: string;
  sourceLang: string;
  targetLang: string;
  settings: BookSettings;
  createdAt: number;
};

type BookSettings = {
  distillationIntervalDays: number; // default 14
  headlistSize: number;             // default 25 (soft warn)
  autoDropOnEasy: boolean;          // default true
  autoDropOnModerate: boolean;      // default true
  autoDropOnHard: boolean;          // default false
  // autoDropOnWrong is NOT a setting; `wrong` is always flagged.
};

type Page = {
  id: string;
  bookId: string;
  title: string;
  tier: Tier;
  createdAt: number;
  reviewableAt: number | null;  // null only for tier === 'gold'
  reviewedAt?: number;
  cardIds: string[];
  parentPageId?: string;
  childPageId?: string;
  lastNotifiedAt?: number;
};

type Card = {
  id: string;
  bookId: string;
  pageId: string;
  source: string;
  target: string;
  createdAt: number;
  parentIds?: string[];
  archivedAt?: number;
};

type ReviewEvent = {
  id: string;
  cardId: string;
  pageId: string;
  rating: Rating;
  reviewedAt: number;
};
```

### Indexes (Dexie schema, version 1)

| Table | Schema string | Rationale |
|---|---|---|
| `books` | `'id'` | Primary-key lookup (`books.get`) and full-table scan for `books.list`. No secondary indexes — Books are few and always enumerated. |
| `pages` | `'id, bookId, reviewableAt, [bookId+tier]'` | `bookId` powers `pages.listByBook` and cascade delete; `reviewableAt` powers `pages.listDue(now)` (range query, naturally excludes `null` Gold pages); compound `[bookId+tier]` powers the tier-grouped Book overview (TASK-016 AC-2). |
| `cards` | `'id, pageId, bookId, archivedAt'` | `pageId` powers `cards.listByPage` and List-detail views; `bookId` powers Book cascade delete; `archivedAt` lets future queries filter live vs. archived Cards without a table scan. |
| `reviews` | `'id, cardId, pageId, reviewedAt'` | `cardId` powers `reviews.listByCard`; `pageId` powers `reviews.listByPage` and `reviews.latestPerCardForPage`; `reviewedAt` powers stats time-window queries. |

Notes:
- The primary key is the leading bare field (`id`, a ULID — see ADR / §6).
- Secondary single-field indexes are comma-separated bare fields after the primary key.
- Compound indexes use the `[a+b]` syntax and are added only where a known query needs them.
- Array fields (`Page.cardIds`, `Card.parentIds`) are **not** indexed. Dexie multi-entry indexes (`*field`) have edge cases (uniqueness, ordering, large arrays); we instead query from the linking field on the other side (e.g. `cards.listByPage(pageId)` uses the `pageId` index on `cards`).
- Any future index addition is a schema-version bump in `src/db/db.ts` with a migration, not an edit to the version-1 strings above.

## 5. ADRs

### ADR-001: Tier as string union, not numeric stage
**Decision:** Use `'bronze' | 'silver' | 'gold'`.
**Alternatives:** numeric stage 0/1/2.
**Why:** Readability in DB inspector and exports; product copy maps 1:1; `nextTier()` is a tiny lookup. Numbers tempt arithmetic (`stage + 1`) which makes "Gold is terminal" easier to forget.

### ADR-002: Single archive flag
**Decision:** Card has `archivedAt: number | undefined`. No boolean `archived`.
**Why:** Two redundant fields drift. `archivedAt` is both the flag and the audit timestamp.

### ADR-003: Keep `ReviewEvent` log
**Decision:** Store every rating as a separate `ReviewEvent`, never collapse to `latestRating` on Card.
**Why:** History powers stats (retention curves, accuracy trends), allows post-hoc re-flagging if settings change, and provides an audit trail. Storage is trivial.

### ADR-004: HashRouter
**Decision:** Use `HashRouter` from `react-router-dom`.
**Why:** GitHub Pages returns `404.html` for sub-paths under a project page; without HashRouter every refresh on `/books/abc` 404s. The hash fragment is invisible to the server and the SPA handles routing client-side.

### ADR-005: `finalizePage` returns a plan, a repo applies it
**Decision:** Distillation finalize logic in `src/lib/distillation.ts` is pure: input is the parent Page + builder inputs, output is `{ childPage, newCards, archivedCardIds }`. `pages.finalize(plan)` writes all of it inside one Dexie transaction.
**Why:** Pure logic is unit-testable without a DB. The transaction guarantees atomicity even if the SW kills the page mid-write.
**Implementation note:** `pages.finalize` derives its single timestamp from `plan.childPage.createdAt`; parent `reviewedAt`, parent-card `archivedAt`, and the child Page's `createdAt` all share that instant. Callers should not pass `now` separately.

### ADR-006: Soft warn on headlist size
**Decision:** Don't enforce the 25-item cap. Show a warning if the user adds the 26th Card or finalizes with fewer than ~15.
**Why:** Gold List tradition is 25 but users have legitimate reasons to vary.

### ADR-007: Distillation Builder modal does not pre-fill
**Decision:** When the user selects parent Cards and opens the entry form, source and target inputs are empty.
**Why:** Manual rewriting is the *point* of the method. Pre-filling defeats it. PRD §8 sacred rule #1.

### ADR-008: Flat route table; Layout wraps `<Routes>`
**Decision:** The route tree is a single flat `<Routes>` with no nested `<Route>` parents. A `routes/Layout.tsx` component renders the persistent header/nav around `<Routes>` (or via an `<Outlet/>` if a one-level wrapper is later introduced). Paths are stable: `/`, `/book/:bookId`, `/list/:pageId`, `/review/:pageId`, `/distill/review/:pageId`, `/distill/builder/:parentId`, `/distill/gold/:pageId`, `/stats`, `/settings`, `*`.
**Alternatives considered:** Nested routes with a `Book` parent owning `ListDetail` children; a file-system convention (TanStack Router / Remix style).
**Why flat:** The screens have no shared layout *beyond* the global header — a `Book` route is not a visual frame around `ListDetail`; they are sibling views you navigate between. Flat routes keep `App.tsx` legible, keep params local to each screen, and avoid `useOutletContext` plumbing for data already loaded via repos. The placeholder route IDs are an API contract for tests (`data-testid="route-…"`) so the QA Engineer can write router tests in TASK-007 without coupling to component internals.

### ADR-009: `Modal` renders into a portal on `document.body`
**Decision:** `src/components/Modal.tsx` uses `createPortal` to render into `document.body`. The component owns its own `role="dialog"` / `aria-modal="true"` markup and dismisses on Escape and backdrop click; clicking inside the dialog content does not dismiss.
**Alternatives considered:** Inline rendering (no portal); the native `<dialog>` element; a third-party headless library (Radix, Headless UI).
**Why portal + custom:** Inline rendering breaks z-index stacking under Tailwind's transform/overflow ancestors. Native `<dialog>` has uneven Safari behaviour and styling pain points. Headless UI / Radix would be the right call if we needed focus traps, multi-stack, and animations — for v1 a 50-line component covers our two use cases (entry modal, finalize confirm). When a third modal use-case lands or focus-trapping is required, revisit and consider Radix Dialog.
**Out of scope for v1:** focus trap, stacked modals, scroll-lock — listed as known gaps in TASK-008's "out of scope" so a future ADR can supersede.

### ADR-010: `useReviewSessionStore` is in-memory only; ReviewEvents persist via repo
**Decision:** The review-session Zustand store (`src/stores/useReviewSessionStore.ts`) holds only ephemeral session state: current page id, card-id array, current index, flip state, in-session ratings map. It does NOT persist to IndexedDB and does NOT append `ReviewEvent`s. The Review route (TASK-012) is responsible for calling `reviews.append(...)` at the moment of each rating; the store's `ratings` map is a UI-side cache used to drive the post-review Distillation Review screen without re-querying.
**Alternatives considered:** Persist the session via Zustand `persist` middleware so a refresh mid-review resumes; collapse `ratings` into auto-appended `ReviewEvent`s inside the store.
**Why:** ADR-003 keeps `ReviewEvent` the source of truth for rating history — letting the store also write events would split that responsibility. Mid-review resume is a nice-to-have but introduces edge cases (stale `cardIds` after a Card edit, half-persisted ratings) that are not worth the cost for v1; the user simply re-starts the review. The store stays pure-reducer-shaped so it is testable without React.

## 6. Cross-cutting rules

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`.
- No `any`. No `@ts-ignore`. Use `@ts-expect-error` with a comment when truly necessary.
- No `eslint-disable` without a one-line justification next to it.
- One default export per file maximum (prefer named).
- Component files: PascalCase. Library / repo files: camelCase.
- All IDs are ULIDs (`src/db/ids.ts` wraps a tiny ULID generator).
- All times are millisecond Unix epochs. No `Date` objects in data layer.

### File-size limits

One responsibility per file. The intent is readability, testability, and preventing god-modules that quietly accrete unrelated logic. Limits below are drawn from common conventions (Sonar/CodeClimate ~250–500 lines, React community ~200–300 for components, tighter caps for pure-logic and store modules where focus matters most). Targets are the soft expectation; hard caps are the kickback threshold.

| Bucket | Target (lines) | Hard cap (lines) |
|---|---|---|
| `src/lib/**` (pure logic) | 150 | 200 |
| `src/db/repos/*.ts` | 150 | 200 |
| `src/db/db.ts`, `src/db/ids.ts` | 100 | 150 |
| `src/components/*.tsx` | 200 | 300 |
| `src/routes/**` | 250 | 350 |
| `src/stores/*.ts` | 100 | 150 |
| `*.test.ts` / `*.test.tsx` | 400 | 600 |
| Config (`vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `vitest.setup.ts`) | — | — (uncapped) |
| Docs (`docs/*.md`, `README.md`, `CLAUDE.md`) | — | — (uncapped; use H2/H3 sectioning) |
| Generated (`package-lock.json`, `public/icons/*`) | — | — (uncapped) |

Line counts include code and comments but exclude trailing blank lines.

- **Exceeding the hard cap:** the preferred response is to split the file by responsibility (extract a helper module, a sub-component, or a focused repo function). Do **not** relax the cap as a first move.
- **Documented exception:** if splitting genuinely does not make sense (e.g. a single cohesive state machine that loses clarity when split), add a one-line `// rationale-for-size: <reason>` comment at the top of the file **and** record the exception in the relevant task in `TASKS.md`. Exceptions are visible by design.
- **Enforcement:** these limits are a review rule, not a CI gate. The code-reviewer checks on first pass; the tech-lead audits the full diff against this table on the second pass and kicks back violations.

## 7. PWA configuration constraints

- `vite.config.ts` `base: '/GoldListPlus/'` (matches GH Pages repo name).
- `vite-plugin-pwa`:
  - `registerType: 'autoUpdate'`
  - `manifest.scope` and `manifest.start_url` both set to the base path.
  - `workbox.navigateFallback: 'index.html'` so deep hash routes hydrate.
- `public/.nojekyll` to disable Jekyll on Pages.

## 8. Dependency ledger

| Package | Purpose | Alternative considered |
|---|---|---|
| react, react-dom | UI runtime | preact (smaller, but tooling friction) |
| react-router-dom | routing (HashRouter) | wouter (lighter, but smaller community) |
| dexie | IndexedDB wrapper | idb (lower-level, more boilerplate) |
| zustand | state | jotai (atoms work, but Zustand stores are simpler for this scope) |
| tailwindcss | styling | vanilla CSS modules (Tailwind wins for speed) |
| recharts | charts | visx (more flexible but more code) |
| vite-plugin-pwa | PWA tooling | manual SW (re-implementing Workbox is unwise) |
| ulid | ID generation | uuid (ULIDs sort by time, useful for export) |
| vitest | test runner | jest (vitest is the natural Vite pair) |
| @testing-library/react | component tests | enzyme (deprecated) |
| fake-indexeddb | Dexie in tests | mocking Dexie (always wrong) |

Adding a new dependency requires an entry here with a justification and at least one alternative considered.
