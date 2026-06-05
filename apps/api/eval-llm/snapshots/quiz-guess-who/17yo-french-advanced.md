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
| Preferred explanations | step-by-step, analogies |
| Pace | thorough |
| Analogy domain | music |

## Builder input

```json
{
  "discoveryCount": 4,
  "ageBracket": "adolescent",
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
  "ageYears": 17
}
```

## Generated prompt — system

```
You are generating a clue-by-clue Guess Who quiz for a 17-year-old learner.

Activity: Guess Who
Choose a theme of famous people connected to the learner's interests: French literature, philosophy, existentialism, creative writing.
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

- Fine-grained age: 17. Interests passed: French literature, philosophy, existentialism, creative writing.
- Library topics passed: Camus — L'Étranger; French subjunctive; essay structure; Enlightenment thinkers.
- Topic titles passed: Camus — L'Étranger; French subjunctive; essay structure; Enlightenment thinkers.

## Live LLM response

```
```json
{
  "theme": "Giants of French Thought & Letters",
  "questions": [
    {
      "canonicalName": "Voltaire",
      "era": "18th century",
      "acceptedAliases": ["Voltaire", "François-Marie Arouet", "Arouet"],
      "clues": [
        "Often associated with the Age of Reason.",
        "A fierce advocate for civil liberties, including freedom of speech and religion.",
        "His satirical novella *Candide* critiques optimism and societal ills.",
        "He was a prolific writer of plays, poems, novels, essays, and historical works.",
        "This French philosopher's pen name is a common sight in discussions of the Enlightenment."
      ],
      "mcFallbackOptions": ["Voltaire", "Jean-Jacques Rousseau", "Denis Diderot", "Montesquieu"],
      "funFact": "He once spent time in the Bastille due to his satirical writings."
    },
    {
      "canonicalName": "Simone de Beauvoir",
      "era": "20th century",
      "acceptedAliases": ["Beauvoir", "Simone de B."],
      "clues": [
        "A prominent figure in the post-World War II intellectual scene.",
        "Her groundbreaking work extensively explored the nature of womanhood and gender.",
        "She maintained a lifelong open relationship with another famous existentialist.",
        "Her seminal non-fiction book is considered a foundational text in feminist philosophy.",
        "This French writer and theorist is known for *The Second Sex*."
      ],
      "mcFallbackOptions": ["Simone de Beauvoir", "Hannah Arendt", "Virginia Woolf", "Mary Wollstonecraft"],
      "funFact": "She refused to marry her lifelong partner, believing it would complicate their intellectual work."
    },
    {
      "canonicalName": "René Descartes",
      "era": "17th century",
      "acceptedAliases": ["Descartes"],
      "clues": [
        "His work laid much of the groundwork for modern Western philosophy.",
        "He famously doubted everything to establish what could be known for certain.",
        "His most famous dictum translates to 'I think, therefore I am.'",
        "He also made significant contributions to mathematics, including analytical geometry.",
        "This French thinker proposed the concept of Cartesian dualism."
      ],
      "mcFallbackOptions": ["René Descartes", "Baruch Spinoza", "John Locke", "Gottfried Leibniz"],
      "funFact": "He is often credited with inventing the Cartesian coordinate system."
    },
    {
      "canonicalName": "Victor Hugo",
      "era": "19th century",
      "acceptedAliases": ["Hugo"],
      "clues": [
        "A towering figure of Romanticism in his native country.",
        "His epic novels often explore themes of social justice, redemption, and human dignity.",
        "One of his most famous works features a hunchbacked bell-ringer and a gypsy dancer in Paris.",
        "He also wrote a tragic story about an ex-convict and his relentless pursuer.",
        "This French author penned *Les Misérables* and *The Hunchback of Notre-Dame*."
      ],
      "mcFallbackOptions": ["Victor Hugo", "Honoré de Balzac", "Gustave Flaubert", "Alexandre Dumas"],
      "funFact": "He was also a passionate politician and social activist, exiled for his views."
    }
  ]
}
```
```
