# Quiz — Capitals × 12yo-spanish-beginner

> **Flow source:** `apps/api/src/services/quiz/generate-round.ts:buildCapitalsPrompt`
> **Profile:** 12-year-old EU girl, English native, learning Spanish (CEFR A2), loves horses and equestrian sports

## Profile summary

| Field | Value |
|---|---|
| Age | 12 years (birth year 2014) |
| Native language | en |
| Location | EU |
| Interests | horses, showjumping, eventing, nature photography |
| Library topics | present tense verbs, family vocabulary, numbers 1-1000, Spain geography |
| CEFR | A2 |
| Target language | es |
| Struggles | ser vs estar (Spanish); irregular verbs (Spanish) |
| Strengths | Spanish pronunciation (Spanish) |
| Learning mode | serious |
| Preferred explanations | step-by-step, examples |
| Pace | thorough |
| Analogy domain | nature |

## Builder input

```json
{
  "discoveryCount": 6,
  "ageBracket": "adolescent",
  "recentAnswers": [
    "Madrid"
  ]
}
```

## Generated prompt — system

```
You are generating a multiple-choice capitals quiz for a 10-13 learner.

Activity: Capitals quiz
Choose an age-appropriate theme (e.g. "Central European Capitals").
Questions needed: exactly 6

Do NOT include questions about these recently seen capitals: Madrid

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

- Coarse age bracket in use: adolescent. Interests NOT passed (gap flagged in audit P0).
- Library topics NOT passed (gap flagged in audit P1).
- Struggles NOT passed (gap flagged in audit P0).
