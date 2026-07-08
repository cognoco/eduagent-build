---
name: project_zdx_bundle_guard_family
description: "/cosmo:bundle had three defects of one family — absorbing a member destroys whatever lifecycle-bearing state the guard doesn't check; all three were found by dogfooding, none by review."
metadata: 
  node_type: memory
  type: project
  originSessionId: 21c2badf-43d7-4e6a-ac7e-909be767a3fc
---

ZDX-ADR-0014 makes `/cosmo:bundle` Close children at formation, so **the WP body becomes the
only live record**. Every field the tool fails to carry over is destroyed, not hidden. Three
defects, same root shape, all found by *using* the tool (2026-07-08):

1. **WI-1710a** — lossy absorption: only `Description` (first line, 200-char `keyLine`) + AC
   were read. Root cause / variants live as prose in Description → destroyed. Fixed: verbatim
   `Absorbed detail` per child.
2. **WI-1710b** — no Stage guard: an `Executing`/`Reviewing` member was closed `Decomposed`
   under a live claim. Fixed: `MID_LIFECYCLE_STAGES`.
3. **WI-1724** — no State guard: **a hold lives on `State`, not `Stage`**, so (2) missed it by
   construction. `Blocked`/`Awaiting Info`/`Parked` members had their hold silently cleared
   (`clearState: true`, correct per WI-522) and `Blocked by` dropped. Fixed: refuse by default;
   `--allow-held` makes the WP inherit the most-restrictive State + the `Blocked by` union.
   `Stalled` stays absorbable (sweep marker, not a deliberate hold).

**Why:** when a mutation is destructive-by-design, "the guard didn't check field X" means
"field X is gone." Enumerate what a child *carries* before deciding what a bundle *copies*.

**How to apply:** on any absorb/merge/collapse operation, ask what lifecycle-bearing state
exists (Stage, State, claim, relations, holds) and prove each is carried, refused, or
deliberately dropped with a record. Dogfood on one real cluster before a bulk pass — all
three defects surfaced within minutes of forming a single WP.
See [[feedback_verify_claims_against_source_before_canon]].
