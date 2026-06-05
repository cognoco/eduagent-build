# Quiz — Guess Who × 11yo-czech-animals

> **Flow source:** `apps/api/src/services/quiz/guess-who-provider.ts:buildGuessWhoPrompt`
> **Profile:** 11-year-old EU girl, Czech native, youngest in the target range, loves animals and nature, thorough pacer

## Profile summary

| Field | Value |
|---|---|
| Age | 11 years (birth year 2015) |
| Native language | cs |
| Conversation language | cs |
| Location | EU |
| Pronouns | — (not provided) |
| Interests | horses (free time), forest animals (free time), nature journaling (both), drawing (free time) |
| Library topics | Czech reading comprehension, basic fractions, human body systems, water cycle |
| CEFR | — |
| Target language | — |
| Struggles | fraction addition (math); long multi-clause sentences (reading) |
| Strengths | vocabulary retention (Czech) |
| Preferred explanations | stories, examples |
| Pace | thorough |
| Analogy domain | nature |

## Builder input

```json
{
  "discoveryCount": 4,
  "ageBracket": "adolescent",
  "recentAnswers": [],
  "topicTitles": [
    "Czech reading comprehension",
    "basic fractions",
    "human body systems",
    "water cycle"
  ],
  "interests": [
    {
      "label": "horses",
      "context": "free_time"
    },
    {
      "label": "forest animals",
      "context": "free_time"
    },
    {
      "label": "nature journaling",
      "context": "free_time"
    },
    {
      "label": "drawing",
      "context": "free_time"
    }
  ],
  "libraryTopics": [
    "Czech reading comprehension",
    "basic fractions",
    "human body systems",
    "water cycle"
  ],
  "ageYears": 11
}
```

## Generated prompt — system

```
You are generating a clue-by-clue Guess Who quiz for a 11-year-old learner.

Activity: Guess Who
Choose a theme of famous people connected to the learner's interests: horses, forest animals, nature journaling, drawing.
Questions needed: exactly 4

No recent-person exclusions.
Topic hints from the learner's active curriculum: Czech reading comprehension; basic fractions; human body systems; water cycle. At least 2 of the 4 people MUST relate clearly to one or more of those topics.

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

- Fine-grained age: 11. Interests passed: horses, forest animals, nature journaling, drawing.
- Library topics passed: Czech reading comprehension; basic fractions; human body systems; water cycle.
- Topic titles passed: Czech reading comprehension; basic fractions; human body systems; water cycle.

## Live LLM response

```
```json
{
  "theme": "Art, Science, and Nature's Wonders",
  "questions": [
    {
      "canonicalName": "Leonardo da Vinci",
      "era": "15th-16th century",
      "acceptedAliases": ["Da Vinci", "Leonardo"],
      "clues": [
        "I was a true Renaissance man, excelling in many fields.",
        "My famous sketches include detailed studies of the human body and flying machines.",
        "I painted one of the most famous portraits in the world, known for its mysterious smile.",
        "I designed canals and studied how water flowed, impacting future engineering.",
        "My last name means 'from Vinci,' the town where I was born in Italy."
      ],
      "mcFallbackOptions": ["Leonardo da Vinci", "Michelangelo", "Raphael", "Donatello"],
      "funFact": "He famously wrote his notes backward, requiring a mirror to read them."
    },
    {
      "canonicalName": "Gregor Mendel",
      "era": "19th century",
      "acceptedAliases": ["Mendel", "Johann Mendel"],
      "clues": [
        "I was a scientist who also became an abbot in a monastery.",
        "My most famous experiments involved cross-breeding pea plants.",
        "I discovered fundamental rules about how traits are passed from parents to offspring.",
        "My work laid the foundation for the science of genetics.",
        "I lived and conducted my research in what is now the Czech Republic."
      ],
      "mcFallbackOptions": ["Gregor Mendel", "Charles Darwin", "Louis Pasteur", "Robert Koch"],
      "funFact": "His groundbreaking work on heredity was largely unrecognized until after his death."
    },
    {
      "canonicalName": "Beatrix Potter",
      "era": "19th-20th century",
      "acceptedAliases": ["Potter", "Helen Beatrix Potter"],
      "clues": [
        "I was a writer and illustrator known for my charming stories.",
        "My tales often feature small, anthropomorphic animals wearing clothes.",
        "I loved drawing nature and the countryside, especially rabbits.",
        "One of my most famous characters is a mischievous rabbit named Peter.",
        "I helped conserve land in the beautiful Lake District of England."
      ],
      "mcFallbackOptions": ["Beatrix Potter", "A.A. Milne", "Lewis Carroll", "Dr. Seuss"],
      "funFact": "She studied fungi and was a skilled scientific illustrator before becoming a beloved author."
    },
    {
      "canonicalName": "Rosa Bonheur",
      "era": "19th century",
      "acceptedAliases": ["Bonheur", "Marie-Rosalie Bonheur"],
      "clues": [
        "I was a famous artist known for my realistic paintings.",
        "My favorite subjects were animals, which I studied closely.",
        "I often wore men's clothing to work in slaughterhouses and horse fairs without drawing attention.",
        "My most celebrated work depicts many powerful horses in a market.",
        "I was a French painter, and my most famous painting is 'The Horse Fair.'"
      ],
      "mcFallbackOptions": ["Rosa Bonheur", "Mary Cassatt", "Berthe Morisot", "Élisabeth Vigée Le Brun"],
      "funFact": "She had special permission from the police to wear trousers in public, which was unusual for women at the time."
    }
  ]
}
```
```
