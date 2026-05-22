# PARENT-03 - Child Detail Drill-Down

> **Status:** Draft  
> **Access label:** Family-only  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `apps/mobile/src/components/home/ParentHomeScreen.tsx`, `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx`, `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`, `apps/mobile/src/components/guards/RequireFamilyContext.tsx`, `apps/mobile/src/hooks/use-dashboard.ts`, `apps/mobile/src/hooks/use-progress.ts`, `apps/mobile/e2e/flows/parent/child-drill-down.yaml`

## Purpose

Give an adult family-support user a parent-native child detail page for one linked child: reports, subjects, recent sessions, progress nudges, accommodation settings, mentor memory, profile metadata, and consent management.

This flow is the normal Family drill-down path. It should not require switching into the child's real profile and should not show proxy chrome. The adult remains the active owner; child data is read or managed through linked-child routes and server authorization.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Not surfaced from Study. A student studying as themselves should use Study Home, Library, Progress, sessions, and More. |
| Mentor / Family | Primary route for child review. Adult owners with linked-child access can open child detail from Family home/progress and continue into child subjects, topics, sessions, reports, mentor memory, accommodation, and consent. |
| Owner/account | Adult owner remains the acting profile. Account owner controls are separate from child detail, except child-specific setup/consent/preferences exposed through this route. |
| Wrong-audience deep link | Child/non-owner, solo learner, adult without family capability, and tampered `profileId` should not see another child's detail. Current V0 guard requires Family mode; server child APIs must enforce family-link/consent access. |

## Shared Scope Decision

`Family-only`

Child detail is a parent-native Family surface. It may reuse learning/progress components, but the scope is a linked child, not the active student's own Study data and not proxy impersonation.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Family child check card | `ParentHomeScreen` -> `parent-home-check-child-{profileId}` -> `/(app)/child/[profileId]?mode=progress` | No | Yes | Opens child detail with progress nudge emphasis. |
| Child avatar/profile action | `ParentHomeScreen` -> `parent-home-child-profile-{profileId}` -> `/(app)/child/[profileId]?mode=settings` | No | Yes | Opens settings-oriented child detail. |
| Recent child activity row | `ParentHomeScreen` -> `parent-home-recent-child-{profileId}` -> child detail | No | Yes | Parent-native drill-down for active children. |
| Family Progress child route | `/(app)/progress` child selection/actions -> child detail/report routes | No | Yes | Adjacent to LEARN-17 Family progress; child detail remains linked-child scoped. |
| Reports row | `/(app)/child/[profileId]` -> `child-reports-link` -> `/(app)/child/[profileId]/reports` | No | Yes | Weekly/monthly report list and detail. |
| Subject card | `/(app)/child/[profileId]` -> `subject-card-{subjectId}` -> `subjects/[subjectId]` | No | Yes | Subject detail is parent-native and can continue to topic/session drill-down. |
| Recent session card | `RecentSessionsList` -> `/(app)/child/[profileId]/session/[sessionId]` | No | Yes | Opens parent session recap/detail, not the student's own session summary route. |
| Child mentor memory | `mentor-memory-link` -> `/(app)/child/[profileId]/mentor-memory` | No | Yes | Child support settings with child consent handling. |
| Child accommodation | `child-accommodation-row-{profileId}` -> `/(app)/more/accommodation?childProfileId={profileId}` | No | Yes | Child-specific preferences launched from Family child detail. |
| Back | `back-button` -> `FAMILY_HOME_PATH` (`/(app)/home`) | No | Yes | Current fallback is Family home path; target Recaps/detail work may need more specific fallbacks. |

## Data Ownership And Privacy

- The parent route reads child data through child/dashboard hooks: `useChildDetail(profileId)`, `useDashboard()`, `useProfileSessions(profileId)`, `useChildLearnerProfile(profileId)`, and child consent hooks.
- `RequireFamilyContext` currently wraps the child stack. With mode-nav V0 enabled, it renders only when `mode === 'family'`; if the adult is family-capable but not in Family mode, it switches to Family and replaces to Family home.
- `ChildDetailScreen` has a client ownership check using the local `profiles` list and a fallback for unavailable/removed profiles. This is not a substitute for server family-link authorization.
- Parent-native child routes should show only linked/visible children and should not include the adult's own Study progress.
- Consent management can withdraw or restore child consent and may trigger deletion/grace-period states; failures are surfaced inline.
- Accommodation and mentor-memory links manage child-specific preferences. They must not silently edit the adult's own learner profile.
- Normal child detail should not set `X-Proxy-Mode`, switch active profile, or hide Study actions through proxy side effects.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | Child detail can show loading while dashboard/detail/profile/session data resolves. Family route guard may briefly show `family-route-switching` when it is moving a family-capable adult into Family mode. |
| Empty | No sessions shows "No sessions yet"; no subjects suppresses the subjects section; no consent record suppresses consent controls; no linked children should be handled before this page from Family setup/home. |
| Success | The adult sees the child's name, last-session label, report link, subjects sorted by recent session, recent sessions, accommodation row, mentor-memory row, profile details, and consent controls where relevant. |
| Error/recovery | Missing `profileId` shows `child-profile-no-id` with Home recovery. Unowned IDs show `child-profile-no-access` and Back. Removed/unavailable profile shows retry plus Back to dashboard. Consent-status errors show retry inside the consent section. |
| No access | Wrong audience sees `family-route-no-access` or child no-access/unavailable states. Server must return protected/not-found for unauthorized child IDs even if the client route renders. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Not rerun in this mapping pass. Web should verify cross-stack back fallbacks from child detail, subjects, topics, sessions, reports, and accommodation because these routes often originate outside their stack. |
| Native/emulator | `e2e/flows/parent/child-drill-down.yaml` covers Family dashboard -> child detail -> subject -> topic -> session detail, with screenshots and proxy transcript-gate regression at the end. Some optional coordinate fallbacks mean it can miss exact route guarantees. |
| API/unit tests | `child/[profileId]/_layout.test.tsx`, `child/[profileId]/index.test.tsx`, `ParentHomeScreen.test.tsx`, `use-dashboard` tests, and progress/session list tests cover pieces. Target contract needs route `canEnter()` tests for linked-child-only access. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Product drift | `docs/specs/2026-05-21-navigation-contract.md` | Target Family tabs include Recaps and parent-native child routes. Current V0 has Family home/progress/more and no Recaps tab/API. |
| Guard drift | `RequireFamilyContext` | The current guard imperatively switches mode and replaces to Home for family-capable adults. The target contract should make this a pure route decision through `canEnter()`. |
| Security caveat | `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` | Client checks `profiles.find(profile.id === profileId)`, but server authorization remains the real protection for linked-child access. |
| Proxy adjacency | `apps/mobile/e2e/flows/parent/child-drill-down.yaml` | The same E2E file also verifies a proxy transcript gate. That is a compatibility regression, not part of normal PARENT-03 child detail. |
| Back-stack drift | Child nested routes | Current child detail back fallback is `/(app)/home`; future Recaps/Family Progress entries may need route-specific fallbacks so users return to the surface they came from. |
| Naming drift | Parent home action | `parent-home-check-child` opens `mode=progress`, while `parent-home-child-profile` opens `mode=settings`; both land on the same route with sections suppressed by query mode. This should be explicit in tests and product docs. |

## Open Questions

- Should child detail remain one route with `mode=settings|progress`, or split into child overview, child progress, and child settings once Family Progress/Recaps are contract-owned?
- What should the default Family child detail entry be when opened from search, push, or an all-children Recaps feed?
- Should child curriculum creation become a first-class child route from this page, replacing any top-level Family Library behavior?
- Which child detail errors should route back to Family home versus future Recaps or Family Progress?
