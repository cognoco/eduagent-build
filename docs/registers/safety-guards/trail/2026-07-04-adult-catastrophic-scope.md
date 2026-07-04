# Trail record — dangerous-procedure gate extended to adults (catastrophic subset)

**Date:** 2026-07-04
**Change:** Updated Ledger row #1 (dangerous-procedure operational how-to
refusal) to record that the gate now enforces a narrow catastrophic subset
for adults, in addition to the full gate for minors.
**WI:** WI-1351 (Extend dangerous-procedure gate to adults for catastrophic
CBRN + explosive-device-construction how-to)
**ADR:** MMT-ADR-0030 (adult catastrophic-procedure gate)

## Why

The gate landed in WI-1154 as **minor-only**: `applyDangerousProcedureGate`
returned the tutor reply unchanged for adults (`if (!opts.isMinor) return …
blocked: false`). That reflected the deliberate adult-latitude posture and
MMT-ADR-0016 §1 (no denylist; over-blocking is a hard failure). It left one
tail uncovered — an adult account could obtain step-by-step mass-casualty
construction how-to (CBRN weapons, IEDs) with no floor.

Operator ruling **se-031** (Option A, D3=YES) authorized extending the gate to
adults for a **narrow catastrophic subset only** — CBRN weapons
(chemical/biological/radiological/nuclear) + explosive-device construction —
and nothing else. All other adult latitude (general chemistry, pharmacology,
energetics education, weapons history, and non-catastrophic drug/weapon/poison
how-to) stays open. This is the product's first adult-facing content
constraint; MMT-ADR-0030 records the *why* and the fixed boundary.

## What changed in code (verified)

- `apps/api/src/services/dangerous-procedure-gate.ts`:
  - New `CATASTROPHIC_ITEM_TERMS` / `CATASTROPHIC_ITEM_RE` — CBRN + explosive
    vocabulary only; drugs, firearms, and general poisons deliberately excluded.
  - New exported `detectCatastrophicProcedureLeak()`, sharing the identical
    how-to-structure logic with `detectDangerousProcedureLeak()` via a private
    `detectProcedureLeak(reply, itemRe)` helper.
  - `applyDangerousProcedureGate()`: minors → full gate unioned with the
    catastrophic subset (minor protection ⊇ adult); adults → catastrophic
    subset only.
- Detector remains age-agnostic and pure; `isMinor` selects the width.

## Verification

- Red-green-revert break test (`dangerous-procedure-gate.test.ts`): an ADULT
  explosive-device + an ADULT CBRN (nerve-agent) construction how-to are
  BLOCKED with the fix; reverting the adult branch makes exactly those two
  tests fail; restoring makes them pass. 27/27 green with the fix.
- Over-block guard: a legitimate adult energetics/chemistry education answer,
  and a non-catastrophic (opium→heroin) drug how-to, are both left unchanged
  for an adult — adult latitude preserved.

## Scope note

This edits only Ledger row #1. The remaining un-transcribed WI-1285 inventory
sites (noted in `master.md` Provenance) are unaffected and still owed a
separate transcription pass.
