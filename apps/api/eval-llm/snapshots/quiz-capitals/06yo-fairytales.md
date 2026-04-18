# Quiz — Capitals × 06yo-fairytales

> **Flow source:** `apps/api/src/services/quiz/generate-round.ts:buildCapitalsPrompt`
> **Profile:** 6-year-old EU child, early reader, Czech native, loves fairy tales and animals, low cognitive load preferred

## Profile summary

| Field | Value |
|---|---|
| Age | 6 years (birth year 2020) |
| Native language | cs |
| Location | EU |
| Interests | fairy tales, horses, forest animals, drawing |
| Library topics | alphabet, counting to 20, farm animals |
| CEFR | — |
| Target language | — |
| Struggles | letter b vs d; silent letters (reading) |
| Strengths | rhyming words (reading) |
| Learning mode | casual |
| Preferred explanations | stories, examples |
| Pace | thorough |
| Analogy domain | nature |

## Builder input

```json
{
  "discoveryCount": 6,
  "ageBracket": "child",
  "recentAnswers": []
}
```

## Generated prompt — system

```
You are generating a multiple-choice capitals quiz for a 6-9 learner.

Activity: Capitals quiz
Choose an age-appropriate theme (e.g. "Central European Capitals").
Questions needed: exactly 6

No exclusions.

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
