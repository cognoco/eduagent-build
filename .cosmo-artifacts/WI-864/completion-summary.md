## Completion Summary — WI-864 ([LEARN-50] align Challenge Round docs/status + deterministic mobile surface proof)

**What was done:** Reconciled the Challenge Round drafted-note grounding docs with
the actual server-side implementation, added deterministic mobile + parked-state
proof, and promoted LEARN-50 to Pass with citations.

**What changed:** `apps/mobile/src/app/(app)/session/index.test.tsx` (+117): skip-note
path (`handleSkipDraftedNote` clears state and does NOT POST `/notes`) and
ungrounded-fallback path (`body:null` + `fallbackPrompt` → write-your-own composer;
`drafted-note-input` visible, `drafted-note-preview` absent).
`apps/api/src/services/concept-capture.test.ts` (+15): parked-state guard pinning
`CONCEPT_CAPTURE_ENABLED=false` and proving the single live call site is gated (via
export-existence check, not a fragile source-string match). Docs corrected
(`learning-path-flows.md`, `mobile-app-flow-inventory.md` LEARN-49/50,
`flow-revision-plan-2026-06-17.md` → LEARN-50 Pass) to reflect that drafted-note
grounding runs server-side at emission (`session-exchange.ts:556`,
`buildValidatedDraft`/`validateNoteDraft`); plan doc `_plan-WI-864.md` added.

**Verification:** Delivered via PR #1268 (author `crowka`), squash-merged to `main`
as `a6849b5b1`. `main` branch-protection required checks green at merge; review
findings addressed (JSDoc collapse, export-existence guard replacing readFileSync match).

**Caveats / Follow-ups:** Drafted-note grounding is server-side; concept-capture
stays parked (flag false) until the baseline reset. Test + doc + plan only. No follow-ups.
