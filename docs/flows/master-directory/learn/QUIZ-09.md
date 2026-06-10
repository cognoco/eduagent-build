# QUIZ-09 - Quiz History

> **Status:** Draft  
> **Access label:** Study-only  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `apps/mobile/src/app/(app)/quiz/history.tsx`, `apps/mobile/src/app/(app)/quiz/[roundId].tsx`, `apps/mobile/src/app/(app)/quiz/index.tsx`, `apps/mobile/src/app/(app)/practice/index.tsx`, `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`, `apps/mobile/src/app/(app)/child/[profileId]/report/[reportId].tsx`

## Purpose

Let the learner revisit completed quiz rounds after results are dismissed. The history groups recent completed rounds by Today, Yesterday, or locale date; each row shows the activity type, theme, score, XP, and opens a read-only round detail with per-question correctness, answers, clues, and fun facts.

For Family, quiz history is not a direct activity surface. Parents may need to review outcomes elsewhere, such as child progress, reports, weekly reports, child session/activity recaps, or a future parent-native Recaps feed.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Can open quiz history for the active learner from Quiz/Practice/results, inspect completed rounds, and retry by returning to Quiz. |
| Mentor / Family | Not surfaced as learner quiz history. Family may review quiz outcomes only through parent-native reports/progress/recaps once productized. |
| Owner/account | Adult owners in Study see their own quiz history. Adult owners in Family should not see or launch a child's quiz history as if they were the learner. |
| Wrong-audience deep link | Family-context or stale child deep links should recover to Family review surfaces or Study Quiz as the adult, never mutate child quiz state. Unauthorized round IDs must return protected/not-found through the API. |

## Shared Scope Decision

`Study-only`

Quiz history belongs to the learner quiz system and is scoped to the active profile's completed rounds. Mentor review is a different product surface: child outcomes, not the same learner flow. Current quiz layouts redirect parent proxy to Home, which aligns with blocking normal proxy access; the Family target still needs outcome review elsewhere.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Quiz index/history action | `/(app)/quiz/history` | Yes | No | History normally backs to `/(app)/quiz`. |
| Practice hub | `/(app)/practice` -> `/(app)/quiz/history?returnTo=practice` | Yes | No | Back target becomes Practice when `returnTo=practice`. |
| Quiz results | `/(app)/quiz/results` -> `/(app)/quiz/history` | Yes | No | Lets learner review completed rounds after seeing current result. |
| Empty history CTA | `/(app)/quiz/history` -> `/(app)/quiz` | Yes | No | Empty state invites learner to try a quiz. |
| Round detail row | `/(app)/quiz/[roundId]` | Yes | No | Read-only completed-round detail; back target is history or Practice based on `returnTo`. |
| Family child reports/progress | `/(app)/child/[profileId]/report/[reportId]`, weekly report, child progress/Recaps target | No | Yes, outcome review only | These are the expected parent-native review paths, not direct learner quiz history. |

## Data Ownership And Privacy

- `useRecentRounds`, `useRoundDetail`, and quiz stats include `activeProfile?.id` in query keys and require an active learner profile.
- Round detail is read-only but can expose answer history, wrong answers, clues used, and quiz themes. This is learner-owned study data.
- Family outcome review should use server-scoped child dashboard/report/recap APIs that enforce family-link and consent access, not the active learner quiz endpoints.
- Starting or replaying a quiz is a learner action. Family surfaces must not launch a child quiz by proxy unless a separate guardian-assist design exists.
- Parent proxy is blocked by the quiz layout redirect; that should remain true unless product intentionally designs a read-only child quiz review route.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | Header remains visible with a back button and `TimeoutLoader`; timeout offers retry and Go back. |
| Empty | Centered empty state says no history yet and offers a Try quiz CTA back to the quiz index, preserving `returnTo=practice` when present. |
| Success | FlatList of date groups, friendly date headers, rows with activity label, theme, score, XP, and detail navigation. Detail screen shows completed round header and expandable question cards. |
| Error/recovery | History error uses `ErrorFallback` with retry and Go back. Round detail load failure offers a back action to history or Practice. |
| No access | Family/proxy should not surface this flow. Tampered or stale `roundId` should show not-found/protected error and recover to learner Quiz/Practice or Family review, depending on context. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Verify `/quiz/history` top inset, Today/Yesterday grouping, empty state, and back targets; verify detail back fallback from direct deep link. |
| Native/emulator | `e2e/flows/quiz/quiz-full-flow.yaml` covers quiz index -> launch -> play -> results; audit says QUIZ-09 grouping and empty state remain partial coverage. |
| API/unit tests | `apps/mobile/src/app/(app)/quiz/history.test.tsx` and `[roundId].test.tsx` cover current client behavior. Add Family contract tests to ensure quiz/history is not surfaced in Family. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Coverage gap | Flow coverage audit | QUIZ-09 is listed as partial: Today/Yesterday grouping and empty state need explicit E2E assertions. |
| Product gap | Family outcome review | Family may review quiz outcomes elsewhere, but no dedicated child quiz-history/Recaps route exists today. |
| Access drift | Navigation contract | Family direct quiz routes are not surfaced; current quiz layout redirects parent proxy, but future contract should centralize this in `canEnter()`/`isSurfaced()`. |
| Data limitation | BUG-930 note | Vocabulary round history extracts language from theme because quiz rounds lack a languageCode column in the history payload. |
| Stale route risk | Back targets | History/detail use `returnTo=practice` and explicit replacements; future Family outcome deep links need parent-native back fallback, likely Recaps or child detail. |

## Open Questions

- Should Family reports show quiz outcomes as aggregate trends, individual rounds, or only exceptions that need parent attention?
- If a parent can open a child quiz result, should it reuse `[roundId]` read-only UI or have parent-native language/context?
- Should a quiz push/deep link tapped in Family mode route to child report/Recaps rather than learner Quiz history?
- Does child quiz outcome visibility require additional consent or learner privacy controls beyond existing family-link access?
