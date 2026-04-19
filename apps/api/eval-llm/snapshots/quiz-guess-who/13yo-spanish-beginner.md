# Quiz — Guess Who × 13yo-spanish-beginner

> **Flow source:** `apps/api/src/services/quiz/guess-who-provider.ts:buildGuessWhoPrompt`
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
  "discoveryCount": 4,
  "ageBracket": "adolescent",
  "recentAnswers": [],
  "topicTitles": [
    "Spanish present tense verbs",
    "Spanish family vocabulary",
    "Spanish numbers 1-1000",
    "Spain geography"
  ]
}
```

## Generated prompt — system

```
You are generating a clue-by-clue Guess Who quiz for a 10-13 learner.

Activity: Guess Who
Choose an age-appropriate theme (for example "Famous Scientists" or "Important World Leaders").
Questions needed: exactly 4

No recent-person exclusions.
Topic hints from the learner's active curriculum: Spanish present tense verbs; Spanish family vocabulary; Spanish numbers 1-1000; Spain geography. At least 2 of the 4 people MUST relate clearly to one or more of those topics.

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
