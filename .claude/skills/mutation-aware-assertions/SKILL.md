---
name: mutation-aware-assertions
description: Use this skill any time tests are about to be written, especially for tests of declarative configuration (schemas, indexes, routes, validators, type guards) or code where assertions could pass against empty/null/default inputs. Forces a written mutation-survival check before committing each test — name a plausible mutation to production code that the test would survive, and if that mutation breaks the feature, strengthen the test before writing it.
---

# mutation-aware-assertions

## When to invoke

Read and apply this skill before writing tests, particularly when:

- The acceptance criteria are declarative (schemas, indexes, mappings, registrations, configurations).
- The system under test has assertion surfaces where empty / null / default values would also satisfy the assertion.
- The test you're about to write is short, mechanical, and "obvious" — those are the tests most likely to be tautologies in disguise.
- You're about to write N similar tests (one per index, one per validator, one per route). Apply the matrix rule (#3 below) instead.

If you're writing exhaustive table-driven tests against pure functions (e.g. a 4×8 ratings-times-settings matrix), this skill is mostly redundant — the matrix itself is the mutation oracle.

## The core rule

> Before writing each test, **name one plausible mutation to production code that this test would still pass under**. If that mutation breaks the feature, strengthen the test before you commit it.

This is mutation testing applied by hand. You don't need a tool. You need the discipline of explicitly naming the regression you're failing to catch, *while you still have time to fix it*.

## Rules

1. **Mutation challenge — written, per test.** For every assertion, name one production-code mutation it would survive. If that mutation breaks the feature, strengthen the test. Examples of mutations to try: swap two field names, invert a boolean flag, change `===` to `!==`, change `<` to `<=`, return early before the work happens.

2. **Empty-input ban.** Never assert "returns `[]`" / "returns `undefined`" / "throws nothing" as the *only* coverage of a behaviour. Always pair with a positive case where real data is present and the result should be non-empty / non-default.

3. **Cover the matrix, not the spec line.** When AC enumerates N items (indexes, ratings, tiers, validators), strongly prefer **one fixture-driven test** that exercises all N with discriminating data over N independent existence checks. A single mutation often regresses several items at once; one rich test catches it; N shallow tests might miss it.

4. **Discriminating fixtures.** Every fixture used in a filter / query / discrimination test must contain at least one row that should match AND one that should not, for each predicate under test. The non-matching row is what proves the filter is doing work.

5. **Assert the filter, not the call.** If the SUT is "this query filters by X," the test must include a row where X differs and verify it is excluded — not just that the query *resolves*.

## Worked example

The recent TASK-003 cycle is the canonical case. The AC said "indexes match §4." The test author chose nine short tests:

```ts
it('pages.bookId index resolves a where().equals() query', async () => {
  await db.open();
  await expect(
    db.pages.where('bookId').equals('nonexistent').toArray(),
  ).resolves.toEqual([]);
});
```

The mutation challenge for this test: *swap `bookId` for `title` in the production schema string.* The test still passes — the table is empty, so the result is `[]` regardless of which keypath the query traverses. That mutation breaks the feature. Therefore the test is too weak; strengthen it.

The strengthened version, written under this skill, is a fixture-driven test that seeds rows differing on the indexed field and asserts the query returns exactly the matching subset. Now the swap mutation breaks the test, as it should.

For an AC that enumerates N indexes, apply rule 3: rather than nine independent existence checks, write one test that seeds a few rows of each row type and exercises every declared index against discriminating data. Far fewer lines, much higher mutation-survival score.

## How to apply quickly

A 10-second checklist to run silently before committing each test:

- [ ] Can this test pass against an empty input or a default value? If yes, strengthen.
- [ ] If I swap two adjacent identifiers in the production code (a field name, a key, a comparison operator), does the test still pass? If yes, strengthen.
- [ ] If I return the input unchanged from the function under test, does the test still pass? If yes, strengthen.
- [ ] Is this the Nth nearly-identical test in this file? If yes, can I collapse it into a fixture-driven matrix test? Prefer the matrix.

## What this skill does NOT help with

- **AC that are themselves wrong or missing** — a Tech-Lead problem. This skill takes AC as given.
- **Integration boundaries where the "right" fixture is unclear** — e.g. service-worker lifecycle, real timer races, network failure injection. The skill says "use discriminating data" but does not tell you what *discriminates* in those contexts.
- **Performance / load assertions** — mutation-survival is the wrong frame; throughput tests need their own discipline.
- **Pure-logic tests that already use exhaustive table-driven inputs** — the table itself is the mutation oracle; the skill is redundant.
- **Tests of UI states / accessibility / visual regressions** — the skill is about logical coverage, not pixel coverage.
