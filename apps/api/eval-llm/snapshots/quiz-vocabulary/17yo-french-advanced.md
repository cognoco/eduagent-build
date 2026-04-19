# Quiz — Vocabulary × 17yo-french-advanced

> **Flow source:** `apps/api/src/services/quiz/vocabulary-provider.ts:buildVocabularyPrompt`
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
    "l'angoisse",
    "le fardeau",
    "éphémère"
  ],
  "bankEntries": [],
  "languageCode": "fr",
  "cefrCeiling": "B2",
  "interests": [
    {
      "label": {
        "label": "French literature",
        "context": "both"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "philosophy",
        "context": "both"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "existentialism",
        "context": "free_time"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "creative writing",
        "context": "free_time"
      },
      "context": "free_time"
    }
  ],
  "libraryTopics": [
    "Camus — L'Étranger",
    "French subjunctive",
    "essay structure",
    "Enlightenment thinkers"
  ],
  "ageYears": 17,
  "learnerNativeLanguage": "cs"
}
```

## Generated prompt — system

```
You are generating a multiple-choice vocabulary quiz for a 17-year-old learner studying French.

Activity: Vocabulary quiz
Target language: French
Maximum CEFR level: B2
Choose a vocabulary theme that connects to the learner's interests: [object Object], [object Object], [object Object], [object Object]. (e.g. "French [object Object]")
Questions needed: exactly 6

Do NOT repeat these recently seen English answers: l'angoisse, le fardeau, éphémère
No existing bank-entry exclusions.
The learner is also studying these curriculum topics — you may draw vocabulary from them: Camus — L'Étranger; French subjunctive; essay structure; Enlightenment thinkers.

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
- Fine-grained age: 17. Interests passed: [object Object], [object Object], [object Object], [object Object].
- Native language passed: cs — L1-aware distractors active for supported pairs.
- Library topics passed: Camus — L'Étranger; French subjunctive; essay structure; Enlightenment thinkers.
