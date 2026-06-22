---
name: Never auto-pick or merge WI-301
description: When sweeping reviewer-returned / rework Cosmo items, exclude WI-301 — do not claim, land, or merge it autonomously
type: feedback
---

**WI-301 (Non-owner profiles can switch into owner context — owner-elevation gate) is HARD-EXCLUDED from any autonomous "pick up returned/rework items" sweep.** Do not claim it, do not open/merge its PR, do not land its branch without explicit human go-ahead. Ruled by the user 2026-06-21.

**Why:**
- **Deploy trap (verified on `origin/WI-301`, 2026-06-21):** the new gate `isOwnerElevationGateEnabled(v) => v !== 'false'` in `apps/api/src/routes/profiles.ts:76-78` **defaults ON** when `OWNER_ELEVATION_GATE_ENABLED` is unset. The gate is fail-closed on the Clerk `fva` (factor-verification-age) claim (`profiles.ts:505` + `hasRecentOwnerElevation`). Merging it would enable owner-elevation enforcement by default in every env and **break all owner-context switches** anywhere the Clerk JWT template does not yet emit `fva` (403 `OWNER_ELEVATION_REQUIRED`). The reviewer flagged exactly this: "needs Clerk fva template confirmation before close."
- **Spec-only lane:** project memory `project_owner_gate_resolvedvia_invariant` records WI-301/`MMT-ADR-0025` as a separate spec-only owner-elevation-on-switch item, distinct from the 901 owner-route fix already on main.
- The `/cosmo:execute` skill does NOT itself forbid 301 — its guards are generic (`fetch` checks Stage=Ready/State=Active/repo/Auto). The exclusion is a project decision, not skill-enforced.

**How to apply:** In any rework/reviewer-returned batch (items carrying tag `rework`), drop WI-301 from the dispatch set. Landing it requires, BEFORE merge, either (a) human confirmation the Clerk JWT template emits `fva` in dev/stg/prd, or (b) `OWNER_ELEVATION_GATE_ENABLED='false'` set in Doppler for all envs. Only then, with explicit human sign-off. The user also named a "WI-696" alongside 301 — no such item exists in the rework set; confirm the intended number rather than assuming. Related: [[project_owner_gate_resolvedvia_invariant]].
