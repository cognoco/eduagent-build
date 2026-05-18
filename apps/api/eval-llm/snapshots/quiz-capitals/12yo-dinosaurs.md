# Quiz — Capitals × 12yo-dinosaurs

> **Flow source:** `apps/api/src/services/quiz/generate-round.ts:buildCapitalsPrompt`
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
  "discoveryCount": 6,
  "ageBracket": "adolescent",
  "recentAnswers": [
    "Tokyo",
    "Paris",
    "Canberra"
  ],
  "interests": [
    {
      "label": "dinosaurs",
      "context": "both"
    },
    {
      "label": "fossils",
      "context": "both"
    },
    {
      "label": "paleontology",
      "context": "both"
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
You are generating a multiple-choice capitals quiz for a 12-year-old learner.

Activity: Capitals quiz
Choose a capitals theme that relates to the learner's interests: dinosaurs, fossils, paleontology. For example, if they love dinosaurs, pick "Capitals of countries with famous dinosaur fossil sites". Be creative — make the theme vivid and specific to these interests.
Library context: The learner is currently studying: Mesozoic era; fossilization; plate tectonics; long division. Where possible, prefer capitals of countries relevant to these topics.
Questions needed: exactly 6

Do NOT include questions about these recently seen capitals: Tokyo, Paris, Canberra

Rules:
- Generate exactly 6 questions
- Each question must have exactly 3 distractors
- Distractors must be plausible city names
- Fun facts should be surprising, age-appropriate, and one sentence maximum
- Keep the theme coherent across the full round

Respond with ONLY valid JSON in this shape:
{
  "theme": "Theme Name",
  "questions": [
    {
      "country": "Country Name",
      "correctAnswer": "Capital City",
      "distractors": ["City A", "City B", "City C"],
      "funFact": "One surprising fact about this capital."
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

## Live LLM response

```
```json
{
  "theme": "Capitals of Countries with Legendary Dinosaur Fossil Sites from the Mesozoic Era!",
  "questions": [
    {
      "country": "United States",
      "correctAnswer": "Washington, D.C.",
      "distractors": [
        "New York City",
        "Los Angeles",
        "Chicago"
      ],
      "funFact": "Washington, D.C. is not a state itself, but a special federal district, making it unique among capitals!"
    },
    {
      "country": "Canada",
      "correctAnswer": "Ottawa",
      "distractors": [
        "Toronto",
        "Vancouver",
        "Montreal"
      ],
      "funFact": "Ottawa is home to the Rideau Canal, which becomes the world's largest naturally frozen skating rink in winter!"
    },
    {
      "country": "Argentina",
      "correctAnswer": "Buenos Aires",
      "distractors": [
        "Cordoba",
        "Rosario",
        "Mendoza"
      ],
      "funFact": "Buenos Aires is often called the 'Paris of South America' due to its grand European-style architecture and vibrant culture!"
    },
    {
      "country": "China",
      "correctAnswer": "Beijing",
      "distractors": [
        "Shanghai",
        "Xi'an",
        "Guangzhou"
      ],
      "funFact": "Beijing is home to the Forbidden City, the world's largest ancient palace complex, which served as the imperial palace for over 500 years!"
    },
    {
      "country": "Mongolia",
      "correctAnswer": "Ulaanbaatar",
      "distractors": [
        "Erdenet",
        "Darkhan",
        "Choibalsan"
      ],
      "funFact": "Ulaanbaatar is considered one of the coldest capital cities in the world, with incredibly long and harsh winters!"
    },
    {
      "country": "Brazil",
      "correctAnswer": "Brasília",
      "distractors": [
        "Rio de Janeiro",
        "São Paulo",
        "Salvador"
      ],
      "funFact": "Brasília was meticulously planned and built in just a few years during the late 1950s, with its layout designed to resemble an airplane from above!"
    }
  ]
}
```
```
