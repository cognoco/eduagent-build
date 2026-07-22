# Homework: auto-file at exit + un-starve the Recall Bridge — Spec

> **Source:** SHIP-NOW backlog **W2 #11** (Wave 2, item 11) of the 2026-06-10
> learning-flow simplification deep-dive
> (`docs/reviews/2026-06-10-learning-flow-simplification-deepdive/04-path3-homework.md`,
> candidates **C1** + **C4**). No prior spec/plan existed (verified against
> `docs/specs/`, `docs/plans/`, `docs/plans/v2-plan/`).

> **STATUS (last verified 2026-07-22): SHIPPED.** Homework auto-file, the quiet
> remove/restore control for short homework sessions, and Recall Bridge coverage on
> both reflection-submit and skip paths are implemented and tested in
> `apps/mobile/src/components/session/use-session-actions.ts`,
> `apps/mobile/src/components/session-summary/SessionSummaryLibraryFilingControls.tsx`,
> `apps/mobile/src/app/session-summary/[sessionId].tsx`, and their co-located tests.
> Landed in `01dd53af2` (PR #1551). This spec has no remaining implementation scope.

Date: 2026-06-27 · Status: shipped · Last verified: 2026-07-22

## Problem

At the end of a **homework** session the learner hits a blocking binary modal —
"Add this to your Library?" → **Yes, add it** / **No thanks** (`StandardFilingPrompt`
in `SessionFooter.tsx`). Friction at the worst moment; a "No thanks" tap strands the
session out of the Library with no easy recovery.

Separately, the **Recall Bridge** (homework-only, max-2 method-recall questions) is
**starved on the submit-reflection path**. The fetch lives *inside* the
`!submitted && !isAlreadyPersisted` skip-block in `handleContinue`
(`session-summary/[sessionId].tsx:783`), so a learner who *submits* a reflection
never reaches it. The bridge only fires when the learner skips.

## Goal

1. **Auto-file homework at exit, silently.** No modal.
2. **Keep a quiet opt-out.** A low-friction **Remove** affordance on the
   session-summary screen, not a blocking gate at exit.
3. **Un-starve the Recall Bridge.** Fire on **both** the submit-reflection path and
   the skip path.

Non-goal: changing freeform filing (`MMT-ADR-0021`), changing any server endpoint, or
touching the V0/V1/V2 nav shells.

## Reuse mandate (hard rule)

Almost everything is already built in v0/v1. This change is **rewiring + deletion**.
Confirmed reusable primitives (no new component, no new i18n, no backend change):

| Need | Existing primitive | Location |
|---|---|---|
| Silent auto-file (sync server commit; persists even if the screen unmounts) | `useFiling().mutate` | `hooks/use-filing.ts:179` |
| Quiet "don't keep this" opt-out | `SessionSummaryLibraryFilingControls` → "Added → **Remove**" branch (i18n in all 7 locales) | `components/session-summary/SessionSummaryLibraryFilingControls.tsx` |
| Keep-out / restore mutations | `useKeepSessionOutOfLibrary` / `useRestoreSessionLibraryFiling` | `hooks/use-filing.ts` |
| Method-recall questions | `useRecallBridge(sessionId)` | `hooks/use-sessions.ts` → `routes/sessions.ts:1544` |
| Home-bound summary nav (no Library deep-link) | `navigateToSummary(sessionId, wallClock, fastCelebrations)` | `use-session-actions.ts:292` |

## Challenge findings incorporated

Two adversarial subagent reviews (end-user UX + architecture/code) ran against the
first draft. Findings that **changed the design** (verified against code, not taken
on assertion):

- **Arch Blocker 1 — filed-state parent gate self-destructs on Remove.** Keep-out's
  `onSuccess` invalidates the session detail query (`use-filing.ts:168-175`), so a
  gate keyed on `session.data?.topicId` flips false after Remove and unmounts the
  control (no restore). → **Gate on mode-stable `isHomeworkSession`, not filed-state.**
- **Arch Blocker 2 — the reused control is freeform-threshold-bound.** Its
  early-return needs `exchangeCount >= 5` (`SessionSummaryLibraryFilingControls.tsx:56-63`);
  homework is routinely 2–6 exchanges, so short homework collapses to `null`. → **Thread
  an `alwaysFilingCandidate` prop so the freeform exchange floor doesn't apply to
  homework.** (Reverses the first draft's "parent-guard only, don't touch the component".)
- **Arch Blocker 3 / UX Finding 1 — relocating the bridge re-starves (and hijacks).**
  `isAlreadyPersisted` is server-status-derived (`[sessionId].tsx:209-212`); it flips
  true after `handleSubmit` succeeds, so a post-skip-block guard of `!isAlreadyPersisted`
  never fires on the submit path. And firing on the exit tap makes the close X a
  silent no-op (the recall card renders above the submitted view). → **Don't relocate.
  Fire the bridge inside `handleSubmit` on success (submit path) and keep the existing
  skip-block fetch (skip path). The close X always means "leave".**
- **Arch Blocker 4 — `SessionScreenChrome.showFilingPrompt` is a required prop.**
  Removing the state without updating `SessionScreenChrome` is a `tsc` break. → **Add
  it to scope.**
- **UX Finding 2 — every homework session would deep-link into the Library.** → **Use
  `navigateToSummary` (Home-bound), not the deep-link helper.**
- **Arch SHOULD-FIX 6 / UX Finding 6 — blocking await with no timeout.** → **Fire-and-forget
  `filing.mutate`; never await the `/filing` round-trip on the exit path.**

## Behavior changes

### B1 — Auto-file at exit (replaces the prompt)

`use-session-actions.ts` `handleEndSession`, homework branch (`:398`) currently:

```ts
if (effectiveMode === 'homework') {
  setShowFilingPrompt(true);
  setIsClosing(false);
} else {
  navigateToSummary(activeSessionId, result.wallClockSeconds, fastCelebrations);
}
```

becomes a silent, non-blocking auto-file that then takes the **same Home-bound
navigation freeform uses**:

```ts
if (effectiveMode === 'homework') {
  // W2 #11: silent auto-file replaces the old blocking filing prompt.
  // Fire-and-forget — the server commit is in the mutationFn and persists even
  // as this screen unmounts; the summary's filing controls reflect
  // pending→added→failed. Never block exit on the /filing round-trip.
  filing.mutate({ sessionId: activeSessionId, sessionMode: 'homework' });
}
navigateToSummary(activeSessionId, result.wallClockSeconds, fastCelebrations);
```

Thread `filing: ReturnType<typeof useFiling>` into `UseSessionActionsOptions`; remove
`setShowFilingPrompt`. Deps array: add `filing`, remove `setShowFilingPrompt`
(`navigateToSummary` already present).

### B2 — Quiet opt-out on the summary (reuse the controls)

`session-summary/[sessionId].tsx:909` currently renders the controls **freeform-only**.
Widen to homework, gated on the **mode-stable** `isHomeworkSession` (survives the
keep-out invalidation), and pass `alwaysFilingCandidate` so the freeform exchange
floor doesn't apply:

```tsx
{isFreeformSession ? (
  <SessionSummaryLibraryFilingControls sessionId={sessionId} />
) : isHomeworkSession ? (
  // Homework now auto-files at exit; reuse the same controls for the quiet
  // "Added → Remove" (keep-out) opt-out. alwaysFilingCandidate bypasses the
  // freeform exchangeCount>=5 floor so short homework still renders.
  <SessionSummaryLibraryFilingControls sessionId={sessionId} alwaysFilingCandidate />
) : session.data ? (
  <FilingFailedBanner session={session.data} />
) : null}
```

`SessionSummaryLibraryFilingControls`: add `alwaysFilingCandidate?: boolean` (default
false); change `const meetsFilingThreshold = isAutoFileCandidate(session)` to
`const meetsFilingThreshold = alwaysFilingCandidate || isAutoFileCandidate(session)`.
The component's own state machine then owns every homework filing state — filed
("Added → Remove"), pending ("Adding…"), kept-out ("Not in Library → Add"), terminal
failure ("Try again"). The homework `FilingFailedBanner` fallback is dropped (one
owner for the homework-failure surface).

### B3 — Un-starve the Recall Bridge

**Submit path** — fire inside `handleSubmit` (`[sessionId].tsx:630`) after
`submitSummary` succeeds and `setSubmitted(true)`, so the recall card is part of the
post-submit view and the close X is never hijacked:

```ts
setSubmitted(true);
// …existing draft-clear + breadcrumb…
// W2 #11: fire the recall bridge on the submit path too (was skip-only).
if (isHomeworkSession && !recallQuestions) {
  try {
    const result = await recallBridge.mutateAsync();
    if (result.questions.length > 0) setRecallQuestions(result.questions);
  } catch {
    // best effort — never block the reflection on the bridge
  }
}
return true;
```

**Skip path** — unchanged. The existing fetch inside the `!submitted &&
!isAlreadyPersisted` skip-block in `handleContinue` (`:783`) stays exactly as is.

No relocation, so Blocker 3 (revisit re-starvation) and UX Finding 1 (exit-tap hijack)
do not arise. Double-fire is impossible: submit fires once (guarded `!recallQuestions`);
the skip-block is skipped once `submitted` is true; revisit (`isAlreadyPersisted`) hits
neither.

### B4 — Delete the blocking prompt + orphan i18n

- Delete `StandardFilingPrompt` (`SessionFooter.tsx:163-282`) and its render site
  (`:71-82`); drop props `showFilingPrompt`, `filingDismissed`, `filing`,
  `filingTopicHint`, `setShowFilingPrompt`, `setFilingDismissed`, **and the now-orphaned
  `navigateToSessionSummary`** (its only consumer was the prompt).
- `(app)/session/index.tsx`: remove `showFilingPrompt`/`filingDismissed` state
  (`:517-518`), reset (`:677-678`), the `inputDisabled` term (`:1531`), the
  `chooseSave` disabledReason (`:1547-1548`), the `footerScrollSignal` interpolation
  (`:1557`); pass `filing` (already `useFiling()` at `:770`) into the `useSessionActions`
  call and drop `setShowFilingPrompt`; drop the deleted props from the `SessionFooter`
  render and the `showFilingPrompt` prop from the `SessionScreenChrome` call. If
  `navigateToSessionSummary` is now unused, stop destructuring it from `useSessionActions`.
- `SessionScreenChrome.tsx`: remove `showFilingPrompt` from `SessionScreenChromeProps`
  (`:14`) and from the end-session-button `disabled` expression (`:42`).
- Remove orphaned i18n keys `session.filingPrompt.*` (title, description,
  descriptionWithTopic, addFailedTitle, addFailedMessage, yesAdd, yesAddLabel, adding,
  noThanks, noThanksLabel, tryAgain, skipForNow) and `session.disabledReason.chooseSave`
  from `en.json` **and** all 6 locale files (de, es, ja, nb, pl, pt), every
  `source-baseline.json` section. Verify with the orphan-key checker.

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Auto-file network error | `filing.mutate` rejects (fire-and-forget) | Lands on summary; controls show "Adding…"→times out→"still adding" + **Don't add**, or "Try again" if server set `filing_failed` | Tap **Don't add** (keep-out), or **Try again** |
| Recall bridge error | `recallBridge.mutateAsync` rejects | Nothing; flow proceeds | None (best-effort) |
| Learner doesn't want it filed | Taps **Remove** on summary | "Not in Library" + **Add** | Tap **Add** to restore |
| Bridge returns 0 questions | Short/method-light session | Flow proceeds | None |

## Out of scope / must not regress

- Freeform filing path and `MMT-ADR-0021` (unchanged).
- V0/V1/V2 nav shells — this touches the session + summary screens only.
- Server endpoints `/filing`, `/recall-bridge`, `/library-filing/keep-out` (reused as-is).

## Open items surfaced by the UX challenge (not blocking; flagged to product)

- **Minor consent (UX Finding 3):** silently auto-filing a child-on-parent-account's
  homework into a guardian-visible Library, with opt-out only after the fact. Aligns
  with the product's "quiet defaults over friction" stance and the Library-is-the-learner's
  model; mitigated by the on-summary Remove. Flag to product; not gated here.
- **"Remove" copy for homework (UX Finding 9):** reused freeform copy may read as
  "delete my work." Kept as-is under the reuse mandate; candidate for homework-specific
  copy later.

## Acceptance criteria

1. Ending a homework session navigates straight to the summary with **no filing
   modal**, lands at the Home-bound summary (not a Library deep-link), and fires the
   auto-file.
2. The summary renders the reused **Added → Remove** control for homework (including
   short <5-exchange sessions); **Remove** keeps it out and the control then offers
   **Add** to restore (does not vanish).
3. The Recall Bridge fires on **both** submit and skip paths for homework, never on
   revisit, never twice, and never blocks the close button.
4. `StandardFilingPrompt`, all `session.filingPrompt.*` / `chooseSave` keys, and
   `SessionScreenChrome.showFilingPrompt` are gone; orphan-key + JSX-literal checkers
   pass; all 7 locales stay in sync.
5. Freeform behavior is byte-for-byte unchanged.
