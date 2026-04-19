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
  ]
}
```

## Generated prompt — system

```
You are generating a clue-by-clue Guess Who quiz for a 14+ learner.

Activity: Guess Who
Choose an age-appropriate theme (for example "Famous Scientists" or "Important World Leaders").
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

- Uses topicTitles — the one existing library-topic integration.
- Interests NOT passed — wouldn't know a football fan should see more athletes.
- Cultural context (location, nativeLanguage, conversationLanguage) NOT passed — can't weight locally-recognizable figures.
- Struggles NOT passed — can't reinforce previously-missed historical figures.
