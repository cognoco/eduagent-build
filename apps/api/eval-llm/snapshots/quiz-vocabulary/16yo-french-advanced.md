# Quiz — Vocabulary × 16yo-french-advanced

> **Flow source:** `apps/api/src/services/quiz/vocabulary-provider.ts:buildVocabularyPrompt`
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
    "l'angoisse",
    "le fardeau",
    "éphémère"
  ],
  "bankEntries": [],
  "languageCode": "fr",
  "cefrCeiling": "B2"
}
```

## Generated prompt — system

```
You are generating a multiple-choice vocabulary quiz for a 14+ learner studying French.

Activity: Vocabulary quiz
Target language: French
Maximum CEFR level: B2
Choose an age-appropriate theme (e.g. "French Animals", "French Food", "French at School").
Questions needed: exactly 6

Do NOT repeat these recently seen English answers: l'angoisse, le fardeau, éphémère
No existing bank-entry exclusions.

Rules:
- Generate exactly 6 questions.
- Each question shows a French word or phrase and asks for the English translation.
- Include articles where the language normally uses them.
- acceptedAnswers must include the main translation plus any common equivalent phrasing.
- Distractors must be plausible English translations but still clearly wrong.
- Fun facts should be one sentence maximum.
- Keep every question at or below CEFR B2.

Respond with ONLY valid JSON in this shape:
{
  "theme": "Theme Name",
  "targetLanguage": "French",
  "questions": [
    {
      "term": "Word in French",
      "correctAnswer": "English translation",
      "acceptedAnswers": ["English translation", "alternative phrasing"],
      "distractors": ["Wrong 1", "Wrong 2", "Wrong 3"],
      "funFact": "One interesting fact about this word.",
      "cefrLevel": "A1"
    }
  ]
}
```

## Generated prompt — user

```
Generate the quiz round.
```

## Builder notes

- Uses languageCode=fr and cefrCeiling=B2.
- Interests NOT passed (gap flagged in audit P0) — theme picked blindly.
- Native language NOT passed — distractors won't be L1-aware.
- Struggles + missed-items NOT passed (gap flagged in audit P1).
