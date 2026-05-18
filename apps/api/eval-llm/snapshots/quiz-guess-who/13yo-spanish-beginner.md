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
  ],
  "interests": [
    {
      "label": "horses",
      "context": "free_time"
    },
    {
      "label": "showjumping",
      "context": "free_time"
    },
    {
      "label": "eventing",
      "context": "free_time"
    },
    {
      "label": "nature photography",
      "context": "free_time"
    }
  ],
  "libraryTopics": [
    "Spanish present tense verbs",
    "Spanish family vocabulary",
    "Spanish numbers 1-1000",
    "Spain geography"
  ],
  "ageYears": 13
}
```

## Generated prompt — system

```
You are generating a clue-by-clue Guess Who quiz for a 13-year-old learner.

Activity: Guess Who
Choose a theme of famous people connected to the learner's interests: horses, showjumping, eventing, nature photography.
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

- Fine-grained age: 13. Interests passed: horses, showjumping, eventing, nature photography.
- Library topics passed: Spanish present tense verbs; Spanish family vocabulary; Spanish numbers 1-1000; Spain geography.
- Topic titles passed: Spanish present tense verbs; Spanish family vocabulary; Spanish numbers 1-1000; Spain geography.

## Live LLM response

```
```json
{
  "theme": "Famous Figures: Equestrian, Art, & Nature",
  "questions": [
    {
      "canonicalName": "Rodrigo Díaz de Vivar",
      "era": "11th century",
      "acceptedAliases": ["El Cid", "Rodrigo Díaz"],
      "clues": [
        "I was a famous military leader in medieval Spain.",
        "My battles often involved powerful cavalry, making horses central to my strategy.",
        "I am remembered for my legendary horse, Babieca.",
        "My nickname means 'The Lord' or 'The Chief' in Arabic, given by my Moorish subjects.",
        "I captured the city of Valencia in 1094."
      ],
      "mcFallbackOptions": ["Rodrigo Díaz de Vivar", "Don Quixote", "Ferdinand Magellan", "Hernán Cortés"],
      "funFact": "My story is told in one of Spain's oldest epic poems, 'Cantar de mio Cid'."
    爐},
    {
      "canonicalName": "Francisco Goya",
      "era": "18th century",
      "acceptedAliases": ["Goya", "Francisco José de Goya y Lucientes"],
      "clues": [
        "I am a celebrated artist from Spain, active during the late 1700s and early 1800s.",
        "My work includes portraits of royalty, tapestries, and darker, more intense pieces reflecting my country's turmoil.",
        "I painted many scenes of Spanish life, including bullfighting and equestrian portraits.",
        "One of my most famous works is a series of prints called 'The Disasters of War'.",
        "My art spans periods from Rococo to Romanticism, showing a distinctive evolution."
      ],
      "mcFallbackOptions": ["Francisco Goya", "Diego Velázquez", "Pablo Picasso", "Salvador Dalí"],
      "funFact": "Despite significant deafness later in life, I continued to produce powerful and influential artworks."
    },
    {
      "canonicalName": "Ansel Adams",
      "era": "20th century",
      "acceptedAliases": ["Adams"],
      "clues": [
        "I was an American artist, primarily known for my work capturing natural landscapes.",
        "My unique photographic techniques emphasized sharp focus and a wide range of tones.",
        "I am particularly famous for my black and white images of U.S. National Parks.",
        "The majestic beauty of Yosemite National Park was a frequent subject of my lens.",
        "I helped develop the Zone System, a method for achieving optimal tonal control in photography."
      ],
      "mcFallbackOptions": ["Ansel Adams", "Dorothea Lange", "Edward Weston", "Galen Rowell"],
      "funFact": "I was also an environmentalist, advocating for the preservation of wilderness areas through my art."
    },
    {
      "canonicalName": "Charlotte Dujardin",
      "era": "21st century",
      "acceptedAliases": ["Dujardin", "Dame Charlotte Dujardin"],
      "clues": [
        "I am a highly decorated British athlete, known for my equestrian skills.",
        "I achieved significant success in the Olympic sport of dressage.",
        "My partnership with a horse named Valegro brought me international fame and multiple gold medals.",
        "I am one of the most successful British female Olympians in history.",
        "I became the first British woman to retain an individual Olympic equestrian title."
      ],
      "mcFallbackOptions": ["Charlotte Dujardin", "Isabell Werth", "Laura Kraut", "Pippa Funnell"],
      "funFact": "My legendary horse, Valegro, retired from competition with a special ceremony in 2016."
    }
  ]
}
```
```
