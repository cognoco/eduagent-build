# Quiz — Vocabulary × 13yo-spanish-beginner

> **Flow source:** `apps/api/src/services/quiz/vocabulary-provider.ts:buildVocabularyPrompt`
> **Profile:** 13-year-old EU girl, English native, learning Spanish (CEFR A2), loves horses and equestrian sports

## Profile summary

| Field | Value |
|---|---|
| Age | 13 years (birth year 2013) |
| Native language | en |
| Conversation language | en |
| Location | EU |
| Pronouns | she/her |
| Interests | horses (free time), showjumping (free time), eventing (free time), nature photography (free time) |
| Library topics | Spanish present tense verbs, Spanish family vocabulary, Spanish numbers 1-1000, Spain geography |
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
    "el caballo",
    "la escuela",
    "el perro"
  ],
  "bankEntries": [],
  "languageCode": "es",
  "cefrCeiling": "A2"
}
```

## Generated prompt — system

```
You are generating a multiple-choice vocabulary quiz for a 10-13 learner studying Spanish.

Activity: Vocabulary quiz
Target language: Spanish
Maximum CEFR level: A2
Choose an age-appropriate theme (e.g. "Spanish Animals", "Spanish Food", "Spanish at School").
Questions needed: exactly 6

Do NOT repeat these recently seen English answers: el caballo, la escuela, el perro
No existing bank-entry exclusions.

Rules:
- Generate exactly 6 questions.
- Each question shows a Spanish word or phrase and asks for the English translation.
- Include articles where the language normally uses them.
- acceptedAnswers must include the main translation plus any common equivalent phrasing.
- Distractors must be plausible English translations but still clearly wrong.
- Fun facts should be one sentence maximum.
- Keep every question at or below CEFR A2.

Respond with ONLY valid JSON in this shape:
{
  "theme": "Theme Name",
  "targetLanguage": "Spanish",
  "questions": [
    {
      "term": "Word in Spanish",
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

- Uses languageCode=es and cefrCeiling=A2.
- Interests NOT passed (gap flagged in audit P0) — theme picked blindly.
- Native language NOT passed — distractors won't be L1-aware.
- Struggles + missed-items NOT passed (gap flagged in audit P1).
