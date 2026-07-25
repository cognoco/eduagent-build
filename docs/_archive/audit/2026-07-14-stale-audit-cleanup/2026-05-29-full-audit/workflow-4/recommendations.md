# Recommendations — Audience-Matrix Re-Verification

Consolidated, prioritized action list from run `wf_84c3040e-660` (2026-05-30). Evidence
for every item is in `README.md`, `citations.csv`, and `findings.csv` in this directory.

**Scope note:** this audit was read-only. Nothing in `docs/compliance/audience-matrix.md`, `CLAUDE.md`,
or source was modified. Each item below is a *proposed* change for a maintainer to apply.

---

## P0 — Resolve before citing the matrix again

### R1. Confirm the `home.tsx` branching contradiction, then fix BOTH docs
- **What:** `docs/compliance/audience-matrix.md` (row C4) and `CLAUDE.md` ("Profile Shapes" section)
  both state *"`home.tsx` always mounts `<LearnerScreen>`; the route does not branch."*
  The verifier found `home.tsx` now branches on
  `navigationContract.home.screen === 'FamilyHome'` (rendering `<ParentHomeScreen>` vs
  `<LearnerScreen showParentHome={false} />`, ~lines 161-169).
- **Confidence:** single-agent read — could be a loading/fallback branch, not the primary
  render path. **Verify by hand first.**
- **Action if confirmed:**
  1. Update `CLAUDE.md` "Profile Shapes" → "Note: `home.tsx` always mounts `<LearnerScreen>`…"
     to reflect that `home.tsx` now performs the FamilyHome branch via the contract, and
     `LearnerScreen`'s internal branch is reached with `showParentHome={false}` from this path.
  2. Update matrix row C4 accordingly.
- **Action if NOT confirmed (it's a fallback path):** annotate C4 that the contract value is
  read but the canonical branch still lives in `LearnerScreen` (C5), and leave CLAUDE.md as-is.

### R2. Downgrade the matrix's reliability banner
- **What:** `docs/compliance/audience-matrix.md` line 7 reads *"Status: Verified 2026-05-23 against
  HEAD."* 29 of 32 citations were inaccurate 9 days later.
- **Action:** replace with a dated-but-honest banner, e.g. *"Line citations drift quickly —
  last full re-verification 2026-05-30 (run wf_84c3040e-660) found 29/32 inventory lines
  stale due to the navigation-contract migration. Treat line numbers as approximate; verify
  before citing."*

---

## P1 — Correct the inventory (if keeping the line-level table)

### R3. Apply the corrected line-map to all 15 `moved` + key `changed` rows
- **What:** the citations table in `docs/compliance/audience-matrix.md` has stale line numbers; several
  (C1 `_layout.tsx:2093-2109`, C3 `:2491`, C11 `subscription.tsx:1590`) point past EOF.
- **Action:** apply the corrected map in `README.md` → "Corrected citation map" and the
  per-row `actualLocation`/`note` columns in `citations.csv`. Highlights:
  | Row | Claimed → Actual | Also note |
  |---|---|---|
  | C1 | 2093-2109 → 159-161 + 612-678 | now via `useNavigationShellContract()` |
  | C2 | 1581 → 556-565 | predicate changed to `PENDING_CONSENT_STATUSES.has(...)` |
  | C3 | 2491 → 567-574 | logic unchanged |
  | C5 | 474-483 → 492-493 | now `gates.showFamilyHome` |
  | C6 | 40,66,112-118 → 58/77-81 | now `gates.showAddChild`/`showRemoveFamilyMember` |
  | C13 | 649,653,661 → 129 (uses 137,145) | |
  | C14 | 217-218 → 229-230 | |
  | C15 | 233 → 248-253 | |
  | C16 | 366-372,410 → 391-402 + 442 | `sessionIsOwner` at 68 |
  | C17 | 469 → 501 | |
  | C18 | 729-731 → 345-347 | |
  | C19 | 12,41 → 2 / 19-49 | |
  | C20 | 432-441 → 434-443 | |
  | C22 | 63 → 67-73 | |
  | C23 | 9 → 12-18 | |
  | C25 | 118 → 121-127 | |
  | C26 | 441 → 444-450 | |
  | C29 | 52 → 59 (final mode 93-97) | |
  | C30 | 74-84 → 82-91 | |
  - Leave **C21, C28, C31** unchanged (still accurate).

### R4. Remove or re-anchor the 2 `gone` rows
- **C12** (`subscription.tsx:70-77`, F10/BUG-899): the BUG-899 doc block is gone and the
  "actual gate" pointer (`more/index.tsx:71`) drifted — the `tier==='family'||'pro'`
  predicate is now at `more/index.tsx:46` and gates a *hook-enable flag*, not an
  upgrade-UI filter. **Action:** delete the C12 inventory row (the finding F10 survives as a
  product note with no live code anchor — see R6).
- **C32** (`navigation.ts:106` + `RequireFamilyContext.tsx:45`, F8): mechanism eliminated
  (`useGuardFamilyRoute` removed repo-wide; guard is read-only). **Action:** delete the C32
  row and mark F8 as verified-closed in code (see R5/F8).

---

## P2 — Fix the two findings with wording problems

### R5. F9 — narrow the wording (currently `partially-holds`)
- **Current:** "mode is React state only; not persisted."
- **Correction:** the mode *override* is React-state-only (`app-context.tsx:59`, reset on
  profile change 82-91); the **baseline** mode persists **server-side** as
  `profiles.defaultAppContext` (not device-local). The cross-account leak guard is real:
  `signOutWithCleanup()` clears `activeProfileId` + the profiles cache + the saved-id
  SecureStore key atomically.
- **Action:** keep F9 as a live guardrail but reword to: *"do not add **device-local**
  (SecureStore/AsyncStorage) mode persistence without re-reviewing the sign-out leak
  guarantee — server-scoped persistence is already in place and safe."* Update C29 cite → 59,
  C30 cite → 82-91.

### R6. F12 — mark `stale`, fix the false coverage claim
- **Current:** "Implementation detail… captured in spec's *Failure Modes*." — it is **not**
  in the spec.
- **Code reality:** `use-navigation-contract.ts:94` memoizes the contract on the raw
  `profiles` array (relies on TanStack `structuralSharing`), with no derived stable
  signature and no guard test.
- **Action (pick one):**
  - (a) Stop asserting documentation coverage — drop the "captured in spec" clause; **or**
  - (b) If treating F12 as live: add a real Failure-Modes row to the nav-contract spec, change
    the memo dep from `profiles` to a stable key (e.g. `profiles.map(p => p.id+p.isOwner).join(',')`),
    and add a rerender-stability test. Suggested severity **LOW** (render perf/correctness,
    not a security/data gate).

### R7. Re-derive the reserved findings
- **F4, F13, F14** are empty placeholders (`reserved-empty`). **Action:** either populate them
  from a fresh adversarial audit or delete them so the ledger doesn't imply hidden findings.

---

## P3 — Strategic (recommended over P1)

### R8. Retire the line-level inventory; point at the contract as source of truth
- **Rationale:** 29/32 citations rotted in 9 days because the navigation-contract migration
  moved nearly every gate. Patching line numbers (R3) is a treadmill. Now that gating reads
  through `apps/mobile/src/lib/navigation-contract.ts` (`resolveNavigationContract` + its
  `gates.*`), that file is the single source of truth the matrix was always a stopgap for.
- **Action:** replace the 32-row line-level inventory in `docs/compliance/audience-matrix.md` with a
  short pointer ("current gating is centralized in `resolveNavigationContract`; see its
  `gates.*` fields") and keep only the **findings ledger** (F1–F14), which ages far better.
  This subsumes R3 and most of R4.

---

## Decision summary for the maintainer

| If you want… | Do |
|---|---|
| Minimal upkeep, durable | **R8** (+ R1, R2, R5, R6, R7) — retire the inventory, keep findings |
| Keep the detailed inventory | **R3 + R4** (+ R1, R2, R5, R6, R7) — apply corrected line-map |

Either path requires R1 (home.tsx/CLAUDE.md), R2 (banner), R5 (F9), R6 (F12), R7 (reserved).

## On the two next-steps offered in review

Both were offered in conversation and are recorded here so they aren't lost:
- **(a) Apply corrected line-map + F9/F12 wording to `docs/compliance/audience-matrix.md`** → captured as
  R3, R5, R6.
- **(b) Manually confirm `home.tsx` branching and update `CLAUDE.md`** → captured as R1.

Neither has been executed — both are writes outside this directory and await explicit
maintainer approval.
