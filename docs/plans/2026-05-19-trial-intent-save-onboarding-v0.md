# Trial Intent Save Onboarding v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a pre-signup intent screen + post-signup save wizard that routes self / parent / both / not-sure users to the correct profile shape and landing surface, replacing today's learner-only "try it" path.

**Architecture:** Three preview routes outside `(app)/` (landing → intent → topic|value-prop), state held in-memory plus a single 1-hour SecureStore key for cold-start survival across the OAuth round-trip. The post-signup save wizard is an **inline gate component** co-located inside `(app)/_layout.tsx` (mirrors the existing `CreateProfileGate` at line 640) — NOT a nested route. [CRITICAL-A2] The layout's gate ordering is: probe-loading spinner → `SaveWizardGate` (`previewProbeState === 'present' && !wizardDone`) → `CreateProfileGate` (`!activeProfile`) → consent gates → Tabs. Whole feature lives behind `PREVIEW_ONBOARDING_ENABLED`; the `isFamilyCapableProfile()` helper and the SecureStore-key entry in sign-out-cleanup ship unconditionally because the sibling Study/Family v0 spec imports them.

**Tech Stack:** Expo Router (file-based routing), React Native, Clerk (auth), expo-secure-store, TanStack Query (`useProfiles` is `['profiles', userId]`-scoped), Hono RPC client, Jest co-located unit tests, Maestro E2E.

**Reference spec:** `docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md`. Read it once before starting Task 0.

---

## Adversarial Review Round 3 — Findings Applied (2026-05-19)

Third pass. Round 2 left one substantive deliverable unfinished ([HIGH-B2] — adult-age gate listed in the summary but not actually written into Task 13). Round 3 finishes that work AND critiques the Round-1+Round-2 deltas themselves (the least-reviewed code in the plan), plus a handful of codebase claims earlier rounds asserted without verifying. Inline `[ID3]` markers below cite Round-3 findings.

- **[OPT-C]** Coordinator decision (post-Round-3): defense-in-depth on the underage-parent problem. Both the client gate ([HIGH-A3]) AND a new server-side rule (Task 13b, added below) ship behind an **independent feature flag** `ADULT_OWNER_GATE_ENABLED` (mobile + API). This addresses the spec-vs-plan contradiction surfaced in [MEDIUM-E3] and closes the missing-server-rule gap surfaced in [HIGH-D3], while giving us a kill switch that toggles the gate off without disabling the whole preview-onboarding feature (`PREVIEW_ONBOARDING_ENABLED` stays separate). Cross-refs: [HIGH-D3] surfaced the missing server rule; [MEDIUM-E3] surfaced the spec-vs-plan contradiction; [HIGH-A3] is the client-side gate. With BOTH `ADULT_OWNER_GATE_ENABLED` flags OFF the system is identical to today's behaviour (no adult-age constraint). With BOTH ON, the client gate is pre-flight UX and the server rule is the actual barrier — if a request bypasses the client, the server returns 403 `ADULT_OWNER_REQUIRED`.

- **[HIGH-A3]** Round 2's `[HIGH-B2]` follow-through was NOT done — Task 13 still ships without an adult-age gate. Now added in Step 1 (failing tests) + Step 3 (component code) of Task 13. Uses `computeAgeBracket(parentBirthYear) === 'adult'` (canonical helper exported from `@eduagent/schemas`, `packages/schemas/src/age.ts:39-49`) — the same definition `isAdultOwner()` uses (`packages/schemas/src/age.ts:51-62`) and the same shape `more/index.tsx:118` consumes for the existing "show add child" gate. Tests assert: underage parent (birth year giving < 18) cannot submit when `needsChild` is true; exactly 18 (boundary) DOES proceed; check is skipped entirely when `target === 'self'` (no child involved, server's 11+ floor is the only gate).
- **[CRITICAL-A3]** The Task 11 gate ordering (the new code most likely to ship with a bug) has TWO latent gaps that the Round-2 sketch does not address. Both fixed inline below:
  1. **Wizard branch fires for a signed-OUT user.** `useUser()`/`useAuth()` may report `isSignedIn=false` (e.g. token expiry mid-OAuth, sign-out race) AFTER the wizard branch reads `previewProbeState === 'present'`. The Round-2 ordering puts the wizard branch ABOVE the `if (!isSignedIn) return <Redirect href="/sign-in">` gate (`_layout.tsx:1539-1548` evidence) only because the wizard branch lives below the `isProfileLoading` check, but neither the plan text nor the sketch makes the auth precedence explicit. The wizard MUST sit after `!isSignedIn` (and after `isProfileLoading`/`profileLoadError`) — never before. Updated ordering: `!isLoaded` spinner → `!isSignedIn` redirect → `pendingAuthRedirect` spinner → `isProfileLoading` spinner → `profileLoadError` fallback → preview-probe-loading spinner → SaveWizardGate branch → `!activeProfile` CreateProfileGate → consent gates → Tabs.
  2. **`previewProbeState === 'loading'` blocks the existing pending-auth-redirect spinner.** If the gate runs the new probe-loading spinner BEFORE the pending-auth-redirect block (`_layout.tsx:1550-1576`), users coming back from OAuth see the new spinner instead of the existing auth-redirect spinner, and the replay timeout (`pendingRedirectTimedOut`, `_layout.tsx:1437`) starts measuring against the wrong loader. The probe-loading spinner MUST sit AFTER the pending-auth-redirect block, not before. The Round-2 sketch's wording ("immediately BEFORE the `if (!activeProfile)` branch") IS the correct placement, but the loading-spinner inside that branch is duplicative with the existing pending-redirect spinner — the probe is fast (single `getItemAsync`) so the cleanest fix is to render `null` (or fall through to the existing `isProfileLoading` spinner if the probe is still resolving when `isProfileLoading` flips false). Updated below.
- **[CRITICAL-B3]** The Round-2 plan removed `clearPreviewState()` from the layout effect but the Step-3 success path in Task 14 (lines 2326) STILL calls `await clearPreviewState()` — verified. However the wizard-as-inline-gate setup wires `onComplete()` from the wizard to the layout BEFORE clearing the state, and the success path navigates with `router.replace` before clearing on certain branches. Reading Task 14's `onLand` (lines 2316-2340): `switchProfile` → `clearPreviewState` → `router.replace`. Correct order. Confirmed: no leak. Marked verified inline.
- **[HIGH-B3]** `simulateProfileCreated` is referenced in Task 11's failing-test sketch (around line 1488 area in the existing file — coordinator confirm exact line) but DOES NOT exist in `_layout.test.tsx`. Grep returns zero matches in the test file. Added a TODO with the contract the harness must satisfy (mutates `useProfile()` mock's `activeProfile`/`profiles` returns + flushes microtasks) so the implementer doesn't get stuck spelunking.
- **[HIGH-C3]** `SaveWizardGate` defined inline inside `(app)/_layout.tsx` (1859 LOC file, multiple components already co-located: `CreateProfileGate` at line 640, `ConsentPendingGate`, `ConsentWithdrawnGate`, gate-content helpers). Adding one more function does NOT trigger `import/no-default-export` (the file's default export is `AppLayout`; other named functions are fine). Verified by reading file structure (`grep -n "^function\|^export default" _layout.tsx`). No nx-module-boundaries risk — same package, same directory. Import depth check: imports in `SaveWizardGate` (defined in `(app)/_layout.tsx`) must use `../../lib/...` (two levels up — `_layout.tsx` → `(app)/` → `app/` → `src/`), NOT `../../../lib/...`. The Round-2 Task 12 sketch (line 1635) correctly says `../../lib/...` in its narrative note but the test snippet on line 1639 still has the three-dot path. Fixed inline.
- **[HIGH-D3]** Server has NO 18+ owner rule. `apps/api/src/services/profile.ts:184-191` enforces only the 11+ minimum (`belowMinimumAge`). The spec's Failure Modes table (`docs/specs/2026-05-18-...md:388`) claims "API rejects via existing 18+ rule on `createProfileWithLimitCheck()`" — that rule does not exist. So **the client gate added in [HIGH-A3] is the ONLY barrier** to a 13-year-old creating themselves as `isOwner=true` with a child linked underneath. This also means [HIGH-A3] is not redundant defense-in-depth; it is the entire defense. Flagged as an open question for the coordinator (server-side adult-owner check should probably exist too, but that's an API change outside this plan's scope).
- **[MEDIUM-A3]** Plan asserts `ProfileProvider` at `profile.ts:154-174` "auto-activates the first profile the moment `profiles.length > 0`." The effect ACTUALLY only fires when `!savedExists` (line 158) — i.e. when there is no saved ID, or the saved ID doesn't match any profile in `profiles`. The Round-2 framing reads as if activation is unconditional. Net effect on the wizard is unchanged (after signup the user has no saved `ACTIVE_PROFILE_KEY`, so `!savedExists` is true, so auto-activate DOES fire) — but the wording is sloppy and could mislead the implementer. Corrected inline.
- **[MEDIUM-B3]** `simulateProfileCreated` test harness contract documented in Task 11 (see [HIGH-B3]). Without this annotation an implementer will spend time grepping for a helper that does not exist.
- **[MEDIUM-C3]** No telemetry plan. Per CLAUDE.md `safeSend()` convention for non-core dispatches: this feature should fire funnel events at `preview_intent_seen`, `preview_intent_selected`, `preview_topic_submitted`, `preview_value_prop_seen`, `preview_signup_started`, `preview_signup_completed`, `save_wizard_step_1`, `save_wizard_step_2`, `save_wizard_step_3`, `save_wizard_completed`. Currently the plan ships zero analytics. Without funnel events the feature is unmeasurable — exactly the "wired-but-untriggered" failure mode CLAUDE.md warns against. Added a small section in Task 15 noting this as deferred-to-follow-up (since the codebase's analytics conventions aren't grounded in this plan) but it MUST be on the post-merge punch list.
- **[MEDIUM-D3]** Tab-shape handoff in Task 14 sits on a hardcoded `'/(app)/home'` route for the parent path AND for the `target === 'self'` solo path. Per CLAUDE.md profile-shapes table: solo owner (`target='self'`, no children) → learner tab shape, lands on `LearnerScreen`; parent with linked children (`target='child'` or `target='both'`) → guardian tab shape, lands on `ParentHomeScreen`. Both shapes appear to mount under `/(app)/home` (home tab is route `home`, presentation switches by `resolveTabShape` — see `_layout.tsx:1410`), so `/(app)/home` IS the correct destination for both. Confirmed not a bug — but the Task 14 test only asserts `replace` was called with `expect.stringMatching(/^\/\(app\)\//)` which is loose. Tightened the assertion inline.
- **[MEDIUM-E3]** Spec Failure Modes line 388 says "no client-side pre-validation in v0" — this is in tension with [HIGH-A3]. The spec's framing assumed a server-side 18+ rule existed; since [HIGH-D3] shows it does not, the client gate is now the only barrier. Coordinator should decide: (a) ship client gate AND open a server-side ticket, or (b) skip the client gate and accept the risk for v0 since stores are blocked / no live users (per `project_pre_launch_no_users.md`). The plan now ships option (a); flagged for explicit confirmation. **[OPT-C] RESOLVED:** Coordinator chose defense-in-depth — client gate ([HIGH-A3], in Task 13) AND server rule (new Task 13b), both gated by independent `ADULT_OWNER_GATE_ENABLED` flag (mobile + API). The spec's "no client-side pre-validation" line is intentionally overridden by this decision. Follow-up: the spec doc (`docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md:388`) should be amended in a separate PR to remove that line; spec amendment is out of scope for this plan-doc update.
- **[MEDIUM-F3]** Failure Modes table in the plan (lines 2217-2223) does NOT have a row for "underage user attempts to save as owner with child" even after Round 2 named the [HIGH-B2] gate. Added a row inline.
- **[MEDIUM-G3]** Task 15 AC coverage table maps 16 ACs and matches the spec's 16-AC count (verified by re-reading `docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md:359-376`). No gap there. Confirmed.
- **[LOW-A3]** Existing project canonical SecureStore API is `getItemAsync` / `setItemAsync` / `deleteItemAsync` (Async-suffixed), verified at `apps/mobile/src/lib/secure-storage.ts:80,94,112`. Task 3's module already uses the correct API. Confirmed.
- **[LOW-B3]** `useProfiles` cache key IS `['profiles', userId]` (verified `apps/mobile/src/hooks/use-profiles.ts:28`). Round-1 claim accurate. Confirmed.
- **[LOW-C3]** `pending-auth-redirect.ts:17` IS an in-memory variable (`let pendingAuthRedirectRecord: PendingAuthRedirectRecord | null = null`) — Round-2 `[MEDIUM-A2]` claim accurate. Confirmed.

---

## Adversarial Review Round 2 — Findings Applied (2026-05-19)

Second review pass after Round 1 missed two structural bugs in how the wizard mounts. Inline `[ID2]` markers below cite Round-2 findings.

- **[CRITICAL-A2]** Wizard reshaped from a nested route (`(app)/preview/save.tsx`) into an **inline gate component** co-located inside `(app)/_layout.tsx`, mirroring the existing `CreateProfileGate` (line 640). Reasons:
  - `(app)/_layout.tsx:1665-1671` no-profile branch returns `<FeedbackProvider><CreateProfileGate /></FeedbackProvider>` — it does NOT render `<Slot>`/`<Tabs>`, so any nested route under `(app)/preview/*` cannot mount. The Round-1 `<Redirect>` plan never had a destination to land on.
  - `ProfileProvider` at `profile.ts:154-174` auto-activates the first profile the moment `profiles.length > 0`. With the wizard as a route, the Step-2 POST would cause `!activeProfile` to flip to falsy mid-wizard, ejecting the user before Step 3 renders. As an inline gate the wizard outlives that transition.
- **[CRITICAL-B2]** The auto-cleanup effect (`if (activeProfile && profiles.length > 0) clearPreviewState()`) is REMOVED. It would wipe `createdOwnerProfileId` between the owner POST and the child POST, destroying the [HIGH-4] resume guard. Cleanup now relies on (a) TTL, (b) sign-out-cleanup, (c) the wizard's explicit `clearPreviewState()` on Step-3 success.
- **[HIGH-A2]** Wizard takes an `onComplete` callback from the layout. On final-step success the wizard calls `onComplete()`, which flips a local layout state (`wizardDone`) so the gate falls through to normal Tabs even though `previewProbeState` is still cached as `'present'`. The gate ordering is now: probe-loading → wizard branch (`previewProbeState === 'present' && !wizardDone`) → `!activeProfile` → consent gates → Tabs.
- **[HIGH-B2]** Adult-age gate added in Task 13: when `needsChild` (target ∈ {`child`, `both`}), the parent's birth-year input must put them at 18+ before Continue enables. Without this, a 13-year-old could complete the wizard as an `isOwner=true` profile with a child linked underneath (server allows 11+ as the floor; it does not enforce "parents must be adults").
- **[HIGH-C2]** `sign-up-preview-redirect.ts` helper + `sign-up.tsx` edit DROPPED. With CRITICAL-A2's inline architecture, the gate handles the post-signup branch directly — no pending-auth-redirect plumbing needed. Cleaner failure mode (no race between `setActive` and the redirect-replay window in `(app)/_layout.tsx:1423-1490`). [MEDIUM-A2] follows: the Round-1 HIGH-1 description of pending-auth-redirect as web-only was inaccurate (line 17 has an in-memory fallback that works on native too), but the helper is removed entirely so the framing is moot.
- **[MEDIUM-B2]** Deferred-sweep footnote in Task 17 expanded: `use-profiles.ts:65` (`useUpdateProfileName.onSuccess`) is the second bare-key-invalidation site alongside `create-profile.tsx:184`. Both are deferred sweeps, not blockers for this PR.
- **[MEDIUM-C2]** `bothPriority` is hardcoded to `'child_first'` in Task 7 with no UI to flip it. Spec re-read required to confirm intent; documented as deferred-to-v0.1 if the spec assumes child-first only.
- **[MEDIUM-D2]** Task 11 test no longer does `(FEATURE_FLAGS as any).X = false` — replaced with the `jest.doMock` + `jest.isolateModules` pattern already mandated by [HIGH-3] in Task 5.

---

## Adversarial Review Round 1 — Findings Applied (2026-05-19)

Round-1 findings (folded in earlier in the day). Inline `[ID]` markers below cite which finding drove each change.

- **[CRITICAL-1]** `forChild` body field removed — `profileCreateSchema` (`packages/schemas/src/profiles.ts:44`) does not accept it. Owner-vs-child is determined server-side by call order (`createProfileWithLimitCheck` in `apps/api/src/services/profile.ts:253`). See Task 13.
- **[CRITICAL-2]** Manual `<Tabs.Screen name="preview/save">` registration dropped — `(app)/_layout.tsx:1715-1768` already auto-hides any route not in `visibleTabs`. The wizard route is added to `FULL_SCREEN_ROUTES` so the tab bar disappears while it is mounted. See Task 11.
- **[CRITICAL-3]** Wizard now redirects home when `getPreviewState()` resolves null instead of rendering blank. See Task 12 + Failure Modes addendum.
- **[CRITICAL-4]** `isFamilyCapableProfile` no longer calls `computeAgeBracket` (CLAUDE.md forbids it for feature gating). It is now `isOwner + ≥1 linked non-owner`, identical to existing `isGuardianProfile`. The new name exists only for sibling-spec readability. See Task 2.
- **[HIGH-1]** Task 10 re-framed: the `(app)/_layout.tsx` gate is the source of truth on native; `rememberPendingAuthRedirect` is a web-only flash-avoidance optimization (`pending-auth-redirect.ts:19-27` is `window.sessionStorage`-only).
- **[HIGH-2]** Single call site for `rememberPreviewRedirectIfNeeded` — only inside `activateCreatedSession` before `setActive` (covers both email-code and OAuth paths). The post-`prepareEmailAddressVerification` call has been removed.
- **[HIGH-3]** Task 5 now begins with a discovery step to find the canonical flag-flip test pattern. No `jest.spyOn(...,'get')` against the `as const` literal; no `(FEATURE_FLAGS as any).X =` mutation.
- **[HIGH-4]** Created owner profile id is persisted to the preview-state record so a wizard remount mid-flight does not create a duplicate profile. See Task 13.
- **[MEDIUM-1]** Grep-based navigation-discipline test dropped; replaced with a behavioral assertion folded into existing tests. See Task 15.
- **[MEDIUM-2]** `sign-up-preview-redirect` helper moved out of `app/(auth)/` to `src/lib/` to avoid Expo Router pollution.
- **[MEDIUM-3]** Line-number references in Task 11 replaced with landmark anchors (`if (!activeProfile)`, `<Tabs screenOptions=...>`).
- **[MEDIUM-4]** `keychainAccessible` option imported directly from `expo-secure-store`; no `as never` cast.
- **[MEDIUM-5]** Topic max lowered from 200 → 80 chars (single-line topic) with a comment explaining the leak-surface rationale.
- **[MEDIUM-6]** Predicate invalidation made the project standard for `['profiles']` cache; a footnote in Task 17 calls out the `create-profile.tsx` site as a deferred sweep.
- **[LOW-1]** `seedPreviewStateForTesting(state, staleMs)` helper added in Task 3, mirroring `seedPendingAuthRedirectForTesting`. Task 16 Flow 5 now uses it.
- **[LOW-2]** Local `state` variable in `value-prop.tsx` renamed to `previewState` to avoid module shadow.

---

## File Map

**New files:**

- `apps/mobile/src/lib/preview-onboarding-state.ts` — state module (in-memory singleton + SecureStore TTL). Also exports `seedPreviewStateForTesting` [LOW-1].
- `apps/mobile/src/lib/preview-onboarding-state.test.ts`
- `apps/mobile/src/app/preview/_layout.tsx` — stack layout for preview routes (hides tab bar by being outside `(app)/`).
- `apps/mobile/src/app/preview/index.tsx` — "Try MentoMate" landing CTA.
- `apps/mobile/src/app/preview/intent.tsx` — 4-option intent question.
- `apps/mobile/src/app/preview/intent.test.tsx`
- `apps/mobile/src/app/preview/topic.tsx` — topic capture.
- `apps/mobile/src/app/preview/topic.test.tsx`
- `apps/mobile/src/app/preview/value-prop.tsx` — static value-prop, learner|parent variant.
- `apps/mobile/src/app/preview/value-prop.test.tsx`

> [CRITICAL-A2] The post-signup save wizard is NOT a route file. It is an inline component (`SaveWizardGate`) defined inside `apps/mobile/src/app/(app)/_layout.tsx` — same pattern as the existing `CreateProfileGate` (line 640). Tests for it co-locate inside `(app)/_layout.test.tsx` (or extract to `save-wizard-gate.test.tsx` if the layout test file balloons). The previously-planned `(app)/preview/save.tsx`, `(app)/preview/_layout.tsx`, and `(app)/preview/save.test.tsx` are NOT created.

**Modified files:**

- `apps/mobile/src/lib/feature-flags.ts` — add `PREVIEW_ONBOARDING_ENABLED`.
- `apps/mobile/src/lib/profile.ts` — add `isFamilyCapableProfile()` (unconditional, shared with Study/Family v0).
- `apps/mobile/src/lib/profile.test.ts` — new test cases for `isFamilyCapableProfile()`.
- `apps/mobile/src/lib/sign-out-cleanup.ts` — append `'mentomate_preview_intent'` to `GLOBAL_KEYS`.
- `apps/mobile/src/lib/sign-out-cleanup.test.ts` — assert the new key is wiped.
- `apps/mobile/src/app/(auth)/sign-in.tsx` — render "Try MentoMate" CTA when flag on.
- `apps/mobile/src/app/(auth)/sign-in.test.tsx` (or co-located) — assert CTA rendering under both flag states.
- `apps/mobile/src/app/(auth)/_layout.tsx` — no edit. (Read-only verification step.)
- `apps/mobile/src/app/(app)/_layout.tsx` — (a) async preview-state probe, (b) inline `SaveWizardGate` component (CreateProfileGate-style), (c) gate ordering: probe-loading → wizard → no-profile → consent gates → Tabs. NO addition to `FULL_SCREEN_ROUTES` (no route to hide). NO `<Tabs.Screen>` registration. The auto-cleanup effect (`activeProfile && profiles.length > 0 → clearPreviewState`) is NOT added — it would destroy the [HIGH-4] resume guard [CRITICAL-B2].
- `apps/mobile/src/app/(app)/_layout.test.tsx` — preview-state branch tests + SaveWizardGate behavior tests.

> [HIGH-C2] **`sign-up.tsx` is NOT modified.** The Round-1 plan threaded `rememberPreviewRedirectIfNeeded()` into `activateCreatedSession`; with the inline-wizard architecture the gate handles the post-signup transition directly, so no pending-auth-redirect plumbing is needed for this feature. `sign-up-preview-redirect.ts` is not created. The line `import { rememberPreviewRedirectIfNeeded } from '../../lib/sign-up-preview-redirect';` is NEVER added.

**Read-only (no edits expected):**

- `apps/mobile/src/lib/pending-auth-redirect.ts` — NOT consumed by this feature. Round-1 framed it as web-only; Round-2 [MEDIUM-A2] notes that it has an in-memory native fallback at line 17, but neither path is wired here. With the inline-wizard architecture the gate replaces both.
- `apps/mobile/src/app/create-profile.tsx` — the save wizard's profile-basics step reuses the same fields conceptually but does not import the screen (it's a default-export route). Extract shared field components only if duplication grows past two callsites (YAGNI — start with inline form, refactor later if needed).

---

## Task 0: Session-Start Helper Spike — RESOLVED (dual landing, branch on target)

**Resolution (2026-05-19):** Landing branches on the wizard's existing `target` / `intent` flag — no new branching logic, no new scope beyond the session-helper extraction below.

- **`target = self` (solo adult OR any under-18 with own profile)** → **land in a session** for the saved `topicText`. Highest momentum; the actor at the device IS the learner. Requires a small session-start helper extraction (see Step 1).
- **`target = child` (adult parent, `needsChild = true`)** → **land on `/(app)/home`**. The parent has finished the wizard but no child profile is linked yet at this point in the flow; dropping them into a session would attach progress to the wrong profile. Home is where they orient and tap "Add child" next.
- **`target = both` with `bothPriority = self_first`** → treat as `self` (land in session for the parent themselves).
- **`target = both` with `bothPriority = child_first`** → treat as `child` (land on home).

**Why this beats a one-arm answer:**
- Conversion driver for solo/kid learners is the first-session moment — they typed in a topic, they want to do it now.
- Conversion driver for parents is "orient + hand off" — they need to see the app shell, find Add Child, and pre-vet what their kid will see. Forcing them into a session attached to the wrong profile undermines both.
- The wizard already collects this signal; landing just reads it.

**Files:**
- Read: `apps/mobile/src/app/(app)/home.tsx` (or whichever screen owns the "Start a new session" affordance)
- Read: `apps/mobile/src/hooks/use-create-session.ts` (or equivalent — discover via grep)

- [ ] **Step 1: Find every existing session-start entry point and decide the helper shape.**

Run from repo root:
```bash
grep -rn "sessions.\$post\|createSession\|startSession\|session-start" apps/mobile/src --include="*.ts" --include="*.tsx" -l
```
Open each hit. For each, note: (a) is it a hook/util or screen-local handler? (b) does it accept a topic string param? (c) does it `router.push` to the session route after success?

Decision rule:
- If a reusable hook (e.g., `useCreateSession`) already accepts a topic and navigates → use it directly in Task 14, no refactor needed.
- If the only call site is buried in a screen component → extract the minimum slice into `apps/mobile/src/hooks/use-create-session.ts` (or matching neighbour). Keep extraction scoped: accept `{ topicText }`, return `{ start(): Promise<{ sessionId: string } | { error: string }> }`. Do NOT pull unrelated logic out of the host screen.

This extraction only runs on the `self` branch — the `child` branch has no session-start call, so it is unaffected by whatever shape the helper takes.

- [ ] **Step 2: Record the helper path (or "inline hook reused as-is") in Task 14's spike-outcome line.**

Open this file and replace the line below in Task 14:

> **Spike outcome (resolved 2026-05-19):** Dual landing — `target=self` → session via helper at `<path>`, `target=child` → `/(app)/home`. See Task 0.

- [ ] **Step 3: Commit the spike decision (if helper path differs from what is recorded here).**

If Step 1 surfaced a helper path not yet captured in Task 14, update this file and run `/commit` — never raw `git commit`. If the existing recorded shape is accurate, no commit needed in Task 0; it folds into Task 14's commit.

No production code shipped in Task 0 — only doc updates and helper-path discovery. The helper extraction itself ships in Task 14.

---

## Task 1: Feature Flag

**Files:**
- Modify: `apps/mobile/src/lib/feature-flags.ts`
- Modify: `apps/api/src/config.ts` (or whichever module exports the typed `config` object — confirm via grep; G4 governance lock: only `config.ts` may touch raw `process.env` outside the small allowlist) [OPT-C]

- [ ] **Step 1: Add the mobile flags.**

Edit `apps/mobile/src/lib/feature-flags.ts`:

```ts
export const FEATURE_FLAGS = {
  COACH_BAND_ENABLED: true,
  MIC_IN_PILL_ENABLED: true,
  I18N_ENABLED: true,
  // Pre-signup intent + post-signup save wizard.
  // Spec: docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md
  // When false:
  //   - sign-in.tsx: "Try MentoMate" CTA hidden, /preview/* unreachable via UI.
  //   - (app)/_layout.tsx: no-profile gate ignores preview state, falls through to CreateProfileGate.
  //   - (app)/_layout.tsx: preview/save tab entry not registered (defensive; route is unreachable anyway).
  // isFamilyCapableProfile() and the mentomate_preview_intent entry in sign-out-cleanup ship UNCONDITIONALLY.
  PREVIEW_ONBOARDING_ENABLED: true,

  // [OPT-C] Independent adult-owner gate flag — toggles the 18+ requirement
  // for a parent creating a child profile. Defense-in-depth: paired with the
  // API-side ADULT_OWNER_GATE_ENABLED config (apps/api/src/config.ts).
  //
  // When false:
  //   - save.tsx ProfileBasicsStep: the adult-age UI gate is bypassed.
  //     `canSubmit` falls back to today's behaviour (only the existing
  //     display-name + valid-4-digit-year checks; no adult-age check).
  //     The `save-basics-adult-required` warning view is not rendered.
  //   - With this flag OFF and the API flag also OFF, the system is
  //     identical to today (no adult-age constraint exists anywhere).
  //
  // This flag is INDEPENDENT of PREVIEW_ONBOARDING_ENABLED. The preview
  // feature can ship while the adult-owner gate stays off (or vice versa).
  ADULT_OWNER_GATE_ENABLED: true,
} as const;
```

- [ ] **Step 2: Add the API config entry.** [OPT-C]

Edit `apps/api/src/config.ts` (the canonical typed-config module — G4 governance pins this file; per `.archon/governance-constraints.md:94` it is the only place raw `process.env` may be read outside the small allowlist). Follow the existing patterns in that file (the implementer reads it to match the zod-parsed schema and `config.x` access style):

1. Declare a new field on the config schema, e.g. `ADULT_OWNER_GATE_ENABLED: z.coerce.boolean().default(true)`.
2. Parse it in the existing `init`/factory.
3. Expose it as `config.ADULT_OWNER_GATE_ENABLED` (or whatever the existing camelCase/SCREAMING_SNAKE convention is — match the surrounding entries; do not invent a new style).

Doppler note: this is a non-secret config value but follows the same "all environment values flow through Doppler" convention per CLAUDE.md (`doppler run -c <env>` injects it into `process.env` at start-up; the typed config reads from there). No new secret to add — just a boolean flag with a sensible default so it works locally without explicit configuration.

**Default:** `true` (gate enforced by default in all environments).

**When false:** Task 13b's server-side adult-owner rule is skipped entirely. The route falls through to today's behaviour (only the existing 11+ minimum-age check at `apps/api/src/services/profile.ts:184-191`).

**Combination matrix:**

| Mobile flag | API flag | Behaviour |
|---|---|---|
| ON | ON | Defense-in-depth. Client gate is pre-flight UX; server is the actual barrier. |
| ON | OFF | Client gate enforced; server passes through. Acceptable if API has a hotfix to disable but mobile build is in flight. |
| OFF | ON | Client allows underage submission; server rejects with 403 `ADULT_OWNER_REQUIRED` (surfaces as a toast — see Task 13b). Useful for testing the server rule from a non-gated client. |
| OFF | OFF | **Today's behaviour.** No adult-age constraint anywhere. Acceptable only when the gate has been deliberately turned off (e.g. emergency rollback). |

- [ ] **Step 3: Typecheck.**

Run:
```bash
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx run api:typecheck
```
Expected: passes.

- [ ] **Step 4: Commit.**

Use `/commit` (do NOT use raw `git commit`). Suggested message:
```
feat: add PREVIEW_ONBOARDING_ENABLED + ADULT_OWNER_GATE_ENABLED feature flags

Spec: docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md
Mobile flags in feature-flags.ts; API flag in config.ts (G4 allowlist).
ADULT_OWNER_GATE_ENABLED is independent of PREVIEW_ONBOARDING_ENABLED —
toggling it OFF restores today's behaviour (no adult-age constraint). [OPT-C]
```

---

## Task 2: `isFamilyCapableProfile()` Helper (UNCONDITIONAL)

**Files:**
- Modify: `apps/mobile/src/lib/profile.ts`
- Modify: `apps/mobile/src/lib/profile.test.ts` (or create if absent)

> CRITICAL: This helper ships independent of `PREVIEW_ONBOARDING_ENABLED`. The sibling Study/Family v0 spec imports it. Do not wrap any callsite in a flag check.

> [CRITICAL-4] **Age gating REMOVED.** CLAUDE.md (Profile Shapes section) forbids using `computeAgeBracket` for feature gating. The shape of this predicate is therefore identical to the existing `isGuardianProfile` in `profile.ts:30` — `isOwner` + at least one linked non-owner. The new name exists ONLY so the sibling Study/Family v0 spec can import a name that matches its terminology. Adult-only affordances (e.g., "add child" button) keep their own checks at their own call sites; do NOT fold age gating into this predicate.

- [ ] **Step 1: Write failing tests.**

Append to `apps/mobile/src/lib/profile.test.ts` (or create the file with the import boilerplate matching neighboring tests in `apps/mobile/src/lib/`):

```ts
import { isFamilyCapableProfile } from './profile';
import type { Profile } from '@eduagent/schemas';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    displayName: 'Test',
    birthYear: 1985,
    isOwner: true,
    consentStatus: 'CONSENTED',
    createdAt: '2026-01-01T00:00:00.000Z',
    linkCreatedAt: null,
    parentEmail: null,
    // Add any other required Profile fields by reading packages/schemas/src/profiles.ts.
    ...overrides,
  } as Profile;
}

describe('isFamilyCapableProfile', () => {
  const owner = makeProfile({ id: 'p1', isOwner: true, birthYear: 1985 });
  const child = makeProfile({ id: 'p2', isOwner: false, birthYear: 2015 });

  it('returns true when owner has at least one linked non-owner', () => {
    expect(isFamilyCapableProfile(owner, [owner, child])).toBe(true);
  });

  it('returns false when owner has no linked non-owner', () => {
    expect(isFamilyCapableProfile(owner, [owner])).toBe(false);
  });

  it('returns false for non-owner active profile', () => {
    expect(isFamilyCapableProfile(child, [owner, child])).toBe(false);
  });

  it('returns false when activeProfile is null', () => {
    expect(isFamilyCapableProfile(null, [owner, child])).toBe(false);
  });

  // [CRITICAL-4] Explicit anti-test: this predicate must NOT consider age.
  // Age-based gating ("add child" button visibility) lives at its own
  // call sites, never inside the family-capable check.
  it('returns true for a minor owner with a linked non-owner (age is NOT part of this predicate)', () => {
    const minorOwner = makeProfile({ id: 'p1', isOwner: true, birthYear: 2015 });
    expect(isFamilyCapableProfile(minorOwner, [minorOwner, child])).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests; confirm they fail (function not exported).**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/profile.test.ts --no-coverage
```
Expected: FAIL with "isFamilyCapableProfile is not a function" / undefined import.

- [ ] **Step 3: Implement.**

Open `apps/mobile/src/lib/profile.ts`. Add the helper next to `isGuardianProfile()`:

```ts
/**
 * Family-capable profile predicate. Shared verbatim with Study/Family v0 spec.
 * True iff active profile is an owner with at least one linked non-owner.
 *
 * [CRITICAL-4] Deliberately NO age check — CLAUDE.md forbids using
 * computeAgeBracket() for feature gating. Adult-only affordances (e.g.
 * "Add child") keep their own age checks at their own call sites.
 *
 * Shape is identical to isGuardianProfile() above; the alternate name
 * exists so sibling-spec readers find the term they expect.
 *
 * Spec: docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md §Implementation step 1
 * Sibling: docs/specs/2026-05-19-study-and-family-mode-navigation-v0.md §Implementation step 1
 */
export function isFamilyCapableProfile(
  activeProfile: Profile | null | undefined,
  profiles: ReadonlyArray<Profile>,
): boolean {
  if (!activeProfile) return false;
  if (!activeProfile.isOwner) return false;
  return profiles.some((p) => p.id !== activeProfile.id && !p.isOwner);
}
```

> No `computeAgeBracket` import needed.

- [ ] **Step 4: Run tests; confirm pass.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/profile.test.ts --no-coverage
```
Expected: 5 tests pass (including the explicit "age is NOT part of this predicate" anti-test).

- [ ] **Step 5: Commit via `/commit`.**

Suggested message:
```
feat(mobile): add isFamilyCapableProfile shared capability predicate

Shared with study-and-family-mode-navigation-v0 spec.
Owner + ≥1 linked non-owner = family-capable.
No age check — that gates "Add child" affordance only, at its own
call site, per CLAUDE.md "never for feature gating" rule.
```

---

## Task 3: Preview Onboarding State Module

**Files:**
- Create: `apps/mobile/src/lib/preview-onboarding-state.ts`
- Create: `apps/mobile/src/lib/preview-onboarding-state.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `apps/mobile/src/lib/preview-onboarding-state.test.ts`:

```ts
import * as SecureStore from './secure-storage';
import {
  getPreviewState,
  setPreviewState,
  clearPreviewState,
  PREVIEW_INTENT_KEY,
  PREVIEW_TTL_MS,
  type PreviewOnboardingStateV0,
} from './preview-onboarding-state';

describe('preview-onboarding-state', () => {
  beforeEach(async () => {
    await SecureStore.deleteItemAsync(PREVIEW_INTENT_KEY).catch(() => undefined);
    clearPreviewState();
  });

  const baseState: PreviewOnboardingStateV0 = {
    intent: 'self',
    path: 'learner_value_prop',
    topicText: 'algebra basics',
    createdAt: new Date().toISOString(),
  };

  it('returns null when no state set', async () => {
    expect(await getPreviewState()).toBeNull();
  });

  it('writes in-memory and to SecureStore', async () => {
    await setPreviewState(baseState);
    expect(await getPreviewState()).toEqual(baseState);
    const raw = await SecureStore.getItemAsync(PREVIEW_INTENT_KEY);
    expect(raw).not.toBeNull();
  });

  it('hydrates from SecureStore when memory empty (cold-start)', async () => {
    await setPreviewState(baseState);
    clearPreviewState(); // simulate process restart: memory wiped, key intact

    // Re-write the key directly to simulate the cold-start path
    await SecureStore.setItemAsync(
      PREVIEW_INTENT_KEY,
      JSON.stringify({ ...baseState, savedAt: Date.now() }),
    );

    const result = await getPreviewState();
    expect(result?.intent).toBe('self');
  });

  it('treats expired key as absent', async () => {
    const stale = { ...baseState, savedAt: Date.now() - (PREVIEW_TTL_MS + 1000) };
    await SecureStore.setItemAsync(PREVIEW_INTENT_KEY, JSON.stringify(stale));
    clearPreviewState();

    expect(await getPreviewState()).toBeNull();
  });

  it('clearPreviewState wipes memory AND SecureStore', async () => {
    await setPreviewState(baseState);
    await clearPreviewState();

    expect(await getPreviewState()).toBeNull();
    expect(await SecureStore.getItemAsync(PREVIEW_INTENT_KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test; confirm fail (module missing).**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/preview-onboarding-state.test.ts --no-coverage
```
Expected: FAIL with module resolution error.

- [ ] **Step 3: Implement the module.**

Create `apps/mobile/src/lib/preview-onboarding-state.ts`:

```ts
import * as SecureStore from './secure-storage';
// [MEDIUM-4] Import the keychain-accessible constant directly from the
// native module. The wrapper passes options through unchanged
// (secure-storage.ts:106), so a typed value works without `as never` casts.
import { WHEN_UNLOCKED_THIS_DEVICE_ONLY } from 'expo-secure-store';

export const PREVIEW_INTENT_KEY = 'mentomate_preview_intent';
export const PREVIEW_TTL_MS = 60 * 60_000; // 1 hour

export type PreviewIntent = 'self' | 'child' | 'both' | 'not_sure';
export type PreviewPath = 'learner_value_prop' | 'parent_value_prop';
export type SaveTarget = 'self' | 'child' | 'both';

export interface PreviewOnboardingStateV0 {
  intent: PreviewIntent;
  path: PreviewPath;
  topicText?: string;
  bothPriority?: 'child_first' | 'self_first';
  preferredSaveTarget?: SaveTarget;
  createdAt: string;
  // [HIGH-4] Set inside the save wizard after the owner POST succeeds, so a
  // wizard remount mid-flight (refresh, OOM-kill, app background) can resume
  // without double-creating profiles. Cleared by clearPreviewState() on
  // wizard completion or sign-out.
  createdOwnerProfileId?: string;
}

interface StoredRecord extends PreviewOnboardingStateV0 {
  savedAt: number;
}

let memoryState: PreviewOnboardingStateV0 | null = null;

function isFresh(savedAt: number): boolean {
  return Date.now() - savedAt < PREVIEW_TTL_MS;
}

export async function getPreviewState(): Promise<PreviewOnboardingStateV0 | null> {
  if (memoryState) return memoryState;

  try {
    const raw = await SecureStore.getItemAsync(PREVIEW_INTENT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredRecord>;
    if (
      typeof parsed.savedAt !== 'number' ||
      typeof parsed.intent !== 'string' ||
      typeof parsed.path !== 'string' ||
      typeof parsed.createdAt !== 'string'
    ) {
      await SecureStore.deleteItemAsync(PREVIEW_INTENT_KEY).catch(() => undefined);
      return null;
    }

    if (!isFresh(parsed.savedAt)) {
      await SecureStore.deleteItemAsync(PREVIEW_INTENT_KEY).catch(() => undefined);
      return null;
    }

    const { savedAt: _ignored, ...state } = parsed as StoredRecord;
    memoryState = state as PreviewOnboardingStateV0;
    return memoryState;
  } catch {
    return null;
  }
}

export async function setPreviewState(state: PreviewOnboardingStateV0): Promise<void> {
  memoryState = state;
  const record: StoredRecord = { ...state, savedAt: Date.now() };
  try {
    // [SEC] WHEN_UNLOCKED_THIS_DEVICE_ONLY excludes from iCloud Keychain sync
    // and device-to-device backups; bounds the topic-text leak surface to
    // the originating device. Spec §Preview State (Minimal).
    await SecureStore.setItemAsync(PREVIEW_INTENT_KEY, JSON.stringify(record), {
      keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // Non-fatal; in-memory state still survives the warm session.
  }
}

export async function clearPreviewState(): Promise<void> {
  memoryState = null;
  try {
    await SecureStore.deleteItemAsync(PREVIEW_INTENT_KEY);
  } catch {
    // Non-fatal.
  }
}

/**
 * [LOW-1] Dev/E2E only. Writes a preview-state record whose `savedAt` is
 * artificially backdated by `staleMs` milliseconds, so Maestro flows can
 * simulate a TTL-expired record without waiting an hour.
 *
 * Mirrors `seedPendingAuthRedirectForTesting` (pending-auth-redirect.ts:115).
 * Throws in production builds or when EXPO_PUBLIC_E2E !== 'true'.
 */
export async function seedPreviewStateForTesting(
  state: PreviewOnboardingStateV0,
  staleMs: number,
): Promise<void> {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.EXPO_PUBLIC_E2E !== 'true'
  ) {
    throw new Error('seedPreviewStateForTesting is dev-only');
  }
  memoryState = state;
  const record: StoredRecord = { ...state, savedAt: Date.now() - staleMs };
  await SecureStore.setItemAsync(PREVIEW_INTENT_KEY, JSON.stringify(record), {
    keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
```

- [ ] **Step 4: Run tests; confirm pass.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/preview-onboarding-state.test.ts --no-coverage
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 4: Register Preview Key in Sign-Out Cleanup

**Files:**
- Modify: `apps/mobile/src/lib/sign-out-cleanup.ts`
- Modify: `apps/mobile/src/lib/sign-out-cleanup.test.ts` (or co-located)

> This task ships UNCONDITIONALLY. Cleanup is harmless when no key exists, and keeping the entry registered means a future flag flip-on never leaves residue.

- [ ] **Step 1: Write failing test.**

Add to `apps/mobile/src/lib/sign-out-cleanup.test.ts` (or wherever the cleanup tests live — find via `grep -l "clearProfileSecureStorageOnSignOut" apps/mobile/src/lib`):

```ts
it('clears mentomate_preview_intent on sign-out', async () => {
  const spy = jest.spyOn(SecureStore, 'deleteItemAsync').mockResolvedValue(undefined);
  await clearProfileSecureStorageOnSignOut([]);
  expect(spy).toHaveBeenCalledWith('mentomate_preview_intent');
});
```

- [ ] **Step 2: Run test; confirm fail.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/sign-out-cleanup.ts --no-coverage
```
Expected: FAIL (key not in `GLOBAL_KEYS`).

- [ ] **Step 3: Edit `sign-out-cleanup.ts`.**

In `apps/mobile/src/lib/sign-out-cleanup.ts`, append to `GLOBAL_KEYS` (currently lines 79-88):

```ts
  'byok-waitlist-joined',
  // preview-onboarding-state.ts — pre-signup intent + topic (1h TTL).
  // Spec: docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md
  'mentomate_preview_intent',
];
```

- [ ] **Step 4: Run cleanup test + the registry meta-test.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/sign-out-cleanup.ts src/lib/preview-onboarding-state.ts --no-coverage
```
Expected: pass. The companion meta-test (`sign-out-cleanup-registry.test.ts`, referenced at `sign-out-cleanup.ts:27`) must also pass — run:

```bash
cd apps/mobile && pnpm exec jest sign-out-cleanup-registry --no-coverage
```
Expected: pass (the new SecureStore writer is now registered).

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 5: Sign-In CTA Gate

**Files:**
- Modify: `apps/mobile/src/app/(auth)/sign-in.tsx`
- Modify or create: `apps/mobile/src/app/(auth)/sign-in.test.tsx`

- [ ] **Step 0 (Spike, BLOCKER): Discover the canonical flag-flip test pattern.** [HIGH-3]

`FEATURE_FLAGS` is exported `as const` (`feature-flags.ts:1`) — a plain literal with no getter. So `jest.spyOn(FEATURE_FLAGS, 'X', 'get')` THROWS, and `(FEATURE_FLAGS as any).X = false` mutates the global module export and leaks across parallel workers. Neither is acceptable.

Run:
```bash
grep -rn "FEATURE_FLAGS" apps/mobile/src --include "*.test.ts" --include "*.test.tsx" -l
```
Open each file. Identify the canonical pattern. There are three plausible answers; record which one applies before writing tests:

1. **`jest.doMock` + `jest.isolateModules`** — re-mocks the module per test, scoped via `isolateModules`. Cleanest; survives parallel workers.
2. **Top-of-file `jest.mock('../../lib/feature-flags', () => ({...}))`** — module-wide override; one flag value per test file.
3. **No existing pattern** — then introduce option (1) and document it in the plan.

Whichever applies, REPLACE the test sketch below before running it.

- [ ] **Step 1: Write failing test using the canonical pattern.**

Sketch (option 1 — `jest.doMock` + `isolateModules`):

```tsx
import { render, screen } from '@testing-library/react-native';

describe('SignInScreen — Try MentoMate CTA', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('renders the Try MentoMate CTA when flag is on', () => {
    jest.isolateModules(() => {
      jest.doMock('../../lib/feature-flags', () => ({
        FEATURE_FLAGS: {
          COACH_BAND_ENABLED: true,
          MIC_IN_PILL_ENABLED: true,
          I18N_ENABLED: true,
          PREVIEW_ONBOARDING_ENABLED: true,
        },
      }));
      const SignInScreen = require('./sign-in').default;
      render(<SignInScreen />);
      expect(screen.getByTestId('try-mentomate-cta')).toBeTruthy();
    });
  });

  it('hides the CTA when flag is off', () => {
    jest.isolateModules(() => {
      jest.doMock('../../lib/feature-flags', () => ({
        FEATURE_FLAGS: {
          COACH_BAND_ENABLED: true,
          MIC_IN_PILL_ENABLED: true,
          I18N_ENABLED: true,
          PREVIEW_ONBOARDING_ENABLED: false,
        },
      }));
      const SignInScreen = require('./sign-in').default;
      render(<SignInScreen />);
      expect(screen.queryByTestId('try-mentomate-cta')).toBeNull();
    });
  });
});
```

> If the spike found option (2) instead, mirror it. Do NOT invent new patterns — consistency with the rest of the test suite matters more than elegance.

- [ ] **Step 2: Run test; confirm fail.**

- [ ] **Step 3: Edit `sign-in.tsx`.**

Add import near the existing ones:

```tsx
import { FEATURE_FLAGS } from '../../lib/feature-flags';
```

Below the existing sign-in form (find the JSX in `sign-in.tsx` after primary form rendering — look for the section that renders the SSO buttons; the CTA goes just below), insert:

```tsx
{FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED && (
  <View className="w-full mt-6 pt-6 border-t border-border">
    <Text className="text-body-sm text-text-secondary text-center mb-3">
      New here?
    </Text>
    <Pressable
      onPress={() => router.push('/preview')}
      className="bg-surface rounded-button py-3.5 px-8 items-center w-full"
      testID="try-mentomate-cta"
      accessibilityRole="button"
      accessibilityLabel="Try MentoMate"
    >
      <Text className="text-body font-semibold text-primary">
        Try MentoMate
      </Text>
    </Pressable>
  </View>
)}
```

(Adjust `Pressable` / `View` / `Text` imports — they likely already exist in sign-in.tsx.)

- [ ] **Step 4: Run tests; confirm pass.**

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 6: Preview Stack Layout + Landing

**Files:**
- Create: `apps/mobile/src/app/preview/_layout.tsx`
- Create: `apps/mobile/src/app/preview/index.tsx`

> Routes under `preview/*` are outside `(app)/`, so they render full-screen without the tab bar by default. The layout exists only to wrap the stack with theme tokens / safe-area handling consistent with other unauthenticated screens.

- [ ] **Step 1: Create `_layout.tsx`.**

```tsx
import { Stack } from 'expo-router';

export default function PreviewLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: Create `index.tsx` landing.**

```tsx
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MentomateLogo } from '../../components/MentomateLogo';

export default function PreviewLandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="preview-landing"
    >
      <MentomateLogo size={96} />
      <Text className="text-h1 font-bold text-text-primary mt-8 mb-3 text-center">
        Try MentoMate
      </Text>
      <Text className="text-body text-text-secondary mb-10 text-center">
        See how it works — no sign-up needed yet.
      </Text>
      <Pressable
        onPress={() => router.push('/preview/intent')}
        className="bg-primary rounded-button py-3.5 px-10 items-center w-full"
        testID="preview-landing-continue"
        accessibilityRole="button"
        accessibilityLabel="Continue"
      >
        <Text className="text-body font-semibold text-text-inverse">
          Continue
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 3: Typecheck.**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit via `/commit`.**

---

## Task 7: Intent Screen

**Files:**
- Create: `apps/mobile/src/app/preview/intent.tsx`
- Create: `apps/mobile/src/app/preview/intent.test.tsx`

- [ ] **Step 1: Write failing test.**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import IntentScreen from './intent';
import * as state from '../../lib/preview-onboarding-state';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

describe('Preview IntentScreen', () => {
  const push = jest.fn();
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push });
    push.mockReset();
    jest.spyOn(state, 'setPreviewState').mockResolvedValue();
  });

  it('routes Me → topic with intent self', async () => {
    render(<IntentScreen />);
    fireEvent.press(screen.getByTestId('intent-self'));
    await Promise.resolve();
    expect(state.setPreviewState).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'self', path: 'learner_value_prop' }),
    );
    expect(push).toHaveBeenCalledWith('/preview/topic');
  });

  it('routes My child → value-prop parent variant', async () => {
    render(<IntentScreen />);
    fireEvent.press(screen.getByTestId('intent-child'));
    await Promise.resolve();
    expect(state.setPreviewState).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'child', path: 'parent_value_prop' }),
    );
    expect(push).toHaveBeenCalledWith({
      pathname: '/preview/value-prop',
      params: { variant: 'parent' },
    });
  });

  it('routes Both → topic (child-first default recorded)', async () => {
    render(<IntentScreen />);
    fireEvent.press(screen.getByTestId('intent-both'));
    await Promise.resolve();
    expect(state.setPreviewState).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'both',
        bothPriority: 'child_first',
        path: 'parent_value_prop',
      }),
    );
    expect(push).toHaveBeenCalledWith({
      pathname: '/preview/value-prop',
      params: { variant: 'parent' },
    });
  });

  it('routes Not sure → topic (lesson fork) with intent not_sure', async () => {
    render(<IntentScreen />);
    fireEvent.press(screen.getByTestId('intent-not-sure'));
    await Promise.resolve();
    expect(state.setPreviewState).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'not_sure' }),
    );
    expect(push).toHaveBeenCalledWith('/preview/topic');
  });
});
```

> The Not-Sure routing in the spec has a low-commitment fork ("Try a quick lesson" vs "See how parent setup works"). v0 default: route to topic (lesson fork). If product wants the explicit fork screen, add it as a follow-up — recording the intent is what matters for AC 1.

- [ ] **Step 2: Run; confirm fail.**

- [ ] **Step 3: Implement `intent.tsx`.**

```tsx
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setPreviewState, type PreviewIntent } from '../../lib/preview-onboarding-state';

interface Option {
  intent: PreviewIntent;
  label: string;
  description: string;
  testID: string;
}

const OPTIONS: ReadonlyArray<Option> = [
  { intent: 'self', label: 'Me', description: "I'm setting this up for myself.", testID: 'intent-self' },
  { intent: 'child', label: 'My child', description: 'I want to help my child.', testID: 'intent-child' },
  { intent: 'both', label: 'Both', description: 'For me and my child.', testID: 'intent-both' },
  { intent: 'not_sure', label: 'Not sure', description: "Show me how it works first.", testID: 'intent-not-sure' },
];

export default function PreviewIntentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const onSelect = async (intent: PreviewIntent) => {
    const createdAt = new Date().toISOString();

    if (intent === 'self') {
      await setPreviewState({ intent: 'self', path: 'learner_value_prop', createdAt });
      router.push('/preview/topic');
      return;
    }
    if (intent === 'child') {
      await setPreviewState({ intent: 'child', path: 'parent_value_prop', createdAt });
      router.push({ pathname: '/preview/value-prop', params: { variant: 'parent' } });
      return;
    }
    if (intent === 'both') {
      await setPreviewState({
        intent: 'both',
        path: 'parent_value_prop',
        bothPriority: 'child_first',
        createdAt,
      });
      router.push({ pathname: '/preview/value-prop', params: { variant: 'parent' } });
      return;
    }
    // not_sure → lesson fork (v0: same as self)
    await setPreviewState({ intent: 'not_sure', path: 'learner_value_prop', createdAt });
    router.push('/preview/topic');
  };

  return (
    <View
      className="flex-1 bg-background px-6"
      style={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom }}
      testID="preview-intent"
    >
      <Text className="text-h1 font-bold text-text-primary mb-2 text-center">
        Who are you setting this up for?
      </Text>
      <Text className="text-body text-text-secondary mb-8 text-center">
        We&apos;ll tailor what you see next.
      </Text>
      {OPTIONS.map((opt) => (
        <Pressable
          key={opt.intent}
          onPress={() => void onSelect(opt.intent)}
          className="bg-surface rounded-card px-4 py-4 mb-3"
          testID={opt.testID}
          accessibilityRole="button"
          accessibilityLabel={opt.label}
        >
          <Text className="text-body font-semibold text-text-primary mb-1">
            {opt.label}
          </Text>
          <Text className="text-body-sm text-text-secondary">
            {opt.description}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
```

- [ ] **Step 4: Run tests; confirm pass.**

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 8: Topic Screen

**Files:**
- Create: `apps/mobile/src/app/preview/topic.tsx`
- Create: `apps/mobile/src/app/preview/topic.test.tsx`

- [ ] **Step 1: Write failing test.**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import TopicScreen from './topic';
import * as state from '../../lib/preview-onboarding-state';

jest.mock('expo-router', () => ({ useRouter: jest.fn() }));

describe('Preview TopicScreen', () => {
  const push = jest.fn();
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push });
    push.mockReset();
    jest.spyOn(state, 'getPreviewState').mockResolvedValue({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });
    jest.spyOn(state, 'setPreviewState').mockResolvedValue();
  });

  it('stores topic and navigates to value-prop learner variant', async () => {
    render(<TopicScreen />);
    fireEvent.changeText(screen.getByTestId('preview-topic-input'), 'algebra basics');
    fireEvent.press(screen.getByTestId('preview-topic-continue'));

    await waitFor(() => {
      expect(state.setPreviewState).toHaveBeenCalledWith(
        expect.objectContaining({ topicText: 'algebra basics', intent: 'self' }),
      );
    });
    expect(push).toHaveBeenCalledWith({
      pathname: '/preview/value-prop',
      params: { variant: 'learner' },
    });
  });

  it('disables continue when topic is empty', () => {
    render(<TopicScreen />);
    const cta = screen.getByTestId('preview-topic-continue');
    expect(cta.props.accessibilityState?.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run; confirm fail.**

- [ ] **Step 3: Implement `topic.tsx`.**

```tsx
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';
import {
  getPreviewState,
  setPreviewState,
  type PreviewOnboardingStateV0,
} from '../../lib/preview-onboarding-state';

// [MEDIUM-5] Single-line topic cap. The value is persisted to SecureStore for
// up to 1h pre-signup, so it WILL outlive the screen. Keeping the field short
// discourages users from pasting longer free text that may contain PII (child
// names, school names, learning disability descriptions), and the parent-vs-
// learner branch never needs more than a couple of words to tailor copy.
// Spec §Preview State (Minimal) accepts the truncated cap.
const MAX_TOPIC_LEN = 80;

export default function PreviewTopicScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [current, setCurrent] = useState<PreviewOnboardingStateV0 | null>(null);
  const [topic, setTopic] = useState('');

  useEffect(() => {
    void getPreviewState().then((s) => {
      if (s) {
        setCurrent(s);
        if (s.topicText) setTopic(s.topicText);
      }
    });
  }, []);

  const trimmed = topic.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_TOPIC_LEN;

  const onContinue = async () => {
    if (!canSubmit || !current) return;
    await setPreviewState({ ...current, topicText: trimmed });
    router.push({ pathname: '/preview/value-prop', params: { variant: 'learner' } });
  };

  return (
    <View
      className="flex-1 bg-background px-6"
      style={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 16 }}
      testID="preview-topic"
    >
      <Text className="text-h1 font-bold text-text-primary mb-2 text-center">
        What should we help with?
      </Text>
      <Text className="text-body text-text-secondary mb-6 text-center">
        A topic, a question, anything you&apos;re working on.
      </Text>
      <TextInput
        value={topic}
        onChangeText={setTopic}
        maxLength={MAX_TOPIC_LEN}
        placeholder="e.g. quadratic equations"
        placeholderTextColor={colors.muted}
        className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-6"
        autoFocus
        testID="preview-topic-input"
        accessibilityLabel="Topic"
      />
      <Pressable
        onPress={() => void onContinue()}
        disabled={!canSubmit}
        className={`rounded-button py-3.5 items-center ${canSubmit ? 'bg-primary' : 'bg-primary/40'}`}
        testID="preview-topic-continue"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        accessibilityLabel="Continue"
      >
        <Text className="text-body font-semibold text-text-inverse">Continue</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run tests; confirm pass.**

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 9: Value-Prop Screen (Learner + Parent Variants)

**Files:**
- Create: `apps/mobile/src/app/preview/value-prop.tsx`
- Create: `apps/mobile/src/app/preview/value-prop.test.tsx`

> Hard Rules 1, 2, 3, 6: no LLM call, no "I will remember this" / "Saving your progress" copy, no "profile" word, sample data marked as sample.

- [ ] **Step 1: Write failing tests.**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ValuePropScreen from './value-prop';
import * as state from '../../lib/preview-onboarding-state';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

describe('Preview ValuePropScreen', () => {
  const push = jest.fn();
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push });
    push.mockReset();
    jest.spyOn(state, 'getPreviewState').mockResolvedValue({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 'algebra',
      createdAt: new Date().toISOString(),
    });
  });

  it('learner variant renders sample dialogue marked as sample', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ variant: 'learner' });
    render(<ValuePropScreen />);
    expect(screen.getByTestId('preview-value-prop-learner')).toBeTruthy();
    expect(screen.getByTestId('preview-sample-marker')).toBeTruthy();
  });

  it('parent variant renders sample weekly insight marked as sample', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ variant: 'parent' });
    render(<ValuePropScreen />);
    expect(screen.getByTestId('preview-value-prop-parent')).toBeTruthy();
    expect(screen.getByTestId('preview-sample-marker')).toBeTruthy();
  });

  it('does not render a chat shell or any LLM-driven element', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ variant: 'learner' });
    render(<ValuePropScreen />);
    expect(screen.queryByTestId('chat-shell')).toBeNull();
    expect(screen.queryByTestId('message-input')).toBeNull();
  });

  it('CTA routes to sign-up', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ variant: 'learner' });
    render(<ValuePropScreen />);
    fireEvent.press(screen.getByTestId('preview-signup-cta'));
    expect(push).toHaveBeenCalledWith('/sign-up');
  });
});
```

- [ ] **Step 2: Run; confirm fail.**

- [ ] **Step 3: Implement `value-prop.tsx`.**

```tsx
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getPreviewState,
  type PreviewOnboardingStateV0,
} from '../../lib/preview-onboarding-state';

type Variant = 'learner' | 'parent';

export default function ValuePropScreen() {
  const params = useLocalSearchParams<{ variant?: Variant }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // [LOW-2] Named `previewState` (not `state`) to avoid shadowing the
  // `import * as state from '../../lib/preview-onboarding-state'` pattern
  // used in tests, and to match save.tsx conventions.
  const [previewState, setPreviewStateLocal] = useState<PreviewOnboardingStateV0 | null>(null);

  useEffect(() => {
    void getPreviewState().then(setPreviewStateLocal);
  }, []);

  const variant: Variant = params.variant === 'parent' ? 'parent' : 'learner';
  const topic = previewState?.topicText ?? '';

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
      }}
      testID={variant === 'learner' ? 'preview-value-prop-learner' : 'preview-value-prop-parent'}
    >
      {variant === 'learner' ? (
        <LearnerVariant topic={topic} />
      ) : (
        <ParentVariant />
      )}
      <Pressable
        onPress={() => router.push('/sign-up')}
        className="bg-primary rounded-button py-3.5 px-8 items-center w-full mt-8"
        testID="preview-signup-cta"
        accessibilityRole="button"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {variant === 'learner'
            ? topic
              ? `Sign up to start your first lesson on ${topic}`
              : 'Sign up to start your first lesson'
            : 'Sign up to set up your child'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function SampleMarker() {
  return (
    <View
      className="self-start bg-surface rounded-full px-3 py-1 mb-4"
      testID="preview-sample-marker"
    >
      <Text className="text-caption text-text-muted uppercase tracking-wider">
        Sample
      </Text>
    </View>
  );
}

function LearnerVariant({ topic }: { topic: string }) {
  return (
    <View>
      <Text className="text-h1 font-bold text-text-primary mb-3">
        Here&apos;s how MentoMate teaches
      </Text>
      <Text className="text-body text-text-secondary mb-6">
        A back-and-forth conversation that follows what you actually need —
        not a fixed lesson plan.
      </Text>
      <SampleMarker />
      <View className="bg-surface rounded-card p-4 mb-3 self-start max-w-[85%]">
        <Text className="text-body-sm text-text-primary">
          {topic
            ? `Let's work on ${topic}. What part is tripping you up?`
            : "What are you working on today?"}
        </Text>
      </View>
      <View className="bg-primary/10 rounded-card p-4 mb-3 self-end max-w-[85%]">
        <Text className="text-body-sm text-text-primary">
          I get the formula but I don&apos;t know when to use it.
        </Text>
      </View>
      <View className="bg-surface rounded-card p-4 self-start max-w-[85%]">
        <Text className="text-body-sm text-text-primary">
          Good — that&apos;s the most useful question. Let me show you with a
          concrete example…
        </Text>
      </View>
    </View>
  );
}

function ParentVariant() {
  return (
    <View>
      <Text className="text-h1 font-bold text-text-primary mb-3">
        Here&apos;s how MentoMate helps families
      </Text>
      <Text className="text-body text-text-secondary mb-6">
        You set up your child, they learn, and you get a short weekly read on
        what they&apos;re working on. No surveillance, just signal.
      </Text>
      <SampleMarker />
      <View className="bg-surface rounded-card p-5 mb-3">
        <Text className="text-body font-semibold text-text-primary mb-2">
          Weekly highlight
        </Text>
        <Text className="text-body-sm text-text-secondary mb-3">
          Practiced quadratic equations for 45 minutes across three sessions.
          Getting comfortable with factoring; working on completing the square.
        </Text>
        <Text className="text-caption text-text-muted">
          Sample data — your child&apos;s real insights appear after their first
          session.
        </Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run tests; confirm pass.**

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 10: ~~Sign-Up Integration — Remember Pending Redirect~~ — SKIPPED [HIGH-C2]

> [CRITICAL-A2 / HIGH-C2] **This task is no longer needed.** With the inline-wizard architecture (Task 11 / Task 12 below), the `(app)/_layout.tsx` gate detects preview state on mount and renders the wizard directly. There is no destination route to push to from sign-up.tsx, so no pending-auth-redirect plumbing is required.
>
> What this means concretely:
> - `apps/mobile/src/lib/sign-up-preview-redirect.ts` is NOT created.
> - `apps/mobile/src/app/(auth)/sign-up.tsx` is NOT modified.
> - No tests are added for "sign-up records preview-wizard redirect" — the integration is implicit (sign-up completes → setActive fires → root layout admits user into `(app)/` → AppLayout mounts → preview probe sees state → SaveWizardGate renders).
>
> Round-1 framed pending-auth-redirect as load-bearing on web; verify in dev that the web path also renders the wizard without flashing CreateProfileGate. If a web-only flash IS observed (a few hundred ms between `setActive` resolving and `getPreviewState()` resolving), the layout's `previewProbeState === 'loading'` branch (Task 11) already covers it by rendering a spinner instead of falling through to CreateProfileGate.

The remainder of this section is intentionally left as historical context; all checkboxes below should be considered no-ops.

### Historical (do not implement)

- [ ] **Step 1: Write failing test.**

```tsx
import { rememberPendingAuthRedirect, clearPendingAuthRedirect, peekPendingAuthRedirect } from '../../lib/pending-auth-redirect';
import { setPreviewState, clearPreviewState } from '../../lib/preview-onboarding-state';

describe('sign-up preview redirect integration', () => {
  beforeEach(() => {
    clearPendingAuthRedirect();
    void clearPreviewState();
  });

  it('records save-wizard redirect when preview state is set', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });
    // Simulate the integration point: in sign-up, before calling setActive,
    // we check preview state and remember the redirect. Test that the
    // helper is wired by running the real branch.
    // (Component-level integration test: render SignUpScreen and drive
    //  through email verify. Pattern depends on existing sign-up test setup;
    //  if no existing test exists, this can be a lightweight unit test of
    //  the small helper function extracted in step 3.)

    // Recommended: extract the conditional into a small helper for testability.
    const { rememberPreviewRedirectIfNeeded } = await import('../../lib/sign-up-preview-redirect');
    await rememberPreviewRedirectIfNeeded();

    expect(peekPendingAuthRedirect()).toBe('/(app)/preview/save');
  });

  it('is a no-op when preview state is absent', async () => {
    const { rememberPreviewRedirectIfNeeded } = await import('../../lib/sign-up-preview-redirect');
    await rememberPreviewRedirectIfNeeded();
    expect(peekPendingAuthRedirect()).toBeNull();
  });
});
```

- [ ] **Step 2: Run; confirm fail.**

- [ ] **Step 3: Create helper in `lib/` (NOT under `app/(auth)/`).** [MEDIUM-2]

Create `apps/mobile/src/lib/sign-up-preview-redirect.ts`:

```ts
import { FEATURE_FLAGS } from './feature-flags';
import { rememberPendingAuthRedirect } from './pending-auth-redirect';
import { getPreviewState } from './preview-onboarding-state';

const SAVE_WIZARD_PATH = '/(app)/preview/save';

export async function rememberPreviewRedirectIfNeeded(): Promise<void> {
  if (!FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED) return;
  const state = await getPreviewState();
  if (!state) return;
  rememberPendingAuthRedirect(SAVE_WIZARD_PATH);
}
```

> Helper is in `lib/`, NOT under `app/(auth)/`. Expo Router treats unknown `.ts` files inside routed groups as routes (memory: `project_expo_router_pollution.md`).

- [ ] **Step 4: Wire the single chokepoint in `sign-up.tsx`.** [HIGH-2]

Add import:
```ts
import { rememberPreviewRedirectIfNeeded } from '../../lib/sign-up-preview-redirect';
```

Inside `activateCreatedSession`, immediately before `await setActive({ session: sessionId });`:

```ts
await rememberPreviewRedirectIfNeeded();
await setActive({ session: sessionId });
```

That is the ONLY edit to `sign-up.tsx`. Do not add a call after `prepareEmailAddressVerification`. Both the email-code verification and OAuth paths flow through `activateCreatedSession`.

- [ ] **Step 4: Run tests; confirm pass.**

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 11: AppLayout — Probe + Inline SaveWizardGate Branch [CRITICAL-A2 / CRITICAL-B2]

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.tsx`
- Modify: `apps/mobile/src/app/(app)/_layout.test.tsx`

> Critical: async resolution. The gate must hold a loading state until preview-state resolution settles. Without this, `CreateProfileGate` mount effects could fire a transient POST and cause a visible flash. Spec §Implementation step 5.

> [CRITICAL-A2] **Architecture:** the wizard is rendered INLINE as a gate component (mirrors `CreateProfileGate` at `_layout.tsx:640`). The gate ordering is:
>
> 1. `previewProbeState === 'loading'` → spinner
> 2. `previewProbeState === 'present' && !wizardDone` → `<SaveWizardGate onComplete={() => setWizardDone(true)} />` (defined in Task 12)
> 3. `!activeProfile` → `<CreateProfileGate />` (existing)
> 4. consent gates / Tabs (existing)
>
> The wizard branch sits ABOVE `!activeProfile` so the wizard stays mounted across the profile-creation transition (ProfileProvider auto-activates the first profile via `profile.ts:154-174` — without the ordering above, the wizard would unmount mid-flow before Step 3).
>
> [CRITICAL-B2] **The auto-cleanup effect (`activeProfile && profiles.length > 0 → clearPreviewState()`) is NOT added.** It would race the wizard's owner POST → child POST sequence and wipe `createdOwnerProfileId` from SecureStore between the two calls, breaking the [HIGH-4] resume guard. Cleanup is owned by (a) TTL inside `getPreviewState`, (b) sign-out-cleanup (Task 4), (c) the wizard's explicit `clearPreviewState()` call on Step-3 success (Task 14).

- [ ] **Step 1: Write failing tests.**

Find the existing `_layout.test.tsx` (or create alongside `_layout.tsx`). Add:

```tsx
import { setPreviewState, clearPreviewState } from '../../lib/preview-onboarding-state';
import { FEATURE_FLAGS } from '../../lib/feature-flags';

describe('AppLayout no-profile gate — preview branch', () => {
  beforeEach(async () => {
    await clearPreviewState();
  });

  it('renders the SaveWizardGate when preview state exists and flag is on', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });

    // Render AppLayout under mocked auth (isSignedIn=true) and ProfileProvider
    // with profiles=[], activeProfile=null. Pattern: copy the harness used by
    // the existing _layout test for CreateProfileGate flashes.
    const { findByTestId, queryByTestId } = renderAppLayoutWithNoProfile();

    // The async probe should resolve before either gate or wizard renders.
    // [CRITICAL-A2] The wizard is INLINE — no route navigation; assert the
    // SaveWizardGate testID is present in the same render tree.
    expect(await findByTestId('save-wizard-gate')).toBeTruthy();
    expect(queryByTestId('create-profile-gate')).toBeNull();
  });

  // [MEDIUM-D2] Use jest.doMock + jest.isolateModules, NOT
  // `(FEATURE_FLAGS as any).X = false` (which leaks across parallel workers).
  // Mirrors the canonical pattern picked up by Task 5's spike step.
  it('falls through to CreateProfileGate when flag is off, even with stale preview state', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });

    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../lib/feature-flags', () => ({
        FEATURE_FLAGS: {
          COACH_BAND_ENABLED: true,
          MIC_IN_PILL_ENABLED: true,
          I18N_ENABLED: true,
          PREVIEW_ONBOARDING_ENABLED: false,
        },
      }));
      const { renderAppLayoutWithNoProfile } = await import('./__test-harness');
      const { findByTestId, queryByTestId } = renderAppLayoutWithNoProfile();
      expect(await findByTestId('create-profile-gate')).toBeTruthy();
      expect(queryByTestId('save-wizard-gate')).toBeNull();
    });
  });

  it('renders loading state during preview-state async probe', () => {
    // Spy getPreviewState to return a pending promise. Assert loading testID
    // is rendered; assert neither gate nor wizard is in the tree.
    let resolve!: (v: null) => void;
    jest.spyOn(require('../../lib/preview-onboarding-state'), 'getPreviewState').mockReturnValue(
      new Promise<null>((r) => { resolve = r; }),
    );

    const { getByTestId, queryByTestId } = renderAppLayoutWithNoProfile();
    expect(getByTestId('preview-state-loading')).toBeTruthy();
    expect(queryByTestId('create-profile-gate')).toBeNull();
    expect(queryByTestId('save-wizard-gate')).toBeNull();

    resolve(null);
  });

  // [CRITICAL-A2 / HIGH-A2] Wizard outlives the auto-activation transition.
  // First-profile POST flips profiles to non-empty; ProfileProvider auto-sets
  // activeProfile via the !savedExists fallback (profile.ts:154-174 —
  // [MEDIUM-A3]: the effect only fires when no valid saved id exists, which
  // IS the post-signup state because the user has no ACTIVE_PROFILE_KEY yet).
  // The wizard branch must remain above !activeProfile in the gate ordering
  // so the wizard stays mounted across that transition.
  //
  // [HIGH-B3 / MEDIUM-B3] `simulateProfileCreated` is NOT a real helper in
  // the existing _layout.test.tsx — grep returns zero hits. The implementer
  // must add this harness during Task 11 Step 1. Required contract:
  //   simulateProfileCreated(profile: Partial<Profile>): void
  //     - Mutates the active useProfile() mock such that subsequent renders
  //       return { profiles: [profile], activeProfile: profile, ... }.
  //     - Flushes microtasks (await Promise.resolve()) so the next assertion
  //       reads the post-update state.
  //   Typical implementation pattern in test files: a closure-scoped mutable
  //   state object backing the useProfile mock, plus a setter exposed by the
  //   render helper. Mirror whatever the file's existing mocks already use
  //   for activeProfile transitions; do NOT reinvent.
  it('keeps SaveWizardGate mounted after ProfileProvider auto-activates the first profile', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });
    const { findByTestId, simulateProfileCreated } = renderAppLayoutWithNoProfile();
    await findByTestId('save-wizard-gate');
    // Drive the harness to inject a created profile and let the provider
    // auto-activate it (mirrors what happens at runtime after the owner POST
    // resolves and the cache is updated).
    simulateProfileCreated({ id: 'p1', isOwner: true });
    // Wizard MUST still be mounted; we have NOT signalled wizardDone yet.
    expect(await findByTestId('save-wizard-gate')).toBeTruthy();
  });

  // [CRITICAL-B2] Verify the layout does NOT install the auto-cleanup effect.
  it('does NOT clear preview state automatically when activeProfile becomes truthy', async () => {
    await setPreviewState({
      intent: 'self', path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });
    renderAppLayoutWithActiveProfile();
    await Promise.resolve();
    const { getPreviewState } = await import('../../lib/preview-onboarding-state');
    // Round-1 plan would have expected null here. Round-2: the layout must
    // leave the key intact; cleanup is the wizard's job (or TTL/sign-out).
    expect(await getPreviewState()).not.toBeNull();
  });
});
```

> `renderAppLayoutWithNoProfile` / `renderAppLayoutWithActiveProfile` — adapt from existing test harnesses in the file. If none exist, this is the right time to extract a small helper since multiple tests need it.

- [ ] **Step 2: Run; confirm fail.**

- [ ] **Step 3: Edit `(app)/_layout.tsx`.**

Add imports:

```ts
import { FEATURE_FLAGS } from '../../lib/feature-flags';
import { getPreviewState } from '../../lib/preview-onboarding-state';
// Note: clearPreviewState is NOT imported here. [CRITICAL-B2] cleanup is
// owned by the wizard's Step-3 success path (Task 14) and by sign-out.
```

Inside the default `AppLayout` component, after the existing profile-loading state and immediately BEFORE the `if (!activeProfile)` branch (landmark — search for that exact conditional; line numbers drift) [MEDIUM-3], introduce the preview-state probe AND a wizard-done sentinel.

> [CRITICAL-A3] **Precedence rules** — these are non-negotiable. The new code MUST NOT precede any of:
> 1. `if (!isLoaded)` spinner branch (`_layout.tsx:1533-1538` evidence) — auth not loaded yet; do not render any app UI.
> 2. `if (!isSignedIn)` redirect-to-`/sign-in` branch (`_layout.tsx:1539-1548`) — signed-OUT user must not see the wizard. Without this ordering, a session-expired user with a `present` preview key sees the wizard, taps Continue, and 401s mid-POST.
> 3. `pendingAuthRedirect && currentAppPath !== pendingAuthRedirect` spinner branch (`_layout.tsx:1550-1576`) — the OAuth-return redirect-replay loader has its own 15s timeout. The new probe-loading spinner must NOT replace or duplicate it.
> 4. `isProfileLoading` spinner branch (`_layout.tsx:1582-1619`) — has its own 20s timeout.
> 5. `profileLoadError` fallback branch (`_layout.tsx:1624-1655`) — error UI is independent of preview state.
>
> Final ordering: `!isLoaded` → `!isSignedIn` → `pendingAuthRedirect` spinner → `isProfileLoading` → `profileLoadError` → preview-probe-loading → SaveWizardGate branch → `!activeProfile` → consent gates → Tabs.

```tsx
const [previewProbeState, setPreviewProbeState] = React.useState<
  'loading' | 'present' | 'absent'
>('loading');
// [HIGH-A2] Wizard signals completion via onComplete → setWizardDone(true).
// Required because previewProbeState alone never flips back to 'absent'
// (we don't re-probe after mount, and clearPreviewState() inside the wizard
// only affects future mounts).
const [wizardDone, setWizardDone] = React.useState(false);

React.useEffect(() => {
  if (!FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED) {
    setPreviewProbeState('absent');
    return;
  }
  let cancelled = false;
  void getPreviewState().then((s) => {
    if (cancelled) return;
    setPreviewProbeState(s ? 'present' : 'absent');
  });
  return () => {
    cancelled = true;
  };
}, []);

// [CRITICAL-B2] DELIBERATELY no auto-cleanup effect here. Round-1 had
//   useEffect(() => { if (activeProfile && profiles.length > 0) clearPreviewState() })
// — that would race the wizard's owner-POST → child-POST sequence and wipe
// `createdOwnerProfileId` between the calls, destroying the [HIGH-4] resume
// guard. Cleanup is owned by:
//   (a) TTL inside getPreviewState (1h)
//   (b) sign-out-cleanup (Task 4)
//   (c) wizard's explicit clearPreviewState() on Step-3 success (Task 14)
```

Then INSERT the wizard branch ABOVE the `!activeProfile` branch (NOT inside it):

```tsx
// [CRITICAL-A2] Wizard gate sits ABOVE !activeProfile so it stays mounted
// when ProfileProvider auto-activates the first profile mid-wizard
// (profile.ts:154-174). Without this ordering, the wizard would unmount
// after Step 2's POST succeeds.
if (
  FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED &&
  previewProbeState === 'loading'
) {
  return (
    <View
      className="flex-1 bg-background items-center justify-center"
      testID="preview-state-loading"
    >
      <ActivityIndicator size="large" />
    </View>
  );
}

if (
  FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED &&
  previewProbeState === 'present' &&
  !wizardDone
) {
  return (
    <FeedbackProvider>
      <SaveWizardGate onComplete={() => setWizardDone(true)} />
    </FeedbackProvider>
  );
}

// Existing branch — unchanged shape.
if (!activeProfile) {
  return (
    <FeedbackProvider>
      <CreateProfileGate />
    </FeedbackProvider>
  );
}
```

`SaveWizardGate` is defined in this same file (see Task 12), alongside `CreateProfileGate` at line 640.

- [ ] **Tab-bar handling.** [CRITICAL-A2]

NO addition to `FULL_SCREEN_ROUTES`. The Round-1 plan added `'preview'` because the wizard was a nested route; the inline-gate architecture replaces the entire layout body during the wizard's life (the gate `return`s before the `<Tabs>` JSX is reached), so there's no tab bar to hide. Leave `FULL_SCREEN_ROUTES` untouched.

- [ ] **Step 4: Run tests; confirm pass.**

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 12: SaveWizardGate Component — Skeleton + Step 1 (Where to Save) [CRITICAL-A2]

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.tsx` — add inline `SaveWizardGate` component (NOT a route file).
- Modify: `apps/mobile/src/app/(app)/_layout.test.tsx` — co-located wizard tests.

> [CRITICAL-A2] **No `(app)/preview/save.tsx`, no `(app)/preview/_layout.tsx`, no `(app)/preview/save.test.tsx`.** The Round-1 route-based plan does not work — see the architecture section at the top. `SaveWizardGate` is defined in the same file as `CreateProfileGate` (line 640), takes an `onComplete` callback, and is rendered by the gate-ordering block introduced in Task 11.

- [ ] **Step 1: ~~`_layout.tsx` for `(app)/preview/`~~ — SKIPPED.** No route file is created.

- [ ] **Step 2: Write failing test for Step 1 (where-to-save selection).**

> [HIGH-C3] Use the `(app)/_layout.test.tsx` harness from Task 11. The wizard is mounted by the layout's gate ordering (preview state present + wizardDone false), so tests render the layout, not a standalone `<SaveWizard />`. Import depth from `apps/mobile/src/app/(app)/_layout.test.tsx`: `../../lib/...` (`_layout.test.tsx` → `(app)/` → `app/` → `src/lib/`). DO NOT use `../../../lib/...` — that depth is correct for a hypothetical `(app)/preview/save.test.tsx`, which this plan no longer creates. The snippet below is updated to the correct two-dot path.

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { setPreviewState, clearPreviewState } from '../../lib/preview-onboarding-state';
// SaveWizardGate is internal to (app)/_layout.tsx; tests reach it by
// rendering AppLayout under conditions that mount the wizard branch.
// Do NOT add an export-for-tests of SaveWizardGate from _layout.tsx —
// the gate is intentionally co-located and tested via the layout.

describe('SaveWizard — Step 1', () => {
  beforeEach(async () => {
    await clearPreviewState();
  });

  // [CRITICAL-3] No dead-end on empty state.
  it('redirects to /(app)/home when no preview state exists', async () => {
    const replace = jest.fn();
    (require('expo-router').useRouter as jest.Mock).mockReturnValue({ replace, push: jest.fn() });
    render(<SaveWizard />);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/(app)/home');
    });
    expect(screen.queryByTestId('save-wizard-step-1')).toBeNull();
  });

  it('preselects "My learning" when intent was self', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 't',
      createdAt: new Date().toISOString(),
    });
    render(<SaveWizard />);
    await screen.findByTestId('save-wizard-step-1');
    expect(screen.getByTestId('save-target-self').props.accessibilityState?.selected).toBe(true);
  });

  it('preselects "My child" when intent was child', async () => {
    await setPreviewState({
      intent: 'child',
      path: 'parent_value_prop',
      createdAt: new Date().toISOString(),
    });
    render(<SaveWizard />);
    await screen.findByTestId('save-wizard-step-1');
    expect(screen.getByTestId('save-target-child').props.accessibilityState?.selected).toBe(true);
  });

  it('overrides intent when user picks a different target', async () => {
    await setPreviewState({
      intent: 'child',
      path: 'parent_value_prop',
      createdAt: new Date().toISOString(),
    });
    render(<SaveWizard />);
    await screen.findByTestId('save-wizard-step-1');
    fireEvent.press(screen.getByTestId('save-target-self'));
    expect(screen.getByTestId('save-target-self').props.accessibilityState?.selected).toBe(true);
    expect(screen.getByTestId('save-target-child').props.accessibilityState?.selected).toBe(false);
  });
});
```

- [ ] **Step 3: Run; confirm fail.**

- [ ] **Step 4: Implement Step 1 inside `(app)/_layout.tsx`.** [CRITICAL-A2]

> Co-locate next to `CreateProfileGate` (line 640). The component is named `SaveWizardGate` to mirror that convention. Imports use the same `../../lib/...` depth as the surrounding layout file, NOT `../../../lib/...`.

```tsx
// At the top of (app)/_layout.tsx — only the new imports.
import {
  getPreviewState,
  clearPreviewState,
  type PreviewOnboardingStateV0,
  type SaveTarget,
} from '../../lib/preview-onboarding-state';

type Step = 1 | 2 | 3;

interface TargetOption {
  target: SaveTarget;
  label: string;
  testID: string;
}

const TARGETS: ReadonlyArray<TargetOption> = [
  { target: 'self', label: 'My learning', testID: 'save-target-self' },
  { target: 'child', label: "My child's learning", testID: 'save-target-child' },
  { target: 'both', label: 'Both', testID: 'save-target-both' },
];

function defaultTargetFor(state: PreviewOnboardingStateV0 | null): SaveTarget | null {
  if (!state) return null;
  switch (state.intent) {
    case 'self':
      return 'self';
    case 'child':
      return 'child';
    case 'both':
      return 'both';
    case 'not_sure':
      return null; // ask explicitly per spec Routing And Landing Rules
  }
}

// [CRITICAL-A2] Co-located component, NOT a default export, NOT a route.
// Imported by AppLayout's gate ordering (Task 11).
function SaveWizardGate({ onComplete }: { onComplete: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [previewState, setPreviewStateLocal] = useState<PreviewOnboardingStateV0 | null>(null);
  const [probeDone, setProbeDone] = useState(false);
  const [target, setTarget] = useState<SaveTarget | null>(null);
  const [step, setStep] = useState<Step>(1);

  useEffect(() => {
    void getPreviewState().then((s) => {
      setPreviewStateLocal(s);
      setTarget(defaultTargetFor(s));
      setProbeDone(true);
    });
  }, []);

  // [CRITICAL-3] Recovery path for "wizard mounted with no state" — happens
  // when the 1h TTL expires between the layout's initial probe and the
  // wizard's second probe inside this component, or when SecureStore is
  // wiped externally (sign-out raced with mount). Without this, the wizard
  // would render `null` and trap the user.
  // [HIGH-A2] Signal completion to the layout BEFORE navigating, so the
  // wizard branch in AppLayout exits cleanly and the next render falls
  // through to CreateProfileGate / Tabs / consent gates as appropriate.
  useEffect(() => {
    if (probeDone && !previewState) {
      onComplete();
      router.replace('/(app)/home');
    }
  }, [probeDone, previewState, router, onComplete]);

  if (!previewState) {
    return (
      <View testID="save-wizard-gate" className="flex-1 bg-background" />
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
      }}
      testID="save-wizard-gate"  /* [CRITICAL-A2] outer gate identity */
    >
      <View testID={`save-wizard-step-${step}`} />
      <Text className="text-h1 font-bold text-text-primary mb-2">
        Great, let&apos;s save this and get you started.
      </Text>

      {step === 1 && (
        <View>
          <Text className="text-body text-text-secondary mb-6">
            Where should we save this?
          </Text>
          {TARGETS.map((opt) => {
            const selected = target === opt.target;
            return (
              <Pressable
                key={opt.target}
                onPress={() => setTarget(opt.target)}
                className={`rounded-card px-4 py-4 mb-3 ${selected ? 'bg-primary/10 border border-primary' : 'bg-surface'}`}
                testID={opt.testID}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text className="text-body font-semibold text-text-primary">
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => target && setStep(2)}
            disabled={!target}
            className={`rounded-button py-3.5 items-center mt-4 ${target ? 'bg-primary' : 'bg-primary/40'}`}
            testID="save-wizard-step-1-continue"
            accessibilityRole="button"
            accessibilityState={{ disabled: !target }}
          >
            <Text className="text-body font-semibold text-text-inverse">
              Continue
            </Text>
          </Pressable>
        </View>
      )}

      {step === 2 && (
        <ProfileBasicsStep
          target={target!}
          previewState={previewState}
          onComplete={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <ConfirmStep
          target={target!}
          previewState={previewState}
          router={router}
          onComplete={onComplete}  /* [HIGH-A2] forwarded from layout */
        />
      )}
    </ScrollView>
  );
}

function ProfileBasicsStep(_props: {
  target: SaveTarget;
  previewState: PreviewOnboardingStateV0;
  onComplete: (created: { parent: Profile; child?: Profile }) => void;
}) {
  // Implemented in Task 13.
  return <Text>TODO step 2</Text>;
}

function ConfirmStep(_props: {
  target: SaveTarget;
  previewState: PreviewOnboardingStateV0;
  router: ReturnType<typeof useRouter>;
  onComplete: () => void;  /* [HIGH-A2] layout-level wizard-done signal */
}) {
  // Implemented in Task 14.
  return <Text>TODO step 3</Text>;
}
```

- [ ] **Step 5: Run tests; confirm pass.**

- [ ] **Step 6: Commit via `/commit`.**

---

## Task 13: Save Wizard — Step 2 (Profile Basics)

**Files:**
- Modify: `apps/mobile/src/app/(app)/preview/save.tsx`
- Modify: `apps/mobile/src/app/(app)/preview/save.test.tsx`

> Step 2 collects owner basics, then conditional child basics. v0 inlines a minimal form rather than importing `create-profile.tsx` (a default-export route). If the form duplicates more than ~30 LOC of create-profile field components, extract to a shared component then; not now.

> [CRITICAL-1] **Request body is `{ displayName, birthYear }` only.** `profileCreateSchema` (`packages/schemas/src/profiles.ts:44`) does NOT accept `forChild` and Hono's typed RPC body will reject any extra fields at the TypeScript layer. The server determines owner-vs-child purely from "is this the first profile on the account?" — `createProfileWithLimitCheck` in `apps/api/src/services/profile.ts:253-317`. So for a `target='child'` or `target='both'` flow we POST `/profiles` TWICE in sequence: first call creates the owner, second call (with the child's name + birthYear) is auto-classified as a child because the owner now exists.

> [HIGH-4] **Persist `createdOwnerProfileId` to the preview-state record before issuing the second POST.** Without this, a wizard remount mid-flight (app backgrounded, refresh, OOM-kill) re-runs the form and double-creates: the second mount's "owner" POST becomes a child, the "child" POST becomes a second child — net result, 1 owner + 2 children for one expected flow. Resume logic: if the persisted id is non-null AND maps to an already-fetched profile, skip the owner POST.

- [ ] **Step 1: Write failing tests.**

```tsx
it('self target: collects display name + birth year and creates owner profile', async () => {
  await setPreviewState({
    intent: 'self', path: 'learner_value_prop',
    topicText: 'algebra', createdAt: new Date().toISOString(),
  });
  // Mock API client profiles.$post to resolve with a fake owner profile.
  const apiSpy = mockProfilesPost({ profile: makeOwnerProfile() });

  render(<SaveWizard />);
  fireEvent.press(await screen.findByTestId('save-wizard-step-1-continue'));

  fireEvent.changeText(screen.getByTestId('save-basics-display-name'), 'Alex');
  fireEvent.changeText(screen.getByTestId('save-basics-birth-year'), '1990');
  fireEvent.press(screen.getByTestId('save-basics-continue'));

  await waitFor(() => {
    expect(apiSpy).toHaveBeenCalledWith({
      json: { displayName: 'Alex', birthYear: 1990 },
    });
  });
});

it('child target: creates parent first, then child (sequence assertion)', async () => {
  await setPreviewState({
    intent: 'child', path: 'parent_value_prop',
    createdAt: new Date().toISOString(),
  });
  const apiSpy = mockProfilesPostSequence([
    { profile: makeOwnerProfile({ id: 'parent-1' }) },
    { profile: makeChildProfile({ id: 'child-1' }) },
  ]);

  render(<SaveWizard />);
  fireEvent.press(await screen.findByTestId('save-wizard-step-1-continue'));

  // Parent basics
  fireEvent.changeText(screen.getByTestId('save-basics-parent-name'), 'Pat');
  fireEvent.changeText(screen.getByTestId('save-basics-parent-birth-year'), '1985');
  // Child basics on same step (per spec)
  fireEvent.changeText(screen.getByTestId('save-basics-child-name'), 'Sam');
  fireEvent.changeText(screen.getByTestId('save-basics-child-birth-year'), '2014');
  fireEvent.press(screen.getByTestId('save-basics-continue'));

  // [CRITICAL-1] Assert call ORDER and bodies. Server derives owner-vs-child
  // from call position; the body must NOT include forChild (schema rejects it).
  await waitFor(() => {
    expect(apiSpy.mock.calls[0]?.[0].json).toEqual({ displayName: 'Pat', birthYear: 1985 });
    expect(apiSpy.mock.calls[1]?.[0].json).toEqual({ displayName: 'Sam', birthYear: 2014 });
    expect(apiSpy.mock.calls.length).toBe(2);
  });
});

// [HIGH-A3 / HIGH-B2] Adult-age gate — client-side because the server has
// NO 18+ owner rule (apps/api/src/services/profile.ts:184-191 only enforces
// the 11+ minimum). Without this gate, a 13-year-old could create themselves
// as isOwner=true with a child linked underneath via the wizard.
it('underage parent (target=child) cannot submit; Continue stays disabled', async () => {
  await setPreviewState({
    intent: 'child', path: 'parent_value_prop',
    createdAt: new Date().toISOString(),
  });
  // Fix "now" to a known year for deterministic adult-age arithmetic.
  jest.useFakeTimers().setSystemTime(new Date('2026-05-19T00:00:00Z'));

  render(<SaveWizard />);
  fireEvent.press(await screen.findByTestId('save-wizard-step-1-continue'));

  // 13-year-old parent (2026 - 13 = 2013) — computeAgeBracket returns 'child'.
  fireEvent.changeText(screen.getByTestId('save-basics-parent-name'), 'TooYoung');
  fireEvent.changeText(screen.getByTestId('save-basics-parent-birth-year'), '2013');
  fireEvent.changeText(screen.getByTestId('save-basics-child-name'), 'Sam');
  fireEvent.changeText(screen.getByTestId('save-basics-child-birth-year'), '2014');

  const cta = screen.getByTestId('save-basics-continue');
  expect(cta.props.accessibilityState?.disabled).toBe(true);

  // Accessible error message visible (testID assertion + role).
  expect(screen.getByTestId('save-basics-adult-required')).toBeTruthy();

  jest.useRealTimers();
});

it('parent aged exactly 18 (target=child) is allowed to submit', async () => {
  await setPreviewState({
    intent: 'child', path: 'parent_value_prop',
    createdAt: new Date().toISOString(),
  });
  jest.useFakeTimers().setSystemTime(new Date('2026-05-19T00:00:00Z'));
  mockProfilesPostSequence([
    { profile: makeOwnerProfile({ id: 'parent-1' }) },
    { profile: makeChildProfile({ id: 'child-1' }) },
  ]);

  render(<SaveWizard />);
  fireEvent.press(await screen.findByTestId('save-wizard-step-1-continue'));

  // computeAgeBracket(2008, 2026) === 'adult' (age 18). Boundary must pass.
  fireEvent.changeText(screen.getByTestId('save-basics-parent-name'), 'Pat');
  fireEvent.changeText(screen.getByTestId('save-basics-parent-birth-year'), '2008');
  fireEvent.changeText(screen.getByTestId('save-basics-child-name'), 'Sam');
  fireEvent.changeText(screen.getByTestId('save-basics-child-birth-year'), '2014');

  const cta = screen.getByTestId('save-basics-continue');
  expect(cta.props.accessibilityState?.disabled).toBe(false);
  expect(screen.queryByTestId('save-basics-adult-required')).toBeNull();

  jest.useRealTimers();
});

// [OPT-C] Flag-off path: when ADULT_OWNER_GATE_ENABLED is false, the
// adult-age UI gate is bypassed entirely (today's behaviour). Use the
// jest.doMock + jest.isolateModules pattern mandated by [HIGH-3] /
// [MEDIUM-D2] — never `(FEATURE_FLAGS as any).X = false` because the
// constant is frozen and the override survives across tests.
it('underage parent allowed through when ADULT_OWNER_GATE_ENABLED is false [OPT-C]', async () => {
  jest.isolateModules(() => {
    jest.doMock('../../../lib/feature-flags', () => ({
      FEATURE_FLAGS: {
        PREVIEW_ONBOARDING_ENABLED: true,
        ADULT_OWNER_GATE_ENABLED: false,
        COACH_BAND_ENABLED: true,
        MIC_IN_PILL_ENABLED: true,
        I18N_ENABLED: true,
      },
    }));
    // Re-require SaveWizard inside the isolated registry so its
    // top-level `import { FEATURE_FLAGS } from ...` picks up the doMock.
    const { SaveWizard: SaveWizardFlagOff } = require('./save');

    return (async () => {
      await setPreviewState({
        intent: 'child', path: 'parent_value_prop',
        createdAt: new Date().toISOString(),
      });
      jest.useFakeTimers().setSystemTime(new Date('2026-05-19T00:00:00Z'));
      mockProfilesPostSequence([
        { profile: makeOwnerProfile({ id: 'parent-1' }) },
        { profile: makeChildProfile({ id: 'child-1' }) },
      ]);

      render(<SaveWizardFlagOff />);
      fireEvent.press(await screen.findByTestId('save-wizard-step-1-continue'));

      // 13-year-old parent — would be blocked by the gate, but the flag
      // is off, so the existing display-name + birth-year validations
      // are the only checks. Continue must enable and submit must fire.
      fireEvent.changeText(screen.getByTestId('save-basics-parent-name'), 'TooYoung');
      fireEvent.changeText(screen.getByTestId('save-basics-parent-birth-year'), '2013');
      fireEvent.changeText(screen.getByTestId('save-basics-child-name'), 'Sam');
      fireEvent.changeText(screen.getByTestId('save-basics-child-birth-year'), '2014');

      const cta = screen.getByTestId('save-basics-continue');
      expect(cta.props.accessibilityState?.disabled).toBe(false);
      // Warning view is NOT rendered when the flag is off.
      expect(screen.queryByTestId('save-basics-adult-required')).toBeNull();

      jest.useRealTimers();
    })();
  });
});

it('self target skips the adult gate (any age ≥ 11 allowed)', async () => {
  await setPreviewState({
    intent: 'self', path: 'learner_value_prop',
    topicText: 'algebra', createdAt: new Date().toISOString(),
  });
  jest.useFakeTimers().setSystemTime(new Date('2026-05-19T00:00:00Z'));
  mockProfilesPost({ profile: makeOwnerProfile() });

  render(<SaveWizard />);
  fireEvent.press(await screen.findByTestId('save-wizard-step-1-continue'));

  // 13-year-old solo learner — adult gate must NOT apply. Server's 11+ check
  // is the only floor for target='self'.
  fireEvent.changeText(screen.getByTestId('save-basics-display-name'), 'Solo');
  fireEvent.changeText(screen.getByTestId('save-basics-birth-year'), '2013');

  const cta = screen.getByTestId('save-basics-continue');
  expect(cta.props.accessibilityState?.disabled).toBe(false);
  expect(screen.queryByTestId('save-basics-adult-required')).toBeNull();

  jest.useRealTimers();
});

it('child failure after parent success keeps parent and shows retry', async () => {
  await setPreviewState({
    intent: 'child', path: 'parent_value_prop',
    createdAt: new Date().toISOString(),
  });
  mockProfilesPostSequence([
    { profile: makeOwnerProfile({ id: 'parent-1' }) },
    new Error('NetworkError'),
  ]);
  render(<SaveWizard />);
  // Drive through step 1 + step 2; assert:
  // - error toast / inline error visible (testID="save-basics-child-error")
  // - retry button visible (testID="save-basics-retry-child")
  // - parent profile creation NOT rolled back (no DELETE call).
  // ...
});
```

> Adapt the `mockProfilesPost` / sequence helpers to whatever pattern the codebase already uses for `client.profiles.$post`. Check existing tests for `apps/mobile/src/app/create-profile.test.tsx` if present, or `apps/mobile/src/lib/api-client.test.ts` for the canonical mock pattern.

- [ ] **Step 2: Run; confirm fail.**

- [ ] **Step 3: Replace `ProfileBasicsStep` in `save.tsx`.**

```tsx
import { useState, useCallback } from 'react';
import { TextInput, ActivityIndicator } from 'react-native';
import { useApiClient } from '../../../lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { assertOk } from '../../../lib/assert-ok';
import { formatApiError } from '../../../lib/format-api-error';
import { setPreviewState } from '../../../lib/preview-onboarding-state';
import type { Profile } from '@eduagent/schemas';
// [HIGH-A3] Adult-age gate uses the canonical age-bracket helper —
// computeAgeBracket(year) returns 'adult' iff age >= 18. Same definition
// the existing isAdultOwner() helper uses (packages/schemas/src/age.ts:51).
// DO NOT reintroduce the removed personaFromBirthYear fossil
// (persona-fossil-guard.test.ts enforces).
import { computeAgeBracket } from '@eduagent/schemas';
// [OPT-C] Adult-owner gate is independently flagged via ADULT_OWNER_GATE_ENABLED.
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

function ProfileBasicsStep({
  target,
  previewState,
  onComplete,
}: {
  target: SaveTarget;
  previewState: PreviewOnboardingStateV0;
  onComplete: (created: { parent: Profile; child?: Profile }) => void;
}) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const [parentName, setParentName] = useState('');
  const [parentBirthYear, setParentBirthYear] = useState('');
  const [childName, setChildName] = useState('');
  const [childBirthYear, setChildBirthYear] = useState('');

  const [createdParent, setCreatedParent] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [childError, setChildError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const needsChild = target === 'child' || target === 'both';
  const needsOwner = target === 'self' || target === 'child' || target === 'both';

  const ownerName = target === 'self' ? parentName : parentName; // both branches share the owner-basics
  const ownerYear = target === 'self' ? parentBirthYear : parentBirthYear;

  const isValidYear = (s: string) => /^\d{4}$/.test(s) && Number(s) > 1900 && Number(s) <= new Date().getFullYear();

  // [HIGH-A3 / HIGH-B2] Client-side adult-age gate. Server has NO 18+ rule
  // (apps/api/src/services/profile.ts:184-191 only enforces 11+), so without
  // this gate a 13-year-old could complete the wizard as isOwner=true with
  // a child linked underneath. Skipped entirely when target === 'self' —
  // the server's 11+ floor covers that case.
  //
  // computeAgeBracket(birthYear) returns 'adult' iff age >= 18. Same arithmetic
  // isAdultOwner() in @eduagent/schemas uses; consistent with the rest of the
  // codebase (e.g. more/index.tsx:118).
  //
  // [OPT-C] Gated by FEATURE_FLAGS.ADULT_OWNER_GATE_ENABLED. When OFF,
  // `adultGateRequired` is false and `adultGatePasses` is trivially true —
  // canSubmit falls back to today's behaviour (only the field validations
  // matter). The defense-in-depth server-side rule (Task 13b) is the
  // parallel barrier; toggling this flag without toggling the API flag
  // leaves the server still enforcing 403 ADULT_OWNER_REQUIRED.
  const parentIsAdult =
    isValidYear(ownerYear) && computeAgeBracket(Number(ownerYear)) === 'adult';
  const adultGateRequired =
    FEATURE_FLAGS.ADULT_OWNER_GATE_ENABLED && needsChild;
  const adultGatePasses = !adultGateRequired || parentIsAdult;

  const canSubmit =
    !loading &&
    (needsOwner ? ownerName.trim().length > 0 && isValidYear(ownerYear) : true) &&
    (needsChild ? childName.trim().length > 0 && isValidYear(childBirthYear) : true) &&
    adultGatePasses;

  const submit = useCallback(async () => {
    setError(null);
    setChildError(null);
    setLoading(true);
    try {
      let parent = createdParent;

      // [HIGH-4] Resume guard: if the preview state already records a created
      // owner profile id (set on a prior submit that crashed mid-flight), and
      // that profile exists in the current cache, skip the owner POST and
      // continue with that profile as the parent. Prevents duplicate creation.
      if (!parent && needsOwner && previewState.createdOwnerProfileId) {
        const cached = queryClient.getQueriesData<Profile[]>({
          predicate: (q) => String(q.queryKey[0]) === 'profiles',
        });
        for (const [, list] of cached) {
          const match = list?.find((p) => p.id === previewState.createdOwnerProfileId);
          if (match) {
            parent = match;
            setCreatedParent(match);
            break;
          }
        }
      }

      if (!parent && needsOwner) {
        const res = await client.profiles.$post({
          json: { displayName: ownerName.trim(), birthYear: Number(ownerYear) },
        });
        await assertOk(res);
        const data = (await res.json()) as { profile: Profile };
        parent = data.profile;
        setCreatedParent(parent);

        // [HIGH-4] Persist the new owner id BEFORE issuing the second POST.
        // If we crash between this line and the child POST succeeding, the
        // resume guard above will pick up the parent and not double-create.
        await setPreviewState({ ...previewState, createdOwnerProfileId: parent.id });

        queryClient.setQueriesData<Profile[]>(
          { predicate: (q) => String(q.queryKey[0]) === 'profiles' },
          (old) => (old ? [...old, parent!] : [parent!]),
        );
      }

      let child: Profile | undefined;
      if (needsChild) {
        try {
          // [CRITICAL-1] No `forChild` field. profileCreateSchema rejects it;
          // server auto-classifies non-first POST as child via
          // createProfileWithLimitCheck (apps/api/src/services/profile.ts:253).
          const res = await client.profiles.$post({
            json: {
              displayName: childName.trim(),
              birthYear: Number(childBirthYear),
            },
          });
          await assertOk(res);
          const data = (await res.json()) as { profile: Profile };
          child = data.profile;

          queryClient.setQueriesData<Profile[]>(
            { predicate: (q) => String(q.queryKey[0]) === 'profiles' },
            (old) => (old ? [...old, child!] : [child!]),
          );
        } catch (childErr) {
          // [AC 9] Keep parent. Surface retryable child error inline.
          setChildError(formatApiError(childErr));
          setLoading(false);
          return;
        }
      }

      // Predicate-invalidate (spec: ['profiles'] is userId-scoped).
      await queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]) === 'profiles',
      });

      if (parent) {
        onComplete({ parent, child });
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [
    client, queryClient, createdParent, needsOwner, needsChild,
    ownerName, ownerYear, childName, childBirthYear, onComplete,
  ]);

  return (
    <View>
      {needsOwner && (
        <View className="mb-6">
          <Text className="text-h3 font-semibold text-text-primary mb-3">
            {target === 'self' ? 'Tell us about you' : 'About you (the parent)'}
          </Text>
          <TextInput
            placeholder="Your name"
            value={parentName}
            onChangeText={setParentName}
            className="bg-surface text-text-primary rounded-input px-4 py-3 mb-3"
            testID={target === 'self' ? 'save-basics-display-name' : 'save-basics-parent-name'}
          />
          <TextInput
            placeholder="Birth year (e.g. 1985)"
            value={parentBirthYear}
            onChangeText={setParentBirthYear}
            keyboardType="number-pad"
            maxLength={4}
            className="bg-surface text-text-primary rounded-input px-4 py-3"
            testID={target === 'self' ? 'save-basics-birth-year' : 'save-basics-parent-birth-year'}
          />
        </View>
      )}

      {needsChild && (
        <View className="mb-6">
          <Text className="text-h3 font-semibold text-text-primary mb-3">
            About your child
          </Text>
          <TextInput
            placeholder="Their name or nickname"
            value={childName}
            onChangeText={setChildName}
            className="bg-surface text-text-primary rounded-input px-4 py-3 mb-3"
            testID="save-basics-child-name"
          />
          <TextInput
            placeholder="Birth year"
            value={childBirthYear}
            onChangeText={setChildBirthYear}
            keyboardType="number-pad"
            maxLength={4}
            className="bg-surface text-text-primary rounded-input px-4 py-3"
            testID="save-basics-child-birth-year"
          />
        </View>
      )}

      {/* [HIGH-A3] Adult-age gate inline message. Visible only when the parent
         has entered a valid 4-digit year that resolves to under-18, while the
         flow needs a child profile. Empty / partial input shows nothing
         (avoid scolding mid-typing). The Continue button stays disabled
         independent of this message — the message is the accessible
         explanation; canSubmit is the actual enforcement. */}
      {adultGateRequired && isValidYear(ownerYear) && !parentIsAdult && (
        <View
          className="bg-warning/10 rounded-card px-4 py-3 mb-3"
          testID="save-basics-adult-required"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text className="text-warning text-body-sm">
            To set up a child&apos;s learning, the account holder must be 18 or
            older. You can still set up your own learning instead — pick
            &quot;My learning&quot; on the previous step.
          </Text>
        </View>
      )}
      {error && (
        <View className="bg-danger/10 rounded-card px-4 py-3 mb-3" testID="save-basics-error">
          <Text className="text-danger text-body-sm">{error}</Text>
        </View>
      )}
      {childError && (
        <View className="bg-danger/10 rounded-card px-4 py-3 mb-3" testID="save-basics-child-error">
          <Text className="text-danger text-body-sm mb-2">
            We saved your account, but couldn&apos;t add your child yet: {childError}
          </Text>
          <Pressable
            onPress={() => void submit()}
            testID="save-basics-retry-child"
            accessibilityRole="button"
          >
            <Text className="text-primary font-semibold">Retry</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        onPress={() => void submit()}
        disabled={!canSubmit}
        className={`rounded-button py-3.5 items-center ${canSubmit ? 'bg-primary' : 'bg-primary/40'}`}
        testID="save-basics-continue"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
      >
        {loading ? <ActivityIndicator color="white" /> : (
          <Text className="text-body font-semibold text-text-inverse">Continue</Text>
        )}
      </Pressable>
    </View>
  );
}
```

> [CRITICAL-1] Schema is verified: `POST /profiles` accepts `{ displayName, birthYear, avatarUrl?, location?, conversationLanguage?, pronouns? }` only (`packages/schemas/src/profiles.ts:44`). Server determines owner-vs-child via `createProfileWithLimitCheck`'s `isFirstProfile` check (`apps/api/src/services/profile.ts:253-317`). Do NOT add a `forChild`/`addingChild` field; do NOT invent route params.

- [ ] **Step 4: Update `SaveWizardScreen` to pass `onComplete` typed correctly + advance to Step 3.**

```tsx
{step === 2 && target && (
  <ProfileBasicsStep
    target={target}
    previewState={previewState}
    onComplete={(created) => {
      setCreated(created);
      setStep(3);
    }}
  />
)}
```

Add `const [created, setCreated] = useState<{ parent: Profile; child?: Profile } | null>(null);` to parent state.

- [ ] **Step 5: Run tests; confirm pass.**

- [ ] **Step 6: Commit via `/commit`.**

---

## Task 13b: Server-Side Adult-Owner Rule [OPT-C]

**Size:** Small (~10-15 lines server change, ~30-40 lines tests).

**Files:**
- Modify: `apps/api/src/services/profile.ts` — extend `createProfileWithLimitCheck()` (the function that owns the owner-vs-child decision inside the advisory-locked transaction; landmark — search for `pg_advisory_xact_lock(hashtext(${accountId})` and the `isFirstProfile` branch immediately downstream of it). Insertion point is BEFORE the row insert that would create the second profile (the child), AFTER the lock acquisition and the count-rows read that determines `isFirstProfile`. Line numbers drift; cite that landmark, not a fixed line. [MEDIUM-3]
- Modify: `apps/api/src/services/profile.test.ts` (or the integration test file that already exercises `createProfileWithLimitCheck` — find via grep for `createProfileWithLimitCheck` inside `*.test.ts`).
- Optional: `packages/schemas/src/errors.ts` — add `AdultOwnerRequiredError` class IF the existing hierarchy (`ForbiddenError` with `apiCode` parameter, see `errors.ts:30-41`) does not already cover the case cleanly. The existing `ForbiddenError(message, apiCode)` shape with `apiCode: 'ADULT_OWNER_REQUIRED'` is the lighter-weight option; new class is only warranted if the mobile side needs an `instanceof AdultOwnerRequiredError` discrimination beyond what `error.apiCode === 'ADULT_OWNER_REQUIRED'` provides.

> [OPT-C] **Why this exists.** Round 3's `[HIGH-D3]` proved the server has NO 18+ owner rule today — it only enforces the 11+ minimum (`apps/api/src/services/profile.ts:184-191`, `belowMinimumAge`). Without this rule, the client-side gate added in Task 13 is the only barrier preventing a 13-year-old from completing the wizard as `isOwner=true` with a child linked underneath. The coordinator's `[OPT-C]` decision is defense-in-depth: ship both barriers and gate each behind an independent flag.

> [OPT-C] **Rule.** When `createProfileWithLimitCheck()` is about to create a profile that will be classified as a CHILD (i.e. `isFirstProfile === false`, the path that links the new profile under the existing owner), and `FEATURE_FLAGS.ADULT_OWNER_GATE_ENABLED` (API config) is true, look up the owner profile that will be the parent of the new child and verify its computed age is ≥ 18. If not, throw `ForbiddenError('Account holder must be 18 or older to add a child profile', 'ADULT_OWNER_REQUIRED')`.

> [OPT-C] **Age helper.** Use `computeAgeBracket(owner.birthYear) === 'adult'` from `@eduagent/schemas` (`packages/schemas/src/age.ts:39-49`). Verified: the `'adult'` bracket exists and is the canonical "18+" definition shared with the mobile client. **Do NOT use** `isAdultOwner(profile)` from `age.ts:51-62` — that helper layers `role` / `isOwner` checks on top of the age math which are tangential here (we already know the target profile is the owner because we just resolved it from the account's existing owner row). Plain `computeAgeBracket` is the right primitive. Confirmed by reading `packages/schemas/src/age.ts` end-to-end. [MEDIUM-3]

> [OPT-C] **Flag gating.** Wrap the entire rule in `if (config.ADULT_OWNER_GATE_ENABLED) { ... }` (or whatever the field name resolves to in `apps/api/src/config.ts` — match Task 1 Step 2). When the API flag is OFF, the rule is skipped entirely; behaviour reverts to today's (only 11+ enforced). This is the kill switch.

> [OPT-C] **Mobile error surfacing.** When the API returns 403 with `apiCode === 'ADULT_OWNER_REQUIRED'`, the `ProfileBasicsStep` `submit()` catch block already calls `formatApiError(err)` and assigns it to `setError(...)` — which renders the existing `save-basics-error` view. That's an acceptable baseline. If the client gate is also on (the expected production configuration), the user never sees this — the gate disables Continue pre-flight. If the user bypassed the client gate (e.g. a flag-off mobile build hitting a flag-on API), they see the formatted error. No NEW screen / route changes needed.

- [ ] **Step 1: Write the failing break-test (red-green regression per CLAUDE.md Fix Development Rules).**

The break-test is the negative-path security test mandated by CLAUDE.md (`Security fixes require a "break test."` — every CRITICAL/HIGH security fix gets a failing test that proves the attack would succeed without the fix). Pattern: write test, watch it pass with the fix in place, revert the fix, watch it fail, restore the fix.

```ts
// apps/api/src/services/profile.test.ts (or integration test)
import { ForbiddenError } from '@eduagent/schemas';

it('rejects child creation when owner is under 18 [OPT-C / HIGH-D3]', async () => {
  // Seed: an account whose existing owner profile has a birth year putting
  // them at 13 in the test's "now" frame. Use whatever test factories the
  // file already uses for profile-with-account seeding — match neighbours.
  const accountId = 'acc-underage-owner';
  await seedOwnerProfile(accountId, { birthYear: 2013, isOwner: true });

  // Attempt to add a child under that owner. With the [OPT-C] rule, this
  // must throw ForbiddenError with apiCode ADULT_OWNER_REQUIRED. Pre-fix,
  // the call succeeds.
  await expect(
    createProfileWithLimitCheck(db, accountId, {
      displayName: 'Child', birthYear: 2014,
    }),
  ).rejects.toMatchObject({
    name: 'ForbiddenError',
    apiCode: 'ADULT_OWNER_REQUIRED',
  });
});

it('allows child creation when owner is exactly 18 [OPT-C boundary]', async () => {
  const accountId = 'acc-adult-owner';
  await seedOwnerProfile(accountId, { birthYear: 2008, isOwner: true });
  // With test "now" fixed to 2026, owner is age 18 — must succeed.
  await expect(
    createProfileWithLimitCheck(db, accountId, {
      displayName: 'Child', birthYear: 2014,
    }),
  ).resolves.toMatchObject({ id: expect.any(String) });
});

it('allows child creation when flag is OFF (preserves today\'s behaviour) [OPT-C flag-off]', async () => {
  // Toggle the config flag off for this test. Use whatever pattern the
  // test file already uses for config overrides (a Jest setup file, a
  // helper, or jest.replaceProperty on the imported config object). DO
  // NOT mutate process.env directly mid-test — config is parsed once at
  // module init, mutation has no effect.
  withConfigOverride({ ADULT_OWNER_GATE_ENABLED: false }, async () => {
    const accountId = 'acc-flag-off';
    await seedOwnerProfile(accountId, { birthYear: 2013, isOwner: true });
    await expect(
      createProfileWithLimitCheck(db, accountId, {
        displayName: 'Child', birthYear: 2014,
      }),
    ).resolves.toMatchObject({ id: expect.any(String) });
  });
});
```

- [ ] **Step 2: Run; confirm fail.** (First two tests fail — `ForbiddenError` not thrown / not the expected shape.)

- [ ] **Step 3: Implement the rule.**

Inside `createProfileWithLimitCheck()`, after the existing advisory-lock + count-rows read that determines `isFirstProfile`, and BEFORE the `db.insert(profiles)` that creates the child row, insert:

```ts
// [OPT-C] Adult-owner gate. When adding a CHILD (non-first profile),
// require the account's existing owner to be ≥18. Gated by config flag
// so the rule can be toggled off without code changes (kill switch).
if (
  config.ADULT_OWNER_GATE_ENABLED &&
  !isFirstProfile  // landmark: same boolean the existing owner-vs-child
                   // decision uses below. Match its exact source variable.
) {
  const ownerRow = await txDb
    .select({ birthYear: profiles.birthYear })
    .from(profiles)
    .where(and(eq(profiles.accountId, accountId), eq(profiles.isOwner, true)))
    .limit(1);
  const ownerBirthYear = ownerRow[0]?.birthYear;
  if (
    ownerBirthYear == null ||
    computeAgeBracket(ownerBirthYear) !== 'adult'
  ) {
    throw new ForbiddenError(
      'Account holder must be 18 or older to add a child profile.',
      'ADULT_OWNER_REQUIRED',
    );
  }
}
```

Add the imports at the top of the file:
```ts
import { computeAgeBracket, ForbiddenError } from '@eduagent/schemas';
```

- [ ] **Step 4: Run tests; confirm pass.** All three tests green.

- [ ] **Step 5: Verify the break-test pattern.** Revert the implementation lines (comment out the `if` block). Re-run — the first test must FAIL with `ForbiddenError not thrown`. Restore the implementation. Re-run — green again. This is the regression-pattern proof required by CLAUDE.md for security fixes.

- [ ] **Step 6: Wire the route's error responder.**

Confirm the API's error middleware maps `ForbiddenError` (with `apiCode: 'ADULT_OWNER_REQUIRED'`) to a 403 response that surfaces `apiCode` in the JSON body. Grep `apps/api/src/errors.ts` (the Hono-specific helper, NOT the schemas error class file) for `ForbiddenError` and confirm the existing handler already does this — if it does, no work needed. If not, extend it (one-line addition; the apiCode field is already on the class).

The mobile API client middleware classifies HTTP responses into typed errors per CLAUDE.md ("Typed error hierarchy"). Confirm `apps/mobile/src/lib/api-client.ts` (or wherever the response classifier lives — grep for `ForbiddenError`) already maps 403 with `apiCode: 'ADULT_OWNER_REQUIRED'` to the mobile-side `ForbiddenError` instance. The existing `formatApiError(err)` in `ProfileBasicsStep` then formats the message for the toast. No new screen needed.

- [ ] **Step 7: Migration / rollback.**

**Migration:** none. This is a pure validation rule — no schema change, no data backfill.

**Rollback:** flip `config.ADULT_OWNER_GATE_ENABLED` to false (Doppler env update; no redeploy required if the config is read on every request rather than at boot — verify with the `apps/api/src/config.ts` implementation). The mobile flag `FEATURE_FLAGS.ADULT_OWNER_GATE_ENABLED` requires a mobile build/OTA flip; the API flag is the immediate kill switch.

**Rollback section per CLAUDE.md Schema And Deploy Safety:** Rollback IS possible. No data is lost — the rule rejects creation, never destroys. Recovery procedure: flip flag off, request retries succeed.

- [ ] **Step 8: Failure-modes addendum.** Already added in the section below (see "Underage owner attempts to link child (server)" row).

- [ ] **Step 9: Commit via `/commit`.** Suggested message:
```
feat(api): server-side adult-owner rule for child profile creation [OPT-C]

When an account adds a child profile (non-first profile), require the
existing owner to be ≥18. Gated by config.ADULT_OWNER_GATE_ENABLED so
the rule can be toggled off without code changes.

Closes [HIGH-D3] gap: client-side gate (Task 13 / HIGH-A3) was the
only barrier; this adds defense-in-depth at the server boundary.

Tests:
- Underage owner + child create → 403 ADULT_OWNER_REQUIRED (break test).
- Owner aged 18 boundary → succeeds.
- Flag OFF → succeeds (preserves today's behaviour).

Plan: docs/plans/2026-05-19-trial-intent-save-onboarding-v0.md §Task 13b
Spec: docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md
```

---

## Failure Modes Addendum (referenced from spec)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Wizard mounted with empty preview state | TTL expired between auth and gate render; cleanup race; manual deep-link | Brief blank frame (~1 RAF) | `useEffect` redirects `router.replace('/(app)/home')`. [CRITICAL-3] |
| Wizard remount after owner POST succeeded, child POST never fired | App OOM-killed, force-close, or refresh after parent created | Form re-prefills with cached entries | Resume guard reads `previewState.createdOwnerProfileId`, finds match in `['profiles']` cache, skips owner POST and proceeds to child POST. [HIGH-4] |
| Child POST fails after owner POST succeeded | Network error mid-flight | Inline error banner + Retry button | Retry hits the same `submit()` — resume guard skips re-creating the owner; child POST retried. [HIGH-4] |
| `setActive` succeeds but gate has stale preview state, user already has a profile | Sign-out → sign-in cycle with the same browser/session | Tabs render normally | `(app)/_layout.tsx` cleanup effect clears the SecureStore key when `activeProfile && profiles.length > 0`. Wizard is not reached. |
| `pending-auth-redirect` lost on native cold-start | Process killed during OAuth round-trip | CreateProfileGate flash possible | Gate's async preview-state probe resolves `present` → `<Redirect>` to wizard. The pending-auth-redirect is a web-only optimization; native does not depend on it. [HIGH-1] |
| Underage account-holder tries to set up a child | User enters birth year putting them at < 18 while `needsChild` (target ∈ `child` \| `both`) | Continue button disabled + inline warning at `save-basics-adult-required` explaining 18+ requirement and pointing back to the "My learning" branch | Client gate blocks submission. User can either (a) change birth year to ≥18 (only acceptable if it was a typo), or (b) go back to Step 1 and re-select target = `self`. Server has NO 18+ check ([HIGH-D3]), so the client is the only barrier. [HIGH-A3 / HIGH-B2] |
| Wizard mounted while signed-out (token expired mid-OAuth) | Clerk session lapse between probe and mount | `<Redirect>` to `/sign-in` from the layout's `!isSignedIn` branch — wizard never reaches `useEffect` | Wizard branch sits AFTER `!isSignedIn` in gate ordering. Preview-state key survives on SecureStore through TTL, so re-signin lands back in wizard. [CRITICAL-A3] |
| Underage owner attempts to link child (server, defense-in-depth) | Client gate bypassed (flag off on mobile, mobile build older than gate, or direct API call) — request reaches server with isFirstProfile=false and existing owner is < 18 | API returns 403 with `apiCode: ADULT_OWNER_REQUIRED`; mobile renders the existing `save-basics-error` view via `formatApiError(err)` showing "Account holder must be 18 or older to add a child profile." | User goes back to wizard Step 1 and re-selects target = `self`, OR (if the underage status is a birth-year typo) corrects it. No data created — the rule throws before insert. Server flag toggle (`config.ADULT_OWNER_GATE_ENABLED = false`) is the emergency kill switch. [OPT-C / Task 13b] |
| Adult-owner gate flag off + underage user creates owner+child | Both `FEATURE_FLAGS.ADULT_OWNER_GATE_ENABLED` (mobile) AND `config.ADULT_OWNER_GATE_ENABLED` (API) are false | Account created with underage owner and linked child; 11+ floor still enforced. Identical to today's behaviour. | NOT a recovery — this is a configuration outcome, acceptable only when the gates are deliberately turned off (e.g. emergency rollback because the gate caused a regression). To restore protection, flip the API flag to true (takes effect immediately, no redeploy required if config is read per-request). [OPT-C] |
| Server flag ON + client flag OFF + underage user attempts wizard | API enforces 18+; mobile build has UI gate disabled (mismatched flag state) | Client allows submission (no inline warning, Continue enabled); server rejects parent-or-child POST with 403 `ADULT_OWNER_REQUIRED`; the `save-basics-error` view surfaces "Account holder must be 18 or older to add a child profile." | User returns to wizard Step 1 and re-selects target = `self`, or corrects birth year if it was a typo. The mismatch is itself a release-coordination bug to flag — the mobile build should be brought into sync. [OPT-C] |

---

## Task 14: Save Wizard — Step 3 (Confirm + Landing + First Session Handoff)

**Files:**
- Modify: `apps/mobile/src/app/(app)/preview/save.tsx`
- Modify: `apps/mobile/src/app/(app)/preview/save.test.tsx`

> **Spike outcome (resolved 2026-05-19 in Task 0):** Dual landing keyed off the wizard's `target` flag.
> - `target = self` (and `both` with `bothPriority = self_first`) → land in a session via the session-start helper (path: fill in once Task 0 Step 1 grep result is recorded; default expectation is `apps/mobile/src/hooks/use-create-session.ts`).
> - `target = child` (and `both` with `bothPriority = child_first`) → `router.replace('/(app)/home')`. Saved topic surfaces as a card on home; "Add child" CTA is what closes the loop for this branch.
> - CTA copy: `'Start lesson'` on the self-leaning branches, `'Open parent home'` on the child-leaning branches.

> Hard Rule: use `router.replace` on landing so the preview stack is cleared (AC 13). Intra-wizard hops earlier are `setStep(...)` state changes, not router pushes.

- [ ] **Step 1: Write failing tests.**

```tsx
it('self target: replaces history with first session route on success', async () => {
  // After step 2 completes for self target, step 3 fires:
  //   - switchProfile(parent.id)
  //   - clearPreviewState
  //   - start session with topicText (per spike outcome)
  //   - router.replace(sessionRoute)
  // OR (option b): router.replace('/(app)/own-learning' or wherever) + topic dropped.

  const replace = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({ replace, push: jest.fn() });
  await setPreviewState({
    intent: 'self', path: 'learner_value_prop',
    topicText: 'algebra', createdAt: new Date().toISOString(),
  });
  mockProfilesPost({ profile: makeOwnerProfile({ id: 'p1' }) });
  // ...drive through steps 1 + 2...

  await waitFor(() => {
    // [MEDIUM-D3 / Task 0 resolution] Self target lands in a session via the
    // session-start helper. Assert the session route shape precisely — NOT
    // a loose /(app)/ glob (would also match /home, which is the wrong
    // branch for self).
    expect(replace).toHaveBeenCalledWith(
      expect.stringMatching(/^\/\(app\)\/own-learning\/session(\/|$)/),
    );
  });
});

it('parent target: replaces history with parent home', async () => {
  const replace = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({ replace, push: jest.fn() });
  await setPreviewState({
    intent: 'child', path: 'parent_value_prop',
    createdAt: new Date().toISOString(),
  });
  // ...drive to step 3...
  await waitFor(() => {
    expect(replace).toHaveBeenCalledWith('/(app)/home');
  });
});

it('clears preview state on save completion', async () => {
  await setPreviewState({ intent: 'self', path: 'learner_value_prop', createdAt: new Date().toISOString() });
  // ...drive to landing...
  await waitFor(async () => {
    const { getPreviewState } = await import('../../../lib/preview-onboarding-state');
    expect(await getPreviewState()).toBeNull();
  });
});

it('session-start failure falls through to home with error surfaced', async () => {
  // Only meaningful in option (a). Skip if option (b) was chosen.
  // ...
});
```

- [ ] **Step 2: Run; confirm fail.**

- [ ] **Step 3: Implement `ConfirmStep`.**

Pseudocode for option (a) — adjust to actual helper:

```tsx
function ConfirmStep({
  target,
  previewState,
  created,
  router,
}: {
  target: SaveTarget;
  previewState: PreviewOnboardingStateV0;
  created: { parent: Profile; child?: Profile };
  router: ReturnType<typeof useRouter>;
}) {
  const { switchProfile } = useProfile();
  const [landing, setLanding] = useState(false);
  const [landingError, setLandingError] = useState<string | null>(null);

  const cta = target === 'self' || (target === 'both' && previewState.bothPriority === 'self_first')
    ? 'Start lesson'
    : 'Open parent home';

  const onLand = useCallback(async () => {
    if (landing) return;
    setLanding(true);
    try {
      const sw = await switchProfile(created.parent.id);
      if (!sw.success) {
        setLandingError(sw.error ?? 'Could not switch profile.');
        return;
      }

      await clearPreviewState();

      // [Task 0 resolution] Dual landing on wizard target flag.
      const isSelfBranch =
        target === 'self' ||
        (target === 'both' && previewState.bothPriority === 'self_first');

      if (isSelfBranch) {
        // Self / kid-with-own-profile / solo-adult: land in a session for the saved topic.
        // Helper accepts { topicText } and resolves to { sessionId } on success.
        const result = await startSessionForTopic({
          topicText: previewState.topicText ?? null,
        });
        if ('error' in result) {
          // Session-start failure falls through to home with the error surfaced
          // via the existing landingError UI block. Do NOT silently swallow.
          setLandingError(result.error);
          router.replace('/(app)/home');
          return;
        }
        router.replace(`/(app)/own-learning/session/${result.sessionId}`);
      } else {
        // Parent branch (target=child or both with child_first): the child profile
        // does not exist yet at this point in the flow, so a session would attach
        // to the wrong profile. Land on home where the "Add child" CTA closes
        // the loop and the saved topic surfaces as a card.
        router.replace('/(app)/home');
      }
    } catch (err) {
      setLandingError(formatApiError(err));
    } finally {
      setLanding(false);
    }
  }, [landing, switchProfile, created.parent.id, target, previewState, router]);

  return (
    <View>
      <Text className="text-h3 font-semibold text-text-primary mb-2">
        {target === 'self' || target === 'both'
          ? `Your first lesson is ready${previewState.topicText ? `: ${previewState.topicText}` : ''}.`
          : "Your child's profile is set up. Let's open parent home."}
      </Text>
      {landingError && (
        <View className="bg-danger/10 rounded-card px-4 py-3 mb-3">
          <Text className="text-danger text-body-sm">{landingError}</Text>
        </View>
      )}
      <Pressable
        onPress={() => void onLand()}
        disabled={landing}
        className={`rounded-button py-3.5 items-center ${landing ? 'bg-primary/40' : 'bg-primary'}`}
        testID="save-confirm-land"
        accessibilityRole="button"
      >
        {landing ? <ActivityIndicator color="white" /> : (
          <Text className="text-body font-semibold text-text-inverse">{cta}</Text>
        )}
      </Pressable>
    </View>
  );
}
```

Add imports: `clearPreviewState` from `preview-onboarding-state`, `useProfile` from `../../../lib/profile`, `formatApiError` (already imported), and `startSessionForTopic` from the session-start helper resolved in Task 0 Step 1 (likely `../../../hooks/use-create-session`).

- [ ] **Step 4: Run tests; confirm pass.**

- [ ] **Step 5: Manual smoke (one of the two paths in the Expo web preview).**

```bash
cd apps/mobile && pnpm run dev:web   # or whatever the project's dev command is
```

Walk: sign-in → Try MentoMate → Me → topic "algebra" → learner value-prop → Sign up → verify → save wizard → name + year → Continue → confirm → Start lesson. Assert lands on session/home appropriately.

- [ ] **Step 6: Commit via `/commit`.**

---

## Task 15: Wire All Acceptance Criteria With a Coverage Sweep

**Files:**
- Re-read: `docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md` §Acceptance Criteria
- All tests added in Tasks 1-14.

- [x] **Step 1: Map every AC to a test (or note "covered by E2E in Task 16").**

**Verified mapping (2026-05-20).** Wizard tests live in `(app)/_layout.test.tsx` because per `[CRITICAL-A2]` the wizard ships inline in the layout (not as a nested `preview/save.tsx` route — the plan's earlier wording predates the inline decision).

| AC | What it asserts | Test (file → describe → it) | Status |
|---|---|---|---|
| 1 | Intent renders 4 options, no chat shell | `preview/intent.test.tsx` → `Preview IntentScreen` → 4 routing tests cover all options. The screen is a pure `View` with no chat surface; "no chat shell" is structurally guaranteed and verified by `value-prop.test.tsx`'s explicit `does not render a chat shell or any LLM-driven element`. | ✅ |
| 2 | Me + topic → static learner value-prop, sample marker, no LLM | `preview/value-prop.test.tsx` → `learner variant renders sample dialogue marked as sample` + `does not render a chat shell or any LLM-driven element` | ✅ |
| 3 | My child → parent value-prop + CTA copy | `preview/value-prop.test.tsx` → `parent variant renders sample weekly insight marked as sample` + `CTA routes to sign-up` | ✅ (CTA destination asserted; exact CTA copy not pinned by string — variant prop selects copy) |
| 4 | Auth returns to save wizard, not CreateProfileGate | `(app)/_layout.test.tsx` → `AppLayout no-profile gate — preview branch` → `renders the SaveWizardGate when preview state exists and flag is on` | ✅ |
| 5 | Wizard child→self override (only owner created) | `(app)/_layout.test.tsx` → `SaveWizard — Step 1` → `overrides intent when user picks a different target` (generic; covers both directions) | ✅ |
| 6 | Wizard self→child override | Same generic test as AC 5 — `overrides intent when user picks a different target` | ✅ |
| 7 | Parent lands on parent home + `isFamilyCapableProfile` true | Landing → `(app)/_layout.test.tsx` → `SaveWizard — Step 3` → `child target: replaces history with /(app)/home on CTA press`. Helper → `profile.test.ts` → `isFamilyCapableProfile` (5 cases). Composition coverage; the test does not chain these into a single assertion. | ✅ (composition) |
| 8 | Solo owner lands on learner home | Landing → `SaveWizard — Step 3` → `self target: replaces history with session route on CTA press` lands at `/(app)/session`, and `resolveTabShape` → `returns learner for a solo owner with no linked profiles` proves the tab shape. (Self-branch lands in *session* per Task 0 resolution — stronger than the spec's "learner home" claim; tab shell remains learner.) | ✅ (composition) |
| 9 | Parent ok, child fails, no rollback | Step 3 `switchProfile failure surfaces error in landing error block` covers landing-time failure. The specific scenario — owner POST succeeds + child POST fails mid-Step-2 with the `[HIGH-4]` resume guard skipping re-creation of the owner on retry — has implementation in `_layout.tsx` (`createdOwnerProfileId` cache check) but **no dedicated test**. | ⚠️ **Gap — see follow-up below** |
| 10 | 1-hour TTL expiry | `preview-onboarding-state.test.ts` → `treats expired key as absent` | ✅ |
| 11 | Sign-out clears key | `sign-out-cleanup.test.ts` → `clears mentomate_preview_intent on sign-out` | ✅ |
| 12 | No preview state → CreateProfileGate unchanged | Pre-existing `AppLayout` describe block covers no-profile fallback to `CreateProfileGate`. The new preview branch only activates when state is present (gated by `previewProbeState === 'present'` in `_layout.tsx`), so a missing state preserves the original behaviour by construction. | ✅ (structural) |
| 13 | `router.replace` on landing | `SaveWizard — Step 3` → both `self target …` and `child target …` tests assert `router.replace`, not `router.push` | ✅ |
| 14 | Back returns to topic/intent + topic preserved | Deferred to E2E (Task 16). Topic preservation is exercised structurally by `preview-onboarding-state.test.ts` (`writes in-memory and to SecureStore`); the Back-button stack behaviour is platform-level and verified end-to-end. | ⏸ E2E deferred |
| 15 | Flag off: no CTA, no route, gate falls through | `sign-in.test.tsx` → `SignInScreen — Try MentoMate CTA` → `hides the CTA when flag is off`; `(app)/_layout.test.tsx` → `falls through to CreateProfileGate when flag is off, even with stale preview state` | ✅ |
| 16 | Navigation discipline (push for hops, replace for landing) | Hops: `preview/intent.test.tsx`, `preview/topic.test.tsx`, `preview/value-prop.test.tsx` all assert `push`. Landing: `_layout.test.tsx` Step 3 tests assert `replace`. Behavioural; no grep-over-source test. | ✅ |

**Gap follow-up (AC 9 — open after this PR lands):**
- Add a Step 2 test to `(app)/_layout.test.tsx` → `SaveWizard — Step 2 (Profile Basics)`: scenario `[HIGH-4] resumes from createdOwnerProfileId on retry after child POST fails`. Drive Step 2 once with success for the parent POST + failure for the child POST → assert error surfaced + parent profile present in cache + retry skips the re-create-parent call.
- File: `apps/mobile/src/app/(app)/_layout.test.tsx`.
- Estimate: ~30 min — the resume guard implementation already exists; this is test-only.
- Why deferred from this PR: the audit caught it after wave 5b shipped; surfacing it here without ballooning Task 15's scope keeps the audit honest. Per CLAUDE.md "Sweep when you fix": this is the only gap, so a single follow-up issue (not a new lint guard) is the proportionate response.

- [ ] **Step 2: Cover AC 16 behaviorally inside existing route tests.** [MEDIUM-1]

NO grep-over-source test. Source-scanning tests are fragile under different Jest CWDs, over-enforce (block any future legitimate `router.replace` in retry/recovery branches), and add no behavioral signal beyond what the existing render tests already cover.

Instead, the existing route tests already assert the correct method:
- `preview/intent.test.tsx`, `preview/topic.test.tsx`, `preview/value-prop.test.tsx` — all assert `push` was called with the expected target (added in Tasks 7, 8, 9).
- `(app)/preview/save.test.tsx` — Task 14 already asserts `replace` was called with the landing route.

Sweep those tests once: confirm every navigation assertion uses the matching method (`push` for hops, `replace` for landing). If any test was written with the wrong assertion, fix it now — that is the AC-16 verification step.

- [ ] **Step 2b: Telemetry gap (deferred follow-up).** [MEDIUM-C3]

This plan ships ZERO funnel events. Per CLAUDE.md's `safeSend()` convention for non-core dispatches (`apps/api/src/services/safe-non-core.ts`), conversion-critical flows like trial onboarding MUST emit funnel events or the feature is unmeasurable post-launch. The shape of the follow-up:

- Events: `preview_intent_seen`, `preview_intent_selected` (with `intent` payload), `preview_topic_submitted`, `preview_value_prop_seen` (with `path` payload), `preview_signup_started`, `preview_signup_completed`, `save_wizard_step_1`, `save_wizard_step_2`, `save_wizard_step_3`, `save_wizard_completed` (with `target` + `parent_profile_id` + `child_profile_id?`).
- Discovery step: grep `apps/mobile/src/lib/` for existing analytics modules — PostHog, Amplitude, Segment, or a thin in-house dispatcher. Mirror the existing pattern; do not invent a new analytics surface.
- Why deferred from this PR: the analytics conventions aren't grounded in this plan and the spec doesn't specify event names; this is a discovery + design follow-up, not a code follow-up. Open a Notion task immediately after merge so it doesn't fall through. Without these events the funnel-conversion measurement that justifies the feature can't be done.

- [ ] **Step 3: Run full mobile test sweep for changed files.**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/lib/feature-flags.ts \
  src/lib/profile.ts \
  src/lib/preview-onboarding-state.ts \
  src/lib/sign-out-cleanup.ts \
  src/app/preview/index.tsx \
  src/app/preview/intent.tsx \
  src/app/preview/topic.tsx \
  src/app/preview/value-prop.tsx \
  'src/app/(auth)/sign-up.tsx' \
  'src/app/(auth)/sign-in.tsx' \
  'src/app/(app)/_layout.tsx' \
  'src/app/(app)/preview/save.tsx' \
  --no-coverage
```
Expected: all pass.

- [ ] **Step 4: Typecheck + lint.**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
```

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 16: E2E Smoke Flows (Maestro)

**Files:**
- Create: `apps/mobile/e2e/preview-self.yaml`
- Create: `apps/mobile/e2e/preview-parent.yaml`
- Create: `apps/mobile/e2e/preview-both-child-first.yaml`
- Create: `apps/mobile/e2e/preview-override-target.yaml`
- Create: `apps/mobile/e2e/preview-expired-state.yaml`

> If the E2E directory layout differs, find existing flows via `ls apps/mobile/e2e` or wherever `.yaml` Maestro flows live. Mirror their structure (waitForAnimationToEnd, testID selectors, adb reverse setup) rather than copying from this plan literally.

- [ ] **Step 1: Bring up E2E infra.**

Memory pointer: `project_e2e_emulator_infra.md` / `feedback_agent_owns_e2e_infra.md`. Agent owns emulator + Metro + proxy + adb-reverse. Start the device, install the app, point at the staging API as configured in existing E2E flows.

- [ ] **Step 2: Write each flow.**

Flow 1 — Self learner:
- Launch app
- Tap testID `try-mentomate-cta`
- Tap testID `preview-landing-continue`
- Tap testID `intent-self`
- Input "algebra basics" into testID `preview-topic-input`
- Tap testID `preview-topic-continue`
- Assert testID `preview-value-prop-learner` visible
- Assert testID `preview-sample-marker` visible
- Tap testID `preview-signup-cta`
- Drive Clerk signup with a fresh email seeded via test helper
- After auth, assert testID `save-wizard-step-1`
- Assert testID `save-target-self` is selected
- Tap testID `save-wizard-step-1-continue`
- Input name + birth year
- Tap testID `save-basics-continue`
- Tap testID `save-confirm-land`
- Assert lands on the session route (whatever the topic-prefill spike resolved to) OR `/(app)/home` per option (b).

Flow 2 — Parent:
- ...intent-child, value-prop parent variant, signup, save wizard with `save-target-child` preselected, parent + child basics, lands on `/(app)/home` rendered as parent home.

Flow 3 — Both child-first: as spec §User Flow → Both.

Flow 4 — Save target overrides intent: pick `child` pre-signup, switch to `save-target-self` in wizard, assert only owner profile created (query API or assert UI shows learner home + no children).

Flow 5 — Expired state: requires a dev/E2E-only seed mechanism. [LOW-1] Use `seedPreviewStateForTesting(state, staleMs)` from Task 3 (mirrors the existing `seedPendingAuthRedirectForTesting` pattern, gated by `EXPO_PUBLIC_E2E === 'true'`). Expose it through a debug-only screen or RN dev-menu hook so a Maestro flow can trigger it; then launch app, assert lands at intent screen (key deleted lazily on read).

- [ ] **Step 3: Run smoke locally.**

```bash
# Use the project's Maestro invocation — check existing scripts.
# Example shape:
# maestro test apps/mobile/e2e/preview-self.yaml
```

- [ ] **Step 4: Fix selector mismatches and stabilization issues.**

Common: missing `waitForAnimationToEnd`, missing testIDs (add them to source if forgotten). Do not loosen assertions — fix the code or the selector chain.

- [ ] **Step 5: Commit via `/commit`.**

---

## Task 17: Run Required Validation

> CLAUDE.md "Required Validation": integration tests when changing auth/profile scoping. Pre-commit hooks cover lint/typecheck/surgical tests automatically.

- [ ] **Step 1: Run API integration tests (auth/profile-scoping changed via new flow that hits `POST /profiles`).**

```bash
pnpm exec nx run api:test -- --testPathPattern integration
```
Expected: pass (no API changes, but the flow exercises the existing route).

- [ ] **Step 2: Run cross-package integration tests.**

```bash
pnpm exec nx run-many -t test -- --testPathPattern integration --no-coverage
```
Expected: pass.

- [ ] **Step 3: Run `bash scripts/check-change-class.sh --run --fast`.**

```bash
bash scripts/check-change-class.sh --run --fast
```
Expected: clean.

- [ ] **Step 4: Self-review the diff.**

```bash
git diff main..HEAD --stat
```

For each non-trivial file in the diff, open it and verify:
- No `eslint-disable` snuck in.
- No `jest.mock('./...')` of internal modules (GC1 / GC6).
- No bare `['profiles']` invalidations — must use predicate (`q.queryKey[0] === 'profiles'`). [MEDIUM-6] Note: `apps/mobile/src/app/create-profile.tsx:184` currently uses a bare-key invalidation; it works because the `useProfiles` query key is currently `['profiles', userId]` and the bare key still matches a prefix. This plan adopts the predicate convention for new code. The existing site is a deferred sweep, not blocked by this PR.
- No `key={themeKey}` on root layouts.
- No persona checks or hardcoded hex colors in shared components.

- [ ] **Step 5: Final commit (if any review fixes needed) via `/commit`.**

---

## Done Criteria

- All Tasks 1-17 boxes ticked.
- Spec ACs 1-16 each have a passing test (unit or E2E).
- `PREVIEW_ONBOARDING_ENABLED = false` flip verified: CTA gone, save wizard not reachable, `CreateProfileGate` unchanged.
- Sibling Study/Family v0 spec can import `isFamilyCapableProfile` without code changes.
- No new `jest.mock('./...')` (GC1 ratchet).
- Pre-commit + pre-push hooks pass on every commit (do NOT use `--no-verify`).

Do NOT open a PR unless the user explicitly asks (memory: `feedback_no_pr_unless_asked.md`).
Do NOT push an OTA update (memory: `feedback_no_ota_unless_asked.md`).
