---
title: Homework auto-file at exit + un-starve the Recall Bridge — Implementation Plan
date: 2026-06-27
profile: code
work_items: []
spec: docs/specs/2026-06-27-homework-autofile-recall-bridge.md
status: draft
---

# Homework auto-file at exit + un-starve the Recall Bridge — Implementation Plan

**Goal:** Replace the blocking homework filing modal with a silent fire-and-forget auto-file at exit, give the learner a quiet "Remove" opt-out on the summary by reusing the existing filing controls, and fire the Recall Bridge on both the submit and skip paths — reusing existing primitives; no new component, no new i18n, no backend change.

**Approach:** `handleEndSession` fires `useFiling().mutate` (fire-and-forget) then takes the Home-bound `navigateToSummary`. Delete `StandardFilingPrompt` and its state machinery. Widen the summary's filing-controls gate to homework (mode-stable), threading an `alwaysFilingCandidate` prop so the freeform exchange-count floor doesn't apply. Fire the recall bridge inside `handleSubmit` (submit path); leave the skip-block fetch intact (skip path). Remove orphaned i18n.

> Revised after two adversarial challenges (UX + architecture). See spec §"Challenge findings incorporated" for the four blockers that reshaped this plan.

## Scope

In scope:
- `apps/mobile/src/components/session/use-session-actions.ts`
- `apps/mobile/src/components/session/SessionFooter.tsx`
- `apps/mobile/src/app/(app)/session/index.tsx`
- `apps/mobile/src/app/(app)/session/_components/SessionScreenChrome.tsx`
- `apps/mobile/src/app/session-summary/[sessionId].tsx`
- `apps/mobile/src/components/session-summary/SessionSummaryLibraryFilingControls.tsx` (add `alwaysFilingCandidate` prop only)
- `apps/mobile/src/i18n/locales/{en,de,es,ja,nb,pl,pt}.json` + `source-baseline.json` (orphan-key removal only)
- Co-located test files for the above

Out of scope (must not change):
- `apps/api/**` (all endpoints reused as-is)
- Freeform filing path / `MMT-ADR-0021`
- Any nav-contract / V0 / V1 / V2 file

## Tasks

- [ ] **T1: Silent fire-and-forget auto-file in `handleEndSession`.**
  Thread `filing: ReturnType<typeof useFiling>` into `UseSessionActionsOptions`. Replace the homework branch (`use-session-actions.ts:398`) with the spec-B1 block: `if (effectiveMode === 'homework') { filing.mutate({ sessionId: activeSessionId, sessionMode: 'homework' }); }` then the existing `navigateToSummary(activeSessionId, result.wallClockSeconds, fastCelebrations)` for **all** modes. Remove `setShowFilingPrompt` from the options type; deps array → add `filing`, remove `setShowFilingPrompt`.
  **done when:** `use-session-actions.test.ts` has "homework end fires auto-file then navigates to summary" (asserts `filing.mutate` called `{sessionId, sessionMode:'homework'}` **and** `router.replace` to `/session-summary/...` with NO `filedSubjectId`/`filedBookId` param) and "auto-file rejection does not block navigation" (mutate's promise rejects → still navigates, no throw). Red before edit, green after. All three existing `setShowFilingPrompt` references in the test are removed (lines ~105/128/143), not just one. `filing` is injected as a real mock prop object (constructor injection, not `jest.mock` of an internal module — GC1/GC6 N/A).

- [ ] **T2: Delete `StandardFilingPrompt` + orphaned props (incl. `navigateToSessionSummary`).**
  Remove the `StandardFilingPrompt` function (`SessionFooter.tsx:163-282`) and its render site (`:71-82`). Delete props `showFilingPrompt`, `filingDismissed`, `filing`, `filingTopicHint`, `setShowFilingPrompt`, `setFilingDismissed`, `navigateToSessionSummary` from `SessionFooterProps` + destructure. Remove the now-unused `useFiling` type import if orphaned.
  **done when:** `SessionFooter.test.tsx` drops the prompt-specific cases (and the `navigateToSessionSummary` prop from its render helper, lines ~48/93/107/264/285/295/297) and passes; `tsc --noEmit` clean for the file; no `filing-prompt` testID or `navigateToSessionSummary` reference remains in `SessionFooter.tsx`.

- [ ] **T3: Add `alwaysFilingCandidate` to `SessionSummaryLibraryFilingControls`.**
  Add `alwaysFilingCandidate?: boolean` to `SessionSummaryLibraryFilingControlsProps` (default undefined/false). Change `const meetsFilingThreshold = isAutoFileCandidate(session)` (`:56`) to `const meetsFilingThreshold = alwaysFilingCandidate || isAutoFileCandidate(session)`.
  **done when:** `SessionSummaryLibraryFilingControls.test.tsx` gains "alwaysFilingCandidate renders Add for a kept-out short session" (a `filing_kept_out`, `exchangeCount<5` session no longer early-returns null — asserts `session-summary-library-add` present) and "filed short session renders Remove" (asserts `session-summary-library-remove`). Existing freeform threshold cases unchanged and green.

- [ ] **T4: Widen the summary filing-controls gate for homework.**
  In `session-summary/[sessionId].tsx:909`, replace the `isFreeformSession ? … : FilingFailedBanner` ternary with the spec-B2 block: freeform → controls; `isHomeworkSession` → `<SessionSummaryLibraryFilingControls sessionId={sessionId} alwaysFilingCandidate />`; else `session.data` → `FilingFailedBanner`; else null.
  **done when:** `session-summary/[sessionId].test.tsx` gains "homework session renders SessionSummaryLibraryFilingControls (filed → Remove)" and "homework keep-out then the control still renders Add (does not unmount)" — the Blocker-1 regression: render filed homework, tap `session-summary-library-remove`, assert `session-summary-library-filing` still present and `session-summary-library-add` shows. Freeform render assertions unchanged.

- [ ] **T5: Fire the recall bridge on the submit path (in `handleSubmit`).**
  In `handleSubmit` (`[sessionId].tsx:630`), after `setSubmitted(true)` and the draft-clear/breadcrumb, before `return true`, insert the spec-B3 submit-path block (guarded `isHomeworkSession && !recallQuestions`, best-effort try/catch, `setRecallQuestions` when questions returned). Leave the skip-block fetch (`:783`) untouched.
  **done when:** `session-summary/[sessionId].test.tsx` gains "recall bridge fires on submit path" — render homework summary, type ≥10 chars, submit, assert `fetchCallsMatching(mockFetch, '/recall-bridge').length === 1` and `recall-bridge-questions` renders; and "recall bridge still fires on skip path" (retained); and "no recall fire on revisit (isAlreadyPersisted)". The submit-path test must drive a faithful post-submit summary GET returning `status:'submitted'` so it can't false-green. Red before edit (proves starvation), green after.

- [ ] **T6: Remove prompt state machinery (`session/index.tsx`) + `SessionScreenChrome` prop; pass `filing`.**
  `index.tsx`: remove `showFilingPrompt`/`filingDismissed` state (`:517-518`) + reset (`:677-678`); drop the `inputDisabled` term `(showFilingPrompt && !filingDismissed)` (`:1531`); remove the `session.disabledReason.chooseSave` branch (`:1547-1548`); simplify `footerScrollSignal` (`:1557`); drop the deleted props from the `SessionFooter` render (`:1581-1609`) and the `showFilingPrompt` prop from the `SessionScreenChrome` call; pass `filing` into `useSessionActions` (`:1170`) and drop `setShowFilingPrompt` (`:1187`); stop destructuring `navigateToSessionSummary` from `useSessionActions` if now unused. `SessionScreenChrome.tsx`: remove `showFilingPrompt` from `SessionScreenChromeProps` (`:14`) and from the `disabled` expression (`:42`).
  **done when:** `(app)/session/index.test.tsx` and `SessionScreenChrome.test.tsx` pass with prompt cases removed (drop `showFilingPrompt` from the chrome test props, `:16`); `tsc --noEmit` clean; grep of both files shows zero `showFilingPrompt`/`filingDismissed`/`chooseSave` references.

- [ ] **T7: Remove orphaned i18n keys across 7 locales + baseline.**
  Delete `session.filingPrompt.*` (12 keys) and `session.disabledReason.chooseSave` from `en.json` and `de/es/ja/nb/pl/pt.json`; remove an emptied `session.disabledReason` parent. Refresh every per-locale section of `source-baseline.json`.
  **done when:** `pnpm --filter mobile check:i18n:orphan-keys` (forward + unused) passes; `check:i18n:jsx-literals` and `check:i18n:keep-rot` pass; grep for `filingPrompt`/`chooseSave` across `i18n/` is clean.

- [ ] **T8: Full local validation.**
  Typecheck, lint, and related-test set for every changed file (direct jest `--findRelatedTests` per the `@nx/expo` Windows bug, not `nx affected`). Run `bash scripts/check-change-class.sh --branch` and execute what it routes.
  **done when:** `cd apps/mobile && pnpm exec tsc --noEmit` clean; `pnpm exec nx lint mobile` clean; all related jest suites green; change-class router reports no unaddressed validation.

## Tests (detail)

- **T1** (`use-session-actions.test.ts`): pass `filing` as `{ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false, … }`. Homework path: assert `filing.mutate` called once with `{sessionId, sessionMode:'homework'}` and `router.replace` param object has no `filedSubjectId`. Rejection path: `filing.mutate` impl throws synchronously is N/A (mutate doesn't throw) — instead assert that a fire-and-forget call whose underlying promise rejects does not prevent the `router.replace` that runs on the same tick. Constructor-injected mock, not `jest.mock`.
- **T4 / T5** (`session-summary/[sessionId].test.tsx`): reuse the file's routed `mockFetch` + `fetchCallsMatching`. For the Blocker-1 regression (T4), register the keep-out POST and a post-keep-out session GET returning `filing_kept_out` so the re-render exercises the restore branch. For T5 submit-path, ensure the summary GET after the submit POST returns `status:'submitted'`.

## Self-review notes

- Name consistency: B1 uses `navigateToSummary` (`:292`, Home-bound, no deep-link) — **not** `navigateToSessionSummary` (`:250`, deep-link helper), which becomes dead after the prompt deletion and is removed where it orphaned (T2/T6).
- Spec coverage: B1→T1, B2→T3+T4, B3→T5, B4→T2+T6+T7. All mapped. Failure-surface owner for homework = the controls component (T3/T4), `FilingFailedBanner` retained only for non-homework/non-freeform.
- Red-green: T1 (auto-file), T4 (keep-out non-unmount regression), T5 (submit-path starvation) each get a test that fails before and passes after.
- Scope-risk matrix (homework filing state × surface): filed→Added/Remove (controls); pending→Adding (controls); kept-out→Not in Library/Add (controls, needs `alwaysFilingCandidate`); failed→Try again or Adding-timeout (controls); revisit→no recall, no prompt. No cell left to the deleted prompt.
