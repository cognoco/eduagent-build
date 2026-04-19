# Quiz — Capitals × 12yo-dinosaurs

> **Flow source:** `apps/api/src/services/quiz/generate-round.ts:buildCapitalsPrompt`
> **Profile:** 12-year-old US boy, English native, obsessed with dinosaurs and prehistoric life, quick pace, humor works

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
| Learning mode | casual |
| Preferred explanations | humor, examples, stories |
| Pace | quick |
| Analogy domain | nature |

## Builder input

```json
{
  "discoveryCount": 6,
  "ageBracket": "adolescent",
  "recentAnswers": [
    "Tokyo",
    "Paris",
    "Canberra"
  ],
  "interests": [
    {
      "label": {
        "label": "dinosaurs",
        "context": "both"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "fossils",
        "context": "both"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "paleontology",
        "context": "both"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "extinction events",
        "context": "free_time"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "volcanoes",
        "context": "free_time"
      },
      "context": "free_time"
    }
  ],
  "libraryTopics": [
    "Mesozoic era",
    "fossilization",
    "plate tectonics",
    "long division"
  ],
  "ageYears": 12
}
```

## Generated prompt — system

```
You are generating a multiple-choice capitals quiz for a 12-year-old learner.

Activity: Capitals quiz
Choose a capitals theme that relates to the learner's interests: [object Object], [object Object], [object Object]. For example, if they love dinosaurs, pick "Capitals of countries with famous dinosaur fossil sites". Be creative — make the theme vivid and specific to these interests.
Library context: The learner is currently studying: Mesozoic era; fossilization; plate tectonics; long division. Where possible, prefer capitals of countries relevant to these topics.
Questions needed: exactly 6

Do NOT include questions about these recently seen capitals: Tokyo, Paris, Canberra

Rules:
- Generate exactly 6 questions
- Each question must have exactly 3 distractors
- Distractors must be plausible city names
- Fun facts should be surprising, age-appropriate, and one sentence maximum
- Keep the theme coherent across the full round

Respond with ONLY valid JSON in this shape:
{
  "theme": "Theme Name",
  "questions": [
    {
      "country": "Country Name",
      "correctAnswer": "Capital City",
      "distractors": ["City A", "City B", "City C"],
      "funFact": "One surprising fact about this capital."
    }
  ]
}
```

## Generated prompt — user

```
Generate the quiz round.
```

## Builder notes

- Fine-grained age: 12. Interests passed: [object Object], [object Object], [object Object], [object Object], [object Object].
- Library topics passed: Mesozoic era; fossilization; plate tectonics; long division.
