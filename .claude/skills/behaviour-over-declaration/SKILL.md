---
name: behaviour-over-declaration
description: Use when writing tests for any task whose acceptance criteria mention a schema, index, configuration, mapping table, registration, or any declarative wiring. Forces tests to assert observable behaviour with realistic inputs rather than relying on framework error-throws or symbol existence to prove a declaration. Trigger especially when the SUT is Dexie schema strings, route tables, validator registries, config exports, or any code where "the thing exists" and "the thing works correctly" are different claims that need different assertions.
---

# behaviour-over-declaration

## When to invoke

Read and apply this skill before writing tests if **any** of the following is true:

- The acceptance criteria mention a *schema*, *index*, *route*, *mapping*, *registration*, *config*, or *declaration*.
- The system under test is a declarative table, a Dexie `version().stores()`, a route record, a feature-flag map, a Zod/io-ts schema, or any other "wiring" surface.
- Your draft assertion could plausibly pass against an **empty input**, a **default value**, or because **the framework throws on a missing symbol** (rather than because your code did the right thing).

If none of those fire, this skill probably doesn't apply.

## The core rule

> If the test only passes because the library throws on a missing thing, you've tested the library, not your code. Force a positive assertion with real data.

## Rules

1. **No tautologies via framework errors.** Asserting that `await dexieDb.X.where('Y').equals('Z').toArray()` resolves to `[]` proves that `Y` is *declared* as an index (because Dexie throws on un-indexed `where()`), but it does NOT prove your code uses the right keypath or that the index would correctly discriminate when data is present. Replace with a positive assertion using real rows.

2. **Every index, route, mapping, or registration gets at least one round-trip with 2+ rows.** Insert one row that should match and one that should not, then query, then assert exactly the matching set comes back.

3. **Compound keys need a "false positive" row.** For a compound `[a+b]`, write at least one row that matches the first component but not the second. Otherwise the test only proves the *leading* component is indexed; the trailing component could be silently ignored and the test would still pass.

4. **Boundary rows for range indexes.** For any `.below()`, `.above()`, `.between()` you expect downstream code to use, insert rows at the inclusive edge, the exclusive edge, and just outside. Off-by-one in range queries is a classic regression that empty-table tests miss.

5. **Type tests are separate from behaviour tests.** A `expectTypeOf<X>().toEqualTypeOf<Y>()` is a compile-time check; it does not substitute for a runtime assertion on the same surface. If you want both, write both.

6. **Name tests by the contract clause they enforce, not by the symbol.** `it('pages.bookId returns only pages in the requested book')` forces the test to actually verify that contract. `it('has index on pages.bookId')` lets you get away with a tautology.

7. **One AC, one focused test.** Don't bundle five indexes into a "schema smoke test" — the implementer cannot tell which clause is load-bearing. Split into one test per clause so failure messages are diagnostic.

## Worked example

Suppose the AC is "TASK-003 AC-2: indexes match `docs/ARCHITECTURE.md` §4".

**Before this skill** (tautology via framework error):

```ts
it('has index on pages.bookId', async () => {
  await expect(
    db.pages.where('bookId').equals('nope').toArray(),
  ).resolves.toEqual([]);
});
```

This passes the moment `bookId` appears anywhere in the schema string. A typo (`bokId`) would still throw `SchemaError`, the test would fail for the right reason — but a *wrong but well-formed* keypath (e.g. the schema string accidentally lists `pageId` where `bookId` was intended) would still resolve to `[]` and the test would silently pass.

**After this skill** (positive assertion with real data):

```ts
it('pages.bookId returns only pages in the requested book', async () => {
  await db.pages.bulkAdd([
    { id: 'p1', bookId: 'L1', /* ... */ },
    { id: 'p2', bookId: 'L1', /* ... */ },
    { id: 'p3', bookId: 'L2', /* ... */ },
  ]);
  const rows = await db.pages.where('bookId').equals('L1').toArray();
  expect(rows.map(r => r.id).sort()).toEqual(['p1', 'p2']);
});
```

Now a wrong keypath fails loudly with the wrong rows rather than silently passing with `[]`. Extract the pattern into a typed `assertIndexFilters(table, indexName, matchingValue, nonMatchingValue, rowFactory)` helper once you have more than 2-3 such tests — drift in setup hides drift in coverage.

## What this skill does NOT help with

- **Ordering / sort correctness** — write explicit ordering tests for any contract that promises an order.
- **Pagination / cursor correctness** — write boundary tests around limits and offsets.
- **Transaction atomicity** — write rollback-on-failure tests separately; this skill only addresses point-in-time read correctness.
- **AC that are themselves wrong or missing** — that is a Tech Lead concern; this skill cannot fix a faulty spec.
- **Pure-logic tests that already use exhaustive table-driven inputs** — the skill is redundant there; trust the matrix.
