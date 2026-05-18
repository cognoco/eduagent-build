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
  "theme": "French Thinkers & Writers",
  "questions": [
    {
      "canonicalName": "Voltaire",
      "era": "18th century",
      "acceptedAliases": ["Voltaire", "François-Marie Arouet", "Arouet"],
      "clues": [
        "I was a prolific writer and philosopher.",
        "My critiques of the Catholic Church and advocacy for civil liberties were controversial in my time.",
        "I spent time in exile and corresponded with many European monarchs.",
        "My satirical novella critiques optimism and society.",
        "I am a key figure of the Enlightenment, known for my wit and advocating for freedom of speech, notably through works like *Candide*."
      ],
      "mcFallbackOptions": ["Voltaire", "Jean-Jacques Rousseau", "Denis Diderot", "Montesquieu"],
      "funFact": "He famously advocated for freedom of speech, saying, 'I disapprove of what you say, but I will defend to the death your right to say it.'"
    },
    {
      "canonicalName": "Simone de Beauvoir",
      "era": "20th century",
      "acceptedAliases": ["Beauvoir", "Simone de Beauvoir"],
      "clues": [
        "I was a French writer and philosopher.",
        "My work profoundly influenced feminist theory and existentialism.",
        "I had a lifelong relationship and intellectual partnership with another famous existentialist thinker.",
        "My groundbreaking 1949 treatise explored the experiences of women.",
        "I am best known for my seminal work on feminist philosophy, *The Second Sex*."
      ],
      "mcFallbackOptions": ["Simone de Beauvoir", "Hannah Arendt", "Virginia Woolf", "Iris Murdoch"],
      "funFact": "She held the agrégation in philosophy, a highly competitive French examination."
    },
    {
      "canonicalName": "René Descartes",
      "era": "17th century",
      "acceptedAliases": ["Descartes", "René Descartes"],
      "clues": [
        "I was a French philosopher, mathematician, and scientist.",
        "My work is considered a cornerstone of modern Western philosophy.",
        "I developed a system of coordinates that is named after me.",
        "I explored the nature of knowledge through systematic doubt.",
        "My most famous philosophical statement is 'I think, therefore I am.'"
      ],
      "mcFallbackOptions": ["René Descartes", "John Locke", "Baruch Spinoza", "Gottfried Leibniz"],
      "funFact": "He spent much of his adult life in the Netherlands, valuing its intellectual freedom."
    },
    {
      "canonicalName": "Victor Hugo",
      "era": "19th century",
      "acceptedAliases": ["Hugo", "Victor Hugo"],
      "clues": [
        "I was a celebrated French poet, novelist, and dramatist.",
        "My writing often explored social injustice and the human condition.",
        "I was a leading figure of the Romantic literary movement in France.",
        "My epic historical novel features a former convict, Jean Valjean, and a relentless inspector, Javert.",
        "I am the author of classic French novels like *Les Misérables* and *The Hunchback of Notre-Dame*."
      ],
      "mcFallbackOptions": ["Victor Hugo", "Honoré de Balzac", "Gustave Flaubert", "Émile Zola"],
      "funFact": "He also had a significant political career, advocating for democracy and social justice."
    }
  ]
}
```
```
