# Parent Home as Primary Surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the parent Home into a JTBD intent picker mirroring the student home's craft, delete the Family tab, add a Progress-tab segmented control for parents, and ship a minimum-viable Nudge feature (parent → child encouragement messages with consent + rate-limit + quiet-hours gates).

**Architecture:** Two coordinated workstreams in one branch:
1. **Mobile UI reshape (no schema impact):** extract `useLinkedChildren()` hook into `apps/mobile/src/lib/profile.ts`; replace the parent branch of `LearnerScreen.tsx` with a JTBD picker (4–5 cards) that routes to existing destinations; delete `apps/mobile/src/app/(app)/family.tsx` and remove the Family tab from `_layout.tsx`; relocate the family-pool sharing toggle to the More tab; register `weekly-report` in the child stack and add `unstable_settings.initialRouteName = 'index'`; centralize the proxy-mode-clear in `useProfile()`'s active-profile setter; add a one-time SecureStore-backed transition notice with sign-out-cleanup registration.
2. **Nudge feature (full-stack):** new `nudges` table via Drizzle migration; four API routes (`POST /nudges`, `GET /nudges?unread=true`, `PATCH /nudges/:id/read`, `POST /nudges/mark-read`) gated on `assertParentAccess` + recipient consent (joined from `consent_states`, **not** a property on `profiles`) + a 3-per-recipient-per-rolling-24h rate limit (scope: per `toProfileId` regardless of sender, so a child never receives more than 3 nudges/day from any combination of linked parents); push allowed only inside the recipient's local 07:00–21:00 window (TZ from `profiles.timezone`, fallback to parent TZ); silent suppression emits a structured metric so failure is queryable; consent-withdrawal soft-clear in the existing WITHDRAWN workflow with a red-green break test; convert `NotificationPayload` to a discriminated union and add a `data: Record<string, string>` channel before adding the `'nudge'` variant; nudges bypass the global `MAX_DAILY_PUSH = 3` cap (user-initiated, not system-generated); parent-side action sheet (non-optimistic) and kid-side banner (consent re-check before render).

**Tech Stack:** TypeScript, Expo Router, React Native, React Query, Drizzle ORM (Neon Postgres / neon-serverless), Hono RPC, Inngest, Zod (`@eduagent/schemas`), Jest (integration), Maestro (E2E), i18n via existing locale files (en, de, es, ja, nb, pl, pt).

**Branch:** Confirm with user before starting. Spec lives at `docs/specs/2026-05-10-parent-home-as-primary-surface.md` — re-read it whenever a task references "see spec".

**Commit cadence:** One commit per task by default; phase-end is a natural pause point. Use `/commit` only — never `/zdx:commit`.

---

## Phase Map (commit boundaries)

| Phase | Surface | Reversible without schema work? |
|---|---|---|
| 1 | Hook extraction (`useLinkedChildren()`) + LearnerScreen migration + `SoloLearnerScreen` extraction + integration-test gate | yes |
| 2 | Move family-pool sharing toggle into More; delete `family.tsx` + Family tab | yes |
| 3 | Parent JTBD Home picker (cards 1–5, FamilyOrientationCue copy, WithdrawalCountdownBanner placement) | yes |
| 4 | Cross-stack nav fixes: register `weekly-report` route + `unstable_settings`; ancestor-chain push helper | yes |
| 5 | Regression guards for proxy-mode switch-back into own-learning (no centralization work — already done; see phase header) | yes |
| 6 | Solo-to-parent transition notice + SecureStore key + sign-out-cleanup registration | yes |
| 7 | Progress tab segmented control for parents | yes |
| 8 | **Task 8.0:** schema-package prerequisites (`ConsentRequiredError`, `NotificationPayload` discriminated union, push `data` channel). **Tasks 8.1–8.7:** nudges table + migration + 4 routes + consent gate (joined from `consent_states`) + per-recipient rate-limit + quiet-hours metric + `MAX_DAILY_PUSH` bypass + withdrawal cleanup with red-green break test | requires migration |
| 9 | Nudge mobile parent: action sheet + non-optimistic toast + Home wire-up | yes |
| 10 | Nudge mobile kid: push receiver case + banner (consent re-check via `useConsentStatus`) + unread modal (bulk mark-read) | yes |
| 11 | i18n keys × 7 locales (all 7 required, no en fallback) + E2E suite updates | yes |

Phases 1–7 are pure UI. Phase 8 introduces the only schema change. Phases 9–10 light up the nudge UX. Phase 11 closes coverage.

---

## File Structure

### Created files

| Path | Responsibility |
|---|---|
| `apps/mobile/src/components/home/SoloLearnerScreen.tsx` | Extracted solo-learner body (greeting, quota, intent picker, subjects) lifted verbatim from `LearnerScreen.tsx`. Mounted directly by both the Home tab's solo branch and the `/home/own-learning` route. No `forceSoloBranch` prop indirection. |
| `apps/mobile/src/components/home/ParentHomeScreen.tsx` | Parent JTBD picker — header, "What do you need right now?" section, 4–5 cards rendered in spec order. Owns the parent branch of Home; mirrors `LearnerScreen.tsx`'s craft. |
| `apps/mobile/src/components/home/ParentHomeScreen.test.tsx` | Unit tests for ParentHomeScreen rendering rules: card order, conditional active-session card, multi-child fan-out, neutral fallbacks. |
| `apps/mobile/src/components/home/ParentTransitionNotice.tsx` | One-time inline notice on first render after solo→parent transition, dismissible, persists via SecureStore. |
| `apps/mobile/src/components/home/ParentTransitionNotice.test.tsx` | Unit tests for show-once behavior, dismiss persistence, and sign-out-reset behavior. |
| `apps/mobile/src/components/progress/ProgressPillRow.tsx` | Horizontally-scrollable segmented control rendered above the Progress tab when `useLinkedChildren()` returns ≥1. Pills: one per child by `family_links.createdAt`, then "Mine". Default selected = first child. Auto-scrolls active pill into view. |
| `apps/mobile/src/components/progress/ProgressPillRow.test.tsx` | Unit tests for default selection, scroll-into-view, locale overflow. |
| `apps/mobile/src/components/nudge/NudgeActionSheet.tsx` | Parent-side action sheet with 4 templates, in-flight indicator on selected row, non-optimistic toast. Renders inline rate-limit and consent-pending errors. |
| `apps/mobile/src/components/nudge/NudgeActionSheet.test.tsx` | Unit tests for non-optimistic flow, error rendering, cancel. |
| `apps/mobile/src/components/nudge/NudgeBanner.tsx` | Kid-side banner on Home, re-checks consent before render, unread-count badge. |
| `apps/mobile/src/components/nudge/NudgeBanner.test.tsx` | Unit tests for consent re-check, count badge. |
| `apps/mobile/src/components/nudge/NudgeUnreadModal.tsx` | Modal listing all unread nudges; mark-read on dismiss. |
| `apps/mobile/src/hooks/use-nudges.ts` | React Query hooks: `useSendNudge()`, `useUnreadNudges()`, `useMarkNudgeRead()`. |
| `apps/mobile/src/hooks/use-nudges.test.ts` | Hook tests against mocked Hono client. |
| `apps/api/src/routes/nudges.ts` | Four routes: `POST /nudges`, `GET /nudges?unread=true`, `PATCH /nudges/:id/read` (single), `POST /nudges/mark-read` (bulk, single transaction). |
| `apps/api/src/routes/nudges.integration.test.ts` | Integration tests: rate-limit boundary, consent gate, ownership, quiet-hours suppression, withdrawal cleanup, family-link-removed filter. |
| `apps/api/src/services/nudge.ts` | Nudge service: write, list-unread, mark-read, rate-limit query, quiet-hours check. Route handler delegates here. |
| `apps/api/src/services/nudge.test.ts` | Unit tests for the service helpers. |
| `apps/api/drizzle/migrations/<NNNN>_create_nudges_table.sql` | Drizzle migration: create `nudges` table + index `(toProfileId, readAt)`. |
| `packages/db/src/schema/nudges.ts` | Drizzle table definition for `nudges`. |

### Modified files

| Path | Change |
|---|---|
| `apps/mobile/src/lib/profile.ts` | Add `useLinkedChildren(): Profile[]` and `useHasLinkedChildren(): boolean` hooks. |
| `apps/mobile/src/lib/profile.test.tsx` | Add tests for the new hooks; add break test asserting `mentomate_parent_home_seen` is wiped on sign-out (alongside existing cross-account-leak break test). |
| `apps/mobile/src/components/home/LearnerScreen.test.tsx` | Update existing tests to cover the new branching; remove parent-branch assertions that no longer apply (the parent branch is now `ParentHomeScreen.tsx`'s responsibility). |
| `apps/mobile/src/app/(app)/family.tsx` | **Delete.** |
| `apps/mobile/src/app/(app)/family.test.tsx` | **Delete.** |
| `apps/mobile/src/app/(app)/_layout.tsx` | Remove the `family` tab from the bottom-nav `Tabs.Screen` list. |
| `apps/mobile/src/app/(app)/more/index.tsx` | Add a settings row that mounts the family-pool breakdown-sharing toggle (reuses existing `useFamilyPoolBreakdownSharing` and `useUpdateFamilyPoolBreakdownSharing` hooks). |
| `apps/mobile/src/app/(app)/more/index.test.tsx` | Add tests covering the toggle row's render + write. |
| `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` | Register `weekly-report` as a `Stack.Screen`; export `unstable_settings = { initialRouteName: 'index' }`. |
| `apps/mobile/src/app/(app)/child/[profileId]/_layout.test.tsx` | Assert `weekly-report` route is reachable + back-arrow returns to `index`. |
| `apps/mobile/src/app/(app)/progress.tsx` | Mount `<ProgressPillRow />` above the existing progress content when `useHasLinkedChildren()` returns true; thread `targetProfileId` into per-profile fetch. |
| `apps/mobile/src/app/(app)/progress.test.tsx` | Add tests covering pill swap behavior. |
| `apps/mobile/src/lib/sign-out-cleanup-registry.ts` | Register `mentomate_parent_home_seen` SecureStore key in the cleanup list. |
| `apps/mobile/src/lib/profile.ts` | Centralize `parent-proxy-active` clear inside the active-profile setter (or the navigation helper that owns it — see Phase 5 task for the exact site). Today the clear lives at the call sites. |
| `packages/schemas/src/notifications.ts` | **CREATE** — file does not exist today. New `NotificationPayload` Zod discriminated union with one variant per existing `type` plus a new `'nudge'` variant carrying `data: { nudgeId, fromDisplayName, templateKey }`. Replaces the inline interface at `apps/api/src/services/notifications.ts:25–48`. |
| `packages/schemas/src/errors.ts` | Add `ConsentRequiredError` (does not exist today). `RateLimitedError`, `ForbiddenError`, `ResourceGoneError` already exist — confirmed. |
| `packages/schemas/src/index.ts` | Re-export the new nudge types + `ConsentRequiredError`. |
| `apps/api/src/services/notifications.ts` | (a) Replace the inline `NotificationPayload` interface with the schema-package import. (b) Add a `data: Record<string, string>` channel forwarded to the Expo POST body — today only `title`/`body`/`type` are forwarded, so the kid client cannot route on `nudgeId`. (c) Add a `skipDailyCap?: boolean` option to bypass `MAX_DAILY_PUSH = 3` for nudges (user-initiated). (d) Add the `'nudge'` case. |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | Becomes a thin two-way branch: `useHasLinkedChildren()` → `<ParentHomeScreen />`, else → `<SoloLearnerScreen />`. No `forceSoloBranch` prop. The solo body lives in `SoloLearnerScreen.tsx` (created above). |
| `apps/api/src/services/notifications.test.ts` | Add tests for the `'nudge'` case + quiet-hours suppression. |
| `apps/api/src/inngest/functions/<consent-withdrawal>.ts` | Bulk-set `readAt = now()` on all unread nudges to the affected child within the same transaction as the WITHDRAWN transition. (Path TBD in Task 8.7.) |
| `apps/api/src/inngest/functions/<consent-withdrawal>.integration.test.ts` | Test that pending-unread nudges are soft-cleared when consent withdraws. |
| `apps/mobile/src/hooks/use-push-notifications.ts` | Add a `'nudge'` handler in the push-receiver switch; route to Home with the banner ready. (Confirm filename in Task 10.1.) |
| `apps/mobile/locales/<locale>/common.json` × 7 | New keys: `home.parent.greeting`, `home.parent.intentHeader`, `home.parent.cards.checkChild`, `home.parent.cards.weeklyReport`, `home.parent.cards.sendNudge`, `home.parent.cards.continueOwn`, `home.parent.cards.openSession`, `home.parent.transitionNotice`, `nudge.templates.youGotThis`, `nudge.templates.proudOfYou`, `nudge.templates.quickSession`, `nudge.templates.thinkingOfYou`, `nudge.toast.sent`, `nudge.error.rateLimit`, `nudge.error.consentPending`, `nudge.banner.title`, `nudge.banner.unreadCount`. Each locale owns full sentence shape — no naive English templates with name-slot. |
| `apps/mobile/e2e/<parent-journey>.yaml` | Update existing parent flows to use Home cards (not Family tab); add new flows: solo-to-parent transition, send nudge, hit cap, segmented-control swap, cross-stack nav. (Path confirmed in Task 11.4.) |

### Deleted files

- `apps/mobile/src/app/(app)/family.tsx`
- `apps/mobile/src/app/(app)/family.test.tsx`
- (Any Maestro flow file dedicated to the Family tab, if its assertions are now duplicated by the Home-card-route flows. Inventory in Task 11.4.)

---

## Pre-Flight Verification (do before Phase 1)

- [ ] **Step P-0.1: Confirm branch**

Run:
```powershell
git branch --show-current
```
Expected: A working feature branch (not `main`/`master`). If on a base branch, ask the user which branch to use. Per `feedback_never_switch_branch.md`, never switch unilaterally.

- [ ] **Step P-0.2: Re-read the spec**

Read `docs/specs/2026-05-10-parent-home-as-primary-surface.md` end to end. Each task in this plan defers design details to the spec; if ambiguity arises during a task, the spec is canonical, not this plan.

- [ ] **Step P-0.3: Locate the live `linkedChildren` filter**

Run:
```powershell
git grep -n "linkedChildren" apps/mobile/src/components/home/LearnerScreen.tsx
```
Expected output (today): lines around 126–138 and 509. Confirms the inline filter we will migrate in Phase 1.

- [ ] **Step P-0.4: Locate today's family-pool toggle**

Run:
```powershell
git grep -n "useFamilyPoolBreakdownSharing" apps/mobile/src/app/(app)/family.tsx
```
Expected: one render + one mutation call (lines around 22, 205). Confirms the toggle's current home before relocation.

- [ ] **Step P-0.5: Locate the consent-withdrawal workflow**

Run:
```powershell
git grep -nE "consentStatus.*WITHDRAWN|withdrawal" apps/api/src/inngest/functions/
```
Capture the exact file path. Phase 8 Task 8.7 modifies this file. If the transition is committed in a service rather than an Inngest function, capture that path instead.

- [ ] **Step P-0.6: Confirm `packages/schemas/src/notifications.ts` exists**

Run:
```powershell
git ls-files packages/schemas/src/notifications.ts
```
**Verified 2026-05-10: file does not exist.** Today's `NotificationPayload` is a flat `interface { profileId; title; body; type }` declared inline at `apps/api/src/services/notifications.ts:25–48` — not a discriminated union, no per-type payload fields, no `data` channel forwarded to Expo. Task 8.0 (added below, prerequisite to Task 8.2) handles this conversion. Re-run the command above before Task 8.0 in case the file landed in another PR.

- [ ] **Step P-0.7: Locate the consent-status data source**

The plan and spec colloquially say `recipient.consentStatus === 'CONSENTED'` but consent does **not** live on `profiles`. It lives in the `consent_states` table keyed by `(profileId, consentType)` — see `packages/database/src/schema/profiles.ts:217–249`.

Run:
```powershell
git grep -nE "consent_states|consentStates" packages/database/src/schema/
git grep -nE "useConsentStatus|consentStatus" apps/mobile/src/
```
Capture: (a) which `consentType` enum value gates external messages to the child (the same one the WITHDRAWN flow toggles — confirm in Step P-0.5); (b) which mobile hook reads it. Task 8.3 and Task 10.2 must use these, not a non-existent `recipient.consentStatus` property.

- [ ] **Step P-0.8: Confirm whether `linkCreatedAt` is exposed on the mobile `Profile` type**

```powershell
git grep -n "linkCreatedAt" apps/mobile/src/ packages/schemas/src/ apps/api/src/routes/profiles
```
**Expected (today): zero hits.** `family_links.createdAt` exists in the DB schema but is not threaded through to the mobile DTO. The spec pins both Home card order and the Progress pill default-selection to this timestamp; without it threaded, both surfaces silently diverge.

If zero hits, decide one of (resolved before Phase 1):
- (a) Extend the profiles DTO + `@eduagent/schemas` to surface `linkCreatedAt` per child (preferred — single source of truth across surfaces).
- (b) Pin ordering to a different stable field (e.g., `displayName` ascending) and update the spec to match.

Do **not** ship a `// TODO: use createdAt later` placeholder — that creates the silent-drift surface the spec explicitly forbids.

- [ ] **Step P-0.9: Locate the parent's "continue your own learning" data hook**

Step 3.5.1's failing test mocks `useUpNextTopic / equivalent`. Capture the actual hook name today:
```powershell
git grep -nE "useUpNext|lastSubject|continueSubject|recentSubject" apps/mobile/src/
```
If none of these exist, the "Continue your own learning" subtitle has no source of truth — surface to the user before Task 3.5.

---

## Phase 1 — Hook extraction + LearnerScreen migration

### Task 1.1: Add `useLinkedChildren()` and `useHasLinkedChildren()` hooks

**Files:**
- Modify: `apps/mobile/src/lib/profile.ts`
- Test: `apps/mobile/src/lib/profile.test.tsx`

**Spec reference:** spec § "What changes" first bullet; spec § "Implementation notes (terse)" first bullet.

- [ ] **Step 1.1.1: Read the current profile module**

Read `apps/mobile/src/lib/profile.ts` end to end. Identify:
- the `Profile` type or its import,
- the existing `useProfile()` / `useProfiles()` hook(s),
- the existing `activeProfile` accessor.

These are the inputs the new hook composes; do not re-fetch.

- [ ] **Step 1.1.2: Write the failing tests**

Add to `apps/mobile/src/lib/profile.test.tsx`:

```ts
describe('useLinkedChildren', () => {
  it('returns the active profile owner\'s linked children, excluding the owner', () => {
    // Arrange: render a hook wrapper with profiles = [owner, childA, childB] and activeProfile = owner.
    // Assert: returns [childA, childB] in stable order.
  });

  it('returns an empty array when active profile is not an owner', () => {
    // Arrange: activeProfile = childA (isOwner=false).
    // Assert: returns [].
  });

  it('returns an empty array when active owner has no linked children', () => {
    // Arrange: profiles = [owner], activeProfile = owner.
    // Assert: returns [].
  });

  it('orders children by family_links.createdAt ascending', () => {
    // Arrange: childA.linkCreatedAt < childB.linkCreatedAt.
    // Assert: order is [childA, childB].
  });
});

describe('useHasLinkedChildren', () => {
  it('returns true when useLinkedChildren has ≥1 entry', () => {});
  it('returns false when useLinkedChildren is empty', () => {});
});
```

The exact wrapper shape mirrors the existing tests in this file — copy the existing pattern. Do not invent a new harness.

- [ ] **Step 1.1.3: Run the tests to verify they fail**

```powershell
cd apps/mobile; pnpm exec jest --findRelatedTests src/lib/profile.test.tsx --no-coverage
```
Expected: FAIL — `useLinkedChildren is not a function`.

- [ ] **Step 1.1.4: Implement the hooks**

In `apps/mobile/src/lib/profile.ts`:

```ts
export function useLinkedChildren(): Profile[] {
  const { activeProfile } = useProfile();
  const profiles = useProfiles();
  return useMemo(() => {
    if (!activeProfile?.isOwner) return [];
    return profiles
      .filter((p) => p.id !== activeProfile.id && !p.isOwner)
      .sort((a, b) => {
        const aT = a.linkCreatedAt ?? 0;
        const bT = b.linkCreatedAt ?? 0;
        return aT < bT ? -1 : aT > bT ? 1 : 0;
      });
  }, [activeProfile?.id, activeProfile?.isOwner, profiles]);
}

export function useHasLinkedChildren(): boolean {
  return useLinkedChildren().length > 0;
}
```

`linkCreatedAt` must already be threaded through the mobile `Profile` type per Step P-0.8 — that step is the gate. If P-0.8 picked option (b) (alphabetical fallback), the `sort` callback uses `displayName.localeCompare`. Do not silently fall back to UUID order; the spec pins ordering across Home cards and Progress pills, and a TODO here propagates as drift between surfaces.

- [ ] **Step 1.1.5: Run the tests to verify they pass**

```powershell
pnpm exec jest --findRelatedTests src/lib/profile.test.tsx --no-coverage
```
Expected: PASS.

- [ ] **Step 1.1.6: Commit**

Use the `/commit` skill. Suggested message:
```
feat(mobile/profile): add useLinkedChildren + useHasLinkedChildren hooks
```

### Task 1.2: Migrate `LearnerScreen.tsx` from inline filter to the hook

**Files:**
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx`
- Modify: `apps/mobile/src/components/home/LearnerScreen.test.tsx`

**Spec reference:** spec § "What changes" first bullet ("Inline duplication of the linked-children check is forbidden after this PR").

- [ ] **Step 1.2.1: Read the current LearnerScreen**

Open `apps/mobile/src/components/home/LearnerScreen.tsx`. Identify the inline filter (lines around 126–138) and the consumer (`<ChildCard linkedChildren={...} />` at ~509).

- [ ] **Step 1.2.2: Update the test file with the migration in mind**

The existing tests already exercise the parent branch via mocked profiles. Adjust mocks to match the hook's expected shape (no behavioral change). If a test currently asserts an internal `useMemo` shape, rewrite it to assert observable rendering.

- [ ] **Step 1.2.3: Replace the inline filter**

In `LearnerScreen.tsx`, remove the inline `useMemo` filter and the local `linkedChildren` constant. Replace with:

```ts
const linkedChildren = useLinkedChildren();
const isParentBranch = linkedChildren.length > 0;
```

Update the `<ChildCard>` render to pass `linkedChildren` from the hook. Note: in Phase 3, the parent branch will be replaced entirely with `<ParentHomeScreen />`; for now we keep the existing parent UI so this commit is behavior-preserving.

- [ ] **Step 1.2.4: Run the related tests**

```powershell
pnpm exec jest --findRelatedTests src/components/home/LearnerScreen.tsx src/lib/profile.ts --no-coverage
```
Expected: PASS — no behavioral change vs. pre-migration.

- [ ] **Step 1.2.5: Run typecheck**

```powershell
pnpm exec tsc --noEmit
```
Expected: PASS.

- [ ] **Step 1.2.6: Commit**

Suggested message:
```
refactor(mobile/home): migrate LearnerScreen linkedChildren to useLinkedChildren hook
```

### Task 1.3: Run profile/proxy integration tests before phase exit

The pre-commit hook runs only `--findRelatedTests`-style unit selectors and skips integration tests. Phase 1 and Phase 5 both touch `profile.ts` and proxy state; cross-phase regressions otherwise surface only at Phase 8.5. Treat this as a phase-exit gate.

- [ ] **Step 1.3.1: Run the related integration suites**

```powershell
pnpm exec jest --config apps/mobile/jest.config.ts --testPathPattern "profile|use-parent-proxy|sign-out-cleanup" --runInBand
```
If any of these are configured under `apps/api` instead, run the equivalent there. Expected: PASS. Failure here means the hook extraction silently changed observable behavior — fix before Phase 2.

---

## Phase 2 — Move family-pool toggle, delete Family tab

### Task 2.1: Add the family-pool sharing toggle row to the More tab

**Files:**
- Modify: `apps/mobile/src/app/(app)/more/index.tsx`
- Modify: `apps/mobile/src/app/(app)/more/index.test.tsx` (or co-located test file — confirm path)

**Spec reference:** spec § "Where the family-pool sharing toggle goes".

- [ ] **Step 2.1.1: Locate the existing toggle JSX in `family.tsx`**

```powershell
git grep -n "useFamilyPoolBreakdownSharing\|breakdownSharing" apps/mobile/src/app/(app)/family.tsx
```
Read the surrounding JSX (label, switch, copy, accessibility props). This is the source-of-truth markup we are relocating; do not redesign it.

- [ ] **Step 2.1.2: Write the failing test**

In the More-tab test file, add:

```ts
it('renders the family-pool breakdown-sharing toggle and writes through the hook', async () => {
  // Mock useFamilyPoolBreakdownSharing → { value: false }, useUpdateFamilyPoolBreakdownSharing → spy.
  // Render More.
  // Assert the toggle row is present (testID or copy from the existing family.tsx markup).
  // Tap the toggle. Assert the mutation hook spy was called with `true`.
});
```

- [ ] **Step 2.1.3: Run the test to verify it fails**

```powershell
pnpm exec jest --findRelatedTests src/app/\(app\)/more/index.tsx --no-coverage
```
Expected: FAIL.

- [ ] **Step 2.1.4: Move the JSX**

Copy the toggle row (label + switch + accessibility) from `family.tsx` into `more/index.tsx`. Place it in the existing settings list — match the visual grouping of similar privacy/sharing toggles. Do not modify the row's markup or copy.

- [ ] **Step 2.1.5: Run the tests to verify they pass**

Expected: PASS for both the new test and existing More-tab tests.

- [ ] **Step 2.1.6: Commit**

```
feat(mobile/more): add family-pool breakdown-sharing toggle row
```
(Note: at this point the toggle is rendered in **two** places — `family.tsx` and More. Task 2.2 deletes `family.tsx`, eliminating the duplicate.)

### Task 2.2: Delete `family.tsx` + remove Family from bottom nav

**Files:**
- Delete: `apps/mobile/src/app/(app)/family.tsx`
- Delete: `apps/mobile/src/app/(app)/family.test.tsx`
- Modify: `apps/mobile/src/app/(app)/_layout.tsx`

- [ ] **Step 2.2.1: Audit inbound references to `family.tsx` / `FAMILY_HOME_PATH`**

```powershell
git grep -nE "FAMILY_HOME_PATH|/\(app\)/family|app/\(app\)/family\.tsx"
```
Capture every match. Categorize each:
- (a) navigation push that should be replaced with a Home-card route (e.g., a deep-link in `more/index.tsx` to "see your kids") — repoint to `/home`,
- (b) test selector — defer to Phase 11,
- (c) the deletion itself — handled here.

If any inbound caller cannot be repointed without product loss, stop and surface the conflict. The spec asserts no behavior is lost; verify that.

- [ ] **Step 2.2.2: Remove the Family tab from `_layout.tsx`**

Read `apps/mobile/src/app/(app)/_layout.tsx`. Locate the `<Tabs.Screen name="family" ... />` (or equivalent) entry and delete it. Confirm the remaining tabs are exactly four: `home` (or `index`), `library`, `progress`, `more`.

- [ ] **Step 2.2.3: Repoint the audit hits from Step 2.2.1**

For each (a)-class hit, replace `FAMILY_HOME_PATH` (or the literal route) with `/home`. If the constant `FAMILY_HOME_PATH` exists in a route-constants file, leave the constant for now (delete in Step 2.2.5) and update the call sites first.

- [ ] **Step 2.2.4: Delete `family.tsx` + `family.test.tsx`**

```powershell
git rm "apps/mobile/src/app/(app)/family.tsx" "apps/mobile/src/app/(app)/family.test.tsx"
```
(Route-group parens are literal in PowerShell; quoting is enough. The `:(literal)` pathspec prefix from `feedback_git_pathspec_literal_brackets.md` is for square-bracket Expo Router globs like `[id].tsx`, not parens.)

- [ ] **Step 2.2.5: Remove `FAMILY_HOME_PATH` constant if now unused**

```powershell
git grep -n "FAMILY_HOME_PATH"
```
If zero hits remain, delete the declaration. If hits remain, the audit in Step 2.2.1 was incomplete — return there.

- [ ] **Step 2.2.6: Run typecheck + the affected test suites**

```powershell
pnpm exec tsc --noEmit
pnpm exec jest --findRelatedTests src/app/\(app\)/_layout.tsx src/app/\(app\)/more --no-coverage
```
Expected: PASS.

- [ ] **Step 2.2.7: Run lint**

```powershell
pnpm exec nx lint mobile
```
Expected: PASS. If `@nx/enforce-module-boundaries` complains, run `pnpm exec nx reset` (per `feedback_nx_reset_before_commit.md`) and retry.

- [ ] **Step 2.2.8: Commit**

```
feat(mobile): delete Family tab; family-pool toggle now lives in More
```

---

## Phase 3 — Parent JTBD Home picker

### Task 3.1: Build `ParentHomeScreen` skeleton

**Files:**
- Create: `apps/mobile/src/components/home/ParentHomeScreen.tsx`
- Create: `apps/mobile/src/components/home/ParentHomeScreen.test.tsx`

**Spec reference:** spec § "Parent Home content".

- [ ] **Step 3.1.1: Write the failing test (skeleton render)**

```ts
import { render } from '@testing-library/react-native';
import { ParentHomeScreen } from './ParentHomeScreen';

it('renders greeting, quota line, and intent-picker section header', () => {
  // Arrange: mock useProfile → { displayName: 'Anna', quota: { dailyLeft: 7, monthlyLeft: 92 } }.
  // Mock useLinkedChildren → [{ id: 'c1', displayName: 'TestKid' }].
  // Render <ParentHomeScreen />.
  // Assert: "Hey Anna" present.
  // Assert: "7 questions left today · 92 this month" present.
  // Assert: "What do you need right now?" header present.
});
```

- [ ] **Step 3.1.2: Run the test to verify it fails**

```powershell
pnpm exec jest --findRelatedTests src/components/home/ParentHomeScreen.tsx --no-coverage
```
Expected: FAIL — file does not exist.

- [ ] **Step 3.1.3: Implement the skeleton**

```tsx
// apps/mobile/src/components/home/ParentHomeScreen.tsx
import { View, Text, ScrollView } from 'react-native';
import { useProfile } from '@/lib/profile';
import { useLinkedChildren } from '@/lib/profile';
import { useTranslation } from 'react-i18next';

export function ParentHomeScreen() {
  const { activeProfile, quota } = useProfile();
  const linkedChildren = useLinkedChildren();
  const { t } = useTranslation();

  return (
    <ScrollView>
      <Text testID="parent-home-greeting">
        {t('home.parent.greeting', { displayName: activeProfile?.displayName ?? '' })}
      </Text>
      <Text testID="parent-home-quota">
        {t('home.parent.quota', { daily: quota.dailyLeft, monthly: quota.monthlyLeft })}
      </Text>
      <Text testID="parent-home-intent-header">{t('home.parent.intentHeader')}</Text>
      {/* Cards added in Tasks 3.2–3.6 */}
    </ScrollView>
  );
}
```

(The exact `useProfile()` shape may differ — inspect it and adapt. The student home `LearnerScreen.tsx` already reads quota; copy its accessor pattern.)

- [ ] **Step 3.1.4: Run the test to verify it passes**

Expected: PASS.

- [ ] **Step 3.1.5: Commit**

```
feat(mobile/home): scaffold ParentHomeScreen with greeting + intent-picker header
```

### Task 3.2: Add "See how [ChildName] is doing" card per child

**Files:**
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.tsx`
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.test.tsx`

**Spec reference:** spec § "Parent Home content" → card 1; spec § "Open questions" → q1 (subtitle copy).

- [ ] **Step 3.2.1: Write the failing tests**

```ts
it('renders one "See how X is doing" card per linked child, in family_links.createdAt order', () => {
  // useLinkedChildren → [{ id: 'c1', displayName: 'Anna' }, { id: 'c2', displayName: 'Bob' }].
  // Assert two cards with testIDs `child-status-card-c1` and `child-status-card-c2` in that order.
});

it('uses live weekly snapshot subtitle when present, neutral fallback otherwise', () => {
  // Mock useDashboard → child c1 has weeklyHeadline { sessions: 2 }; c2 has none.
  // Assert c1's subtitle reads the snapshot; c2's reads "Tap to see this week's progress".
});

it('routes to /child/[profileId] when tapped', () => {
  // Render, tap, assert router.push called with the parent path then the leaf.
});
```

- [ ] **Step 3.2.2: Implement card + route push**

Use the existing `IntentCard` primitive in `apps/mobile/src/components/home/IntentCard.tsx` (mirrors the student home's craft per spec). For routing, push only `/child/[profileId]` — the index screen of the child stack — which is one level deep so the ancestor-chain rule (spec § Failure modes "Cross-stack push") does not require an extra push here. **Cards 2 and 5 (which target deeper leaves) are subject to the ancestor-chain rule and must push the parent first.**

- [ ] **Step 3.2.3: Run the tests**

Expected: PASS.

- [ ] **Step 3.2.4: Commit**

```
feat(mobile/home): add ParentHome "See how X is doing" cards
```

### Task 3.3: Add "Read [ChildName]'s weekly report" card per child (with ancestor-chain push)

**Files:**
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.tsx`
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.test.tsx`

**Spec reference:** spec § "Parent Home content" → card 2; spec § "Implementation notes" → "Cross-stack navigation from Home cards"; `CLAUDE.md` "Repo-Specific Guardrails" → cross-stack `router.push` rule.

- [ ] **Step 3.3.1: Write the failing test**

```ts
it('weekly-report card pushes the ancestor chain (parent first, then leaf)', () => {
  // Render, tap "Read X's weekly report".
  // Assert router.push called sequentially:
  //   1) /child/[profileId]
  //   2) /child/[profileId]/weekly-report
  // (or equivalent — the literal calls a navigation helper that performs both pushes.)
});
```

This test catches the dead-end bug from `CLAUDE.md`: a direct push to the leaf creates a 1-deep stack and `router.back()` falls through to the Home tab root.

- [ ] **Step 3.3.2: Implement the card + ancestor-chain push helper**

In `ParentHomeScreen.tsx`, define (or extract) a tap handler:

```ts
function pushChildLeaf(profileId: string, leaf: 'weekly-report' | 'session' | ...) {
  router.push(`/child/${profileId}`);
  router.push(`/child/${profileId}/${leaf}`);
}
```

If a navigation helper module already exists (`apps/mobile/src/lib/navigation.ts`) place the helper there. Reuse for cards 2 and any future deep child pushes.

- [ ] **Step 3.3.3: Run the test**

Expected: PASS.

- [ ] **Step 3.3.4: Commit**

```
feat(mobile/home): add weekly-report cards with ancestor-chain push
```

### Task 3.4: Add "Send [ChildName] a nudge" card per child (UI placeholder)

**Files:**
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.tsx`
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.test.tsx`

**Spec reference:** spec § "Parent Home content" → card 3; spec § "Nudge feature".

- [ ] **Step 3.4.1: Write the failing test**

```ts
it('renders a Send Nudge card per child', () => {
  // useLinkedChildren → [{ id: 'c1', displayName: 'Anna' }].
  // Assert card with testID `nudge-card-c1` is rendered.
});

it('tapping the nudge card opens the action sheet (placeholder for Phase 9)', () => {
  // For Phase 3 we render a no-op handler and assert testID present.
  // Phase 9 wires the action sheet.
});
```

- [ ] **Step 3.4.2: Implement card with placeholder onPress**

Render the card with `onPress={() => {}}` and a `// TODO(Phase 9): wire NudgeActionSheet` comment **only on the line of the placeholder** (per `CLAUDE.md` comment policy — the why is non-obvious here because the card is shipped before the action sheet to keep phases small).

- [ ] **Step 3.4.3: Run the test**

Expected: PASS.

- [ ] **Step 3.4.4: Commit**

```
feat(mobile/home): add Send Nudge card placeholder per child
```

### Task 3.5: Add "Continue your own learning" card

**Files:**
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.tsx`
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.test.tsx`

**Spec reference:** spec § "Parent Home content" → card 4; spec § "Failure modes" → "subtitle says 'pick up where you left off' but parent has no started subjects".

- [ ] **Step 3.5.1: Write the failing tests**

```ts
it('renders Continue Your Own Learning with subtitle pointing to last subject', () => {
  // Mock useUpNextTopic / equivalent → returns { subjectName: 'Math' }.
  // Assert subtitle reads "Pick up where you left off" with the subject hint.
});

it('falls back to "Start something new" when parent has no started subjects', () => {});

it('tapping pushes the student-home component as a screen', () => {
  // Assert router.push called with the appropriate route (TBD — see Step 3.5.2).
});
```

- [ ] **Step 3.5.2: Split out the solo body, then route to it directly**

Today, `LearnerScreen.tsx` mixes the solo-learner JSX (greeting, quota, intent picker, subjects) with the parent-branch JSX. Phase 3.9 makes `LearnerScreen` a thin two-way branch: `useHasLinkedChildren()` → `<ParentHomeScreen />`, else → solo body. Extract the solo body into its own component first so "Continue your own learning" can mount it directly without an override prop.

- Extract: `apps/mobile/src/components/home/SoloLearnerScreen.tsx` (the existing solo JSX, lifted verbatim — no logic change).
- `LearnerScreen` becomes a 5-line branch: `if (useHasLinkedChildren()) return <ParentHomeScreen />; return <SoloLearnerScreen />;`.
- New route file `apps/mobile/src/app/(app)/home/own-learning.tsx` mounts `<SoloLearnerScreen />` directly. No `forceSoloBranch` prop, no caller-driven branch override on a shared component.

This keeps the shared `LearnerScreen` honest (one job: route by linked-children predicate) and makes the own-learning route a normal mount, not a special-case.

- [ ] **Step 3.5.3: Implement the card + the route**

Create the route file:

```tsx
// apps/mobile/src/app/(app)/home/own-learning.tsx
import { SoloLearnerScreen } from '@/components/home/SoloLearnerScreen';
export default function OwnLearningScreen() {
  return <SoloLearnerScreen />;
}
```

Register in the home stack layout if applicable. Wire the card's onPress to `router.push('/home/own-learning')`.

- [ ] **Step 3.5.4: Run tests**

Expected: PASS.

- [ ] **Step 3.5.5: Commit**

```
feat(mobile/home): add Continue Your Own Learning card + own-learning route
```

### Task 3.6: Conditional "Open [ChildName]'s session" card

**Files:**
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.tsx`
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.test.tsx`

**Spec reference:** spec § "Parent Home content" → card 5.

- [ ] **Step 3.6.1: Identify the source of "active session" signal**

Search the dashboard endpoint output for an active-session field per child:
```powershell
git grep -nE "activeSession|inProgressSession|currentSession" apps/api/src/routes/dashboard.ts apps/api/src/services/dashboard.ts
```
If a field exists, consume it. If not, use the existing weekly-snapshot data and define `active = lastSessionStartedAt within last 30 minutes && no completedAt`. Confirm before implementing.

- [ ] **Step 3.6.2: Write the failing tests**

```ts
it('does not render Open Session card when no child has an active session', () => {});
it('renders Open Session card per child with an active session', () => {});
it('Open Session card routes to /child/[profileId] (existing detail screen)', () => {
  // Spec is explicit: this card routes to child detail; no new "watch live" UI.
});
```

- [ ] **Step 3.6.3: Implement**

Render only when the per-child active flag is true. Use the same `pushChildLeaf` helper but with leaf empty (push only `/child/[profileId]`).

- [ ] **Step 3.6.4: Run tests + commit**

```
feat(mobile/home): add conditional Open Session card on parent Home
```

### Task 3.7: Update FamilyOrientationCue copy and place it below the cards

**Files:**
- Modify: `apps/mobile/src/components/home/FamilyOrientationCue.tsx` (or wherever it lives — find first)
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.tsx`

**Spec reference:** spec § "Below the cards".

- [ ] **Step 3.7.1: Locate `FamilyOrientationCue`**

```powershell
git grep -n "FamilyOrientationCue"
```

- [ ] **Step 3.7.2: Update copy to "This is your home"**

Change the cue's hero copy to the spec text ("This is your home — kids' progress and your own learning, all in one place." or the shorter "This is your home" if that's the existing one-liner pattern). Confirm with the spec; do not invent.

- [ ] **Step 3.7.3: Mount the cue at the bottom of `ParentHomeScreen`**

Below the card list, render `<FamilyOrientationCue />`. Its existing dismissibility logic is unchanged.

- [ ] **Step 3.7.4: Run tests + commit**

```
feat(mobile/home): update FamilyOrientationCue copy + place below intent cards
```

### Task 3.8: Mount `WithdrawalCountdownBanner` above the cards

**Files:**
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.tsx`

**Spec reference:** spec § "Below the cards" / spec § "Failure modes" row "Withdrawal countdown is active".

- [ ] **Step 3.8.1: Locate the banner**

```powershell
git grep -n "WithdrawalCountdownBanner"
```

- [ ] **Step 3.8.2: Mount above the greeting / cards**

`<WithdrawalCountdownBanner />` is conditional on its own internal hook. Mount it at the top of the `ScrollView` (above the greeting or above the cards — match the placement choice already used for the student home if it appears there too; if not, place above the cards).

- [ ] **Step 3.8.3: Add a test**

```ts
it('renders WithdrawalCountdownBanner above the intent cards when withdrawal is pending', () => {
  // Mock the consent hook to return a pending withdrawal.
  // Assert banner testID renders before the first card in the ScrollView's children.
});
```

- [ ] **Step 3.8.4: Commit**

```
feat(mobile/home): mount WithdrawalCountdownBanner on ParentHomeScreen
```

### Task 3.9: Branch `LearnerScreen` to render `ParentHomeScreen` for parents

**Files:**
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx`
- Modify: `apps/mobile/src/components/home/LearnerScreen.test.tsx`

**Spec reference:** spec § "Per-user-type tab structure" + § "What changes" first bullet.

- [ ] **Step 3.9.1: Write the failing test**

```ts
it('renders ParentHomeScreen when useHasLinkedChildren returns true', () => {
  // Assert ParentHomeScreen testID is present, SoloLearnerScreen testID is absent.
});

it('renders SoloLearnerScreen when useHasLinkedChildren returns false', () => {});
```

(No `forceSoloBranch` test — the solo body is its own component now per Step 3.5.2; the `/home/own-learning` route mounts it directly.)

- [ ] **Step 3.9.2: Implement the branch**

```tsx
export function LearnerScreen() {
  if (useHasLinkedChildren()) return <ParentHomeScreen />;
  return <SoloLearnerScreen />;
}
```

Delete any pre-existing parent-mixed-dashboard JSX (the `<ChildCard linkedChildren={...} />` at line ~509 plus any sibling parent-branch UI). The spec is explicit: that mixed dashboard is replaced.

- [ ] **Step 3.9.3: Run the tests**

```powershell
pnpm exec jest --findRelatedTests src/components/home --no-coverage
```
Expected: PASS.

- [ ] **Step 3.9.4: Manually walk through the flow**

Per `CLAUDE.md` "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete":

Start Expo (web preview is fine for layout):
```powershell
C:/Tools/doppler/doppler.exe run -c stg -- pnpm --filter mobile run start
```
Verify:
- Solo profile: lands on student picker.
- Parent profile: lands on ParentHomeScreen with greeting, quota, header, cards in spec order, FamilyOrientationCue, WithdrawalCountdownBanner if pending.

If you cannot run the dev server (env), say so explicitly in the commit message body — never claim verified.

- [ ] **Step 3.9.5: Commit**

```
feat(mobile/home): wire ParentHomeScreen as the parent-branch render
```

### Task 3.10: ChildCard cleanup

**Files:**
- Audit: `apps/mobile/src/components/home/ChildCard.tsx`

- [ ] **Step 3.10.1: Decide whether ChildCard is still used**

```powershell
git grep -n "ChildCard" apps/mobile/src/
```

If `ChildCard` is no longer referenced (the parent-branch JSX in `LearnerScreen.tsx` removed in Task 3.9 was its only consumer), delete it and its co-located test. Per `CLAUDE.md` "Code Quality Guards" → "Clean up all artifacts when removing a feature": orphaned components inflate coverage and mislead future readers.

If still referenced (e.g., used elsewhere), leave it.

- [ ] **Step 3.10.2: Commit**

```
chore(mobile/home): remove orphaned ChildCard after parent-branch swap
```
(Or skip the commit if ChildCard remains used.)

---

## Phase 4 — Cross-stack navigation fixes

### Task 4.1: Register `weekly-report` in the child stack + add `unstable_settings`

**Files:**
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx`
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/_layout.test.tsx`

**Spec reference:** spec § "Implementation notes" → "Route registration" + "Cross-stack navigation".

- [ ] **Step 4.1.1: Read the current child stack layout**

Read the `_layout.tsx`. Confirm: today the Stack lists only `session`, `report`, `subjects`, `topic` (per spec). The `weekly-report` directory exists but is not declared.

- [ ] **Step 4.1.2: Write the failing test**

In the `_layout.test.tsx`:

```ts
it('declares weekly-report as a Stack.Screen', () => {
  // Render the layout, assert the screen is in the stack tree.
  // Easiest: snapshot the Stack children names array and assert weekly-report is included.
});

it('exports unstable_settings.initialRouteName = "index"', () => {
  // Import the module, assert the export.
});
```

- [ ] **Step 4.1.3: Add the registration + the export**

```tsx
export const unstable_settings = { initialRouteName: 'index' };

export default function ChildLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={...} />
      <Stack.Screen name="session" options={...} />
      <Stack.Screen name="report" options={...} />
      <Stack.Screen name="subjects" options={...} />
      <Stack.Screen name="topic" options={...} />
      <Stack.Screen name="weekly-report" options={{ title: t('child.weeklyReport.title') }} />
      <Stack.Screen name="mentor-memory" options={...} />
      <Stack.Screen name="reports" options={...} />
    </Stack>
  );
}
```

(Audit the actual children directories with `ls` first; the list above mirrors the Phase P-0 inventory but confirm.)

- [ ] **Step 4.1.4: Run the tests**

Expected: PASS.

- [ ] **Step 4.1.5: Manual cross-stack verification**

Per spec § "Verification before declaring done" → "Cross-stack back-stack":
1. From parent Home, tap "Read TestKid's weekly report".
2. Confirm the weekly-report screen renders with the child detail's title bar style.
3. Tap the back arrow.
4. Confirm you land on the child detail screen (`/child/[profileId]`), **not** the Home tab root.

If back falls through to Home, the ancestor-chain push from Task 3.3 is wrong or the layout's `unstable_settings` did not take effect. Diagnose before continuing.

- [ ] **Step 4.1.6: Commit**

```
feat(mobile/child): register weekly-report route + initialRouteName safety net
```

---

## Phase 5 — Proxy-mode behavior on "Continue your own learning"

> **Re-scoped 2026-05-10:** the original "centralize the proxy-active clear" framing was wrong. Audit confirmed the SecureStore clear is **already** centralized: `apps/mobile/src/hooks/use-parent-proxy.ts:33–53` runs a `useEffect` that writes/deletes `parent-proxy-active` whenever `activeProfile`/`isParentProxy` change, and `apps/mobile/src/lib/profile.ts:200–290` (`switchProfile`) calls `setProxyMode(nextIsParentProxy)` synchronously. There are no tap-handler clears to consolidate.
>
> The real risk in the new flow is different: a parent currently in proxy mode (acting as a child) taps "Continue your own learning" on the parent Home. Because the parent Home only renders when the active profile is the owner, this card is unreachable from proxy mode — but the failure mode the spec calls out (spec § "Failure modes") is that a profile-switch UI elsewhere could leave the proxy flag set after the user navigates back to their own learning. That is a different bug shape: switch-back semantics, not centralization.

### Task 5.1: Verify switch-back semantics into the parent's own-learning route

**Files:**
- Audit: `apps/mobile/src/lib/profile.ts`, `apps/mobile/src/hooks/use-parent-proxy.ts`
- Modify (only if a real gap is found): the actual gap site

- [ ] **Step 5.1.1: Re-confirm today's centralization**

```powershell
git grep -n "parent-proxy-active\|setProxyMode" apps/mobile/src/
```
Expected hits: only the `useParentProxy` hook, the `switchProfile` synchronous call, the SecureStore restore on app start (`profile.ts:147–155`), and the sign-out-cleanup registry. **Zero tap-handler clears.** If a tap-handler clear shows up, it is the gap — capture it.

- [ ] **Step 5.1.2: Write a regression test for the spec's failure mode**

The spec's worry: parent enters proxy mode → navigates to parent Home → taps "Continue your own learning" → expects to be operating as themselves, not as the child. With Phase 3 in place, the parent Home only renders when active profile is owner, so reaching the card from proxy mode requires switching back first. The test asserts that path:

```ts
it('parent in proxy mode cannot reach the own-learning card without switching back to owner', async () => {
  // Arrange: activeProfile = child (proxy mode). Render the Home tab.
  // Assert: ParentHomeScreen is NOT rendered (because owner predicate is false in proxy);
  //         the visible Home is the child's solo home OR the proxy switch-back affordance.
});

it('after switchProfile(ownerId), the proxy flag is cleared and own-learning is reachable', async () => {
  // Arrange: same proxy setup, then call switchProfile(ownerId).
  // Assert: SecureStore.deleteItemAsync('parent-proxy-active') was called (via useParentProxy effect);
  //         setProxyMode(false) was called synchronously by switchProfile;
  //         ParentHomeScreen is now rendered with the own-learning card visible.
});
```

These tests pin the existing centralization in place as a regression guard so a future "shortcut" tap-handler clear cannot reintroduce the drift surface.

- [ ] **Step 5.1.3: Run tests**

Expected: PASS without code changes (the centralization already holds). If they fail, the audit in 5.1.1 missed something — fix the actual site, do not weaken the test.

- [ ] **Step 5.1.4: Commit**

```
test(mobile/profile): regression guards for proxy-mode switch-back into own-learning
```

(If 5.1.1 surfaces an actual tap-handler clear that escaped the existing centralization, fold the deletion into this commit; otherwise this phase is test-only.)

---

## Phase 6 — Solo-to-parent transition notice

### Task 6.1: Build `ParentTransitionNotice` component

**Files:**
- Create: `apps/mobile/src/components/home/ParentTransitionNotice.tsx`
- Create: `apps/mobile/src/components/home/ParentTransitionNotice.test.tsx`

**Spec reference:** spec § "Solo learner adds their first child (transition moment)" + § "Implementation notes" → "One-time transition notice".

- [ ] **Step 6.1.1: Write the failing tests**

```ts
it('renders when SecureStore key is unset', async () => {
  // Mock SecureStore.getItemAsync('mentomate_parent_home_seen') → null.
  // Assert notice is rendered.
});

it('does not render when SecureStore key is set', async () => {
  // Mock → '1'. Assert notice not rendered.
});

it('persists dismissal via SecureStore.setItemAsync', async () => {
  // Tap dismiss. Assert SecureStore.setItemAsync called with key + '1'.
});

it('survives a SecureStore write failure (soft-fail; spec § Failure modes)', async () => {
  // Mock setItemAsync to reject. Tap dismiss. Assert no thrown error; notice hides locally.
});
```

- [ ] **Step 6.1.2: Implement**

```tsx
const KEY = 'mentomate_parent_home_seen';

export function ParentTransitionNotice() {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    SecureStore.getItemAsync(KEY).then((v) => setSeen(v === '1'));
  }, []);
  if (seen !== false) return null;

  const dismiss = async () => {
    setSeen(true); // local hide first; spec accepts duplicate notice on write failure
    try { await SecureStore.setItemAsync(KEY, '1'); } catch { /* soft-fail */ }
  };

  return (
    <View testID="parent-transition-notice">
      <Text>{t('home.parent.transitionNotice')}</Text>
      <Button onPress={dismiss} title={t('common.dismiss')} />
    </View>
  );
}
```

The key uses Expo-safe characters per `CLAUDE.md` repo guardrails (letters + underscores).

- [ ] **Step 6.1.3: Run tests**

Expected: PASS.

- [ ] **Step 6.1.4: Mount inside `ParentHomeScreen`**

Mount above the cards, below the WithdrawalCountdownBanner. Add a test in `ParentHomeScreen.test.tsx` covering the integration.

- [ ] **Step 6.1.5: Commit**

```
feat(mobile/home): add ParentTransitionNotice (one-time, SecureStore-backed)
```

### Task 6.2: Register the SecureStore key in centralized sign-out cleanup

**Files:**
- Modify: `apps/mobile/src/lib/sign-out-cleanup-registry.ts`
- Modify: `apps/mobile/src/lib/profile.test.tsx` (regression test — break-test pattern)

**Spec reference:** spec § "Solo learner adds their first child" — the must-be-cleared rule per `MEMORY.md → project_cross_account_leak_2026_05_10.md`.

- [ ] **Step 6.2.1: Read the existing registry**

```powershell
type apps/mobile/src/lib/sign-out-cleanup-registry.ts
```
The registry today lists the keys cleared on sign-out (cross-account-leak fix). Add `mentomate_parent_home_seen` to that list.

- [ ] **Step 6.2.2: Write the regression break test**

In `profile.test.tsx` (alongside the existing cross-account-leak break test):

```ts
it('clears mentomate_parent_home_seen on sign-out (regression: cross-account leak)', async () => {
  // Arrange: SecureStore has mentomate_parent_home_seen = '1'.
  // Act: call signOut() / runSignOutCleanup().
  // Assert: SecureStore.deleteItemAsync was called with the key.
});
```

Use the red-green pattern per `CLAUDE.md` "Fix Development Rules" → "Security fixes require a 'break test'":
1. Write the test.
2. Run it. **Expected: FAIL** (key not yet in registry).
3. Add the key to the registry.
4. Run again. **Expected: PASS**.
5. Revert the registry add. Confirm the test fails.
6. Re-add. Confirm the test passes.

This proves the test covers the fix.

- [ ] **Step 6.2.3: Run all sign-out-cleanup tests**

```powershell
pnpm exec jest --findRelatedTests src/lib/sign-out-cleanup --no-coverage
```
Expected: PASS.

- [ ] **Step 6.2.4: Commit**

```
fix(mobile/sign-out): register mentomate_parent_home_seen in cleanup registry

Break test in profile.test.tsx asserts the key is wiped on sign-out so user A's
"seen" flag does not suppress the notice for user B on the same device.
```

---

## Phase 7 — Progress tab segmented control

### Task 7.1: Build `ProgressPillRow`

**Files:**
- Create: `apps/mobile/src/components/progress/ProgressPillRow.tsx`
- Create: `apps/mobile/src/components/progress/ProgressPillRow.test.tsx`

**Spec reference:** spec § "Progress tab".

- [ ] **Step 7.1.1: Write the failing tests**

```ts
it('renders one pill per linked child plus a "Mine" pill', () => {});

it('default selected pill is the first linked child by family_links.createdAt', () => {});

it('emits onChange(profileId) when a child pill is tapped', () => {});

it('emits onChange(null /* mine */) when the Mine pill is tapped', () => {});

it('renders the row inside a horizontal ScrollView with showsHorizontalScrollIndicator=false', () => {});

it('scrolls the active pill into view on mount', () => {
  // Mount with default selected child pill. Assert scrollTo was called toward the active pill.
});
```

- [ ] **Step 7.1.2: Implement**

```tsx
type Props = {
  linkedChildren: { id: string; displayName: string }[];
  value: string | null; // childProfileId or null for "Mine"
  onChange: (next: string | null) => void;
};

export function ProgressPillRow({ linkedChildren, value, onChange }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  // ... measure pill positions, scroll active into view on mount
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} ref={scrollRef}>
      {linkedChildren.map((c) => (
        <Pill key={c.id} label={c.displayName} active={value === c.id} onPress={() => onChange(c.id)} />
      ))}
      <Pill key="mine" label={t('progress.pills.mine')} active={value === null} onPress={() => onChange(null)} />
    </ScrollView>
  );
}
```

Apply a soft right-edge fade (spec § "Pill row overflow").

- [ ] **Step 7.1.3: Run tests + commit**

```
feat(mobile/progress): add ProgressPillRow segmented control
```

### Task 7.2: Wire pill row into Progress tab

**Files:**
- Modify: `apps/mobile/src/app/(app)/progress.tsx`
- Modify: `apps/mobile/src/app/(app)/progress.test.tsx`

**Spec reference:** spec § "Progress tab".

- [ ] **Step 7.2.1: Identify the per-profile progress fetch**

```powershell
git grep -n "useProgressData\|useProgress\|progress.*targetProfileId" apps/mobile/src/
```
Capture the existing hook name. Confirm it accepts (or can be extended to accept) a `targetProfileId` argument that defaults to `activeProfileId`.

- [ ] **Step 7.2.2: Write the failing tests**

```ts
it('renders the pill row when useHasLinkedChildren is true', () => {});

it('does not render the pill row for solo learners', () => {});

it('switching pills swaps the rendered profile data (targetProfileId is threaded through)', () => {});
```

- [ ] **Step 7.2.3: Implement**

```tsx
export default function ProgressScreen() {
  const linkedChildren = useLinkedChildren();
  const hasLinked = linkedChildren.length > 0;
  const [pill, setPill] = useState<string | null>(hasLinked ? linkedChildren[0].id : null);
  const targetProfileId = pill ?? activeProfile.id;
  // existing render uses targetProfileId

  return (
    <View>
      {hasLinked && <ProgressPillRow linkedChildren={linkedChildren} value={pill} onChange={setPill} />}
      <ProgressContent targetProfileId={targetProfileId} />
    </View>
  );
}
```

If the existing fetch hook does **not** accept `targetProfileId`, extend it. If extension requires API changes (the dashboard route accepts it but other progress sources do not), capture this in a separate task and surface it to the user before continuing.

- [ ] **Step 7.2.4: Run tests + manual walkthrough + commit**

```
feat(mobile/progress): segmented control for parents (per-child + Mine)
```

---

## Phase 8 — Nudge backend

> **Critical:** Phase 8 introduces a Drizzle migration. Per `CLAUDE.md` "Schema And Deploy Safety": `drizzle-kit push` is OK in dev only; staging/prod use committed SQL via `drizzle-kit migrate`. This phase ships the SQL migration.

### Task 8.0: Schema-package prerequisites (run before any other Phase 8 task)

These three changes must land before the nudge service or the mobile hook can compile. They are bundled into one task because they're all small typed-contract additions and they unblock everything downstream.

**Files:**
- Modify: `packages/schemas/src/errors.ts`
- Create: `packages/schemas/src/notifications.ts`
- Modify: `packages/schemas/src/index.ts` (re-export the two new modules)
- Modify: `apps/api/src/services/notifications.ts` (replace the inline `NotificationPayload` interface with the schema-package union; add `data: Record<string, string>` and forward it to Expo)

- [ ] **Step 8.0.1: Add `ConsentRequiredError`**

```ts
// packages/schemas/src/errors.ts (append)
export class ConsentRequiredError extends Error {
  readonly name = 'ConsentRequiredError';
  constructor(public consentStatus: 'PENDING' | 'PARENTAL_CONSENT_REQUESTED' | 'WITHDRAWN' | 'EXPIRED') {
    super(`Consent required (status: ${consentStatus})`);
  }
}
```

Confirm the consent-status string-literal set against `consentStatusEnum` in `packages/database/src/schema/profiles.ts` — adapt if the actual enum values differ.

- [ ] **Step 8.0.2: Convert `NotificationPayload` to a discriminated union with a `data` channel**

Today: `apps/api/src/services/notifications.ts:25–48` declares a flat `interface { profileId; title; body; type: '<one of N strings>' }`. The Expo POST forwards only `title`, `body`, and `type`. There is no `data` field — so a kid client cannot route on `nudgeId`/`templateKey` even if those were added to the type.

Create the schema home and convert:

```ts
// packages/schemas/src/notifications.ts (new)
import { z } from 'zod';

const baseNotification = z.object({
  profileId: z.string().uuid(),
  title: z.string(),
  body: z.string(),
});

const reviewReminder = baseNotification.extend({ type: z.literal('review_reminder') });
const dailyReminder = baseNotification.extend({ type: z.literal('daily_reminder') });
// ... one variant per existing string-literal type from notifications.ts:29–47
const nudge = baseNotification.extend({
  type: z.literal('nudge'),
  data: z.object({
    nudgeId: z.string().uuid(),
    fromDisplayName: z.string(),
    templateKey: z.enum(['you_got_this', 'proud_of_you', 'quick_session', 'thinking_of_you']),
  }),
});

export const notificationPayloadSchema = z.discriminatedUnion('type', [
  reviewReminder, dailyReminder, /* ... */, nudge,
]);
export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;
```

Re-export from `packages/schemas/src/index.ts`.

In `apps/api/src/services/notifications.ts`:
1. Replace the local interface with `import { type NotificationPayload } from '@eduagent/schemas';`.
2. Inside `sendPushNotification`, when building the Expo POST body, forward `data` if the variant carries one: `{ to: token, title, body, data: 'data' in payload ? payload.data : undefined }`. This is the channel the kid push receiver reads.

- [ ] **Step 8.0.3: Add the integration-test "no regression" guard**

Existing notification flows (review reminders, weekly progress, etc.) must keep working unchanged. Run:
```powershell
pnpm exec nx run api:test --testPathPattern notifications
```
Expected: all PASS — the union shape is wider but each existing variant still type-checks because the new union includes them.

- [ ] **Step 8.0.4: Commit**

```
feat(schemas): NotificationPayload discriminated union + ConsentRequiredError + data channel
```

### Task 8.1: Define the `nudges` table schema

**Files:**
- Create: `packages/db/src/schema/nudges.ts`
- Modify: `packages/db/src/schema/index.ts` (export the new table)

**Spec reference:** spec § "Nudge feature → Data model".

- [ ] **Step 8.1.1: Write the table**

```ts
// packages/db/src/schema/nudges.ts
import { pgTable, uuid, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

export const nudgeTemplate = pgEnum('nudge_template', [
  'you_got_this',
  'proud_of_you',
  'quick_session',
  'thinking_of_you',
]);

export const nudges = pgTable(
  'nudges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fromProfileId: uuid('from_profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    toProfileId: uuid('to_profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    template: nudgeTemplate('template').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => ({
    unreadByRecipient: index('nudges_to_unread_idx').on(t.toProfileId, t.readAt),
  }),
);
```

- [ ] **Step 8.1.2: Export from `packages/db/src/schema/index.ts`**

Add `export * from './nudges';`.

- [ ] **Step 8.1.3: Generate the migration**

```powershell
pnpm run db:generate
```

Expected: a new SQL file under `apps/api/drizzle/migrations/` (or wherever the project's migration path is — confirm in P-0). Inspect the generated SQL: it should `CREATE TYPE "nudge_template" AS ENUM (...)`, `CREATE TABLE "nudges" (...)`, and `CREATE INDEX "nudges_to_unread_idx"`. If the generator emits anything else (e.g., schema drift from an unrelated table), stop and fix the drift before committing.

- [ ] **Step 8.1.4: Apply via the migrate path, not push**

```powershell
pnpm run db:migrate:dev
```
Per `project_dev_schema_drift_pattern.md` and `project_schema_drift_pattern.md`: `drizzle-kit push` and committed-SQL `drizzle-kit migrate` can silently disagree (push tolerates schema drift that migrate enforces). Applying the **committed** migration locally proves both halves agree before staging/prod ever sees it. Per `CLAUDE.md` schema safety: never run `db:push:dev` against staging or prod.

- [ ] **Step 8.1.5: Defer commit until Phase 8.5 integration tests pass**

Do **not** commit the migration as a standalone unit. Stage the schema + migration files; the actual commit happens at the end of Task 8.5, alongside the integration tests that exercise the table. This guarantees a single rollback unit if the table is wrong.

```powershell
git add packages/database/src/schema/nudges.ts packages/database/src/schema/index.ts apps/api/drizzle/migrations/<NNNN>_create_nudges_table.sql
```
(Stage only — do not commit yet.)

### Task 8.2: (Subsumed by Task 8.0) — sanity-check the union shape before consuming it

The discriminated union, the `'nudge'` variant, the `data` channel, and `ConsentRequiredError` all land in Task 8.0. This task is just a verification gate before the service code starts importing them.

- [ ] **Step 8.2.1: Confirm imports resolve**

```powershell
pnpm exec tsc --noEmit
git grep -n "from '@eduagent/schemas'" apps/api/src/services/notifications.ts apps/api/src/services/nudge.ts apps/mobile/src/hooks/use-nudges.ts
```
The first should pass; the second should show all three files importing `NotificationPayload`, `ConsentRequiredError`, and `RateLimitedError` from the schema package (not from local error files).

`RateLimitedError` already exists at `packages/schemas/src/errors.ts:53` — verified. No re-export work needed.

### Task 8.3: Build the nudge service (write, list-unread, mark-read, rate-limit, quiet-hours)

**Files:**
- Create: `apps/api/src/services/nudge.ts`
- Create: `apps/api/src/services/nudge.test.ts`

**Spec reference:** spec § "Nudge feature → API" + § "Implementation notes" → "Nudge feature".

- [ ] **Step 8.3.1: Write the failing tests (unit)**

```ts
describe('nudgeService.send', () => {
  it('rejects when recipient consent (joined from consent_states for the gating consent_type) !== CONSENTED', async () => {
    // For each of PENDING, PARENTAL_CONSENT_REQUESTED, WITHDRAWN, EXPIRED:
    //   seed consent_states row with that status for the gating consent_type (captured in P-0.7),
    //   send → expect ConsentRequiredError(status).
  });

  it('rejects when no consent_states row exists for the gating consent_type', async () => {
    // Treat absent row as PENDING (or whatever the existing flow treats it as — match P-0.7's finding).
  });

  it('rate-limits per RECIPIENT, not per (sender, recipient)', async () => {
    // Insert 3 rows for childA from parentA within the last 24h. 4th send from parentA rejects (RateLimitedError).
    // 4th send from parentB to childA also rejects — 3/day is the recipient's cap, not the sender's.
    // 25 hours later: send succeeds again (rolling, not midnight reset).
  });

  it('inserts the row and queues a push inside the recipient local 07:00–21:00 window', async () => {
    // Recipient timezone: 'Europe/Oslo'. Mock now to 12:00 Oslo. Send. Assert insert + push queued.
  });

  it('inserts the row but suppresses the push outside the 07:00–21:00 window', async () => {
    // Recipient timezone: 'Europe/Oslo'. Mock now to 23:30 Oslo. Send.
    // Assert: insert succeeded; sendPushNotification was NOT called.
    // Assert: a structured log/metric was emitted with { event: 'nudge.push_suppressed_quiet_hours',
    //   nudgeId, recipientProfileId, localHour, timezone } so suppression is queryable per CLAUDE.md silent-recovery rule.
  });

  it('falls back to parent timezone when recipient TZ is unset', async () => {});

  it('handles DST and edge-of-day timezones correctly', async () => {
    // 'America/Los_Angeles' across spring-forward boundary; 'Asia/Tokyo' (UTC+9, hour math wraps).
    // Use Intl.DateTimeFormat with hourCycle: 'h23' to get a numeric 0–23 hour (not 'en-US' formatted strings,
    // which yield '12 AM' / '0' inconsistently and break parseInt).
  });

  it('bypasses the global MAX_DAILY_PUSH cap (nudges are user-initiated)', async () => {
    // Seed 3 prior pushes today for the recipient. Send a nudge inside the 07:00–21:00 window.
    // Assert: push went through despite the cap (sendPushNotification called with skipDailyCap: true,
    // or the nudge path uses a separate sender that does not consult MAX_DAILY_PUSH).
  });
});

describe('nudgeService.listUnread', () => {
  it('returns unread nudges for the recipient profile', async () => {});

  it('filters out senders no longer in family_links', async () => {
    // Insert a nudge from parentA → childB. Remove the family_links row. Assert listUnread returns nothing.
  });
});

describe('nudgeService.markRead', () => {
  it('sets readAt to now', async () => {});

  it('rejects when nudge does not belong to the recipient', async () => {});
});
```

These are unit tests against the service with the database mocked at the **boundary** (via the test DB fixture used elsewhere in api). Per `CLAUDE.md` "No internal mocks": no `jest.mock` of internal modules. Use the real DB or the existing test-DB fixture.

- [ ] **Step 8.3.2: Implement `send`**

Three corrections vs. the original sketch: consent comes from the `consent_states` table (not a profiles property); rate limit is per recipient (not per sender-recipient pair); hour math uses `Intl.DateTimeFormat({ hourCycle: 'h23' })` to get a clean numeric 0–23.

```ts
const PUSH_ALLOWED_START = 7;   // 07:00 local
const PUSH_ALLOWED_END = 21;    // 21:00 local
const RATE_LIMIT_PER_RECIPIENT_24H = 3;

export async function send(args: { fromProfileId: string; toProfileId: string; template: NudgeTemplate; db: Database }) {
  const recipient = await args.db.query.profiles.findFirst({ where: eq(profiles.id, args.toProfileId) });
  if (!recipient) throw new ResourceGoneError('Recipient profile no longer exists');

  // Consent: joined from consent_states for the gating consent_type (captured in P-0.7).
  const consent = await args.db.query.consentStates.findFirst({
    where: and(
      eq(consentStates.profileId, args.toProfileId),
      eq(consentStates.consentType, NUDGE_GATING_CONSENT_TYPE), // resolved in P-0.7
    ),
  });
  const status = consent?.status ?? 'PENDING';
  if (status !== 'CONSENTED') throw new ConsentRequiredError(status);

  // Rate limit: per recipient. A child receives at most 3 nudges/24h from any combination of senders.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await args.db
    .select({ count: count() })
    .from(nudges)
    .where(and(eq(nudges.toProfileId, args.toProfileId), gt(nudges.createdAt, since)));
  if ((recent[0]?.count ?? 0) >= RATE_LIMIT_PER_RECIPIENT_24H) throw new RateLimitedError('NUDGE_RATE_LIMIT');

  const [row] = await args.db.insert(nudges).values({
    fromProfileId: args.fromProfileId,
    toProfileId: args.toProfileId,
    template: args.template,
  }).returning();

  const sender = await args.db.query.profiles.findFirst({ where: eq(profiles.id, args.fromProfileId) });
  const tz = recipient.timezone ?? sender?.timezone ?? 'UTC';
  const hourStr = new Intl.DateTimeFormat('en-US', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date());
  const hour = Number(hourStr);
  const insidePushWindow = hour >= PUSH_ALLOWED_START && hour < PUSH_ALLOWED_END;

  if (insidePushWindow) {
    // Nudges bypass MAX_DAILY_PUSH (user-initiated, not system-generated).
    // Use the skipDailyCap option on sendPushNotification, or — if that option doesn't exist yet —
    // add it as part of Task 8.6 and gate it on payload.type === 'nudge'.
    await sendPushNotification(args.db, {
      profileId: row.toProfileId,
      type: 'nudge',
      title: t(sender?.localeKey ?? 'en', 'nudge.banner.title', { fromDisplayName: sender?.displayName ?? '' }),
      body: t(sender?.localeKey ?? 'en', `nudge.templates.${row.template}`),
      data: { nudgeId: row.id, fromDisplayName: sender?.displayName ?? '', templateKey: row.template },
    }, { skipDailyCap: true });
  } else {
    logger.info({
      event: 'nudge.push_suppressed_quiet_hours',
      nudgeId: row.id,
      recipientProfileId: row.toProfileId,
      localHour: hour,
      timezone: tz,
    });
  }

  return row;
}
```

`NUDGE_GATING_CONSENT_TYPE` is the constant captured in Step P-0.7 — likely `'data_processing'` or the parental-consent variant; do not guess. Adapt the import path of `consentStates` to the actual schema barrel.

- [ ] **Step 8.3.3: Implement `listUnread` and `markRead`**

`listUnread`: SELECT … WHERE toProfileId = ? AND readAt IS NULL AND fromProfileId IN (SELECT parentProfileId FROM family_links WHERE childProfileId = ?). Order by createdAt DESC.

`markRead`: UPDATE nudges SET readAt = now() WHERE id = ? AND toProfileId = ? RETURNING *. Throw if no row updated.

- [ ] **Step 8.3.4: Run unit tests**

Expected: PASS.

- [ ] **Step 8.3.5: Commit**

```
feat(api/nudge): add nudge service with consent gate, rate limit, quiet hours
```

### Task 8.4: Build the three routes

**Files:**
- Create: `apps/api/src/routes/nudges.ts`
- Modify: `apps/api/src/index.ts` (or wherever routes are mounted) — register the route
- Defer integration tests to Task 8.5

**Spec reference:** spec § "Nudge feature → API".

- [ ] **Step 8.4.1: Implement `POST /nudges`**

```ts
nudges.post('/', zValidator('json', z.object({ toProfileId: z.string().uuid(), template: nudgeTemplateSchema })), async (c) => {
  const { toProfileId, template } = c.req.valid('json');
  const { profileId } = c.get('user');
  await assertParentAccess(c.var.db, profileId, toProfileId); // throws ForbiddenError on mismatch
  const row = await nudgeService.send({ fromProfileId: profileId, toProfileId, template, db: c.var.db });
  return c.json({ nudge: row }, 201);
});
```

- [ ] **Step 8.4.2: Implement `GET /nudges?unread=true`**

```ts
nudges.get('/', async (c) => {
  const { profileId } = c.get('user');
  const repo = createScopedRepository(profileId, c.var.db);
  const list = await nudgeService.listUnread({ profileId, repo });
  return c.json({ nudges: list });
});
```

- [ ] **Step 8.4.3: Implement `PATCH /nudges/:id/read`**

```ts
nudges.patch('/:id/read', async (c) => {
  const { profileId } = c.get('user');
  const id = c.req.param('id');
  const updated = await nudgeService.markRead({ id, profileId, db: c.var.db });
  return c.json({ nudge: updated });
});
```

- [ ] **Step 8.4.3b: Implement `POST /nudges/mark-read` (bulk, single transaction)**

Per HIGH-4: marking N unread nudges read at modal-dismiss time must be atomic. Sequential per-id PATCHes leave the cache inconsistent on a partial failure. The bulk endpoint marks all the recipient's unread (or a specific id list) in one transaction.

```ts
nudges.post(
  '/mark-read',
  zValidator('json', z.object({ ids: z.array(z.string().uuid()).optional() })),
  async (c) => {
    const { profileId } = c.get('user');
    const { ids } = c.req.valid('json');
    const count = await nudgeService.markReadBulk({ profileId, ids, db: c.var.db });
    return c.json({ markedRead: count });
  }
);
```

Service signature: `markReadBulk({ profileId, ids?: string[], db })` — when `ids` is omitted, marks all unread for `toProfileId = profileId`; when provided, marks only those ids that belong to the recipient (silently skips foreign ids). One UPDATE statement.

- [ ] **Step 8.4.4: Mount the routes**

Find the main api router (`apps/api/src/index.ts` or equivalent) and add `app.route('/nudges', nudges)`.

- [ ] **Step 8.4.5: Run typecheck**

Expected: PASS.

- [ ] **Step 8.4.6: Commit**

```
feat(api/nudge): add POST/GET/PATCH /nudges routes
```

### Task 8.5: Integration tests (rate-limit, consent gate, ownership, quiet-hours, withdrawal cleanup, family-link-removed filter)

**Files:**
- Create: `apps/api/src/routes/nudges.integration.test.ts`

**Spec reference:** spec § "Implementation notes" → "Tests → Integration tests".

- [ ] **Step 8.5.1: Write the integration tests**

Each test uses the existing api integration test harness (real DB, mock external boundaries only — no `jest.mock` of internal services per `CLAUDE.md` GC1).

```ts
describe('POST /nudges', () => {
  it('200 on first 3 nudges within rolling 24h, 429 (RateLimitedError) on the 4th', async () => {});

  it('rejects with consent error for each of PENDING / PARENTAL_CONSENT_REQUESTED / WITHDRAWN (break test)', async () => {
    // Per CLAUDE.md "Security fixes require a break test". Use the red-green pattern:
    // 1. Write each consent-state case.
    // 2. Run — should pass with the consent gate from Task 8.3 in place.
    // 3. Revert the consent check in nudgeService.send.
    // 4. Run — must fail.
    // 5. Restore the check.
  });

  it('parent A cannot nudge parent B\'s child (assertParentAccess → ForbiddenError)', async () => {});

  it('inserts the row but does not invoke push during quiet hours', async () => {
    // Set recipient timezone to UTC. Stub Date.now to 23:00 UTC.
    // Spy on the push sender. Send a nudge. Assert insert succeeded + spy was not called.
  });
});

describe('GET /nudges?unread=true', () => {
  it('filters out senders whose family_links row has been removed', async () => {});
});

describe('POST /nudges/mark-read', () => {
  it('marks all unread nudges for the caller in one transaction', async () => {
    // Seed 5 unread to the caller. POST /nudges/mark-read with empty body. Assert markedRead = 5;
    // GET /nudges?unread=true returns []. All 5 rows now have readAt set.
  });

  it('with ids[]: marks only those nudges, only if they belong to the caller', async () => {
    // Seed 3 unread for callerA, 2 unread for callerB. callerA POSTs mark-read with all 5 ids.
    // Assert: only callerA's 3 are marked read; callerB's 2 are still unread.
  });

  it('is atomic (all-or-nothing on a transaction error)', async () => {
    // Force a DB constraint violation mid-update (e.g., via a chained CHECK that aborts the tx).
    // Assert: no rows have readAt set.
  });
});
```

- [ ] **Step 8.5.2: Run integration tests**

Per `CLAUDE.md` "Required Validation": integration tests must run locally before commit.
```powershell
pnpm exec nx run api:test
```
Or scoped to the file:
```powershell
cd apps/api; pnpm exec jest src/routes/nudges.integration.test.ts
```
Expected: all PASS.

- [ ] **Step 8.5.3: Commit (folds in the deferred Task 8.1 schema commit)**

Per Step 8.1.5, the schema/migration was staged but not committed. Combine that with the integration tests now that they prove the table works:

```
feat(api/nudge): nudges table + service + routes + integration tests

- packages/database/src/schema/nudges.ts (new)
- apps/api/drizzle/migrations/<NNNN>_create_nudges_table.sql (new)
- apps/api/src/services/nudge.ts (new)
- apps/api/src/routes/nudges.ts (new — POST, GET, PATCH, POST mark-read bulk)
- apps/api/src/routes/nudges.integration.test.ts (new)

Schema and consumers ship as one rollback unit. Migration applied via
db:migrate:dev locally; staging/prod via drizzle-kit migrate per CLAUDE.md
"Schema And Deploy Safety". Rate limit is per-recipient (3/24h); push respects
recipient-local 07:00–21:00 with structured logging on suppression; nudges
bypass MAX_DAILY_PUSH (user-initiated).
```

### Task 8.6: Wire the `'nudge'` push case into the api notifications sender

**Files:**
- Modify: `apps/api/src/services/notifications.ts`
- Modify: `apps/api/src/services/notifications.test.ts`

**Spec reference:** spec § "Nudge feature → Kid-side surface".

- [ ] **Step 8.6.1: Write the failing test**

```ts
it('formats a nudge push with title + body from the templateKey', async () => {
  // Send NotificationPayload { type: 'nudge', nudgeId, fromDisplayName: 'Anna', templateKey: 'proud_of_you' }.
  // Assert the push payload's title / body match the locale's nudge.banner.title / template strings.
});
```

- [ ] **Step 8.6.2: Add the case + the `skipDailyCap` option**

In the existing `switch (payload.type)` (or wherever per-type formatting happens) add the `'nudge'` arm. Use the kid's locale (read from the recipient profile — match existing pattern).

Also extend `sendPushNotification`'s options object: `{ skipRateLimitLog?: boolean; skipDailyCap?: boolean }`. When `skipDailyCap` is true (set by `nudgeService.send`), bypass the `dailyCount >= MAX_DAILY_PUSH` early-return at `notifications.ts:112–115`. The justification belongs in a one-line comment on the option:

```ts
// Nudges are user-initiated (parent tap), not system-generated reminders.
// They bypass the per-recipient daily push cap so a kid who hit the cap on
// review reminders still receives encouragement from their parent.
```

Add a unit test that asserts the cap is enforced for system types (`review_reminder`) and bypassed for `'nudge'`.

- [ ] **Step 8.6.3: Run tests + commit**

```
feat(api/notifications): add 'nudge' push case + skipDailyCap option
```

### Task 8.7: Consent-withdrawal cleanup integration

**Files:**
- Modify: `apps/api/src/inngest/functions/<consent-withdrawal>.ts` (path captured in P-0.5)
- Modify: corresponding integration test file

**Spec reference:** spec § "Failure modes" → "Consent withdrawn while child has unread nudges queued" + § "Nudge feature → Consent withdrawal — pending unread nudges".

- [ ] **Step 8.7.1: Write the integration tests using the red-green break-test pattern**

Consent withdrawal is a privacy invariant — a parent message reaching a withdrawn child is a privacy regression. Per `CLAUDE.md` "Fix Development Rules → Security/CRITICAL fixes require a break test" and `feedback_fix_verification_rules.md`, prove the test catches the regression by reverting the fix:

```ts
it('soft-clears all unread nudges to the affected child when consent transitions to WITHDRAWN', async () => {
  // Arrange: insert 2 unread nudges to childA. childA's gating consent_states row = CONSENTED.
  // Act: invoke the withdrawal function (or trigger the same DB transition).
  // Assert: both nudges now have readAt set; childA's consent_states.status = WITHDRAWN.
});

it('also soft-clears unread nudges when a family_links row is removed', async () => {
  // Spec: "Same handling applies when a family_links row is removed."
});
```

Red-green sequence (do not skip):
1. Write the tests above.
2. Run them. They should FAIL (no implementation yet).
3. Add the cleanup statement from Step 8.7.2 inside the WITHDRAWN-transition transaction.
4. Run again. **Expected: PASS.**
5. **Revert the cleanup statement.** Run again. **Expected: FAIL** — proves the test detects the regression.
6. Restore the cleanup. Run again. **Expected: PASS.**

If step 5 still passes, the test is not actually checking what it claims (often: the test arrangement leaves the child in a state where no nudges exist to clear). Tighten the arrangement before continuing.

- [ ] **Step 8.7.2: Implement**

Inside the existing WITHDRAWN-transition transaction, add:

```ts
await tx
  .update(nudges)
  .set({ readAt: new Date() })
  .where(and(eq(nudges.toProfileId, childProfileId), isNull(nudges.readAt)));
```

If the family-link removal happens via a different code path, mirror the change there.

- [ ] **Step 8.7.3: Run tests + commit**

```
feat(api/consent): soft-clear unread nudges on WITHDRAWN transition
```

---

## Phase 9 — Nudge mobile parent

### Task 9.1: Build `useSendNudge` hook

**Files:**
- Create: `apps/mobile/src/hooks/use-nudges.ts`
- Create: `apps/mobile/src/hooks/use-nudges.test.ts`

- [ ] **Step 9.1.1: Write the failing tests**

```ts
it('useSendNudge calls POST /nudges via the typed client', async () => {});
it('surfaces RateLimitedError to the caller (no swallowing)', async () => {});
it('surfaces ConsentRequiredError to the caller', async () => {});
it('useMarkAllNudgesRead calls POST /nudges/mark-read with no body and invalidates the unread query', async () => {});
```

- [ ] **Step 9.1.2: Implement**

Use the existing Hono RPC client (`apps/mobile/src/lib/api.ts`) and wrap with React Query mutation. Errors are classified at the api-client middleware boundary (per `CLAUDE.md` "UX Resilience Rules" → "Classify errors at the API client boundary"). Do not parse HTTP status codes here.

- [ ] **Step 9.1.3: Run tests + commit**

```
feat(mobile/nudge): add useSendNudge hook
```

### Task 9.2: Build `NudgeActionSheet`

**Files:**
- Create: `apps/mobile/src/components/nudge/NudgeActionSheet.tsx`
- Create: `apps/mobile/src/components/nudge/NudgeActionSheet.test.tsx`

**Spec reference:** spec § "Nudge feature → User-facing surface" + § "Implementation notes" → "Mobile (parent)".

- [ ] **Step 9.2.1: Write the failing tests**

```ts
it('renders 4 templates + a Cancel option', () => {});

it('on tap: shows in-flight indicator on the selected row', () => {
  // Mock useSendNudge to never resolve. Tap a template. Assert spinner on that row.
});

it('shows confirmation toast ONLY after 200 response (non-optimistic)', async () => {
  // Mock useSendNudge to resolve after a tick. Tap. Assert no toast immediately. Await. Assert toast present.
});

it('shows inline rate-limit copy on RateLimitedError; sheet stays open', async () => {});

it('shows inline consent-pending copy on ConsentRequiredError', async () => {});

it('closes sheet on Cancel without sending', () => {});
```

- [ ] **Step 9.2.2: Implement**

```tsx
const TEMPLATES = ['you_got_this', 'proud_of_you', 'quick_session', 'thinking_of_you'] as const;

export function NudgeActionSheet({ childProfileId, onClose }: { childProfileId: string; onClose: () => void }) {
  const send = useSendNudge();
  const [pending, setPending] = useState<typeof TEMPLATES[number] | null>(null);
  const [error, setError] = useState<'rate' | 'consent' | 'network' | null>(null);

  const onTap = async (template: typeof TEMPLATES[number]) => {
    setPending(template); setError(null);
    try {
      await send.mutateAsync({ toProfileId: childProfileId, template });
      toast.success(t('nudge.toast.sent'));
      onClose();
    } catch (err) {
      if (err instanceof RateLimitedError) setError('rate');
      else if (err instanceof ConsentRequiredError) setError('consent');
      else setError('network');
    } finally {
      setPending(null);
    }
  };

  return (
    <ActionSheet>
      {TEMPLATES.map((tpl) => (
        <Row key={tpl} onPress={() => onTap(tpl)} loading={pending === tpl}>
          {t(`nudge.templates.${tpl}`)}
        </Row>
      ))}
      {error === 'rate' && <Text>{t('nudge.error.rateLimit')}</Text>}
      {error === 'consent' && <Text>{t('nudge.error.consentPending')}</Text>}
      {error === 'network' && <Text>{t('common.errors.network')}</Text>}
      <Row onPress={onClose}>{t('common.cancel')}</Row>
    </ActionSheet>
  );
}
```

- [ ] **Step 9.2.3: Run tests + commit**

```
feat(mobile/nudge): add NudgeActionSheet (non-optimistic, inline error rendering)
```

### Task 9.3: Wire the sheet to the parent Home nudge card

**Files:**
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.tsx`
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.test.tsx`

- [ ] **Step 9.3.1: Replace the Phase-3 placeholder onPress**

```tsx
const [sheetChild, setSheetChild] = useState<string | null>(null);
// ...
<NudgeCard onPress={() => setSheetChild(child.id)} />
{sheetChild && <NudgeActionSheet childProfileId={sheetChild} onClose={() => setSheetChild(null)} />}
```

- [ ] **Step 9.3.2: Add an integration test**

```ts
it('tapping a nudge card opens the action sheet for that child', () => {});
```

- [ ] **Step 9.3.3: Manual walkthrough**

Send a nudge to a test child profile in dev. Confirm:
- 200 → toast + sheet closes.
- Mock RateLimitedError → inline cap copy + sheet stays open.
- Tap Cancel mid-flight (where possible) → sheet closes, no false success.

Per `feedback_verify_before_declaring_done.md`: a fix that compiles is not a fix that works.

- [ ] **Step 9.3.4: Commit**

```
feat(mobile/home): wire NudgeActionSheet to parent Home nudge card
```

---

## Phase 10 — Nudge mobile kid

### Task 10.1: Add `'nudge'` case to push receiver

**Files:**
- Modify: `apps/mobile/src/hooks/use-push-notifications.ts` (or actual file — confirm)
- Modify: corresponding test file

**Spec reference:** spec § "Nudge feature → Kid-side surface".

- [ ] **Step 10.1.1: Locate the push receiver**

```powershell
git grep -nE "Notifications\.(addNotificationReceivedListener|setNotificationHandler)" apps/mobile/src/
```

- [ ] **Step 10.1.2: Add the case + a navigation effect**

When a `'nudge'` payload arrives in the foreground or via notification tap, route to `/home` (kid's Home tab) and let the banner pick up via `useUnreadNudges()`.

- [ ] **Step 10.1.3: Test + commit**

```
feat(mobile/push): handle 'nudge' notification type
```

### Task 10.2: Build `NudgeBanner` + `NudgeUnreadModal`

**Files:**
- Create: `apps/mobile/src/components/nudge/NudgeBanner.tsx` + tests
- Create: `apps/mobile/src/components/nudge/NudgeUnreadModal.tsx` + tests

**Spec reference:** spec § "Nudge feature → Kid-side surface" + § "Failure modes" → "Kid has multiple unread nudges queued" + "Consent withdrawn while child has unread nudges queued".

- [ ] **Step 10.2.1: Write the failing tests for the banner**

```ts
it('renders the most recent unread nudge', () => {});

it('shows "N new" badge when more than one unread', () => {});

it('does NOT render when the active profile is no longer CONSENTED (consent re-check)', () => {
  // Per spec § Nudge feature → Kid-side surface: "Banner re-checks consent before rendering."
});

it('tapping the banner opens the unread modal', () => {});

it('marking as read calls PATCH /nudges/:id/read', () => {});
```

- [ ] **Step 10.2.2: Implement the banner**

```tsx
export function NudgeBanner() {
  const { activeProfile } = useProfile();
  // Consent status comes from useConsentStatus (or whatever P-0.7 captured),
  // NOT from a `consentStatus` property on the profile — that property does not exist.
  const { data: consent } = useConsentStatus(activeProfile.id, NUDGE_GATING_CONSENT_TYPE);
  const { data: unread = [] } = useUnreadNudges(activeProfile.id);
  if (consent?.status !== 'CONSENTED') return null;
  if (unread.length === 0) return null;
  const top = unread[0];
  // ... render with template text + sender display name + count badge
}
```

- [ ] **Step 10.2.3: Implement the modal + mark-read**

The modal lists all unread nudges. On dismiss, call **`POST /nudges/mark-read`** with no body (the bulk endpoint marks all of the caller's unread in a single transaction). Then invalidate the unread query. Do not loop sequential PATCHes — partial-failure leaves cache and DB inconsistent.

Banner-tap that opens the modal is informational; mark-read happens on dismiss, not on open, so a kid who opens then quickly closes still gets exactly-once cleanup.

- [ ] **Step 10.2.4: Mount the banner in the kid's Home (`LearnerScreen` solo branch)**

Add `<NudgeBanner />` above the student picker. Solo learners with no incoming nudges see nothing — banner self-suppresses.

- [ ] **Step 10.2.5: Test + commit**

```
feat(mobile/nudge): NudgeBanner + NudgeUnreadModal on kid Home
```

---

## Phase 11 — i18n + E2E

### Task 11.1: Add i18n keys × 7 locales

**Files:**
- Modify: `apps/mobile/locales/en/common.json`
- Modify: `apps/mobile/locales/de/common.json`
- Modify: `apps/mobile/locales/es/common.json`
- Modify: `apps/mobile/locales/ja/common.json`
- Modify: `apps/mobile/locales/nb/common.json`
- Modify: `apps/mobile/locales/pl/common.json`
- Modify: `apps/mobile/locales/pt/common.json`

**Spec reference:** spec § "What changes" → "i18n" + "Nudge feature → i18n".

- [ ] **Step 11.1.1: Confirm the locale file path**

```powershell
git ls-files "apps/mobile/locales/en/*.json"
```
The file may be `common.json`, `translation.json`, or split. Use whatever the existing pattern is — do not invent a new file.

- [ ] **Step 11.1.2: Author the en source strings**

Add the keys listed in the "Modified files" table at the top of this plan. For card titles that interpolate `{{childName}}`, the en string is **one phrasing among seven**. Example en:

```json
{
  "home": {
    "parent": {
      "greeting": "Hey {{displayName}}",
      "intentHeader": "What do you need right now?",
      "cards": {
        "checkChild": "See how {{childName}} is doing",
        "weeklyReport": "Read {{childName}}'s weekly report",
        "sendNudge": "Send {{childName}} a nudge",
        "continueOwn": "Continue your own learning",
        "openSession": "Open {{childName}}'s session"
      },
      "transitionNotice": "You're a parent now too. This is your home — kids' progress and your own learning, all in one place."
    }
  },
  "nudge": {
    "templates": {
      "you_got_this": "You got this",
      "proud_of_you": "Proud of you",
      "quick_session": "Want to do a quick session?",
      "thinking_of_you": "Just thinking of you"
    },
    "toast": { "sent": "Nudge sent" },
    "error": {
      "rateLimit": "You've sent enough encouragement for now — {{childName}} will see it next time they open the app.",
      "consentPending": "{{childName}}'s consent is pending — encouragement will work once they're set up."
    },
    "banner": {
      "title": "{{fromDisplayName}} sent you a nudge",
      "unreadCount": "{{count}} new"
    }
  }
}
```

- [ ] **Step 11.1.3: Translate to the other 6 locales**

Each locale file owns full sentence shape for the `{{childName}}` templates per spec ("Possessives, verb position, and word order vary across nb, de, es, pl, pt, and especially ja"). Consult prior translations of similar interpolated strings in the same file for tone.

**Fallback policy (decided 2026-05-10):** the merge is gated on **all 7 locales fully translated**. Do not ship en strings under non-en keys, do not ship raw key literals, and do not rely on i18next runtime fallback to English. The locale that catches a missing nudge translation is silent: the kid sees `nudge.banner.title` literal on screen with no telemetry. The PR description must enumerate translator review for nb (user is Norwegian — check tone personally), de, es, ja, pl, pt before merge. If a translation is genuinely blocked, surface to the user as a merge-blocker, not a soft warning.

- [ ] **Step 11.1.4: Run typecheck + lint**

If the project uses i18n type generation, run it. Confirm no missing-key errors.

- [ ] **Step 11.1.5: Commit**

```
feat(mobile/i18n): add parent-home + nudge keys across 7 locales
```

### Task 11.2: Update parent-journey E2E suite

**Files:**
- Modify or create: Maestro flows under `apps/mobile/e2e/`

**Spec reference:** spec § "Implementation notes → Tests → E2E tests" + § "Verification before declaring done".

- [ ] **Step 11.2.1: Inventory existing parent-journey flows**

```powershell
git ls-files apps/mobile/e2e/ | Select-String -Pattern "parent|family"
```
Each existing flow that navigates via the Family tab is updated to navigate via Home cards.

- [ ] **Step 11.2.2: Update existing flows**

Replace `tapOn: { id: "tab-family" }` (or equivalent) with the Home card that reaches the same destination. Confirm the same downstream assertions still hold.

- [ ] **Step 11.2.3: Add new flows**

(a) **solo-to-parent transition:** sign in as solo learner → Home shows student picker → add a child (existing add-child flow) → return to Home → assert ParentHomeScreen testID + transition notice → tap dismiss → restart app → assert no notice.

(b) **send a nudge end-to-end:** sign in as parent → Home → tap "Send TestKid a nudge" → tap "You got this" → wait for toast → confirm sheet closed. (For the kid side, run a second flow as TestKid: open app, assert banner with the parent's display name.)

(c) **rate cap:** parent sends 3 nudges → 4th tap → assert inline rate-limit copy in the sheet, no "Sent" toast.

(d) **Progress segmented control:** parent → Progress tab → assert pills `TestKid · Mine` → tap "Mine" → assert own progress data → tap child pill → assert child's progress data.

(e) **cross-stack nav:** parent → Home → tap "Read TestKid's weekly report" → confirm route is `/child/[profileId]/weekly-report` → tap back → confirm route is `/child/[profileId]` (not `/home`).

- [ ] **Step 11.2.4: Run E2E**

Per `CLAUDE.md` testing rule + `feedback_e2e_never_skip.md`:
```powershell
# Use the project's E2E command — `/my:e2e` skill or the underlying maestro invocation.
```

If the emulator setup has known issues, consult `e2e-emulator-issues.md` (per `feedback_emulator_issues_doc.md`) before attempting workarounds.

- [ ] **Step 11.2.5: Commit**

```
test(mobile/e2e): add parent-journey flows for new Home + nudges + segmented control
```

---

## Phase 12 — Final verification

### Task 12.1: Full validation run

- [ ] **Step 12.1.1: Lint, typecheck, unit tests, integration tests**

```powershell
pnpm exec nx run-many -t lint
pnpm exec nx run-many -t typecheck
pnpm exec nx run-many -t test
pnpm exec nx run api:test  # includes integration
```
Expected: all PASS.

- [ ] **Step 12.1.2: Verify spec § "Verification before declaring done" point by point**

Walk the spec's verification list literally — do not skip any line. For each item, capture evidence (screenshot path, test name, log line) in the final commit message body.

- [ ] **Step 12.1.3: Sweep audit**

Per `feedback_sweep_for_same_bug.md` and `CLAUDE.md` "Fix Development Rules → Sweep when you fix":
- Search for any remaining inline `linkedChildren` filter — should be zero hits outside `useLinkedChildren()` itself.
- Search for any remaining `parent-proxy-active` clear at a tap-handler site — should be only the centralized clear in `useProfile()`.
- Search for any literal `/family` route push — should be zero.
- Search for any direct push to `/child/[profileId]/weekly-report` without an ancestor push immediately preceding — should be zero.

```powershell
git grep -nE "useMemo.*isOwner.*p\.id|parent-proxy-active.*setItem|router\.push.*'/family|router\.push.*weekly-report"
```

If any hit remains, decide: (a) fix it in this PR (sweep policy); or (b) document a deferred sweep with an owner and date in the PR description.

- [ ] **Step 12.1.4: Manual end-to-end walkthrough on a real device**

Per `user_device_small_phone.md`: confirm the parent Home renders correctly on a 5.8" Galaxy S10e. Pay particular attention to:
- Pill row overflow with 3 children + "Mine" + a long-translated locale (try `de`).
- Card stack length on Home with 3 children (9 cards + own-learning + optional session).
- WithdrawalCountdownBanner placement above the cards.
- Transition notice on the very first solo-to-parent render.

- [ ] **Step 12.1.5: Final commit**

If any small fixups are needed from Step 12.1.4, make them. Then commit:

```
chore(parent-home): verification + sweep audit complete

See spec docs/specs/2026-05-10-parent-home-as-primary-surface.md.
Evidence: <list of test names, screenshots, sweep findings>.
```

---

## Out of scope for this plan (re-listed from spec § "Out of scope")

- DB/schema renames (`isOwner`, `family_links`, `Child*`/`Parent*`, "Mentor" rename).
- Multi-mentor-per-mentee.
- Non-family mentor relationships.
- Free-text nudges, kid-to-parent replies, voice nudges, scheduled nudges.
- Quota/billing recalibration if parent learning consumes more pool.

If any of these emerge during implementation, surface them — do not bundle.

## Open questions to surface to the user before merge

From spec § "Open questions":
1. **Subtitle copy for "See how X is doing"** — implementation defaults to live snapshot when present, neutral fallback otherwise. Confirm phrasing.
2. **Card order with multiple children** — implementation uses `family_links.createdAt` ascending (gated on Step P-0.8 threading the timestamp through the mobile DTO). Confirm.
3. **Visual differentiation between "See how X" and "Read X's weekly report"** — assign distinct icon + tint. Confirm choices before final commit.
4. **Card density on small phones with multiple children** — three children produces 9 base cards (See how / Read report / Send nudge × 3) + Continue your own + optional active session = up to 11 cards. On the user's 5.8" Galaxy S10e this is a long scroll and re-creates the original "wrong card sized as primary CTA" problem at multi-child density. Two design alternatives:
   - (a) **Group by child** — one collapsible section per child showing the three actions inside, with the section header summarizing the child's status.
   - (b) **Group by intent** — one "Check on a kid" card with a child picker, one "Read reports" card with picker, one "Send a nudge" card with picker. Three cards regardless of child count.
   
   Default if unanswered: ship (b) for ≥2 children and the existing flat list for 1 child. Surface as a user-facing decision per `feedback_non_coder_decisions.md` before Phase 3 starts.

These are presentation decisions — the user is non-coder per `feedback_non_coder_decisions.md`, so surface them as user-facing questions, not engineering trade-offs.
