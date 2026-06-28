---
title: RR-1 + RR-13 — Warm Review-Callback Opener (FEEL unit) — Implementation Spec
date: 2026-06-27
profile: code
status: draft
spec: docs/specs/2026-06-03-review-relearn-findings-and-high-impact-todos.md (RR-1, RR-13 minimal thread)
relates:
  - docs/specs/2026-05-27-warm-chat-greeting.md (templated mobile greeting — RR-1 is the LLM upgrade of the same instinct; unshipped)
  - docs/specs/2026-06-27-journal-redesign.md (orthogonal — no shared files)
  - memory: project_review_is_mentoring_backbone.md (north star)
  - memory: project_llm_marker_antipattern.md, project_eval_llm_harness.md
---

# RR-1 + RR-13 — Warm Review-Callback Opener

**Goal:** When a learner returns to a topic for review, the mentor opens with a warm, outcome-aware memory callback ("Last time you had photosynthesis down — let's see if it stuck") instead of the current cold seam ("this is a review check, not a fresh lesson") — making review feel like one continuous relationship.

**Approach:** Backend-only. Build a small server-side read (`reviewCallback` — RR-13 minimal thread) that derives the learner's last outcome for the topic from the SM-2 retention card, and rewrite the **existing** REVIEW opener block in `exchange-prompts.ts:854-870` (RR-1) to branch warm, honest copy on that outcome. Ship behind a Doppler flag, default off. No mobile change, no SM-2 semantic change, no new session pipeline.

---

## Background — verified current state (2026-06-27)

- The mobile review CTA hard-routes `mode:'review'` (`apps/mobile/src/app/(app)/topic/[topicId].tsx:474-487`), which becomes `effectiveMode='review'` on session metadata (`apps/api/src/services/session/session-exchange.ts:2791-2792`) and reaches the prompt as `context.effectiveMode` (`exchange-prompts.ts:528-529`).
- The **REVIEW opener already exists** at `exchange-prompts.ts:854-870`, gated `isReviewMode && isFirstLearnerVisibleTurn && safeTopicTitle && !isLanguageMode`. Its first line is the seam the north star forbids: *"TRANSITION PHRASE: Begin with a brief one-line handoff that tells the learner this is a review check, not a fresh lesson."*
- `ExchangeContext` already carries `retentionStatus` (band/ease/days) but **no last-outcome / last-quote callback material** (`exchange-types.ts:122-127`).
- `getTopicRetention` (`retention-data.ts:602`) reads a topic's card via `createScopedRepository`; `rowToRetentionState` (`:109-123`) exposes `consecutiveSuccesses`, `failureCount`, `xpStatus`, `nextReviewAt`, `lastReviewedAt`; `computeDaysSinceLastReview` (`:80-89`) and `DAY_MS` are reusable.
- The **CALIBRATION QUESTION** channel (`exchange-prompts.ts:863`) already hands the UI-offered topic to the model so "yes, continue" lands on the right topic — RR-1 keeps it.
- **No A/B harness exists** in the API — feature flags only (per integration map). Flag pattern: `config.ts:161` (`CHALLENGE_ROUND_RUNTIME_ENABLED: z.enum(['true','false']).default('false')`) + helper `config.ts:297-301`.
- The warm-chat-greeting templated returning-session opener pool **never shipped** (the returning empty-state is still the static `en.json:759` "Your conversation will appear here."). It is a separate mobile surface — out of scope here.

## Design decisions (calls made; 3 deviate from the findings-doc first-actions)

1. **Keep `mode:'review'` routing; rewrite the opener.** The findings-doc RR-1 first-action says "stop hard-routing `mode:'review'`." **Superseded:** `effectiveMode='review'` is exactly the trigger we now use to fire the warm callback. The forbidden seam is the *felt* "now we switch to review" copy, not the internal flag. Repurposing the existing block is backend-only and far lower-risk than session-pipeline surgery.
2. **Flag, not A/B.** Findings-doc says "A/B against the current button." No A/B harness exists. Ship behind `REVIEW_CALLBACK_OPENER_ENABLED` (default off); compare by environment + the eval harness. Flag gates **population** of `context.reviewCallback`; the prompt simply checks its presence.
3. **Quote source.** Findings-doc cites `evaluation.ts:82-126` (`validateEvaluationEventIds`) — that is challenge-round-specific and **dark**. The minimal thread sources the last learner message from `session_events` (`eventType='user_message'`), honesty-gated to the `cracked` branch only, and the prompt uses it as **private grounding, never quoted verbatim** (CH-1 — a last message may be a question, not the winning answer; correctness is asserted only from `outcome`).
4. **Outcome is authoritative from the SM-2 card, not the raw quote** (CH-1 outcome guard). Five branches: `cracked | wobbled | first_time | long_gap | unknown`; `unknown` is the safe neutral default.

---

## Scope

**In scope:**
- `apps/api/src/services/review-callback.ts` (new) — `ReviewOutcome`, `ReviewCallback`, `deriveReviewOutcome`, `getReviewCallbackContext`.
- `apps/api/src/services/exchange-types.ts` — add `reviewCallback?: ReviewCallback` to `ExchangeContext`.
- `apps/api/src/services/exchange-prompts.ts:854-870` — branch the REVIEW block on `context.reviewCallback`.
- `apps/api/src/config.ts` — `REVIEW_CALLBACK_OPENER_ENABLED` flag + `isReviewCallbackOpenerEnabled` helper.
- `apps/api/src/services/session/session-exchange.ts` (~2737-2792 context assembly) — populate `context.reviewCallback` when flag on + review mode + first turn.
- `apps/api/src/routes/sessions.ts` exchange-route boundary — thread the flag from `c.env`.
- `apps/api/eval-llm/` — a review-callback flow + snapshot.

**Out of scope (must not change):**
- Mobile (`topic/[topicId].tsx` route stays; no UI change).
- SM-2 scheduling semantics (`retention.ts`, `reviewDueCount`, decay) — read-only here.
- The legacy REVIEW block copy when the flag is **off** (must render byte-for-byte as today — regression-guarded).
- Journal redesign files (`JournalTabView.tsx`, `session-summary/[sessionId].tsx`) — no overlap.
- Challenge Round, the dark `CHALLENGE_ROUND_RUNTIME_ENABLED` path.
- RR-13 **P2** full `topicOrder` path-preview component (deferred; reconcile with the existing "Try this next" rail at `session-summary/[sessionId].tsx:1189` when specced).

---

## Data contract (RR-13 minimal thread)

`apps/api/src/services/review-callback.ts`:

```ts
import { and, desc, eq } from 'drizzle-orm';
import { retentionCards, sessionEvents } from '@eduagent/database';
import type { Database } from '...'; // same Database type used by getTopicRetention
import { createScopedRepository } from '...';
import {
  DAY_MS,
  computeDaysSinceLastReview,
  rowToRetentionState,
} from './retention-data';
import type { RetentionState } from './retention-data';

export type ReviewOutcome =
  | 'cracked'      // last review succeeded — "has it stuck?"
  | 'wobbled'      // last review missed / decayed — pick up where it got shaky
  | 'first_time'   // no prior review history on this card
  | 'long_gap'     // >30 days since last review — gentle re-entry, no outcome claim
  | 'unknown';     // safe neutral default

export interface ReviewCallback {
  topicTitle: string;
  outcome: ReviewOutcome;
  daysSinceLastReview: number | null;
  daysOverdue: number;
  /** Last learner message on this topic. Populated ONLY when outcome==='cracked';
   *  used as private grounding for the model, NEVER quoted verbatim (CH-1). */
  lastLearnerMessage: string | null;
}

const LONG_GAP_DAYS = 30;

export function deriveReviewOutcome(
  card: RetentionState | null,
  daysSinceLastReview: number | null,
): ReviewOutcome {
  if (!card || card.repetitions === 0) return 'first_time';
  if (daysSinceLastReview !== null && daysSinceLastReview > LONG_GAP_DAYS) {
    return 'long_gap';
  }
  if (card.xpStatus === 'verified' || card.consecutiveSuccesses >= 1) {
    return 'cracked';
  }
  if (card.failureCount > 0 || card.xpStatus === 'decayed') {
    return 'wobbled';
  }
  return 'unknown';
}

export async function getReviewCallbackContext(
  db: Database,
  profileId: string,
  topicId: string,
  topicTitle: string,
  now: Date = new Date(),
): Promise<ReviewCallback> {
  const repo = createScopedRepository(db, profileId);
  const cardRow = await repo.retentionCards.findFirst(
    eq(retentionCards.topicId, topicId),
  );
  const card = cardRow ? rowToRetentionState(cardRow) : null;
  const daysSinceLastReview = computeDaysSinceLastReview(
    cardRow?.lastReviewedAt ?? null,
    now,
  );
  const outcome = deriveReviewOutcome(card, daysSinceLastReview);

  const nextReviewMs = card?.nextReviewAt
    ? new Date(card.nextReviewAt).getTime()
    : null;
  const daysOverdue =
    nextReviewMs !== null && nextReviewMs < now.getTime()
      ? Math.floor((now.getTime() - nextReviewMs) / DAY_MS)
      : 0;

  let lastLearnerMessage: string | null = null;
  if (outcome === 'cracked') {
    // session_events is profile-scoped; explicit profileId in WHERE per repo rule.
    const [last] = await db
      .select({ content: sessionEvents.content })
      .from(sessionEvents)
      .where(
        and(
          eq(sessionEvents.profileId, profileId),
          eq(sessionEvents.topicId, topicId),
          eq(sessionEvents.eventType, 'user_message'),
        ),
      )
      .orderBy(desc(sessionEvents.createdAt))
      .limit(1);
    lastLearnerMessage = last?.content ?? null;
  }

  return { topicTitle, outcome, daysSinceLastReview, daysOverdue, lastLearnerMessage };
}
```

> Verify at implementation: `DAY_MS` export from `retention-data.ts` (it's the module-local constant used by `computeDaysSinceLastReview`); if not exported, export it or recompute `86_400_000` locally. Confirm `RetentionState.repetitions` exists (the `rowToRetentionState` return shape lists `repetitions` via `mapRetentionCardRow`; if absent on `RetentionState`, add it to the mapper — one line — since `deriveReviewOutcome` needs it).

## RR-1 — the rewritten REVIEW block

Replace `exchange-prompts.ts:854-870` so the **flag-off / no-data path is byte-identical** to today and the **flag-on path** swaps the cold transition line for branched warm guidance:

```ts
if (
  isReviewMode &&
  isFirstLearnerVisibleTurn &&
  safeTopicTitle &&
  !isLanguageMode
) {
  const cb = context.reviewCallback;
  const opener = cb
    ? buildReviewCallbackOpenerGuidance(cb)
    : // UNCHANGED legacy line — preserved verbatim for the flag-off path:
      'TRANSITION PHRASE: Begin with a brief one-line handoff that tells the learner this is a review check, not a fresh lesson.';
  sections.push(
    'Session type: REVIEW (calibrated relearning)\n' +
      opener + '\n' +
      `CALIBRATION QUESTION: The UI may already have presented an opening question about <topic_title>${safeTopicTitle}</topic_title>. If the learner's latest message answers that question, do NOT ask it again — respond to what they remembered and use any gaps to guide the next teaching step.\n` +
      "Use the learner's partial answer as the anchor. Explicitly say what they got and what is still missing. Do not pivot into a different subtopic just because it is nearby; stay inside the learner's answer and the current topic description.\n" +
      'REVIEW SOURCE DISCIPLINE: In review mode, prefer source wording for hints. Use analogies, nearby examples, or extra biology/history facts only when they appear in provided source material or pass the 0.88 general-knowledge confidence gate.\n' +
      'If the learner says they do not remember, have no idea, or are not sure, do NOT keep asking them to recall. Start a compact review of the core idea and ask one smaller supported check.\n' +
      'If the learner has not answered a calibration question yet, ask exactly one open question inviting them to say what they remember in their own words. Do NOT introduce new content before that answer.',
  );
}
```

`buildReviewCallbackOpenerGuidance` (same module, uses existing `escapeXml` from `./llm/sanitize`):

```ts
function buildReviewCallbackOpenerGuidance(cb: ReviewCallback): string {
  const gap =
    cb.daysSinceLastReview != null && cb.daysSinceLastReview >= 14
      ? ` It has been about ${cb.daysSinceLastReview} days.`
      : '';
  const base =
    'WARM CALLBACK OPENER: Open as a tutor who remembers this learner — pick up the thread; do NOT announce "review mode" or "a review check". ' +
    'Vary your wording every session; never reuse a stock phrase. ' +
    'Make exactly one warm, specific reference to your shared history with this topic, then invite them back in with one light question. ' +
    'HONESTY: only credit a past success when explicitly told below they succeeded; never claim they got something right otherwise.';
  switch (cb.outcome) {
    case 'cracked':
      return (
        base +
        ` Last time, ${cb.topicTitle} clicked for them — frame this as checking whether it stuck (e.g. "Last time you had ${cb.topicTitle} down — let's see if it stuck").${gap}` +
        (cb.lastLearnerMessage
          ? ` For your private grounding only — do NOT quote it or attribute exact words — their last message on this topic was: <last_message>${escapeXml(cb.lastLearnerMessage)}</last_message>.`
          : '')
      );
    case 'wobbled':
      return (
        base +
        ` Last time, ${cb.topicTitle} was still settling — frame this warmly as picking up where it got shaky, never as a failure or a test.${gap}`
      );
    case 'long_gap':
      return (
        base +
        ` It has been a while since ${cb.topicTitle} — open gently ("it's been a bit since we did ${cb.topicTitle}"), no pressure, just see what they remember.${gap}`
      );
    case 'first_time':
    case 'unknown':
    default:
      return (
        base +
        ` You do not have a confident read on their last outcome for ${cb.topicTitle}. Use a safe neutral invitation ("Want to circle back to ${cb.topicTitle}?") and make NO claim about how they did before.`
      );
  }
}
```

## Feature flag

`config.ts` (envSchema, alongside the other flags):

```ts
// Warm review-callback opener (RR-1 + RR-13 minimal thread). When 'true',
// session-exchange populates ExchangeContext.reviewCallback for review-mode
// first turns and the REVIEW prompt block emits the outcome-branched warm
// opener. Default 'false' → legacy "this is a review check" copy unchanged.
REVIEW_CALLBACK_OPENER_ENABLED: z.enum(['true', 'false']).default('false'),
```

Helper (alongside `isChallengeRoundRuntimeEnabled`, `config.ts:297-301`):

```ts
export function isReviewCallbackOpenerEnabled(
  value: string | undefined,
): boolean {
  return value === 'true';
}
```

Population (single gate point), in the `ExchangeContext` assembly in `session-exchange.ts` (~2737-2792, where `sessionType`/`effectiveMode` are set). Defensive: a read failure must not break the turn — fall back to legacy by leaving `reviewCallback` undefined, and emit a structured warn (not silent):

```ts
let reviewCallback: ReviewCallback | undefined;
const reviewModeFirstTurn =
  (effectiveMode === 'review' || effectiveMode === 'practice') &&
  exchangeCount === 0 &&
  !!session.topicId &&
  !!topicTitle;
if (isReviewCallbackOpenerEnabled(env.REVIEW_CALLBACK_OPENER_ENABLED) && reviewModeFirstTurn) {
  try {
    reviewCallback = await getReviewCallbackContext(db, profileId, session.topicId, topicTitle);
  } catch (err) {
    logger.warn('review_callback_context_failed', { err, profileId, topicId: session.topicId });
    reviewCallback = undefined; // legacy block renders
  }
}
// ...add `reviewCallback` to the ExchangeContext object literal.
```

> Confirm the local names (`env`, `logger`, `topicTitle`, `exchangeCount`, `session.topicId`) at the call site and adapt; the flag value is read from the route `c.env` like `CHALLENGE_ROUND_RUNTIME_ENABLED` (see `sessions.ts:743-770`).

---

## Tasks

- [ ] **T1** — Implement `deriveReviewOutcome` (pure) in `review-callback.ts`. **Done when:** `review-callback.test.ts` asserts the full truth table — `first_time` (null card / repetitions 0), `long_gap` (daysSince > 30, **takes precedence** over cracked/wobbled), `cracked` (xpStatus verified OR consecutiveSuccesses≥1), `wobbled` (failureCount>0 OR xpStatus decayed), `unknown` (card present, repetitions>0, no success/failure signal) — green.
- [ ] **T2** — Implement `getReviewCallbackContext` (scoped read + honesty-gated quote). **Done when:** test proves: cracked card → `outcome==='cracked'` and `lastLearnerMessage` populated from the latest `user_message`; wobbled/long_gap/first_time/unknown → `lastLearnerMessage===null`; `daysOverdue` computed from `nextReviewAt`; and the `session_events` read carries an explicit `profileId` filter (no cross-profile read).
- [ ] **T3** — Add `ReviewOutcome`, `ReviewCallback`, and `reviewCallback?: ReviewCallback` to `exchange-types.ts`. **Done when:** `pnpm exec nx run api:typecheck` green; types exported from the services barrel if other modules import them.
- [ ] **T4** — Rewrite the REVIEW block (`exchange-prompts.ts:854-870`) + add `buildReviewCallbackOpenerGuidance`. **Done when:** `exchange-prompts.test.ts` proves both paths (see Tests T4).
- [ ] **T5** — Add the `REVIEW_CALLBACK_OPENER_ENABLED` flag + helper, thread from the exchange route, populate `context.reviewCallback` in `session-exchange.ts` (defensive try/catch + warn). **Done when:** integration test: flag **on** + overdue verified card → `context.reviewCallback.outcome==='cracked'`; flag **off** → `context.reviewCallback === undefined` and the rendered prompt contains the legacy "review check, not a fresh lesson" line.
- [ ] **T6** — Add an `eval-llm` review-callback flow (4 outcome scenarios) + snapshot; run `pnpm eval:llm` (Tier 1) and `pnpm eval:llm --live` (Tier 2). **Done when:** Tier-1 snapshot committed; Tier-2 live run shows warm, non-repeating openers, and the `wobbled` / `unknown` scenarios contain **no** past-success claim (assert against `expectedResponseSchema`).

## Tests

**T4 — prompt-builder (`exchange-prompts.test.ts`):**
- `reviewCallback` present, `outcome==='cracked'` → REVIEW section contains `WARM CALLBACK OPENER`, a "has it stuck"-style cue, the `<last_message>` grounding tag, and **does NOT contain** `this is a review check, not a fresh lesson`. CALIBRATION QUESTION + source-discipline lines still present.
- `reviewCallback` present, `outcome==='wobbled'` → contains the "picking up where it got shaky" guidance, **no** `<last_message>` tag, and **no** success-claim language.
- `reviewCallback` present, `outcome==='unknown'` → contains the neutral "Want to circle back to" guidance and the explicit "make NO claim" instruction.
- `reviewCallback` **undefined** (flag-off path) → REVIEW section is **byte-identical to today's** block including the legacy transition line (regression guard).

**Honesty regression (red-green per CLAUDE.md Fix Development Rules):** add a test asserting that for `outcome ∈ {wobbled, first_time, long_gap, unknown}` the generated guidance string contains no win-claim token (`down`, `nailed`, `cracked`, `you got it`); watch it pass, revert the outcome branch to always emit the cracked copy, watch it fail, restore.

---

## Failure modes (CH-1)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Cracked | Overdue topic, last review succeeded | "Last time you had X down — let's see if it stuck" (one warm line + light question) | Learner answers → normal review flow |
| Wobbled | Last review missed / `decayed` | "Let's pick up where X got shaky" — no failure framing, no test framing | — |
| First-time / Unknown | Review route with no/empty card history | Neutral "Want to circle back to X?" — no claim about the past | — |
| Long gap | >30 days since last review | Gentle "it's been a while since X", no pressure | — |
| Quote is actually a question | Cracked branch, last `user_message` was a question | Model uses it as private grounding only, never quoted — outcome (not the quote) carries the success claim | Honesty preserved by prompt instruction |
| `getReviewCallbackContext` throws | DB/read error with flag on | Legacy REVIEW block renders; structured `warn` emitted (not silent) | Opener still shown, no crash |
| Flag off | Default / production pre-flip | Today's "review check, not a fresh lesson" block, verbatim | No behavior change |

---

## Eval gating & non-negotiables

- Prompt change → `pnpm eval:llm` before commit (pre-commit hook only checks the snapshot is staged; the harness is run by hand). `pnpm eval:llm --live` (Tier 2) validates the four outcome branches against `expectedResponseSchema`.
- Flag default **false** → merges dark; flip per-environment via Doppler (no A/B harness — this replaces the findings-doc "A/B against the current button").
- Flag-off path must not regress the legacy REVIEW block (T4 byte-identical guard).
- Do not alter SM-2 semantics; this read is read-only over `retention_cards` / `session_events`.
- Keep the CALIBRATION QUESTION channel intact (coherence for "yes, continue").

## Relationship to adjacent work

- **Journal redesign** (`2026-06-27-journal-redesign.md`): fully orthogonal — that work touches `JournalTabView.tsx` / `session-summary/[sessionId].tsx`; this touches `exchange-prompts.ts` / `session-exchange.ts` / `review-callback.ts`. No shared files, no sequencing dependency.
- **Warm-chat-greeting** (`2026-05-27-warm-chat-greeting.md`): its templated returning-session opener pool is unshipped and mobile-side; RR-1 is the LLM-generated upgrade of the same instinct for learners with review history. If that templated pool is later built, this server opener is the richer path for review sessions; they do not conflict.
- **RR-13 P2** (full `topicOrder` path-preview): deferred. When specced, reconcile with the existing "Try this next" rail (`session-summary/[sessionId].tsx:1189`) so it complements rather than duplicates.

## Out of scope / not built here

- No mobile changes. No SM-2 changes. No Challenge Round work. No `topicOrder` path-preview. No A/B framework. No production flag flip (that is a separate, monitored rollout once eval + staging soak are clean).
