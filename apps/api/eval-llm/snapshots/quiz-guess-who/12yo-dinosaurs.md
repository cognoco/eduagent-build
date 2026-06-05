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
  "theme": "Paleontology Pioneers & Earth's Storytellers",
  "questions": [
    {
      "canonicalName": "Charles Darwin",
      "era": "19th century",
      "acceptedAliases": ["Darwin", "C. Darwin"],
      "clues": [
        "My work profoundly changed how we understand life's diversity.",
        "I sailed around the world on a ship called the Beagle.",
        "Observations on a group of islands helped inspire my most famous theory.",
        "The study of finches on the Galápagos was key to my ideas.",
        "My major book introduced the concept of natural selection."
      ],
      "mcFallbackOptions": ["Charles Darwin", "Alfred Russel Wallace", "Carl Linnaeus", "Gregor Mendel"],
      "funFact": "He initially studied medicine and theology before becoming a naturalist."
    },
    {
      "canonicalName": "Alfred Wegener",
      "era": "20th century",
      "acceptedAliases": ["Wegener", "A. Wegener"],
      "clues": [
        "I was a meteorologist and polar researcher.",
        "I proposed that Earth's landmasses were once joined.",
        "My theory explained why identical fossils were found on distant continents.",
        "I introduced the idea of 'Pangaea,' a supercontinent.",
        "My most famous theory is about continental drift."
      ],
      "mcFallbackOptions": ["Alfred Wegener", "Arthur Holmes", "Harry Hess", "Marie Tharp"],
      "funFact": "He died during an expedition in Greenland while searching for supplies."
    },
    {
      "canonicalName": "Georges Cuvier",
      "era": "18th/19th century",
      "acceptedAliases": ["Cuvier", "Baron Cuvier"],
      "clues": [
        "I was a French naturalist who focused on animal anatomy.",
        "I am considered a founder of vertebrate paleontology.",
        "My studies of fossils led me to propose that species could go extinct.",
        "I used comparative anatomy to reconstruct ancient animals from bone fragments.",
        "I described the giant fossil ground sloths from South America."
      ],
      "mcFallbackOptions": ["Georges Cuvier", "Jean-Baptiste Lamarck", "Richard Owen", "William Buckland"],
      "funFact": "He was a strong proponent of catastrophism, the idea that Earth's history was shaped by sudden, violent events."
    },
    {
      "canonicalName": "Sue Hendrickson",
      "era": "20th/21st century",
      "acceptedAliases": ["Hendrickson", "S. Hendrickson"],
      "clues": [
        "I am known for my adventurous spirit and love of discovery.",
        "I've found many important fossils, both on land and underwater.",
        "My most famous discovery was made in South Dakota.",
        "I unearthed one of the largest and most complete Tyrannosaurus rex skeletons ever found.",
        "The famous T. rex fossil, 'Sue,' is named after me."
      ],
      "mcFallbackOptions": ["Sue Hendrickson", "Jack Horner", "Paul Sereno", "Robert Bakker"],
      "funFact": "Before becoming a fossil hunter, she worked as a commercial diver and was involved in marine archaeology."
    }
  ]
}
```
```
