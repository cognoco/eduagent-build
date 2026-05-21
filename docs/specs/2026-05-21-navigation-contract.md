# Navigation Contract — Centralized Per-Profile Behavior

**Status:** Spec — pending implementation
**Date:** 2026-05-21
**Spec only.** No code written yet. Implementation lands in a follow-up PR per the Phase 2 plan at the end of this doc.

---

## Why this exists

Today, the answer to "what does this user see?" is reconstructed in every consumer:

- `_layout.tsx` decides tab visibility from `resolveTabShape` + `computeVisibleTabs` + `computeModeVisibleTabs` with a precedence chain (`proxy > family-capable-mode > legacy shape`).
- `home.tsx` re-derives whether to show `ParentHomeScreen` from `mode`, `hasLinkedChildren`, `isFamilyPlanOwner`, `isParentProxy`, `showParentHome`.
- `more/index.tsx` re-derives `showAddChild` from `isAdultOwner({role, birthYear})` and gates linked-child UI on `activeProfile?.isOwner`.
- `progress/index.tsx` decides whether to render the profile picker from `mode === 'family'`, rejects foreign `?profileId=` deep links only in Study mode, and resets `selectedProfileId` on Family→Study flip.
- `own-learning.tsx`, `dictation/_layout.tsx`, `homework/_layout.tsx`, `session/_layout.tsx`, `quiz/_layout.tsx`, `mentor-memory.tsx`, `practice/index.tsx`, `child/[profileId]/_layout.tsx` — each guards itself independently.
- 13 `isOwner` content-gating sites + 4 `role`-gating sites are scattered across 9 files.

This is the surface where bugs keep landing — UI dead ends (`project_web_flow_bugs.md`), schema/UX drift between specs and code, and inconsistent gating across screens. Every fix patches one consumer; the contract lives in nobody's head and nobody's file.

**Scope and non-scope (explicit).** This contract reduces **UI/navigation drift**. It does **not** provide server-side authorization. Server-side leaks (CR-124 IDOR, sign-out cache leaks, proxy fall-through on the API) are addressed separately by `createScopedRepository(profileId)`, parent-chain WHERE filters, and identity-keyed query cache resets — none of which this spec touches or replaces. A green ratchet test on this contract is **not** evidence that the server is safe; do not cite the contract in a security review.

**Goal of this spec:** define one function — `resolveNavigationContract(ctx)` — that owns every per-profile **UI** decision (which tabs render, which screens, which gates). Every consumer reads from its return value. Adding a new tab, content block, or surface-level guard requires editing the contract, not the consumers.

---

## Inputs — `ProfileContext`

The contract is a pure function of this context. No I/O, no async, no React hooks inside.

| Field | Type | Source |
|---|---|---|
| `activeProfile` | `Profile \| null` | `useProfile()` |
| `profiles` | `ReadonlyArray<Profile>` | `useProfile()` |
| `isParentProxy` | `boolean` | `useParentProxy()` |
| `mode` | `'study' \| 'family' \| null` | `useAppContext()` |
| `role` | `'owner' \| 'impersonated-child' \| 'child' \| null` | `useActiveProfileRole()` |
| `subscription` | `{ status: 'loading' \| 'ready'; tier: 'free' \| 'plus' \| 'family' \| 'pro' \| null }` | `useSubscription()` |
| `flags` | `{ MODE_NAV_V0_ENABLED: boolean; ... }` | `FEATURE_FLAGS` (build-time static; see Failure Modes for restart requirement on flip) |

`Profile` carries `id`, `isOwner`, `birthYear`, `consentStatus`, `displayName` — already defined in `@eduagent/schemas`.

**Loading semantics (least-privilege default).** Any input that is in a transitional state degrades the contract to the safer output:

- `activeProfile == null` → learner shape, no mode features (row 10).
- `subscription.status === 'loading'` → contract behaves as if `tier = null` (no family-tier-only features surface; brief flash on resolution is acceptable, leakage is not).
- `mode === null` → legacy `tabShape` path; mode features hidden.

Derived inside the contract (not inputs):

- `familyCapable` = `isFamilyCapableProfile(activeProfile, profiles)` from `apps/mobile/src/lib/profile.ts:42` — adult owner with **at least one linked child**. Family-tier subscription is NOT part of this predicate (verified against current code 2026-05-21). If product wants family-tier-without-kids to unlock F-mode, change the predicate in one place; do not branch in the contract.
- `hasLinkedChildren` = `profiles.some(p => !p.isOwner)`.
- `isAdultOwnerValue` = `isAdultOwner({ role, birthYear })` from `@eduagent/schemas` (`packages/schemas/src/age.ts:54`). Note: `computeAgeBracket()` returns the union `'child' | 'adolescent' | 'adult'`; an `>= 18` comparison would be a type error. Always go through `isAdultOwner` (or `computeAgeBracket(...) === 'adult'`).

---

## Outputs — `NavigationContract`

A single returned object. Every field is the **complete answer** to one question. No consumer recomputes.

```ts
type NavigationContract = {
  // What kind of shell do we render?
  shape: 'guardian' | 'learner';
  effectiveMode: 'study' | 'family' | null;
  isParentProxy: boolean;

  // Which tabs appear in the tab bar?
  visibleTabs: ReadonlySet<TabKey>;
  // TabKey = 'home' | 'own-learning' | 'library' | 'progress' | 'more'

  // Home tab presentation
  home: {
    screen: 'ParentHome' | 'LearnerHome';
    titleKey: 'tabs.familyHub' | 'tabs.myLearning';
    iconName: 'Home' | 'School';
  };

  // Content gates INSIDE tabs (every isOwner/role check today)
  gates: {
    // More tab
    showBilling: boolean;
    showAccountSecurity: boolean;
    showExportDelete: boolean;
    showAddChild: boolean;            // adult owner only
    showMentorMemoryChildConsent: boolean;
    showRemoveFamilyMember: boolean;
    showCelebrationsChildEditor: boolean;
    showAccommodationChildEditor: boolean;

    // Home tab
    showRecentChildActivity: boolean; // Family mode only
    showInlineStudyInvite: boolean;   // Family mode only; woven into child-activity context, NOT a standalone card

    // Progress tab
    showProgressProfilePicker: boolean; // Family mode only
    progressHeaderTitleKey: 'progress.title' | 'progress.titleViewingChild';

    // Session metadata
    sessionIsOwner: boolean;          // session payload flag
  };

  // App chrome (mounted once in shell, not per-screen)
  chrome: {
    modeSwitcher: 'global-header' | 'hidden'; // 'global-header' = pill visible on every in-app screen for family-capable users. ALWAYS 'hidden' when isParentProxy === true (proxy collapses familyCapable, but the contract states this defensively so a future refactor cannot accidentally surface the switcher in proxy).
    proxyBanner: 'required' | 'hidden';       // 'required' whenever isParentProxy === true. The ProxyBanner (with onSwitchBack) is the ONLY exit affordance from proxy when the `more` tab is hidden (matrix row 7). Defensive invariant — UI cleanup PRs must not remove the banner without first restoring `more` to row 7.
  };

  // Route guards. Predicate, not Set — needed to express:
  //   1. Sub-route inheritance (child/[id]/reports/weekly inherits child/[id])
  //   2. Param-dependent rules (progress with profileId=childId allowed in Family mode,
  //      rejected in Study mode)
  //   3. Variants the router tree already has (shelf/[subjectId]/book/[bookId], etc.)
  //
  // Implementation: each route key declares its parent (or null) and an optional
  // param-check function. canEnter() walks the parent chain to compute reachability.
  canEnter: (route: RouteKey, params?: RouteParams) => boolean;

  // Companion predicate: does the nav shell LINK to this route from a tab/home button?
  // surfacedRoutes ⊆ routes-where-canEnter-returns-true. Differs in Family mode:
  // session/homework/dictation/quiz/practice are reachable (deep-link works) but
  // not surfaced (F-mode tab bar doesn't link to them).
  isSurfaced: (route: RouteKey) => boolean;

  // RouteKey enumerates EVERY guardable surface in the app. Adding a new route to
  // the router tree without adding it here is a TypeScript error in the contract test.
  // RouteKey examples:
  //   'session' | 'session-summary/[sessionId]' | 'homework' | 'dictation' | 'quiz' | 'practice'
  //   'mentor-memory' | 'own-learning' | 'topic/relearn'
  //   'child/[profileId]' | 'child/[profileId]/reports' | 'child/[profileId]/reports/weekly'
  //   'progress' | 'progress/saved' | 'progress/vocabulary'
  //   'shelf' | 'shelf/[subjectId]' | 'shelf/[subjectId]/book/[bookId]'
  //   'create-profile' | 'subscription' | 'more/account' | 'more/privacy' | ...

  // Query-cache scope — added to mode-scoped query keys
  modeScopedKeySegment: 'study' | 'family' | null;

  // Diagnostic — never used to branch UI, only for analytics / Sentry tags.
  // IDs and enums ONLY. No names, no birthYears, no PII. The ratchet test
  // forbids any consumer reading `diagnostic.*` to gate UI.
  diagnostic: {
    shape: 'guardian' | 'learner';
    effectiveMode: 'study' | 'family' | null;
    isParentProxy: boolean;
    role: ProfileContext['role'];
    isOwner: boolean;
    subscriptionStatus: 'loading' | 'ready';
    subscriptionTier: ProfileContext['subscription']['tier'];
    activeProfileId: string | null;
    linkedChildIds: ReadonlyArray<string>; // IDs only — never displayName
    reason: string; // e.g. "guardian/family/no-proxy"
  };
};
```

**Invariant:** the contract is total — every legal `ProfileContext` produces a defined `NavigationContract`. No `undefined`, no `null` outputs (except `effectiveMode` and `modeScopedKeySegment`, which are legitimately nullable).

---

## The matrix

Realistic input combinations and their outputs. **This is the contract.** Future LLMs / agents read this table to learn the answer.

Abbreviations: **GC** = guardian, **LR** = learner, **F** = family mode, **S** = study mode, **PX** = parent proxy active, **¬PX** = not in proxy.

### Tab visibility

| # | Profile | mode | proxy | flag | shape | visibleTabs | home screen |
|---|---|---|---|---|---|---|---|
| 1 | Adult owner, 0 children (any subscription tier) | n/a (mode features OFF — not family-capable) | ¬PX | off/on | LR | home, library, progress, more | LearnerHome |
| 4 | Adult owner, ≥1 child | n/a | ¬PX | off | GC | home, own-learning, library, progress, more | ParentHome |
| 5 | Adult owner, ≥1 child | F | ¬PX | on | GC | home, progress, more | ParentHome |
| 6 | Adult owner, ≥1 child | S | ¬PX | on | GC | home, own-learning, library, progress, more | LearnerHome |
| 7 | Adult owner, ≥1 child, in proxy | * | PX | * | LR | home, library, progress | LearnerHome |
| 8 | Child on parent acct (impersonated) | * | ¬PX | * | LR | home, library, progress, more | LearnerHome |
| 9 | Solo child owner (own account, 11-17) — **same shape and tabs as row 8**; gates differ where they read `isOwner` (billing / security / export remain visible because the solo child owns the account). [MEDIUM-5] | * | ¬PX | * | LR | home, library, progress, more | LearnerHome |
| 10 | Profile not yet loaded | * | * | * | LR (default) | home, library, progress, more | LearnerHome |

**Precedence (read top-down, first match wins):**

1. `isParentProxy === true` → row 7 always.
2. `activeProfile == null` OR `subscription.status === 'loading'` → row 10 (least-privilege default).
3. `MODE_NAV_V0_ENABLED && familyCapable && mode !== null` → mode-driven rows (5, 6). `familyCapable` per `isFamilyCapableProfile()` requires adult owner with **at least one linked child** — adult-no-kids never enters this branch even on family tier.
4. Else → legacy shape rows (1, 4, 8, 9).

**Note on rows 2 and 3 (adult, family tier, no children).** Earlier drafts had separate rows for "adult, family tier, 0 children" in both F mode and S mode. **Removed.** Today's `isFamilyCapableProfile()` requires a linked child, and the "add your first child" affordance lives in the legacy guardian onboarding before F-mode unlocks — not behind a Family-mode-with-no-children empty state. If product later wants family-tier subscribers to enter F-mode UI before linking a child (e.g. to show an empty parent dashboard with a CTA), edit `isFamilyCapableProfile()` and re-add a row; the contract will pick it up.

**Consent state — explicitly out of contract scope. [HIGH-2]** A profile with `consentStatus === 'PARENTAL_CONSENT_REQUESTED'` or `'WITHDRAWN'` is intercepted by a **full-screen consent overlay** rendered above the tab shell in `apps/mobile/src/app/(app)/_layout.tsx:1527` (consent requested) and `:2427` (withdrawal flow). Child-profile data display is gated separately at `child/[profileId]/index.tsx:436–441`, and mentor-memory consent has its own gates at `mentor-memory.tsx:217, 360, 408`. The contract still computes a valid `NavigationContract` for the underlying profile, but the overlay covers it until consent is resolved. **Do not add a consent dimension to this matrix** — it is a shell-level interception that runs *before* the contract's outputs reach the user. If a future refactor folds consent into the contract, add it explicitly with a `gates.requireConsent` field and matrix rows for each consent state.

**Pro tier treated identically to Family for navigation. [MEDIUM-10]** `tier === 'pro'` and `tier === 'family'` unlock the same gates and same mode-driven precedence. BUG-899 (`subscription.tsx:77`) keeps Pro server-only / not publicly listed today; the contract is forward-compatible. If product later diverges Pro from Family, add a tier dimension to this matrix — today they are equivalent and a single column suffices.

### Content gates (selected — full table generated by the contract module)

Headers below: rows 1, 4, 5, 6, 7, 8, 9 from the matrix above. Adult-no-kids on family tier (no row) is treated identically to row 1.

| Gate | Adult owner, no kids | Adult owner + kids (¬PX, no mode) | Adult owner + kids, F mode | Adult owner + kids, S mode | In proxy | Impersonated child | Solo child owner |
|---|---|---|---|---|---|---|---|
| `showBilling` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| `showAccountSecurity` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| `showExportDelete` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| `showAddChild` | ✓ (if 18+) | ✓ (if 18+) | ✓ | ✓ | ✗ | ✗ | ✗ |
| `showProgressProfilePicker` | ✗ | ✓ (legacy) | ✓ | ✗ (self only) | ✓ | ✗ | ✗ |
| `showRecentChildActivity` | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `showInlineStudyInvite` | ✗ | ✗ | ✓ (woven into child-activity, not a separate card) | ✗ | ✗ | ✗ | ✗ |
| `chrome.modeSwitcher === 'global-header'` | ✗ | ✗ | ✓ | ✓ | ✗ (always hidden in proxy) | ✗ | ✗ |
| `chrome.proxyBanner === 'required'` | ✗ | ✗ | ✗ | ✗ | ✓ (only exit affordance when row 7 hides `more`) | ✗ | ✗ |
| `showRemoveFamilyMember` | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |

### Route reachability & surfacing — predicate model

Two predicates: `canEnter(route, params?)` (the entry guard) and `isSurfaced(route)` (does the shell link to it). Sub-routes inherit from their parent unless explicitly overridden.

**Route tree (parents → children, abridged):**

```
session                                — leaf
homework                               — leaf
dictation                              — leaf
quiz                                   — leaf
practice                               — leaf
mentor-memory                          — leaf
own-learning                           — leaf
child/[profileId]                      — has child reports, weekly, etc.
  child/[profileId]/reports
  child/[profileId]/reports/weekly
progress                               — param-dependent
  progress/saved
  progress/vocabulary
shelf
  shelf/[subjectId]
    shelf/[subjectId]/book/[bookId]
create-profile                         — `?for=child` param matters
subscription
more/*                                 — inherits from `more`
```

**canEnter rules (matrix):**

| Route prefix | Adult ¬kids | Adult+kids ¬mode | Adult+kids F | Adult+kids S | In proxy | Imp. child | Solo child |
|---|---|---|---|---|---|---|---|
| `session` (and descendants) | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| `homework`, `dictation`, `quiz`, `practice` | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| `mentor-memory` | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ (self only) | ✓ |
| `own-learning` | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `child/[profileId]` (any depth) | ✗ | ✓ (if `profileId ∈ linkedChildIds`) | same | ✗ | ✗ | ✗ | ✗ |
| `progress` (no params) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `progress?profileId=X` | ✗ (X must be self) | ✓ (if X ∈ self ∪ linkedChildIds) | ✓ (X ∈ self ∪ linkedChildIds) | ✗ (X must be self) | ✓ (X = proxied child) | ✗ (X must be self) | ✗ (X must be self) |
| `shelf` (and descendants) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `create-profile?for=child` | ✗ | ✓ (if `isAdultOwnerValue`) | ✓ | ✓ | ✗ | ✗ | ✗ |
| `subscription` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |

**isSurfaced rules (only meaningful diffs from canEnter):**

- In Family mode, `session`/`homework`/`dictation`/`quiz`/`practice`/`own-learning` are **reachable but not surfaced** — F-mode tab bar doesn't link to them, but a deep link or a future Resume-session affordance still works.
- All other routes: `isSurfaced(r) === canEnter(r)`.

**Sub-route inheritance.** `canEnter('child/[profileId]/reports/weekly', { profileId })` resolves by walking up the prefix chain: if `child/[profileId]` is allowed for this `profileId`, descendants are allowed unless a child explicitly overrides.

**Why this replaces the earlier flat Set.** A flat `reachableDeepRoutes: Set<string>` could not encode: (a) the nested router tree (e.g., `child/[id]/reports/weekly`), (b) param-dependent rules like "progress with foreign profileId is OK in Family mode only", or (c) the reachable-but-not-surfaced distinction. The predicate model handles all three at the cost of one extra call site per guard — `if (!contract.canEnter(route, params)) router.replace('/(app)/home')`.

### Mode-scoped query key segment

| State | `modeScopedKeySegment` |
|---|---|
| `effectiveMode === 'family'` | `'family'` |
| `effectiveMode === 'study'` | `'study'` |
| Otherwise (legacy, proxy, no mode-nav) | `null` (legacy key shape preserved) |

---

## Where the contract is consumed (the sweep target list)

Every site listed below is a current divergence point that will be migrated to read from `useNavigationContract()` in the Phase 2 PR. The forward-only ratchet test fails CI if any of these flags / functions are referenced *outside* the contract module after the sweep.

### Tab shell
- `apps/mobile/src/app/(app)/_layout.tsx:2038-2048` — replace `tabShape` + `visibleTabs` + `homeTabPresentation` with one `useNavigationContract()` call.

### Home tab
- `apps/mobile/src/app/(app)/home.tsx:61-83, 169` — read `gates.sessionIsOwner`, `home.screen`.
- `apps/mobile/src/components/home/LearnerScreen.tsx:469-475` — read `home.screen === 'ParentHome'` instead of recomputing.
- `apps/mobile/src/components/home/ParentHomeScreen.tsx` — read `gates.showRecentChildActivity`, `gates.showInlineStudyInvite`.

### More tab
- `apps/mobile/src/app/(app)/more/index.tsx:47, 112-114, 118` — read `gates.showAddChild` (line 118), `gates.showRemoveFamilyMember`, linked-children gate (line 112-114). **[MEDIUM-8]** Earlier draft cited line 106; that line is the `router.push({ pathname: '/create-profile', ... })` invocation inside `handleAddChild`, NOT the gate. The actual gate is line 118 (`showAddChild = isAdultOwner(...)`). Citation corrected.
- `apps/mobile/src/app/(app)/more/account.tsx:76, 85` — read `gates.showAccountSecurity`, `gates.showBilling`.
- `apps/mobile/src/app/(app)/more/accommodation.tsx:45-46` — read `gates.showAccommodationChildEditor`.
- `apps/mobile/src/app/(app)/more/celebrations.tsx:36-37` — read `gates.showCelebrationsChildEditor`.
- `apps/mobile/src/app/(app)/more/privacy.tsx:96, 135, 147` — read `gates.showMentorMemoryChildConsent`.
- `apps/mobile/src/app/(app)/subscription.tsx:1590` — read `gates.showRemoveFamilyMember`. **Lines 649, 653, 661 are analytics tags** (`is_owner: activeProfile?.isOwner === true` written into a tracking property dict) and are NOT branching reads. The AST ratchet's "used to gate UI" check (parent node is BinaryExpression / ConditionalExpression / IfStatement test) excludes object-literal property writes, so these stay legal without an allowlist entry. **[MEDIUM-6]**
- `apps/mobile/src/app/(app)/mentor-memory.tsx:233` — `if (isParentProxy) return <Redirect ... />` migrates to `if (!contract.canEnter('mentor-memory')) ...`. **[CRITICAL-3]** Earlier draft listed only the `:369, :408` content-gate reads and missed this proxy-redirect guard.
- `apps/mobile/src/app/(app)/mentor-memory.tsx:369, 408` — read `gates.showMentorMemoryChildConsent`; the line-:467 `role !== 'owner' ? "Set by parent" : null` is **UX copy branching**, not a visibility gate. Phase 2 option: add `gates.mentorMemoryOriginCopy: 'self' | 'parent'`, OR allowlist with `// nav-contract-allow: copy variation`. **[MEDIUM-7]**

### Progress tab
- `apps/mobile/src/app/(app)/progress/index.tsx:725` — read `gates.progressHeaderTitleKey`, `gates.showProgressProfilePicker`. Foreign-profile rejection: `contract.canEnter('progress', { profileId: param })` — predicate handles F-vs-S divergence.

### Deep-route guards
Each `_layout.tsx` calls `contract.canEnter(routeKey, params?)` and redirects to `/(app)/home` on `false`.

- `apps/mobile/src/app/(app)/own-learning.tsx:32-34` — `canEnter('own-learning')`.
- `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` — `canEnter('child/[profileId]', { profileId })`. **[MEDIUM-2]** Today's `RequireFamilyContext` calls `setMode('family')` as a side effect inside `useGuardFamilyRoute()` (`lib/navigation.ts:84`); it is not purely a guard. Phase 2 PR 4 must either (a) keep `RequireFamilyContext` as a stateful wrapper that *uses* the contract for read-only checks while retaining its `setMode` side effect, or (b) extract the side effect into an explicit `useApplyContractIntent()` hook the caller invokes. Decide before sweep, don't gloss.
- `apps/mobile/src/app/(app)/dictation/_layout.tsx:63` — `canEnter('dictation')`.
- `apps/mobile/src/app/(app)/homework/_layout.tsx:9` — `canEnter('homework')`.
- `apps/mobile/src/app/(app)/session/_layout.tsx:9` — `canEnter('session')`.
- `apps/mobile/src/app/(app)/quiz/_layout.tsx:118` — `canEnter('quiz')`.
- `apps/mobile/src/app/(app)/practice/index.tsx:441` — `canEnter('practice')`.
- `apps/mobile/src/app/(app)/session/index.tsx:1107` — read `gates.sessionIsOwner`.

### Additional consumers (added 2026-05-21 from adversarial audit) [CRITICAL-4]
Three production sites use `isParentProxy` as a branching condition and were missed in the initial sweep list. They must migrate alongside the deep-route guards or remain on the allowlist until then.

- `apps/mobile/src/app/(app)/progress/saved.tsx` — proxy guard; migrates to `canEnter('progress/saved')`. Group with PR 4 (progress + deep-route guards).
- `apps/mobile/src/app/(app)/topic/relearn.tsx` — proxy guard; migrates to `canEnter('topic/relearn')`. Add `topic/relearn` to `RouteKey`. Group with PR 4.
- `apps/mobile/src/app/session-summary/[sessionId].tsx` — **8 `isParentProxy` branches** in one file (highest single-file concentration in the codebase). Migrates to `canEnter('session-summary/[sessionId]', { sessionId })` plus `gates.sessionIsOwner` for the owner-only sub-views. Group with PR 2 (tab shell + home) because session-summary is the post-session modal that opens directly from the home flow.

Note: `apps/profiles.tsx` (root-level, outside `(app)/`) also reads `activeProfile.isOwner` for branching. It is **out of scope** for this contract because it lives above the tab shell; document but do not sweep.

### Query-key scope
- `apps/mobile/src/hooks/use-dashboard.ts`, `use-progress.ts`, `use-sessions.ts`, `use-retry-filing.ts` — replace inline `mode` reads with `contract.modeScopedKeySegment`.

**Estimated touch count (revised after adversarial AST grep, 2026-05-21). [MEDIUM-1]** ~20 production files, ~119 line-level reads in scope:
- ~61 production branching reads of `isParentProxy` / `mode === ...` / `role === ...` / `activeProfile?.isOwner`,
- ~33 mock-setup lines in `*.test.tsx` (legal — AST ratchet excludes test files; see Check 2),
- ~25 additional reads of `Subscription.tier` / `Profile.isOwner` in renderer / analytics contexts that the AST treats as non-gating.

Earlier estimate of "~25 files, ~70 reads" understated the `isParentProxy` distribution; the revised number includes the three newly listed consumers (`progress/saved.tsx`, `topic/relearn.tsx`, `session-summary/[sessionId].tsx`).

---

## Enforcement — ratchet test (AST-based, not grep)

A grep-based ratchet was the initial sketch but is unfit for purpose: it false-positives on comments / strings / tests and false-negatives on aliases (`const own = activeProfile?.isOwner`), destructuring (`const { isOwner } = activeProfile`), helper-hook indirection (`const { isOwner } = useGate()`), and non-literal comparisons (`mode === STUDY_MODE`). For a load-bearing contract, the enforcement must understand types and references.

**Implementation: TypeScript AST walk via `ts-morph`**, run as a Jest test. One file: `apps/mobile/src/lib/navigation-contract.guard.test.ts`. The test loads the `tsconfig.json`, walks every source file under `apps/mobile/src/`, and applies four checks. Optionally promoted to a custom ESLint rule once stable.

**Check 1 — forbidden symbol imports.** Walk every `ImportDeclaration` outside `lib/navigation-contract.ts` and `lib/navigation-contract*.test.ts`. Fail if the import specifier list includes any of: `resolveTabShape`, `isGuardianProfile`, `computeVisibleTabs`, `computeModeVisibleTabs`, `isFamilyCapableProfile`, `resolveHomeTabPresentation`, `MODE_SCOPED_KEYS`. Catches renamed imports (`import { resolveTabShape as foo }`) via the symbol's original name from the type checker.

**Check 2 — forbidden property-access chains in UI code.** Walk every `PropertyAccessExpression` and `BindingElement` (destructuring) in files under `apps/mobile/src/app/` and `apps/mobile/src/components/`. Use the type checker to resolve the symbol:

- `Profile.isOwner` — flagged unless inside `lib/navigation-contract.ts` OR the access is inside JSX that maps the profile collection (e.g., listing children — the renderer needs the field, just not for branching).
- `ParentProxyContext.isParentProxy` — flagged when used as a branching condition (`if (isParentProxy) ...`). Rendering the proxy banner in `_layout.tsx` is allowlisted as the canonical proxy-chrome owner.
- `AppContext.mode` — flagged outside the contract.
- `ActiveProfileRole` symbol used as a branching condition — flagged outside the contract.
- `Subscription.tier` — flagged when used to gate UI; reading the tier for display (`<Text>{tier}</Text>`) is allowed.

The "used to gate UI" check inspects the parent AST node: a `PropertyAccess` used inside a `BinaryExpression` / `ConditionalExpression` / `IfStatement` test is a gate; used as a JSX child or render argument is not.

**Check 3 — matrix snapshot.** `navigation-contract.snapshot.test.ts` iterates the full input matrix (cartesian product of the 7 surviving rows × `{mode: study | family | null}` × `{proxy: true | false}` × `{flag: on | off}` × `{subscription.status: loading | ready}`) and snapshots `JSON.stringify(contract, replacer)` where `replacer` strips function fields (`canEnter`, `isSurfaced`) and serializes them by exhaustively evaluating each `RouteKey × representative params`. Any change to who-sees-what produces a snapshot diff.

**Check 4 — totality.** Property test (fast-check or hand-rolled): for 5000 fuzzed `ProfileContext` inputs, `resolveNavigationContract` never throws and returns a structurally valid `NavigationContract` (all required fields present, all sets non-undefined, `canEnter` returns a boolean for every declared `RouteKey`).

**Check 5 — no consumer reads `diagnostic.*`.** Walk for any `PropertyAccessExpression` of shape `<x>.diagnostic.<y>` where `<x>` is a `NavigationContract` value. Allowed: analytics modules under `apps/mobile/src/lib/analytics.ts` and Sentry tag setup. Forbidden: any file under `apps/mobile/src/app/` or `apps/mobile/src/components/`.

**Allowlist mechanism.** A typed allowlist file `lib/navigation-contract.allowlist.ts` exports `{ check1Files, check2Sites, check5Sites }` arrays. Each entry has `{ file: string, reason: string, expires?: ISO-date }`. The ratchet test reads this file and skips listed sites. `expires` is advisory (CI warns but doesn't fail past the date). After the Phase 2 sweep the file should be empty; until then it makes the legacy state visible.

---

## Failure modes (CLAUDE.md required table)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Contract returns wrong shape (logic bug) | `resolveNavigationContract` has a missing case | Wrong tabs / wrong home screen | Snapshot test fails in CI; matrix row identifies the gap |
| Consumer reads raw `isOwner` after sweep | New PR adds `activeProfile.isOwner` in a screen | Code review catches; CI fails on Test 2 | Add gate to contract output; consumer reads `gates.xxx` |
| New tab added without contract entry | New `<Tabs.Screen name="x" />` in `_layout.tsx` | TypeScript fails: `TabKey` union missing `'x'` | Add `'x'` to `TabKey`, add visibility to matrix, update contract |
| New deep route added without guard | New file under `app/(app)/foo/_layout.tsx` | No automatic guard | `change-classes.md` entry: any new `_layout.tsx` requires contract update; reviewer checks |
| Flag flipped via OTA | `EXPO_PUBLIC_ENABLE_MODE_NAV` value changes in a new bundle | New value is read on next **cold start**, not at runtime. `FEATURE_FLAGS` is a static const read at module load; `process.env.EXPO_PUBLIC_*` is inlined at build time. There is no runtime listener. | Operator runbook (in v0 plan) requires force-close + reopen after OTA flip. The contract recomputes on the next render after the new bundle is loaded, but the user must restart the app to load the new bundle. |
| Subscription resolves mid-render | `useSubscription()` flips `status` from `'loading'` to `'ready'` | Contract re-evaluates; F-mode features may appear or disappear in one frame | Acceptable flash; least-privilege during `loading` prevents leakage. Snapshot test covers both states. |
| Proxy entered while in Study mode | User taps "View child" while `mode === 'study'` | Tab bar collapses to proxy tabs; mode chip hidden | Contract precedence rule 1 (proxy wins); covered by snapshot row |
| Profile load races mode init | `activeProfile === null` but `mode === 'family'` | LearnerHome (least-privilege default per row 10) | One render flash; profile loads, contract recomputes |
| `MODE_NAV_V0_ENABLED=false` + family-capable user | Flag off in Doppler | Legacy 5-tab guardian shell; no mode chip | Same as today; rows 4 / 1 of matrix |
| Contract diagnostic referenced for branching | Someone reads `contract.diagnostic.inputs.isOwner` to gate UI | Defeats the contract | AST Check 5 (no consumer reads `diagnostic.*` outside analytics) fails CI |
| Proxy entered without `ProxyBanner` rendered | Future PR drops the banner from `_layout.tsx` chrome layer | Row 7 hides `more` tab; without banner, user has no exit affordance — stranded | Contract emits `chrome.proxyBanner === 'required'` in proxy; runtime assertion in dev build (`__DEV__ && chrome.proxyBanner === 'required' && !bannerRendered → console.error`) flags it. Failing case caught by smoke test that taps proxy entry and checks for banner test ID. **[CRITICAL-6 / MEDIUM downgrade]** |
| Profiles array refetched with identical content | RevenueCat sync triggers TanStack refetch; `profiles` array gets a new reference, same items | Contract should NOT recompute | Unit test: two `refetch()`s producing identical content yield `===`-stable contract output. Memoization key is the stable signature, not array ref. **[MEDIUM-4]** |
| Mode persists across sign-out | Sign-out doesn't atomically clear `activeProfile` | Next session shows wrong mode | `signOutWithCleanup()` clears profiles; the `useEffect` at `app-context.tsx:49-51` resets `modeOverride` when `activeProfile.id` changes. Test: sign out as family user, sign in as solo user, assert `mode === null`. **[MEDIUM-3]** |

---

## Phase 2 plan (next PR — not this one)

**Hook memoization rule. [MEDIUM-4]** `useNavigationContract()` must memoize on a *stable* signature of its inputs — `profiles.map(p => p.id + (p.isOwner ? '1' : '0') + p.consentStatus).join('|')` or equivalent — not on the array reference. TanStack Query returns a new `profiles` array reference on every refetch (RevenueCat re-syncs, profile-list refetches), and a raw `useMemo([profiles])` would re-derive the contract on every refetch even when content is identical. Unit test this with two refetches that produce identical content.

**Mode persistence — explicit non-decision. [MEDIUM-3]** `mode` is React state only (`app-context.tsx:34`), not persisted to AsyncStorage or SecureStore. It resets on `activeProfile.id / isOwner / birthYear` change (`app-context.tsx:49-51`) and on cold start. The contract does **not** change this. Cross-account leak risk is mitigated by `signOutWithCleanup()` clearing `activeProfile` atomically — when activeProfile flips, the `useEffect` clears `modeOverride`. Do not add storage-backed mode persistence without re-reviewing this guarantee.

1. Build `lib/navigation-contract.ts` exporting `resolveNavigationContract(ctx)` + `useNavigationContract()` hook.
2. Write `lib/navigation-contract.test.ts` — unit tests per matrix row.
3. Write `lib/navigation-contract.snapshot.test.ts` — full matrix snapshot.
4. Write `lib/navigation-contract.guard.test.ts` — Tests 1-4 above. Initially green (allowlist covers current consumers).
5. **Sweep** the ~25 consumers listed above, one tab at a time. Honest framing: until the allowlist shrinks meaningfully, the bug surface this contract was created to eliminate is still alive — PR 1 is scaffolding, not a fix:
   - PR 1 (scaffolding only): contract + tests + 0 consumer migrations. Ratchet runs with full allowlist. **Divergence problem still active.** Reviewers should expect to see the same per-consumer bugs land in this period.
   - PR 2: tab shell + home tab. Allowlist drops ~6 entries. First real reduction in surface.
   - PR 3: more tab. Allowlist drops ~7 entries.
   - PR 4: progress + deep-route guards (including the `canEnter` predicate wiring across 7 nested `_layout.tsx` files). Allowlist drops ~9 entries.
   - PR 5: query-key consumers; allowlist deleted entirely; ratchet fully armed. **At this point and not before** can the contract be cited as the source of truth.

   Per CLAUDE.md "sweep when you fix" — the alternative (forward-only with deferred sweep) is allowed only if the sweep is tracked. The user has chosen full sweep in the same logical sequence.
6. Add `change-classes.md` entry: "Touched a tab `_layout.tsx`, a More/Progress/Home screen, or a deep-route `_layout.tsx`? Run `pnpm exec jest lib/navigation-contract`."
7. (Optional Phase 3) Generate the matrix doc from the contract via a small script so spec and code can never drift. Today's table is hand-written and authoritative.

---

## Resolved decisions (2026-05-21)

These were open questions; the user has decided.

- **Security scope corrected.** The contract solves UI/navigation drift only. Server-side leaks (CR-124 IDOR, sign-out cache leaks, proxy fall-through on the API) remain the responsibility of `createScopedRepository(profileId)`, parent-chain WHERE filters, and the identity-keyed query-cache reset in `signOutWithCleanup`. A green ratchet on this contract is not evidence that the server is safe. Updated "Why this exists" section accordingly.
- **`familyCapable` predicate kept narrow.** Today's `isFamilyCapableProfile()` requires adult owner + at least one linked child. Family-tier subscription alone does NOT make a profile family-capable. Adult-no-kids on family tier behaves identically to adult-no-kids on free tier (legacy learner shell, no mode features). If product wants family-tier-without-kids to enter F-mode UI later, edit `isFamilyCapableProfile()` in one place; the contract picks it up. Matrix rows 2 and 3 (adult, family tier, 0 kids in F/S mode) removed as broken-by-design.
- **Route reachability moved from `Set<string>` to predicates.** A flat set could not express the nested router tree (`child/[id]/reports/weekly`), param-dependent rules (foreign `profileId` allowed in F mode only), or the reachable-but-not-surfaced distinction. The contract now exposes `canEnter(route, params?)` and `isSurfaced(route)` predicates with prefix-tree inheritance.
- **Subscription loading state modeled.** `subscription.status: 'loading' | 'ready'` is an explicit input. During `'loading'`, the contract behaves as least-privilege (`tier = null` equivalent). Brief flash on resolution acceptable; leakage is not.
- **`diagnostic` field locked down.** Restricted to IDs and enums — no `displayName`, no `birthYear`, no raw `ProfileContext` echo. Ratchet Check 5 forbids any consumer under `app/` or `components/` from reading `diagnostic.*`.
- **Ratchet upgraded from grep to AST.** `ts-morph` walking the TS source tree with type-checker resolution. Grep would miss aliases, destructuring, helper-hook indirection, and non-literal comparisons.
- **Family mode does NOT surface deep learning routes in its tab bar** (`session`, `homework`, `dictation`, `quiz`, `practice`, `own-learning`). However, the contract does **not actively redirect** from those routes when entered directly — `reachableDeepRoutes` stays permissive in Family mode so the FULL plan (`docs/plans/2026-05-19-study-and-family-mode-navigation-FULL.md`) is not blocked. The Family tab shell simply doesn't link to those routes; if a future plan adds a "Resume session" affordance from the Family home, it works without contract changes.
- **No separate large "Adult wants to study too" card.** The Study-mode invitation is woven into the parent-with-kids mentoring context (existing ParentHomeScreen sections), not a standalone activation card. `gates.showAdultStudyActivationCard` is **removed from the contract** — replace with `gates.showInlineStudyInvite` rendered alongside child-activity blocks.
- **Global mode-switcher pill in app chrome.** The pill (e.g. `Family / My Learning ⇄`) is the primary mode-switch surface and must be accessible from the top of every in-app screen for family-capable users. Contract adds a new chrome slot: `chrome.modeSwitcher: 'global-header' | 'hidden'`. Mounted once in the app shell (`(app)/_layout.tsx` chrome layer), not per-screen.
- **Solo child owner = standard learner.** Row 9 has the **same shape and tabs as row 8**; gates differ where they read `isOwner`. The contract treats `(role: 'owner', age < 18)` identically to `(role: 'child' on parent acct)` for shape/tabs purposes. Billing/security/export gates remain visible because the solo child DOES own the account, but they are reached via the same learner tab layout. Earlier wording said "IDENTICAL to row 8" — corrected to "same shape; gates differ on `isOwner` checks." **[MEDIUM-5]**
- **ProxyBanner is contract-owned chrome. [CRITICAL-6 → MEDIUM]** Matrix row 7 hides the `more` tab; the only remaining exit from proxy is the `ProxyBanner` with its `onSwitchBack` action mounted in `_layout.tsx`. The contract emits `chrome.proxyBanner: 'required'` whenever `isParentProxy === true` so a UI cleanup PR cannot accidentally strand a proxying parent. If a future product decision adds `more` back to the proxy tab list, the banner can become `'hidden'` — until then, banner is non-negotiable.
- **Mode-switcher hidden in proxy as defensive invariant. [CRITICAL-2 → MEDIUM]** Today the chip naturally collapses because `isFamilyCapableProfile()` returns `false` for the child profile in proxy (active profile is the child, `isOwner === false`). The contract states `chrome.modeSwitcher === 'hidden'` explicitly when `isParentProxy === true` so a refactor that changes `familyCapable` semantics cannot accidentally surface the switcher in proxy.

---

## Out of scope

- **Web shell (`apps/web` / Expo web preview). [MEDIUM-9]** Contract hooks (`useProfile`, `useParentProxy`, `useAppContext`, `useActiveProfileRole`, `useSubscription`) are mobile-only — they live under `apps/mobile/src/`. Web preview today renders the legacy guardian path with no mode-nav. If/when web becomes a first-class target, the hooks must be ported or wrapped in a platform-detection layer and the contract re-verified against the web router. Until then, web behavior is explicitly undefined; do not assume contract guarantees hold on web.
- API-side authorization — `createScopedRepository(profileId)` and parent-chain WHERE filters are the server contract; this spec is mobile UI only.
- Server-side cache / sign-out leak prevention — `signOutWithCleanup()` + identity-keyed query persister cover this; the contract does not.
- Tab-bar styling, animations, proxy banner copy — visual / i18n concerns. (Note: the *presence* of `ProxyBanner` IS in scope via `chrome.proxyBanner: 'required'`; only its visual style and copy are out.)
- Consent overlay rendering — see "Consent state explicitly out of contract scope" under Matrix.
- New tabs or new modes — those are product changes; this spec describes the *current* surface.
