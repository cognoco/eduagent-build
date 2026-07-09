# @eduagent/retention

Pure TypeScript implementation of the SM-2 spaced repetition algorithm.

## Overview

Zero dependencies. Deterministic output. Used by `apps/api` to schedule review intervals after each learning session assessment.

Reference: [SuperMemo SM-2 algorithm](https://www.supermemo.com/en/archives1990-2015/english/ol/sm2)

## Usage

```typescript
import { sm2, type RetentionCard, type SM2Input } from '@eduagent/retention';

// New card (first review)
const result = sm2({ quality: 4 });

// Existing card
const result = sm2({ quality: 3, card: existingCard });

// result.card     — updated RetentionCard (persist this)
// result.wasSuccessful — quality >= 3
```

### `RetentionCard`

```typescript
interface RetentionCard {
  easeFactor: number;      // >= 1.3; default 2.5 for new cards
  interval: number;        // days until next review
  repetitions: number;     // consecutive correct recalls
  lastReviewedAt: string;  // ISO 8601 UTC
  nextReviewAt: string;    // ISO 8601 UTC
}
```

### Quality scale

| Value | Meaning |
|-------|---------|
| 0 | Total blackout |
| 1 | Incorrect, but recognized on recall |
| 2 | Incorrect, but easy to remember the correct answer |
| 3 | Correct with significant difficulty |
| 4 | Correct after hesitation |
| 5 | Perfect recall |

Responses with `quality < 3` reset the repetition counter. The ease factor floor is 1.3.

## Deviations from canonical SM-2

This implementation deliberately differs from the published SM-2 algorithm in
the following ways. Anyone comparing this code against the SuperMemo reference
should expect these deltas — they are decisions, not bugs.

| Deviation | Canonical SM-2 | This implementation | Where |
|---|---|---|---|
| **Grain** | One card per flashcard item | One card per **Topic** | `retention_cards`, written via `apps/api/src/services/retention.ts` |
| **Quality source** | Learner self-grades their recall 0–5 | Quality is **derived from graded activity**, never self-reported: assessment `overallQuality` (weighted accuracy 50% / completeness 30% / clarity 20%) maps to SM-2 quality | `apps/api/src/services/evaluate-data.ts`, `docs/architecture.md` → "EVALUATE scoring" |
| **EVALUATE failure floor** | A failed recall grades 0–2 | An EVALUATE (flaw-finding) failure floors at quality **2–3, never 0–1** — missing a subtle flaw in presented reasoning is not the same as not knowing the topic, and must not tank the schedule | `mapEvaluateQualityToSm2()` in `apps/api/src/services/evaluate.ts` |
| **Failed-recall re-drill** | Item re-drills within the same session until recalled | No same-day re-drill loop; a failed topic is scheduled at interval 1 day and re-enters via Review/Relearn | `sm2.ts` failure branch |
| **Input hardening** | Assumes valid 0–5 integer | Non-finite quality → 0; out-of-range values rounded and clamped to 0–5 | `sm2.ts` input guard |
| **Schedule anchor** | Next review = review date + interval | Same (conforms) — an earlier variant anchored to the *due* date, which collapsed overdue recalls to +1 day; fixed as BUG-574 | `sm2.ts` next-review computation |
| **Ease precision** | Unspecified | Ease factor rounded to 2 decimals before persisting | `sm2.ts` return value |
| **Extra state** | Card = ease/interval/repetitions | `evaluateDifficultyRung` (1–4) rides on the retention card but is **not** part of the SM-2 math — it steers EVALUATE challenge difficulty only | `retention_cards` schema |

Relationship to mastery: SM-2 retention ("recall held over time") and Challenge
Round verification ("proved explanation now") are complementary axes — see
`docs/adr/MMT-ADR-0031-challenge-verification-and-sm2-are-complementary-mastery-axes.md`.

## Development

```bash
pnpm exec nx run retention:typecheck
pnpm exec nx run retention:test
```
