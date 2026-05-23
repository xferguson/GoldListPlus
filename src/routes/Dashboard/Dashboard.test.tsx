import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../../App';

// ---------------------------------------------------------------------------
// TASK-010 AC-1: Dashboard exposes a "New Book" affordance that navigates to
// the dedicated /book/new route (ADR-008 amendment, not a modal).
//
// All assertions are scoped to the Dashboard route content (not Layout's
// global nav links) so a "Dashboard" nav link in Layout cannot accidentally
// satisfy the AC.
// ---------------------------------------------------------------------------

describe('TASK-010 AC-1: Dashboard "New Book" link affordance', () => {
  // kills: the Implementer rendering plain text "New Book" instead of a real
  // <Link> — RTL would still find the text but not the role. The role+name
  // selector is the DOM contract locked in the task notes.
  it('TASK-010 AC-1: Dashboard renders an accessible link named "New Book"', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /new book/i });
    expect(link).toBeInTheDocument();
  });

  // kills: pointing the affordance at /book (param route) or /new-book.
  // Under HashRouter, react-router-dom's <Link to="/book/new"> renders
  // href="#/book/new"; under MemoryRouter it renders href="/book/new".
  // Both forms terminate in `/book/new`, so the regex .endsWith form
  // anchored to the path tail catches a typo without depending on which
  // Router shell wraps the test.
  it('TASK-010 AC-1: the "New Book" link href ends with "/book/new"', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /new book/i });
    const href = link.getAttribute('href') ?? '';
    expect(href).toMatch(/\/book\/new$/);
  });

  // kills: a deceptive <button onClick={navigate(...)}> that satisfies the
  // text label but not the locked "<Link>" DOM contract. PRD §5.1 and TASKS.md
  // both specify a routed affordance, not an imperative onClick — important
  // for back-button + deep-linkability of /book/new.
  it('TASK-010 AC-1: the "New Book" affordance is an <a> element (semantic link)', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /new book/i });
    expect(link.tagName).toBe('A');
  });

  // The end-to-end click test: confirms the Dashboard link actually drives the
  // route table to the NewBook screen. This is the strongest AC-1 assertion —
  // any of the previous tests could pass in isolation while the wiring is
  // wrong; this one exercises the full Dashboard → Router → NewBook trip.
  //
  // kills: a "New Book" link with the right href that nonetheless fails to
  // resolve a matching route (e.g. /book/new not registered, or registered
  // AFTER /book/:bookId so the param route eats the literal "new").
  it('TASK-010 AC-1: clicking the link navigates to NewBook (route-new-book marker appears)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    // Pre-condition: we start on the Dashboard, not NewBook.
    expect(screen.getByTestId('route-dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('route-new-book')).not.toBeInTheDocument();

    const link = screen.getByRole('link', { name: /new book/i });
    await user.click(link);

    // Post-condition: the NewBook route marker is now present, and the
    // Dashboard marker is gone (only one route renders at a time).
    expect(screen.getByTestId('route-new-book')).toBeInTheDocument();
    expect(screen.queryByTestId('route-dashboard')).not.toBeInTheDocument();
  });
});
