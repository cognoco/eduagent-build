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

## Development

```bash
pnpm exec nx run retention:typecheck
pnpm exec nx run retention:test
```
