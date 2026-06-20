# Park and Return Ranking × 12yo-dinosaurs · PR-RANK-3

> **Flow source:** `apps/api/src/services/now-feed.ts`
> **Profile:** 12-year-old US boy, English native, obsessed with dinosaurs and prehistoric life, quick pace, humor works
> **Scenario:** `PR-RANK-3`

## Profile summary

| Field | Value |
|---|---|
| Age | 12 years (birth year 2014) |
| Native language | en |
| Conversation language | en |
| Location | US |
| Pronouns | — (not provided) |
| Interests | dinosaurs (both), fossils (both), paleontology (both), extinction events (free time), volcanoes (free time) |
| Library topics | Mesozoic era, fossilization, plate tectonics, long division |
| CEFR | — |
| Target language | — |
| Struggles | long division (math); Austria vs Australia (geography) |
| Strengths | dinosaur classification (science); reading comprehension (reading) |
| Preferred explanations | humor, examples, stories |
| Pace | quick |
| Analogy domain | nature |

## Builder input

```json
{
  "scenarioId": "PR-RANK-3",
  "purpose": "When needs-deepening and parked items are both promoted, the expiring weak concept precedes the parked curiosity.",
  "candidates": [
    {
      "id": "retention-due",
      "kind": "retention_due",
      "createdAt": "2026-06-12T12:00:00.000Z",
      "sortAt": "2026-06-11T12:00:00.000Z",
      "templateKey": "now.retention_due.default",
      "params": {
        "id": "retention-due",
        "title": "retention-due"
      },
      "deepLink": {
        "route": "retention.review",
        "params": {
          "subjectId": "a0000000-0000-4000-8000-000000000100",
          "topicId": "c0000000-0000-4000-8000-000000000100"
        },
        "chain": [
          "subject.hub"
        ]
      },
      "scope": "self"
    },
    {
      "id": "near-expiry-deepening",
      "kind": "needs_deepening",
      "createdAt": "2026-06-10T12:00:00.000Z",
      "sortAt": "2026-06-15T12:00:00.000Z",
      "templateKey": "now.needs_deepening.default",
      "params": {
        "id": "near-expiry-deepening",
        "title": "near-expiry-deepening"
      },
      "deepLink": {
        "route": "subject.topic",
        "params": {
          "subjectId": "a0000000-0000-4000-8000-000000000100",
          "bookId": "b0000000-0000-4000-8000-000000000100",
          "topicId": "c0000000-0000-4000-8000-000000000100"
        },
        "chain": [
          "subject.hub"
        ]
      },
      "scope": "self"
    },
    {
      "id": "aged-parked",
      "kind": "parked_item",
      "createdAt": "2026-06-05T12:00:00.000Z",
      "templateKey": "now.parked_item.default",
      "params": {
        "id": "aged-parked",
        "title": "aged-parked"
      },
      "deepLink": {
        "route": "subject.topic",
        "params": {
          "subjectId": "a0000000-0000-4000-8000-000000000100",
          "bookId": "b0000000-0000-4000-8000-000000000100",
          "topicId": "c0000000-0000-4000-8000-000000000100"
        },
        "chain": [
          "subject.hub"
        ]
      },
      "scope": "self"
    },
    {
      "id": "challenge-ready",
      "kind": "challenge_ready",
      "createdAt": "2026-06-11T12:00:00.000Z",
      "templateKey": "now.challenge_ready.default",
      "params": {
        "id": "challenge-ready",
        "title": "challenge-ready"
      },
      "deepLink": {
        "route": "challenge.start",
        "params": {
          "subjectId": "a0000000-0000-4000-8000-000000000100",
          "topicId": "c0000000-0000-4000-8000-000000000100"
        },
        "chain": [
          "subject.hub"
        ]
      },
      "scope": "self"
    }
  ]
}
```

## Generated prompt — system

```
Deterministic park-and-return ranking gate. No LLM call is made; evaluateDeterministic checks the real Now-feed ranker.
```

## Builder notes

- Scenario: PR-RANK-3 - When needs-deepening and parked items are both promoted, the expiring weak concept precedes the parked curiosity.
- Candidates: retention-due, near-expiry-deepening, aged-parked, challenge-ready
- Ranked: retention-due, near-expiry-deepening, aged-parked, challenge-ready
- Cards: retention-due, near-expiry-deepening, aged-parked
- Overflow: challenge-ready
