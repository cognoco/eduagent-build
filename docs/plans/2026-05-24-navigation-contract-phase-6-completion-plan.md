# Navigation Contract Phase 6 Completion Plan

> **Status:** Draft
> **Date:** 2026-05-24
> **Source spec:** [`docs/specs/2026-05-21-navigation-contract.md`](../specs/2026-05-21-navigation-contract.md)

**Goal:** Complete Phase 6 by making navigation ownership, app-context, and proxy decisions flow through one contract boundary. The final state should be simple to maintain: raw navigation facts are private to the contract adapter/resolver and the required V0 compatibility boundary, while screens consume named gates and route predicates.

---

## Decision

Do not finish Phase 6 by growing `LEGITIMATE_RAW_NAV_GATE_FILES`.

That table is useful as a temporary ratchet, but it is not the maintainable end state. Three structural changes replace it (see Round 3 → Change A, Change B, Change C for the rationale and migration order):

1. **Gate surface restructure (Change A).** `NavigationGates` becomes intent-grouped namespaces (`gates.account.*`, `gates.family.*`, `gates.progress.*`, `gates.learning.*`) instead of a flat 14-boolean record. New gates land in the right namespace by construction; reviewers can tell account-permission concerns from navigation concerns by reading the name. Eliminates the "gates too generic" failure mode the plan itself enumerates.
2. **Public surface discipline (Change B).** The primary enforcement mechanism becomes barrel + ESLint `no-restricted-imports`: `useAppContext` / `useParentProxy` are not reachable from screen code because they aren't re-exported from any public barrel, and direct deep imports are blocked by ESLint with path-glob allowlists for the boundary categories below. The AST guard at `apps/mobile/src/lib/navigation-contract-usage-guard.test.ts` shrinks to a smoke-test backstop covering only what ESLint can't see (chiefly `activeProfile.isOwner` member-access for navigation branching, and `contract.diagnostic.*` access in production source). The per-file `LEGITIMATE_RAW_NAV_GATE_FILES` ledger is deleted entirely.
3. **Resolver + pure selectors split (Change C).** `resolveNavigationContract()` currently returns 9 fields in one monolithic step. Refactor to one stateful call — `resolveAudience(context) → NormalizedAudience` — plus pure derivations: `selectTabs(audience)`, `selectGates(audience)`, `selectChrome(audience)`, `selectHome(audience)`, `selectRoutePolicy(audience)`, `selectQueryScope(audience)`. Tests become `audience-fixture × selector` matrices instead of monolithic snapshots. Adding a gate touches one selector. Adding a tab touches one selector. The 9-value `diagnostic.reason` enum is split across the selectors that own each concern (flag-state in `selectTabs`, profile-state in `resolveAudience`, runtime-state in `selectChrome`).

The five boundary categories below still describe **what reads raw inputs and why** — they are the source of truth for the ESLint path-glob allowlist and for code review — but they are no longer encoded as a per-file ratchet. Verified against `apps/mobile/src/lib/navigation-contract-usage-guard.test.ts` (33 current entries, see Challenge Findings → CRITICAL-1):

| Category | Files (terminal state) | What they may read |
| --- | --- | --- |
| **Contract primitives** | `hooks/use-navigation-contract.ts`, `lib/navigation-contract.ts`, `lib/legacy-navigation-contract.ts` *(new)*, `hooks/use-active-profile-role.ts`, `hooks/use-parent-proxy.ts`, `lib/app-context.tsx`, `lib/profile.ts` | Raw `useAppContext`/`useParentProxy`/`activeProfile.isOwner`/proxy state — these *define* normalized context for the resolver. |
| **V0 compatibility** | `lib/legacy-navigation-contract.ts` *(new)* + any V0-only data-scope fallback hook explicitly opting in (`use-dashboard.ts`, `use-progress.ts`, `use-sessions.ts`, `use-notification-response-handler.ts`, `lib/navigation.ts`) | Legacy `mode === 'family'` comparisons and legacy `activeProfile`/proxy reads strictly behind `FEATURE_FLAGS.MODE_NAV_V1_ENABLED === false`. |
| **Account/profile permission helpers** | `hooks/use-consent.ts`, `hooks/use-learner-profile.ts`, `hooks/use-settings.ts`, `app/create-profile.tsx`, `app/delete-account.tsx` (and any future `lib/profile-permissions.ts`) | `isOwner` reads for **account-domain decisions** (consent, profile editing, deletion) — never for tab/route visibility. |
| **Mode/context mutation boundary** | `lib/use-mode-switch.ts`, `hooks/use-clone-from-child.ts` | Write side: `setMode` and Learn-this-too bridge. |
| **Push/notification scope** | `hooks/use-push-token-registration.ts` | Raw proxy read for token registration eligibility (must not register tokens for proxied child sessions). |

Each category is enforced by **path-glob allowlist in ESLint `no-restricted-imports`** (Change B), with the AST smoke test catching member-access patterns ESLint can't express. There is no per-file ratchet; the symbols are simply not reachable from screen code because they are not exported from any public barrel and direct deep imports are blocked unless the importing file matches a category glob.

> **Categories are transitional.** Three of the five categories — V0 compatibility, the data-scope V0 fallback rows inside category 1, and parts of mode-context mutation — exist only because V0 is alive. If/when a Phase 7 "delete V0" PR ships, those categories collapse and the ESLint allowlist shrinks to ~5 file globs. Do not invest in category infrastructure (additional gates, ratchet variants, AST-based category predicates) that is only justified by the V0 transition.

All ordinary app screens, components, and hooks (everything outside those five categories) consume `useNavigationContract()`, `useNavigationDataScopeContract()`, `contract.gates.<domain>.*`, `contract.canEnter()`, `contract.isSurfaced()`, `contract.chrome.*`, or `contract.home.*` — no raw hook calls, no `activeProfile.isOwner` for navigation/UI branching, no `mode === 'family'` comparisons.

---

## Definition Of Done

Phase 6 is done when all of these are true:

- `NavigationGates` exposes intent-grouped namespaces (`gates.account.*`, `gates.family.*`, `gates.progress.*`, `gates.learning.*`); no flat-boolean drift remains (Change A).
- `useAppContext` and `useParentProxy` are not re-exported from any public barrel reachable by screens; `eslint.config.mjs` blocks direct deep imports with `no-restricted-imports` and an explicit path-glob allowlist matching the five boundary categories (Change B). The per-file `LEGITIMATE_RAW_NAV_GATE_FILES` ledger is deleted.
- The AST guard at `navigation-contract-usage-guard.test.ts` shrinks to a smoke-test covering only what ESLint can't see: `activeProfile.isOwner` member-access for navigation branching, raw study/family mode comparisons, and `contract.diagnostic.*` member-access in production source (excluding tests + analytics — see Challenge Findings → HIGH-5).
- `resolveNavigationContract` is refactored to `resolveAudience` + pure selectors (`selectTabs` / `selectGates` / `selectChrome` / `selectHome` / `selectRoutePolicy` / `selectQueryScope`); `NavigationContract` is composed from selector outputs (Change C). Each selector has its own focused test file; the monolithic snapshot test stays as an end-to-end check only.
- No app screen, ordinary component, or non-boundary hook branches directly on `useAppContext()`, `useParentProxy()`, raw `activeProfile.isOwner`, raw study/family mode, or raw proxy state for navigation/UI behavior.
- V0 5-tab fallback is preserved behind one named compatibility module (`lib/legacy-navigation-contract.ts`) and has focused tests covering the `MODE_NAV_V0_ENABLED=false` + `MODE_NAV_V1_ENABLED=false` matrix from the spec's Hard Constraint (5-tab guardian, learner 4-tab, proxy 3-tab, and the mode-switched V0-on shape).
- Normal family review paths do not enter parent proxy. Proxy remains only for retained internal/test paths until separately deleted. The behavior change is explicit in PR 4b (see Challenge Findings → HIGH-3).
- More/account/privacy, Progress, Home, Shell, and deep-route guards consume contract gates/predicates from the namespaced surface.
- Focused navigation tests, the AST guard, ESLint on touched files, and mobile typecheck pass.
- The spec at `docs/specs/2026-05-21-navigation-contract.md` is amended so the Hard Constraint cites BOTH `lib/legacy-navigation-contract.ts` (new home of shell helpers) AND `lib/app-context.tsx:53-61, 70` (V0 mode short-circuits, unchanged in location) — see Round 2 → HIGH-C.

---

## In Scope / Out Of Scope

In scope:

- Add missing contract gates for screen intent, not implementation details.
- Move V0 fallback branching into a dedicated compatibility module.
- Migrate shell/home/progress/more/deep-route consumers away from raw owner/proxy/mode checks.
- Replace the terminal exception table with barrel + ESLint enforcement (Change B); shrink the AST guard to a smoke test.
- Restructure `NavigationGates` into intent-grouped namespaces (Change A).
- Split `resolveNavigationContract` into `resolveAudience` + pure selectors (Change C).
- Update tests to prove V0 fallback, V1 contract behavior, selector composition, and guard enforcement.

Out of scope:

- Deleting V0 fallback before both navigation flags are explicitly retired.
- Deleting the parent proxy implementation entirely.
- Changing API authorization rules.
- Redesigning visual layout beyond what is required to wire the contract.

---

## Target Architecture

### 1. Raw Input Adapter

`use-navigation-contract.ts` remains the only React hook adapter that may read:

- `useAppContext()`
- `useParentProxy()`
- `useProfile()`
- `useActiveProfileRole()`
- subscription status
- `FEATURE_FLAGS.MODE_NAV_V0_ENABLED`
- `FEATURE_FLAGS.MODE_NAV_V1_ENABLED`

It passes normalized context to `resolveNavigationContract()`.

> **Data-scope contract caveat (Round 2 → MEDIUM-A).** `useNavigationDataScopeContract` (`use-navigation-contract.ts:66-71`) hard-codes `{ status: 'ready', tier: null }` so data-scope reads don't wait on subscription. Current gates only branch on `subscriptionReady`, not `tier`, so this is safe today. **Any future tier-aware gate must either explicitly document that it is not safe to call via `useNavigationDataScopeContract`, or trigger a refactor that propagates real `tier` + `status: 'ready'|'loading'` through the data-scope path.** Silent misbehaviour through the data-scope entry point is the failure mode to prevent.

### 2. Resolver + Pure Selectors (Change C)

`navigation-contract.ts` exposes one stateful step and a set of pure selectors:

```ts
// One stateful step — interprets flags + profile state into a normalized audience.
export function resolveAudience(context: ProfileContext): NormalizedAudience;

// Pure derivations — each takes audience and returns one concern.
export function selectTabs(audience: NormalizedAudience): ReadonlySet<TabKey>;
export function selectHome(audience: NormalizedAudience): NavigationContract['home'];
export function selectChrome(audience: NormalizedAudience): NavigationContract['chrome'];
export function selectGates(audience: NormalizedAudience): NavigationGates;
export function selectRoutePolicy(audience: NormalizedAudience): {
  canEnter: (route: RouteKey, params?: RouteParams) => boolean;
  isSurfaced: (route: RouteKey, params?: RouteParams) => boolean;
};
export function selectQueryScope(audience: NormalizedAudience): NavigationContract['queryScope'];

// Composition — what consumers see.
export function resolveNavigationContract(context: ProfileContext): NavigationContract {
  const audience = resolveAudience(context);
  return {
    shape: audience.shape,
    effectiveAppContext: audience.effectiveAppContext,
    isFamilyCapable: audience.isFamilyCapable,
    isParentProxy: audience.isParentProxy,
    visibleTabs: selectTabs(audience),
    home: selectHome(audience),
    chrome: selectChrome(audience),
    gates: selectGates(audience),
    ...selectRoutePolicy(audience),
    queryScope: selectQueryScope(audience),
    diagnostic: audience.diagnostic,
  };
}
```

`NormalizedAudience` carries every input each selector needs (shape, effectiveAppContext, role, isOwner, isParentProxy, isFamilyCapable, linkedChildIds, subscriptionReady, flags, diagnostic reasons). Selectors are pure: same audience in → same output out. Tests become `audience-fixture × selector` matrices in dedicated files (`select-tabs.test.ts`, `select-gates.test.ts`, etc.) — adding a gate touches one selector and its focused test, not the monolithic snapshot. The existing `navigation-contract.snapshot.test.ts` survives as a composition smoke test only.

Screens consume the composed `NavigationContract` and never reconstruct these decisions.

### 3. V0 Compatibility Boundary

Add `legacy-navigation-contract.ts` for the hard constraint from the spec:

- V0-off guardian profiles still see 5 tabs.
- V0 mode-switch behavior remains available while `MODE_NAV_V0_ENABLED=true`.
- Legacy helpers such as tab-shape and visible-tab calculation move out of `_layout.tsx`.

The guard allows raw legacy mode/proxy reads only in this compatibility boundary.

### 4. Account Permission Boundary

Account-domain ownership checks are not navigation decisions. Instead of an ad hoc `activeProfile.isOwner` check or a new `lib/profile-permissions.ts` helper, these reads are exposed as `contract.gates.account.canManageBilling` / `canManageSecurity` / `canExportDelete` / `canAddChild` etc. — same audience input, same testing model, but namespaced so reviewers can tell account concerns from navigation concerns at a glance (Change A).

The boundary remains: account screens still read `contract.gates.account.*`; they never reach back to raw `activeProfile.isOwner`. The navigation guard does not flag account gates because the namespace makes the intent explicit.

### 5. Public Surface Discipline (Change B)

Enforcement is layered:

**Layer 1 — Barrel discipline.** `useAppContext` and `useParentProxy` are not re-exported from any public barrel that screens reach. Consumers must deep-import (`apps/mobile/src/lib/app-context`), which makes the boundary visible at the import line.

**Layer 2 — ESLint `no-restricted-imports`.** `apps/mobile/eslint.config.mjs` blocks deep imports of `lib/app-context`, `hooks/use-parent-proxy`, `hooks/use-active-profile-role`, and the raw flag reads — with a per-rule `files` allowlist matching the five boundary categories:

```js
{
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        { name: './lib/app-context', importNames: ['useAppContext'],
          message: 'Use useNavigationContract() — see docs/plans/2026-05-24-navigation-contract-phase-6-completion-plan.md' },
        { name: './hooks/use-parent-proxy',
          message: 'Use contract.isParentProxy / contract.chrome.proxyBanner' },
      ],
    }],
  },
  files: ['apps/mobile/src/app/**', 'apps/mobile/src/components/**', 'apps/mobile/src/hooks/**'],
},
{
  // Boundary categories — allow raw reads here.
  files: [
    'apps/mobile/src/lib/legacy-navigation-contract.ts',
    'apps/mobile/src/lib/navigation-contract.ts',
    'apps/mobile/src/hooks/use-navigation-contract.ts',
    'apps/mobile/src/lib/app-context.tsx',
    'apps/mobile/src/lib/profile.ts',
    'apps/mobile/src/hooks/use-{active-profile-role,parent-proxy,consent,learner-profile,settings,clone-from-child,push-token-registration}.ts',
    'apps/mobile/src/lib/use-mode-switch.ts',
    'apps/mobile/src/hooks/use-{dashboard,progress,sessions,notification-response-handler}.ts',
    'apps/mobile/src/lib/navigation.ts',
    'apps/mobile/src/app/create-profile.tsx',
    'apps/mobile/src/app/delete-account.tsx',
  ],
  rules: { 'no-restricted-imports': 'off' },
},
```

Path globs map 1:1 to the five categories in the Decision table. New files entering a category are added to the glob set, not to a per-file ledger.

**Layer 3 — AST smoke test.** `navigation-contract-usage-guard.test.ts` shrinks to ~50 lines covering only what ESLint can't express: `activeProfile.isOwner` member-access used as a navigation/UI branch (not as an account-domain check), raw `mode === 'family'` comparisons outside boundary files, and `contract.diagnostic.*` member-access in production source (excluding `*.test.*` and `lib/analytics*`). The 33-entry `LEGITIMATE_RAW_NAV_GATE_FILES` ledger is deleted.

**Rollback.** If a category glob misclassifies in practice, the fix is one-line: add/move a file in `eslint.config.mjs`. There is no ratchet to re-snapshot.

---

## Scope Split

### PR 1 - Contract Surface And V0 Boundary

- Add `lib/legacy-navigation-contract.ts`. Move `resolveTabShape`, `computeVisibleTabs`, `computeModeVisibleTabs`, `resolveHomeTabPresentation`, and the V0-only branches of `resolveShellVisibleTabs` (`_layout.tsx:122-250+`) into it. Re-export from `_layout.tsx` while consumers migrate, then drop the re-export at the end of PR 2.
- **Ratchet sequencing (Round 2 → CRITICAL-A):** the same commit that moves helpers must update `LEGITIMATE_RAW_NAV_GATE_FILES` — reduce the `_layout.tsx` counts to match the new reality and add a new entry for `lib/legacy-navigation-contract.ts` with the inherited finding counts. The ratchet must stay green in every intermediate PR; the category-rule swap arrives only in PR 4.
- **Shim hardening (Round 2 → MEDIUM-E):** annotate each re-export in `_layout.tsx` with a `@deprecated` JSDoc pointing at `lib/legacy-navigation-contract.ts`, and add a forward-only grep guard test (pattern: `persona-fossil-guard.test.ts`) that asserts no NEW files import the shimmed names from `_layout.tsx`. This prevents parallel branches from re-introducing imports that PR 2 would then break.
- Add focused tests for the full flag matrix (Round 2 → HIGH-A). All four `MODE_NAV_V0_ENABLED × MODE_NAV_V1_ENABLED` cells, crossed with {guardian, learner, child-only, proxy}, asserting both `effectiveAppContext` and `visibleTabs`:
  - `V0=false, V1=false`, guardian profile → 5 tabs (Hard-Constraint V0 default).
  - `V0=true,  V1=false`, mode=family/study → mode-switched 4-tab shapes (V0 mode-switch branch at `navigation-contract.ts:269-278`).
  - `V0=false, V1=true`, guardian / learner / child → V1 production paths (`navigation-contract.ts:279-300`).
  - `V0=true,  V1=true`, all states → V1 takes precedence (V1 flag overrides V0).
  - Proxy-active → 3-tab proxy shape (orthogonal to flags above).
- Add missing contract gates **only with cited consumers** (see Challenge Findings → HIGH-2). Provisional gate list — each line must cite the raw check it replaces before the gate is added; gates without a cited consumer are dropped:
  - `showFamilyHome` — replaces `LearnerScreen.tsx:487` (`showParentHome && !isParentProxy && shouldShowFamilyHome`). Confirm before adding.
  - `showLearningActions` — candidate replacement for `LearnerScreen.tsx:563`, `:649` (`!isParentProxy` gates on learning CTAs). Confirm exact consumers in PR 1 RFC commit.
  - `showSubjectManagement` — **needs a citation.** No current grep hit. Drop unless a consumer is identified.
  - `showLearnerUtilityActions` — **needs a citation.** Drop unless consumers are identified.
  - `showProxyReviewCta` — needs a citation; if the only consumer is the proxy banner, fold into `contract.chrome` instead of `gates`.
  - **`showProxyChrome` — overlap with existing `contract.chrome.proxyBanner` (`navigation-contract.ts:127-128, 444-445`).** Do not duplicate. Either remove this gate from the plan or rename `contract.chrome.proxyBanner` to `contract.chrome.proxy` and surface as a single named field.
- Keep the temporary exception ledger until PR 4 swaps to category rules.

### PR 2 - Shell And Home Consumers

> **Blast radius warning** (Challenge Findings → MEDIUM-2): `_layout.tsx` is 2,705 lines; `LearnerScreen.tsx` is 780 lines; bundling all three risks a hard-to-review PR. If reviewer load is a concern, split into PR 2a (`_layout.tsx`) and PR 2b (`home.tsx` + `LearnerScreen.tsx`). The shell is independent of the home migration so this split is mechanically safe.

- Migrate `_layout.tsx` to consume contract/legacy boundary outputs only. The `MODE_NAV_V1_ENABLED ? contract : legacy` branch stays at the top of the file; everything downstream reads one of the two outputs. No raw `useAppContext` / `useParentProxy` calls survive in `_layout.tsx`.
- Migrate `home.tsx` and `LearnerScreen.tsx` off raw proxy/mode/owner branching. The 13 `proxy-state-read` findings + 2 `profile-owner-read` findings + 1 `mode === 'family'` comparison currently flagged in `LearnerScreen.tsx` resolve to zero outside the V0-off branch.
- Preserve the parent-native Family home path (`LearnerScreen.tsx:487` ParentHome render branch). Add a `showFamilyHome` (or equivalent contract field — name to be confirmed in PR 1) so this branch is contract-driven.
- Preserve proxy banner via `contract.chrome.proxyBanner === 'required'`. Drop the duplicate `showProxyChrome` proposal unless it ends up replacing concretely cited raw reads.

### PR 3 - Progress, More, Subscription

- Migrate Progress scope and saved-progress proxy UI to contract gates. `progress/saved.tsx` (3 `proxy-state-read` findings) consumes `contract.gates.progressScope` and `contract.isSurfaced('progress/saved')` **only when `MODE_NAV_V1_ENABLED=true`; the V0 path keeps the existing raw proxy hook** (Round 2 → HIGH-B). The resolver's V0-off branch (`navigation-contract.ts:262-268`) returns `shape='study'` and the inline comment explicitly states `.gates/.shape` are not read in production there — so reading `progressScope` from the contract under V0 would silently regress saved-progress scope. Follow the same `MODE_NAV_V1_ENABLED ? contract : legacy` split that `use-dashboard.ts` / `use-progress.ts` / `use-sessions.ts` already use (these are V0-compatibility data-scope fallbacks per category 2 of the Decision table).
- Migrate More/account/privacy/accommodation/celebrations gates to contract gates. The 2/1/2/2 `profile-owner-read` findings in those files become `contract.gates.show{AccountSecurity,Billing,ExportDelete,AccommodationChildEditor,CelebrationsChildEditor}` reads.
- **Decision required for `subscription.tsx` (8 `profile-owner-read` findings).** Pick one before splitting the PR (Challenge Findings → HIGH-4):
  - **(A) Navigation gate** — `contract.gates.showBilling` already exists; extend to cover member-vs-owner copy and CTAs. Recommended if all 8 reads are UI/visibility.
  - **(B) Account-permission helper** — new `lib/profile-permissions.ts` exporting `canManageBilling(profile)`. Recommended if any of the 8 reads are non-UI (mutation guards, RevenueCat identity).
  - Defaulting to (A) unless an audit of the 8 sites finds non-UI usage. Audit must happen in PR 3, not deferred.
- Keep non-navigation billing/account safety checks explicit and tested.

### PR 4 - Deep Routes, Notifications, Guard Finalization

- Migrate deep-route guards (`session/_layout.tsx`, `homework/_layout.tsx`, `dictation/_layout.tsx`, `quiz/_layout.tsx`, `practice/index.tsx`, `topic/relearn.tsx`, `session-summary/[sessionId].tsx`) to `contract.canEnter()` / `contract.isSurfaced()`.
- **Behavior change (Challenge Findings → HIGH-3): normal family review stops entering parent proxy.** Today the proxy state can be entered via parent-initiated child-session opens (`session-summary/[sessionId].tsx` has 5 `proxy-state-read` findings; `LearnerScreen.tsx` shows proxy chrome at line 502+). Target: the parent's child-review entry points (Recaps detail, child/[profileId]/*, child/[profileId]/session/[sessionId]) render parent-native; proxy stays as an explicit internal/test-only escape hatch. This is a **user-visible behavior change**, not a refactor — call it out in the PR description and add an Acceptance Criteria test that asserts proxy banner does NOT appear when a parent opens any `child/[profileId]/*` route under V1.
- Replace `LEGITIMATE_RAW_NAV_GATE_FILES` with the five category rules from the Decision section. Per-file entries inside a category remain only with explicit rationale. **Specify category predicates concretely (Round 2 → HIGH-D):** provide guard pseudocode listing per-category path globs + any AST signals, plus an explicit precedence rule for files that straddle categories — first match wins, in order: Contract primitives → V0 compatibility → Account/profile permission helpers → Mode/context mutation → Push/notification scope.
- **Rollback plan (Round 2 → MEDIUM-D):** if the category-rule guard misclassifies in practice, revert PR 4 only — PRs 1–3 stand independently because they don't depend on the rule rewrite for correctness, only for guard greenness. Guard greenness can be re-satisfied by restoring the per-file ratchet snapshot recorded at the end of PR 3.
- Add guard self-tests that prove:
  - raw hooks are blocked in screens;
  - raw `activeProfile.isOwner` navigation branching is blocked in screens;
  - `navigationContract.isParentProxy` (member access via a `useNavigationContract()` variable) is allowed; raw `useParentProxy().isParentProxy` is blocked; new screens should prefer named gates;
  - account permission helpers are excluded from navigation guard scope but still flagged if they branch on `mode === 'family'`;
  - **`contract.diagnostic.*` member access in production source fails the guard** (excluding tests and analytics). The AST detector tracks identifiers bound from `useNavigationContract()` / `useNavigationDataScopeContract()` (already done — see `navigationContractVariables` in the existing guard at lines 432-452) and additionally flags `<contractVar>.diagnostic.*` access. See Challenge Findings → HIGH-5 for the rationale.

---

## Files Likely To Modify

Primary contract files:

- `apps/mobile/src/hooks/use-navigation-contract.ts`
- `apps/mobile/src/lib/navigation-contract.ts`
- `apps/mobile/src/lib/navigation-contract.test.ts`
- `apps/mobile/src/lib/navigation-contract.snapshot.test.ts`
- `apps/mobile/src/lib/navigation-contract.guard.test.ts` *(missing from earlier draft — Challenge Findings → MEDIUM-1)*
- `apps/mobile/src/lib/navigation-contract-usage-guard.test.ts`
- `apps/mobile/src/lib/legacy-navigation-contract.ts` - new
- `apps/mobile/src/lib/legacy-navigation-contract.test.ts` - new

High-priority consumers:

- `apps/mobile/src/app/(app)/_layout.tsx`
- `apps/mobile/src/app/(app)/home.tsx`
- `apps/mobile/src/components/home/LearnerScreen.tsx`
- `apps/mobile/src/app/(app)/progress/index.tsx`
- `apps/mobile/src/app/(app)/progress/saved.tsx`
- `apps/mobile/src/app/(app)/more/index.tsx`
- `apps/mobile/src/app/(app)/more/account.tsx`
- `apps/mobile/src/app/(app)/more/privacy.tsx`
- `apps/mobile/src/app/(app)/more/accommodation.tsx`
- `apps/mobile/src/app/(app)/more/celebrations.tsx`
- `apps/mobile/src/app/(app)/subscription.tsx`

Deep route consumers:

- `apps/mobile/src/app/(app)/session/_layout.tsx`
- `apps/mobile/src/app/(app)/homework/_layout.tsx`
- `apps/mobile/src/app/(app)/dictation/_layout.tsx`
- `apps/mobile/src/app/(app)/quiz/_layout.tsx`
- `apps/mobile/src/app/(app)/practice/index.tsx`
- `apps/mobile/src/app/(app)/topic/relearn.tsx`
- `apps/mobile/src/app/session-summary/[sessionId].tsx`
- `apps/mobile/src/hooks/use-notification-response-handler.ts`

Potential permission boundary:

- `apps/mobile/src/lib/profile-permissions.ts` - new if account ownership checks need to move out of screens.

---

## Guard Final Shape

Replace the current table with a small declaration like:

```ts
const RAW_NAVIGATION_BOUNDARIES = new Set([
  'apps/mobile/src/hooks/use-navigation-contract.ts',
  'apps/mobile/src/lib/navigation-contract.ts',
  'apps/mobile/src/lib/legacy-navigation-contract.ts',
]);
```

Guard rules:

- Production app screens and ordinary hooks may not import or call raw navigation hooks.
- Production app screens and ordinary hooks may not branch on raw `activeProfile.isOwner`, raw proxy state, or raw study/family mode for navigation behavior.
- The pure resolver may inspect normalized context, but consumers may not branch on `diagnostic.*`.
- V0 compatibility code is allowed only in `legacy-navigation-contract.ts`.
- Test files, fixtures, and explicit account-permission helpers are excluded from navigation drift enforcement.

---

## Validation

Run after each implementation slice:

```bash
pnpm exec jest -c apps/mobile/jest.config.cjs \
  apps/mobile/src/lib/navigation-contract.test.ts \
  apps/mobile/src/lib/navigation-contract.snapshot.test.ts \
  apps/mobile/src/lib/navigation-contract.guard.test.ts \
  apps/mobile/src/lib/navigation-contract-usage-guard.test.ts \
  apps/mobile/src/lib/legacy-navigation-contract.test.ts \
  --runInBand --no-coverage
pnpm exec eslint apps/mobile/src/lib/navigation-contract.ts apps/mobile/src/hooks/use-navigation-contract.ts apps/mobile/src/lib/legacy-navigation-contract.ts apps/mobile/src/lib/navigation-contract-usage-guard.test.ts
cd apps/mobile && pnpm exec tsc --noEmit
```

Run focused component tests as files are migrated:

```bash
pnpm exec jest -c apps/mobile/jest.config.cjs --runInBand --no-coverage --findRelatedTests <changed-files>
```

Before declaring Phase 6 done (Round 2 → MEDIUM-B adds the two missing test files; MEDIUM-C prepends `nx reset` to avoid phantom module-boundary failures):

```bash
pnpm exec nx reset
pnpm exec jest -c apps/mobile/jest.config.cjs \
  apps/mobile/src/lib/navigation-contract.test.ts \
  apps/mobile/src/lib/navigation-contract.snapshot.test.ts \
  apps/mobile/src/lib/navigation-contract.guard.test.ts \
  apps/mobile/src/lib/navigation-contract-usage-guard.test.ts \
  apps/mobile/src/lib/legacy-navigation-contract.test.ts \
  --runInBand --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
```

---

## Failure Modes

| State | Trigger | User sees | Recovery |
| --- | --- | --- | --- |
| V0 fallback accidentally removed | Shell migration deletes legacy 5-tab path | Guardian profiles lose a production-supported tab shape | Keep V0 logic in `legacy-navigation-contract.ts`; add 5-tab fallback tests before consumer migration |
| Guard becomes another large ledger | Files are added one by one to the exception table | Future PRs can normalize scattered raw checks again | Replace per-file exceptions with boundary allowlist only |
| Contract gates are too generic | Screens still combine multiple raw-ish booleans | Drift moves from `isOwner` to local boolean soup | Add intent-shaped gates and require screens to consume them directly |
| Account checks get mistaken for navigation checks | Guard flags account deletion/profile creation ownership checks | Developers add noisy exceptions or weaken the guard | Move account checks into permission helpers and exclude only those helpers |
| Proxy review remains a normal UX path | Parent review routes still switch into child proxy | Proxy chrome appears during ordinary family review | Route family review through Recaps/child/progress parent-native surfaces and assert `canEnter()` behavior |
| `diagnostic.*` becomes a second contract | Consumers branch on diagnostic fields | Hidden navigation behavior escapes the gate model | Guard consumers against diagnostic branching outside tests/analytics |
| V1 contract breaks loading state | Contract assumes profile/subscription is ready | Flicker, dead actions, or wrong tabs during startup | Keep least-surprising Study-safe loading output and test null profile/loading subscription rows |

---

## Acceptance Criteria

- Given both mode-nav flags are off, a guardian profile still sees all 5 V0 tabs.
- Given V1 is enabled and the profile is family-capable in Family context, the shell surfaces `home`, `recaps`, `progress`, and `more`.
- Given a normal parent opens child review surfaces, routes stay parent-native and do not enter proxy.
- Given a retained internal proxy path is active, proxy chrome is shown and learning write actions are hidden.
- Given an ordinary app screen imports `useParentProxy()` or `useAppContext()`, the guard fails.
- Given an ordinary app screen branches on raw `activeProfile.isOwner` for navigation UI, the guard fails.
- Given a screen needs account ownership, it uses a permission helper or contract gate instead of inline raw profile checks.
- Given a new route needs navigation gating, it is added to `RouteKey` and covered by `canEnter()` / `isSurfaced()` tests.

---

## Adversarial Review — Findings (2026-05-24)

Reviewed against codebase state at HEAD: `apps/mobile/src/lib/navigation-contract.ts`, `apps/mobile/src/lib/navigation-contract-usage-guard.test.ts`, `apps/mobile/src/hooks/use-navigation-contract.ts`, `apps/mobile/src/lib/app-context.tsx`, `apps/mobile/src/app/(app)/_layout.tsx`, `apps/mobile/src/components/home/LearnerScreen.tsx`, and `docs/specs/2026-05-21-navigation-contract.md`. Inline sections above have been amended to reflect Pass 1 findings; this appendix preserves the rationale.

### Pass 1 — Must address now

**[CRITICAL-1] "3-file boundary allowlist" is not reachable from current state.**
- Evidence: `navigation-contract-usage-guard.test.ts:40-352` defines **33** `LEGITIMATE_RAW_NAV_GATE_FILES` entries spanning V0-fallback shell files, contract primitives (`use-active-profile-role.ts`, `use-parent-proxy.ts`, `app-context.tsx`, `profile.ts`), account-permission helpers (`use-consent.ts`, `use-learner-profile.ts`, `use-settings.ts`, `create-profile.tsx`, `delete-account.tsx`), mode-mutation helpers (`use-mode-switch.ts`, `use-clone-from-child.ts`), data-scope fallbacks (`use-dashboard.ts`, `use-progress.ts`, `use-sessions.ts`, `use-notification-response-handler.ts`, `lib/navigation.ts`), the push-token registration hook, and `profiles.tsx` / `session-summary/[sessionId].tsx`. The "boundary is 3 files" assertion in the original Decision section understated reality by roughly 10×.
- Applied fix: rewrote Decision section to a five-category boundary model; updated Definition Of Done to require category rules rather than removal of all per-file entries.

**[HIGH-1] PR 4 silently changes user-visible parent-review behavior.**
- Evidence: original PR 4 line read "Confirm normal parent review routes go through Recaps/child/progress parent-native surfaces, not proxy." `LearnerScreen.tsx:502, 506, 541, 563, 617, 649, 671, 741` all branch on `isParentProxy` to render proxy chrome / suppress CTAs today; `session-summary/[sessionId].tsx` carries 5 `proxy-state-read` findings in the ratchet. Removing proxy from the normal review flow is a behavior change, not a confirmation.
- Applied fix: PR 4 now explicitly calls this out as a behavior change, requires an Acceptance Criteria test, and tags the PR description requirement.

**[HIGH-2] New gates lack consumer citations — violates the plan's own "gates too generic" failure mode.**
- Evidence: searched `apps/mobile/src` for `showFamilyHome`, `showLearningActions`, `showSubjectManagement`, `showLearnerUtilityActions`, `showProxyReviewCta` — zero references. The Failure Modes table in this very plan lists "Contract gates are too generic … screens still combine multiple raw-ish booleans" as a foreseen failure. Adding 6 gate names without citing the raw checks they replace is the leading indicator of that failure.
- Applied fix: PR 1 gate list now requires each gate to cite the raw check (file:line) it replaces; gates without citations are marked drop-unless-justified.

**[HIGH-3] `showProxyChrome` duplicates `contract.chrome.proxyBanner`.**
- Evidence: `navigation-contract.ts:126-129` and `:443-446` already expose `chrome: { modeSwitcher, proxyBanner: 'required' | 'hidden' }`. Adding a redundant `gates.showProxyChrome` creates two ways to ask the same question — the exact drift pattern the contract was supposed to eliminate.
- Applied fix: PR 1 gate list flags `showProxyChrome` as overlap; either delete or unify naming under `contract.chrome`.

**[HIGH-4] `subscription.tsx` ownership decision deferred.**
- Evidence: original PR 3 line read "either to navigation gates or account-permission helpers" — no commitment. `subscription.tsx` has 8 `profile-owner-read` findings in the ratchet; the audit must happen during scoping, not at implementation time, because the decision changes which file(s) PR 3 touches and which boundary category they live under.
- Applied fix: PR 3 now requires the audit during the PR's RFC commit; defaults to navigation gate (option A) unless non-UI sites are found.

**[HIGH-5] Guard rule "no `diagnostic.*` branching" is unspecified.**
- Evidence: the current AST guard (`navigation-contract-usage-guard.test.ts:432-676`) tracks `useNavigationContract()` / `useNavigationDataScopeContract()` return variables (`navigationContractVariables`) but only inspects property names `isOwner` and `isParentProxy`. Detecting `<contractVar>.diagnostic.*` requires a new visitor branch and a decision about whether `diagnostic` access in `*.test.ts` and `lib/analytics.ts` is allowed.
- Applied fix: PR 4 now describes the AST detection strategy (re-use `navigationContractVariables`, add a property-access check for `diagnostic`, exclude tests + analytics by path).

### Pass 2 — Safer follow-up tightening

**[MEDIUM-1] Missing reference to `navigation-contract.guard.test.ts`.**
- Evidence: `ls apps/mobile/src/lib/navigation-contract*` shows `.guard.test.ts` exists; original "Files Likely To Modify" and "Validation" sections omitted it.
- Applied fix: added to Files list and to Validation jest command.

**[MEDIUM-2] PR 2 blast radius.**
- Evidence: `_layout.tsx` 2,705 lines; `LearnerScreen.tsx` 780 lines; `home.tsx` is the third file. Bundling all three is a heavy review.
- Applied fix: PR 2 now describes an optional 2a/2b split. User decides.

**[MEDIUM-3] V0 helper move requires spec amendment.**
- Evidence: `docs/specs/2026-05-21-navigation-contract.md:54-56` cites `apps/mobile/src/lib/app-context.tsx` line 60 + 70 and `_layout.tsx:122-185` as the V0 fallback locations. After the move, `_layout.tsx:122-185` is no longer accurate.
- Applied fix: added a Definition-of-Done bullet requiring spec amendment so the Hard Constraint citations stay correct.

### Out of scope / acknowledged

- Failure Modes table is complete with Recovery columns — satisfies the project rule from `CLAUDE.md` → "Spec failure modes before coding."
- The plan correctly identifies that V0 helpers are still required (consistent with the spec's Hard Constraint) and does not propose deleting them.
- The plan correctly distinguishes account-domain ownership from navigation gating — the spec/CLAUDE.md call out this split.
- `useNavigationContract` adapter currently reads exactly the inputs the plan claims (`use-navigation-contract.ts:18-22`) — accurate.

---

## Adversarial Review — Round 2 (2026-05-24)

Second adversarial pass after the Round-1 findings were folded into the body. Verified against the same HEAD sources plus `apps/mobile/src/lib/navigation-contract-usage-guard.test.ts:733-767` (ratchet enforcement), `apps/mobile/src/hooks/use-navigation-contract.ts:54-71` (data-scope contract entry point), `apps/mobile/src/lib/navigation-contract.ts:256-300` (flag-matrix branches), `apps/mobile/src/lib/navigation-contract.ts:262-268` (V0-off legacy short-circuit comment), and `apps/mobile/src/lib/app-context.tsx` (V0 mode short-circuits cited by the spec's Hard Constraint).

### Pass 1 — Must address now

**[CRITICAL-A] Per-file ratchet fails in every intermediate PR.**
- Evidence: `navigation-contract-usage-guard.test.ts:733-767` asserts EXACT finding counts per file. PR 1 moves `resolveTabShape` / `computeVisibleTabs` / `computeModeVisibleTabs` / `resolveHomeTabPresentation` plus the V0-only branches of `resolveShellVisibleTabs` out of `_layout.tsx`; ratchet entry for `_layout.tsx` (`proxy-state-read=11, raw-hook-call=2, raw-hook-import=2, study-family-mode-compare=3`) goes to lower counts and the new `legacy-navigation-contract.ts` gets fresh counts. PR 4 is the one that swaps to category rules. PRs 1–3 break the existing ratchet in between.
- Applied fix: PR 1 now states each file move must update `LEGITIMATE_RAW_NAV_GATE_FILES` in the same commit (add a `legacy-navigation-contract.ts` entry; reduce `_layout.tsx` counts), OR the PR 4 category-rule swap moves to PR 1. Plan picks option (a) — atomic ratchet updates per PR — and calls this out as a hard sequencing constraint in PR 1 and PR 4.

**[HIGH-A] Flag-matrix test coverage misses the V1 production case.**
- Evidence: PR 1's listed tests cover `V0=false,V1=false guardian`, `V0=true,V1=false mode=family/study`, and `proxy → 3-tab`. Resolver code paths at `navigation-contract.ts:256-300` distinguish four flag combinations. The V1-enabled case (`V0=*, V1=true`) — the path the contract is supposed to drive in production — is not in the PR-1 test list. The `V0=true,V1=false` mode-switch branch at `:269-278` also depends on `legacyV0FamilyCapable && context.appContext !== null`, which is not explicitly asserted.
- Applied fix: PR 1 test list extended to the full 4-flag × {guardian, learner, child-only, proxy} matrix; each cell asserts `effectiveAppContext` and `visibleTabs`.

**[HIGH-B] `progress/saved.tsx` cannot read `contract.gates.progressScope` under V0-off.**
- Evidence: `navigation-contract.ts:262-268` returns `shape='study'` + `visibleTabs=LEGACY_GUARDIAN_TABS` for V0-off guardians, with an inline comment stating "`.gates/.shape` are not read in production" in that branch. `progressScope` is derived from `familyShape` at `:330`. Under V0-off, `progressScope` returns `'self'` even for a legacy guardian with children — wrong scope for saved progress. PR 3's "consumes `contract.gates.progressScope`" line silently regresses V0.
- Applied fix: PR 3 now spells out the same `MODE_NAV_V1_ENABLED ? contract.gates.progressScope : legacyProxyHook` split that `use-dashboard.ts` / `use-progress.ts` / `use-sessions.ts` already follow (these are explicitly classified as V0-compatibility data-scope fallbacks in the Decision table).

**[HIGH-C] Spec amendment scope is incomplete.**
- Evidence: MEDIUM-3 (Round 1) requires re-pointing `_layout.tsx:122-185`. The spec's Hard Constraint also cites `app-context.tsx:53-61, 70`. PR 1 moves shell helpers but does NOT relocate the V0 short-circuits inside `app-context.tsx` (correctly — that file is classified as a Contract primitive). The spec amendment must therefore cite BOTH locations.
- Applied fix: Definition-of-Done bullet on the spec amendment now requires citing `lib/legacy-navigation-contract.ts` (shell helpers) AND `lib/app-context.tsx:53-61, 70` (mode short-circuits).

**[HIGH-D] "Category predicate" semantics are unspecified.**
- Evidence: Decision section says categories are enforced "by category rule, not per-file allowlist" with a sample predicate "file path matches `**/lib/legacy-navigation-contract.ts` OR file imports only the resolver-input contract types." The second predicate requires import-graph analysis at lint time. The Guard Final Shape block only shows a 3-entry `RAW_NAVIGATION_BOUNDARIES` Set — still per-file, just shorter — and never explains how the five categories map to AST checks. Also unspecified: precedence when a file straddles two categories (e.g. `use-navigation-contract.ts` is a Contract primitive that also reads `useParentProxy`, which would also qualify it for "Push/notification scope").
- Applied fix: PR 4 now requires a guard pseudocode sketch listing per-category path globs + any AST signals, plus an explicit precedence rule ("first matching category wins, in the order: Contract primitives → V0 compatibility → Account/profile permission helpers → Mode/context mutation → Push/notification scope").

### Pass 2 — Safer follow-up tightening

**[MEDIUM-A] `useNavigationDataScopeContract` hard-codes `tier: null`.**
- Evidence: `use-navigation-contract.ts:66-71` always returns `{ status: 'ready', tier: null }`. Current gates only read `subscriptionReady`, not `tier`, so this works today. No constraint prevents a future "showPremiumX" gate from branching on `tier` — it would silently misbehave when called via `useNavigationDataScopeContract`.
- Applied fix: added a forward-only note under Target Architecture §2 stating that any tier-aware gate must either (a) document that it's not safe to call from data-scope contexts, or (b) prompt a refactor of `useNavigationDataScopeContract` to pass real tier with `status: 'ready'|'loading'`.

**[MEDIUM-B] "Before declaring Phase 6 done" validation block omits two test files.**
- Evidence: the per-slice validation block lists `legacy-navigation-contract.test.ts` and `navigation-contract.guard.test.ts`. The phase-completion block omits both. Inconsistent.
- Applied fix: phase-completion jest command now includes both files.

**[MEDIUM-C] No `nx reset` step before validation.**
- Evidence: `feedback_nx_reset_before_commit.md` — NX cache yields phantom `@nx/enforce-module-boundaries` errors on package-boundary changes; PR 1 adds a new `lib/legacy-navigation-contract.ts` file (boundary-adjacent). Without `pnpm exec nx reset` the validation block can show false positives.
- Applied fix: `pnpm exec nx reset` prepended to phase-completion validation; advisory note added.

**[MEDIUM-D] No rollback for the guard rewrite.**
- Evidence: PR 4 deletes the per-file ledger and swaps in category rules. If the category predicates misclassify (esp. given HIGH-D), the guard may either greenlight a real drift or fail-closed on a legitimate primitive. No documented fallback.
- Applied fix: PR 4 now carries a one-line rollback note (revert PR 4 only; PRs 1–3 stand because they don't depend on the rule rewrite for correctness — only for guard greenness, which can be re-satisfied by restoring the per-file ratchet snapshot).

**[MEDIUM-E] PR 1 re-export shim is a sequencing trap.**
- Evidence: PR 1 says "Re-export from `_layout.tsx` while consumers migrate, then drop the re-export at the end of PR 2." If a parallel branch lands a new import of the shimmed helpers from `_layout.tsx` between PR 1 and PR 2, the PR 2 shim removal breaks them. Plan does not guard against this.
- Applied fix: PR 1 now requires a deprecation `@deprecated` JSDoc on each re-export plus a forward-only grep guard (similar to `persona-fossil-guard.test.ts`) asserting no NEW files import the shim names from `_layout.tsx`.

### Out of scope / acknowledged

- Round-1 findings (CRITICAL-1, HIGH-1..5, MEDIUM-1..3) remain accurate and addressed.
- Category model (5 categories matching the 33 ratchet entries) holds up under verification.
- Decision to keep V0 helpers alive is correct per the spec's Hard Constraint.

