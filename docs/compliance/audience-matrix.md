# Audience Matrix — Scattered Gating Snapshot

> **Reconstructed scaffold (2026-05-22).** The original `docs/compliance/audience-matrix.md` was lost — it was created in another agent's working tree on 2026-05-21 and wiped by a stash cycle before any git operation captured it (not in any commit, dangling blob, or worktree on disk).
>
> **Scope boundary (2026-07-23):** this is a product-audience/navigation gating
> inventory, not the country/consent matrix. Product age bands, national
> Article 8 thresholds, and launch-country eligibility live in
> [`docs/compliance/2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md).
>
> This scaffold rebuilds the doc from references in the earlier draft of `docs/_archive/specs/Done/2026-05-21-navigation-contract.md` (dangling commit `e6287097`). The original severity labels (F1–F14) are *inferred* from the navigation-contract's "5 of 14 findings addressed" callout. Re-derive F-numbers and file:line citations from a fresh audit before using them as current evidence.

**Status:** Historical reconstructed inventory, partially refreshed 2026-07-23 for the home-route branch and compliance-document location. It is not a current whole-file line map. F-numbering remains scaffolded.

> **Regression constraint.** All currently shipped flag states must remain intact until the V0-retirement milestone. Read the per-environment flags and the current rule in `AGENTS.md`; do not infer one global mode from this historical matrix.

## Related documents

- [`docs/_archive/specs/Done/2026-05-21-navigation-contract.md`](../_archive/specs/Done/2026-05-21-navigation-contract.md) — archived target spec that introduced `resolveNavigationContract(ctx)`.
- [`docs/flows/flow-master-directory.md`](../flows/flow-master-directory.md) — flow register. Each flow page in `flows/master-directory/` cites this matrix when it touches a gated surface (home, more, account, privacy, progress).
- `AGENTS.md` — "Profile Shapes" is authoritative for current tab shapes and records the `home.tsx` branch on `navigationContract.home.screen`.

---

## Purpose

This matrix preserves the reconstructed 2026-05 snapshot of scattered UI/navigation gating across the mobile app. It is supporting compliance evidence, not current authority; current behavior must be checked against `AGENTS.md`, `apps/mobile/src/lib/navigation-contract.ts`, and the cited consumers.

The matrix and `docs/_archive/specs/Done/2026-05-21-navigation-contract.md` are historically paired:

- **This matrix = current state inventory** with file:line citations and findings F1–F14.
- **The navigation-contract spec = target state** describing the single `resolveNavigationContract(ctx)` function consumers migrate to.

The navigation-contract addresses **5 of 14 findings** here (F5, F6, F7, F8, F11 — all LOW, UI sweep targets). The other 9 are server-side, age-math, or push-delivery gaps that the contract does **not** close. A green ratchet test on the navigation-contract is **not** evidence that the gaps in this matrix are fixed.

---

## Inventory — Scattered Gating Sites

Each entry is a current-code site that branches on profile attributes (`isOwner`, `role`, `birthYear`, `mode`, `isParentProxy`, `tier`, `consentStatus`). Verified 2026-05-23 against HEAD.

### Shell and Routing

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/_layout.tsx:2093-2109` | `tabShape`, `visibleTabs`, `homeTabPresentation` | Tab bar composition; replaced by `useNavigationContract()` | F11 |
| `apps/mobile/src/app/(app)/_layout.tsx:1581` | `consentStatus === 'PARENTAL_CONSENT_REQUESTED'` | Full-screen consent overlay (shell-level interception) | F2 |
| `apps/mobile/src/app/(app)/_layout.tsx:2491` | Withdrawal flow | Full-screen withdrawal overlay | F2 |

### Home

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/home.tsx:21, 166-169` | `navigationContract.home.screen` | **Current branch:** `FamilyHome` mounts `<ParentHomeScreen>`; every other contract result mounts `<LearnerScreen>`. | F11 (historical finding closed by contract wiring) |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | `navigationContract.gates.*` | Learner-home content consumes the navigation contract; the removed `showParentHome` / inline `ParentHomeScreen` branch must not be reintroduced. | F11 (historical finding closed) |

### More / Account / Privacy

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/more/index.tsx:40, 66, 112-118` | `role` (40), `subscription.tier` (66, family/pro gate for add-child), `activeProfile.isOwner` (112), `isAdultOwner({role, birthYear})` (115-118) | `showAddChild`, linked-children list for `showRemoveFamilyMember` | F5, F8 |
| `apps/mobile/src/app/(app)/more/account.tsx:81-82, 95-96` | `activeProfile.isOwner` (81-82), `role === 'owner'` (95-96) | `showAccountSecurity` (81-82), `showBilling` / subscription row (95-96) | F5 |
| `apps/mobile/src/app/(app)/more/accommodation.tsx:43-46` | `isOwner` on `activeProfile` AND `childProfile` (proxy-edit canonical) | `canEditChildPreferences` → accommodation child editor | F5 |
| `apps/mobile/src/app/(app)/more/celebrations.tsx:34-37` | `isOwner` on `activeProfile` AND `childProfile` (proxy-edit canonical) | `canEditChildPreferences` → celebrations child editor | F5 |
| `apps/mobile/src/app/(app)/more/privacy.tsx:96, 135, 147` | `role === 'owner'` | Withdrawal-archive section (96), Export Data row (135), Delete Account row (147) — **NOT** mentor-memory consent (that lives in `mentor-memory.tsx`) | F5, F7 |
| `apps/mobile/src/app/(app)/subscription.tsx:1590` | `activeProfile.isOwner === true && !member.isOwner` | Remove-family-member button | F5 |
| `apps/mobile/src/app/(app)/subscription.tsx:70-77` | Documentation block (no runtime branch) | BUG-899 intent: Family/Pro tiers hidden from upgrade UI. Actual runtime gate is the tier filter that builds `TIER_FEATURES` and the `tier !== 'family' && tier !== 'pro'` check at `more/index.tsx:71` | F10 |
| `apps/mobile/src/app/(app)/subscription.tsx:649, 653, 661` | `activeProfile?.isOwner === true` | **Analytics tag (not a gate)** — excluded from AST ratchet | F6 (no-op) |

### Mentor Memory

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/mentor-memory.tsx:217-218` | `profile.memoryConsentStatus` → `consentStatus`, `memoryEnabled` | Local derived state used by all downstream gates in this screen | F2 |
| `apps/mobile/src/app/(app)/mentor-memory.tsx:233` | `navigationContract.canEnter('mentor-memory')` | Proxy redirect (`<Redirect href="/(app)/home" />`); now reads via contract, not raw `isParentProxy` | F3 |
| `apps/mobile/src/app/(app)/mentor-memory.tsx:366-372, 410` | `consentStatus`, `isOwnerSelf` (via `navigationContract.gates.sessionIsOwner` at 61) | Pending-copy role-aware branch (366-372) and adult-owner consent prompt visibility (410) | F5, F7 |
| `apps/mobile/src/app/(app)/mentor-memory.tsx:469` | `!isOwnerSelf` | **UX copy branching** ("Set by parent" badge) — not a visibility gate | F7 |

### Progress / Child Routes

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/progress/index.tsx:729-731` | `role === 'impersonated-child'` → `isParentProxyView` (V0) or `navigationContract.isParentProxy` (V1) | Discriminator for progress header / picker rendering. | F11 |
| `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx:12, 41` | Wraps `<Stack>` in `<RequireFamilyContext>` | Family-link membership guard. The `setMode('family')` side effect lives in `components/guards/RequireFamilyContext.tsx:45` (read via `useGuardFamilyRoute()` declared at `lib/navigation.ts:106`). | F8 |
| `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:432-441` | `consent.data?.consentStatus` (432), `'CONSENTED'`/`'WITHDRAWN'` checks (436-437, 441) | Child-profile data display gate (`hasConsentRecord`, `isWithdrawn`) | F2 |

### Deep Learning Routes

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/own-learning.tsx:32-35` | `resolveTabShape({activeProfile, profiles, isParentProxy})` (32), `familyCapable` + `tabShape !== 'guardian'` (33) | Redirect-to-home for non-guardian, non-family-capable profiles (`canEnter('own-learning')` analogue) | F11 |
| `apps/mobile/src/app/(app)/dictation/_layout.tsx:63` | mode/proxy | `canEnter('dictation')` | F11 |
| `apps/mobile/src/app/(app)/homework/_layout.tsx:9` | mode/proxy | `canEnter('homework')` | F11 |
| `apps/mobile/src/app/(app)/session/_layout.tsx:9` | mode/proxy | `canEnter('session')` | F11 |
| `apps/mobile/src/app/(app)/quiz/_layout.tsx:118` | mode/proxy | `canEnter('quiz')` | F11 |
| `apps/mobile/src/app/(app)/practice/index.tsx:441` | mode/proxy | `canEnter('practice')` | F11 |
| `apps/mobile/src/app/(app)/session/index.tsx:1109` | `isOwner` | `sessionIsOwner` | F5 |

### Supporting

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/lib/profile.ts:42-48` | `activeProfile.id / isOwner / birthYear`, `profiles[].isOwner` | `isFamilyCapableProfile()` predicate | — |
| `apps/mobile/src/lib/app-context.tsx:52` | `useState<AppMode \| null>` | `modeOverride` React state — not persisted to AsyncStorage/SecureStore (final `mode` derived at line 88) | F9 |
| `apps/mobile/src/lib/app-context.tsx:74-84` | `activeProfile.id / isOwner / birthYear` change | `useEffect` clears `modeOverride` on active-profile flip | F9 |
| `packages/schemas/src/age.ts:53-65` | `role`, `isOwner`, `birthYear` | `isAdultOwner(profile, currentYear?)` canonical predicate | — |
| `apps/mobile/src/lib/navigation.ts:106` + `apps/mobile/src/components/guards/RequireFamilyContext.tsx:45` | `useGuardFamilyRoute()` declared at `navigation.ts:106` (pure read); `setMode('family')` side effect lives in the consumer `RequireFamilyContext.tsx:45` | Family-route guard with consumer-side mode-flip side effect — not a pure guard at the guard-component level | F8 |

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
4. Cross-check against `docs/_archive/specs/Done/2026-05-21-navigation-contract.md` Phase 2 plan and the current `AGENTS.md` profile-shape rules.

---

## Provenance

- **Original source:** lost (wiped by stash cycle on 2026-05-21).
- **Reconstruction source:** dangling commit `e6287097a6fe4cfea03a82f77d7a2b22d46fc17b` (earlier draft of navigation-contract spec).
- **Recovery worktree:** `.worktrees/recovery-2026-05-22/`.
- **Recovery branch:** `recovery/2026-05-22-wip`.
