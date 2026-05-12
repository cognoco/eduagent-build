# Deep Re-Plan of High-Risk Cleanup Phases

## Context

The cleanup plan at `docs/audit/cleanup-plan.md` was just reconciled against post-bake-off main state (DEV-007, PR #217). For most remaining `todo` phases, this took the form of adding shallow `**Governance:**` pointers to `.archon/governance-constraints.md` — sufficient because the Archon workflow's `plan-review` node now reads governance-constraints.md and catches plan-vs-constraint issues at dispatch time.

For three high/medium-risk clusters, **a deeper re-plan is worth doing pre-emptively** because (a) recent feature PRs (#211, #215) likely shifted file content in plan-claimed paths, and (b) the cost of catching the issue mid-Archon-run is higher than the cost of fixing it now ($5-10 wasted Archon spend per phase × 6+ phases vs. ~1.5 hr of focused work).

The high/medium-risk clusters are:

1. **C6 P3b–f** (PR-15b through PR-15f) — Test file type fixes under `tsconfig.spec.json`. Five sequential sub-PRs; planning errors compound. PR #215 added/modified files in the planned scope.
2. **C7 P1** (PR-17, Inngest observers) — New code in plan-claimed area. PR #211 added a sibling Inngest function; need to verify no conflict.
3. **C5 P1** (PR-12, manifest cleanup) — Both PR #211 and #215 touched root and workspace `package.json`. Need to verify the deletion targets are still present and accurate.

## Pre-flight: required reading

Read these files in this order before making any edits:

1. **`docs/audit/cleanup-plan.md`** — the plan being updated. Sections of interest:
   - "Recent main activity" (top of doc) — context on what landed recently
   - C5 cluster (around line 290) for P1
   - C6 cluster (around line 295) for P3b–f
   - C7 cluster (around line 340) for P1
   - "Deviations Log" (bottom) — DEV-001 through DEV-007 capture the methodology and history. DEV-007 is the most recent and explains why this re-plan is happening.
2. **`.archon/governance-constraints.md`** — authoritative guide on enforcement-layer interactions. Especially §2 (TypeScript config), §3 (tests), §5 (DB), §8 (cross-cutting), and the "Common Anti-Patterns" table.
3. **`.archon/bake-off-findings.md`** — catalog of past Archon failures, including the implement-then-revert pattern.
4. **`apps/api/src/inngest/index.ts`** (196 lines, 35 registered functions) — current state for C7 P1.
5. **`apps/api/src/inngest/functions/payment-failed-observe.ts`** (first 50 lines) — canonical observer pattern for C7 P1.

Reference data already gathered (from a fresh `tsc --noEmit -p apps/api/tsconfig.spec.json` run on 2026-05-12) is included inline in each cluster section below.

## Goal

Update three phase clusters in `docs/audit/cleanup-plan.md` to reflect current file state, expand Files-claimed lists where consumer coverage is incomplete, and add governance constraint annotations that go beyond the shallow pointer (concrete instructions tied to current file content).

Append a **DEV-008** entry to the Deviations Log documenting this re-plan pass.

**Out of scope:** any other phase clusters, the workflow YAMLs, the governance-constraints doc itself, code changes outside `docs/audit/cleanup-plan.md`. Stay laser-focused.

## Cluster 1: C6 P3b–f (Test file type fixes)

### Current pre-flight data

Type-error breakdown from `pnpm exec tsc --noEmit -p apps/api/tsconfig.spec.json` on 2026-05-12:

```
600 TS6305  ← project reference noise; expected, not "real" errors
129 TS7006  ← implicit any callback params (P3c target)
 40 TS2345  ← argument type mismatch (P3d + P3e target)
 37 TS18046 ← unknown response bodies/mock vars (P3b target)
 10 TS2769  ← Hono c.set type mismatch (P3e target)
 10 TS2304  ← name not found (P3e — new category)
  9 TS2339  ← property does not exist (P3e target)
  8 TS2353  ← object literal unknown property (P3e target)
  4 TS2352  ← conversion not possible (P3e target)
  3 TS2322  ← type not assignable (P3e target)
  3 TS2305  ← module no exported member (P3e — new category)
  2 TS2556  ← (P3e — new category)
  2 TS2367  ← declaration overlaps (P3e target)
  2 TS18047 ← (P3e — new category)
  1 TS7024, 1 TS7022, 1 TS2694, 1 TS2502, 1 TS1064 ← edge cases
```

Plan-vs-actual delta: planned counts were ~99 TS18046 / ~119 TS7006 / ~7 TS2345 / ~50 heterogeneous. Actuals are 37 / 129 / 40 / 50+. The TS18046 count is way down (work elsewhere has moved the needle); TS2345 count tripled (likely from PR #215's `book-suggestion-generation.test.ts` — 21 TS2345 errors in that one file).

The 600 TS6305 errors are "Output file not built from source" — project reference build-order noise that surfaces only when running `tsc --noEmit -p tsconfig.spec.json` in isolation. They are NOT real type errors and are NOT in scope for P3b–f. Add a note acknowledging this.

### Files NOT yet in any P3b–e Files-claimed list (PR #215 additions and others)

| File | Errors | Likely sub-PR |
|---|---|---|
| `apps/api/src/services/progress-reports.integration.test.ts` (NEW from PR #215) | 4 TS6305 (noise only) | None needed if only TS6305 — verify no real errors |
| `apps/api/src/services/book-suggestion-generation.test.ts` (NEW from PR #211/215) | 21 TS2345 | **P3d or new P3g** (mock shape type mismatches) |
| `apps/api/src/services/nudge.test.ts` (NEW from PR #211) | 6 errors (TS6305, TS2305, TS2694, TS2502) | **P3e** (heterogeneous category) |
| `apps/api/src/services/monthly-report.test.ts` (modified by PR #215) | 1 TS2353 + 2 TS7006 | Already in P3c + P3e ✓ |
| `apps/api/src/services/weekly-report.test.ts` (modified by PR #215) | 1 TS2353 | Already in P3e ✓ |

### Required edits to C6 P3b–f rows

For each phase row in the C6 cluster table, update:

1. **Error count + file count** in the phase title to match current actuals.
2. **Files-claimed list** to add any newly-failing files (verify against `tsc --noEmit -p apps/api/tsconfig.spec.json` output before claiming).
3. **Notes column** — add a sentence acknowledging the 600 TS6305 errors are project-reference noise (not in scope) and explaining the verification command's expected output.
4. **Definition of Done** verification command — current command `pnpm exec tsc --noEmit -p apps/api/tsconfig.spec.json 2>&1 | grep -c TS18046` returns `0` is correct in pattern but should add `-v "TS6305"` to the broader check, OR add a separate command line that filters out project-reference noise.

Specifically:

- **P3b** (TS18046): change "~99 errors / 15 files" → "~37 errors / N files (post-PR #215; recount before dispatch)". Re-grep current TS18046 sites with `pnpm exec tsc --noEmit -p apps/api/tsconfig.spec.json 2>&1 | grep "TS18046" | sed 's/(.*//' | sort -u` and align Files-claimed to the actual list (some original 15 files may now be clean).
- **P3c** (TS7006): change "~119 errors / 41 files" → "~129 errors / N files". Same re-grep + Files-claimed alignment.
- **P3d** (TS7006 + TS2345 in eval-llm/flows): scope is unchanged at `apps/api/eval-llm/flows/*.ts`. Verify the 5 listed files still have errors. **Decision needed (D-C6-4):** does `book-suggestion-generation.test.ts` (21 TS2345) belong in P3d (lumped with eval-llm production-code TS2345) or in P3e (heterogeneous test fixes), or warrant a new **P3g** sub-phase? Recommend P3e — test-side mock shape fixes match P3e's pattern, not eval-llm production code's pattern.
- **P3e** (heterogeneous): add `book-suggestion-generation.test.ts` and `nudge.test.ts` to Files-claimed. Update error subcategory list to include the 4 new categories (TS2304, TS2305, TS2556, TS18047).
- **P3f** (closure): no Files-claimed changes, but add to the Notes: "Verify zero TS errors (excluding TS6305 project-reference noise) before re-tightening flags. Run `pnpm exec tsc --build` AND `pnpm exec tsc --noEmit -p apps/api/tsconfig.spec.json 2>&1 | grep -v 'TS6305\\|TS6307\\|TS18047' | grep -c 'error TS'` returns `0`."

### Governance annotation enrichment

Replace the existing one-line `**Governance:** §3` pointer in P3b–f Notes with concrete guidance:

- **P3b/P3c/P3e**: explicit instruction "Do NOT touch `apps/api/tsconfig.json` references[] in this PR — that wiring is owned by P3f. The implement node's first instinct may be to add the spec config to references when a test file fails to find a type; resist that. The fix is in the test file."
- **P3d**: keep the existing `pnpm eval:llm` warning. Add: "Any change that alters the runtime input shape of an eval-llm flow needs `pnpm eval:llm --live` confirmation."
- **P3f**: add: "Pre-commit hook runs `tsc --build`. After this PR lands, every commit will type-check the spec config. Verify locally with `pnpm exec tsc --build` BEFORE pushing — if even one test file still has errors, every commit on every branch fails."

## Cluster 2: C7 P1 (Inngest observers)

### Current pre-flight data

- `apps/api/src/inngest/index.ts` is currently 196 lines, registers 35 Inngest functions.
- PR #211 added `consent-revocation.ts` (line 3 import, line 141 registered).
- No existing handlers for `app/ask.gate_decision`, `app/ask.gate_timeout`, or `app/email.bounced` events. **No conflict** with the planned new observers.
- Existing observer pattern (canonical: `apps/api/src/inngest/functions/payment-failed-observe.ts`):
  - Header comment block documents event name, reason, payload shapes
  - Zod schema validates payload (catches schema drift)
  - `inngest.createFunction({id, name}, {event}, async ({event, step, logger}) => {...})`
  - Structured logging only — no transformation, no retry logic
- Existing observer files: `payment-failed-observe.ts`, `ask-classification-observe.ts` (splits into 3 exports), `filing-completed-observe.ts`, `filing-timed-out-observe.ts`, `notification-suppressed-observe.ts`, `trial-expiry-failure-observe.ts`.

### Required edits to C7 P1 row

1. Update the existing PR #187 Note to also acknowledge PR #211: "PR #187 added `transcriptPurgeHandlerOnFailure`. PR #211 added `consent-revocation.ts` (line 3 import, line 141 registration). Re-read `inngest/index.ts` at HEAD to confirm registration array position and import-block ordering before editing."
2. The current Files-claimed (`ask-gate-observe.ts` (new), `ask-gate-observe.test.ts` (new), `email-bounced-observe.ts` (new), `email-bounced-observe.test.ts` (new), `inngest/index.ts`) is correct — no expansion needed.
3. **Governance annotation enrichment**: replace shallow pointer with: "Pattern: copy `payment-failed-observe.ts` as starting point. Use Zod schema for payload validation (matches sibling observers). GC1 ratchet blocks any new internal `jest.mock('./...')` in test siblings — use `jest.requireActual()` overrides if you need to stub specific symbols. Test must assert: (a) trigger event name string matches the event being listened for, (b) function is included in the exported `functions` array of `inngest/index.ts`."

## Cluster 3: C5 P1 (manifest cleanup)

### Current pre-flight data

All planned deletions/changes are confirmed accurate as of 2026-05-12:

| Target | Status |
|---|---|
| Root `react@19.1.0` | Present, delete |
| Root `react-dom@19.1.0` | Present, delete |
| Root `hono@^4.11.0` | Present, delete |
| Root `metro-config@~0.83.0` | Present, delete |
| Root `metro-resolver@~0.83.0` | Present, delete |
| Root `@testing-library/react-native@~13.2.0` | Present, delete |
| api `@neondatabase/serverless@^0.10.4` | Present, delete |
| api `@clerk/types@^4.40.0` | Present, delete |
| Root `dotenv@^16.4.5` | Confirmed; align to `^16.4.7` |
| Mobile 8 deps with `^` | All confirmed `^`; flip to `~` |
| FORBIDDEN list in `scripts/check-no-mobile-deps-at-root.cjs` | Currently 19 entries; needs the 6 newly-deletable ones added (`react`, `react-dom`, `hono`, `metro-config`, `metro-resolver`, `@testing-library/react-native`) |

PR #211 and #215 touched `package.json` files but did NOT alter any of the C5 P1 target deps. Plan is current.

### Required edits to C5 P1 row

1. Add a sentence to the Notes acknowledging the verification: "Pre-flight 2026-05-12: all 6 root duplicates, both api orphans, dotenv version, and 8 mobile pin styles confirmed unchanged from the plan target. Safe to dispatch."
2. **Governance annotation enrichment**: replace shallow `§8` pointer with: "Lockfile coordination: this PR regenerates `pnpm-lock.yaml`. If PR-13 (small dep adds) is in flight, serialize. CI check `check:root-deps` (the `check-no-mobile-deps-at-root.cjs` guard) must pass after FORBIDDEN list expansion — add the 6 newly-deletable deps to the array AND verify the script's exit-code-on-violation behavior with a quick local test (`node scripts/check-no-mobile-deps-at-root.cjs` should exit 0 after the changes)."

## Append DEV-008 to Deviations Log

After the cluster edits, append this entry to the Deviations Log section (after DEV-007):

```markdown
### DEV-008

**Status:** `processed-2026-05-12`
**Source:** Pre-emptive deep re-plan of high-risk phase clusters (decided in conversation post-DEV-007 PR #217)
**Finding:** DEV-007 added shallow `**Governance:**` pointers to remaining `todo` phases, relying on the Archon workflow's `plan-review` node to deep-check at dispatch time. This is appropriate for low-risk phases. For high-risk clusters — defined as (a) sequential sub-PRs where planning errors compound, (b) phases in code areas modified by recent feature PRs, or (c) phases where Archon has already failed once — pre-emptive deep re-plan is more cost-effective than dispatch-time catching.

**Clusters re-planned:** C6 P3b–f (sequential, modified by PR #215), C7 P1 (modified by PR #211), C5 P1 (modified by PR #211 and #215).

**Delta applied:**
- C6 P3b–f: error counts refreshed against fresh `tsc --noEmit -p apps/api/tsconfig.spec.json` run; new pending decision **D-C6-4** for `book-suggestion-generation.test.ts` placement (recommend P3e); 2-3 NEW files added to Files-claimed; governance annotations replaced with concrete instructions ("don't touch tsconfig.json references in this PR — owned by P3f").
- C7 P1: PR #211 acknowledgement added to Notes; canonical pattern reference enriched (Zod payload validation, GC1-aware test pattern, specific assertions).
- C5 P1: pre-flight verification noted (all targets confirmed unchanged); governance annotation enriched (lockfile serialization, FORBIDDEN list expansion test).

**Methodology lesson:** The cost trade-off favors pre-empting any phase where (a) recent feature PRs touched plan-claimed paths, (b) the phase is one of a sequential set, or (c) the phase has prior failure history. For phases without those signals, the workflow's plan-review node is sufficient.

**Phases NOT re-planned (deferred to dispatch-time check):** C5 P3, P7; C6 P4, P5; C8 P1, P2, P3, P6; C9 P5; all doc-only phases.
```

## Verification

After all edits:

1. **Re-read each modified phase row** — confirm Notes column hasn't grown beyond ~6 lines (longer rows hurt scanability).
2. **Sanity-check the plan integrity** — the audit-status skill (`/my:audit-status`) reads the table column structure. Verify column count is unchanged (7 columns: Phase, Description, Status, Owner, PR, Files-claimed, Notes).
3. **Cross-check D-C6-4 placement** — if recommending P3e for `book-suggestion-generation.test.ts`, ensure it's listed in P3e Files-claimed AND not duplicated in P3d.
4. **Run a markdown lint pass** if available: `pnpm exec markdownlint docs/audit/cleanup-plan.md` (may not be installed; skip if not).
5. **Commit using the `/commit` skill** with conventional message: `plan(audit): DEV-008 — pre-empt deep re-plan of C6 P3b–f, C7 P1, C5 P1`.

## What NOT to do

- Do NOT touch `.archon/governance-constraints.md` — it's owned by the parallel session's option-#2 work and is now in production.
- Do NOT touch the workflow YAMLs — same reason.
- Do NOT modify any code outside `docs/audit/cleanup-plan.md`. The fixes themselves are still in `todo` status; they're for future Archon runs to make.
- Do NOT update phases that are marked `done`, `blocked`, or that are pure doc-only (e.g., C4 P5, C7 P2/P3/P4/P5/P7).
- Do NOT pre-empt phases not on the high/medium-risk list. The whole point of this re-plan is targeted leverage; expanding scope defeats the cost-effectiveness justification.

## Key file paths

- Plan being edited: `docs/audit/cleanup-plan.md`
- Governance reference: `.archon/governance-constraints.md`
- Inngest registry (read-only): `apps/api/src/inngest/index.ts`
- Canonical observer (read-only): `apps/api/src/inngest/functions/payment-failed-observe.ts`
- Spec tsconfig (read-only, for understanding): `apps/api/tsconfig.spec.json`
- Mobile dep guard (read-only, for understanding): `scripts/check-no-mobile-deps-at-root.cjs`
- Bake-off context (read-only): `.archon/bake-off-findings.md`
- Most recent PR for plan changes: PR #217 (just merged this branch's prior reconciliation)

## Estimated effort

- C6 P3b–f: ~45 min (largest cluster, requires re-grepping error counts and reconciling 5 file lists)
- C7 P1: ~10 min (mostly Note enrichment)
- C5 P1: ~10 min (mostly Note enrichment + pre-flight verification quote)
- DEV-008 entry: ~10 min
- Verification + commit: ~10 min

Total: ~1.5 hours of focused work for a fresh agent with this plan in hand.
