# WI-2331 — full ~78-file back-navigation audit (builder-2331, 2026-07-23)

Source: `rg -l "goBackOrReplace|router\.(back|replace)\(" apps/mobile/src/app/(app)/**` minus `.test.` files. This is the enumeration to mint the AC-2 exhaustive-sweep follow-up Enhancement WI from.

## Fixed this pass (13 files — see WI-2331 per-AC report / PR body for detail)
`mentor-memory.tsx`, `subscription.tsx`, `billing/manage.tsx`, `child/[profileId]/index.tsx`, `my-notes/index.tsx`, `topic/relearn.tsx`, `session/index.tsx` (+`session-route-params.ts`), `homework/camera.tsx` (+`homework-session-params.ts`), `quiz/index.tsx`, `quiz/launch.tsx`, `quiz/play.tsx`, `progress/[subjectId]/index.tsx`, `practice/index.tsx`, `onboarding/language-setup.tsx`, `child/[profileId]/session/[sessionId].tsx`, `components/session/use-session-actions.ts`, `create-subject.tsx`, `session-summary/[sessionId].tsx`.

## Already compliant, verified, not touched
- `account/index.tsx` — the WI-2240 reference implementation this whole contract generalizes.
- `subject-hub/[subjectId]/index.tsx`, `pick-book/[subjectId].tsx` — destination already correct; label is generic (`common.goBack`) — sweep candidate for label only.
- `subject/[subjectId].tsx` — Back already targets real parent; the one `/(app)/home` ref is a correctly-labeled missing-param error state.
- `child/[profileId]/index.tsx`'s "Back to Dashboard" action — already names its real destination.
- `progress/[subjectId]/index.tsx`'s own no-returnTo fallback (`/(app)/progress`) — that IS its real parent.
- `library.tsx` (2 sites) — ErrorFallback "Go Home" actions; label/destination internally consistent, different UI role than Back.

## Reviewed, deliberately left alone (rationale — flag for sweep WI)
- `dashboard.tsx` — intentional legacy redirect for external deep links/push notifications/bookmarks (in-file comment); not a dead-fallback bug.
- `recaps/[recapId].tsx`, `recaps/index.tsx` — V1-gated, genuine intentional destination, unreachable from V2 3-tab shell currently.
- `vocabulary/index.tsx`, `topic/index.tsx` — invisible stack-anchor redirects (`unstable_settings.initialRouteName`), not literal Back controls.

## NOT individually audited this pass (~57 of 78) — the sweep WI's actual scope
Nested leaves under already-covered roots, or files likely already resolving to a real parent per the general pattern:
`progress/saved.tsx`, `dictation/*`, `more/*`, `child/[profileId]/{reports,curriculum,topic,subjects,weekly-report,report}/*`, `quiz/{history,results,dev-only,[roundId]}.tsx`, `shelf/*`, `link/*`, `journal/_layout.tsx`, save-wizard components, `_subscription/_components/*`.

## Full file list (all 78, `apps/mobile/src/app/(app)/` relative)
```
account/index.tsx, billing/manage.tsx, child/[profileId]/curriculum.tsx,
child/[profileId]/index.tsx, child/[profileId]/mentor-memory.tsx,
child/[profileId]/report/[reportId].tsx, child/[profileId]/reports.tsx,
child/[profileId]/session/[sessionId].tsx, child/[profileId]/subjects/[subjectId].tsx,
child/[profileId]/topic/[topicId].tsx, child/[profileId]/weekly-report/[weeklyReportId].tsx,
_components/CreateProfileGate.tsx, _components/save-wizard/ConfirmStep.tsx,
_components/save-wizard/SaveWizardGate.tsx, dictation/complete.tsx, dictation/history.tsx,
dictation/index.tsx, dictation/playback.tsx, dictation/review.tsx, dictation/text-preview.tsx,
home.tsx, homework/camera.tsx, journal/_layout.tsx, _layout.tsx, library.tsx,
link/[contractId].tsx, link/initiate.tsx, mentor-memory.tsx, more/accommodation.tsx,
more/celebrations.tsx, more/index.tsx, more/mentor-language.tsx, more/security-sessions.tsx,
my-notes/index.tsx, my-notes/[kind].tsx, my-notes/_layout.tsx, onboarding/language-setup.tsx,
onboarding/pronouns.tsx, pick-book/_layout.tsx, pick-book/[subjectId].tsx,
practice/assessment/index.tsx, practice/assessment-picker.tsx, practice/index.tsx,
progress/index.tsx, progress/milestones.tsx, progress/reports/index.tsx,
progress/reports/[reportId].tsx, progress/saved.tsx, progress/[subjectId]/index.tsx,
progress/[subjectId]/_layout.tsx, progress/[subjectId]/sessions.tsx, progress/vocabulary.tsx,
progress/weekly-report/[weeklyReportId].tsx, quiz/dev-only/results.tsx, quiz/history.tsx,
quiz/index.tsx, quiz/launch.tsx, quiz/play.tsx, quiz/results.tsx, quiz/[roundId].tsx,
recaps/[recapId].tsx, session/_components/SessionErrorBoundary.tsx, session/index.tsx,
shelf/_layout.tsx, shelf/[subjectId]/book/[bookId].tsx, shelf/[subjectId]/index.tsx,
shelf/[subjectId]/_layout.tsx, subject-hub/[subjectId]/index.tsx, subject/_layout.tsx,
subjects.tsx, subject/[subjectId].tsx, _subscription/_components/ChildPaywall.tsx,
_subscription/_components/SubscriptionHeader.tsx, subscription.tsx, topic/index.tsx,
topic/_layout.tsx, topic/recall-test.tsx, topic/relearn.tsx, topic/[topicId].tsx,
vocabulary/index.tsx, vocabulary/_layout.tsx, vocabulary/[subjectId].tsx
```
