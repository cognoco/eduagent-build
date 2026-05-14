---
title: 'Parent Child Surfaces Information Architecture'
slug: 'parent-child-surfaces-information-architecture'
created: '2026-05-13'
status: 'draft'
tech_stack:
  - Expo Router
  - React Native
  - TanStack Query
  - Hono API
  - Inngest
  - LLM router
files_to_modify:
  - apps/mobile/src/components/home/ParentHomeScreen.tsx
  - apps/mobile/src/app/(app)/child/[profileId]/index.tsx
  - apps/mobile/src/app/(app)/progress/index.tsx
  - apps/mobile/src/app/(app)/progress/reports/index.tsx
  - apps/api/src/services/dashboard.ts
  - apps/api/src/services/progress.ts
  - packages/schemas/src/progress.ts
code_patterns:
  - Parent home routes distinct child actions to distinct surfaces.
  - Progress is live/current-state learning status.
  - Reports are bounded weekly/monthly period recaps.
  - Child profile is child-specific settings/context only.
test_patterns:
  - Co-located React Native Jest tests.
  - Hook-level schema parsing tests when API contracts change.
  - API service tests for summary freshness and inactivity states.
---

# Tech-Spec: Parent Child Surfaces Information Architecture

**Created:** 2026-05-13

## Overview

### Problem Statement

The parent experience currently mixes child profile settings, live progress, reports, and activity history across multiple surfaces. This makes the app feel confusing because parents can encounter similar-looking summaries or cards in more than one place. The parent needs four distinct destinations with clear jobs: child profile, progress, reports, and nudge.

### Solution

Separate the parent child surfaces by intent. Parent home remains the launcher for child actions. Child Profile becomes a small child-specific settings/context screen. Progress becomes the live learning status screen with subject-by-subject activity and a current-state summary. Reports becomes the weekly/monthly recap surface with a period-specific summary. Nudge remains the encouragement action and is suggested from Progress when the child has not studied recently.

### Scope

**In Scope:**

- Parent home action semantics:
  - Child Profile/Progress card action opens the child profile/settings surface.
  - Progress tab shows live learning status.
  - Reports action opens child reports.
  - Nudge opens the nudge sheet.
- Child Profile surface:
  - Child name.
  - Last session signal.
  - Learning preferences row.
  - Mentor memory row.
  - Profile details only if already available with no extra API work.
  - No progress, reports, subject activity, recent session list, consent, subscription, celebrations, or language settings.
- Progress surface:
  - Header LLM current-state summary.
  - Header can say a nudge might help when the child has not studied recently.
  - Subject cards/list showing subject name, sessions, and time per subject.
  - Topic/progress details per subject where already available or cheaply available through existing inventory data.
  - Summary freshness must be visible when no new session has happened.
- Reports surface:
  - Header LLM period recap summary, not the same as Progress.
  - Weekly/monthly report list/archive.
  - Report details remain period-bound with comparisons, highlights, and practice totals.
- Summary freshness:
  - Progress summary must update after a new session.
  - If no new session happened, the UI must explicitly say so.

**Out of Scope:**

- Live LLM calls on every screen open.
- Consent management on Child Profile.
- Subscription/profile limit management on Child Profile.
- Celebration settings on Child Profile.
- Language settings on Child Profile.
- Duplicating report cards inside Progress.
- Duplicating progress snapshot/history inside Child Profile.
- New child-specific notification settings unless already present and trivial to expose.

## Context for Development

### Codebase Patterns

- Mobile routes live under `apps/mobile/src/app/(app)/`.
- Parent home child commands live in `apps/mobile/src/components/home/ParentHomeScreen.tsx`.
- Child profile route is `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`.
- Learner/parent Progress tab is `apps/mobile/src/app/(app)/progress/index.tsx`.
- Child reports route is `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx`.
- Existing progress hooks are in `apps/mobile/src/hooks/use-progress.ts`.
- Existing child dashboard hooks are in `apps/mobile/src/hooks/use-dashboard.ts`.
- Existing child profile preferences use `useChildLearnerProfile()` and accommodation routes.
- LLM calls must go through API services and `services/llm/router.ts`, not direct provider SDK calls.
- Durable async summary generation should be Inngest-backed, not fire-and-forget from route handlers.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/mobile/src/components/home/ParentHomeScreen.tsx` | Parent home child action buttons and routes |
| `apps/mobile/src/components/home/ParentHomeScreen.test.tsx` | Regression coverage for child action routing |
| `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` | Child Profile/settings surface |
| `apps/mobile/src/app/(app)/child/[profileId]/index.test.tsx` | Child Profile surface tests |
| `apps/mobile/src/app/(app)/progress/index.tsx` | Progress tab current implementation |
| `apps/mobile/src/app/(app)/progress.test.tsx` | Progress tab tests |
| `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx` | Child reports list |
| `apps/mobile/src/app/(app)/child/[profileId]/weekly-report/[weeklyReportId].tsx` | Child weekly report details |
| `apps/mobile/src/app/(app)/child/[profileId]/report/[reportId].tsx` | Child monthly report details |
| `apps/mobile/src/hooks/use-dashboard.ts` | Parent child detail/session/memory queries |
| `apps/mobile/src/hooks/use-progress.ts` | Progress inventory/history/reports/session queries |
| `apps/api/src/services/dashboard.ts` | Parent dashboard child detail data |
| `apps/api/src/services/progress.ts` | Progress overview/inventory data |
| `apps/api/src/services/weekly-report.ts` | Weekly report recap generation |
| `apps/api/src/services/monthly-report.ts` | Monthly report recap generation |
| `packages/schemas/src/progress.ts` | Shared progress/report/dashboard contracts |

### Technical Decisions

- Child Profile is not a dashboard. It should remain short even if that means it looks sparse.
- Progress and Reports may both have LLM summaries, but they answer different questions:
  - Progress summary: "Where is my child now, what changed recently, and should I act?"
  - Reports summary: "What happened during this finished week/month?"
- Progress summary must be staleness-aware:
  - Generated summary stores `generatedAt`, `basedOnLastSessionAt`, and ideally `latestSessionId`.
  - If the latest session is newer than `basedOnLastSessionAt`, regenerate.
  - If there is no newer session, show "No new sessions since ..." instead of pretending the summary is fresh.
- Inactivity handling belongs in the Progress header:
  - If last session is older than the chosen threshold, show copy like "A nudge might help" and a Send Nudge CTA.
  - Suggested thresholds: 2 days shows no-new-session state, 3+ days shows nudge CTA, 7+ days shifts to gentle restart language.
- Reports summaries are stable and period-bound. They do not need to refresh unless the underlying report is regenerated.

## Implementation Plan

### Tasks

1. Parent home routing cleanup
   - File: `apps/mobile/src/components/home/ParentHomeScreen.tsx`
   - Ensure nested child card pressables do not cause action route collisions.
   - Keep action routes distinct:
     - child profile/settings
     - reports
     - nudge
   - Test file: `apps/mobile/src/components/home/ParentHomeScreen.test.tsx`

2. Child Profile simplification
   - File: `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`
   - Remove duplicated reports/progress/activity/consent/subscription/celebration/language content.
   - Keep header with last session signal.
   - Keep Learning Preferences row.
   - Keep Mentor Memory row.
   - Add profile details only from data already loaded.
   - Test file: `apps/mobile/src/app/(app)/child/[profileId]/index.test.tsx`

3. Progress subject breakdown
   - File: `apps/mobile/src/app/(app)/progress/index.tsx`
   - Add or reshape a subject-by-subject section showing:
     - subject name
     - sessions count
     - time spent
     - last studied if available
     - topic/progress signal if available
   - Prefer existing `KnowledgeInventory.subjects` fields before changing API contracts.
   - Remove report-flavored cards from Progress if they duplicate Reports.
   - Test file: `apps/mobile/src/app/(app)/progress.test.tsx`

4. Progress header summary contract
   - Files likely:
     - `packages/schemas/src/progress.ts`
     - `apps/api/src/services/progress.ts`
     - `apps/mobile/src/hooks/use-progress.ts`
     - `apps/mobile/src/app/(app)/progress/index.tsx`
   - Add a current-state summary shape only if existing fields cannot support the UI.
   - Include freshness metadata:
     - `summary`
     - `generatedAt`
     - `basedOnLastSessionAt`
     - `latestSessionId` or equivalent
     - `activityState`: `fresh | no_recent_activity | stale`
     - optional `nudgeRecommended`
   - Ensure the UI displays no-new-session messaging when appropriate.

5. Progress summary generation
   - Files likely:
     - `apps/api/src/services/progress-summary.ts`
     - `apps/api/src/inngest/functions/*`
     - `apps/api/src/inngest/index.ts`
   - Generate/update summary after sessions or progress snapshots, not on every Progress open.
   - Use LLM router only.
   - Provide deterministic fallback when no generated summary exists.
   - Add hard caps to any LLM-controlled summary field.

6. Reports header summary
   - Files likely:
     - `apps/api/src/services/weekly-report.ts`
     - `apps/api/src/services/monthly-report.ts`
     - report detail/list mobile screens
   - Use period-bound report summary copy.
   - Do not reuse Progress current-state summary.
   - Make period label explicit.

7. Nudge CTA from Progress header
   - File: `apps/mobile/src/app/(app)/progress/index.tsx`
   - Reuse existing nudge action sheet or existing send-nudge flow.
   - Show only when viewing a child and inactivity threshold is crossed.
   - Test CTA visibility and action.

### Acceptance Criteria

1. Given a parent opens Child Profile from a child card, when the screen loads, then it shows child name, last session status, learning preferences, mentor memory, and optional profile details only.
2. Given Child Profile has progress/report data available in API responses, when the screen renders, then it does not show reports, progress snapshot, growth chart, subject progress cards, recent sessions list, consent, subscription, celebrations, or language settings.
3. Given a parent opens Progress for a child, when inventory has multiple subjects, then each studied subject shows subject name plus session count and time spent.
4. Given a parent opens Progress for a child, when a current-state summary exists and is based on the latest session, then the header shows that summary as current.
5. Given a parent opens Progress for a child, when no session has happened since the summary was generated, then the header explicitly says no new sessions have happened since the relevant date/time.
6. Given a child has not studied recently, when the parent opens Progress, then the header suggests that a nudge might help and exposes a Send Nudge action.
7. Given a parent opens Reports, when weekly/monthly reports exist, then the screen shows report-period summaries and archive/list behavior, not the Progress current-state summary.
8. Given a report summary and a Progress summary exist for the same child, when both surfaces are viewed, then their text answers different questions and does not duplicate the same summary.
9. Given no generated summary exists, when Progress or Reports loads, then the UI shows a deterministic fallback and does not trigger a live LLM call from the mobile screen.
10. Given a new learning session completes, when background processing finishes, then Progress summary freshness metadata reflects the latest session.

### Failure Modes

| State | Trigger | User sees | Recovery |
| ---- | ------- | --------- | -------- |
| LLM summary generation fails | The Inngest progress-summary function exhausts retries after `app/session.completed`. | Progress shows the deterministic fallback or the last cached summary with stale messaging. | Inngest failure is observable; next completed session retries generation, and support can replay the event if needed. |
| Consent withdrawn after summary exists | Parent opens Progress after the child dashboard visibility gate is no longer satisfied. | The parent sees the standard unavailable/error state instead of cached child learning data. | Restore consent through the consent flow, then reload Progress. |
| Empty inventory at generation time | A session completes before inventory/snapshot data is populated enough for a useful summary. | Progress shows a gentle fallback that a summary will appear after more learning data exists. | The next session completion regenerates with richer inventory context. |
| Concurrent session completions | Multiple `app/session.completed` events arrive for the same child inside the debounce window. | Progress may briefly show stale metadata until the debounced generation completes. | Debounced Inngest generation writes one current summary based on the latest session. |
| Dashboard visibility rejected | `assertChildDashboardDataVisible` rejects after consent revocation or archive state changes. | Progress summary endpoint returns the same protected-data failure as inventory/reports. | Parent must resolve consent/access state; no cached summary is served while blocked. |

## Additional Context

### Dependencies

- Existing nudge sheet / send nudge hook.
- Existing child sessions endpoint for last activity.
- Existing progress inventory/history endpoint for subject-level data.
- Existing weekly/monthly report generation for period summaries.
- If a new summary cache is needed, it will require schema/API/service changes and likely an Inngest function.

### Testing Strategy

- Mobile unit tests:
  - ParentHomeScreen routing tests.
  - Child Profile content and absence-of-duplicates tests.
  - Progress subject breakdown rendering tests.
  - Progress header inactivity/nudge CTA tests.
  - Reports header summary tests.
- API unit tests:
  - Summary freshness state.
  - Inactivity threshold classification.
  - Deterministic fallback summaries.
- Integration tests if summary persistence or Inngest dispatch is added:
  - Verify a production code path dispatches/schedules summary refresh.
  - Verify latest session metadata updates summary freshness.
- LLM eval:
  - If prompt files or LLM summary generation are added/changed under `apps/api/src/services/**/*-prompts.ts` or `services/llm/*.ts`, run `pnpm eval:llm` and stage snapshots.

### Notes

- Keep copy gentle. Inactivity should not shame the child or alarm the parent.
- Suggested inactivity language:
  - "No new sessions since Monday."
  - "A short nudge might help Emma restart."
  - "Try a tiny next step rather than a big push."
- Avoid "dashboard soup": if a card belongs to Reports or Progress, do not also place it on Child Profile.
