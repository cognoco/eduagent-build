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
| Preferred explanations | step-by-step, analogies |
| Pace | thorough |
| Analogy domain | music |

## Builder input

```json
{
  "discoveryCount": 6,
  "ageBracket": "adolescent",
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
      "label": "French literature",
      "context": "free_time"
    },
    {
      "label": "philosophy",
      "context": "free_time"
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
Choose a vocabulary theme that connects to the learner's interests: French literature, philosophy, existentialism, creative writing. (e.g. "French French literature")
Questions needed: exactly 6

Do NOT repeat these recently seen English answers: l'angoisse, le fardeau, éphémère
No existing bank-entry exclusions.
The learner is also studying these curriculum topics — you may draw vocabulary from them: Camus — L'Étranger; French subjunctive; essay structure; Enlightenment thinkers.

Rules:
- Generate exactly 6 questions.
- Each question shows a French word or phrase and asks for the English translation.
- Prefer useful everyday language: greetings, small talk, home, school, food, travel, and other common daily situations.
- Include a mix of single words and short reusable chunks/phrases. If at least 2 questions are requested, include at least one common daily phrase/chunk.
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
- Fine-grained age: 17. Interests passed: French literature, philosophy, existentialism, creative writing.
- Native language passed: cs — L1-aware distractors active for supported pairs.
- Library topics passed: Camus — L'Étranger; French subjunctive; essay structure; Enlightenment thinkers.

## Live LLM response

```
```json
{
  "theme": "French Literature & Philosophical Concepts",
  "targetLanguage": "French",
  "questions": [
    {
      "term": "l'absurde",
      "correctAnswer": "the absurd",
      "acceptedAnswers": ["the absurd", "absurdity"],
      "distractors": ["the absolute", "the absurd thing", "the answer"],
      "funFact": "The philosophy of Absurdism, famously explored by Albert Camus, highlights the conflict between humanity's search for meaning and the universe's indifference.",
      "cefrLevel": "B2"
    },
    {
      "term": "la condition humaine",
      "correctAnswer": "the human condition",
      "acceptedAnswers": ["the human condition"],
      "distractors": ["human nature", "the human form", "the human state"],
      "funFact": "This phrase refers to the fundamental experiences and characteristics that define human existence, such as birth, growth, emotion, conflict, and mortality.",
      "cefrLevel": "B2"
    },
    {
      "term": "remettre en question",
      "correctAnswer": "to question",
      "acceptedAnswers": ["to question", "to challenge", "to call into question"],
      "distractors": ["to put back in question", "to give back a question", "to answer a question"],
      "funFact": "This common phrase is often used in academic and philosophical discussions to talk about critically examining ideas or assumptions.",
      "cefrLevel": "B2"
    },
    {
      "term": "le récit",
      "correctAnswer": "the narrative",
      "acceptedAnswers": ["the narrative", "the story", "the account"],
      "distractors": ["the receipt", "the recipe", "the repetition"],
      "funFact": "In literature, 'le récit' refers to the sequence of events as they are told, distinguishing it from the 'histoire' (the actual events).",
      "cefrLevel": "B1"
    },
    {
      "term": "la raison",
      "correctAnswer": "reason",
      "acceptedAnswers": ["reason", "the reason", "intellect"],
      "distractors": ["the season", "the solution", "the decision"],
      "funFact": "During the Enlightenment, philosophers greatly emphasized the power of 'la raison' as the primary source of authority and legitimacy.",
      "cefrLevel": "B1"
    },
    {
      "term": "la conscience",
      "correctAnswer": "consciousness",
      "acceptedAnswers": ["consciousness", "conscience"],
      "distractors": ["the science", "the knowledge", "the understanding"],
      "funFact": "In philosophy, 'la conscience' can refer to both self-awareness and the moral sense of right and wrong.",
      "cefrLevel": "B2"
    }
  ]
}
```
```
