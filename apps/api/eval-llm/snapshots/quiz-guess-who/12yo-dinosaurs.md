# Quiz — Guess Who × 12yo-dinosaurs

> **Flow source:** `apps/api/src/services/quiz/guess-who-provider.ts:buildGuessWhoPrompt`
> **Profile:** 12-year-old US boy, English native, obsessed with dinosaurs and prehistoric life, quick pace, humor works

## Profile summary

| Field | Value |
|---|---|
| Age | 12 years (birth year 2014) |
| Native language | en |
| Conversation language | en |
| Location | US |
| Pronouns | — (not provided) |
| Interests | dinosaurs (both), fossils (both), paleontology (both), extinction events (free time), volcanoes (free time) |
| Library topics | Mesozoic era, fossilization, plate tectonics, long division |
| CEFR | — |
| Target language | — |
| Struggles | long division (math); Austria vs Australia (geography) |
| Strengths | dinosaur classification (science); reading comprehension (reading) |
| Learning mode | casual |
| Preferred explanations | humor, examples, stories |
| Pace | quick |
| Analogy domain | nature |

## Builder input

```json
{
  "discoveryCount": 4,
  "ageBracket": "adolescent",
  "recentAnswers": [
    "Mary Anning"
  ],
  "topicTitles": [
    "Mesozoic era",
    "fossilization",
    "plate tectonics",
    "long division"
  ],
  "interests": [
    {
      "label": "dinosaurs",
      "context": "free_time"
    },
    {
      "label": "fossils",
      "context": "free_time"
    },
    {
      "label": "paleontology",
      "context": "free_time"
    },
    {
      "label": "extinction events",
      "context": "free_time"
    },
    {
      "label": "volcanoes",
      "context": "free_time"
    }
  ],
  "libraryTopics": [
    "Mesozoic era",
    "fossilization",
    "plate tectonics",
    "long division"
  ],
  "ageYears": 12
}
```

## Generated prompt — system

```
You are generating a clue-by-clue Guess Who quiz for a 12-year-old learner.

Activity: Guess Who
Choose a theme of famous people connected to the learner's interests: dinosaurs, fossils, paleontology, extinction events, volcanoes.
Questions needed: exactly 4

Do NOT repeat these recently seen people: Mary Anning
Topic hints from the learner's active curriculum: Mesozoic era; fossilization; plate tectonics; long division. At least 2 of the 4 people MUST relate clearly to one or more of those topics.

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

- Fine-grained age: 12. Interests passed: dinosaurs, fossils, paleontology, extinction events, volcanoes.
- Library topics passed: Mesozoic era; fossilization; plate tectonics; long division.
- Topic titles passed: Mesozoic era; fossilization; plate tectonics; long division.

## Live LLM response

```
```json
{
  "theme": "Discovering Earth's Ancient Past",
  "questions": [
    {
      "canonicalName": "Alfred Wegener",
      "era": "Early 20th century",
      "acceptedAliases": ["Wegener", "Alfred Lothar Wegener"],
      "clues": [
        "I was a German scientist who studied Earth's weather and its landforms.",
        "I proposed that the continents once fit together like puzzle pieces.",
        "My idea was called \"continental drift.\"",
        "People didn't believe me at first, but later evidence supported my theory.",
        "My work helped pave the way for the modern theory of plate tectonics."
      ],
      "mcFallbackOptions": ["Alfred Wegener", "Charles Darwin", "Marie Curie", "Albert Einstein"],
      "funFact": "I was also a polar explorer and died during an expedition in Greenland."
    },
    {
      "canonicalName": "Gideon Mantell",
      "era": "19th century",
      "acceptedAliases": ["Mantell", "Dr. Mantell"],
      "clues": [
        "I was a doctor and a keen fossil collector in England.",
        "My wife discovered large, unusual teeth while I was visiting a patient.",
        "I realized these teeth belonged to a giant plant-eating reptile, not a rhino.",
        "I named this creature \"Iguanodon,\" after the modern iguana.",
        "My discovery was one of the first scientifically recognized dinosaurs."
      ],
      "mcFallbackOptions": ["Gideon Mantell", "William Buckland", "Richard Owen", "Charles Darwin"],
      "funFact": "I often kept my fossil specimens at home, turning my house into a museum."
    },
    {
      "canonicalName": "Richard Owen",
      "era": "19th century",
      "acceptedAliases": ["Owen", "Sir Richard Owen"],
      "clues": [
        "I was an English anatomist and zoologist.",
        "I studied ancient reptile fossils from the Mesozoic Era.",
        "I noticed that some of these giant reptiles shared certain characteristics.",
        "I came up with a special new name to group them together in 1842.",
        "The name I created means \"terrible lizard.\""
      ],
      "mcFallbackOptions": ["Richard Owen", "Georges Cuvier", "Gideon Mantell", "Charles Lyell"],
      "funFact": "I helped establish the Natural History Museum in London."
    },
    {
      "canonicalName": "Georges Cuvier",
      "era": "Late 18th - Early 19th century",
      "acceptedAliases": ["Cuvier"],
      "clues": [
        "I was a French naturalist and zoologist.",
        "I studied fossils from the Paris Basin, comparing them to living animals.",
        "I showed that some fossil animals were completely different from any living species.",
        "This led me to propose that past catastrophes wiped out entire groups of life.",
        "My work helped establish the concept that species can become extinct."
      ],
      "mcFallbackOptions": ["Georges Cuvier", "Carl Linnaeus", "Jean-Baptiste Lamarck", "Alfred Russel Wallace"],
      "funFact": "I was a pioneer in the field of comparative anatomy."
    }
  ]
}
```
```
