---
title: Homework OCR — LLM-First Reading + Flow Decoupling — Implementation Plan
date: 2026-05-31
profile: code
status: draft
revised: 2026-05-31 (adversarial review applied — see "Adversarial review log" at end)
---

# Homework OCR — LLM-First Reading + Flow Decoupling — Implementation Plan

**Goal:** When a homework photo contains handwriting (or anything ML Kit can't
cleanly read), the server vision LLM reads it and that read is shown/used —
instead of ML Kit garble being accepted as the "task." Confine all photo-reading
logic to the OCR layer so it can never perturb the standard chat flow. Also:
make the "type / record instead of camera" path an unmistakable, visible
affordance on the viewfinder.

**Approach:** Invert the on-device trust model. ML Kit is an instant fast-path
*only* when its output is clearly clean printed text; every other case escalates
to the server LLM (`/v1/ocr`, already Gemini-vision backed). LLM reads are
trusted end-to-end — they are not re-rejected by the homework-shape gate in the
hook *or* in the camera screen. Reading-quality predicates live in a dedicated
OCR module, not in the shared `problem-cards` gate, and a regression test locks
the standard-chat boundary.

## Background (root cause — confirmed)

- ML Kit (`@react-native-ml-kit/text-recognition`) exposes **no confidence
  field** (`node_modules/@react-native-ml-kit/text-recognition/index.ts:57-62`:
  `TextRecognitionResult` = `{ text, blocks }` only). So
  `getLocalConfidence()` always returns `undefined`, making the
  `confidence < 0.75` escalation guard (`use-homework-ocr.ts:231`) and the
  `blockConfidence < 0.55` guard (`problem-cards.ts:92`) **dead code**.
- Escalation therefore rests entirely on two text heuristics
  (`looksLikeOcrGarble`, `!hasStrongHomeworkCue`). Handwriting that ML Kit
  renders as plausible 3–5-letter "words" with an accidental cue defeats both →
  garble accepted locally, LLM never called. Each device garble sample has been
  patched with a new heuristic + regression test (`use-homework-ocr.test.ts:229`)
  — whack-a-mole.

## Coupling (confirmed) — what "break the link" means

1. **Standard-chat send pipeline (the link that has bitten us).** The camera
   screen funnels into the *same* session screen via
   `router.replace('/(app)/session', …)` (`camera.tsx:506`) and the *same*
   send path `continueWithMessage` (`use-session-streaming.ts:552`). Image
   attachment is already gated behind `effectiveMode === 'homework'`
   (`use-session-streaming.ts:597-607`, refs cleared at `780-781`), so plain
   text chat does not touch image refs today — but nothing *tests* that
   invariant, so camera edits keep risking it. T5 locks it.
2. **Shared homework-shape gate (within mobile only).** `isLikelyHomework` /
   `splitHomeworkProblems` (`problem-cards.ts`) are used by the OCR hook, the
   camera screen, and session-summary. The API does **not** share it
   (`session-exchange.ts:2426` only sets an `isHomework: true` flag). We break
   this link by moving the *reading-strategy* decision out of the shared gate
   into an OCR-local module (T1), and by trusting LLM reads past the gate
   (T2, T4).

## Discoverability finding (the "type / record" ask)

The affordance already exists in source: the viewfinder renders a
`testID="manual-entry-button"` pill — `t('homework.typeOrRecordInstead')` =
"No picture? Type or record instead" (`camera.tsx:911-923`, key at
`en.json:1425`). It calls `handleStartManualEntry` (`camera.tsx:452-456`) →
`START_MANUAL_ENTRY` → `result` phase, whose prompt is "Type or say the
homework problem:" (`en.json:1438`); that screen supports both a `TextInput`
(`draftProblems`) and voice (`useSpeechRecognition` / mic).

So this is **not** a missing feature. Two likely causes the end user can't find
it: (a) it is a low-contrast translucent pill (`bg-black/60 border-white/20`) on
a busy camera viewfinder, easy to miss on a small screen (Galaxy S10e); and/or
(b) the installed build predates the button (recent i18n migration —
`8134a909e`), the same stale-build pattern as
`.claude/memory/project_nav_v1_not_visible_on_staging.md`. T7 addresses (a) and
verifies (b).

## Scope

In scope:
- `apps/mobile/src/hooks/ocr-read-quality.ts` (new)
- `apps/mobile/src/hooks/ocr-read-quality.test.ts` (new)
- `apps/mobile/src/hooks/use-homework-ocr.ts` (incl. removing now-dead
  `NOT_HOMEWORK` artifacts — union member, `NON_HOMEWORK_ERROR_MESSAGE` const)
- `apps/mobile/src/hooks/use-homework-ocr.test.ts` (update the **two** tests the
  redesign invalidates: `:229` garble-escalation and `:470-499`
  "gate-reject on server OCR" — see T2 / R2)
- `apps/mobile/src/lib/analytics.ts` (reuse exported `HomeworkOcrGateSource`; no
  source change — import only)
- `apps/mobile/src/components/homework/problem-cards.ts` (add opt-in `skipFilter`)
- `apps/mobile/src/components/homework/problem-cards.test.ts`
- `apps/mobile/src/app/(app)/homework/camera.tsx` (trust server-sourced reads;
  add `ocr.source` to the OCR-sync `useEffect` deps at `:218`)
- `apps/mobile/src/app/(app)/homework/camera.test.tsx` (incl. retiring the dead
  `errorCode: 'NOT_HOMEWORK'` mocks at `:824-869` — see R3)
- `apps/mobile/src/i18n/locales/{en,de,es,ja,nb,pl,pt}.json` (remove the now-dead
  `homework.ocrError.NOT_HOMEWORK` key — see R3)
- `apps/mobile/src/components/session/use-session-streaming.test.ts` (boundary guard)

Out of scope (must not change behavior):
- `apps/api/src/services/ocr.ts`, `apps/api/src/routes/homework.ts` — server
  `/v1/ocr` already vision-backed; no server change needed.
- `apps/mobile/src/components/session/use-session-streaming.ts` source — only its
  test is touched (T5). If T5 reveals the invariant is *not* held, stop and
  escalate; do not silently patch the send pipeline under this plan.
- `isLikelyHomework` internals and all its non-OCR callers (session-summary).

## Design decisions (the code that IS the decision)

### D1 — `isCleanPrintedLocalRead` (new, OCR-local)

The single predicate that decides "trust ML Kit" vs "ask the LLM." Lives in the
new `ocr-read-quality.ts`, reusing pure primitives from `problem-cards`
(`hasAcceptableShape`, `averageLetterRunLength`) and the existing garble/cue
helpers (moved here from `use-homework-ocr.ts` — see T1):

```ts
// apps/mobile/src/hooks/ocr-read-quality.ts
import { hasAcceptableShape, averageLetterRunLength } from
  '../components/homework/problem-cards';

// Clean *printed* text reliably averages ≥ ~4 chars/word. Handwriting garble
// that ML Kit renders as 3–5-char pseudo-words sits below this. Conservative
// on purpose: when in doubt, prefer the LLM (the product decision).
//
// [R-MEDIUM-2] This threshold is fragile and must be backed by fixtures, not a
// single trace. The "clean" T1 fixture ("Solve for x: 3x + 7 = 22. Show your
// working.") computes to avg-run ≈ 3.57 — it clears 3.5 by 0.07. Clean printed
// prose heavy in short function words (a, is, of, x, to) can dip below 3.5 and
// be *falsely escalated*. False escalation is the SAFE direction (the server
// LLM reads it correctly) but costs a /v1/ocr round-trip — latency + a unit of
// the homework photo quota. T1 must therefore assert the boundary with ≥3
// printed-text rows (one short-word-heavy), and we accept 3.5 only if all pass;
// otherwise lower toward ~3.0.
export const CLEAN_PRINT_MIN_AVG_RUN = 3.5;

export function isCleanPrintedLocalRead(text: string): boolean {
  if (!text.trim()) return false;
  if (!hasAcceptableShape(text)) return false;        // ≥3 tokens, ≤120 words
  if (looksLikeOcrGarble(text)) return false;         // avg run < 2 (existing)
  if (averageLetterRunLength(text) < CLEAN_PRINT_MIN_AVG_RUN) return false;
  if (!hasStrongHomeworkCue(text)) return false;      // existing
  return true;
}
// hasStrongHomeworkCue, hasMathExpression, looksLikeOcrGarble, stripListMarkers
// move here verbatim from use-homework-ocr.ts (no logic change).
```

`shouldEscalateLocalOcr` and the dead `confidence < 0.75` branch are **deleted**.
The runOcr decision becomes: local read present **and**
`isCleanPrintedLocalRead(text)` → accept local fast-path; otherwise →
`tryServerFallback`.

### D2 — Trust the LLM read in the hook

`resolveSuccess` currently re-applies `isLikelyHomework` to *server* reads and
can emit `NON_HOMEWORK`. New rule: a **server**-sourced non-empty read is
accepted directly (no homework-shape rejection); only an empty/sub-token read
falls through to a terminal error. The `isLikelyHomework` gate still applies to
the **local** fast-path (that path is only taken when the read already looks
clean+homeworky, so it's a no-op there, but kept as a backstop).

**[R-MEDIUM-3] Explicit decision: server-read confidence is no longer a
reject signal.** Today `resolveSuccess` → `isLikelyHomework(text, confidence)`
honors `blockConfidence < 0.55` (`problem-cards.ts:92`), and the server payload
*does* return a real confidence (`use-homework-ocr.ts:369`) — unlike ML Kit,
this guard is **live** for server reads. `acceptServerRead` deliberately drops
it: "trust the LLM read end-to-end" means a low server-confidence read is
accepted, not rejected. This is the intended behavior change, and it is the
reason the existing test `use-homework-ocr.test.ts:470-499` (which feeds a
`confidence: 0.2` server read and asserts rejection) must flip to "accepted"
(see T2 / R2). Do not silently leave that test failing.

```ts
const acceptServerRead = useCallback((recognized: RecognizedTextResult): boolean => {
  if (!recognized.text || countMeaningfulTokens(recognized.text) < 1) return false;
  setText(recognized.text);
  setError(null);
  setStatus('done');
  // confidence intentionally omitted from the accept decision (R-MEDIUM-3)
  trackHomeworkOcrGateAccepted({ source: 'server', ...buildGateMetrics(recognized.text) });
  return true;
}, []);
```

Every `resolveSuccess(serverResult, 'server')` call site becomes
`acceptServerRead(serverResult)`. **[R-MEDIUM-1] Per-site terminal outcome when
`acceptServerRead` returns `false`** (i.e. the server read was empty / sub-token).
Note site `:593` is **unconditional** today (no `if (serverResult.text)` guard,
unlike the others) — the blanket "remove the `if (serverResult.text)
finishAsError(NON_HOMEWORK…)` branches" instruction does not describe it, so it
is called out explicitly:

| Call site | Context | `acceptServerRead` false → emit |
|---|---|---|
| `:534` | ML Kit native module unavailable | `ML_KIT_UNAVAILABLE` (unchanged) |
| `:565` | local garble escalated | `LOW_QUALITY` (unchanged) |
| `:592` | local present but rejected | `NO_TEXT` (was unconditional `NOT_HOMEWORK` at `:593`; empty read is "no text", not "not homework") |
| `:603` | no local text at all | `NO_TEXT` (unchanged) |
| `:622` | `recognizeText` threw | `LOW_QUALITY` (unchanged) |

After this change, **`NOT_HOMEWORK` is emitted from zero sites** — it must be
fully removed, not orphaned (see R3 / T7). `NO_TEXT` / `LOW_QUALITY` /
`ML_KIT_UNAVAILABLE` remain the terminal codes for empty/failed server reads.

### D3 — Expose read source so the camera can trust LLM reads

`UseHomeworkOcrResult` gains `source: HomeworkOcrGateSource | null`.
**[R-MEDIUM-4] Reuse the existing exported union** `HomeworkOcrGateSource`
(`apps/mobile/src/lib/analytics.ts:6` = `'local' | 'server'`) — do **not**
redefine `'local' | 'server'` inline. Set to `'server'` on `acceptServerRead`,
`'local'` on local `resolveSuccess`, `null` while idle/processing/error.

Ripple this field touches (all must land in the same PR or typecheck fails):
- The hook's return object (`use-homework-ocr.ts:660`) gains `source`.
- Every mocked-hook test object that constructs a `UseHomeworkOcrResult`
  (e.g. `camera.test.tsx:825, 850`, and any other `(useHomeworkOcr as jest.Mock)
  .mockReturnValue({…})`) must add `source` or TS will reject the literal.
- The camera OCR-sync `useEffect` deps array (`camera.tsx:218`) must add
  `ocr.source`, since D4 reads it.

### D4 — Camera trusts server-sourced reads past the split gate

`splitHomeworkProblems(rawText, blockConfidence?)` gains a third arg
`options?: { skipFilter?: boolean }` (default `false` → identical to today).
When `skipFilter`, it returns all split problems with `dropped: 0`. In
`camera.tsx:202-207`, when `ocr.source === 'server'` pass `{ skipFilter: true }`
so an LLM read of free-form/handwritten notes is never dropped into
`droppedProblems`.

## Tasks

- [ ] **T1: Extract reading-quality predicates into `ocr-read-quality.ts` and add `isCleanPrintedLocalRead`.**
  Move `stripListMarkers`, `hasMathExpression`, `hasStrongHomeworkCue`,
  `looksLikeOcrGarble` verbatim from `use-homework-ocr.ts` into the new
  `apps/mobile/src/hooks/ocr-read-quality.ts`; add `isCleanPrintedLocalRead`
  (D1) and `CLEAN_PRINT_MIN_AVG_RUN`. Re-export the moved helpers from the new
  module; update `use-homework-ocr.ts` to import them. Delete
  `shouldEscalateLocalOcr` and the dead confidence branch.
  — **done when:** new test `ocr-read-quality.test.ts` (see `## Tests` T1)
  passes: clean printed homework → `true`; handwriting-shaped garble (avg run
  ~3, accidental cue) → `false`; short/garble cases → `false`. `pnpm exec jest
  ocr-read-quality --no-coverage` green; `tsc --noEmit` clean.

- [ ] **T2: Make `runOcr` LLM-first and trust server reads in the hook.**
  In `use-homework-ocr.ts`: replace the `shouldEscalateLocalOcr(...)` branch
  with `isCleanPrintedLocalRead(recognized.text)` → accept local via
  `resolveSuccess(recognized, 'local')`; else `tryServerFallback`. Add
  `acceptServerRead` (D2); route all server outcomes through it; remove the
  `NON_HOMEWORK`-on-server branches. Add `source` to the hook result (D3).
  — **done when:** the two new hook tests in `## Tests` T2 pass (handwriting
  garble escalates + server read accepted; server free-form prose accepted, not
  `NON_HOMEWORK`), the existing fast-path test (clean printed → no server call)
  still passes, and the **two** existing tests the redesign invalidates are
  updated to mirror current behavior (per `feedback_never_loosen_tests_to_pass`
  — update to the real new behavior, do not weaken or delete the escalation
  assertion):
  - **[R2-a]** `use-homework-ocr.test.ts:229` "escalates ML Kit garble" — keep
    the escalation, now assert `status === 'done'` + `source === 'server'` after
    the server read (the LLM read is accepted, not re-rejected).
  - **[R2-b]** `use-homework-ocr.test.ts:470-499` "gate-reject on server OCR
    raises error phase" — this test locks the *old* `confidence < 0.55` server
    rejection (`isLikelyHomework`), which D2/R-MEDIUM-3 deliberately removes. Flip
    it: the `confidence: 0.2` server read `'Solve 2x + 5 = 13'` is now
    **accepted** → assert `status === 'done'`, `text` set,
    `trackHomeworkOcrGateAccepted({ source: 'server' })`; drop the
    `NON_HOMEWORK_ERROR_MESSAGE` and `trackHomeworkOcrGateRejected` assertions.
    If we instead want to *keep* a server-confidence floor, stop and escalate —
    that contradicts "trust the LLM end-to-end" and is a scope decision, not a
    silent test edit.

  `pnpm exec jest use-homework-ocr --no-coverage` green.

- [ ] **T3: Add opt-in `skipFilter` to `splitHomeworkProblems`.**
  Add `options?: { skipFilter?: boolean }` (D4); when set, return all problems,
  `dropped: 0`, `droppedProblems: []`. Default path byte-for-byte unchanged.
  — **done when:** new case in `problem-cards.test.ts` asserts a non-homework
  string returns 1 kept / 0 dropped with `{ skipFilter: true }` and still
  0 kept / 1 dropped without it. `pnpm exec jest problem-cards --no-coverage`
  green.

- [ ] **T4: Camera trusts server-sourced reads.**
  In `camera.tsx:202-207`, pass `{ skipFilter: ocr.source === 'server' }` to
  `splitHomeworkProblems(ocr.text, undefined, { skipFilter: ... })`.
  — **done when:** new `camera.test.tsx` case: OCR hook resolves with
  `source: 'server'` and free-form text → `draftProblems` non-empty,
  `droppedProblems` empty (the read reaches the result screen). `pnpm exec jest
  --findRelatedTests src/app/(app)/homework/camera.tsx --no-coverage` green.

- [ ] **T5: Lock the standard-chat boundary (regression guard).**
  **[R-HIGH-1] The image attachment is gated by `options?.attachImage` FIRST,
  then `effectiveMode === 'homework'`** (`use-session-streaming.ts:597-607`):

  ```ts
  options?.imageAttachment ??
  (options?.attachImage && effectiveMode === 'homework' &&
   imageBase64Ref.current && imageMimeTypeRef.current ? {…} : undefined)
  ```

  So `continueWithMessage('hi')` with **no options** short-circuits to
  `undefined` on `attachImage` *before* `effectiveMode` is ever read — a test
  written that way passes even with the `effectiveMode` guard deleted, locking
  nothing. The test MUST pass `{ attachImage: true }` so control reaches the
  `effectiveMode` check.

  Add a test to `use-session-streaming.test.ts`: with `effectiveMode` set to a
  **non-homework** mode, `imageBase64Ref`/`imageMimeTypeRef` populated, call
  `continueWithMessage('hi', { attachImage: true })`. Assert `streamMessage` is
  called with `imageBase64`/`imageMimeType` **undefined** and that the refs are
  **not** cleared (`:780-781` only fire when `imageAttachment` is truthy). This
  is the "break the link" guardrail for coupling #1.
  — **done when:** the test passes against current source (proving the invariant
  holds), **and** it goes red if `effectiveMode === 'homework'` is removed from
  `use-session-streaming.ts:600` (verify by temporary local edit — with
  `attachImage: true` + populated refs, dropping the guard now yields a truthy
  `imageAttachment`, so `streamMessage` receives the image and the refs clear:
  the assertions flip — then revert; red/green per
  `verification-before-completion`). A passing-but-can't-go-red test is a
  non-deliverable here. `pnpm exec jest use-session-streaming --no-coverage`
  green.

- [ ] **T6: Make the "type / record instead" affordance unmistakable on the viewfinder.**
  Keep the single entry point (it lands on the result screen that already offers
  both typing and voice — do not split into two buttons), but raise it from a
  translucent pill to a high-contrast, obviously-tappable control:
  - Solid high-contrast background instead of `bg-black/60`: use
    `bg-white` with `text-textPrimary` (semantic tokens, persona-unaware per repo
    rule — no hardcoded hex), keeping the `border-white/20` drop removed.
  - Show both modality cues so it reads as "type *or* record": a
    `create-outline` (pencil) icon **and** a `mic-outline` icon flanking the
    label, label unchanged (`homework.typeOrRecordInstead`).
  - Position it clearly clear of the capture-guide box and the capture row
    (keep `bottom: insets.bottom + 96`; verify on S10e it does not overlap the
    capture controls — if it does, lift to `+ 104`).
  No new hardcoded copy (reuse `homework.typeOrRecordInstead`); no new i18n key.
  — **done when:** (1) `camera.test.tsx` asserts `manual-entry-button` is present
  in the `viewfinder` phase and `fireEvent.press` transitions the screen to the
  manual-entry/result state (an editable `TextInput` is rendered); `pnpm exec
  jest --findRelatedTests src/app/(app)/homework/camera.tsx --no-coverage` green.
  (2) On-device check on the Galaxy S10e: the button is legible against a live
  camera view and tappable, and lands on the type/record screen — **and**
  confirm whether the currently-installed build already shows it (if not, the
  user's report is the stale-build cause, which a rebuild/OTA resolves).

- [ ] **R3: Remove the now-dead `NOT_HOMEWORK` artifacts (was T7's false premise).**
  **[R-HIGH-3] The original T7 claimed `homework.ocrError.NOT_HOMEWORK` "is still
  emitted on the local-rejection path." It is not.** All five emit sites
  (`use-homework-ocr.ts:536, 567, 593, 605, 624`) are server-fallback branches,
  and D2 removes every one. After D2, `NOT_HOMEWORK` is emitted from **zero**
  locations; the i18n key only survives the orphan checker because it is reached
  via the dynamic `t(\`homework.ocrError.${ocr.errorCode}\`)` at `camera.tsx:213`
  (a kept pattern), *not* because anything emits it. Leaving it is exactly the
  "orphaned types create false confidence / unreachable fallback branches inflate
  coverage" failure in CLAUDE.md → "Clean up all artifacts when removing a
  feature." Remove, don't orphan:
  - `OcrErrorCode` union member `'NOT_HOMEWORK'` (`use-homework-ocr.ts:38`).
  - `NON_HOMEWORK_ERROR_MESSAGE` const (`:99-100`) and its test import
    (`use-homework-ocr.test.ts:3`).
  - The i18n key `homework.ocrError.NOT_HOMEWORK` in **all 7 locales**
    (`en.json:1481`, `de/es/ja/nb` `:1387`, `pl/pt` `:1412`) and its
    `source-baseline.json` entries (regenerate the baseline, do not hand-edit
    hashes).
  - The two camera tests that mock it (`camera.test.tsx:824-847`, `:849-869`):
    these mock `errorCode: 'NOT_HOMEWORK'` and assert the manual-fallback render.
    With the union member gone they become TS-invalid. Repoint them to a code
    the hook can still emit on first failure (`LOW_QUALITY` or `NO_TEXT`) and
    update the asserted copy to that key's string — the *render path* (manual
    fallback after 1 failure) is what they actually exercise, and it survives.
  - Grep sweep to prove zero references remain:
    `rg -n "NOT_HOMEWORK|NON_HOMEWORK" apps/mobile/src` returns nothing after.
  — **done when:** the grep sweep is empty, the i18n key removal is reflected in
  `en.json` + all locale files + regenerated `source-baseline.json`, and
  `tsc --noEmit` is clean (proves the union member is fully unwired).

- [ ] **T7: Full verification + i18n.**
  Run the orphan/keep checkers after R3 (the dynamic `homework.ocrError.*`
  dispatch means a stale KEEP_PATTERN or baseline entry for the removed key would
  fail `check-i18n-keep-rot.ts`): `pnpm exec tsx
  scripts/check-i18n-orphan-keys.ts` **and** verify no `i18n-keep.ts`
  KEEP_PATTERN still cites the removed key.
  — **done when:** `pnpm exec jest` (mobile, related suites) green, `cd
  apps/mobile && pnpm exec tsc --noEmit` clean, `pnpm exec nx lint mobile` clean,
  i18n orphan + keep-rot checks clean. No internal `jest.mock('./…')`/`'../…'`
  added (GC1); ML Kit (`TextRecognition`) and `fetch`/`/v1/ocr` remain
  external-boundary mocks (allowed).

## Tests

### T1 — `apps/mobile/src/hooks/ocr-read-quality.test.ts`
```ts
import { isCleanPrintedLocalRead } from './ocr-read-quality';

it('trusts clean printed homework', () => {
  expect(
    isCleanPrintedLocalRead('Solve for x: 3x + 7 = 22. Show your working.'),
  ).toBe(true);
});

it('rejects handwriting-shaped garble with an accidental cue', () => {
  // avg letter-run ~3, contains "how" (a cue) and a digit — defeats the OLD
  // heuristics, must be rejected (→ escalate to LLM) under the new predicate.
  expect(isCleanPrintedLocalRead('how Rad meol 5 bs Homo mino')).toBe(false);
});

it('rejects short / token-poor reads', () => {
  expect(isCleanPrintedLocalRead('x = 5')).toBe(false);
});
```

### T2 — added to `apps/mobile/src/hooks/use-homework-ocr.test.ts`
```ts
it('escalates handwriting garble to the server and accepts the LLM read', async () => {
  mockRecognize.mockResolvedValue({ text: 'how Rad meol 5 bs Homo mino' });
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ text: 'Translate: "Jeg liker å lære."', confidence: 0.9 }),
      { status: 200 }),
  );
  const { result } = renderHook(() => useHomeworkOcr());
  await act(async () => { await result.current.process('file:///note.jpg'); });
  expect(mockFetch).toHaveBeenCalledTimes(1);              // LLM consulted
  expect(result.current.status).toBe('done');
  expect(result.current.text).toBe('Translate: "Jeg liker å lære."');
  expect(result.current.source).toBe('server');
});

it('accepts a server read of free-form notes (no NON_HOMEWORK rejection)', async () => {
  mockRecognize.mockResolvedValue({ text: '' });           // local produced nothing
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ text: 'My notes on photosynthesis and chlorophyll.', confidence: 0.9 }),
      { status: 200 }),
  );
  const { result } = renderHook(() => useHomeworkOcr());
  await act(async () => { await result.current.process('file:///note.jpg'); });
  expect(result.current.status).toBe('done');
  expect(result.current.errorCode).toBeUndefined();
  expect(result.current.text).toContain('photosynthesis');
});
```
(Update **both** existing tests the redesign invalidates — see T2 / R2:
(a) `use-homework-ocr.test.ts:229` "escalates ML Kit garble" → assert
`status === 'done'` + `source === 'server'` after the server read; keep the
escalation. (b) `use-homework-ocr.test.ts:470-499` "gate-reject on server OCR"
→ flip reject to accept (`status === 'done'`, `trackHomeworkOcrGateAccepted`,
`source: 'server'`); drop the `NON_HOMEWORK`/`trackHomeworkOcrGateRejected`
assertions. Do not weaken or delete the escalation assertion in (a).)

### T3 / T4 / T5 — assertions are stated inline in the task `done when:` lines.

## Self-review

- **Spec coverage:** LLM reads handwriting → T2 (escalation) + T2 (accept) +
  T4 (camera trusts it). No regression to chat → T5. "Break the link" →
  predicates moved out of shared gate (T1) + LLM read bypasses both gates
  (T2, T4) + boundary guard (T5). Dead-artifact cleanup → R3.
- **Deferred decisions:** threshold set (`CLEAN_PRINT_MIN_AVG_RUN = 3.5`, D1) —
  but fixture-gated, not final (R-MEDIUM-2); server-read accept rule fixed (≥1
  meaningful token, confidence intentionally ignored — D2 / R-MEDIUM-3);
  `skipFilter` default `false` (D4) — no behavior change for existing callers.
- **Name consistency:** `isCleanPrintedLocalRead`, `acceptServerRead`,
  `source: HomeworkOcrGateSource | null` (reused, not redefined — R-MEDIUM-4),
  `skipFilter` used identically across D1–D4 and T1–T6.
- **Behavior-change tests flipped (not weakened):** `use-homework-ocr.test.ts:229`
  and `:470-499` (R2); `camera.test.tsx:824-869` repointed off the removed
  `NOT_HOMEWORK` code (R3). Every flip mirrors the new real behavior per
  `feedback_never_loosen_tests_to_pass`.

## Adversarial review log (2026-05-31)

Findings raised against the v1 draft and resolved inline above. Severity in
brackets; each was verified against current source before editing.

- **[HIGH-1] → T5 rewritten.** The boundary guard's red/green was inert:
  `imageAttachment` is gated by `options?.attachImage` *before*
  `effectiveMode === 'homework'` (`use-session-streaming.ts:597-607`), so
  `continueWithMessage('hi')` (no options) never reaches the guard. T5 now passes
  `{ attachImage: true }` so deleting the `effectiveMode` guard actually flips it
  red.
- **[HIGH-2] → T2 done-when + R2.** D2 makes `acceptServerRead` accept any
  non-empty server read, which contradicts the existing
  `use-homework-ocr.test.ts:470-499` (asserts a `confidence: 0.2` server read is
  *rejected*). The original plan only updated `:229`; `jest use-homework-ocr`
  would have stayed red. Both tests are now explicitly flipped.
- **[HIGH-3] → R3 (replaces T7's false premise).** `NOT_HOMEWORK` has **no**
  local-rejection emit path; all five emit sites are server branches removed by
  D2. The union member, const, and 7-locale i18n key are now removed, and the two
  camera tests mocking the dead code are repointed.
- **[MEDIUM-1] → D2 per-site table.** Site `:593` is unconditional; an empty
  server read there should be `NO_TEXT`, not `NOT_HOMEWORK`. Per-site terminal
  outcomes are now tabulated.
- **[MEDIUM-2] → D1 annotation.** `3.5` is fragile (the "clean" T1 fixture
  computes to ≈3.57); T1 must prove the boundary with ≥3 printed-text rows.
- **[MEDIUM-3] → D2 note.** Server confidence (a *live* signal, unlike ML Kit's)
  is now deliberately ignored on accept; stated explicitly so the test flip in R2
  reads as intentional.
- **[MEDIUM-4] → D3 + Scope.** Reuse exported `HomeworkOcrGateSource`; the new
  `source` field ripples to the hook return, mocked-hook test objects, and the
  `camera.tsx:218` `useEffect` deps.
- **Acknowledged correct (no change):** root-cause analysis (ML Kit type has no
  confidence anywhere — `index.ts:22-62`; both confidence guards are genuinely
  dead), coupling map, and `skipFilter` default-`false` backward-compat.
