# Quiz — Capitals × 16yo-french-advanced

> **Flow source:** `apps/api/src/services/quiz/generate-round.ts:buildCapitalsPrompt`
> **Profile:** 16-year-old EU teen, Czech native, advanced French (CEFR B2), into literature and philosophy

## Profile summary

| Field | Value |
|---|---|
| Age | 16 years (birth year 2010) |
| Native language | cs |
| Location | EU |
| Interests | French literature, philosophy, existentialism, creative writing |
| Library topics | Camus — L'Étranger, French subjunctive, essay structure, Enlightenment thinkers |
| CEFR | B2 |
| Target language | fr |
| Struggles | subjonctif imparfait (French); nuanced connectors (French) |
| Strengths | reading comprehension (French); essay argument structure (writing) |
| Learning mode | serious |
| Preferred explanations | step-by-step, analogies |
| Pace | thorough |
| Analogy domain | music |

## Builder input

```json
{
  "discoveryCount": 6,
  "ageBracket": "adult",
  "recentAnswers": [
    "Paris",
    "Brussels"
  ]
}
```

## Generated prompt — system

```
You are generating a multiple-choice capitals quiz for a 14+ learner.

Activity: Capitals quiz
Choose an age-appropriate theme (e.g. "Central European Capitals").
Questions needed: exactly 6

Do NOT include questions about these recently seen capitals: Paris, Brussels

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

- Coarse age bracket in use: adult. Interests NOT passed (gap flagged in audit P0).
- Library topics NOT passed (gap flagged in audit P1).
- Struggles NOT passed (gap flagged in audit P0).
