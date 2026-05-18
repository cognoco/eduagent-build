# Quiz — Capitals × 15yo-football-gaming

> **Flow source:** `apps/api/src/services/quiz/generate-round.ts:buildCapitalsPrompt`
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
  "discoveryCount": 6,
  "ageBracket": "adult",
  "recentAnswers": [
    "Washington D.C.",
    "London"
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
      "context": "both"
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
You are generating a multiple-choice capitals quiz for a 15-year-old learner.

Activity: Capitals quiz
Choose a capitals theme that relates to the learner's interests: football, NFL, esports. For example, if they love dinosaurs, pick "Capitals of countries with famous dinosaur fossil sites". Be creative — make the theme vivid and specific to these interests.
Library context: The learner is currently studying: algebra equations; US history: Civil War; physics: forces and motion. Where possible, prefer capitals of countries relevant to these topics.
Questions needed: exactly 6

Do NOT include questions about these recently seen capitals: Washington D.C., London

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

- Fine-grained age: 15. Interests passed: football, NFL, esports, competitive gaming, sports statistics.
- Library topics passed: algebra equations; US history: Civil War; physics: forces and motion.

## Live LLM response

```
```json
{
  "theme": "Capitals of Countries with Major Esports Scenes and Scientific Prowess",
  "questions": [
    {
      "country": "South Korea",
      "correctAnswer": "Seoul",
      "distractors": ["Busan", "Incheon", "Daegu"],
      "funFact": "Seoul is home to the world's first professional esports stadium, which opened in 2005!"
    },
    {
      "country": "Germany",
      "correctAnswer": "Berlin",
      "distractors": ["Munich", "Hamburg", "Frankfurt"],
      "funFact": "The Reichstag building in Berlin features a stunning glass dome that offers panoramic views and is a marvel of modern engineering, showcasing principles of forces and design."
    },
    {
      "country": "China",
      "correctAnswer": "Beijing",
      "distractors": ["Shanghai", "Guangzhou", "Shenzhen"],
      "funFact": "Beijing is home to the Forbidden City, the largest ancient palace complex in the world, which was built with meticulous mathematical precision over 14 years!"
    },
    {
      "country": "Sweden",
      "correctAnswer": "Stockholm",
      "distractors": ["Gothenburg", "Malmö", "Uppsala"],
      "funFact": "The Nobel Prizes, including those for Physics and Economic Sciences (related to algebra), are awarded annually in Stockholm."
    },
    {
      "country": "France",
      "correctAnswer": "Paris",
      "distractors": ["Marseille", "Lyon", "Nice"],
      "funFact": "The Eiffel Tower in Paris can actually shrink by up to 15 cm (6 inches) in cold weather due to the thermal contraction of its metal, a fascinating physics phenomenon!"
    },
    {
      "country": "Denmark",
      "correctAnswer": "Copenhagen",
      "distractors": ["Aarhus", "Odense", "Aalborg"],
      "funFact": "Copenhagen is home to the Niels Bohr Institute, where the groundbreaking physicist Niels Bohr developed his model of the atom, significantly advancing our understanding of forces and particles."
    }
  ]
}
```
```
