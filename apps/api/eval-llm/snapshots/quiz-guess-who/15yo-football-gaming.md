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
| Preferred explanations | examples, analogies |
| Pace | quick |
| Analogy domain | sports |

## Builder input

```json
{
  "discoveryCount": 4,
  "ageBracket": "adolescent",
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
  "theme": "Greats of Science, History, and Sport",
  "questions": [
    {
      "canonicalName": "Isaac Newton",
      "era": "17th century",
      "acceptedAliases": ["Newton", "Sir Isaac Newton"],
      "clues": [
        "My work profoundly shaped our understanding of the physical world.",
        "I am famously associated with an apple falling from a tree.",
        "My three laws describe motion and are fundamental to physics.",
        "I also developed calculus, a key branch of mathematics.",
        "I held the position of Lucasian Professor of Mathematics at Cambridge University."
      ],
      "mcFallbackOptions": ["Isaac Newton", "Galileo Galilei", "Albert Einstein", "Johannes Kepler"],
      "funFact": "I also served as the Warden and Master of the Royal Mint, combating counterfeiting."
    },
    {
      "canonicalName": "Robert E. Lee",
      "era": "19th century",
      "acceptedAliases": ["Lee", "General Lee"],
      "clues": [
        "I was a prominent military officer during a major conflict in American history.",
        "Though offered command of the Union Army, I chose to lead forces from my home state.",
        "I commanded the Army of Northern Virginia.",
        "I surrendered my forces at Appomattox Court House.",
        "I was a key general for the Confederacy during the American Civil War."
      ],
      "mcFallbackOptions": ["Robert E. Lee", "Ulysses S. Grant", "Stonewall Jackson", "William Tecumseh Sherman"],
      "funFact": "After the war, I became president of Washington College, now Washington and Lee University."
    },
    {
      "canonicalName": "Tom Brady",
      "era": "21st century",
      "acceptedAliases": ["Brady", "TB12", "G.O.A.T."],
      "clues": [
        "I am known for an exceptionally long and successful career in a major American sport.",
        "My position is often considered the most important on the field.",
        "I hold numerous records for Super Bowl wins and passing yards.",
        "I played for the New England Patriots for two decades before finishing my career with the Tampa Bay Buccaneers.",
        "I am widely regarded as the greatest quarterback in NFL history."
      ],
      "mcFallbackOptions": ["Tom Brady", "Patrick Mahomes", "Peyton Manning", "Aaron Rodgers"],
      "funFact": "I was drafted 199th overall in the 2000 NFL Draft, making me a huge underdog success story."
    },
    {
      "canonicalName": "Lee Sang-hyeok",
      "era": "21st century",
      "acceptedAliases": ["Faker", "The Unkillable Demon King"],
      "clues": [
        "I am a highly influential figure in the world of competitive online gaming.",
        "My main role in the game is typically mid-lane.",
        "I have won multiple world championships in a popular multiplayer online battle arena (MOBA) game.",
        "I am from South Korea and play for the team T1.",
        "I am known as the greatest professional League of Legends player of all time."
      ],
      "mcFallbackOptions": ["Lee Sang-hyeok", "Uzi", "Daigo Umehara", "s1mple"],
      "funFact": "I am one of only two players to have won four League of Legends World Championship titles."
    }
  ]
}
```
```
