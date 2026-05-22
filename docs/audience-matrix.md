# Audience Matrix — Scattered Gating Snapshot

> **Reconstructed scaffold (2026-05-22).** The original `docs/audience-matrix.md` was lost — it was created in another agent's working tree on 2026-05-21 and wiped by a stash cycle before any git operation captured it (not in any commit, dangling blob, or worktree on disk).
>
> This scaffold rebuilds the doc from references in the earlier draft of `docs/specs/2026-05-21-navigation-contract.md` (dangling commit `e6287097`). All file:line citations below are extracted from that draft and re-verified against current HEAD — but the original severity labels (F1–F14) are *inferred* from the navigation-contract's "5 of 14 findings addressed" callout. Re-derive F-numbers from a fresh audit if precision matters.

**Status:** Scaffold — re-verify file:line citations before relying on them. Last verified by reconstruction author: 2026-05-21.

---

## Purpose

This matrix is the authoritative snapshot of **current** scattered UI/navigation gating across the mobile app. It exists because the answer to "what does this profile see?" is reconstructed in ~20 places — every fix patches one consumer; the contract lives in nobody's head.

The matrix and `docs/specs/2026-05-21-navigation-contract.md` are **paired**:

- **This matrix = current state inventory** with file:line citations and findings F1–F14.
- **The navigation-contract spec = target state** describing the single `resolveNavigationContract(ctx)` function consumers migrate to.

The navigation-contract addresses **5 of 14 findings** here (F5, F6, F7, F8, F11 — all LOW, UI sweep targets). The other 9 are server-side, age-math, or push-delivery gaps that the contract does **not** close. A green ratchet test on the navigation-contract is **not** evidence that the gaps in this matrix are fixed.

---

## Inventory — Scattered Gating Sites

Each entry is a current-code site that branches on profile attributes (`isOwner`, `role`, `birthYear`, `mode`, `isParentProxy`, `tier`, `consentStatus`). Verified 2026-05-21 against HEAD.

### Shell and Routing

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/_layout.tsx:2038-2048` | `tabShape`, `visibleTabs`, `homeTabPresentation` | Tab bar composition; replaced by `useNavigationContract()` | F11 |
| `apps/mobile/src/app/(app)/_layout.tsx:1527` | `consentStatus === 'PARENTAL_CONSENT_REQUESTED'` | Full-screen consent overlay (shell-level interception) | F2 |
| `apps/mobile/src/app/(app)/_layout.tsx:2427` | Withdrawal flow | Full-screen withdrawal overlay | F2 |

### Home

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/home.tsx:61-83, 169` | `mode`, `hasLinkedChildren`, `isFamilyPlanOwner`, `isParentProxy`, `showParentHome` | Whether to render `ParentHomeScreen` vs `LearnerHome`; `sessionIsOwner` | F11 |
| `apps/mobile/src/components/home/LearnerScreen.tsx:469-475` | Recomputed `home.screen === 'ParentHome'` | Inline switch instead of contract read | F11 |

### More / Account / Privacy

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/more/index.tsx:47, 112-114, 118` | `isAdultOwner({role, birthYear})`, linked-children gate | `showAddChild`, `showRemoveFamilyMember` | F5, F8 |
| `apps/mobile/src/app/(app)/more/account.tsx:76, 85` | `activeProfile.isOwner` | `showAccountSecurity`, `showBilling` | F5 |
| `apps/mobile/src/app/(app)/more/accommodation.tsx:45-46` | `role`, `isOwner` | `showAccommodationChildEditor` | F5 |
| `apps/mobile/src/app/(app)/more/celebrations.tsx:36-37` | `role`, `isOwner` | `showCelebrationsChildEditor` | F5 |
| `apps/mobile/src/app/(app)/more/privacy.tsx:96, 135, 147` | `role` | `showMentorMemoryChildConsent` | F5, F7 |
| `apps/mobile/src/app/(app)/subscription.tsx:1590` | `isOwner` | `showRemoveFamilyMember` | F5 |
| `apps/mobile/src/app/(app)/subscription.tsx:77` | `tier === 'pro'` | Pro tier server-only / not publicly listed (BUG-899) | F10 |
| `apps/mobile/src/app/(app)/subscription.tsx:649, 653, 661` | `activeProfile?.isOwner === true` | **Analytics tag (not a gate)** — excluded from AST ratchet | F6 (no-op) |

### Mentor Memory

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/mentor-memory.tsx:217` | `consentStatus` | Mentor-memory consent gate | F2 |
| `apps/mobile/src/app/(app)/mentor-memory.tsx:233` | `isParentProxy` | Proxy redirect (`<Redirect ... />`) | F3 |
| `apps/mobile/src/app/(app)/mentor-memory.tsx:360, 369, 408` | `isOwner`, `role` | Child-consent editor visibility | F5, F7 |
| `apps/mobile/src/app/(app)/mentor-memory.tsx:467` | `role !== 'owner'` | **UX copy branching** ("Set by parent") — not a visibility gate | F7 |

### Progress / Child Routes

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/progress/index.tsx:725` | `mode`, `profileId` | `progressHeaderTitleKey`, `showProgressProfilePicker`; foreign-profile rejection via `canEnter('progress', { profileId })` | F11 |
| `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` | family-link membership | `canEnter('child/[profileId]', { profileId })` — currently via `RequireFamilyContext` with `setMode('family')` side effect at `lib/navigation.ts:84` | F8 |
| `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:436-441` | `consentStatus` | Child-profile data display gate | F2 |

### Deep Learning Routes

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/own-learning.tsx:32-34` | mode/proxy | `canEnter('own-learning')` | F11 |
| `apps/mobile/src/app/(app)/dictation/_layout.tsx:63` | mode/proxy | `canEnter('dictation')` | F11 |
| `apps/mobile/src/app/(app)/homework/_layout.tsx:9` | mode/proxy | `canEnter('homework')` | F11 |
| `apps/mobile/src/app/(app)/session/_layout.tsx:9` | mode/proxy | `canEnter('session')` | F11 |
| `apps/mobile/src/app/(app)/quiz/_layout.tsx:118` | mode/proxy | `canEnter('quiz')` | F11 |
| `apps/mobile/src/app/(app)/practice/index.tsx:441` | mode/proxy | `canEnter('practice')` | F11 |
| `apps/mobile/src/app/(app)/session/index.tsx:1107` | `isOwner` | `sessionIsOwner` | F5 |

### Supporting

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/lib/profile.ts:42` | `activeProfile`, `profiles` | `isFamilyCapableProfile()` predicate | — |
| `apps/mobile/src/lib/app-context.tsx:34` | React state only | `mode` (not persisted to AsyncStorage/SecureStore) | F9 |
| `apps/mobile/src/lib/app-context.tsx:49-51` | `activeProfile.id / isOwner / birthYear` change | `useEffect` clears `modeOverride` on active-profile flip | F9 |
| `packages/schemas/src/age.ts:54` | `role`, `birthYear` | `isAdultOwner({ role, birthYear })` canonical predicate | — |
| `apps/mobile/src/lib/navigation.ts:84` | `setMode('family')` side effect | `useGuardFamilyRoute()` not pure guard | F8 |

**Estimated touch count:** ~20 production files, ~119 line-level reads in scope (revised after adversarial AST grep, 2026-05-21).

Excluded from this matrix:
- 13 `isOwner` content-gating sites + 4 `role`-gating sites scattered across 9 files — already covered in rows above.
- Analytics property writes (`subscription.tsx:649,653,661`) — not gates.
- Test files, type definitions, schemas — not consumers.

---

## Findings F1–F14

> ⚠ F-numbering is *inferred* from the navigation-contract's "5 of 14 findings addressed" callout and re-derived from the draft's CRITICAL/HIGH/MEDIUM-N severity labels. Treat as scaffold; re-audit for precise IDs and severities.

### Inside navigation-contract scope (LOW — UI sweep)

| ID | Severity | Title | Status |
|---|---|---|---|
| F5 | LOW | `isOwner` content gating duplicated across 13 sites in More/Account/Subscription/MentorMemory/Session — single source of truth missing. | Closed by contract `gates.show*` fields (Phase 2 PRs 2-5). |
| F6 | LOW | Analytics-tag `isOwner` reads at `subscription.tsx:649,653,661` falsely flagged as gates by earlier audits. | Closed; AST ratchet excludes object-literal property writes. |
| F7 | LOW | Mentor-memory copy variation (`"Set by parent"`) is UX copy branching, not visibility gate. | Closed; either add `gates.mentorMemoryOriginCopy` or allowlist. |
| F8 | LOW | `RequireFamilyContext` not purely a guard — calls `setMode('family')` side effect inside `useGuardFamilyRoute()`. | Closed by Phase 2 PR 4 decision: keep wrapper using contract for read-only checks, OR extract side effect into `useApplyContractIntent()`. |
| F11 | LOW | Tab composition, deep-route entry guards, and home-screen selection recomputed in ~10 files. | Closed by `useNavigationContract()` adoption. |

### Outside navigation-contract scope (HIGH / server-side / age-math / delivery)

| ID | Severity | Title | Why outside contract |
|---|---|---|---|
| F1 | HIGH | IDOR on `PATCH /profiles/:id` (server-side authorization gap). | Server-side. Addressed by `createScopedRepository(profileId)` + parent-chain WHERE filters. |
| F2 | HIGH | Consent-state interception is shell-level (above contract output); not a contract dimension. | Different layer; full-screen overlay covers the contract's output. Folding into contract would require explicit `gates.requireConsent` field + matrix rows per consent state. |
| F3 | TBD | Mentor-memory proxy redirect at `mentor-memory.tsx:233` migrates to `canEnter('mentor-memory')`. | Addressed in spec but listed because earlier draft missed it. |
| F4 | TBD | (Reserved — re-derive from full audit.) | — |
| F9 | TBD | `mode` is React state only; not persisted. Cross-account leak risk mitigated by `signOutWithCleanup()` clearing `activeProfile` atomically. | Cross-cutting; do not add storage-backed mode persistence without re-reviewing the leak guarantee. |
| F10 | TBD | Pro tier treated identically to Family for navigation (BUG-899). Contract is forward-compatible; product divergence would require adding a tier dimension. | Product/billing decision, not navigation. |
| F12 | TBD | Hook memoization rule — contract must memoize on stable signature of inputs, not array reference (TanStack Query returns new `profiles` array reference on every refetch). | Implementation detail of the contract hook, captured in spec's "Failure Modes". |
| F13 | TBD | (Reserved — re-derive from full audit.) | — |
| F14 | TBD | (Reserved — re-derive from full audit.) | — |

---

## Re-verification Checklist

Before citing this matrix in a PR or review:

1. Open each `file:line` in the inventory table; confirm the gate still exists at that location.
2. For findings F1–F14, re-derive the F-numbering from a fresh adversarial audit — the IDs here are scaffolded.
3. Run AST grep for any new `isOwner`, `role`, `birthYear`, `isParentProxy`, `mode`, `consentStatus` reads that aren't in the inventory.
4. Cross-check against `docs/specs/2026-05-21-navigation-contract.md` Phase 2 plan.

---

## Provenance

- **Original source:** lost (wiped by stash cycle on 2026-05-21).
- **Reconstruction source:** dangling commit `e6287097a6fe4cfea03a82f77d7a2b22d46fc17b` (earlier draft of navigation-contract spec).
- **Recovery worktree:** `.worktrees/recovery-2026-05-22/`.
- **Recovery branch:** `recovery/2026-05-22-wip`.
