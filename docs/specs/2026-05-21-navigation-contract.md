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

This is the surface where bugs keep landing — sign-out leaks (`project_cross_account_leak_2026_05_10.md`), proxy fall-through (CR-124 IDOR), goBackOrReplace dead ends (`project_web_flow_bugs.md`), schema/UX drift between specs and code. Every fix patches one consumer; the contract lives in nobody's head and nobody's file.

**Goal of this spec:** define one function — `resolveNavigationContract(ctx)` — that owns every per-profile behavior decision. Every consumer reads from its return value. Adding a new tab, route, content block, or query-scope rule requires editing the contract, not the consumers.

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
| `subscriptionTier` | `'free' \| 'plus' \| 'family' \| 'pro'` | `useSubscription()` |
| `flags` | `{ MODE_NAV_V0_ENABLED: boolean; ... }` | `FEATURE_FLAGS` |

`Profile` carries `id`, `isOwner`, `birthYear`, `consentStatus`, `displayName` — already defined in `@eduagent/schemas`.

Derived inside the contract (not inputs):

- `familyCapable` = adult owner with linked children OR family-tier subscription (`isFamilyCapableProfile()`).
- `hasLinkedChildren` = `profiles.some(p => !p.isOwner)`.
- `isAdultOwner` = `role === 'owner'` AND `computeAgeBracket(birthYear) >= 18` (canonical helper, `@eduagent/schemas`).

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
    modeSwitcher: 'global-header' | 'hidden'; // 'global-header' = pill visible on every in-app screen for family-capable users
  };

  // Which deep routes can this user reach? Outside this set → guard redirects to home.
  reachableDeepRoutes: ReadonlySet<DeepRouteKey>;
  // Which routes does the nav shell actually link to from tabs / home buttons?
  // Subset of reachableDeepRoutes. Differs in Family mode: learning routes are
  // reachable (deep-linking works) but not surfaced in the F-mode tab bar.
  surfacedDeepRoutes: ReadonlySet<DeepRouteKey>;
  // DeepRouteKey =
  //   | 'session' | 'homework' | 'dictation' | 'quiz' | 'practice'
  //   | 'mentor-memory' | 'own-learning' | 'child/[profileId]' | 'create-profile'
  //   | 'subscription' | 'shelf' | ...

  // Query-cache scope — added to mode-scoped query keys
  modeScopedKeySegment: 'study' | 'family' | null;

  // Diagnostic — never used to branch UI, only for analytics / Sentry tags
  diagnostic: {
    inputs: ProfileContext;
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
| 1 | Adult owner, 0 children | n/a | ¬PX | off | LR | home, library, progress, more | LearnerHome |
| 2 | Adult owner, 0 children, family tier | F | ¬PX | on | LR | home, progress, more | ParentHome |
| 3 | Adult owner, 0 children, family tier | S | ¬PX | on | LR | home, library, progress, more | LearnerHome |
| 4 | Adult owner, ≥1 child | n/a | ¬PX | off | GC | home, own-learning, library, progress, more | ParentHome |
| 5 | Adult owner, ≥1 child | F | ¬PX | on | GC | home, progress, more | ParentHome |
| 6 | Adult owner, ≥1 child | S | ¬PX | on | GC | home, own-learning, library, progress, more | LearnerHome |
| 7 | Adult owner, ≥1 child, in proxy | * | PX | * | LR | home, library, progress | LearnerHome |
| 8 | Child on parent acct (impersonated) | * | ¬PX | * | LR | home, library, progress, more | LearnerHome |
| 9 | Solo child owner (own account, 11-17) — IDENTICAL to row 8 for shape/tabs/gates; only differs in `isOwner === true` so billing/security/export remain visible | * | ¬PX | * | LR | home, library, progress, more | LearnerHome |
| 10 | Profile not yet loaded | * | * | * | LR (default) | home, library, progress, more | LearnerHome |

**Precedence (read top-down, first match wins):**

1. `isParentProxy === true` → row 7 always.
2. `activeProfile == null` → row 10 (least-privilege default).
3. `MODE_NAV_V0_ENABLED && familyCapable && mode !== null` → mode-driven rows (2,3,5,6).
4. Else → legacy shape rows (1,4,8,9).

### Content gates (selected — full table generated by the contract module)

| Gate | Adult owner, no kids | Adult owner + kids (¬PX, no mode) | Adult owner + kids, F mode | Adult owner + kids, S mode | In proxy | Impersonated child | Solo child owner |
|---|---|---|---|---|---|---|---|
| `showBilling` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| `showAccountSecurity` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| `showExportDelete` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| `showAddChild` | ✓ (if 18+) | ✓ (if 18+) | ✓ | ✓ | ✗ | ✗ | ✗ |
| `showProgressProfilePicker` | ✗ | ✓ (legacy) | ✓ | ✗ (self only) | ✓ | ✗ | ✗ |
| `showRecentChildActivity` | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `showInlineStudyInvite` | ✗ | ✗ | ✓ (woven into child-activity, not a separate card) | ✗ | ✗ | ✗ | ✗ |
| `chrome.modeSwitcher === 'global-header'` | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `showRemoveFamilyMember` | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |

### Reachable deep routes

**Reachable** = the route guard allows entry. **Surfaced** = the tab bar / nav UI links to it. The two differ in Family mode: learning routes are *reachable* (so deep-linking and FULL-plan affordances like "Resume session" keep working) but *not surfaced* in the F-mode tab bar.

| Route | Adult owner ¬kids | Adult owner + kids ¬PX | F mode | S mode | In proxy | Impersonated child | Solo child owner |
|---|---|---|---|---|---|---|---|
| `session` | ✓ | ✓ | ✓ reachable / ✗ surfaced | ✓ | ✗ | ✓ | ✓ |
| `homework` | ✓ | ✓ | ✓ reachable / ✗ surfaced | ✓ | ✗ | ✓ | ✓ |
| `dictation` | ✓ | ✓ | ✓ reachable / ✗ surfaced | ✓ | ✗ | ✓ | ✓ |
| `quiz` | ✓ | ✓ | ✓ reachable / ✗ surfaced | ✓ | ✗ | ✓ | ✓ |
| `practice` | ✓ | ✓ | ✓ reachable / ✗ surfaced | ✓ | ✗ | ✓ | ✓ |
| `mentor-memory` | ✓ | ✓ (parent settings) | ✓ | ✓ | ✗ | ✓ (self only) | ✓ |
| `own-learning` | ✗ | ✓ | ✓ reachable / ✗ surfaced | ✓ | ✗ | ✗ | ✗ |
| `child/[profileId]` | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `create-profile?for=child` | ✗ (no kids context) | ✓ (if 18+) | ✓ | ✓ | ✗ | ✗ | ✗ |
| `subscription` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |

Routes outside `reachableDeepRoutes` → guard redirects to `/(app)/home`. The contract exposes BOTH `reachableDeepRoutes` (entry guard) and `surfacedDeepRoutes` (what the shell links to) as separate sets.

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
- `apps/mobile/src/components/home/ParentHomeScreen.tsx` — read `gates.showRecentChildActivity`, `gates.showAdultStudyActivationCard`.

### More tab
- `apps/mobile/src/app/(app)/more/index.tsx:47, 106, 112-114, 118-121` — read `gates.showAddChild`, `gates.showRemoveFamilyMember`, linked-children list from contract diagnostic.
- `apps/mobile/src/app/(app)/more/account.tsx:76, 85` — read `gates.showAccountSecurity`, `gates.showBilling`.
- `apps/mobile/src/app/(app)/more/accommodation.tsx:45-46` — read `gates.showAccommodationChildEditor`.
- `apps/mobile/src/app/(app)/more/celebrations.tsx:36-37` — read `gates.showCelebrationsChildEditor`.
- `apps/mobile/src/app/(app)/more/privacy.tsx:96, 135, 147` — read `gates.showMentorMemoryChildConsent`.
- `apps/mobile/src/app/(app)/subscription.tsx:649, 653, 661, 1590` — read `gates.showRemoveFamilyMember`, family plan flags via contract diagnostic.
- `apps/mobile/src/app/(app)/mentor-memory.tsx:233, 369, 408` — read `reachableDeepRoutes`, `gates.showMentorMemoryChildConsent`.

### Progress tab
- `apps/mobile/src/app/(app)/progress/index.tsx:725` — read `gates.progressHeaderTitleKey`, `gates.showProgressProfilePicker`, foreign-profile rejection rule via `reachableDeepRoutes`.

### Deep-route guards
- `apps/mobile/src/app/(app)/own-learning.tsx:32-34` — read `reachableDeepRoutes.has('own-learning')`.
- `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` — read `reachableDeepRoutes.has('child/[profileId]')`; existing `RequireFamilyContext` becomes a thin wrapper over the contract.
- `apps/mobile/src/app/(app)/dictation/_layout.tsx:63` — read `reachableDeepRoutes.has('dictation')`.
- `apps/mobile/src/app/(app)/homework/_layout.tsx:9` — read `reachableDeepRoutes.has('homework')`.
- `apps/mobile/src/app/(app)/session/_layout.tsx:9` — read `reachableDeepRoutes.has('session')`.
- `apps/mobile/src/app/(app)/quiz/_layout.tsx:118` — read `reachableDeepRoutes.has('quiz')`.
- `apps/mobile/src/app/(app)/practice/index.tsx:441` — read `reachableDeepRoutes.has('practice')`.
- `apps/mobile/src/app/(app)/session/index.tsx:1107` — read `gates.sessionIsOwner`.

### Query-key scope
- `apps/mobile/src/hooks/use-dashboard.ts`, `use-progress.ts`, `use-sessions.ts`, `use-retry-filing.ts` — replace inline `mode` reads with `contract.modeScopedKeySegment`.

**Estimated touch count:** ~25 files, ~70 line-level reads converted to a single hook call each. Code shrinks on net.

---

## Enforcement — ratchet test

A single Jest test, `apps/mobile/src/lib/navigation-contract.guard.test.ts`, fails CI on any new divergence.

**Test 1 — forbidden imports outside the contract module.** Greps the `apps/mobile/src/` tree for these symbols. After the sweep, the only files allowed to reference them are `lib/navigation-contract.ts` and `lib/navigation-contract.test.ts`:

- `resolveTabShape`
- `isGuardianProfile`
- `computeVisibleTabs`
- `computeModeVisibleTabs`
- `isFamilyCapableProfile`
- `resolveHomeTabPresentation`
- `MODE_SCOPED_KEYS` (the raw constant — consumers must go through `contract.modeScopedKeySegment`)

**Test 2 — forbidden raw-field reads in screens.** Greps `apps/mobile/src/app/` and `apps/mobile/src/components/` for these patterns. Allowed only inside `lib/navigation-contract.ts`:

- `activeProfile?.isOwner` / `activeProfile.isOwner`
- `isParentProxy` *as a branching condition* (rendering the proxy banner stays in `_layout.tsx`)
- `mode === 'family'` / `mode === 'study'` / `mode !== null`
- `role === 'owner'` / `role === 'impersonated-child'`
- `subscription?.tier === 'family'` / `=== 'pro'` *when used to gate UI*

**Test 3 — matrix snapshot.** `navigation-contract.snapshot.test.ts` iterates the full input matrix (~32 rows: cartesian product of `{owner-no-kids, owner-kids, child-impersonated, child-solo, profile-null} × {mode: study, family, null} × {proxy: true, false} × {flag: on, off}`) and snapshots the output. Any change to who-sees-what shows up as a snapshot diff and demands an intentional update.

**Test 4 — totality.** Property test: the contract never throws and never returns `undefined` for any combination of fuzzed inputs.

**Allowlist mechanism.** Each forbidden-symbol grep accepts an explicit allowlist file `lib/navigation-contract.allowlist.ts` listing files we have *intentionally* not migrated yet (none, after the sweep). New entries require a `// nav-contract-allow: <reason>` comment on the offending line plus an entry in the allowlist file — review will check both.

---

## Failure modes (CLAUDE.md required table)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Contract returns wrong shape (logic bug) | `resolveNavigationContract` has a missing case | Wrong tabs / wrong home screen | Snapshot test fails in CI; matrix row identifies the gap |
| Consumer reads raw `isOwner` after sweep | New PR adds `activeProfile.isOwner` in a screen | Code review catches; CI fails on Test 2 | Add gate to contract output; consumer reads `gates.xxx` |
| New tab added without contract entry | New `<Tabs.Screen name="x" />` in `_layout.tsx` | TypeScript fails: `TabKey` union missing `'x'` | Add `'x'` to `TabKey`, add visibility to matrix, update contract |
| New deep route added without guard | New file under `app/(app)/foo/_layout.tsx` | No automatic guard | `change-classes.md` entry: any new `_layout.tsx` requires contract update; reviewer checks |
| Flag flipped mid-session | `EXPO_PUBLIC_ENABLE_MODE_NAV` changes on OTA | App re-renders with new contract on next mount | Already handled by `AppContextProvider` listening to flag |
| Proxy entered while in Study mode | User taps "View child" while `mode === 'study'` | Tab bar collapses to proxy tabs; mode chip hidden | Contract precedence rule 1 (proxy wins); covered by snapshot row |
| Profile load races mode init | `activeProfile === null` but `mode === 'family'` | LearnerHome (least-privilege default per row 10) | One render flash; profile loads, contract recomputes |
| `MODE_NAV_V0_ENABLED=false` + family-capable user | Flag off in Doppler | Legacy 5-tab guardian shell; no mode chip | Same as today; rows 4 / 1 of matrix |
| Contract diagnostic referenced for branching | Someone reads `contract.diagnostic.inputs.isOwner` to gate UI | Defeats the contract | Test 2 grep includes `diagnostic.inputs.` — fails CI |

---

## Phase 2 plan (next PR — not this one)

1. Build `lib/navigation-contract.ts` exporting `resolveNavigationContract(ctx)` + `useNavigationContract()` hook.
2. Write `lib/navigation-contract.test.ts` — unit tests per matrix row.
3. Write `lib/navigation-contract.snapshot.test.ts` — full matrix snapshot.
4. Write `lib/navigation-contract.guard.test.ts` — Tests 1-4 above. Initially green (allowlist covers current consumers).
5. **Sweep** the ~25 consumers listed above, one tab at a time:
   - PR 1 (this contract): contract + tests + 0 consumer migrations. Ratchet runs with full allowlist.
   - PR 2: tab shell + home tab. Allowlist shrinks.
   - PR 3: more tab.
   - PR 4: progress + deep-route guards.
   - PR 5: query-key consumers; allowlist deleted entirely; ratchet fully armed.
   Per CLAUDE.md "sweep when you fix" — the alternative (forward-only with deferred sweep) is allowed only if the sweep is tracked. The user has chosen full sweep in the same logical sequence.
6. Add `change-classes.md` entry: "Touched a tab `_layout.tsx`, a More/Progress/Home screen, or a deep-route `_layout.tsx`? Run `pnpm exec jest lib/navigation-contract`."
7. (Optional Phase 3) Generate the matrix doc from the contract via a small script so spec and code can never drift. Today's table is hand-written and authoritative.

---

## Resolved decisions (2026-05-21)

These were open questions; the user has decided.

- **Family mode does NOT surface deep learning routes in its tab bar** (`session`, `homework`, `dictation`, `quiz`, `practice`, `own-learning`). However, the contract does **not actively redirect** from those routes when entered directly — `reachableDeepRoutes` stays permissive in Family mode so the FULL plan (`docs/plans/2026-05-19-study-and-family-mode-navigation-FULL.md`) is not blocked. The Family tab shell simply doesn't link to those routes; if a future plan adds a "Resume session" affordance from the Family home, it works without contract changes.
- **No separate large "Adult wants to study too" card.** The Study-mode invitation is woven into the parent-with-kids mentoring context (existing ParentHomeScreen sections), not a standalone activation card. `gates.showAdultStudyActivationCard` is **removed from the contract** — replace with `gates.showInlineStudyInvite` rendered alongside child-activity blocks.
- **Global mode-switcher pill in app chrome.** The pill (e.g. `Family / My Learning ⇄`) is the primary mode-switch surface and must be accessible from the top of every in-app screen for family-capable users. Contract adds a new chrome slot: `chrome.modeSwitcher: 'global-header' | 'hidden'`. Mounted once in the app shell (`(app)/_layout.tsx` chrome layer), not per-screen.
- **Solo child owner = standard learner.** Row 9 collapses into the learner shape; no special handling. The contract treats `(role: 'owner', age < 18)` identically to `(role: 'child' on parent acct)` for shape/tabs/gates purposes. Only billing/security/export gates differ (since the solo child owner DOES own the account) and those are already covered by `isOwner`.

---

## Out of scope

- Web shell (`apps/web` / web preview) — separate audit; same contract concept may apply.
- API-side authorization — `createScopedRepository(profileId)` and parent-chain WHERE filters are the server contract; this spec is mobile UI only.
- Tab-bar styling, animations, proxy banner copy — visual / i18n concerns.
- New tabs or new modes — those are product changes; this spec describes the *current* surface.
