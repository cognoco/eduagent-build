# Quiz — Guess Who × 15yo-football-gaming

> **Flow source:** `apps/api/src/services/quiz/guess-who-provider.ts:buildGuessWhoPrompt`
> **Profile:** 15-year-old US teen, English native, into football and competitive gaming, low patience for formality

## Profile summary

| Field | Value |
|---|---|
| Age | 15 years (birth year 2011) |
| Native language | en |
| Conversation language | en |
| Location | US |
| Pronouns | he/him |
| Interests | football (free time), NFL (free time), esports (free time), competitive gaming (free time), sports statistics (both) |
| Library topics | algebra equations, US history: Civil War, physics: forces and motion |
| CEFR | — |
| Target language | — |
| Struggles | factoring polynomials (math); Reconstruction era (history) |
| Strengths | mental arithmetic (math); Newton's laws (physics) |
| Learning mode | casual |
| Preferred explanations | examples, analogies |
| Pace | quick |
| Analogy domain | sports |

## Builder input

```json
{
  "discoveryCount": 4,
  "ageBracket": "adult",
  "recentAnswers": [
    "Abraham Lincoln"
  ],
  "topicTitles": [
    "algebra equations",
    "US history: Civil War",
    "physics: forces and motion"
  ],
  "interests": [
    {
      "label": "football",
      "context": "free_time"
    },
    {
      "label": "NFL",
      "context": "free_time"
    },
    {
      "label": "esports",
      "context": "free_time"
    },
    {
      "label": "competitive gaming",
      "context": "free_time"
    },
    {
      "label": "sports statistics",
      "context": "free_time"
    }
  ],
  "libraryTopics": [
    "algebra equations",
    "US history: Civil War",
    "physics: forces and motion"
  ],
  "ageYears": 15
}
```

## Generated prompt — system

```
You are generating a clue-by-clue Guess Who quiz for a 15-year-old learner.

Activity: Guess Who
Choose a theme of famous people connected to the learner's interests: football, NFL, esports, competitive gaming, sports statistics.
Questions needed: exactly 4

Do NOT repeat these recently seen people: Abraham Lincoln
Topic hints from the learner's active curriculum: algebra equations; US history: Civil War; physics: forces and motion. At least 2 of the 4 people MUST relate clearly to one or more of those topics.

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

- Fine-grained age: 15. Interests passed: football, NFL, esports, competitive gaming, sports statistics.
- Library topics passed: algebra equations; US history: Civil War; physics: forces and motion.
- Topic titles passed: algebra equations; US history: Civil War; physics: forces and motion.

## Live LLM response

```
```json
{
  "theme": "Legends of Sport, Science, and Strategy",
  "questions": [
    {
      "canonicalName": "Isaac Newton",
      "era": "17th century",
      "acceptedAliases": ["Newton", "Sir Isaac Newton"],
      "clues": [
        "I was born in England and lived during a time of great scientific discovery.",
        "My work profoundly shaped our understanding of how the universe works, especially regarding movement.",
        "A famous story, possibly apocryphal, involves a fruit falling from a tree that sparked one of my greatest insights.",
        "I formulated three fundamental laws that describe how objects move and interact.",
        "I developed calculus and defined universal gravitation."
      ],
      "mcFallbackOptions": ["Isaac Newton", "Albert Einstein", "Galileo Galilei", "Johannes Kepler"],
      "funFact": "He also served as the Master of the Royal Mint."
    },
    {
      "canonicalName": "Ulysses S. Grant",
      "era": "19th century",
      "acceptedAliases": ["Grant", "U.S. Grant", "Hiram Ulysses Grant"],
      "clues": [
        "I was a key figure in a major conflict in American history.",
        "I led an army to victory during this conflict, ultimately playing a critical role in preserving the union.",
        "Before my military career, I struggled in various civilian jobs, including farming.",
        "After the war, I went on to become the 18th president of my country.",
        "I accepted the surrender of the Confederacy's main army at Appomattox."
      ],
      "mcFallbackOptions": ["Ulysses S. Grant", "Robert E. Lee", "Andrew Johnson", "William T. Sherman"],
      "funFact": "He was a skilled horseman and loved horses throughout his life."
    },
    {
      "canonicalName": "Stephen Curry",
      "era": "21st century",
      "acceptedAliases": ["Curry", "Steph Curry"],
      "clues": [
        "I am known for my incredible skill in a popular team sport played with a ball and a hoop.",
        "I play professionally in North America and have won multiple championships.",
        "My father was also a professional player in the same sport.",
        "I revolutionized how my sport is played, especially with my long-range shooting ability.",
        "I am a point guard for the Golden State Warriors and hold many three-point records."
      ],
      "mcFallbackOptions": ["Stephen Curry", "LeBron James", "Michael Jordan", "Kevin Durant"],
      "funFact": "He holds the NBA record for the most three-pointers made in a single season."
    },
    {
      "canonicalName": "Lee Sang-hyeok",
      "era": "21st century",
      "acceptedAliases": ["Faker", "Lee Sang-hyeok", "Unkillable Demon King"],
      "clues": [
        "I am globally recognized as a legendary competitor in a very popular online team game.",
        "My main role in the game is typically the 'mid-laner', requiring immense skill and strategy.",
        "I have won the highest international championship title in my field multiple times with the same team.",
        "I play for a South Korean esports organization that is one of the most dominant in history.",
        "I am considered the greatest League of Legends player of all time, known for my team T1."
      ],
      "mcFallbackOptions": ["Lee Sang-hyeok", "Olof Kajbjer Gustafsson", "Oleksandr Kostyliev", "Nicolai Reedtz"],
      "funFact": "He started his professional career in 2013 and has been consistently at the top."
    }
  ]
}
```
```
