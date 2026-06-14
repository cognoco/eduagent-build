# Now Feed Park and Return Ranking × 12yo-dinosaurs · aged-parked-promotes

> **Flow source:** `apps/api/src/services/now-feed.ts`
> **Profile:** 12-year-old US boy, English native, obsessed with dinosaurs and prehistoric life, quick pace, humor works
> **Scenario:** `aged-parked-promotes`

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
  "check": "aged-parked-promotes",
  "candidates": [
    {
      "id": "fresh-parked",
      "kind": "parked_item",
      "createdAt": "2026-06-13T12:00:00.000Z",
      "templateKey": "now.parked_item",
      "params": {
        "title": "fresh-parked"
      },
      "deepLink": {
        "route": "subject.topic",
        "params": {
          "subjectId": "a0000000-0000-4000-8000-000000000100",
          "bookId": "c0000000-0000-4000-8000-000000000100",
          "topicId": "b0000000-0000-4000-8000-000000000100"
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
      "templateKey": "now.parked_item",
      "params": {
        "title": "aged-parked"
      },
      "deepLink": {
        "route": "subject.topic",
        "params": {
          "subjectId": "a0000000-0000-4000-8000-000000000100",
          "bookId": "c0000000-0000-4000-8000-000000000100",
          "topicId": "b0000000-0000-4000-8000-000000000100"
        },
        "chain": [
          "subject.hub"
        ]
      },
      "scope": "self"
    },
    {
      "id": "ordinary-deepening",
      "kind": "needs_deepening",
      "createdAt": "2026-06-12T12:00:00.000Z",
      "templateKey": "now.needs_deepening",
      "params": {
        "title": "ordinary-deepening"
      },
      "deepLink": {
        "route": "subject.topic",
        "params": {
          "subjectId": "a0000000-0000-4000-8000-000000000100",
          "bookId": "c0000000-0000-4000-8000-000000000100",
          "topicId": "b0000000-0000-4000-8000-000000000100"
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
      "templateKey": "now.challenge_ready",
      "params": {
        "title": "challenge-ready"
      },
      "deepLink": {
        "route": "subject.topic",
        "params": {
          "subjectId": "a0000000-0000-4000-8000-000000000100",
          "bookId": "c0000000-0000-4000-8000-000000000100",
          "topicId": "b0000000-0000-4000-8000-000000000100"
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
Deterministic Now-feed ranking check; no LLM call is made.
```

## Builder notes

- Check: aged-parked-promotes
- Candidate order: fresh-parked, aged-parked, ordinary-deepening, challenge-ready
