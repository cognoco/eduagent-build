# Profile-as-Lens — Phase 1 Implementation Plan

**Date:** 2026-04-29
**Status:** Engineering-ready (revised 2026-05-06 v6 after codebase reconciliation pass #4)
**Spec:** [`docs/specs/2026-04-28-profile-as-lens.md`](../specs/2026-04-28-profile-as-lens.md)
**Phase:** 1 of 3 (Foundation — no-regrets refactoring + microcopy + per-profile reporting on `/progress`)

> **2026-05-06 v6 status snapshot.** Codebase reconciliation found PR 1 (component extract) and PR 3 (`/progress` self-reporting) **substantially shipped** in commit `4047629f` ("Profile as lens, memory facts, and onboarding fast path"), beyond what the v5 snapshot recorded. The four extracted components (`WeeklyReportCard`, `MonthlyReportCard`, `RecentSessionsList`, `ReportsListCard`) live under `apps/mobile/src/components/progress/`, are mounted on `apps/mobile/src/app/(app)/progress/index.tsx`, and the page wires `isProfileStale` (`apps/mobile/src/lib/progress.ts`), `hashProfileId` + `bucketAccountAge` (`apps/mobile/src/lib/analytics.ts`), and the `progress_empty_state_cta_tapped` event. The data hook is `useProfileSessions(activeProfile?.id)` (already in `use-progress.ts`) — no separate `useProfileSessionHistory` was added. PR 0 + PR 4 already shipped per v5. **Remaining Phase 1 work:** (1) **PR 2-pre** (`usage_events` table + per-profile attribution through `decrementQuota`); (2) **PR 2** (per-profile quota breakdown endpoint + UI + timezone-safe labels — BUG-898); (3) **`TrackedView` dwell-gating component** + co-located tests for the four shipped progress components — closes the honest-telemetry gap PR 0 / PR 3 left open (no `progress_report_viewed` event fires today because there's nothing to gate on dwell). Remaining audit findings: **BUG-898** only; BUG-901 closed by PR 3's shipped `/progress` self-reporting + `RecentSessionsList`.

## Overview

Phase 1 originally enumerated 5 PRs to close 7 of 16 audit findings. Reconciled state at 2026-05-05:

| PR | Status | Audit findings closed |
|---|---|---|
| PR 0 (analytics) | Partially shipped — `track()`, `hashProfileId()`, `bucketAccountAge()` all present in `apps/mobile/src/lib/analytics.ts`; `<TrackedView>` dwell component still missing | (infra; no findings directly) |
| PR 1 (component **extract**) | **Shipped** (commit `4047629f`) — 4 components extracted to `components/progress/`; mounted on both `/child/[profileId]` and `/progress` | (refactor; no findings directly) |
| PR 2 (per-profile quota) — **blocked on PR 2-pre (per-profile usage event log)** | Not started | BUG-898 |
| PR 3 (`/progress` self-reporting) | **Substantially shipped** (commit `4047629f`) — page mounts the 4 extracted cards, wires `isProfileStale`, fires `progress_empty_state_cta_tapped` with hashed profile_id; `progress_report_viewed` + `<TrackedView>` dwell-gating still missing | BUG-901, BUG-903 (BUG-903 separately closed) |
| PR 4 (microcopy) | Shipped, with documented caveats — see "PR 4 — Reconciliation" | BUG-900, BUG-904, BUG-909 |

**Closed by Phase 1 work or sibling commits (6):** BUG-900, BUG-901, BUG-903, BUG-904, BUG-906, BUG-909.
**Remaining for Phase 1 (1):** BUG-898 (PR 2 + PR 2-pre).
**Explicitly deferred — separate work tracks (6):** BUG-881, BUG-902, BUG-907, BUG-908, BUG-910, BUG-911.
**Deferred to Phase 2/3 (3):** Listed in spec audit-findings index.

7 + 6 + 3 = 16. Reconciled.

```
PR 0  ──[shipped, partial — TrackedView still TODO]──┐
PR 1  ──[shipped]────────────────────────────────────┤
PR 3  ──[substantially shipped — dwell event TODO]───┤
PR 4  ──[shipped, partial]───────────────────────────┤
                                                     ├──→ TrackedView + co-located component tests ──┐
                                                     └──→ PR 2-pre (usage event log) ──→ PR 2 (quota endpoint) ──┴──→ Ship Phase 1
```

**Sequencing rules (revised 2026-05-06 v6):**
- PR 0, PR 1, PR 3, PR 4 are already merged in some form. Treat them as fixed inputs.
- **PR 2-pre + PR 2** is the heaviest remaining track (per-profile attribution, schema migration, breakdown UI, timezone-safe labels — closes BUG-898).
- **`<TrackedView>` + co-located component tests** is a separate small track that can run in parallel with PR 2-pre/PR 2. It closes the "honest telemetry" gap on `/progress` and the test-coverage gap for the four extracted components.
- The original PR 1 → PR 3 dependency is satisfied (both shipped together).

Total estimated duration on the critical path: **~10 working days** — PR 2-pre (~3 days) → PR 2 (~7 days) is now the longest path. `<TrackedView>` + co-located tests run in parallel (~2–3 days) and don't extend the critical path. Add 1–2 days verification + Sentry-aggregation spike (MEDIUM-1).

## PR 0 — Reconciliation

**Status: Partially shipped (2026-05-04, commits `a72ebfac` + `a5834419`) — closure folded into PR 3.**

The two genuinely-shipped deliverables are the `track()` helper and `child_progress_navigated`. Everything else listed under "What did NOT ship" is treated as PR 3 work and inherits PR 3's acceptance.

### What shipped

- `apps/mobile/src/lib/analytics.ts` exports `track(event, properties)` and emits a Sentry `captureMessage` with `event` tag and `analytics` context. Pre-existing homework-OCR helpers retained.
- One event currently fires: `child_progress_navigated` (in `more.tsx:456`, with `source: 'more_section'`).
- Test coverage: `more.test.tsx:249,279` asserts `mockTrack` is called with the right payload.

### What did NOT ship vs. the original PR 0 plan

- **No real product-analytics pipeline.** The original plan called for PostHog (or events table + dashboard). Sentry tags are the de-facto pipeline.
- **No `<TrackedView>` dwell-tracker component.** The "≥Ns visible" instrumentation needed by `subscription_breakdown_viewed` and `progress_report_viewed` is not built.
- **No verification dashboard.** No saved Sentry query / Discover view tied to the four event names.
- **No privacy review document** (HMAC-of-profile_id, bucketed account-age, etc.).
- **`subscription_breakdown_viewed`, `progress_report_viewed`, `progress_empty_state_cta_tapped`** are unfired — those surfaces don't exist yet (they belong to PR 2 + PR 3).

### Decision (2026-05-05, revised 2026-05-06): Sentry-tag analytics for Phase 1, **conditional on a verification spike**

**Why:** event volume is low, Sentry's Discover *should* let us aggregate by `analytics_event` tag and filter on `contexts.analytics.*`, and Phase 2 design is not imminent. The cost of swapping to PostHog now (SDK install, opt-in flow, GDPR review, dashboard build) outweighs the benefit until the Phase 2 gate is being read — **but only if Sentry Discover actually answers the gate questions**.

**Mandatory pre-PR-2/PR-3 spike (MEDIUM-1, ~1 hour, blocks both PRs):**
- From staging, emit 50 fake events of one event name (e.g. `progress_report_viewed`) with varying `profile_id_hash`, `is_active_profile_owner`, `report_type` values via `track()`.
- In Sentry Discover, attempt: (a) count events filtered by `event.tags.analytics_event:progress_report_viewed`; (b) group/aggregate by `contexts.analytics.profile_id_hash`; (c) distinct-count of `contexts.analytics.profile_id_hash`.
- If (b) or (c) is unsupported, has a "data sampled" badge, or returns truncated cardinality — **swap to PostHog before PR 2 / PR 3 fire any of the four events**. Do not defer the swap to gate-read time. Log the spike result in the plan's revision history.
- If the spike passes, proceed; document the saved Discover query URLs in PR 2 and PR 3 descriptions.

**How to apply:**
- PR 2 + PR 3 fire events through the existing `track()` helper.
- The Phase 1 → Phase 2 gate questions (P1, P2, P3 below) are answered via Sentry Discover queries documented in this plan (see "Phase 1 → Phase 2 gate"). The spike above proves they can be answered before any production data is collected against them.
- **Required addition (small, in-scope for PR 3):** build a thin `<TrackedView dwellMs={N} eventName={E} properties={P}>` component in `apps/mobile/src/components/common/TrackedView.tsx`. Without it, PR 2 + PR 3's "section visible for ≥Ns" gating cannot be implemented honestly. Implementation: `useEffect` + `IntersectionObserver` on web, `onLayout` + `react-native-intersection-observer` (already in deps?) on native — confirm during PR 3 pre-flight.

### Privacy treatment for new events (must apply when wiring PR 2 / PR 3)

Per `~/.claude/CLAUDE.md` Doppler/secrets rule and `market_language_pivot.md` GDPR-everywhere stance:

| Property | Treatment |
|---|---|
| `profile_id` | Pass as a stable HMAC (rotating key in Doppler) — **NEVER raw**, since Sentry retains tag values across releases. New helper: `hashProfileId(id: string): string`. |
| `account_age_days` | Bucket as `0-7` / `8-30` / `31-90` / `91+`, never raw. |
| `child_count` | Bucket as `0` / `1` / `2-3` / `4+`. |
| `is_owner`, `report_type`, `source` | Safe to pass raw (no re-identification risk). |

The HMAC helper goes in `apps/mobile/src/lib/analytics.ts` next to `track()`. Doppler key name: `ANALYTICS_HASH_KEY_V1`. Rotation policy: every 12 months or on suspected leak; bump the version suffix.

### Remaining PR 0 work — folded into PR 3 acceptance

The criteria below are no longer tracked under PR 0. They appear verbatim in PR 3's acceptance table (see "Acceptance for PR 3"). PR 0 is closed; PR 3's merge gates these.

| Criterion (now in PR 3) | Verified by |
|---|---|
| `track()` helper exported and used by ≥1 production call site | `test: more.test.tsx:"navigates to child progress with telemetry"` (already passing — pre-PR-3) |
| `hashProfileId()` helper exists and is used everywhere `profile_id` is in event properties | `test: analytics.test.ts:"hashProfileId is deterministic with secret"`, `test: analytics.test.ts:"hashProfileId returns different output across secrets"` (must add — PR 3) |
| `<TrackedView>` component built | `test: TrackedView.test.tsx:"fires once after dwell"`, `"does not fire on unmount before dwell"`, `"unmount during dwell cancels"` (must add — PR 3) |
| Sentry Discover queries verified by spike (MEDIUM-1) and documented for each of the four event names | `manual: PR description includes spike result + query URLs / JSON.` |

---

## PR 4 — Reconciliation

**Status: Shipped (2026-05-04, commit `a72ebfac`). Substantially complete.**

### What shipped

- **`?for=child` branching:** `create-profile.tsx:74,87` reads the param AND defaults to child-mode when an existing owner adds a profile (broader than the original plan — direct deep links to `/create-profile` from a parent's existing session also get child copy automatically). `more.tsx:451` pushes `/create-profile?for=child`.
- **Owner-prefixed section headers in More:**
  - `t('more.learningMode.sectionHeader', { name: displayName })` (line 494)
  - `t('more.accommodation.sectionHeader', { name: displayName })` (line 559)
  - Both with contextual subtitle that branches on whether the parent has linked children.
- **Cross-link section:** `more.tsx:501-541` renders a tappable link beneath Learning Mode that navigates to `/(app)/child/[id]` (1 child) or `FAMILY_HOME_PATH` (≥2 children). Driven by `linkedChildren` (line 462), no `useFamilyLinks()` hook needed.
- **Child-name prefix on `/child/[profileId]`:**
  - `mentorMemoryTitle` (line 698-704)
  - `learningAccommodationTitle` (line 752-755)
  - `accountTitle` (line 891-895)
- **Monthly empty state collapsed (BUG-904):** `reports.tsx:316-360` is now one paragraph + one CTA ("See {child}'s progress now"). The four redundant lines are gone.
- **Weekly report empty handling (BUG-903):** `weekly-report/[weeklyReportId].tsx:64-79` defines `isEmptyWeeklyReport` and the screen short-circuits "up from 0" comparisons for fully-empty reports.
- **`FAMILY_HOME_PATH`:** `apps/mobile/src/lib/navigation.ts:4` set to `/(app)/dashboard`.
- **Uppercase test:** `apps/mobile/src/app/uppercase.test.ts` walks `app/` files and fails on `<Text className="...uppercase...">` or inline `textTransform: 'uppercase'`. Honors `// uppercase-allowed: <reason>`.
- **Telemetry:** `child_progress_navigated` fires in `more.tsx:456` on cross-link tap.

### What did NOT ship vs. the original PR 4 plan

- **`uppercase.test.ts` is scoped to `apps/mobile/src/app/` only.** Components in `apps/mobile/src/components/` are NOT covered. A `<Text className="uppercase ...">` in a shared component would slip through the test today.
- **Owner-prefix not yet applied to "What My Mentor Knows" / "Celebrations" / "Family" / "Notifications" / "Account" / "Other" headers in More.** These render via i18n keys that don't yet take a `name` parameter. Per finding-vs-decoration analysis: "Mentor Memory" and "Celebrations" do behave per-profile, so prefixing is meaningful. "Family", "Notifications", "Account", "Other" are global — they don't need a per-profile prefix.
- **Lines 583, 600, 632 in `more.tsx` retain `tracking-wide` / `opacity-70` styling** but no `uppercase` class — sentence case is achieved, just with the secondary-emphasis treatment intact. Acceptable.

### Remaining PR 4 work (folded into PR 3 cleanup, not a separate PR)

| Task | File | Reason |
|---|---|---|
| Extend uppercase test to `apps/mobile/src/components/` | `apps/mobile/src/components/uppercase.test.ts` (new) — same regex, scoped to `components/` | Closes the test-coverage gap; cheap insurance against drift. |
| Add owner-prefix to Mentor Memory + Celebrations section headers in More | `more.tsx` + i18n keys | Aligns with the "per-profile surface" rule. Pure i18n work. |
| Audit `apps/mobile/src/components/` for `uppercase` once and add `// uppercase-allowed:` exemptions where needed | grep + manual scan | Time-box 30 min; defer if no offenders. |

---

## PR 1 — Component Extract (not "lift")

**Status: Shipped (commit `4047629f`, 2026-05-06).** All four planned components live under `apps/mobile/src/components/progress/`: `WeeklyReportCard.tsx` (57 lines), `MonthlyReportCard.tsx` (55 lines), `RecentSessionsList.tsx` (140 lines), `ReportsListCard.tsx` (169 lines). They're consumed by both `child/[profileId]/index.tsx` (882 lines, down from 1025) and `progress/index.tsx`. Each takes `profileId: string` as the only prop, matching the planned contract — no `context: 'self' | 'child'` was introduced. Hooks were not renamed (`useChildSessions` etc. remain) — instead, a profile-neutral `useProfileSessions(profileId)` was added in `use-progress.ts` and is used by `/progress`. **Outstanding:** co-located unit tests for the four components do not exist yet (only `AccordionTopicList`, `RetentionSignal`, `SubjectCard` have tests under `components/progress/`). Add as part of the TrackedView track below.

> The original goal description and pre-flight discovery checklist below are retained for historical reference / re-planning context, in case any of the four components needs to be refactored in Phase 2.

**Goal (historical):** **Decompose** ~1.7k lines of inline JSX inside `apps/mobile/src/app/(app)/child/[profileId]/` (page files: `index.tsx` 1025 lines, `reports.tsx` 364 lines, `weekly-report/[weeklyReportId].tsx` 319 lines) into a small set of new shared components under `components/progress/` so PR 3 can mount them on `/progress` without duplication.

**Important correction (2026-05-06, HIGH-1):** The 2026-05-05 wording called this a "lift." Codebase grep shows the candidate component names (`WeeklyReportCard`, `MonthlyReportCard`, `ReportsListCard`, `RecentSessionsList`) **do not exist anywhere in the repo today** — they live as inline JSX inside the page files. The only local helper in `child/[profileId]/index.tsx` is `SubjectSkeleton`. PR 1 is therefore a **first-time component extraction** (defining a new prop contract, deciding the data-fetch boundary, writing 4 new test files from scratch), not a refactor of existing components.

**Effort:** ~4–6 days, with explicit risk that 1025-line `index.tsx` may not decompose cleanly into 3–4 cards if cross-card local state is found during pre-flight (see Risks).

**Blocks:** PR 3.

### Scope

The shared `components/progress/` module already contains: `GrowthChart`, `SubjectCard`, `MilestoneCard`, `ProgressBar`, `RemediationCard`, `RetentionSignal`, `AccordionTopicList`. PR 1 adds **at most 4 new components**, scoped to what PR 3 will mount on `/progress`:

1. `WeeklyReportCard` — current weekly snapshot, drives "this week's headline" on `/progress`.
2. `MonthlyReportCard` — current monthly snapshot, same role.
3. `ReportsListCard` — links to historical weekly + monthly reports.
4. `RecentSessionsList` — links to the user's last few sessions (closes BUG-901's session-detail dead-end via `/progress → session detail`).

**Deferred** (revisit only if PR 3 design demands them):
- `MasteredTopicsByLevel`, `VocabularySummary`, `StreakBadge` — PR 3 may inline equivalent UI from the existing TopicsList / hero copy on `/progress`. Wait until PR 3's pre-flight to confirm.

### Pre-flight discovery (Day 1, before any code moves)

This pre-flight is normative. Without it the extract becomes a rewrite under refactor branding.

- [ ] **Read the three source files in full** (`child/[profileId]/index.tsx`, `reports.tsx`, `weekly-report/[weeklyReportId].tsx`). Identify the JSX block that becomes each of the 4 components. Map source line range → proposed component → required props → required hooks. Paste the table in the PR description.
- [ ] **Decompose check.** Verify the JSX blocks are decomposable: no card depends on another card's local `useState` or `useReducer` value, no card requires a side effect that fires when a sibling mounts/unmounts. **If cross-card coupling is found, stop and re-plan — do not force prop-drilling or hoisted state.** Document the finding either way.
- [ ] **Data-fetch boundary decision.** Each new component takes `profileId` and fetches via the existing hooks (preferred), OR is presentational and the page passes pre-fetched data. Decide once for all 4 components, document rationale in PR description. Default to "component-fetches" because PR 3 will mount these on a second surface.
- [ ] **Hook audit.** Existing hooks confirmed: `useChildDetail`, `useChildSessions` (`use-dashboard.ts:90,153`), `useChildInventory`, `useChildProgressHistory`, `useChildReports`, `useChildWeeklyReports`, `useChildWeeklyReportDetail`, `useMarkWeeklyReportViewed` (`use-progress.ts:476,507,544,652,695,735`), `useChildLearnerProfile` (`use-learner-profile.ts:80`). All accept `profileId` already. **These hooks are named `useChild*` but must work for any profile (including the active profile on `/progress`).** If any hook embeds child-only behavior (not just naming), split it before the extract OR alias it with a profile-neutral name (`useProfileSessions`, `useProfileReports`, …) and keep `useChild*` as a re-export to avoid mass renames in `/child/[profileId]/`. Decision recorded in PR description.
- [ ] **State coverage audit.** For each component: loading, error, empty, offline. Anything missing must be added in this PR — components are about to mount on a second surface where dead-ends become visible.

### Files touched

**Extend existing module:** `apps/mobile/src/components/progress/`

Already shared (no extract needed): `GrowthChart`, `SubjectCard`, `MilestoneCard`, `ProgressBar`, `RemediationCard`, `RetentionSignal`, `AccordionTopicList`.

To create under `components/progress/` (these files do not exist today; PR 1 creates them):
- `WeeklyReportCard.tsx` + `WeeklyReportCard.test.tsx`
- `MonthlyReportCard.tsx` + `MonthlyReportCard.test.tsx`
- `ReportsListCard.tsx` + `ReportsListCard.test.tsx`
- `RecentSessionsList.tsx` + `RecentSessionsList.test.tsx`
- Update `index.ts` barrel.

Existing files become thinner (page chrome + pass-through to the new components):
- `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`
- `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx`
- `apps/mobile/src/app/(app)/child/[profileId]/weekly-report/[weeklyReportId].tsx`
- `apps/mobile/src/app/(app)/child/[profileId]/report/[reportId].tsx`

### Component API contract

Each component takes `profileId: string` as a required prop. Components fetch data via the existing `useChild*` (or renamed `useProfile*`) hooks — never derive `profileId` from URL params themselves.

```tsx
type ReportingComponentProps = {
  profileId: string;
};
```

The previously-proposed `context?: 'self' | 'child'` prop is **removed** — premature abstraction with no Phase 1 behavioral effect. If Phase 2 needs branching, add it with the actual divergence in the same PR.

### Data-loading strategy

`/progress` already mounts `GrowthChart`, `MilestoneCard`. PR 3 will add 4 more cards. Without coordination this produces popcorn loading.

- **Single Suspense boundary at the consumer level.** `/progress` and `/child/[id]` each wrap the report stack in a `<Suspense fallback={<ReportStackSkeleton />}>`.
- **Shared `<ReportingErrorBoundary>`** with "Couldn't load reports — Retry / Go home" fallback (UX Resilience standard error pattern).
- **Per-component empty states are explicit.** Each card defines its own empty state with at least one tappable element. No silent renders.
- **Request batching is out of scope** — the extract preserves existing call counts; reduction is a Phase 2 concern.

### Tests

- Per-component: render with valid data, render in loading state, render in empty state, render in error state. Anything below this floor fails acceptance.
- Page-level integration test in `apps/mobile/src/app/(app)/child/[profileId]/index.test.tsx` is **retained** and asserts: (a) cards render in expected order, (b) chrome (back button, header, profile fetch) works, (c) Suspense + error boundary wrap the stack. Coverage delta in PR description must show no net loss of integration assertions.

### Acceptance for PR 1

| Criterion | Verified by |
|---|---|
| All new reporting components live under `apps/mobile/src/components/progress/` with co-located tests; final count (≤4 new) recorded in PR description after pre-flight audit. | `manual: PR description lists each component with source file:line.` |
| Pre-flight decompose check completed and documented; if cross-card coupling found, this PR stops and re-plans. | `manual: PR description includes the decompose-check paragraph.` |
| `/child/[profileId]/index.tsx` and the report sub-screens behaviorally equivalent to pre-PR-1 (existing tests still pass). | `pnpm exec nx run mobile:test --findRelatedTests <changed files>` (replaces the now-impossible "snapshot diff = zero" criterion — PR 4 already moved the baseline). |
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

- **Cross-card coupling in 1025-line `index.tsx`** (HIGH-1 follow-up). The pre-flight decompose check is the gate. If it fails — e.g. the weekly/monthly cards share `useState` for an expanded panel, or one card's mount triggers a fetch a sibling consumes — the extract is paused and replanned, not forced through with prop-drilling. Add ~+1 day to the estimate as a coupling-discovery contingency.
- **Hook coupling.** Pre-flight catches.
- **Persona styling.** `project_persona_removal.md` says personaType is removed; tokens are flat by colorScheme — components should already be persona-unaware. Confirm during extract.
- **Test reorganization is fiddly.** Plan ~30% of time on writing the new component tests from scratch + retained integration coverage on the page files.
- **Fetch fanout** stays as-is; logged as Phase 2 concern.

## PR 2-pre — Per-Profile Usage Event Log (precursor)

**Status: New, added 2026-05-06 after CRITICAL-1.** Originally PR 2 assumed a `usage_events` table with `profile_id`. That table does not exist anywhere in the repo (grep across `apps/`, `packages/`, `tests/` returns only the plan itself). The actual quota model is subscription-level: `quota_pools.usedThisMonth` is a single counter (`packages/database/src/schema/billing.ts:63-91`), and `decrementQuota(db, subscriptionId)` does not take a `profileId` (`apps/api/src/services/billing/metering.ts:46-79`). PR 2 cannot deliver `by_profile` rows from a non-existent data source.

**Goal:** Add per-profile attribution to every metered call so PR 2's aggregate becomes possible.

**Effort:** ~3 days. **Independent** of PR 1 — runs in parallel. Blocks PR 2.

### Files touched

**Schema:**
- `packages/database/src/schema/billing.ts` — add `usageEvents` table:
  ```ts
  usageEvents: pgTable('usage_events', {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    subscriptionId: uuid('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    delta: integer('delta').notNull().default(1), // +1 for decrement, -1 for refund
  })
  ```
  with indexes on `(subscription_id, occurred_at)` and `(profile_id, occurred_at)`.
- New migration SQL under `packages/database/migrations/`.

**Service:**
- `apps/api/src/services/billing/metering.ts` — extend `decrementQuota` and `incrementQuota` (refund) to accept `profileId` and write a `usage_events` row in the **same transaction** as the `quota_pools` update. Use the parent-chain pattern (`docs/architecture.md`) to enforce profile ownership; do not skip ownership verification just because the route already authed the profile.
- All call sites of `decrementQuota` / `safeRefundQuota` updated to pass `profileId` (interview, sessions, dictation, quiz routes — sweep required, finding-ID `BUG-898/PR2-pre`).

**Tests:**
- Integration test in `apps/api/src/services/billing/metering.integration.test.ts`: every decrement writes exactly one event row with the right `profile_id`; refund writes a row with `delta = -1`; both rows have the same `subscription_id`.
- Break test: a decrement with a `profileId` that does NOT belong to the subscription's account is rejected.

### Historical-data acknowledgement

There is **no historical per-profile data to backfill** — the column did not exist, and no logs are kept that would let us reconstruct it. The `by_profile` endpoint in PR 2 must explicitly state "Per-profile data available since {migration_timestamp}." This is permanent; do not pretend otherwise in the UI.

### Acceptance for PR 2-pre

| Criterion | Verified by |
|---|---|
| Schema migration adds `usage_events` with the columns above. | `manual: migration SQL committed; drizzle-kit migrate runs cleanly on staging.` |
| Every `decrementQuota` call site passes `profileId`. | `test: grep audit in CI — no `decrementQuota(` call without `profileId` arg.` |
| Decrement + event-row write are atomic (single transaction). | `test: metering.integration.test.ts:"event row rolled back when quota update fails"` |
| Refund writes a `-1` event row. | `test: metering.integration.test.ts:"refund writes negative delta"` |
| Break test: decrement rejects mismatched `profileId`. | `test: metering.integration.test.ts:"profileId not in account is rejected"` |

### Rollback

Reversible: drop `usage_events` table. No data loss in `quota_pools` — the new table is additive. Worker deploy revert + `DROP TABLE usage_events` is the procedure. The PR 2 UI must gracefully handle "table doesn't exist yet" by falling back to subscription-level only (the `.passthrough()` schema decision in PR 2 covers this).

### Risks / unknowns

- **Sweep completeness.** Missing a single `decrementQuota` call site = silent under-attribution (PR 2's aggregate doesn't match `quota_pools.usedThisMonth`). Lint guard required.
- **Transaction boundary.** Per `project_neon_transaction_facts.md`, neon-http does not support interactive transactions; use `db.batch()` for the atomic write. Confirm during pre-flight.
- **Migration timing.** Per CLAUDE.md "Schema and Deploy Safety," migration ships before any worker deploy that reads the new column.

---

## PR 2 — Per-Profile Quota Endpoint + Owner Breakdown

**Goal:** Show owner the per-profile quota usage breakdown on `/subscription`. Closes BUG-898 (timezone-safe quota labels) and clarifies the quota-vs-renewal distinction. BUG-906 already closed by sibling commits (`8fe03dd1` + `01162206`).

**Effort:** ~7 days (revised 2026-05-06 from 3). **Blocks on PR 2-pre.** Independent of PR 1 / PR 3.

**Schema reality check (CRITICAL-2, 2026-05-06):** The `family_links` table (`packages/database/src/schema/profiles.ts:99-126`) has columns `id, parentProfileId, childProfileId, createdAt` and **no `role` column**. The 2026-05-05 wording branched backend logic and the P1 gate on `family_links.role IN ('owner','guardian','learner')`. That column does not exist. The actual signals available are:
- **Owner** = `profiles.isOwner = true` AND profile appears as `parent_profile_id` in ≥1 `family_links` row.
- **Child / learner** = profile appears as `child_profile_id` in ≥1 `family_links` row.
- **"Non-owner adult"** = does not exist in the current schema as a distinguishable role. The plan must either drop the three-way split (collapse to owner vs. non-owner) or specify the column to add. **Decision (2026-05-06):** collapse to two roles — `owner` and `non-owner`. A "non-owner adult" looks identical to a child for the purposes of the privacy guard and the breakdown view, because both can derive a sibling's usage by subtraction the same way. Phase 2 may revisit if the spec requires guardian-as-third-class.

### Files touched

**API:**
- `apps/api/src/routes/subscription.ts` — extend `GET /v1/subscription/usage` response shape.
- `apps/api/src/services/subscription.ts` — aggregate `usage_events` per `profile_id` (table created in PR 2-pre).
- `apps/api/src/services/subscription.test.ts` — integration test for breakdown.
- `packages/schemas/src/subscription.ts` — extend response schema.

**Mobile:**
- `apps/mobile/src/app/(app)/subscription.tsx` — render `by_profile` rows under "Usage this month" (line 1308–1360 today). Add `<TrackedView eventName="subscription_breakdown_viewed">` (component built as part of PR 0 closure).
- `apps/mobile/src/app/(app)/subscription.test.tsx` — owner vs non-owner snapshot tests.
- `apps/mobile/src/hooks/use-subscription.ts` — type extension for `by_profile`.

### Pre-flight discovery (before code)

- [ ] **Document the current `GET /v1/subscription/usage` response shape** by reading `packages/schemas/src/subscription.ts` and `apps/api/src/routes/subscription.ts`. Paste verbatim into the PR description. Without this baseline, "existing fields preserved" is unverifiable.
- [ ] **Confirm `usage_events` populated by PR 2-pre.** Query staging: `SELECT count(*) FROM usage_events WHERE occurred_at > now() - interval '24 hours';` should be > 0 after PR 2-pre ships. If zero, the PR 2-pre call-site sweep missed something — block PR 2 until resolved.
- [ ] **Owner derivation.** The "owner" branch uses `profiles.isOwner = true` AND ≥1 outgoing `family_links.parent_profile_id` row. Document this exact predicate in the PR description; do not invent alternatives. The `feedback_persona_vs_role.md` memory remains the authoritative reference.

### API contract change

**New shape** (additive):

```typescript
{
  // ...current shape preserved verbatim...
  by_profile: Array<{
    profile_id: string;
    name: string;
    used: number;
  }>;
  renews_at: string;        // ISO 8601 with timezone offset, server time
  resets_at: string;        // ISO 8601 with timezone offset, server time
  resets_at_label: string;  // pre-formatted in owner's locale/tz (e.g. "May 15, 2026")
  renews_at_label: string;  // same
}
```

**Timezone rule (BUG-898).** `renews_at` and `resets_at` are full ISO 8601 timestamps with offset, NOT date-only. The server additionally returns `*_label` fields pre-formatted in the owner's stored timezone. The client renders the label, never reformats from the timestamp. This eliminates the "BUG-898 reborn-by-timezone" trap and replaces the current `subscription.tsx:1334` and `1248` `toLocaleDateString` calls (which currently format in the device tz, not the owner's).

**Schema compatibility:**
- Zod schema in `packages/schemas/src/subscription.ts` MUST use `.passthrough()` (or treat `by_profile` as `.optional()`) so older mobile clients receiving the new field don't crash. Add a regression test asserting an unknown extra field passes through.

**Backend logic (revised 2026-05-06 — schema-grounded, two roles):**
- **Owner** (`profiles.isOwner = true` AND parent in ≥1 `family_links` row): full `by_profile` and aggregate.
- **Non-owner** (everyone else, including children and any adult who is not the account owner): `by_profile` containing only their own slice. Aggregate suppressed unless they are the only profile besides the owner (i.e. family has 0 other non-owners besides the requester) — see "Privacy guard" below.

### Privacy guard (revised 2026-05-06, HIGH-2)

Showing both `your_used` and `family_aggregate` to a non-owner with **one** other non-owner learner lets them compute that sibling's exact usage by subtraction (`aggregate − you`). The 2026-05-05 wording said "0–1 other learners → aggregate may be shown (no leak)" — that is wrong at exactly 1. Corrected rule:

- Non-owner, **0** other non-owners in family (i.e. the requester is the only non-owner besides the owner) → `family_aggregate = your_used + owner_used`. Showing the aggregate exposes the owner's usage by subtraction. Also suppress in this case unless owner ≡ requester. Net rule: **non-owners never see `family_aggregate`**, full stop.
- Owner always sees `family_aggregate` and full `by_profile`.

This collapses the rendered examples below to two cases (owner / non-owner) instead of three. Updated examples in the next subsection.

### Mobile rendering (revised 2026-05-06)

Owner view (≥1 child):

```
Usage this month        90 / 1500 questions used
  Your share              30
  TestKid                 60
  Family aggregate        90 / 1500
Quota resets on {resets_at_label}
Subscription renews on {renews_at_label}
```

Non-owner view (any family size — aggregate always suppressed):

```
Usage this month
  Your usage              30 questions out of 1500 family quota
Quota resets on {resets_at_label}
Subscription renews on {renews_at_label}
```

### Tests (revised 2026-05-06)

- API integration: owner gets full breakdown.
- API integration: non-owner with 0 other non-owners does NOT see aggregate (break test for the privacy guard, HIGH-2).
- API integration: non-owner with 1 other non-owner does NOT see aggregate (break test, HIGH-2).
- API integration: non-owner with ≥2 other non-owners does NOT see aggregate (break test).
- API integration: a child can NEVER derive a sibling's usage by any combination of fields in the response.
- API integration: `*_label` formatted in owner's `profiles.timezone`; falls back to UTC when the column is null.
- API regression: response schema accepts unknown extra fields (`.passthrough()`).
- API regression: pinned older-client schema snapshot parses the new response without error.
- Mobile snapshot tests for owner / non-owner views.
- Mobile graceful-degrade test: when `by_profile` is undefined (older API), aggregate-only render works.
- Mobile interaction: `subscription_breakdown_viewed` fires after 2s dwell on the breakdown section.

### Acceptance for PR 2

| Criterion | Verified by |
|---|---|
| Current response shape pasted into PR description before any code changes. | `manual: PR description has the pre-flight shape paragraph.` |
| Owner sees per-profile rows with names + used counts. | `test: subscription.test.ts:"owner sees breakdown"` |
| Non-owners NEVER see family aggregate, regardless of family size. | `test: subscription.test.ts:"aggregate suppressed for non-owners (0/1/2+ siblings)"` |
| Children never see siblings' usage including by aggregate-subtraction. | `test: subscription.test.ts:"child cannot derive sibling totals"` |
| `resets_at_label` and `renews_at_label` formatted in owner's `profiles.timezone`; UTC fallback when null. | `test: subscription.test.ts:"label uses stored owner tz"`, `"label uses UTC fallback when owner timezone is null"` |
| Older mobile binary parses new response without error. | `test: schema regression test using pinned schema snapshot` |
| Newer mobile / older API: aggregate-only render works. | `test: mobile graceful-degrade snapshot` |
| Migration in PR 2-pre ships with rollback section (this PR depends on it). | `manual: PR 2-pre rollback paragraph linked in PR 2 description.` |
| `subscription_breakdown_viewed` fires with 2s dwell threshold. | `test: subscription.test.tsx mocks track() and asserts call after dwell` |

### Failure Modes table (PR 2)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Endpoint 5xx | Server error during aggregation | "Can't load usage right now" + Retry / Go back | Retry; fallback to last cached usage if available |
| `by_profile` empty for owner | Family has only owner profile | "You're the only profile using your subscription" | Tap to invite a child / continue |
| Per-profile data not yet available | Subscription pre-dates PR 2-pre migration | UI shows "Per-profile breakdown available since {migration_date}" + aggregate-only view | Wait for the next billing cycle; no historical reconstruction possible |
| Non-owner views own slice while quota exhausted | User exhausted family quota | "Family quota reached — owner can review on their device" | Link to a "Notify owner" action (Phase 1: mailto/share; Phase 2: push) |

### Rollback

PR 2 itself ships no schema change (the schema change is in PR 2-pre). PR 2 rollback = revert the worker deploy that exposes `by_profile` in the response. The endpoint reverts to its pre-PR-2 shape; the `usage_events` table created in PR 2-pre stays in place (PR 2-pre has its own rollback if needed).

- **Reversible?** Yes for the endpoint shape — the `.passthrough()` schema decision means older clients tolerate either shape.
- **Data loss on rollback?** None.
- **Procedure:** revert worker deploy. If `usage_events` itself needs to be rolled back, see PR 2-pre's rollback section.

### Risks / unknowns

- **Schema readiness.** Pre-flight catches.
- **Performance.** Per-profile aggregation MUST be a single grouped query; reviewer rejects N+1.
- **Privacy enforcement is server-side only** — never rely on client filtering for `by_profile`. Verified by API integration tests above.

## PR 3 — Self-Reporting on `/progress`

**Status: Substantially shipped (commit `4047629f`, 2026-05-06). Closes BUG-901.** `apps/mobile/src/app/(app)/progress/index.tsx` (559 lines) imports the four extracted components, wires `isProfileStale({ sessionCount, lastSessionAt })` from `apps/mobile/src/lib/progress.ts`, and fires `progress_empty_state_cta_tapped` on the stale-state CTA tap with `profile_id_hash` (HMAC) + `account_age_bucket` properties. Data is sourced via `useProfileSessions(activeProfile.id)` from `use-progress.ts` (no separate `useProfileSessionHistory` hook was added — the inline `sessionCount` / `lastSessionAt` derivation in `progress/index.tsx:236-244` is sufficient). `apps/mobile/src/lib/progress.test.ts` covers the `isProfileStale` truth table; `progress.test.tsx` (362 lines) mocks `hashProfileId` and exercises the screen.

**Outstanding (small track, runs in parallel with PR 2-pre / PR 2):**
- `<TrackedView dwellMs eventName properties>` component at `apps/mobile/src/components/common/TrackedView.tsx` — does not exist today. Without it, `progress_report_viewed` cannot be fired honestly (a `useEffect` on mount is not equivalent to "section visible for ≥1s").
- Once `<TrackedView>` is built, wrap `WeeklyReportCard` (and equivalents on `/subscription` for PR 2's `subscription_breakdown_viewed`) and emit `progress_report_viewed` with the `profile_id_hash` / `is_active_profile_owner` / `report_type` payload.
- Add co-located tests for the four PR 1 components: `WeeklyReportCard.test.tsx`, `MonthlyReportCard.test.tsx`, `RecentSessionsList.test.tsx`, `ReportsListCard.test.tsx`. Each must cover render-with-data, loading, error, and empty states.
- The `profile_id_hash_log(profile_id, hash, key_version, first_seen_at)` mapping store needed for the P1 gate (HIGH-3) was deferred — wire it when the gate is read, not before. The hash function is already deterministic per `key_version` so backfill is possible.

> The pre-flight discovery checklist and render-rule snippet below are retained for re-planning context if `/progress` needs revisits in Phase 2.

**Goal (historical):** Mount the extracted reporting components on the active profile's `/progress` tab. Closes BUG-901 (session detail dead-end). Also owns the `<TrackedView>` build, the `hashProfileId` helper, and the `profile_id_hash_log` mapping store that close PR 0.

**Effort:** ~3–4 days frontend + 0–1 day API if a new endpoint is required. **Blocks on PR 1.**

### Pre-flight discovery

- [ ] **`useProfileSessionHistory` data source.** Grep `apps/mobile/src/hooks/` for an existing hook that returns `sessionCount` and `lastSessionAt` for a profile. Likely candidates: `useChildSessions(profileId)` could be aliased / reused. If none returns the right shape, extend `GET /v1/profiles/:id/summary` or add `GET /v1/profiles/:id/session-history`. Decision and signature recorded in PR description.
- [ ] **`<TrackedView>` implementation choice (MEDIUM-3).** Run `grep "intersection-observer\|react-native-intersection" apps/mobile/package.json` first. If a usable lib is **not** in deps, allocate **+1 day** to add and verify the dep, OR **+2 days** for a hand-rolled `onLayout` + scroll-position implementation. React Native does not ship IntersectionObserver, and `/progress` and `/subscription` both use `ScrollView` — a reliable dwell tracker requires scroll-event sampling, on-screen visibility math, unmount cleanup, and re-entry handling. Document the choice + estimate adjustment in the PR description. Do not proceed without this decision.
- [ ] **iOS verification path.** `user_device_small_phone.md` lists only an Android Galaxy S10e. PR 3 must specify how iOS dwell behavior is verified — either iOS sim time is allocated, or the plan explicitly accepts an iOS verification gap (in which case the Phase 2 gate is read against Android data only, and PR 3's PR description must call this out).
- [ ] **Visual hierarchy on a 5.8" emulator** (per `user_device_small_phone.md`). Pull current `/progress` screenshot. Confirm whether report cards above existing TopicsList push fold content out of view. Design decision (vertical stack, segmented control, or accordion) made before code.
- [ ] **MEDIUM-1 spike done.** Confirm the Sentry-aggregation spike from "PR 0 — Reconciliation" passed; otherwise PR 3 fires events into a pipeline that cannot answer the gate.

### Files touched

- `apps/mobile/src/app/(app)/progress/index.tsx` — add report cards, link to full reports.
- `apps/mobile/src/app/(app)/progress/index.test.tsx` — tests for each render state.
- `apps/mobile/src/hooks/use-profile-session-history.ts` (+ test) — new hook (or alias of existing), signature decided in pre-flight.
- `apps/mobile/src/components/common/TrackedView.tsx` (+ test) — closes PR 0.
- `apps/mobile/src/lib/progress.ts` — add `isProfileStale({ sessionCount, lastSessionAt })` and `STALE_PROFILE_HEURISTIC` constant.
- (If needed) `apps/api/src/routes/profiles.ts` and matching test — new or extended endpoint.
- (Optional) `apps/mobile/src/app/(app)/progress/reports.tsx` — full reports list for active profile.

### "Has own activity" rule

Keying empty-state on `hasOwnSessions` (boolean) misclassifies a parent who completed one throwaway session — the most-important Phase 1 CTA disappears for them. Replacement:

- Hook returns `{ sessionCount: number, lastSessionAt: ISO8601 | null }`.
- Empty state renders when `sessionCount === 0` **OR** (`lastSessionAt` is more than 14 days ago AND `sessionCount < 3`).
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
          <TrackedView
            dwellMs={1000}
            eventName="progress_report_viewed"
            properties={{
              profile_id_hash: hashProfileId(activeProfile.id),
              is_active_profile_owner: activeProfile.isOwner,
              report_type: 'weekly',
            }}
          >
            <WeeklyReportCard profileId={activeProfile.id} />
          </TrackedView>
          <MonthlyReportCard profileId={activeProfile.id} />
          <RecentSessionsList profileId={activeProfile.id} />
          {/* existing TopicsList, VocabularyList, etc. */}
          <ReportsListCard profileId={activeProfile.id} />
        </Suspense>
      </ReportingErrorBoundary>
    );
  }

  return (
    <EmptyProgressState
      cta="Start your own learning"
      onCTA={() => {
        track('progress_empty_state_cta_tapped', {
          profile_id_hash: hashProfileId(activeProfile.id),
          account_age_bucket: bucketAccountAge(activeProfile.createdAt),
        });
        router.push('/library');
      }}
    />
  );
}
```

### Tests

- Snapshot: solo learner with sessions sees full report stack.
- Snapshot: parent + learner with own sessions sees full report stack.
- Snapshot: profile with `sessionCount === 0` sees empty state with CTA.
- Snapshot: profile with `sessionCount === 1` and `lastSessionAt` 30 days ago — sees empty state with CTA. (Regression test for the `hasOwnSessions` misclassification.)
- Snapshot: child profile sees full report stack.
- Interaction: tapping "Start your own learning" navigates to `/library` and fires `progress_empty_state_cta_tapped` with bucketed account-age.
- Interaction: dwelling on `WeeklyReportCard` for ≥1s fires `progress_report_viewed` with hashed profile_id.
- Unit: `isProfileStale()` truth table covers boundaries.
- Unit: `<TrackedView>` fires once after dwell; cancels on unmount; does not fire if dwell is interrupted.

### Acceptance for PR 3

| Criterion | Verified by |
|---|---|
| Active profile's reports appear on `/progress` when not stale. | `test: progress/index.test.tsx:"non-stale shows reports"` |
| Empty state with CTA appears when stale (zero or low+old). | `test: progress/index.test.tsx:"stale shows empty CTA"` |
| Hook backed by existing endpoint (cited) or new one (signature in PR description). | `manual: PR description shows endpoint reference.` |
| No automatic Home card or modal appears as a result of this PR. | `manual: app/(app)/(tabs)/index.tsx diff = 0` |
| No bottom-nav changes. | `manual: app/(app)/_layout.tsx diff = 0` |
| `progress_report_viewed` fires after dwell with hashed `profile_id`. | `test: progress/index.test.tsx asserts mockTrack call shape` |
| `progress_empty_state_cta_tapped` fires on CTA tap. | `test: progress/index.test.tsx asserts mockTrack call shape` |
| `<TrackedView>` ships with 3-case unit test (fires once / cancels / does not fire on quick unmount). | `test: TrackedView.test.tsx` |
| Real-device dwell sanity: scroll-past-without-dwelling fires nothing; 2s dwell fires exactly one event; scroll-back-and-redwell fires exactly one more event. | `manual: PR description includes Android Galaxy S10e screencast clip + frame timestamps.` |
| iOS verification status documented (sim run OR explicit gap acknowledgement). | `manual: PR description includes iOS verification paragraph.` |
| MEDIUM-1 Sentry-aggregation spike passed; saved Discover query URLs included. | `manual: PR description includes spike result + saved query URLs.` |
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
- **`<TrackedView>` cross-platform reliability (MEDIUM-3).** React Native doesn't have a built-in IntersectionObserver; the implementation uses `onLayout` + scroll-position math (or a tested community lib if one is already in deps). Honest unit tests required — anything that "fires unconditionally" or "never fires due to ScrollView quirks" silently invalidates the Phase 2 gate. Pre-flight allocates +1 to +2 days based on the dep-availability check; iOS verification path is decided before code, not after.
- **Cross-cutting if endpoint needed.** Estimate may rise to 4–5 days frontend + 0–2 days API.

## Cross-cutting: Telemetry events for Phase 2 gate

These events feed the Phase 1 → Phase 2 gate (validate P1, P2, P3 from the spec). Pipeline: Sentry tags via `track()` (decided 2026-05-05 — see "PR 0 — Reconciliation").

### Event reference

| Event | Trigger | Properties (with privacy treatment) | Fires from |
|-------|---------|-------------------------------------|------------|
| `progress_report_viewed` | `<TrackedView>` dwell ≥1s on a report card | `profile_id_hash` (HMAC), `is_active_profile_owner` (bool), `report_type` (`weekly` \| `monthly`) | PR 3 |
| `subscription_breakdown_mounted` | USAGE section mounted on `/subscription` (no dwell — fires once per mount) | `is_owner` (bool), `child_count_bucket` (`0` \| `1` \| `2-3` \| `4+`) | PR 2 |
| `subscription_breakdown_viewed` | `<TrackedView>` dwell ≥2s on `/subscription` USAGE section | `is_owner` (bool), `breakdown_section_visible` (bool), `child_count_bucket` (`0` \| `1` \| `2-3` \| `4+`) | PR 2 |
| `child_progress_navigated` | User navigates to `/dashboard` or `/child/[id]` | `source` (`home_intent_card` \| `more_section` \| `deep_link` \| `other`) | **Already firing** from `more.tsx:456` (PR 4) |
| `progress_empty_state_cta_tapped` | User taps "Start your own learning" CTA on `/progress` | `profile_id_hash` (HMAC), `account_age_bucket` (`0-7` \| `8-30` \| `31-90` \| `91+`) | PR 3 |

**Each PR is responsible for adding the events relevant to its surface:**
- PR 0 already provided `track()` (closed at the end of PR 3 with `<TrackedView>` + `hashProfileId` additions).
- PR 2 adds `subscription_breakdown_viewed`.
- PR 3 adds `progress_report_viewed`, `progress_empty_state_cta_tapped`, and `<TrackedView>`/`hashProfileId`.
- PR 4 already added `child_progress_navigated`.

### Phase 1 → Phase 2 gate (operationally defined, revised 2026-05-06)

After ~30–60 days of Phase 1 in production, query Sentry Discover with `event.tags.analytics_event:<name>` filtered to the relevant time window and aggregated by `contexts.analytics.<property>`. Specific gates:

- **P1 (parents want their own report):** Of owner profiles (`profiles.isOwner = true` AND parent in ≥1 `family_links` row) AND ≥1 session in the last 30 days, ≥10% fire `progress_report_viewed` at least once in the same window.
  - Numerator: distinct `profile_id_hash` values seen in `progress_report_viewed` events with `is_active_profile_owner = true`.
  - Denominator: count of owner profiles meeting the active-session criterion. Hashed via the same HMAC key version active when the events were emitted, so numerator and denominator use the same identity space without needing to "join back."
  - **HMAC mapping store (HIGH-3).** Because HMAC is one-way, a `profile_id_hash_log(profile_id, hash, key_version, first_seen_at)` table is added in PR 3 — a row is written the first time `hashProfileId(profile_id)` is computed for each (profile_id, key_version) pair. The gate query computes the denominator by hashing the active-owner set with the same `key_version` and comparing distinct hashes. Key rotation (every 12 months per PR 0 privacy treatment) bumps `key_version` and starts a fresh log; gate windows must not span rotations.
- **P2 (Family tab improves):** Distinct `child_progress_navigated` events per parent per week. Look for ≥1.5× weekly frequency between week-1 and week-4 cohorts (if it falls, navigation churn → Family-tab thesis weakened). Pair with 3–5 user-research sessions on Family-tab framing.
- **P3 (per-profile breakdown wanted):** Of `subscription_breakdown_viewed` events where `breakdown_section_visible = true`, ≥20% have dwell ≥2s. The dwell threshold is enforced by `<TrackedView>`, so any event firing implies dwell happened. **For ratio computation, the `/subscription` screen also fires a `subscription_breakdown_mounted` event on mount (no dwell)** so the "events vs. mounts" ratio is computable directly from event counts; do not rely on Sentry's transaction count.

If any gate fails, Phase 2 design returns to brainstorming for that workstream; the others may proceed independently.

**Sentry-pipeline limit acknowledgment.** Sentry's `tracesSampleRate` and tag-cardinality limits may undersample events at scale. The MEDIUM-1 spike (see "PR 0 — Reconciliation") proves before any production data is collected that Discover can answer P1/P3 with the chosen schema. If the spike fails or `<TrackedView>` is shown to be unreliable, swap to PostHog **before** PR 2/PR 3 ship — not after the gate is read. Cost of swap: ~3 days.

## Order of execution (revised 2026-05-06 v6)

```
Day 0:     MEDIUM-1 Sentry-aggregation spike (~1h, blocks PR 2)
Day 1-3:   PR 2-pre (per-profile usage event log) ───┐
Day 1-3:   TrackedView + 4 co-located component tests (parallel) ─┐
Day 4-10:  PR 2 (quota endpoint, blocks on PR 2-pre) ┤
Day 4-5:   Wire progress_report_viewed via TrackedView (blocks on TrackedView) ┘
Day 10-11: Verification + Phase 1 sign-off
```

PR 0, PR 1, PR 3, PR 4 are already merged in some form; their reconciliation tasks (PR 0: `<TrackedView>` + `profile_id_hash_log`, PR 1: co-located component tests, PR 3: `progress_report_viewed` event + dwell gating, PR 4: `components/` uppercase test + remaining owner-prefixes) are folded into the TrackedView track or deferred to gate-read time.

## Sign-off criteria for Phase 1

Phase 1 is complete when:

1. PR 2-pre, PR 1, PR 2, PR 3 merged to main. (PR 0, PR 4 already merged.)
2. All acceptance criteria across all PRs satisfied with non-empty Verified-by entries.
3. No regression in existing snapshot tests (regenerated snapshots reviewed line-by-line).
4. **Telemetry events firing in production** — verified by querying Sentry Discover for each event name within 24h of each merge and confirming non-zero counts. Query URLs stored in this plan's PR descriptions.
5. **PR descriptions** for the two remaining audit findings (BUG-898 in PR 2; BUG-901 in PR 3) reference the finding ID. The "every commit message includes `[BUG-XXX]`" rule from the 2026-05-05 wording is dropped — PR 4's already-merged closing commits (`a72ebfac`, `a5834419`) did not consistently carry tags, and retroactive enforcement is not productive. PR descriptions are the durable record going forward.
6. Bug Tracker entries updated to "Done" with finding-ID-tagged PR descriptions referenced.
7. **Phase 2 gate countdown begins:** 30–60 day window for telemetry collection before Phase 2 design starts. Window must not span an HMAC key rotation (see Cross-cutting "HMAC mapping store").

## Open questions (Phase 1 only)

1. **Analytics pipeline.** Resolved 2026-05-05 (revised 2026-05-06): stay on Sentry-tag `track()` for Phase 1, **conditional on the MEDIUM-1 spike passing**. If the spike fails (Discover cannot answer P1/P3 with the chosen schema), swap to PostHog before PR 2/PR 3 ship.
2. **`useProfileSessionHistory` hook design.** Deferred to PR 3 pre-flight.
3. **`FAMILY_HOME_PATH` constant.** Resolved: shipped in PR 4 at `/(app)/dashboard`. Atomic flip if Phase 2 ships `/family`.
4. **PR 0 `<TrackedView>` build owner.** Resolved 2026-05-05: PR 3 builds it. PR 0 is now "Partially shipped — closure folded into PR 3."
5. **`<TrackedView>` implementation choice (dep vs. hand-rolled).** Deferred to PR 3 pre-flight; estimate adjusted there.
6. **iOS verification path for `<TrackedView>`.** Deferred to PR 3 pre-flight; document either an iOS-sim plan or an explicit gap.

## Risks / mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| PR 1 cross-card coupling in 1025-line `index.tsx` | Medium | +1–2 days on PR 1 OR re-plan | Day 1 decompose check catches; stop and re-plan, do not force prop-drilling |
| PR 2-pre call-site sweep misses a `decrementQuota` path | Medium | Aggregate diverges from `quota_pools.usedThisMonth` | Lint guard / grep audit in CI; integration test asserts atomicity |
| `/progress` becomes too crowded with cards | Medium | TopicsList pushed below fold on small phones | 5.8" emulator review in PR 3 pre-flight; design decision (stack/segment/accordion) made before code |
| Privacy leak via aggregate-by-subtraction | Low | Sibling usage exposed to non-owner | Non-owners NEVER see aggregate (revised 2026-05-06); three break tests cover 0/1/2+ siblings (PR 2) |
| `<TrackedView>` fires unreliably on RN ScrollView | Medium | Phase 2 gate undersampled / oversampled | Pre-flight dep-availability check + estimate adjustment; 3-case unit test; Android device clip + iOS path documented |
| Sentry Discover cannot aggregate `contexts.analytics.*` | Medium | Gate unanswerable | MEDIUM-1 spike runs before PR 2/PR 3; swap to PostHog if spike fails (3-day budget) |
| HMAC key rotation invalidates active gate window | Low | Gate window resets | "Window must not span rotation" enforced in sign-off criterion #7 |

## What this plan deliberately does NOT cover

- **Phase 2** (Family tab, multi-lens Home, Privacy & Lenses panel, soft states, per-profile notifications). Spec'd in `docs/specs/2026-04-28-profile-as-lens.md`; no implementation plan written until Phase 1 → Phase 2 gate is met.
- **Phase 3** (Send a Nudge, child user-shape pass, withdrawal consent rev). Same.
- **Bugs not in Phase 1 scope:** BUG-881 (SSE encoding), BUG-902 (active-time vs wall-clock duration), BUG-907 (mentor memory a11y), BUG-908 (mentor memory edit), BUG-910 (delete account confirmation), BUG-911 (Premium Mentor notify wiring). Separate work tracks.
- **Non-audit bugs.** Anything outside the 16 audit findings stays out of scope for this plan.

## Audit-bug accounting (reconciliation)

| BUG | Status | Closed by |
|---|---|---|
| BUG-898 | Open | PR 2 (timezone-safe quota labels) |
| BUG-900 | Closed | PR 4 (`?for=child` branching) |
| BUG-901 | **Closed** | PR 3 shipped commit `4047629f` (`/progress` self-reporting + `RecentSessionsList`) |
| BUG-903 | Closed | PR 4 (weekly-report `isEmptyWeeklyReport` + range formatter) |
| BUG-904 | Closed | PR 4 (monthly empty state collapsed) |
| BUG-906 | Closed | Sibling commits `8fe03dd1` + `01162206` (NEW_LEARNER_SESSION_THRESHOLD canonicalization) |
| BUG-909 | Closed | PR 4 (owner-prefix on Learning Mode + Accommodation) |

6 closed, 1 open, 9 deferred = 16. Reconciled.

## Revision history

- **2026-04-29 v1:** Initial draft.
- **2026-04-29 v2:** Adversarial-review revision. Added PR 0 (analytics groundwork). Re-sequenced PR 4 to land after PR 1 (file-overlap fix). Replaced `hasOwnSessions` with stale-profile heuristic. Removed premature `context` prop. Added Failure Modes tables, Verified-by columns, Rollback section for potential PR 2 migration. Hardened privacy guard (aggregate suppression for ≥2 siblings). Specified ISO 8601 + server-formatted labels for `renews_at`/`resets_at`. Replaced "ESLint or grep" with a concrete custom Jest test. Made Phase 2 gate operationally defined. Reconciled audit-bug arithmetic. Estimate revised from 1.5 to ~3 sprints.
- **2026-05-02 v3:** Codebase reconciliation pass #1. Corrected lift target (`components/progress/`, not new `components/reporting/`); hook names (`useChild*`); `linkedChildren` from `useProfile()` (no `useFamilyLinks` hook); existing partial fixes for BUG-909.
- **2026-05-05 v4:** Reconciliation pass #2 after Phase 1 partial ship. Marked PR 0 + PR 4 SHIPPED with caveats (Sentry-tag analytics decision; uppercase test scoped to `app/`; mentor-memory/celebrations owner-prefix deferred into PR 3 cleanup). Dropped PR 1's "snapshot diff = zero" criterion (baseline moved). Reduced PR 1 scope to 4 components (was 7). Re-ordered: PR 1 + PR 2 in parallel, PR 3 after PR 1. Folded `<TrackedView>` + `hashProfileId` into PR 3 (PR 0 closure). Added Sentry-pipeline limit acknowledgment + PostHog fallback trigger. Updated bug accounting: 5 closed, 2 open, 9 deferred. Estimate revised to ~2 sprints.
- **2026-05-06 v6:** Codebase reconciliation pass #4. PR 1 (component extract) confirmed **shipped** in commit `4047629f` — all four components (`WeeklyReportCard`, `MonthlyReportCard`, `RecentSessionsList`, `ReportsListCard`) live under `apps/mobile/src/components/progress/` and are mounted on both `/child/[profileId]/index.tsx` and `/progress/index.tsx`. PR 3 confirmed **substantially shipped** in same commit — `apps/mobile/src/app/(app)/progress/index.tsx` mounts the cards, wires `isProfileStale`, and fires `progress_empty_state_cta_tapped` with hashed profile_id; PR 0's `hashProfileId` + `bucketAccountAge` helpers also shipped (in `analytics.ts`). BUG-901 reclassified Closed (was Open). Audit accounting updated to 6 closed / 1 open / 9 deferred. Critical-path estimate revised to ~10 working days, dominated entirely by PR 2-pre + PR 2; the remaining frontend work (`<TrackedView>` dwell component + 4 co-located component tests + wiring `progress_report_viewed`) is a parallel small track. PR 1 + PR 3 sections retain their pre-flight + design narrative as historical context only — replaced by short "Status: Shipped/Substantially shipped" headers. Note: a separate `useProfileSessionHistory` hook was NOT added; `progress/index.tsx` derives `sessionCount` / `lastSessionAt` inline from `useProfileSessions(activeProfile?.id)` (which lives in `use-progress.ts`).
- **2026-05-06 v5:** Adversarial-review reconciliation. **CRITICAL-1:** the `usage_events` table assumed by PR 2 does not exist (only `quota_pools` per subscription); added precursor PR 2-pre to introduce per-profile event log + sweep all `decrementQuota` call sites. **CRITICAL-2:** `family_links.role` column does not exist; collapsed roles to owner / non-owner derived from `profiles.isOwner` + family_links parent rows; updated backend logic, tests, and the P1 gate query. **HIGH-1:** PR 1 renamed from "lift" to "extract" — the four candidate components do not exist anywhere in the repo today; added decompose-check pre-flight + cross-card coupling risk + estimate contingency. **HIGH-2:** privacy guard had an off-by-one (1 sibling → leak by subtraction); rule changed to "non-owners never see family aggregate"; rendered examples collapsed from 3 to 2; tests now cover 0/1/2+ sibling break cases. **HIGH-3:** P1 gate's HMAC join was undefined; added `profile_id_hash_log(profile_id, hash, key_version)` written in PR 3, plus a `subscription_breakdown_mounted` event so P3's events-vs-mounts ratio is computable. **MEDIUM-1:** added a mandatory ~1h Sentry-aggregation spike before PR 2/PR 3 fire any events; PostHog swap moved from gate-read time to spike-fail time. **MEDIUM-2:** PR 0 status changed from "Shipped, with caveats" to "Partially shipped — closure folded into PR 3." **MEDIUM-3:** `<TrackedView>` pre-flight now includes dep-availability check, +1/+2 day estimate adjustment, real-device dwell sanity acceptance, and an explicit iOS verification paragraph. **MEDIUM-4:** specified UTC fallback for owners with null `profiles.timezone`. **MEDIUM-5:** sign-off #5 dropped commit-message tag enforcement; PR descriptions are the durable record. **LOW-1:** removed duplicate BUG-906 from PR 2 overview row. **LOW-2:** reconciled critical-path arithmetic to ~13–17 days (~3 sprints) reflecting PR 2-pre + PR 2 longer paths. **NIT-1:** open question #2 reworded from "Resolved" to "Deferred to PR 3 pre-flight."
