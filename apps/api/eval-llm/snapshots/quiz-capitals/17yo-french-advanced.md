# Quiz — Capitals × 17yo-french-advanced

> **Flow source:** `apps/api/src/services/quiz/generate-round.ts:buildCapitalsPrompt`
> **Profile:** 17-year-old EU teen, Czech native but conversational French with tutor, advanced French (CEFR B2), literature and philosophy

## Profile summary

| Field | Value |
|---|---|
| Age | 17 years (birth year 2009) |
| Native language | cs |
| Conversation language | fr |
| Location | EU |
| Pronouns | they/them |
| Interests | French literature (both), philosophy (both), existentialism (free time), creative writing (free time) |
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
  ],
  "interests": [
    {
      "label": "French literature",
      "context": "both"
    },
    {
      "label": "philosophy",
      "context": "both"
    },
    {
      "label": "existentialism",
      "context": "free_time"
    },
    {
      "label": "creative writing",
      "context": "free_time"
    }
  ],
  "libraryTopics": [
    "Camus — L'Étranger",
    "French subjunctive",
    "essay structure",
    "Enlightenment thinkers"
  ],
  "ageYears": 17
}
```

## Generated prompt — system

```
You are generating a multiple-choice capitals quiz for a 17-year-old learner.

Activity: Capitals quiz
Choose a capitals theme that relates to the learner's interests: French literature, philosophy, existentialism. For example, if they love dinosaurs, pick "Capitals of countries with famous dinosaur fossil sites". Be creative — make the theme vivid and specific to these interests.
Library context: The learner is currently studying: Camus — L'Étranger; French subjunctive; essay structure; Enlightenment thinkers. Where possible, prefer capitals of countries relevant to these topics.
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

- Fine-grained age: 17. Interests passed: French literature, philosophy, existentialism, creative writing.
- Library topics passed: Camus — L'Étranger; French subjunctive; essay structure; Enlightenment thinkers.
