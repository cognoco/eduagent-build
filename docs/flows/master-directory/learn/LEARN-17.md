# LEARN-17 - Progress Overview

> **Status:** Draft  
> **Access label:** Shared different scope  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `apps/mobile/src/app/(app)/progress/index.tsx`, `apps/mobile/src/hooks/use-progress.ts`, `apps/mobile/src/components/progress/ProgressPillRow.tsx`

## Purpose

Show progress at a glance and route the user to the next useful learning or review surface. In Study, this means the active learner's own progress, reports, saved messages, vocabulary, recent focus, and keep-learning CTA. In Family, this means child/family progress only: selecting linked children, reading child summaries/reports/sessions, and sending support nudges without mixing in the adult's own learning data.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Shows the active student's own progress only. Deep links with another `profileId` should not switch the student into child/family progress. |
| Mentor / Family | Shows linked child progress only in the target contract. Current V0 uses the same `/(app)/progress` route with a child selector when `mode !== 'study'`. |
| Owner/account | Adult owner can view self progress in Study and child progress in Family. The adult's self progress must be excluded from Family progress. |
| Wrong-audience deep link | Unknown/tampered child IDs are ignored client-side unless linked and should be protected server-side. Study mode resets selection to active profile. |

## Shared Scope Decision

`Shared different scope`

The route is intentionally shared, but scope changes by app context. Study scope is `self`; Family scope is `children`. Current code approximates this with local `mode`, `selectedProfileId`, linked children, and query enablement inside `ProgressScreen` and `use-progress` hooks. The target contract should centralize that decision as `gates.progressScope`.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Progress tab | `/(app)/progress` | Yes | Yes | Same route; title and data change by selected/self vs child profile. |
| Progress deep link with profile | `/(app)/progress?profileId={id}` | Self only | Linked child only | Current code accepts requested profile only if allowed by mode and linked-child checks. |
| Child card progress | `ParentHomeScreen` -> `/(app)/child/[profileId]?mode=progress` | No | Yes | Adjacent parent-native route; not the same as top-level Progress but part of Family progress journey. |
| Profile selector | `ProgressPillRow` | No | Current V0 yes when `hasLinked && mode !== 'study'` | Lets owner select among linked children; should not include adult self in target Family scope. |
| Latest report | Self: `/(app)/progress/weekly-report/[weeklyReportId]` or `/(app)/progress/reports/[reportId]`; Child: `/(app)/child/[profileId]/weekly-report/[weeklyReportId]` or `/(app)/child/[profileId]/report/[reportId]` | Yes | Yes, child routes | Route choice depends on `isViewingSelf`. |
| View all reports | Self: `/(app)/progress/reports`; Child: `/(app)/child/[profileId]/reports` | Yes | Yes, child routes | Family path is parent-native. |
| Vocabulary stat | `/(app)/progress/vocabulary` | Yes, language subjects only | No in target | Current component renders vocabulary link only for `isViewingSelf` inventory/language subject context. |
| Saved bookmarks | `/(app)/progress/saved` | Yes | No in target | Rendered only when `isViewingSelf`; parent proxy delete restrictions are compatibility behavior, not target Family UX. |
| Keep learning | Resume target or `/(app)/home` | Yes | No in target | Rendered only when `isViewingSelf`; writes as active learner. |
| Empty state CTA | First subject shelf or `/(app)/library`; proxy uses Library | Yes | Needs Family-specific recovery | Current fallback to Library is Study-oriented; Family child empty state should recover to child curriculum/detail once designed. |

## Data Ownership And Privacy

- Study progress reads active-profile endpoints: progress inventory, overview, sessions, reports, weekly reports, resume target, subjects, vocabulary, saved messages.
- Family progress reads child-specific dashboard endpoints only when `mode !== 'study'`, active profile is owner, and the child profile ID is selected/linked.
- Query keys include current mode and profile IDs to avoid cache sharing between Study self progress and Family child progress.
- `useProfileSessions`, `useProfileReports`, and `useProfileWeeklyReports` choose active-profile progress endpoints for self and dashboard child endpoints for child profiles.
- Refresh snapshot is self-only. When viewing a child, pull-to-refresh refetches child inventory/reports/sessions/summary but does not call the active learner refresh mutation.
- Adult owners can be both mentor and student; switching Family progress must not mutate or display adult self progress except through an explicit switch back to Study.
- Parent proxy is detected through `useActiveProfileRole()` as `impersonated-child`; copy and empty CTA change, but this should remain compatibility behavior.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | Primary inventory query controls loading to avoid partial flicker. Skeleton cards render first; after 15 seconds, an `ErrorFallback` offers retry and Home. |
| Empty | If no sessions and no subjects, Study shows an empty progress card with Start learning. Child progress can collapse to awaiting/empty depending on reports and inventory; future contract should distinguish ineligible vs no reports. |
| Success | Hero summary, session/time/streak/topic/vocabulary chips, weekly deltas, latest report, previous reports, recent focus, subject breakdown for child views, saved link and keep-learning CTA for self views. |
| Error/recovery | Inventory error uses classified network/server copy with retry and Home. Latest report and recent focus have local retry controls. Refresh failures alert for self refresh. |
| No access | In Study, requested child IDs are ignored/reset to active profile. In Family, only linked children should be selectable; server must return protected/not-found for unauthorized child params. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Validate `progress-screen`, loading timeout, tab-shell visibility, self vs child report routes, and no stale selected profile after mode switches. |
| Native/emulator | `e2e/flows/progress/progress-analytics.yaml` covers the progress overview. Additional Family-mode coverage should assert adult self progress is absent and linked child progress routes open parent-native child reports/details. |
| API/unit tests | `apps/mobile/src/app/(app)/progress.test.tsx`, `apps/mobile/src/hooks/use-progress.test.ts`, `ProgressPillRow.test.tsx`, and query-key tests cover current scope/cache behavior. Target contract needs matrix tests for `progressScope`. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Product drift | Navigation contract | Family Progress should be children-only under `progressScope: children`; current screen computes this locally with `mode`, `isViewingSelf`, and linked children. |
| Missing discriminator | `D-RP-18 Phase 2` TODO | No API discriminator for report ineligibility; no-reports-yet and ineligible collapse to `awaiting`. |
| UX drift | Empty CTA fallback | Empty/proxy recovery falls back to top-level Library, but target Family mode should not surface adult Library as child curriculum. |
| Proxy drift | Parent proxy branch | `impersonated-child` changes title/copy and allows Library fallback; target says normal Family review should not use proxy. |
| Route drift | Shared route with query params | `/(app)/progress?profileId=` is accepted only in certain mode/profile combinations. This needs centralized `canEnter()` behavior to avoid future drift. |
| Coverage gap | Family Progress target | Existing E2E focuses on progress analytics; target Family child-only progress and adult-as-both-student-and-mentor need explicit tests after contract work. |

## Open Questions

- Should Family Progress default to the first linked child, an all-children aggregate, or the most recently active child once Recaps exists?
- What should the child empty state CTA open: child curriculum, child detail setup, or a parent guidance surface?
- Should top-level `/(app)/progress/vocabulary` be blocked in Family context or allowed only through a Study bridge?
- How should report push notifications land when the adult is currently in Study mode?
