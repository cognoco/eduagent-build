DOC: docs/specs/2026-06-27-homework-autofile-recall-bridge.md (2026-06-27, 11.9K) + docs/plans/2026-06-27-homework-autofile-recall-bridge.md (2026-06-27, 10.4K)
CLAIMS:
- B1: replace blocking `StandardFilingPrompt` modal with silent fire-and-forget auto-file (`useFiling().mutate`) at homework session exit, then Home-bound `navigateToSummary`.
- B2: widen `SessionSummaryLibraryFilingControls` to homework via mode-stable `isHomeworkSession` gate + new `alwaysFilingCandidate` prop bypassing the freeform `exchangeCount>=5` floor.
- B3: fire the Recall Bridge (`useRecallBridge`/`recallBridge.mutateAsync`) on BOTH the submit-reflection path (`handleSubmit`) and the existing skip path — was submit-starved before.
- B4: delete `StandardFilingPrompt`, `showFilingPrompt`/`filingDismissed` state, `SessionScreenChrome.showFilingPrompt` prop, and orphaned `session.filingPrompt.*` i18n keys across 7 locales.

TECH VALIDITY: none broken — spec's own file:line citations (`use-session-actions.ts:398`, `[sessionId].tsx:630/783`, `SessionFooter.tsx:163-282`) match current code shape; no drift found.

IMPLEMENTED: all claims — complete.
- B1: `apps/mobile/src/components/session/use-session-actions.ts:399-411` — homework branch calls `filing.mutate({...})` then falls through to shared `navigateToSummary` call for all modes (no `setShowFilingPrompt` anywhere in repo).
- B2: `apps/mobile/src/components/session-summary/SessionSummaryLibraryFilingControls.tsx` has `alwaysFilingCandidate` prop (grep hit); `apps/mobile/src/app/session-summary/[sessionId].tsx:376-377,911-921` — `isHomeworkSession`/`isFreeformSession` gate renders the controls with `alwaysFilingCandidate` for homework.
- B3: `apps/mobile/src/app/session-summary/[sessionId].tsx:659-666` (submit path, inside `handleSubmit`, guarded `isHomeworkSession && !recallQuestions`) and `:785-793` (skip path, comment cites "bug #12" starvation) — both call `recallBridge.mutateAsync()`.
- B4: `StandardFilingPrompt` and `showFilingPrompt` — zero repo hits (grep across `apps/mobile/src`). Fully removed.
User-visible: homework sessions now exit silently (no modal), summary shows Added/Remove control, recall questions appear after both submit and skip.

CANDIDATE WIs: none extracted — correct, not a miss. Full spec+plan traced to code 1:1 across all 4 behavior changes (B1-B4) and all 8 plan tasks (T1-T8); no residual gap found. Zero candidates is the right outcome here, not missed scope.

VERDICT: valid

MVP RECOMMENDATION: in (already shipped, no action needed) — this is core V1 session-exit UX, orthogonal to the V2 shell/RevenueCat north star; nothing to gate.

CONFIDENCE: high — every named file:line in both docs matches current source; no test/route changes checked (out of scope for a doc audit) but the behavioral wiring is unambiguous.
1. None — this row needs no product ruling, only archival.
