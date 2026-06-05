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
  "theme": "Equestrian & Nature Icons",
  "questions": [
    {
      "canonicalName": "Francisco Goya",
      "era": "18th-19th century",
      "acceptedAliases": ["Goya", "Francisco de Goya"],
      "clues": [
        "This artist was a major figure in Spanish Romanticism.",
        "They served as a court painter for the Spanish Crown.",
        "Their 'Black Paintings' are famous for their dark and intense themes.",
        "They created powerful works like 'The Third of May 1808'.",
        "Known for depicting both royalty and common people, and occasionally horses in their art."
      ],
      "mcFallbackOptions": ["Francisco Goya", "Diego Velázquez", "El Greco", "Pablo Picasso"],
      "funFact": "Goya painted a famous portrait of the royal family, 'The Family of Charles IV', similar to Velázquez's 'Las Meninas'."
    },
    {
      "canonicalName": "Félix Rodríguez de la Fuente",
      "era": "20th century",
      "acceptedAliases": ["Félix Rodríguez", "Félix de la Fuente"],
      "clues": [
        "This conservationist was born in Spain and became a beloved public figure.",
        "They hosted popular nature documentaries, often filmed in their home country.",
        "Known for their work with animals, especially Iberian wolves and birds of prey.",
        "Their television series 'El hombre y la Tierra' (Man and Earth) was very influential.",
        "They educated millions about wildlife and protecting the environment."
      ],
      "mcFallbackOptions": ["Félix Rodríguez de la Fuente", "Jacques Cousteau", "David Attenborough", "Steve Irwin"],
      "funFact": "He was a trained falconer and played a key role in the reintroduction of certain birds of prey in Spain."
    },
    {
      "canonicalName": "Charlotte Dujardin",
      "era": "21st century",
      "acceptedAliases": ["Dujardin", "Dame Charlotte Dujardin"],
      "clues": [
        "This athlete is a highly decorated British Olympian.",
        "They are famous for their incredible skill in an equestrian discipline.",
        "Known for winning multiple gold medals in dressage.",
        "They formed a legendary partnership with their horse, Valegro.",
        "Often called the 'queen of dressage' due to their record-breaking scores."
      ],
      "mcFallbackOptions": ["Charlotte Dujardin", "Isabell Werth", "Anky van Grunsven", "Laura Graves"],
      "funFact": "She holds all three world records in dressage: Grand Prix, Grand Prix Special, and Grand Prix Freestyle."
    },
    {
      "canonicalName": "Ansel Adams",
      "era": "20th century",
      "acceptedAliases": ["Adams", "Ansel Easton Adams"],
      "clues": [
        "This American artist revolutionized landscape depiction.",
        "They were a passionate environmentalist and advocate for wilderness preservation.",
        "Known for stunning black and white photographs of natural scenes.",
        "Their iconic images often feature national parks, especially Yosemite.",
        "They helped develop the 'Zone System' to achieve precise tonal control in their prints."
      ],
      "mcFallbackOptions": ["Ansel Adams", "Dorothea Lange", "Edward Weston", "Galen Rowell"],
      "funFact": "He was also a talented classical pianist before dedicating his life to photography."
    }
  ]
}
```
```
