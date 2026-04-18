# Quiz — Capitals × 09yo-dinosaurs

> **Flow source:** `apps/api/src/services/quiz/generate-round.ts:buildCapitalsPrompt`
> **Profile:** 9-year-old US child, English native, obsessed with dinosaurs and prehistoric life, quick pace, humor works

## Profile summary

| Field | Value |
|---|---|
| Age | 9 years (birth year 2017) |
| Native language | en |
| Location | US |
| Interests | dinosaurs, fossils, paleontology, extinction events, volcanoes |
| Library topics | Mesozoic era, fossilization, plate tectonics, multiplication tables |
| CEFR | — |
| Target language | — |
| Struggles | long multiplication (math); Austria vs Australia (geography) |
| Strengths | dinosaur classification (science); reading comprehension (reading) |
| Learning mode | casual |
| Preferred explanations | humor, examples, stories |
| Pace | quick |
| Analogy domain | nature |

## Builder input

```json
{
  "discoveryCount": 6,
  "ageBracket": "child",
  "recentAnswers": [
    "Tokyo",
    "Paris",
    "Canberra"
  ]
}
```

## Generated prompt — system

```
You are generating a multiple-choice capitals quiz for a 6-9 learner.

Activity: Capitals quiz
Choose an age-appropriate theme (e.g. "Central European Capitals").
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

- Coarse age bracket in use: child. Interests NOT passed (gap flagged in audit P0).
- Library topics NOT passed (gap flagged in audit P1).
- Struggles NOT passed (gap flagged in audit P0).
