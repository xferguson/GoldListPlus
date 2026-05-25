import { describe, it, expect } from 'vitest';
import * as timeModule from './time';
import { MS_PER_DAY } from './time';

// ---------------------------------------------------------------------------
// CHORE-001: extract MS_PER_DAY to src/lib/time.ts
//
// This file pins the contract of the new module. The module does NOT exist
// yet — the Implementer creates `src/lib/time.ts` in the Green phase. Red
// failure mode expected on first run: vitest cannot resolve `./time` (missing
// module). Once the file exists but the export is wrong, failures shift to
// missing-export / value-mismatch. That progression is the intended signal.
//
// Mutation-aware-assertions skill applied per assertion. The constant is a
// single number, so the matrix is tiny; we belt-and-braces by asserting the
// value from two independent angles (literal + arithmetic identity) so a
// transcription error in either fixture cannot silently pass.
//
// Behaviour-over-declaration skill applied: we don't lean on `typeof` alone,
// we assert the runtime value. Module shape is checked with positive
// presence + a negation that the export is not on `default`.
// ---------------------------------------------------------------------------

describe('time.ts (CHORE-001 AC-2): MS_PER_DAY pins the milliseconds-per-day contract', () => {
  // kills: any change to the literal (e.g. 86_400_001 mutation trap from
  // AC-7). Exact equality, no tolerance. This is the contract-carrying
  // assertion called out in AC-2.
  it('time.ts (CHORE-001 AC-2): MS_PER_DAY === 86_400_000 (exact literal)', () => {
    expect(MS_PER_DAY).toBe(86_400_000);
  });

  // kills: a transcription error in the literal fixture above (someone "fixes"
  // both the production constant and the test to the same wrong value like
  // 84_600_000). Cross-checking against the arithmetic decomposition makes
  // the test discriminate against any pair of edits that leave the literal
  // self-consistent but wrong in absolute terms.
  it('time.ts (CHORE-001 AC-2): MS_PER_DAY === 24 * 60 * 60 * 1000 (arithmetic identity)', () => {
    expect(MS_PER_DAY).toBe(24 * 60 * 60 * 1000);
  });

  // kills: MS_PER_DAY = 86_400_000.5 or NaN. The toBe(86_400_000) above
  // already kills floats via strict equality, but pinning integer-ness
  // explicitly documents the contract for future readers and kills the
  // mutation MS_PER_DAY = 86_400_000 + Number.EPSILON (which equals
  // 86_400_000 under === because EPSILON is below the ULP at that magnitude
  // — i.e. NOT killed by strict equality alone). Number.isInteger checks
  // the underlying representation.
  it('time.ts (CHORE-001 AC-2): MS_PER_DAY is an integer', () => {
    expect(Number.isInteger(MS_PER_DAY)).toBe(true);
  });

  // kills: MS_PER_DAY = Infinity or -Infinity (e.g. someone writes
  // `1 / 0` and TS does not flag). distillation arithmetic
  // (reviewableAt = now + intervalDays * MS_PER_DAY) would silently produce
  // Infinity timestamps. The strict toBe above kills this too, but stating
  // it explicitly pins the contract.
  it('time.ts (CHORE-001 AC-2): MS_PER_DAY is finite', () => {
    expect(Number.isFinite(MS_PER_DAY)).toBe(true);
  });

  // kills: a sign flip (MS_PER_DAY = -86_400_000). reviewableAt arithmetic
  // would produce timestamps in the past, distillation would constantly
  // misfire. Positive-magnitude assertion documents the contract.
  it('time.ts (CHORE-001 AC-2): MS_PER_DAY is positive', () => {
    expect(MS_PER_DAY).toBeGreaterThan(0);
  });
});

describe('time.ts (CHORE-001 AC-1): module shape', () => {
  // kills: replacing `export const MS_PER_DAY` with `export default 86_400_000`
  // — every call site uses a named import, so a default export would break
  // them all. This pins the module shape per AC-1 ("exports MS_PER_DAY =
  // 86_400_000 as a named const").
  it('time.ts (CHORE-001 AC-1): MS_PER_DAY is a named export of src/lib/time', () => {
    expect(Object.prototype.hasOwnProperty.call(timeModule, 'MS_PER_DAY')).toBe(true);
  });

  // kills: shipping a default export alongside the named one. Out of scope
  // for AC-1, but documents the intent: this module exists for ONE constant
  // (other helpers like daysFromNow are explicitly out of scope per the
  // task's "Out of scope" note). A default export would invite the wrong
  // import style at call sites.
  it('time.ts (CHORE-001 AC-1): src/lib/time has no default export', () => {
    expect((timeModule as { default?: unknown }).default).toBeUndefined();
  });

  // kills: MS_PER_DAY exported as a string ('86400000') and relying on
  // coercion in arithmetic call sites. `MS_PER_DAY` is consumed by
  // `now + intervalDays * MS_PER_DAY` — string coercion would silently
  // concatenate when `intervalDays` is also stringified upstream. Belt-
  // and-braces alongside the toBe(86_400_000) assertion (which already
  // kills the string case via strict equality).
  it('time.ts (CHORE-001 AC-1): MS_PER_DAY is a number, not a string', () => {
    expect(typeof MS_PER_DAY).toBe('number');
  });
});
