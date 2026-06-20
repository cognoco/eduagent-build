---
name: feedback_forward_ratchets_not_in_prepush
description: "Forward-only git-diff ratchets (GC1 jest.mock, i18n-jsx, no-clinical-copy, decision-adr) are NOT run by local pre-push/jest — run the ratchet before claiming CI-clean."
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-17
  last_confirmed: 2026-06-17
  status: active
  originSessionId: 63b07dd7-01be-43cd-a7c0-cc959805e4b3
---

Local pre-push runs `tsc` + surgical `jest`, but NOT the forward-only git-diff RATCHETS that gate the required CI `main` job. A change can pass `tsc`+`jest` 100% green yet fail CI on a ratchet. Hit on WI-811: a new `jest.mock('../...child-profile-v2')` (full mock + *preceding-line* `// gc1-allow`) failed GC1 — the ratchet needs **Pattern A** (`jest.requireActual` + targeted override) OR a **same-line** `gc1-allow`. Hit AGAIN on WI-816: split-effect added a 2nd `activeProfile?.isOwner` dep read → `navigation-contract-usage-guard.test.ts` terminal-usage ratchet (count expected 2→actual 3) failed the required `main` job after a fully-green local pre-push; fix = bump the inline `expectedFindings` baseline + repush. **4th occurrence of this class (809, 586, 811, 816)** — the recurrence is strong evidence the gate is mis-placed: these ratchets should run in pre-push (process fix), not just CI.

**Why:** "green/clean" claims that outran the ratchet cost the orchestrator a verify→fix→re-push round-trip each time.

**How to apply:** before any CI-clean / Gate-1-ready claim on a diff touching test files or guarded surfaces, run `bash scripts/check-change-class.sh --run` (or the specific ratchet, e.g. `pnpm exec tsx scripts/check-gc1-pattern-a.ts`) on the delta and confirm EXIT 0 — not just jest. Ratchets: GC1 (`check-gc1-pattern-a.ts`), i18n-jsx (`check-i18n-jsx-literals.ts`), no-clinical-copy, decision-adr-link. Related: [[feedback_prepush_bail_masks_failures]].
