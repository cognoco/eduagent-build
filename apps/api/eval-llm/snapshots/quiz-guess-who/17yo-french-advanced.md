# Quiz — Guess Who × 17yo-french-advanced

> **Flow source:** `apps/api/src/services/quiz/guess-who-provider.ts:buildGuessWhoPrompt`
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
  "discoveryCount": 4,
  "ageBracket": "adult",
  "recentAnswers": [
    "Jean-Paul Sartre",
    "Albert Camus"
  ],
  "topicTitles": [
    "Camus — L'Étranger",
    "French subjunctive",
    "essay structure",
    "Enlightenment thinkers"
  ],
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
  "ageYears": 17
}
```

## Generated prompt — system

```
You are generating a clue-by-clue Guess Who quiz for a 17-year-old learner.

Activity: Guess Who
Choose a theme of famous people connected to the learner's interests: [object Object], [object Object], [object Object], [object Object].
Questions needed: exactly 4

Do NOT repeat these recently seen people: Jean-Paul Sartre, Albert Camus
Topic hints from the learner's active curriculum: Camus — L'Étranger; French subjunctive; essay structure; Enlightenment thinkers. At least 2 of the 4 people MUST relate clearly to one or more of those topics.

Rules:
- Generate exactly 4 questions.
- Each question must be a real famous person who is broadly appropriate for a young learner.
- acceptedAliases must include common learner-typed variants such as surnames, titles, or short forms.
- clues must contain exactly 5 clues and get progressively easier from clue 1 to clue 5.
- clue 1 should be broad, clue 5 should be close to a giveaway.
- NEVER mention the person's canonical name or any accepted alias inside any clue.
- mcFallbackOptions must contain exactly 4 names total: the correct answer plus 3 plausible distractors from a related domain, era, or category.
- funFact should be a single short sentence under 200 characters.
- Include the person's era or century (e.g. "17th century", "19th century", "5th century BCE").

Respond with ONLY valid JSON in this shape:
{
  "theme": "Theme Name",
  "questions": [
    {
      "canonicalName": "Isaac Newton",
      "era": "17th century",
      "acceptedAliases": ["Newton", "Sir Isaac Newton"],
      "clues": ["Clue 1", "Clue 2", "Clue 3", "Clue 4", "Clue 5"],
      "mcFallbackOptions": ["Isaac Newton", "Albert Einstein", "Galileo Galilei", "Nikola Tesla"],
      "funFact": "One short fact."
    }
  ]
}
```

## Generated prompt — user

```
Generate the quiz round.
```

## Builder notes

- Fine-grained age: 17. Interests passed: [object Object], [object Object], [object Object], [object Object].
- Library topics passed: Camus — L'Étranger; French subjunctive; essay structure; Enlightenment thinkers.
- Topic titles passed: Camus — L'Étranger; French subjunctive; essay structure; Enlightenment thinkers.
