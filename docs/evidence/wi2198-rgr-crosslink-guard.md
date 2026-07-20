# WI-2198 — Red-Green-Revert evidence (Bug DoD, AC-7)

**Item:** WI-2198 — reconcile mobile flow inventory + E2E manifests with V2 (docs/governance).
**Bug DoD:** executed red-green-revert against the AC-7 guard, independently verifiable.

**Under test:** `scripts/check-flow-inventory-cite-rot.ts`'s row-ID cross-link check
(`checkRowIdCrossLinks`, lines 251-284) — specifically its dedicated rule for a bare
`V2-NN` token (lines 266-273):

```ts
    if (/^V2-\d{1,3}$/.test(token)) {
      failures.push({
        token,
        reason:
          'looks like a V2-shell row reference but real V2 rows are three-part IDs (V2-CHROME-01, V2-SCOPE-01, ...) — this bare form never resolves',
      });
      continue;
    }
```

This is the fix (landed on `main` in the prior WI-2198 rework, commit `2a4243bd2`, PR
#2352): the guard flags any bare (non-backtick) `V2-NN`-shaped token in the doc's prose,
because real V2-shell rows are always three-part IDs (`V2-CHROME-01`, `V2-SCOPE-01`, ...).
This is the exact class of bug a prior editing pass introduced — the V2 Shell section's
intro paragraph (`docs/flows/mobile-app-flow-inventory.md`, the paragraph beginning "New
section (WI-2198, ...)") once cited the scope-switching journey as a nonexistent "V2-05"
instead of the real row ID `V2-SCOPE-01`.

**Regression coverage:** `scripts/check-flow-inventory-cite-rot.test.ts` →
`checkRowIdCrossLinks` → `'flags a bare V2-NN reference — the exact WI-2198 review bug'`.

**Runtime:** Node 22.16.0 (repo requires 22.x).
**Commands (run from repo root):**

```
pnpm tsx scripts/check-flow-inventory-cite-rot.ts
pnpm exec jest --config scripts/jest.config.cjs scripts/check-flow-inventory-cite-rot.test.ts --runInBand --no-coverage
```

This is a durable, reproducible capture executed directly against the doc at its current
state — the corruption below is a temporary local edit made only to produce the RED
capture; it was restored immediately after, and `docs/flows/mobile-app-flow-inventory.md`
carries no net change from this capture (the row-ID text reads `V2-SCOPE-01` both before
and after). The prior evidence for this AC only asserted "the guard caught the exact
V2-05 bug before it was fixed" in prose, with no committed, re-runnable capture — this
record replaces that prose claim with an actual reproduced RED/GREEN pair, committed
in-repo.

---

## GREEN — fix present (baseline)

```
flow-inventory-cite-rot: clean (449 citations, 288 row IDs, row-id links, flag tokens, and legacy tags all resolve).
```

Exit code `0`.

---

## RED — bug reintroduced (proves the check is load-bearing)

The V2 Shell section's intro sentence was edited to reintroduce the exact stale
cross-reference the reviewer named — replacing the real row ID with the bare, malformed
form:

```diff
-The scope-switching journey is **V2-SCOPE-01** below — `scripts/check-flow-inventory-cite-rot.ts`'s row-ID cross-link check (AC-7) now catches a row-ID cross-reference that drifts out of sync with the real ID, the class of bug this paragraph previously carried.
+The scope-switching journey is **V2-05** below — `scripts/check-flow-inventory-cite-rot.ts`'s row-ID cross-link check (AC-7) now catches a row-ID cross-reference that drifts out of sync with the real ID, the class of bug this paragraph previously carried.
```

No other line was touched for this step.

Captured output — **1 problem reported**:

```
flow-inventory-cite-rot: 1 problem(s) in docs/flows/mobile-app-flow-inventory.md:
  [row-id] V2-05 — looks like a V2-shell row reference but real V2 rows are three-part IDs (V2-CHROME-01, V2-SCOPE-01, ...) — this bare form never resolves
```

Exit code `1`.

This is the exact failure mode named in the reviewer's finding: the doc's own prose
drifting out of sync with a real row ID, silently reading as valid text instead of being
caught as a broken cross-reference. `V2-SCOPE-01` (the real, defined row at
`docs/flows/mobile-app-flow-inventory.md`'s "V2 Shell" table) is unaffected by this edit
and continues to resolve normally — only the bare, malformed `V2-05` reference in the
intro prose is flagged.

---

## RESTORE — fix re-applied

The sentence was restored verbatim (`git diff` against the pre-capture state on
`docs/flows/mobile-app-flow-inventory.md`'s row-ID text is empty for this line); the
guard returns to clean:

```
flow-inventory-cite-rot: clean (449 citations, 288 row IDs, row-id links, flag tokens, and legacy tags all resolve).
```

Exit code `0`. The co-located unit suite was re-run after restoring and stays green:

```
Test Suites: 1 passed, 1 total
Tests:       29 passed, 29 total
```

Red → Green → Revert-red → Restore-green confirmed: the guard's bare-`V2-NN` rule flags
the exact stale cross-reference this AC targets and passes clean once the reference
resolves to a real row ID; the doc carries no net change from this capture.
