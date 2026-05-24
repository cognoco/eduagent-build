# Navigation Contract Phase 6 Completion Plan

> **Status:** Draft
> **Date:** 2026-05-24
> **Source spec:** [`docs/specs/2026-05-21-navigation-contract.md`](../specs/2026-05-21-navigation-contract.md)

**Goal:** Finish Phase 6 with the smallest maintainable boundary: screens stop reading raw owner/proxy/mode facts, V0 compatibility stays isolated, and the guard becomes a short boundary check instead of a per-file migration ledger.

---

## Decision

Keep this simple.

Phase 6 does **not** need a selector framework, a full `NavigationGates` namespace rewrite, or an early ESLint enforcement rewrite. Those may be useful later, but they add moving parts before the actual migration is complete.

The maintainable end state is:

- one adapter reads raw runtime facts;
- one pure resolver owns navigation decisions;
- one V0 compatibility module preserves the required 5-tab fallback;
- screens consume `useNavigationContract()`, `contract.gates.*`, `contract.chrome.*`, `contract.canEnter()`, and `contract.isSurfaced()`;
- the guard allows only the boundary files, not a long list of consumer exceptions.

---

## Definition Of Done

Phase 6 is done when all of these are true:

- No ordinary app screen/component/hook reads `useAppContext()`, `useParentProxy()`, raw `activeProfile.isOwner`, raw study/family mode, or raw proxy state for navigation UI.
- V0 behavior required by the source spec still works:
  - both flags off -> guardian profile sees the current 5-tab production shell;
  - `MODE_NAV_V0_ENABLED=true` and V1 off -> legacy mode-switched shell works;
  - V1 on -> `resolveNavigationContract()` drives the target Study/Family shape.
- Normal family-review paths stay parent-native and do not enter parent proxy.
- Retained internal/test proxy paths still show required proxy chrome and hide learning write actions.
- The current `LEGITIMATE_RAW_NAV_GATE_FILES` table is removed or reduced to a short boundary allowlist.
- Focused navigation tests, guard tests, ESLint on touched files, and mobile typecheck pass.

---

## Non-Goals

Do not make these Phase 6 requirements:

- Splitting `resolveNavigationContract()` into selectors.
- Rewriting `NavigationGates` into nested namespaces.
- Replacing the guard with ESLint as the primary enforcement layer.
- Deleting V0 fallback before both navigation flags are explicitly retired.
- Deleting the parent proxy implementation entirely.
- Changing API authorization rules.

These can be separate follow-ups if the code later proves they are needed.

---

## Target Shape

### Raw Input Boundary

`apps/mobile/src/hooks/use-navigation-contract.ts` is the normal adapter that may read:

- `useAppContext()`
- `useParentProxy()`
- `useProfile()`
- `useActiveProfileRole()`
- subscription state
- `FEATURE_FLAGS.MODE_NAV_V0_ENABLED`
- `FEATURE_FLAGS.MODE_NAV_V1_ENABLED`

It passes normalized inputs to `resolveNavigationContract()`.

### Pure Resolver

`apps/mobile/src/lib/navigation-contract.ts` remains the single pure resolver. Keep it readable and tested; do not split it unless the implementation becomes genuinely hard to reason about.

It owns:

- visible tabs;
- home/chrome presentation;
- gates;
- `canEnter()` / `isSurfaced()`;
- query scope;
- diagnostics.

### V0 Compatibility Boundary

Add `apps/mobile/src/lib/legacy-navigation-contract.ts` only for legacy shell behavior that must remain while V0 exists:

- `resolveTabShape`
- `computeVisibleTabs`
- `computeModeVisibleTabs`
- `resolveHomeTabPresentation`
- V0 branches currently embedded in `_layout.tsx`

This keeps `_layout.tsx` from being the place where legacy logic grows.

### Consumer Rule

Screens should ask the contract intent questions directly. If a screen still needs a local combination like:

```ts
activeProfile?.isOwner === true && !isParentProxy && mode === 'family'
```

then either an existing contract field should replace it, or a small named gate should be added to `NavigationGates`.

Add gates only when a concrete consumer needs them. Do not pre-create abstract gates.

---

## Scope Split

### PR 1 - V0 Boundary And Guard Prep

- Add `lib/legacy-navigation-contract.ts`.
- Move legacy shell helpers out of `_layout.tsx`.
- Keep temporary re-exports from `_layout.tsx` only if needed for existing tests; mark them `@deprecated` and remove them in PR 2.
- Add `legacy-navigation-contract.test.ts` covering:
  - V0-off guardian 5-tab shell;
  - V0-on family/study shell;
  - proxy shell.
- Update `LEGITIMATE_RAW_NAV_GATE_FILES` counts in the same PR so the current guard stays green.
- Do **not** flip to the final boundary guard yet.

### PR 2 - Shell And Home Migration

- Migrate `_layout.tsx` to consume contract outputs and legacy compatibility outputs only.
- Remove raw `useAppContext()` / `useParentProxy()` reads from `_layout.tsx`.
- Migrate `home.tsx` and `LearnerScreen.tsx` off raw proxy/mode/owner branching.
- Add only the gates needed by these concrete call sites, for example:
  - `showFamilyHome` if it replaces the ParentHome branch;
  - `showLearningActions` if it replaces repeated `!isParentProxy` learning CTA checks.
- Preserve existing V0-off and V0-on behavior.

If the shell and home diff becomes too large, split this into PR 2a (`_layout.tsx`) and PR 2b (`home.tsx` / `LearnerScreen.tsx`).

### PR 3 - Progress, More, Subscription

- Migrate Progress screen scope decisions to the contract for V1.
- Keep explicit V0 fallback reads where the source spec requires V0 behavior and the contract intentionally does not own V0 gates.
- Migrate More/account/privacy/accommodation/celebrations owner/proxy UI decisions to contract gates.
- Audit `subscription.tsx` owner reads:
  - UI visibility reads move to contract gates;
  - non-UI account safety checks stay explicit or move to a small permission helper.
- Update focused tests for migrated files.

### PR 4 - Deep Routes And Parent-Native Review

- Migrate deep-route guards to `contract.canEnter()` / `contract.isSurfaced()`.
- Update notification/back-stack rules that still reconstruct context locally.
- Ensure normal parent review paths use Recaps/child/progress parent-native routes instead of proxy.
- Keep retained internal/test proxy paths working.
- Add acceptance tests for:
  - parent opens `child/[profileId]/*` under V1 and does not see proxy chrome;
  - retained proxy path still shows proxy chrome and hides learning write actions.

### PR 5 - Final Guard Simplification

- Replace `LEGITIMATE_RAW_NAV_GATE_FILES` with a short boundary allowlist.
- Keep the AST detector simple but sufficient:
  - raw hook imports/calls outside boundaries fail;
  - raw `activeProfile.isOwner` navigation branching outside boundaries fails;
  - raw proxy-state aliases, including `isExplicitProxyMode`, outside boundaries fail;
  - raw `mode === 'family'` / `mode === 'study'` outside boundaries fail;
  - `contract.diagnostic.*` branching in production source fails.
- Exclude tests, fixtures, i18n, and explicitly named analytics files.
- Do not use ESLint as the primary mechanism in Phase 6. Add ESLint later only if the AST guard remains noisy.

Expected final boundary files:

- `apps/mobile/src/hooks/use-navigation-contract.ts`
- `apps/mobile/src/lib/navigation-contract.ts`
- `apps/mobile/src/lib/legacy-navigation-contract.ts`
- `apps/mobile/src/lib/app-context.tsx`
- `apps/mobile/src/hooks/use-parent-proxy.ts`
- `apps/mobile/src/hooks/use-active-profile-role.ts`
- `apps/mobile/src/lib/profile.ts`
- mode write boundary: `apps/mobile/src/lib/use-mode-switch.ts`
- retained V0 data-scope fallbacks, only if still required by the source spec

---

## Files Likely To Modify

Primary files:

- `apps/mobile/src/hooks/use-navigation-contract.ts`
- `apps/mobile/src/lib/navigation-contract.ts`
- `apps/mobile/src/lib/navigation-contract.test.ts`
- `apps/mobile/src/lib/navigation-contract.snapshot.test.ts`
- `apps/mobile/src/lib/navigation-contract.guard.test.ts`
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
- `apps/mobile/src/app/session-summary/[sessionId].tsx`
- `apps/mobile/src/hooks/use-notification-response-handler.ts`

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
pnpm exec jest -c apps/mobile/jest.config.cjs --runInBand --no-coverage --findRelatedTests <changed-files>
pnpm exec eslint <changed-files>
cd apps/mobile && pnpm exec tsc --noEmit
```

Before declaring Phase 6 done:

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
| V0 fallback accidentally removed | Shell migration deletes legacy 5-tab path | Guardian profiles lose current production shell | Keep V0 logic in `legacy-navigation-contract.ts`; test V0-off guardian 5-tab behavior in every PR |
| Exception table survives as permanent architecture | PRs keep updating counts but never flip the guard | Future work normalizes scattered raw checks | PR 5 must replace the table with a boundary allowlist |
| Contract gates become abstract | Gates are added without concrete consumers | Screens still combine local booleans or reviewers cannot tell intent | Add gates only with a cited consumer and focused test |
| Guard misses proxy aliases | AST smoke test only checks `useParentProxy()` imports | Screens branch on `useProfile().isExplicitProxyMode` | Keep proxy-state alias detection in the final guard |
| V0 code reads V1 gates | A screen consumes `contract.gates.*` while V1 is off | Wrong scope/tabs under current production fallback | Keep explicit `MODE_NAV_V1_ENABLED ? contract : legacy` splits until V0 is retired |
| Normal review still enters proxy | Parent opens child review from Family path | Proxy chrome appears in ordinary review | Route through Recaps/child/progress parent-native surfaces and test no proxy chrome |
| Proxy escape path breaks | Retained internal/test proxy path is migrated away accidentally | Legacy proxy users lose exit/banner behavior | Keep proxy path tests until proxy implementation is separately deleted |
| `diagnostic.*` becomes behavior input | Screen branches on diagnostic reason | Contract has a hidden second public API | Guard production consumers against diagnostic branching |

---

## Acceptance Criteria

- Given both mode-nav flags are off, a guardian profile sees the current 5-tab shell.
- Given V1 is enabled and a family-capable profile is in Family context, the shell surfaces `home`, `recaps`, `progress`, and `more`.
- Given a normal parent opens child review surfaces, routes stay parent-native and proxy chrome is absent.
- Given a retained proxy path is active, proxy chrome is required and learning write actions are hidden.
- Given an ordinary app screen imports/calls raw navigation hooks, the guard fails.
- Given an ordinary app screen branches on raw `activeProfile.isOwner`, proxy aliases, or raw study/family mode for navigation UI, the guard fails.
- Given a new route needs navigation gating, it is added to `RouteKey` and covered by `canEnter()` / `isSurfaced()` tests.
- Given a new gate is added, it replaces a concrete consumer raw check and has focused test coverage.

