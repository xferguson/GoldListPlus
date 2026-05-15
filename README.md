# Gold List Plus

A Progressive Web App that implements the **Gold List Method** of language learning, using Anki-style flashcards purely as the testing mechanism during distillation reviews. Static site, deploys to GitHub Pages, fully offline, no backend.

## Stack

- Vite 6 + React 19 + TypeScript (strict, `noUncheckedIndexedAccess`, `noImplicitOverride`)
- Tailwind CSS v4
- Dexie 4 over IndexedDB (with `fake-indexeddb` in tests)
- Zustand 5 for ephemeral session state
- React Router 7 (HashRouter, for GH Pages compatibility)
- vite-plugin-pwa (Workbox, `registerType: 'autoUpdate'`)
- Recharts for stats
- Vitest 3 + React Testing Library
- ESLint flat config

## Quick start

```bash
npm install
npm run dev         # localhost:5173
npm run test        # vitest run
npm run typecheck   # tsc -b --noEmit
npm run lint        # eslint .
npm run build       # production build into dist/
npm run preview     # serve dist/ on localhost:4173
```

## Docs

The canonical specs live under [`docs/`](docs/):

- [`docs/PRD.md`](docs/PRD.md) — product requirements, including the sacred rules in §8 that override everything else.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack, module map, layering rules, ADRs, dependency ledger.
- [`docs/TASKS.md`](docs/TASKS.md) — the work queue with acceptance criteria per task.

Working notes for contributors (including the subagent workflow) are in [`CLAUDE.md`](CLAUDE.md).

## Deployment

GitHub Pages, served from `/GoldListPlus/`. Configured in [`vite.config.ts`](vite.config.ts). Manifest `scope` and `start_url` track the same base path.
