# Audience Matrix — Scattered Gating Snapshot

> **Reconstructed scaffold (2026-05-22).** The original `docs/audience-matrix.md` was lost — it was created in another agent's working tree on 2026-05-21 and wiped by a stash cycle before any git operation captured it (not in any commit, dangling blob, or worktree on disk).
>
> This scaffold rebuilds the doc from references in the earlier draft of `docs/specs/2026-05-21-navigation-contract.md` (dangling commit `e6287097`). All file:line citations below are extracted from that draft and re-verified against current HEAD — but the original severity labels (F1–F14) are *inferred* from the navigation-contract's "5 of 14 findings addressed" callout. Re-derive F-numbers from a fresh audit if precision matters.

**Status:** Re-verified 2026-06-03 against HEAD. Most inventory citations had drifted (the nav-contract V0→V1 migration moved every NAV/profile/gating site to `useNavigationContract()` / `useNavigationShellContract()` reads and renumbered lines); citations and "Reads" columns corrected against current code. Notably, several findings are now **closed in code**: the More/Account/Privacy/Subscription `isOwner`/`role` sites migrated to `navigationContract.gates.*` (F5), and `RequireFamilyContext` became a pure read-only guard (F8). F-numbering still scaffolded — re-derive from a fresh audit if precision matters. ⚠ Two doc claims could not be re-verified against current code and are flagged inline: the F10 BUG-899 `TIER_FEATURES` block (gone) and the `more/index.tsx:71` tier filter (gone).

> **Migration constraint.** Closing F5/F6/F7/F8/F11 by migrating these sites to `resolveNavigationContract` **must not regress today's 5-tab mode** (active when `MODE_NAV_V0_ENABLED=false` in Doppler). The contract is wired behind a separate `MODE_NAV_V1_ENABLED` flag; the V0 helpers consumed by each site below stay alive. See the "Hard Constraint" section of `docs/specs/2026-05-21-navigation-contract.md` for the flag matrix.

## Related documents

- [`docs/specs/2026-05-21-navigation-contract.md`](specs/2026-05-21-navigation-contract.md) — **paired target spec.** Defines `resolveNavigationContract(ctx)` (the function this matrix's F5/F6/F7/F8/F11 sites migrate to).
- [`docs/flows/flow-master-directory.md`](flows/flow-master-directory.md) — flow register. Each flow page in `flows/master-directory/` cites this matrix when it touches a gated surface (home, more, account, privacy, progress).
- `CLAUDE.md` — "Profile Shapes" section is authoritative for **current** tab shapes (`guardian` / `learner`) and the rule that `home.tsx` does not branch (the `ParentHomeScreen` decision lives inside `LearnerScreen.tsx`). The matrix below reflects this rule.

---

## Purpose

This matrix is the authoritative snapshot of **current** scattered UI/navigation gating across the mobile app. It exists because the answer to "what does this profile see?" is reconstructed in ~20 places — every fix patches one consumer; the contract lives in nobody's head.

The matrix and `docs/specs/2026-05-21-navigation-contract.md` are **paired**:

- **This matrix = current state inventory** with file:line citations and findings F1–F14.
- **The navigation-contract spec = target state** describing the single `resolveNavigationContract(ctx)` function consumers migrate to.

The navigation-contract addresses **5 of 14 findings** here (F5, F6, F7, F8, F11 — all LOW, UI sweep targets). The other 9 are server-side, age-math, or push-delivery gaps that the contract does **not** close. A green ratchet test on the navigation-contract is **not** evidence that the gaps in this matrix are fixed.

---

## Inventory — Scattered Gating Sites

Each entry is a current-code site that branches on profile attributes (`isOwner`, `role`, `birthYear`, `mode`, `isParentProxy`, `tier`, `consentStatus`) or, post-migration, reads the navigation contract gates that encode them. Re-verified 2026-06-03 against HEAD.

### Shell and Routing

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/_layout.tsx:159-162` | `visibleTabs`, `homeTabPresentation` via `useNavigationShellContract()` (159) | Tab bar composition; now reads from the shell contract (`navigationShell.visibleTabs` at 160, `homeTabPresentation` at 161). The legacy V0 helpers (`resolveTabShape`/`computeVisibleTabs`/`computeModeVisibleTabs`/`resolveHomeTabPresentation`) now live in `apps/mobile/src/lib/legacy-navigation-contract.ts:62-99`, not in `_layout.tsx`. | F11 |
| `apps/mobile/src/app/(app)/_layout.tsx:556-559` | `consentStatus` ∈ `PENDING_CONSENT_STATUSES` | Full-screen consent overlay (`<ConsentPendingGate />`, shell-level interception) | F2 |
| `apps/mobile/src/app/(app)/_layout.tsx:568` | `consentStatus === 'WITHDRAWN'` | Full-screen withdrawal overlay (`<ConsentWithdrawnGate />`) | F2 |

### Home

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/home.tsx:28, 161-169` | `navigationContract.gates.sessionIsOwner` (28), `navigationContract.home.screen` (161) | **Now branches via the contract** — `navigationContract.home.screen === 'FamilyHome'` selects `<ParentHomeScreen>` (162) vs `<LearnerScreen>` (164-168). NOTE: this contradicts the stale CLAUDE.md "Profile Shapes" rule that says `home.tsx` always mounts `<LearnerScreen>` and never branches; code is ground truth — `home.tsx` is now a branching point. | F11 |
| `apps/mobile/src/components/home/LearnerScreen.tsx:492-494` | `showParentHome` (prop), `navigationContract.gates.showFamilyHome` (492) | **The `ParentHomeScreen` vs learner-home branch** — now a contract read (`showParentHome && navigationContract.gates.showFamilyHome`), NOT the old inline `mode === 'family' || hasLinkedChildren || isFamilyPlanOwner` switch. `isFamilyPlanOwner` derivation is gone; `hasLinkedChildren` (129) now only feeds the family-setup CTA (147-149). | F11 |

### More / Account / Privacy

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/more/index.tsx:41, 58, 78, 81` | `navigationContract.isParentProxy` (41), `navigationContract.gates.showAddChild` (58, 81), `navigationContract.gates.showRemoveFamilyMember` (78) | `showAddChild`, linked-children list for `showRemoveFamilyMember`. **Migrated to contract gates** — the old raw `role` / `activeProfile.isOwner` / `isAdultOwner({role, birthYear})` reads are gone; this site no longer recomputes gating inline. | F5, F8 (closed at this site) |
| `apps/mobile/src/app/(app)/more/account.tsx:77, 93` | `navigationContract.gates.showAccountSecurity` (77), `navigationContract.gates.showBilling` (93) | `showAccountSecurity` (AccountSecurity row, 76-78), `showBilling` / subscription row (93). **Migrated to contract gates** — old `activeProfile.isOwner` / `role === 'owner'` reads gone. | F5 (closed at this site) |
| `apps/mobile/src/app/(app)/more/accommodation.tsx:45-48` | `navigationContract.gates.showAccommodationChildEditor` (47) AND `childProfile?.isOwner === false` (48) | `canEditChildPreferences` → accommodation child editor (proxy-edit canonical gate now via contract) | F5 |
| `apps/mobile/src/app/(app)/more/celebrations.tsx:36-39` | `navigationContract.gates.showCelebrationsChildEditor` (38) AND `childProfile?.isOwner === false` (39) | `canEditChildPreferences` → celebrations child editor (proxy-edit canonical gate now via contract) | F5 |
| `apps/mobile/src/app/(app)/more/privacy.tsx:25-26, 137, 149` | `navigationContract.gates.showExportDelete` (25), `navigationContract.gates.showRemoveFamilyMember` (26) | Withdrawal-archive section (`showWithdrawalArchive`, 98), Export Data row (137-148), Delete Account row (149-155) — gated by `showOwnerPrivacyGates`. **Migrated to contract gates** — old `role === 'owner'` reads gone. **NOT** mentor-memory consent (that lives in `mentor-memory.tsx`) | F5, F7 (closed at this site) |
| `apps/mobile/src/app/(app)/subscription.tsx:131, 953` | `navigationContract.gates.showRemoveFamilyMember` → `canRemoveFamilyMember` (131); `canRemoveFamilyMember && !member.isOwner` (953) | Remove-family-member button. **Migrated to contract gate** — old `activeProfile.isOwner === true` read replaced by `gates.showRemoveFamilyMember`. | F5 (closed at this site) |
| `apps/mobile/src/app/(app)/subscription.tsx` (doc block removed) | — | ⚠ STALE/UNVERIFIABLE: the BUG-899 documentation block (cited `:70-77`) and the `TIER_FEATURES` tier filter no longer exist in `subscription.tsx`. The `more/index.tsx:71` `tier !== 'family' && tier !== 'pro'` check is also gone (only a `useFamilySubscription` enablement read remains at `more/index.tsx:46`). Re-derive F10's current runtime gate from a fresh audit. | F10 |
| `apps/mobile/src/app/(app)/subscription.tsx:137, 145` | `isOwnerProfile` (`activeProfile?.isOwner === true`, derived at 129) | **Analytics tag (not a gate)** — `is_owner: isOwnerProfile` in `breakdownAnalytics` (137) and `subscription_breakdown_mounted` track call (145); excluded from AST ratchet | F6 (no-op) |

### Mentor Memory

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/mentor-memory.tsx:229-230` | `profile.memoryConsentStatus` → `consentStatus` (229), `memoryEnabled` (230) | Local derived state used by all downstream gates in this screen | F2 |
| `apps/mobile/src/app/(app)/mentor-memory.tsx:249, 253` | `navigationContract.canEnter('mentor-memory')` (249, V1) / `navigationContract.isParentProxy` (250, V0 fallback) | Proxy redirect (`<Redirect href="/(app)/home" />` at 253); reads via contract, not raw `isParentProxy` | F3 |
| `apps/mobile/src/app/(app)/mentor-memory.tsx:391-402, 442` | `consentStatus`, `isOwnerSelf` (via `navigationContract.gates.sessionIsOwner` at 68) | Pending-copy role-aware branch (391-402) and adult-owner consent prompt visibility (`consentStatus === 'pending' && isOwnerSelf` at 442) | F5, F7 |
| `apps/mobile/src/app/(app)/mentor-memory.tsx:501` | `!isOwnerSelf` | **UX copy branching** ("Set by parent" badge) — not a visibility gate | F7 |

### Progress / Child Routes

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/progress/index.tsx:331-333` | `navigationContract.isParentProxy` (V1, 332) or `role === 'impersonated-child'` (V0, 333) → `isParentProxyView` | Discriminator for progress header / picker rendering. | F11 |
| `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx:19` | Wraps `<Stack>` in `<RequireFamilyContext route="child/[profileId]">` | Family-link membership guard. **F8 closed:** `RequireFamilyContext` is now a READ-ONLY guard (`components/guards/RequireFamilyContext.tsx:12-15, 45-49`) — it gates via `contract.canEnter(route, params)` and does NOT call `setMode('family')` as a side effect; the only mode mutation is `enterFamilyMode()` behind an explicit user-pressed CTA (63-77). The old `useGuardFamilyRoute()` helper no longer exists in the codebase. | F8 (closed) |
| `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:571-580` | `consent.data?.consentStatus` (571), `'CONSENTED'`/`'WITHDRAWN'` checks (575-576, 580) | Child-profile data display gate (`hasConsentRecord` at 572, `isWithdrawn` at 580) | F2 |

### Deep Learning Routes

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/app/(app)/own-learning.tsx:32-35` | `resolveTabShape({activeProfile, profiles, isParentProxy})` (32), `familyCapable` + `tabShape !== 'guardian'` (33) | Redirect-to-home for non-guardian, non-family-capable profiles (`canEnter('own-learning')` analogue) | F11 |
| `apps/mobile/src/app/(app)/dictation/_layout.tsx:67-69` | mode/proxy | `canEnter('dictation')` (V1, 68) / `isParentProxy` (V0 fallback, 69) | F11 |
| `apps/mobile/src/app/(app)/homework/_layout.tsx:12-14` | mode/proxy | `canEnter('homework')` (V1, 13) / `isParentProxy` (V0 fallback, 14) | F11 |
| `apps/mobile/src/app/(app)/session/_layout.tsx:17-19` | mode/proxy | `canEnter('session')` (V1, 18) / `isParentProxy` (V0 fallback, 19) | F11 |
| `apps/mobile/src/app/(app)/quiz/_layout.tsx:121-123` | mode/proxy | `canEnter('quiz')` (V1, 122) / `isParentProxy` (V0 fallback, 123) | F11 |
| `apps/mobile/src/app/(app)/practice/index.tsx:444-446` | mode/proxy | `canEnter('practice')` (V1, 445) / `isParentProxy` (V0 fallback, 446) | F11 |
| `apps/mobile/src/app/(app)/session/index.tsx:1193` | `navigationContract.gates.sessionIsOwner` | `sessionIsOwner` | F5 |

### Supporting

| File:line | Reads | What it gates | Finding |
|---|---|---|---|
| `apps/mobile/src/lib/profile.ts:42-53` | `activeProfile.id / isOwner / birthYear`, `profiles[].isOwner` | `isFamilyCapableProfile()` predicate | — |
| `apps/mobile/src/lib/app-context.tsx:59` | `useState<AppMode \| null>` | `modeOverride` React state — not persisted to AsyncStorage/SecureStore (final `mode` derived at line 93) | F9 |
| `apps/mobile/src/lib/app-context.tsx:82-91` | `activeProfile.id / isOwner / birthYear / defaultAppContext / hasFamilyLinks` change | `useEffect` clears `modeOverride` on active-profile flip | F9 |
| `packages/schemas/src/age.ts:53-64` | `role`, `isOwner`, `birthYear` | `isAdultOwner(profile, currentYear?)` canonical predicate | — |
| `apps/mobile/src/components/guards/RequireFamilyContext.tsx:45-49` | `contract.canEnter(route, params)` (V1) / `contract.effectiveAppContext === 'family'` (V0) | **F8 closed:** `RequireFamilyContext` is now a pure READ-ONLY guard (see comment at 12-15). The old `useGuardFamilyRoute()` helper at `lib/navigation.ts:106` no longer exists; `navigation.ts:106` is now an unrelated push helper. No `setMode('family')` side effect inside the guard — mode changes only via the explicit `enterFamilyMode()` CTA (63-77). | F8 (closed) |

**Estimated touch count:** ~20 production files, ~119 line-level reads in scope (revised after adversarial AST grep, 2026-05-21).

Excluded from this matrix:
- 13 `isOwner` content-gating sites + 4 `role`-gating sites scattered across 9 files — already covered in rows above.
- Analytics property writes (`subscription.tsx:137,145` — `is_owner: isOwnerProfile`) — not gates.
- Test files, type definitions, schemas — not consumers.

---

## Findings F1–F14

> ⚠ F-numbering is *inferred* from the navigation-contract's "5 of 14 findings addressed" callout and re-derived from the draft's CRITICAL/HIGH/MEDIUM-N severity labels. Treat as scaffold; re-audit for precise IDs and severities.

### Inside navigation-contract scope (LOW — UI sweep)

| ID | Severity | Title | Status |
|---|---|---|---|
| F5 | LOW | `isOwner` content gating duplicated across 13 sites in More/Account/Subscription/MentorMemory/Session — single source of truth missing. | Closed by contract `gates.show*` fields (Phase 2 PRs 2-5). |
| F6 | LOW | Analytics-tag `isOwner` reads at `subscription.tsx:137,145` (`is_owner: isOwnerProfile`) falsely flagged as gates by earlier audits. | Closed; AST ratchet excludes object-literal property writes. |
| F7 | LOW | Mentor-memory copy variation (`"Set by parent"`) is UX copy branching, not visibility gate. | Closed; either add `gates.mentorMemoryOriginCopy` or allowlist. |
| F8 | LOW | `RequireFamilyContext` not purely a guard — formerly called `setMode('family')` side effect inside `useGuardFamilyRoute()`. | **Closed in code** (verified 2026-06-03): `RequireFamilyContext` is now a pure read-only guard (`components/guards/RequireFamilyContext.tsx:12-15, 45-49`), gating via `contract.canEnter()`. `useGuardFamilyRoute()` no longer exists; the only mode mutation is the explicit user-pressed `enterFamilyMode()` CTA. |
| F11 | LOW | Tab composition, deep-route entry guards, and home-screen selection recomputed in ~10 files. | Closed by `useNavigationContract()` adoption. |

### Outside navigation-contract scope (HIGH / server-side / age-math / delivery)

| ID | Severity | Title | Why outside contract |
|---|---|---|---|
| F1 | HIGH | IDOR on `PATCH /profiles/:id` (server-side authorization gap). | Server-side. Addressed by `createScopedRepository(profileId)` + parent-chain WHERE filters. |
| F2 | HIGH | Consent-state interception is shell-level (above contract output); not a contract dimension. | Different layer; full-screen overlay covers the contract's output. Folding into contract would require explicit `gates.requireConsent` field + matrix rows per consent state. |
| F3 | TBD | Mentor-memory proxy redirect at `mentor-memory.tsx:249-253` migrates to `canEnter('mentor-memory')`. | Addressed in spec but listed because earlier draft missed it. |
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
