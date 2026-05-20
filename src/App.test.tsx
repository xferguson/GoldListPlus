import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './App';

// Source-level scan of App.tsx and Layout.tsx via vite ?raw — mirrors the
// pattern used in src/lib/tiers.test.ts AC-6. Lets us assert "no BrowserRouter
// import" and "no `/about` literal" without coupling to runtime behaviour.
const APP_SOURCE_MODULES = import.meta.glob('./App.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const APP_SOURCE: string = APP_SOURCE_MODULES['./App.tsx'] ?? '';

const LAYOUT_SOURCE_MODULES = import.meta.glob('./routes/Layout.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const LAYOUT_SOURCE: string = LAYOUT_SOURCE_MODULES['./routes/Layout.tsx'] ?? '';

// ---------------------------------------------------------------------------
// TASK-007 AC-1: App uses HashRouter (ADR-004), not BrowserRouter
// ---------------------------------------------------------------------------

describe('TASK-007 AC-1: App.tsx routing primitive', () => {
  // kills: swapping HashRouter for BrowserRouter (ADR-004 violation — GH Pages 404s).
  it('TASK-007 AC-1: App.tsx imports HashRouter from react-router-dom', () => {
    expect(APP_SOURCE.length).toBeGreaterThan(0);
    // Match any import shape that brings in HashRouter from react-router-dom.
    const hashImport =
      /import\s+\{[^}]*\bHashRouter\b[^}]*\}\s+from\s+['"]react-router-dom['"]/;
    expect(hashImport.test(APP_SOURCE)).toBe(true);
  });

  // kills: leaving BrowserRouter in the file alongside HashRouter (would be confusing
  // and would break the GH Pages refresh-on-hash invariant).
  it('TASK-007 AC-1: App.tsx does NOT import BrowserRouter', () => {
    expect(APP_SOURCE.includes('BrowserRouter')).toBe(false);
  });

  // kills: removing HashRouter from the runtime tree entirely (the source scan
  // alone would still pass if HashRouter is imported but never used).
  it('TASK-007 AC-1: App.tsx references HashRouter in runtime markup, not just an import', () => {
    // After the import statement, HashRouter must appear at least once more
    // (as a JSX tag or factory call).
    const occurrences = APP_SOURCE.match(/HashRouter/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// TASK-007 AC-2 + AC-3 + AC-4: route table behaviour
//
// Contract locked here: App.tsx exports `AppRoutes`, a React component
// containing the full <Routes> tree. Tests wrap it in their own MemoryRouter;
// production wraps it in HashRouter inside <App/>. Layout must be reachable
// through AppRoutes so the nav renders alongside each route marker.
// ---------------------------------------------------------------------------

type RouteCase = {
  readonly path: string;
  readonly testId: string;
  readonly displayName: string;
  readonly paramName?: string;
  readonly paramValue?: string;
};

const ROUTE_CASES: readonly RouteCase[] = [
  { path: '/', testId: 'route-dashboard', displayName: 'Dashboard' },
  {
    path: '/book/BK_01HXYZ',
    testId: 'route-book',
    displayName: 'Book',
    paramName: 'bookId',
    paramValue: 'BK_01HXYZ',
  },
  {
    path: '/list/PG_01HXYZ',
    testId: 'route-list-detail',
    displayName: 'List',
    paramName: 'pageId',
    paramValue: 'PG_01HXYZ',
  },
  {
    path: '/review/PG_REV01',
    testId: 'route-review',
    displayName: 'Review',
    paramName: 'pageId',
    paramValue: 'PG_REV01',
  },
  {
    path: '/distill/review/PG_DR001',
    testId: 'route-distill-review-summary',
    displayName: 'Distillation Review',
    paramName: 'pageId',
    paramValue: 'PG_DR001',
  },
  {
    path: '/distill/builder/PG_BLD01',
    testId: 'route-distill-builder',
    displayName: 'Distillation Builder',
    paramName: 'parentId',
    paramValue: 'PG_BLD01',
  },
  {
    path: '/distill/gold/PG_GD001',
    testId: 'route-distill-gold-summary',
    displayName: 'Gold Summary',
    paramName: 'pageId',
    paramValue: 'PG_GD001',
  },
  { path: '/stats', testId: 'route-stats', displayName: 'Stats' },
  { path: '/settings', testId: 'route-settings', displayName: 'Settings' },
];

const ALL_TEST_IDS: readonly string[] = [
  'route-dashboard',
  'route-book',
  'route-list-detail',
  'route-review',
  'route-distill-review-summary',
  'route-distill-builder',
  'route-distill-gold-summary',
  'route-stats',
  'route-settings',
  'route-not-found',
];

describe('TASK-007 AC-2 + AC-4: route table maps paths to placeholder components', () => {
  it.each(ROUTE_CASES)(
    'TASK-007 AC-2/AC-4: visiting $path renders the $testId placeholder',
    ({ path, testId }) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>,
      );
      // kills: swapping any path string with a sibling (e.g. /list → /lists,
      // /distill/review → /distill/reviews); only the matching placeholder
      // can render here.
      const marker = screen.getByTestId(testId);
      expect(marker).toBeInTheDocument();
    },
  );

  it.each(ROUTE_CASES)(
    'TASK-007 AC-3: visiting $path renders a <main> as the placeholder root and only one route-* marker',
    ({ path, testId }) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>,
      );
      const marker = screen.getByTestId(testId);
      // kills: rendering the marker inside a generic <div> instead of <main>
      // (AC-3 requires <main> for landmark/a11y).
      expect(marker.tagName).toBe('MAIN');

      // kills: route components leaking a second route-* marker (e.g. by
      // accidentally rendering NotFound alongside the matched route).
      const allMarkers = ALL_TEST_IDS.flatMap((id) => screen.queryAllByTestId(id));
      expect(allMarkers).toHaveLength(1);
    },
  );

  it.each(ROUTE_CASES)(
    'TASK-007 AC-3: $testId placeholder displays the human-readable name "$displayName"',
    ({ path, testId, displayName }) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>,
      );
      const marker = screen.getByTestId(testId);
      // kills: copy-paste error where every placeholder shows the same name
      // (e.g. "Dashboard" everywhere); the text inside the marker must
      // reflect the route, scoped to the marker so the nav links don't
      // accidentally satisfy this assertion.
      expect(within(marker).getByText(displayName)).toBeInTheDocument();
    },
  );
});

describe('TASK-007 AC-4: dynamic param routes display the parsed param', () => {
  // Filter to routes that have a param, then assert the param value appears
  // inside the matched marker. This proves the param was actually parsed by
  // React Router and consumed by the placeholder, not hard-coded.
  const PARAM_CASES = ROUTE_CASES.filter((c): c is RouteCase & {
    paramName: string;
    paramValue: string;
  } => c.paramName !== undefined && c.paramValue !== undefined);

  it.each(PARAM_CASES)(
    'TASK-007 AC-4: $testId on $path shows the $paramName value "$paramValue"',
    ({ path, testId, paramValue }) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>,
      );
      const marker = screen.getByTestId(testId);
      // kills: hard-coding the param display (e.g. always showing "abc"),
      // or using useParams with the wrong key (e.g. `useParams().id` when
      // the route declares `:bookId` → undefined → no text rendered).
      expect(within(marker).getByText(new RegExp(paramValue))).toBeInTheDocument();
    },
  );

  // A second discriminating value per param route — without this, a placeholder
  // that hard-coded the first fixture's value would still pass.
  it.each(PARAM_CASES)(
    'TASK-007 AC-4: $testId reflects a different param value when the URL changes',
    ({ path, paramValue, testId, paramName }) => {
      // Swap the param value in the path with a uniquely different one.
      const otherValue = `OTHER_${paramName}_VALUE`;
      const otherPath = path.replace(paramValue, otherValue);
      render(
        <MemoryRouter initialEntries={[otherPath]}>
          <AppRoutes />
        </MemoryRouter>,
      );
      const marker = screen.getByTestId(testId);
      // kills: a placeholder that ignores useParams() and renders a hard-coded
      // string. The test would fail because the literal param value is wrong.
      expect(within(marker).getByText(new RegExp(otherValue))).toBeInTheDocument();
    },
  );
});

describe('TASK-007 AC-2: wildcard route catches unmatched paths', () => {
  // kills: removing the `*` route or replacing it with `/404`. Without a
  // catch-all, an unknown URL renders nothing at all.
  it('TASK-007 AC-2: visiting /this/does/not/exist renders the NotFound placeholder', () => {
    render(
      <MemoryRouter initialEntries={['/this/does/not/exist']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('route-not-found')).toBeInTheDocument();
  });

  // kills: a wildcard placed too eagerly (e.g. `*` before `/stats`) that
  // would swallow a real route.
  it('TASK-007 AC-2: NotFound does NOT render when a real route matches', () => {
    render(
      <MemoryRouter initialEntries={['/stats']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('route-not-found')).not.toBeInTheDocument();
    expect(screen.getByTestId('route-stats')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TASK-007 AC-5: Layout renders nav + outlet/routes
// ---------------------------------------------------------------------------

describe('TASK-007 AC-5: Layout exists with global nav links', () => {
  it('TASK-007 AC-5: src/routes/Layout.tsx exists (raw import resolved)', () => {
    // kills: the Implementer forgetting to create Layout.tsx entirely.
    expect(LAYOUT_SOURCE.length).toBeGreaterThan(0);
  });

  it('TASK-007 AC-5: visiting / renders the Dashboard route AND the nav links from Layout', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    // Dashboard marker is present.
    expect(screen.getByTestId('route-dashboard')).toBeInTheDocument();
    // Layout's nav links are present alongside the route content. We look up
    // by accessible role+name (semantic links), not by data-testid or class.
    // kills: dropping Layout from the route tree (route content would render
    // but nav would disappear).
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /stats/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('TASK-007 AC-5: nav link to Stats points at /stats (not a dynamic deep link)', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    const statsLink = screen.getByRole('link', { name: /stats/i });
    // kills: nav linking Stats to /book/:bookId/stats or any dynamic path.
    // AC-5: "no deep links to dynamic routes" for the three nav targets.
    expect(statsLink.getAttribute('href')).toMatch(/\/stats$/);
  });

  it('TASK-007 AC-5: nav link to Settings points at /settings', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    const settingsLink = screen.getByRole('link', { name: /settings/i });
    // kills: typo'd Settings href (e.g. /setting).
    expect(settingsLink.getAttribute('href')).toMatch(/\/settings$/);
  });

  it('TASK-007 AC-5: nav links Dashboard/Stats/Settings are NOT pointed at dynamic routes', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    // None of the three top-level nav links may target a route that has
    // an URL parameter — AC-5 forbids "deep links to dynamic routes".
    const navLinks = [
      screen.getByRole('link', { name: /dashboard/i }),
      screen.getByRole('link', { name: /stats/i }),
      screen.getByRole('link', { name: /settings/i }),
    ];
    for (const link of navLinks) {
      const href = link.getAttribute('href') ?? '';
      // kills: shipping a nav link to /book/:bookId or similar.
      expect(href.includes(':')).toBe(false);
      // ':bookId' would be the literal symbol; an interpolated value like
      // /book/BK_01HXYZ also counts as "deep into a dynamic route". Cover
      // both by forbidding the known dynamic prefixes:
      expect(/^\/(book|list|review|distill)\b/.test(href)).toBe(false);
    }
  });

  it('TASK-007 AC-5: Layout.tsx source mentions the three nav targets', () => {
    // kills: the Layout file existing but containing no actual nav (e.g.
    // an empty stub component). Source-level check makes the regression
    // impossible to hide behind a route-tree refactor.
    expect(LAYOUT_SOURCE.includes('/stats')).toBe(true);
    expect(LAYOUT_SOURCE.includes('/settings')).toBe(true);
    // Dashboard link is `/` so we check for `to="/"` or `to='/'` substring.
    expect(/to=\{?["']\/["']/.test(LAYOUT_SOURCE)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TASK-007 AC-6: previous /about placeholder is removed
// ---------------------------------------------------------------------------

describe('TASK-007 AC-6: previous /about placeholder is removed', () => {
  it('TASK-007 AC-6: App.tsx source contains no literal "/about"', () => {
    // kills: leaving the old TASK-002 placeholder behind. The TASK-007
    // route table is exhaustive; /about is not on it.
    expect(APP_SOURCE.includes('/about')).toBe(false);
  });

  it('TASK-007 AC-6: visiting /about falls through to NotFound', () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    // kills: leaving a dedicated /about route in the table that renders an
    // "About" placeholder. With /about removed, the wildcard must catch it.
    expect(screen.getByTestId('route-not-found')).toBeInTheDocument();
    expect(screen.queryByText(/about/i)).not.toBeInTheDocument();
  });
});
