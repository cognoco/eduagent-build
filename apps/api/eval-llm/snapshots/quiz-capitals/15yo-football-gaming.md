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
  "theme": "Capitals of Global Sports & Esports Powerhouses",
  "questions": [
    {
      "country": "Germany",
      "correctAnswer": "Berlin",
      "distractors": ["Munich", "Hamburg", "Frankfurt"],
      "funFact": "Berlin is home to the Olympic Stadium, a major venue for football, and has hosted League of Legends World Championship finals."
    },
    {
      "country": "France",
      "correctAnswer": "Paris",
      "distractors": ["Marseille", "Lyon", "Nice"],
      "funFact": "Paris's Parc des Princes is a historic football stadium, and the city has hosted numerous major esports events, including the Fortnite World Cup."
    },
    {
      "country": "Brazil",
      "correctAnswer": "Brasília",
      "distractors": ["Rio de Janeiro", "São Paulo", "Salvador"],
      "funFact": "Brasília is a unique planned city, inaugurated as the capital in 1960, and its Estádio Nacional Mané Garrincha hosted FIFA World Cup matches."
    },
    {
      "country": "South Korea",
      "correctAnswer": "Seoul",
      "distractors": ["Busan", "Incheon", "Daegu"],
      "funFact": "Seoul is often called the 'Esports Capital of the World' and boasts numerous dedicated esports stadiums and professional teams."
    },
    {
      "country": "Canada",
      "correctAnswer": "Ottawa",
      "distractors": ["Toronto", "Montreal", "Vancouver"],
      "funFact": "While not an NFL city, Canada is home to the CFL (Canadian Football League), and Ottawa's TD Place Stadium hosts a CFL team."
    },
    {
      "country": "Italy",
      "correctAnswer": "Rome",
      "distractors": ["Milan", "Florence", "Venice"],
      "funFact": "Rome's Stadio Olimpico is one of Europe's largest football stadiums and is home to two major Serie A clubs."
    }
  ]
}
```
```
