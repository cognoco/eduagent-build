# Plan: Homework OCR Content-Quality Guards (v3)

**Finding ID:** `UX-HW-OCR-JUNK`
**Branch:** `proxy-parent-fix` (current) — create feature branch on kickoff
**Date:** 2026-04-23
**Scope:** mobile-only for v1. A v1.1 LLM classifier is noted as a deferred API+mobile follow-up, *not* mobile-only.

---

## Context

When a user photographs non-homework content (e.g., a laptop screen with dev notes), the current pipeline OCRs the text faithfully. `splitHomeworkProblems` in `problem-cards.ts` then groups the result. For captures without numbered markers the splitter's early-exit (`groups.length <= 1`) returns the *entire* OCR string as a **single very long card** — which is then rendered to a child under the heading "Here are the problems I found." This is the concrete failure mode.

The fix hardens the mobile pipeline without changing the camera UI shape or the API contract. The root issue is **semantic** (this photo isn't homework). Shape heuristics are a proxy for that signal and must be measured, not assumed: v1 ships heuristics **plus ML Kit block-confidence** plus **telemetry on every gate decision**, so v1.1 can make an evidence-based call about whether to add an LLM classifier.

## Non-Goals

- Changing the camera UI or capture flow.
- Changing the API contract or server-side code in v1.
- Blocking or locking homework topics (per `feedback_never_lock_topics.md` and `feedback_human_override_everywhere.md`).
- Supporting non-Latin scripts beyond what `\p{L}+` already covers.
- Shipping an LLM classifier in v1. (Deferred to v1.1 — see "Follow-up work" below.)

## Critical Findings Folded Into v3

This plan is v3, revised from v2 after a second adversarial review on 2026-04-23. Each finding below maps to a section of the plan:

| ID | Finding | Where addressed |
|---|---|---|
| C1 | v2 calibrated thresholds before the fixture was captured | S2 is now a hard gate — no thresholds are final until S2 runs |
| C2 | Splitter early-exit means non-homework typically produces *one giant card*, not fragments | Word upper bound is now the dominant signal; tests added for single-giant-card path |
| C3 | Layer B placement was hand-wavy; hook had two `setStatus('done')` sites | Single shared helper `isLikelyHomework`; hook restructured so there is exactly one success and one failure path |
| C4 | No telemetry = no feedback loop | Mandatory mobile analytics events on every gate decision |
| C5 | Layer A silently dropped fragment cards with no user recovery | Replaced silent drop with visible "dropped fragments" chip |
| I1 | `x`/`X` in `OPERATOR_RE` double-counted against `\p{L}+` | Operator set narrowed; single-pass counting |
| I2 | "Meaningful tokens" counted non-word letter-runs (func, var, etc.) | Token bar supplemented by average-token-length gate |
| I3 | Duplicate empty-result guard in `camera.tsx` was dead code or distrust | Removed; trust Layer B |
| I4 | "…type it in" copy promised an affordance we hadn't verified | S1 now verifies the manual-entry path from error phase |
| I5 | Commit 2 shipped dead code for a window | Commit strategy restructured; each commit is testable in isolation |
| N1 | Server fallback was invoked even when local text existed but failed the gate | Gate short-circuits to error when local text is non-empty and gate-rejected — saves 15s and an API call |
| N2 | Rollback claimed OTA tunability without acknowledging it's still a release | Rollback section rewritten honestly |
| N3 | "Mobile-only" contradicted v1.1 LLM classifier | Scope now explicitly says v1 is mobile-only; v1.1 is cross-stack |
| N4 | No failure mode for incidental text (signs, posters, textbook cover) | Added to Failure Modes; acknowledged as out-of-reach for heuristics |
| N5 | S3 was "optional" — heuristics tuned blind | S3 is now required; confidence is the primary signal where available |

---

## Pre-Implementation Spikes (all required — block coding)

### S1 — Read the splitter, the error phase, and verify the manual-entry affordance

- Read `apps/mobile/src/components/homework/problem-cards.ts` end-to-end; record the early-exit behaviour at `:65-72` (`groups.length <= 1` returns whole text as one card) in the design section.
- Read `camera.tsx` around the `OCR_ERROR` dispatch (`:120-127`) and the error phase UI. **Confirm** that the error phase exposes a manual-entry / "type it in" path. If it does not, the error copy in this plan must be rewritten, *or* the manual-entry affordance must be added in this same change.
- Read `camera.tsx:825-827` and record that the heading "Here are the problems I found:" comes from JSX, not the splitter — so the fix lives in the data layer, not the string.

**Output:** one paragraph added to the Design section below, plus one-line confirmation of the manual-entry path.

### S2 — Capture the actual OCR fixture (required)

- Reproduce the reported capture (or obtain the original) and run the current pipeline to get the raw OCR string.
- Save as an inline string constant in `problem-cards.test.ts` (per CLAUDE.md co-location rule — no `__tests__/` or `__fixtures__/` folders).
- Also capture 2–3 additional real-user captures if available (good homework, margin-noise homework, blank photo).

**Output:** fixtures committed before any threshold in this plan is treated as final. Thresholds may be tuned after fixtures land.

### S3 — Measure ML Kit block-level confidence (required)

- Add transient logging to `recognizeText` in `use-homework-ocr.ts` to print block-level confidence scores.
- Capture distributions on at least 5 good and 5 bad (non-homework) captures.
- **Output:** a two-line finding in this plan:
  - "Mean/median block confidence on homework: X"
  - "Mean/median block confidence on non-homework: Y"
  - Decision: if Y < 0.6 and X > 0.85 (or similar clear separation), confidence becomes the *primary* gate; heuristics become noise-removal only.

Transient logging must be reverted or gated behind `__DEV__` before merge.

---

## Files Touched

| File | Change |
|---|---|
| `apps/mobile/src/components/homework/problem-cards.ts` | Add `countMeaningfulTokens`, `hasAcceptableShape`, `isLikelyHomework`, `filterHomeworkProblems`; wire filter into `splitHomeworkProblems` |
| `apps/mobile/src/components/homework/problem-cards.test.ts` | Unit tests, including the S2 fixture |
| `apps/mobile/src/hooks/use-homework-ocr.ts` | Restructure to a single gate on final text using `isLikelyHomework`; N1 short-circuit; analytics events |
| `apps/mobile/src/hooks/use-homework-ocr.test.ts` | Tests for gate + fallback interaction + short-circuit |
| `apps/mobile/src/app/(app)/homework/camera.tsx` | Render "dropped fragments" chip when `filterHomeworkProblems` discards cards; remove the v2 defensive empty-result guard (trust the hook) |
| `apps/mobile/src/app/(app)/homework/camera.test.tsx` | Tests for dropped-chip rendering and error routing |
| `apps/mobile/src/lib/analytics.ts` (or equivalent) | Three new event helpers (see Telemetry below) — no schema work |

**Dropped from v1:** the ">15 cards" warning banner (v1 review finding D4); the duplicate defensive guard in `camera.tsx` (v2 review finding I3).

---

## Design

### One decision function, called in the splitter

v2 described two layers with distinct placement. v3 collapses decision logic into **one pure helper** in `problem-cards.ts`:

```ts
// Returns true if the text looks like homework shape AND the block-confidence
// signal (if provided) doesn't veto it.
export function isLikelyHomework(
  text: string,
  blockConfidence?: number
): boolean;
```

`splitHomeworkProblems` calls `filterHomeworkProblems(problems, blockConfidence?)` at the end of its pipeline; the hook passes the ML Kit block confidence through when available. `camera.tsx` consumes `ocr.status === 'done'` exactly as today — no duplicate checks.

### Tokenization — corrected

```ts
// Letters, digits, and math operators — but x/X are NOT operators (they overlap
// with \p{L}+ and double-count). Single pass, non-overlapping.
const OPERATOR_RE = /[+\-−×*·÷/=<>≤≥±²³]/g;

export function countMeaningfulTokens(text: string): number {
  const letters = text.match(/\p{L}+/gu) ?? [];
  const digits = text.match(/\d+/g) ?? [];
  const ops = text.match(OPERATOR_RE) ?? [];
  return letters.length + digits.length + ops.length;
}

// Average letter-run length — dev-notes junk like "func var const" averages
// 3–5 chars; natural language and homework prose averages higher with more variance.
// This is a secondary signal, not a hard gate.
function averageLetterRunLength(text: string): number {
  const runs = text.match(/\p{L}+/gu) ?? [];
  if (runs.length === 0) return 0;
  return runs.reduce((acc, r) => acc + r.length, 0) / runs.length;
}
```

### Shape helper

```ts
export function hasAcceptableShape(text: string): boolean {
  const tokens = countMeaningfulTokens(text);
  const words = text.trim().split(/\s+/).filter(Boolean).length;

  // Lower bound: 3 meaningful tokens (pure-math "2x+3=7" scores ~5).
  // Upper bound: 120 words (raised from v2's 80) after S2 calibration;
  // long essay/comprehension prompts are legitimate and regularly exceed 80.
  // A single-giant-card non-homework dump is usually >>120, so this still bites.
  if (tokens < 3) return false;
  if (words > 120) return false;
  return true;
}
```

The 120 threshold is **provisional** — the final number is set after S2 fixtures confirm no legitimate homework capture exceeds it.

### Primary gate: `isLikelyHomework`

```ts
// v1 decision order (subject to S3 outcome):
// 1. If blockConfidence provided AND < 0.55 -> reject (S3 primary signal).
// 2. If !hasAcceptableShape(text) -> reject.
// 3. If averageLetterRunLength(text) < 2.5 -> reject (catches noisy OCR dumps).
// 4. Otherwise -> accept.
export function isLikelyHomework(text: string, blockConfidence?: number): boolean;
```

If S3 shows clean separation, step 1 carries most of the weight and 2–3 become defensive. If S3 shows no separation, the decision is inverted: block-confidence is *logged* for telemetry but not gated on, and the heuristics carry the decision. Either way, the test suite verifies the decision function, not any individual signal.

### Hook restructuring — single success/failure flow

Today `use-homework-ocr.ts` has:
- Local success → `setStatus('done')` at `:191`
- Server fallback success → `setStatus('done')` inside `tryServerFallback` at `:136`

v3 replaces both with a shared `resolveSuccess(text, confidence?)` that runs the gate:

```ts
function resolveSuccess(text: string, confidence?: number) {
  if (isLikelyHomework(text, confidence)) {
    setText(text);
    setStatus('done');
    emitAnalytics('homework_ocr_gate_accepted', { source: '<local|server>', tokens, words, confidence });
    return true;
  }
  emitAnalytics('homework_ocr_gate_rejected', { source: '<local|server>', tokens, words, confidence });
  return false;
}
```

The control flow becomes:

1. Try local OCR.
   - Returns text → call `resolveSuccess`. If accepted: done.
   - Returns text but rejected → **short-circuit to error phase** (N1). The server fallback OCRs the same image and will produce the same text; waiting 15s for an identical rejection is pure cost. Emit `homework_ocr_gate_shortcircuit`.
   - Returns null → try server fallback.
2. Server fallback path.
   - Returns text → call `resolveSuccess`. If accepted: done.
   - Returns text but rejected → error phase.
   - Returns null or throws → error phase.

All error-phase transitions use the same message (see below).

### Layer A with visible recovery (C5 fix)

When `filterHomeworkProblems` discards cards but keeps at least one, `splitHomeworkProblems` returns a tuple:

```ts
export interface SplitResult {
  problems: HomeworkProblem[];
  dropped: number;
}

export function splitHomeworkProblems(rawText: string): SplitResult;
```

`camera.tsx:123` updates to `setDraftProblems(result.problems); setDroppedCount(result.dropped);` and renders a dismissible chip under the heading:

> *"We skipped N unclear fragments. Tap to add them back."*

Tapping the chip appends the raw dropped groups as editable cards so the user can salvage them. This eliminates the silent-drop violation of `feedback_human_override_everywhere.md`.

### Empty-result — delegated entirely to the hook

The v2 defensive guard in `camera.tsx` is removed. If the hook's `resolveSuccess` returns false, the hook moves to `status === 'error'` with a dedicated message. The camera component has nothing to re-check. One source of truth.

### Error copy

> *"We couldn't find a clear homework problem in this photo. Try again or type it in."*

S1 must confirm the error phase exposes a manual-entry affordance — if it doesn't, either add one in this PR or change the copy to match the real affordances.

---

## Telemetry (required — not deferrable)

Per `feedback_fix_verification_rules.md` ("silent recovery without escalation is banned"), three events must exist before merge:

| Event | Properties | Fired when |
|---|---|---|
| `homework_ocr_gate_accepted` | source (`local`/`server`), tokens, words, confidence | Gate accepts text |
| `homework_ocr_gate_rejected` | source, tokens, words, confidence, dropped_count | Gate rejects final text |
| `homework_ocr_gate_shortcircuit` | tokens, words, confidence | Local text rejected, server fallback skipped |

These must be wired through whatever analytics mechanism the app already uses (check `apps/mobile/src/lib/` during S1 — do not add a new SDK). If there is no mobile analytics infrastructure, **stop and surface that to the reviewer** — a blind ship is worse than a delayed ship.

Post-ship, the first week's data answers: is the gate biting at all? Are we rejecting legitimate homework?

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Non-homework photo (screen, poster, sign) | OCR returns text; gate rejects via confidence or shape | Error phase + new message | Retake or type it in |
| Non-homework with incidental text (≥3 tokens, ≤120 words, high confidence) | E.g., a textbook *cover* with title and subtitle — **cannot** be caught by heuristics alone | Cards shown (false positive) | User taps Remove on each or Back to retake. Captured by telemetry for v1.1 calibration. |
| Partial OCR noise on real homework | Margin noise alongside valid cards | Valid cards + chip "We skipped N unclear fragments. Tap to add them back." | User taps chip if any dropped card should be kept |
| Pure-math worksheet | `2x+3=7`, `8×7=?`, etc. | All cards pass | — |
| Long essay prompt (50–120 words) | Real English/history prompt | Card passes (upper bound is 120 per S2 calibration) | — |
| Prompt > 120 words | Exceptionally long compound question | Card dropped via gate, error phase if single-card | Retake closer, or type it in |
| Single giant card (no numbered markers) | Laptop screen dev notes OCR'd as one blob | Gate rejects (far > 120 words and/or low confidence) | Error phase |
| ML Kit returns null | Bad lighting, skew, glare | Server fallback runs; gated again on server output | Error phase if server also empty or gate-rejected |
| Local OCR returns text but gate rejects | Non-homework photo with legible text | Short-circuit to error (no server call) | Error phase, retake or type |
| Both paths fail | Both empty or both gate-rejected | Error phase | Retake or type |
| OCR timeout > 20s | ML Kit timeout | Existing error phase (unchanged) | Existing retry + manual entry |
| Blank photo | OCR returns null, server returns null | Error phase | Retake or type |

## Verification

Per `~/.claude/CLAUDE.md` fix-verification rules, every fix has a Verified-By entry.

| Fix | Verified by |
|---|---|
| Tokenizer counts letters + digits + operators without `x`/`X` double-count | `test: problem-cards.test.ts:"countMeaningfulTokens does not double-count x or X"` |
| Shape helper accepts pure-symbol math | `test: problem-cards.test.ts:"accepts pure-symbol math like 2x+3=7"` |
| Shape helper accepts word problems up to 120 words | `test: problem-cards.test.ts:"accepts word problems up to 120 words"` |
| Shape helper drops cards > 120 words | `test: problem-cards.test.ts:"drops cards over 120 words"` |
| Shape helper drops fragments with <3 meaningful tokens | `test: problem-cards.test.ts:"drops fragments under the token floor"` |
| Average letter-run length defends against dev-notes junk | `test: problem-cards.test.ts:"drops dev-notes style text with low avg letter-run length"` |
| `isLikelyHomework` rejects low-confidence text | `test: problem-cards.test.ts:"isLikelyHomework rejects text with blockConfidence < 0.55"` |
| Reported screenshot OCR (single giant card) is rejected end-to-end | `test: problem-cards.test.ts:"S2 fixture is rejected by isLikelyHomework"` |
| Real homework OCR passes through unchanged | `test: problem-cards.test.ts:"preserves all valid problems from typical homework OCR"` |
| Dropped fragments surface in `SplitResult.dropped` (no silent drop) | `test: problem-cards.test.ts:"splitHomeworkProblems returns dropped count"` |
| Hook short-circuits when local text is gate-rejected | `test: use-homework-ocr.test.ts:"gate-reject on local OCR does NOT invoke server fallback"` |
| Hook gates server-fallback output | `test: use-homework-ocr.test.ts:"gate-reject on server OCR raises error phase"` |
| Good OCR unaffected | `test: use-homework-ocr.test.ts:"valid OCR text reaches status=done unchanged"` |
| Analytics event fires on every gate decision | `test: use-homework-ocr.test.ts:"emits homework_ocr_gate_accepted on success"` and `"...rejected on failure"` and `"...shortcircuit on local-reject"` |
| Dropped-fragments chip renders and re-adds cards | `test: camera.test.tsx:"renders dropped-fragments chip and re-adds on tap"` |
| **Break test (C5 spirit):** if gate logic is reverted, S2 fixture renders to child | `test: problem-cards.test.ts:"guardrails: S2 fixture without gate would produce visible cards"` — documents the regression surface |
| S1 verified the manual-entry path from error phase | `manual: noted in plan after S1 ("type it in" is reachable from error phase via <affordance>)` |

## Commands Before Commit

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/components/homework/problem-cards.ts \
  src/hooks/use-homework-ocr.ts \
  src/app/\(app\)/homework/camera.tsx \
  --no-coverage

pnpm exec nx lint mobile
cd apps/mobile && pnpm exec tsc --noEmit
```

## Commit Strategy

Each commit is independently testable; no commit ships dead code.

1. **Commit 1 — pure helpers + tests.** `countMeaningfulTokens`, `hasAcceptableShape`, `isLikelyHomework`, `averageLetterRunLength` added as **exports** with unit tests. Splitter unchanged. S2 fixture test asserts `isLikelyHomework(fixture) === false`.
2. **Commit 2 — splitter returns `SplitResult`; camera renders chip.** `splitHomeworkProblems` changes shape; `camera.tsx:123` consumer updates; dropped-fragments chip lands. Gate not yet integrated into the hook. Tests cover the chip path.
3. **Commit 3 — hook gate + analytics + short-circuit.** `use-homework-ocr.ts` restructures to call `isLikelyHomework` once; N1 short-circuit enabled; analytics events wired.

All commit messages carry the finding ID:

```
fix(mobile): isLikelyHomework gate + dropped-fragments chip [UX-HW-OCR-JUNK]
```

## Rollback

All three commits revert cleanly with `git revert` — no schema migration, no API contract change, no device-state persistence affected. If the gate proves too aggressive in production:

- **Not** "server-side tunable." Thresholds are mobile constants; changing them requires either an OTA update (still a release, per `feedback_no_ota_unless_asked.md` an OTA requires explicit user approval) or a full native build. There is **no hot-fix without a release**.
- Telemetry events are the guard: if `homework_ocr_gate_rejected` fires on what turns out to be legitimate homework (caught via user complaints cross-referenced with capture IDs), the team has a concrete signal to tune against rather than a guess.

## Decision Points (Author Confirm Before Coding)

1. **Upper bound 120 words.** Provisional — final value set by S2 fixture review. Confirm the process, not the number.
2. **Block-confidence threshold 0.55.** Provisional — final value set by S3 output. Confirm the process.
3. **Error message copy.** *"We couldn't find a clear homework problem in this photo. Try again or type it in."* Contingent on S1 confirming the affordance exists. Confirm.
4. **Dropped-fragments chip copy.** *"We skipped N unclear fragments. Tap to add them back."* Confirm.
5. **Analytics SDK.** S1 must identify which SDK the app already uses. Confirm — if none, this plan pauses.
6. **v1.1 LLM classifier.** Cross-stack (API + mobile). Confirm it is **out of v1 scope** and gated on telemetry evidence from v1.

## Follow-up Work (v1.1 — not in this plan)

- Cross-stack (API + mobile). Adds an LLM classifier call: "Is the following OCR text plausibly homework or study material for a student aged 11–17?" routed through `services/llm/router.ts` with the structured envelope (per CLAUDE.md LLM rules).
- Triggered when v1 telemetry shows heuristics-plus-confidence is insufficient — specifically, if week-1 data shows >X% of `homework_ocr_gate_accepted` events correlate with user-reported non-homework captures. X set when the data arrives.

---

## Review Findings Incorporated

This plan is v3, revised from v2 after a second adversarial review on 2026-04-23. See the "Critical Findings Folded Into v3" table near the top — every finding is tracked with a one-line disposition and a pointer to the section that implements it. Earlier v1→v2 findings (B1, B2, B3, D1–D5, Strategic) remain resolved as in v2 and are not re-litigated here.
