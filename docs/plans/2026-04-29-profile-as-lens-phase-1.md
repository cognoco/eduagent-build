# Profile-as-Lens — Phase 1 Implementation Plan

**Date:** 2026-04-29
**Status:** Engineering-ready (revised 2026-05-02 after codebase reconciliation)
**Spec:** [`docs/specs/2026-04-28-profile-as-lens.md`](../specs/2026-04-28-profile-as-lens.md)
**Phase:** 1 of 3 (Foundation — no-regrets refactoring + microcopy + per-profile reporting on `/progress`)

> **Progress check (2026-05-01):** Plan is 2 days old. No PR-0 / PR-1 / PR-2 / PR-3 / PR-4 commits found — `git log --grep="profile-as-lens"` returns only branch-snapshot chores (`b028ae24`, `4bf519fc`). Treat as awaiting first commit; PR 0 (analytics groundwork) is the unblocker for everything else.

## Overview

**Five PRs** land Phase 1 (PR 0 added by adversarial review for analytics groundwork). Closes 7 of the 16 audit findings the spec catalogues (BUG-898, 900, 901, 903, 904, 906, 909). The remaining 9 audit findings are split across "deliberately not in scope" (6: BUG-881, 902, 907, 908, 910, 911) and "deferred to Phase 2/3" (3: see Phase 2/3 spec sections). Architecturally reversible — none of these PRs commit to the bigger Phase 2 moves (Family tab, multi-lens Home, Privacy & Lenses panel).

After Phase 1 ships, telemetry events (in PR 2/3/4) feed the Phase 1 → Phase 2 gate: 30-60 days of production data validates or falsifies the premises (P1, P2, P3) that justify Phase 2's architectural commitments.

```
PR 0 (Analytics groundwork) ─→ PR 2 (Quota endpoint)   ──┐
                            └─→ PR 3 (/progress)        ──┤
PR 1 (Component lift)       ───────────────────────────→ PR 3
PR 4 (Microcopy) ────────── must merge AFTER PR 1 ──────→ ┘  → Ship Phase 1
```

**Sequencing rules (corrected after finding #27/#28 — PR 1 and PR 4 touch overlapping files):**
- PR 0 (analytics) ships first — unblocks events in PR 2/3/4.
- PR 1 (component lift) and PR 2 (quota endpoint) can run in parallel.
- PR 3 (/progress) blocks on PR 1.
- **PR 4 (microcopy) blocks on PR 1**, because PR 1 turns the `/child/[profileId]/*` files into thin wrappers and PR 4 edits microcopy in those same files. Merging PR 4 first would force a full re-rebase of PR 1 against new copy AND invalidate PR 1's "visual snapshot diff = zero" acceptance criterion.

Total estimated duration on the critical path: **~3 sprints (15–18 working days)**, dominated by PR 1 (5–7d) → PR 3 + PR 4 in parallel (3d). Prior estimate of "1.5 sprints" assumed independence between PR 1 and PR 4, which adversarial review disproved.

## PR 0 — Analytics Groundwork

**Goal:** Confirm or scaffold the product-analytics pipeline that PR 2/3/4 events depend on. Without this, the entire Phase 1 → Phase 2 gate is unreachable.

**Effort:** ~2 days (or ~5 days if no pipeline exists and a minimal one must be added).

**Why this is now Phase 0, not Phase 1:** Adversarial review finding #16 — wired-but-untriggered events create false confidence. Sign-off criterion #4 ("telemetry events firing in production") is unfalsifiable until a pipeline + verification dashboard exist.

### Tasks

- [ ] **Audit existing analytics infra.** Grep for `posthog`, `mixpanel`, `analytics`, `track(`, `capture(` across `apps/api/`, `apps/mobile/`, `packages/`. Document what exists.
- [ ] **Decision:** PostHog (recommended for product analytics + funnels), Mixpanel, or a custom `events` table in Postgres + a Looker/Metabase dashboard. Decide before PR 2 starts.
- [ ] **Privacy review:** confirm telemetry events comply with GDPR-everywhere (see `market_language_pivot.md`). Specifically: any `profile_id` in events must be hashed or pseudonymous if forwarded to a third-party SDK; `time_since_account_created_days` is bucketed (0/1-7/8-30/31+) not raw to prevent re-identification.
- [ ] **Verification dashboard:** stand up a query or saved dashboard for each of the four event names. Sign-off criterion #4 references this dashboard.
- [ ] **Add `analytics` helper module:** `apps/mobile/src/lib/analytics.ts` exposing `track(eventName, properties)`. Server-side equivalent if events fire from API.

### Acceptance for PR 0

- [ ] Analytics SDK or events table in place. **Verified by:** `manual: smoke event fires from dev build and appears in dashboard within 60s.`
- [ ] Privacy review documented in PR description listing every property and whether it could re-identify a user. **Verified by:** `manual: PR description includes property table.`
- [ ] Verification dashboard created with one row per event name. **Verified by:** `manual: dashboard URL in PR description.`
- [ ] `track()` helper exported from `@eduagent/...` or local module. **Verified by:** `test: apps/mobile/src/lib/analytics.test.ts:"track() forwards to provider".`

### Risks / unknowns

- **No pipeline = scope expands.** If audit finds nothing, the PostHog SDK + cohort/funnel setup adds ~3 days. Reflected in the 2–5 day estimate range.
- **Server-side vs client-side firing.** `subscription_breakdown_viewed` could fire client-side; `child_progress_navigated` may need server-side fallback if deep-link handlers bypass the React tree. Decide per event in PR 0.

---

## PR 1 — Component Lift

**Goal:** Extract `/child/[profileId]/*` reporting components into a shared module so they can mount on `/progress` (PR 3) and any future surface without duplication.

**Effort:** ~1 sprint (5-7 days for one engineer).

### Pre-flight discovery (Day 1, before any code moves)

PR 1 cannot start without this audit. Findings shape the actual scope.

- [ ] **Source inventory.** Grep `apps/mobile/src/app/(app)/child/[profileId]/` for components rendered today. List each section currently in `index.tsx`, `weekly-report/[id].tsx`, `report/[id].tsx`, `reports.tsx` with file:line references. Output a table mapping current location → proposed component name. Without this table, the "lift" is a rewrite under refactor branding.
- [ ] **Hook audit.** The existing hooks are `useChildDetail` and `useChildSessions` (in `use-dashboard.ts`), `useChildInventory`, `useChildProgressHistory`, and `useChildReports` (in `use-progress.ts`), and `useChildLearnerProfile` (in `use-learner-profile.ts`). All accept `profileId` as a parameter already. Confirm none embed guardian-role assumptions beyond the `Child` prefix. If any hook is child-only in behavior (not just naming), split it before the lift.
- [ ] **State coverage audit (UX Resilience compliance).** For each component candidate, document the four required states: loading, error, empty, offline. Anything missing must be added in this PR — the components are about to mount on a second surface (`/progress`) where any dead-end state becomes much more visible.

### Files touched

**Extend existing module:** `apps/mobile/src/components/progress/`

> **2026-05-02 reconciliation:** The plan originally proposed a new `components/reporting/` directory, but `components/progress/` already exists and exports `GrowthChart`, `SubjectCard`, `MilestoneCard`, `RetentionSignal`, `ProgressBar`, `RemediationCard`. The child profile page (`child/[profileId]/index.tsx`) already imports `GrowthChart` and `SubjectCard` from there. New reporting components should be added to this existing module rather than creating a parallel directory.

The component files below are the working set. `GrowthChart` and `SubjectCard` are already shared — they stay as-is. Pre-flight discovery may merge or split the remaining entries; final count is locked at the end of Day 1 and recorded in the PR description.

**Already shared (no lift needed):**
- `GrowthChart.tsx` (already in `components/progress/`)
- `SubjectCard.tsx` (already in `components/progress/`)

**To extract into `components/progress/`:**
- `WeeklyReportCard.tsx` + `WeeklyReportCard.test.tsx`
- `MonthlyReportCard.tsx` + `MonthlyReportCard.test.tsx`
- `ReportsListCard.tsx` + `ReportsListCard.test.tsx` (lists weekly + monthly snapshots)
- `RecentSessionsList.tsx` + `RecentSessionsList.test.tsx`
- `MasteredTopicsByLevel.tsx` + `MasteredTopicsByLevel.test.tsx`
- `VocabularySummary.tsx` + `VocabularySummary.test.tsx`
- `StreakBadge.tsx` + `StreakBadge.test.tsx`
- Update `index.ts` barrel with new re-exports

**Existing files become thin wrappers** (import from `components/progress/`, supply `profileId` from URL, add page chrome):
- `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`
- `apps/mobile/src/app/(app)/child/[profileId]/weekly-report/[weeklyReportId].tsx`
- `apps/mobile/src/app/(app)/child/[profileId]/report/[reportId].tsx`
- `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx`

### Component API contract

Each component takes `profileId: string` as a required prop. Components fetch their own data via existing hooks (`useChildReports(profileId)`, `useChildProgressHistory(profileId)`, etc.) — they should never derive `profileId` from URL params themselves.

```tsx
type ReportingComponentProps = {
  profileId: string;
};
```

The previously-proposed `context?: 'self' | 'child'` prop is **removed** (adversarial review finding #3 — premature abstraction with no Phase 1 behavioral effect). If Phase 2 needs branching, it gets added with the actual divergence in the same PR.

### Data-loading strategy

Multiple new components mounting on `/progress` would otherwise trigger uncoordinated fetches and produce a "popcorn" load with isolated error UI per card. (`GrowthChart` and `SubjectCard` already mount there — only the newly-lifted report components add fetch fanout.)

- **Suspense boundary at the consumer level.** `/progress` and `/child/[id]` each wrap the report stack in a single `<Suspense fallback={<ReportStackSkeleton />}>` so cards appear together.
- **Shared error boundary.** A single `<ReportingErrorBoundary>` wraps the stack with a "Couldn't load reports — Retry / Go home" fallback, conforming to the UX Resilience standard error pattern.
- **Per-component empty states are explicit.** Each card defines its own empty state with at least one tappable element (CTA back to `/library`, "What's this?" explainer, etc.). No silent renders.
- **Request batching is out of scope for PR 1** — refactor work does not invent new endpoints. Existing call counts are preserved; reduction is a Phase 2 concern.

### Tests

Each new component file has a co-located test file (per CLAUDE.md: "Tests are co-located with source files. Do not create __tests__/ folders").

**Integration test preservation.** The existing test in `apps/mobile/src/app/(app)/child/[profileId]/index.test.tsx` is *split* into per-component tests AND a retained page-level integration test that asserts: (a) cards render in expected order, (b) chrome (back button, header, profile fetch) works, (c) the Suspense + error boundary wrap the stack. Coverage delta in the PR description must show no net loss of integration assertions.

Per-component test floor: render with valid data, render in loading state, render in empty state, render in error state. Anything below this floor fails acceptance.

### Acceptance for PR 1

| Criterion | Verified by |
|---|---|
| All new reporting components live under `apps/mobile/src/components/progress/` (extending existing module) with co-located tests; final count (≤7 new, excluding already-shared `GrowthChart`/`SubjectCard`) recorded in PR description after pre-flight audit. | `manual: PR description lists each component with source file:line.` |
| `/child/[profileId]/index.tsx`, `/weekly-report/[id].tsx`, `/report/[id].tsx`, `/reports.tsx` render identically before and after PR 1 in isolation (PR 4 lands AFTER PR 1). | `test: visual snapshot tests, baseline = pre-PR-1 main.` |
| All existing tests pass. | `pnpm exec nx run mobile:test --findRelatedTests <changed files>` |
| Component API contract: each component takes `profileId` as required prop; no internal URL-param reading; no `context` prop. | `test: per-component test imports component and asserts prop types.` |
| Each component has loading, error, empty, and offline states with at least one tappable element. | `test: per-component test asserts presence of action element in each non-happy state.` |
| Suspense + error boundary wrap the stack on `/child/[profileId]/index.tsx`. | `test: page-level integration test.` |
| No new package dependencies added. | `manual: package.json diff shows 0 added deps.` |

### Failure Modes table (PR 1)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Component loading | Hook fetching | Skeleton inside shared Suspense fallback | None needed (auto-resolves or escalates to error boundary) |
| Component error | Hook throws / API 5xx | Shared error boundary "Couldn't load reports" + Retry / Go home | Retry hook query; fallback nav home |
| Component empty | Hook returns no data | Card-specific empty state with CTA | CTA leads to `/library` or explainer |
| Offline | Network missing pre-fetch | Banner: "You're offline — showing cached reports if available" | OS toggles online → auto-retry |
| Wrapper page mounts with invalid `profileId` | URL tampering / stale link | "We can't find that profile" + Go home | Single Go-home action |

### Risks / unknowns

- **Hook coupling.** Pre-flight audit catches this on Day 1.
- **Persona styling.** Memory `project_persona_removal.md` says personaType is removed and tokens are flat by colorScheme — components should already be persona-unaware. Confirm during lift.
- **Test reorganization is fiddly.** Plan for ~30% of time on test split + retained integration coverage.
- **Fetch fanout** stays as-is for PR 1; logged as Phase 2 concern. Reduced vs. original plan since `GrowthChart` and `SubjectCard` are already shared.

## PR 2 — Per-Profile Quota Endpoint + Owner Breakdown

**Goal:** Show owner the per-profile quota usage breakdown on `/subscription`. Closes BUG-906 (data inconsistency surface) and clarifies BUG-898 (dual-date confusion).

**Effort:** ~3 days.

### Files touched

**API:**
- `apps/api/src/routes/subscription.ts` — extend `GET /v1/subscription/usage` response shape
- `apps/api/src/services/subscription.ts` — aggregate `usage_events` per `profile_id`
- `apps/api/src/services/subscription.test.ts` — integration test for breakdown
- `packages/schemas/src/subscription.ts` — extend response schema

**Mobile:**
- `apps/mobile/src/app/(app)/subscription.tsx` — render `by_profile` rows under USAGE THIS MONTH
- `apps/mobile/src/app/(app)/subscription.test.tsx` — snapshot test for owner vs non-owner views
- `apps/mobile/src/hooks/use-subscription.ts` — type extension for `by_profile`

### Pre-flight discovery (before code)

- [ ] **Document the current `GET /v1/subscription/usage` response shape** by reading `packages/schemas/src/subscription.ts` and `apps/api/src/routes/subscription.ts`. Paste the current shape into the PR description verbatim. Without this baseline, "existing fields preserved" is unverifiable (finding #7).
- [ ] **Confirm `usage_events.profile_id` population.** Query staging: `SELECT count(*) FROM usage_events WHERE profile_id IS NULL;`. If non-zero, scope the backfill migration before PR 2 starts (finding #21).
- [ ] **Define "owner."** The `family_links` table is the source of truth (`feedback_persona_vs_role.md`). "Owner" = the profile with `family_links.role = 'owner'` for the family group, OR (if no such role exists) the profile that created the subscription on `subscriptions.owner_profile_id`. Decide which and document. Do not invent an `is_owner` boolean derived from anything else.

### API contract change

**Current shape** (filled in during pre-flight discovery):

```typescript
// PASTE CURRENT SHAPE HERE FROM packages/schemas/src/subscription.ts BEFORE STARTING WORK
```

**New shape** (additive):

```typescript
{
  // ...current shape preserved verbatim...
  by_profile: Array<{
    profile_id: string;
    name: string;
    used: number;
  }>;
  renews_at: string;     // ISO 8601 timestamp WITH timezone offset, server time
  resets_at: string;     // ISO 8601 timestamp WITH timezone offset, server time
  resets_at_label: string; // pre-formatted in owner's locale/tz (e.g., "May 15, 2026") — server formats, client renders
  renews_at_label: string; // same
}
```

**Timezone rule (finding #11).** Both `renews_at` and `resets_at` are full ISO 8601 timestamps with offset, NOT date-only strings. The server additionally returns `*_label` fields pre-formatted in the owner's stored timezone. The client renders the label, never reformats from the timestamp. This eliminates BUG-898 reborn-by-timezone.

**Schema compatibility:**
- The Zod schema in `packages/schemas/src/subscription.ts` MUST use `.passthrough()` on the response (or treat `by_profile` as `.optional()`) so older mobile clients receiving the new field do not crash on parse. Add a regression test asserting an unknown extra field passes through (finding #8).

**Backend logic:**
- **Owner** (`family_links.role = 'owner'` for this family group): returns full `by_profile` array.
- **Non-owner adult** (e.g., `role = 'guardian'`): returns `by_profile` containing only their own slice. Family aggregate **omitted from response when family has ≥2 children** to prevent siblings'-total leakage by subtraction (finding #9).
- **Children** (`role = 'learner'`): same as non-owner adult; aggregate-by-subtraction guard also applies.

### Privacy guard (finding #9)

Adversarial review identified that showing both `your_used` and `family_aggregate` to a non-owner with one sibling lets them compute the sibling's exact usage. Mitigation:
- If family has 0–1 other learners besides the requester, aggregate may be shown (no information leak).
- If family has ≥2 other learners, aggregate is suppressed for non-owners; mobile renders "Your usage: 30 / family cap 1500" with no aggregate row.
- Owner always sees aggregate (they have the breakdown anyway).

### Mobile rendering

Owner view (≥1 child):

```
Usage this month        90 / 1500 questions used
  Your share              30
  TestKid                 60
  Family aggregate        90 / 1500
Quota resets on {resets_at_label}
Subscription renews on {renews_at_label}
```

Non-owner view, family has 0–1 other learners (aggregate safe):

```
Usage this month        90 / 1500 questions used in your family
  You used                30
  Family aggregate        90 / 1500
Quota resets on {resets_at_label}
Subscription renews on {renews_at_label}
```

Non-owner view, family has ≥2 other learners (aggregate suppressed):

```
Usage this month
  Your usage              30 questions out of 1500 family quota
Quota resets on {resets_at_label}
Subscription renews on {renews_at_label}
```

### Tests

- API integration test: owner gets full breakdown.
- API integration test: non-owner with 1 sibling sees aggregate.
- API integration test: non-owner with ≥2 siblings does NOT see aggregate (break test for the privacy guard).
- API integration test: child role never sees other children's usage.
- API integration test: schema includes `*_label` fields with correct timezone formatting.
- API regression test: response schema accepts unknown extra fields (older client compat) — uses `.passthrough()`.
- API regression test: an *older* mobile binary's Zod schema (pinned snapshot) parses the *new* response without error (the omitted reverse case from finding #8).
- Mobile snapshot test for owner view, non-owner-1-sibling view, non-owner-many-siblings view.
- Mobile graceful-degrade test: when `by_profile` is undefined (older API), aggregate-only render.

### Acceptance for PR 2

| Criterion | Verified by |
|---|---|
| Current response shape pasted into PR description before any code changes. | `manual: PR description has the pre-flight shape paragraph.` |
| Owner sees per-profile rows with names + used counts. | `test: subscription.test.ts:"owner sees breakdown".` |
| Non-owner with 1 sibling sees own + aggregate; non-owner with ≥2 siblings does NOT see aggregate. | `test: subscription.test.ts:"aggregate suppressed when ≥2 siblings".` (break test for privacy guard) |
| Children never see siblings' usage including by aggregate-subtraction. | `test: subscription.test.ts:"child cannot derive sibling totals".` |
| `resets_at_label` and `renews_at_label` formatted in owner's timezone, never the device's. | `test: subscription.test.ts:"label uses stored owner tz".` |
| Older mobile binary parses new response without error. | `test: schema regression test using pinned schema snapshot.` |
| When mobile is newer than API (no `by_profile`), aggregate-only render works. | `test: mobile graceful-degrade snapshot.` |
| Backfill migration (if needed) ships with rollback section. | `manual: PR description includes rollback paragraph; reviewer confirms.` |

### Failure Modes table (PR 2)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Endpoint 5xx | Server error during aggregation | "Can't load usage right now" + Retry / Go back | Retry; fallback to last cached usage if available |
| `by_profile` empty for owner | Family has only owner profile | "You're the only profile using your subscription" | Tap to invite a child / continue |
| `usage_events.profile_id` NULL for old rows | Pre-migration data | Backend filters NULL rows from aggregation; aggregate count adjusted with caveat note | Backfill migration (see Rollback) |
| Non-owner views own slice while quota exhausted | User exhausted family quota | "Family quota reached — owner can review on their device" | Link to a "Notify owner" action (Phase 1 = mailto/share; Phase 2 = push) |

### Rollback (per `~/.claude/CLAUDE.md`)

If `usage_events.profile_id` backfill migration is required:
- **Reversible?** Yes for column population (set affected rows back to NULL) — but downstream aggregations cached during the rollout window may be incorrect.
- **Data loss on rollback?** None — the migration only populates a column; original event rows are unchanged.
- **Procedure:** revert worker deploy → run `UPDATE usage_events SET profile_id = NULL WHERE updated_at > '<deploy-ts>'` if any aggregation went sideways → invalidate any cached usage summaries.
- If no migration is needed (column already populated), this section reads "N/A — no schema change."

### Risks / unknowns

- **Schema readiness.** Pre-flight catches.
- **Performance.** Per-profile aggregation MUST be a single grouped query; reviewer rejects N+1.
- **Privacy enforcement is server-side only** — never rely on client filtering for `by_profile`. Verified by API integration tests above.

## PR 3 — Self-Reporting on `/progress`

**Goal:** Mount the lifted reporting components on the active profile's `/progress` tab. Closes BUG-901 (session detail dead-end), BUG-903 (weekly report dead-end), BUG-904 (reports redundant copy).

**Effort:** ~3 days frontend + 0–1 day API if a new endpoint is required. **Blocks on PR 1 and PR 0.**

### Pre-flight discovery

- [ ] **`useProfileSessionHistory` data source.** Grep `apps/mobile/src/hooks/` for an existing hook that already returns session count or last-session for a profile. If none exists, the hook needs a backing API endpoint (extend `GET /v1/profiles/:id/summary` or add a small `GET /v1/profiles/:id/session-history`). Decision and endpoint signature recorded in PR description before implementation. Without this step PR 3 is silently cross-cutting.
- [ ] **Visual hierarchy on the 5.8" emulator.** Pull current `/progress` screenshot. Confirm whether report cards above existing TopicsList push fold content out of view; design decision (vertical stack, segmented control, or accordion) made before code.

### Files touched

- `apps/mobile/src/app/(app)/progress/index.tsx` — add report cards, link to full reports
- `apps/mobile/src/app/(app)/progress/index.test.tsx` — tests for each render state
- `apps/mobile/src/hooks/use-profile-session-history.ts` (+ test) — new hook, signature decided in pre-flight
- (If needed) `apps/api/src/routes/profiles.ts` and matching test — new or extended endpoint
- (Optional) `apps/mobile/src/app/(app)/progress/reports.tsx` — full reports list for active profile

### "Has own activity" rule (replaces fragile `hasOwnSessions`)

Adversarial review: keying empty-state on `hasOwnSessions` (boolean) misclassifies a parent who completed one throwaway session — the most-important Phase 1 CTA disappears for them.

Replacement rule:
- The hook returns `{ sessionCount: number, lastSessionAt: ISO8601 | null }`.
- Empty state renders when `sessionCount === 0` **OR** (`lastSessionAt` is more than 14 days ago AND `sessionCount < 3`). The recency carve-out keeps the CTA visible for parents who tried once and bounced.
- Threshold (14 days, count < 3) tunable; record values in PR description and as a constant `STALE_PROFILE_HEURISTIC` in `apps/mobile/src/lib/progress.ts`.

### Render rules

```tsx
function ProgressTab() {
  const { activeProfile } = useProfile();
  const { sessionCount, lastSessionAt } = useProfileSessionHistory(activeProfile.id);
  const isStale = isProfileStale({ sessionCount, lastSessionAt });

  if (!isStale) {
    return (
      <ReportingErrorBoundary>
        <Suspense fallback={<ReportStackSkeleton />}>
          <WeeklyReportCard profileId={activeProfile.id} />
          <MonthlyReportCard profileId={activeProfile.id} />
          {/* existing TopicsList, VocabularyList, etc. */}
          <ReportsListCard profileId={activeProfile.id} />
        </Suspense>
      </ReportingErrorBoundary>
    );
  }

  return (
    <EmptyProgressState
      cta="Start your own learning"
      onCTA={() => router.push('/library')}
    />
  );
}
```

### Tests

- Snapshot test: solo learner with sessions sees full report stack.
- Snapshot test: parent + learner with own sessions sees full report stack.
- Snapshot test: profile with `sessionCount === 0` sees empty state with CTA.
- Snapshot test: profile with `sessionCount === 1` and `lastSessionAt` 30 days ago — sees empty state with CTA. (Regression test for the hasOwnSessions misclassification.)
- Snapshot test: child sees full report stack.
- Interaction test: tapping "Start your own learning" navigates to `/library`.
- Unit test: `isProfileStale()` truth table covers boundaries.

### Acceptance for PR 3

| Criterion | Verified by |
|---|---|
| Active profile's reports appear on `/progress` when not stale. | `test: progress/index.test.tsx:"non-stale shows reports".` |
| Empty state with CTA appears when stale (zero or low+old). | `test: progress/index.test.tsx:"stale shows empty CTA".` |
| Hook backed by existing endpoint (cited) or new one (signature in PR description). | `manual: PR description shows endpoint reference.` |
| No automatic Home card or modal appears as a result of this PR. | `manual: app/(app)/(tabs)/index.tsx diff = 0.` |
| No bottom-nav changes. | `manual: app/(app)/_layout.tsx diff = 0.` |
| `progress_report_viewed` and `progress_empty_state_cta_tapped` events fire. | `test: progress/index.test.tsx mocks track() and asserts call.` |
| Visual hierarchy verified on 5.8" emulator before merge. | `manual: PR description has screenshot.` |

### Failure Modes table (PR 3)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Hook errors | API 5xx / network | "Couldn't load your progress — Retry / Go home" via shared error boundary | Retry refetches; Go home |
| Active profile deleted under user | Concurrent profile delete | "Profile not found — pick another profile" | Navigate to profile picker |
| Stale CTA tapped offline | No connectivity | Toast "You're offline — try again in a moment" | Auto-retry on reconnect |
| New profile mid-week, no weekly report yet | Report not yet generated | Card shows "Your first weekly report arrives Sunday" + "Why?" explainer | Wait; explainer documents schedule |

### Risks / unknowns

- **Visual hierarchy.** Pre-flight catches.
- **Hook design.** Pre-flight catches.
- **Cross-cutting if endpoint needed.** Estimate may rise to 4 days.

## PR 4 — Microcopy Pass

**Goal:** Sentence case + uppercase ban + form-context branching + scaling cross-links. Closes BUG-900 (Add Child wrong pronouns). Completes BUG-909 (Learning Mode unlabeled — owner-scope prefix already shipped, uppercase removal remaining).

**Effort:** ~1.5 days. **Blocks on PR 1** (PR 1 turns the `/child/[profileId]/*` files into thin wrappers that PR 4 also edits — landing PR 4 first would force PR 1 to re-rebase microcopy and would invalidate PR 1's "snapshot diff = zero" acceptance criterion).

### Pre-flight discovery

- [x] **Source of `linkedChildren` in More.** ~~Grep for `useFamilyLinks` or `useFamily`.~~ **2026-05-02: Resolved.** `more.tsx:402-404` already computes `linkedChildren` from `useProfile()`: `const linkedChildren = activeProfile?.isOwner ? profiles.filter((p) => p.id !== activeProfile.id && !p.isOwner) : []`. No `useFamilyLinks` hook exists or is needed — use this existing pattern for the cross-link section.
- [ ] **Repo-wide `uppercase` audit.** Run `Grep` for `\\buppercase\\b` and `text-transform:\\s*uppercase` across `apps/mobile/src/`. Categorize every hit into: (a) user-facing copy → fix in this PR, (b) brand/logo asset → exempt, (c) third-party component prop → leave alone. Output the categorized list in PR description before code changes.

### Files touched

- `apps/mobile/src/app/(app)/more.tsx` — uppercase headers → sentence case (owner-scope prefix already present on Learning Mode + Accommodation since BUG-909 partial fix); cross-link section; remaining sections need owner prefix
- `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` — owner-scope prefix with child name (post-PR-1 thin wrapper)
- `apps/mobile/src/app/create-profile.tsx` — branch on `?for=child` URL param for pronouns
- `apps/mobile/src/app/(app)/subscription.tsx` — uppercase headers → sentence case
- `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx` — fix monthly empty-state redundant text (closes BUG-904)
- `apps/mobile/src/components/progress/WeeklyReportCard.tsx` — suppress "up from 0 last week" when both values are zero (closes BUG-903) — note: post-PR-1 lift, this fix lands in the lifted component, not the page wrapper
- `apps/mobile/src/lib/navigation.ts` — add `FAMILY_HOME_PATH` constant (set to `/dashboard` in Phase 1; flips to `/family` later if Phase 2 ships)
- All test files for the above

### Microcopy rule sweep

For every `tracking-wider uppercase` or `text-transform: uppercase` style on user-facing content:
1. Replace with sentence case.
2. Remove the `uppercase` className.

(The "diacritic-bearing strings" check from the prior draft is removed — it was unrelated to uppercase/sentence-case and confused the rule.)

For owner-scoped section headers:

> **2026-05-02 reconciliation:** Learning Mode and Learning Accommodation headers already render `{displayName}'s Learning Mode` / `{displayName}'s Learning Accommodation` with contextual subtitles (BUG-909 partial fix). PR 4's remaining work for these two is removing `uppercase tracking-wider` styling only. The other sections still need both the owner-scope prefix AND the case fix.

**Already owner-scoped (remove `uppercase tracking-wider` only):**
- `{displayName}'s Learning Mode` (parent's own More, line 432) → remove uppercase class
- `{displayName}'s Learning Accommodation` (parent's own More, line 456) → remove uppercase class

**Need owner-scope prefix + case fix:**
- `What My Mentor Knows` (parent's own More, line 482) → `What your mentor knows`
- `Celebrations` (parent's own More, line 525) → `Your celebrations`
- `LEARNING ACCOMMODATION` (on `/child/[id]`) → `{Child name}'s learning accommodation`
- `MENTOR MEMORY` (on `/child/[id]`) → `{Child name}'s mentor memory`

**Need case fix only (no owner prefix needed):**
- `Family` (parent's own More, line 493) → `Family` (remove uppercase class)
- `Notifications` (parent's own More, line 578) → `Notifications` (remove uppercase class)
- `Account` (parent's own More, line 595) → `Account` (remove uppercase class)
- `Other` (parent's own More, line 639) → `Other` (remove uppercase class)
- All other ALL-CAPS section headers across the app: replaced with sentence case

### Form context branching

In `apps/mobile/src/app/create-profile.tsx`:

```tsx
const params = useLocalSearchParams<{ for?: 'child' }>();
const isAddingChild = params.for === 'child';

const headerText = isAddingChild ? 'New child profile' : 'Welcome';
const dobHint = isAddingChild
  ? "We use your child's age to personalise how their mentor talks and to comply with privacy laws."
  : 'We use your age to personalise how your mentor talks and to comply with privacy laws.';
const dobPlaceholderHint = isAddingChild
  ? "Enter your child's birth date as YYYY-MM-DD."
  : 'Enter your birth date as YYYY-MM-DD.';
```

Update the call site in `apps/mobile/src/app/(app)/more.tsx`'s `handleAddChild` (line 399, currently `router.push('/create-profile')`) to navigate with `?for=child`:

```tsx
router.push('/create-profile?for=child');
```

### Cross-link rule

Below `Your learning mode` section in More. Uses the existing `linkedChildren` array (already computed at `more.tsx:402-404` from `useProfile()`). No new hook needed.

> **2026-05-02 reconciliation:** The plan originally called for a `useFamilyLinks()` hook. This hook does not exist, and the existing `linkedChildren` pattern from `useProfile()` already provides what's needed. A contextual subtitle already exists at lines 435-437 ("Applies to your own sessions. To change a child's, open their profile from the dashboard.") — the cross-link below extends this with a tappable navigation target.

```tsx
import { FAMILY_HOME_PATH } from '@/lib/navigation';

// linkedChildren already computed above from useProfile()

if (linkedChildren.length === 1) {
  const child = linkedChildren[0];
  return <Link href={`/child/${child.id}`}>To change {child.displayName}'s preferences, open their profile →</Link>;
}
if (linkedChildren.length >= 2) {
  return <Link href={FAMILY_HOME_PATH}>To change a child's preferences, open Family →</Link>;
}
// Zero children: no link
```

`FAMILY_HOME_PATH` is exported from `apps/mobile/src/lib/navigation.ts` and set to `/dashboard` in Phase 1. If Phase 2 ships a `/family` surface, the constant flips and every call site updates atomically. If Phase 2 never ships, the constant remains as-is — no dead code.

### Reports redundant-copy fix (BUG-904)

In `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx` Monthly empty state, collapse the four redundant lines to one:

> Your first monthly report arrives on May 1, 2026.
> [ See {Child}'s progress now ]

Remove: "Your first report is on its way" header (redundant with body), "Reports are generated on the 1st of each month..." (redundant), "Your first report arrives in a few days" (redundant).

### Weekly report zero-vs-zero fix (BUG-903)

In `WeeklyReportCard`, suppress "up from 0 last week" comparison when both this-week and last-week values are zero:

```tsx
const showComparison = thisWeek > 0 || lastWeek > 0;
{showComparison && <Text>{comparisonText}</Text>}
```

### Tests

- Snapshot test: More tab section headers are sentence case.
- Snapshot test: `/child/[id]` section headers include child name in sentence case.
- Snapshot test: `/create-profile` and `/create-profile?for=child` produce different copy.
- Snapshot test: weekly report with zero/zero values doesn't show "up from 0 last week."
- Snapshot test: monthly empty state has only one paragraph + one CTA.
- Snapshot test: cross-link in More with 0/1/2 children renders correct copy.
- **Custom Jest test (chosen over ESLint rule because Tailwind classes are too varied for a clean ESLint AST rule):** `apps/mobile/src/app/uppercase.test.ts` walks `apps/mobile/src/app/**/*.tsx`, parses each file, and asserts that no `Text` JSX element carries the `uppercase` className or a `style={{ textTransform: 'uppercase' }}` prop, *unless* the file has a top-of-file comment `// uppercase-allowed: <reason>`. This avoids the ESLint rule's false-positive problem (third-party brand text, helper utilities) while still failing CI on accidental regressions.

### Repo-wide rule rollout strategy

The custom test fails immediately on every offending file in `apps/mobile/src/app/`. PR 4 must therefore ship sweeps of every offender (not only the files listed above). Pre-flight audit produces the offender list; if the list extends beyond the touched files, PR 4 expands accordingly OR the test scope is limited to the touched directories with a TODO ticket for the rest. Decision recorded in PR description.

### Acceptance for PR 4

| Criterion | Verified by |
|---|---|
| Every owner-scoped section header in More + `/child/[id]` is sentence case with explicit owner. | `test: more.test.tsx + child/[profileId]/index.test.tsx snapshots.` |
| No `text-transform: uppercase` on user-content `Text` components anywhere in `apps/mobile/src/app/` (with explicit `// uppercase-allowed:` exemptions for any non-user-content cases). | `test: uppercase.test.ts.` |
| `/create-profile?for=child` shows child-pronoun copy; `/create-profile` shows first-person. | `test: create-profile.test.tsx parametrized snapshot.` |
| "Add a child profile" button on More navigates with `?for=child`. | `test: more.test.tsx interaction test.` |
| Cross-link below "Your learning mode" scales to 0/1/N children correctly. | `test: more.test.tsx three-cases snapshot.` |
| Weekly report doesn't show "up from 0 last week" when both values are zero. | `test: WeeklyReportCard.test.tsx zero/zero case.` |
| Monthly empty state has one paragraph + one CTA. | `test: reports.test.tsx empty-state snapshot.` |
| `FAMILY_HOME_PATH` constant exists, set to `/dashboard`. | `test: navigation.test.ts asserts constant value.` |
| Telemetry: `child_progress_navigated` fires on cross-link tap. | `test: more.test.tsx mocks track() and asserts call.` |

### Failure Modes table (PR 4)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| `linkedChildren` empty despite children existing | `useProfile()` returns stale profiles cache | Cross-link section is silently hidden (it is decorative) | Pull-to-refresh invalidates profiles query |
| `?for=child` param missing on direct deep-link | User shares Add-a-child URL | Default copy (first-person) renders — copy is wrong but flow works; CTA still creates a profile | None needed; URL pattern internal-only |
| Child has no `displayName` | New child not yet named | Cross-link uses generic "your child" instead of the name | Profile completion flow elsewhere |

### Risks / unknowns

- **CSS uppercase audit.** A grep across `apps/mobile/src/app/` for `uppercase` may turn up many call sites. Time-box the audit to ~30 minutes; anything not user-content (e.g., button hover state on a non-localized brand label) gets exempted with an inline comment.
- **Cross-link routing.** Phase 1's "open Family →" link targets `/dashboard` (today's surface). Phase 2's PR 6 redirects `/dashboard → /family`. Either the link is updated then, or it's already structured to use a single `FAMILY_HOME_PATH` constant — preferred.

## Cross-cutting: Telemetry events for Phase 2 gate

These events feed the Phase 1 → Phase 2 gate (validate P1, P2, P3 from the spec). They presume PR 0 has landed an analytics pipeline and verification dashboard.

### Privacy review of event properties

Per `~/.claude/CLAUDE.md` Doppler/secrets rule and `market_language_pivot.md` GDPR-everywhere stance, every property below is reviewed for re-identification risk before instrumentation.

| Event | Trigger | Properties | Privacy treatment |
|-------|---------|------------|-------------------|
| `progress_report_viewed` | `/progress` rendered with a report card visible for ≥1s (intersection observer required) | `profile_id_hash`, `is_active_profile_owner` (boolean), `report_type` (`weekly`\|`monthly`) | `profile_id` is hashed (HMAC with rotating key) before forwarding to any third-party SDK |
| `subscription_breakdown_viewed` | `/subscription` USAGE section visible (`>=2s` intersection observer) | `is_owner` (boolean), `breakdown_section_visible` (boolean), `child_count_bucket` (`0`\|`1`\|`2-3`\|`4+`) | No `profile_id`; `child_count` bucketed |
| `child_progress_navigated` | User navigates to `/dashboard` or `/child/[id]` | `source` (`home_intent_card`\|`more_section`\|`deep_link`\|`other`) | No identifiers; safe |
| `progress_empty_state_cta_tapped` | User taps "Start your own learning" CTA on `/progress` | `profile_id_hash`, `account_age_bucket` (`0-7`\|`8-30`\|`31-90`\|`91+` days) | `time_since_account_created_days` bucketed (was raw in prior draft); `profile_id` hashed |

**Instrumentation note.** "Section visible for ≥Ns" requires a viewport intersection observer (`IntersectionObserver` on web; `onLayout` + scroll-position math on React Native — likely a small `<TrackedView dwellMs={2000} eventName="..." />` helper component). Add to PR 0's `analytics.ts` module.

**Each PR is responsible for adding the events relevant to its surface:**
- PR 0 ships the `track()` helper, the `<TrackedView>` dwell-tracker, and the verification dashboard.
- PR 2 adds `subscription_breakdown_viewed`.
- PR 3 adds `progress_report_viewed` and `progress_empty_state_cta_tapped`.
- PR 4 adds `child_progress_navigated`.

### Phase 1 → Phase 2 gate (operationally defined)

After ~30–60 days of Phase 1 in production:

- **P1 (parents want their own report):** Of profiles with `family_links.role IN ('owner','guardian')` AND `sessionCount > 0` (i.e., parent-learners) active in the last 30 days, ≥10% fire `progress_report_viewed` at least once in the same window.
  - *Denominator query:* `SELECT count(DISTINCT profile_id) FROM profiles JOIN family_links USING (profile_id) WHERE role IN ('owner','guardian') AND last_session_at > now() - interval '30 days'`.
  - *Numerator query:* hashed `profile_id` set from `progress_report_viewed` events in the same window, joined back via the HMAC mapping.
- **P2 (Family tab improves):** Among parents with ≥1 child, count distinct `child_progress_navigated` events per parent per week. Look for ≥1.5× weekly frequency between week-1 and week-4 cohorts (if it falls, navigation churn → Family-tab thesis weakened). Pair with 3–5 user-research sessions on Family-tab framing.
- **P3 (per-profile breakdown wanted):** Of `subscription_breakdown_viewed` events where `breakdown_section_visible = true`, ≥20% have dwell ≥2 s (per the intersection observer — making this falsifiable, not aspirational).

If any gate fails, Phase 2 design returns to brainstorming for that workstream; the others may proceed independently.

## Order of execution

```
Day 1-2:    PR 0 (analytics groundwork) ──┐
Day 3-7:    PR 1 (component lift) ────────┼─┐
Day 3-5:    PR 2 (quota endpoint) ────────┘ │
Day 8-10:   PR 4 (microcopy, AFTER PR 1) ───┤
Day 8-11:   PR 3 (/progress, AFTER PR 1) ───┘
Day 12:     Verification + Phase 1 sign-off
```

**Why PR 4 ships AFTER PR 1 (revision from prior draft):**
- PR 1 turns `/child/[profileId]/*.tsx` into thin wrappers; PR 4 edits microcopy in those same files. Sequential merge avoids merge conflicts and keeps PR 1's "snapshot diff = zero" acceptance criterion meaningful.
- The BUG-903 weekly-report fix lives in `WeeklyReportCard.tsx` (the lifted component), so it must follow the lift.

**Snapshot churn budget.** PR 4 will invalidate snapshots created by PR 1 because the copy itself changes. Reviewers must accept regenerated snapshots only when the textual delta matches the documented copy changes — anything else is treated as an unintended regression.

Each PR ships independently, behind no feature flag. They're additive; users see Phase 1 changes as each PR merges.

## Sign-off criteria for Phase 1

Phase 1 is complete when:

1. All five PRs (PR 0–PR 4) merged to main.
2. All acceptance criteria across all PRs satisfied with non-empty Verified-by entries.
3. No regression in existing snapshot tests (regenerated snapshots reviewed line-by-line, not auto-accepted).
4. **Telemetry events firing in production** — verified by opening the PR 0 verification dashboard within 24h of each merge and confirming non-zero event counts. Dashboard URL stored in this plan's PR description and Notion entry.
5. `git log --grep="BUG-898\|BUG-900\|BUG-901\|BUG-903\|BUG-904\|BUG-906\|BUG-909"` shows commits for each, every commit message including the relevant `[BUG-XXX]` tag (per `~/.claude/CLAUDE.md` Fix Verification Rules).
6. Bug Tracker entries updated to "Done" with finding-ID-tagged commits referenced.
7. **Phase 2 gate countdown begins:** 30–60 day window for telemetry collection before Phase 2 design starts.

## Open questions (Phase 1 only)

1. **Analytics pipeline (now PR 0).** Resolved by making PR 0 a hard prerequisite. Audit on Day 1; PostHog or events-table decision before any other PR starts.

2. **`useProfileSessionHistory` hook design.** Pre-flight in PR 3 confirms whether existing hooks already supply the data and whether a new endpoint is needed. Resolution path stays in PR 3 pre-flight.

3. **`FAMILY_HOME_PATH` constant.** Resolved: add in PR 4, set to `/dashboard`. If Phase 2 ships, the constant flips atomically; if Phase 2 never ships, no dead code.

## Risks / mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Component lift surfaces hook coupling | Medium | +2–3 days on PR 1 | Day 1 pre-flight catches; defer split-of-concerns refactors out of PR 1 if needed |
| Per-profile usage data not pre-aggregated | Low-Medium | Backend backfill migration needed | Pre-flight in PR 2 catches; backfill migration ships with Rollback section |
| `/progress` becomes too crowded with cards | Medium | TopicsList pushed below fold on small phones | 5.8" emulator review in PR 3 pre-flight; design decision (stack/segment/accordion) made before code |
| Microcopy CSS audit finds many off-brand uses | Medium | PR 4 expands beyond listed files | Pre-flight audit; uppercase test scope limited to touched dirs with TODO ticket if list balloons |
| PR 4 / PR 1 file-overlap merge conflicts | Resolved | Lost work | Strict ordering: PR 4 blocks on PR 1 (encoded in dependency graph above) |
| Analytics infra not in place | Resolved | Blocks Phase 2 gate | PR 0 ships before any other PR |
| Privacy leak via aggregate-by-subtraction | Low | Sibling usage exposed to non-owner | Server suppresses aggregate when ≥2 siblings; break test verifies (PR 2) |
| Snapshot churn between PR 1 and PR 4 | Medium | Reviewer fatigue / silent regression | Reviewers required to compare regenerated snapshots line-by-line against documented copy changes |

## What this plan deliberately does NOT cover

- **Phase 2** (Family tab, multi-lens Home, Privacy & Lenses panel, soft states, per-profile notifications). Spec'd in `docs/specs/2026-04-28-profile-as-lens.md` but no implementation plan written until Phase 1 → Phase 2 gate is met.
- **Phase 3** (Send a Nudge, child user-shape pass, withdrawal consent rev). Same.
- **Bugs not in Phase 1 scope:** BUG-881 (SSE encoding), BUG-902 (active-time vs wall-clock duration), BUG-907 (mentor memory a11y), BUG-908 (mentor memory edit), BUG-910 (delete account confirmation), BUG-911 (Premium Mentor notify wiring). These are separate work tracks.
- **Non-audit bugs.** Anything outside the 16 audit findings stays out of scope for this plan.

## Audit-bug accounting (reconciliation)

The spec catalogues 16 audit findings. This plan's coverage:

- **Closed by Phase 1 (7):** BUG-898, BUG-900, BUG-901, BUG-903, BUG-904, BUG-906, BUG-909.
- **Explicitly deferred — separate work tracks (6):** BUG-881, BUG-902, BUG-907, BUG-908, BUG-910, BUG-911.
- **Deferred to Phase 2/3 (3):** Specific BUG IDs to be confirmed against the spec's audit-findings index. Recorded here as a known gap to close before sign-off; the prior draft had inconsistent arithmetic.

Total: 7 + 6 + 3 = 16. Reconciled.

## Revision history

- **2026-04-29 v1:** Initial draft.
- **2026-04-29 v2:** Adversarial-review revision. Added PR 0 (analytics groundwork). Re-sequenced PR 4 to land after PR 1 (file-overlap fix). Replaced `hasOwnSessions` with stale-profile heuristic. Removed premature `context` prop. Added Failure Modes tables, Verified-by columns, Rollback section for potential PR 2 migration. Hardened privacy guard (aggregate suppression for ≥2 siblings). Specified ISO 8601 + server-formatted labels for `renews_at`/`resets_at`. Replaced "ESLint or grep" with a concrete custom Jest test. Made Phase 2 gate operationally defined. Reconciled audit-bug arithmetic. Estimate revised from 1.5 to ~3 sprints.
- **2026-05-02 v3:** Codebase reconciliation pass. Key corrections: (1) PR 1 target changed from new `components/reporting/` to extending existing `components/progress/` (already exports `GrowthChart`, `SubjectCard`, etc.); `GrowthChart`/`SubjectCard` removed from lift list since already shared. (2) Hook names corrected to actual names: `useChildDetail`, `useChildSessions`, `useChildInventory`, `useChildProgressHistory`, `useChildReports`, `useChildLearnerProfile`. (3) PR 4 BUG-909 scope reduced — Learning Mode and Learning Accommodation headers already owner-prefixed with `{displayName}'s`; remaining work is uppercase removal + other sections. (4) `useFamilyLinks()` hook replaced with existing `linkedChildren` pattern from `useProfile()`. (5) Failure mode for cross-link updated from hook error to stale profiles cache. (6) Contextual subtitle at lines 435-437 already partially covers cross-link intent — noted.
