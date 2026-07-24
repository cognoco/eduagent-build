# Audience-Matrix Re-Verification

**Date:** 2026-05-30
**Target:** `docs/compliance/audience-matrix.md` — its 32-row gating inventory and findings F1–F14.
**Claim under test:** the matrix says "Verified 2026-05-23 against HEAD." This re-checks that one week later.
**Method:** multi-agent workflow — 32 citation-verifiers (each *re-locates the gate by description*, since line numbers were expected to have rotted) then 14 finding-assessors that received the citation results as ground truth. 46 agents, ~3.6M tokens, ~4.5 min. Read-only.
**Run:** `wf_84c3040e-660` (workflow `audience-matrix-reverify`).

---

## Headline: the inventory has badly rotted; the findings mostly hold

| Citation status | Count | |
|---|---:|---|
| **confirmed** (still accurate as written) | **3** | C21, C28, C31 |
| **moved** (same gate, wrong line) | 15 | line drift only — corrected map below |
| **changed** (gate refactored — different symbols/source) | 12 | almost all = navigation-contract migration |
| **gone** (described gate no longer exists) | 2 | C12, C32 |

**Only 3 of 32 citations are still accurate.** The matrix's "Verified 2026-05-23" line citations are not trustworthy as of 2026-05-30.

| Finding verdict | Count | IDs |
|---|---:|---|
| **holds** | 9 | F1, F2, F3, F5, F6, F7, F8, F10, F11 |
| partially-holds | 1 | F9 |
| stale | 1 | F12 |
| reserved-empty | 3 | F4, F13, F14 |

So the *findings* are in far better shape than the *citations*: the substance is right, the coordinates are wrong.

## Why: a navigation-contract migration landed after the matrix was written

The matrix is a snapshot of **pre-migration inline gating** ("isOwner read here, mode checked there"). Since then the codebase migrated to `useNavigationContract()` / `useNavigationShellContract()` (`apps/mobile/src/lib/navigation-contract.ts`, 514 lines, widely adopted). That single refactor explains nearly every "changed" verdict and validates the "Closed by contract" findings:

- **F5** (isOwner duplicated across 13 sites) → **holds/closed**: `more/index.tsx`, `more/account.tsx`, `session/index.tsx`, etc. now read `navigationContract.gates.show*` instead of raw `isOwner`.
- **F8** (RequireFamilyContext impure guard with `setMode('family')` side effect) → **holds/closed**: the side effect was *eliminated* under `[PARENT-03]`. `useGuardFamilyRoute` no longer exists anywhere in the repo; the guard is read-only and mode entry is an explicit `useEnterFamilyMode()` CTA. (This is why C32 is `gone`.)
- **F11** (tab/route/home recomputed in ~10 files) → **holds/closed**: tab composition reads `navigationShell.visibleTabs`; deep-route layouts call `navigationContract.canEnter(...)`.

## ⚠️ Top flag — a claim that contradicts CLAUDE.md (needs human confirm)

**C4 (`home.tsx`):** the matrix *and* CLAUDE.md ("Profile Shapes") both assert *"`home.tsx` always mounts `<LearnerScreen>`; the route does not branch."* The verifier found this is **now false**:

```tsx
// apps/mobile/src/app/(app)/home.tsx ~161
{navigationContract.home.screen === 'FamilyHome'
  ? <ParentHomeScreen activeProfile={activeProfile} />
  : <LearnerScreen … showParentHome={false} />}
```

`home.tsx` now branches on the contract and passes `showParentHome={false}` to `LearnerScreen` (whose own internal branch, C5, survives but is reached `false` from this path). If confirmed, **CLAUDE.md's "Profile Shapes → `home.tsx` is not a branching point" note is stale** and should be updated alongside the matrix.

> Confidence: single-agent read. Verify by hand before editing CLAUDE.md — distinguish a real render branch from a loading/fallback branch.

## The two `gone` gates

- **C12** (`subscription.tsx:70-77`, F10/BUG-899): the BUG-899 doc block is gone (`grep BUG-899` → 0 hits). The "actual gate" pointer (`more/index.tsx:71`) also drifted — the `tier==='family'||'pro'` predicate is now at `more/index.tsx:46` and gates a **hook-enable flag** (`useFamilySubscription()`), *not* a "hide upgrade UI" filter. No runtime gate matching the F10 intent was found. F10 the *finding* still holds as a product note, but its inventory anchor evaporated.
- **C32** (`navigation.ts:106` + `RequireFamilyContext.tsx:45`, F8): described mechanism fully eliminated (see F8 above). This is a *good* `gone` — the debt was paid.

## Corrected citation map (the 15 `moved` + key `changed`)

Drop-in line corrections for whoever maintains the matrix (full evidence in `citations.csv`):

| ID | File | Claimed → Actual |
|---|---|---|
| C2 | `_layout.tsx` | 1581 → **556-565** (now `PENDING_CONSENT_STATUSES.has(...)`, not `=== 'PARENTAL_CONSENT_REQUESTED'`) |
| C3 | `_layout.tsx` | 2491 → **567-574** (logic unchanged) |
| C13 | `subscription.tsx` | 649,653,661 → **129** (decl), uses at 137/145 |
| C14 | `mentor-memory.tsx` | 217-218 → **229-230** |
| C15 | `mentor-memory.tsx` | 233 → **248-253** (canEnter 249, Redirect 253) |
| C16 | `mentor-memory.tsx` | 366-372,410 → **391-402** + **442**; `sessionIsOwner` at 68 |
| C17 | `mentor-memory.tsx` | 469 → **501** |
| C18 | `progress/index.tsx` | 729-731 → **345-347** |
| C19 | `child/[profileId]/_layout.tsx` | 12,41 → import 2, wrapper 19-49 |
| C20 | `child/[profileId]/index.tsx` | 432-441 → **434-443** |
| C22 | `dictation/_layout.tsx` | 63 → **67-73** |
| C23 | `homework/_layout.tsx` | 9 → **12-18** |
| C25 | `quiz/_layout.tsx` | 118 → **121-127** |
| C26 | `practice/index.tsx` | 441 → **444-450** |
| C29 | `app-context.tsx` | 52 → **59** (final mode 93-97) |
| C30 | `app-context.tsx` | 74-84 → **82-91** |
| C1 | `_layout.tsx` | 2093-2109 (past EOF) → **159-161** + tab block **612-678**, now via `useNavigationShellContract()` |
| C4 | `home.tsx` | 68,76-78,186 → branch **161-169**; `isOwner` at 28 — see top flag |
| C5 | `LearnerScreen.tsx` | 474-483 → **492-493** via `gates.showFamilyHome` |
| C6 | `more/index.tsx` | 40,66,112-118 → **58/77-81** via `gates.showAddChild`/`showRemoveFamilyMember` |

Still accurate (no change): **C21** `own-learning.tsx:32-35`, **C28** `lib/profile.ts:42-48`, **C31** `packages/schemas/src/age.ts:53-65`.

## Findings needing edits

- **F9 (partially-holds):** "mode is React state only; not persisted" is imprecise. The mode *override* is React-state-only (`app-context.tsx:59`, reset on profile change 82-91); the **baseline** mode persists **server-side** as `profiles.defaultAppContext`. The cross-account leak guard is real — `signOutWithCleanup()` clears `activeProfileId` + profiles cache + the saved-id SecureStore key atomically. Keep the guardrail, fix the wording (narrow it to "no **device-local** mode persistence without re-review").
- **F12 (stale):** the "captured in spec's Failure Modes" claim is false — it's not in the spec. Code reality: `use-navigation-contract.ts:94` memoizes on the raw `profiles` array (relies on TanStack `structuralSharing`), no stable signature, no guard test. Either add the Failure-Modes row + a rerender-stability test, or stop asserting coverage. Severity LOW.

## Bottom line / recommendation

The matrix's **findings are sound** (9/14 hold, 3 are empty placeholders, 2 need wording fixes) but its **inventory is 29/32 inaccurate after only 9 days** — because a major refactor (navigation-contract adoption) moved nearly every gate. Two options:

1. **Patch:** apply the corrected line map above + fix F9/F12 wording + resolve the C4/CLAUDE.md contradiction.
2. **Retire the line-level inventory:** now that gating reads through `navigation-contract.ts`, that file is closer to the single source of truth the matrix was a stopgap for. Consider replacing the 32-row line inventory with "see `resolveNavigationContract` + its `gates.*`" and keeping only the findings ledger.

Given how fast the citations rot, option 2 is the more durable fix. Either way, the "Verified 2026-05-23" banner should be downgraded — it overstates reliability.

## Files

- `README.md` — this report.
- `citations.csv` — all 32: id, file, claimedLine, status, actualLocation, evidence, note.
- `findings.csv` — all 14: id, severity, verdict, claimedStatus, evidence, recommendation.
