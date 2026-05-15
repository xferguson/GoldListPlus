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

### ADR-006: Soft warn on headlist size
**Decision:** Don't enforce the 25-item cap. Show a warning if the user adds the 26th Card or finalizes with fewer than ~15.
**Why:** Gold List tradition is 25 but users have legitimate reasons to vary.

### ADR-007: Distillation Builder modal does not pre-fill
**Decision:** When the user selects parent Cards and opens the entry form, source and target inputs are empty.
**Why:** Manual rewriting is the *point* of the method. Pre-filling defeats it. PRD §8 sacred rule #1.

## 6. Cross-cutting rules

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`.
- No `any`. No `@ts-ignore`. Use `@ts-expect-error` with a comment when truly necessary.
- No `eslint-disable` without a one-line justification next to it.
- One default export per file maximum (prefer named).
- Component files: PascalCase. Library / repo files: camelCase.
- All IDs are ULIDs (`src/db/ids.ts` wraps a tiny ULID generator).
- All times are millisecond Unix epochs. No `Date` objects in data layer.

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
