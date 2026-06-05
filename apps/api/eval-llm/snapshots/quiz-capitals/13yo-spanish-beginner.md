# Quiz — Capitals × 13yo-spanish-beginner

> **Flow source:** `apps/api/src/services/quiz/generate-round.ts:buildCapitalsPrompt`
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
  "discoveryCount": 6,
  "ageBracket": "adolescent",
  "recentAnswers": [
    "Madrid"
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
You are generating a multiple-choice capitals quiz for a 13-year-old learner.

Activity: Capitals quiz
Choose a capitals theme that relates to the learner's interests: horses, showjumping, eventing. For example, if they love dinosaurs, pick "Capitals of countries with famous dinosaur fossil sites". Be creative — make the theme vivid and specific to these interests.
Library context: The learner is currently studying: Spanish present tense verbs; Spanish family vocabulary; Spanish numbers 1-1000; Spain geography. Where possible, prefer capitals of countries relevant to these topics.
Questions needed: exactly 6

Do NOT include questions about these recently seen capitals: Madrid

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

- Fine-grained age: 13. Interests passed: horses, showjumping, eventing, nature photography.
- Library topics passed: Spanish present tense verbs; Spanish family vocabulary; Spanish numbers 1-1000; Spain geography.

## Live LLM response

```
```json
{
  "theme": "Capitals of Nations Galloping to Equestrian Glory",
  "questions": [
    {
      "country": "Germany",
      "correctAnswer": "Berlin",
      "distractors": ["Munich", "Hamburg", "Frankfurt"],
      "funFact": "Berlin's iconic Brandenburg Gate is topped with a chariot pulled by four horses, symbolizing peace and victory!"
    },
    {
      "country": "France",
      "correctAnswer": "Paris",
      "distractors": ["Lyon", "Marseille", "Nice"],
      "funFact": "Paris has hosted the equestrian events for the Olympic Games twice, first in 1900 and again in 1924!"
    },
    {
      "country": "Argentina",
      "correctAnswer": "Buenos Aires",
      "distractors": ["Córdoba", "Rosario", "Mendoza"],
      "funFact": "Buenos Aires is the home of 'Pato,' a national sport played on horseback that combines elements of polo and basketball."
    },
    {
      "country": "Mexico",
      "correctAnswer": "Mexico City",
      "distractors": ["Guadalajara", "Monterrey", "Puebla"],
      "funFact": "Mexico City hosted the 1968 Summer Olympics, showcasing impressive equestrian events to the world."
    },
    {
      "country": "United Kingdom",
      "correctAnswer": "London",
      "distractors": ["Manchester", "Edinburgh", "Liverpool"],
      "funFact": "London holds the unique record of hosting Olympic equestrian events three times: in 1908, 1948, and 2012!"
    },
    {
      "country": "Brazil",
      "correctAnswer": "Brasília",
      "distractors": ["Rio de Janeiro", "São Paulo", "Salvador"],
      "funFact": "Brasília is a futuristic, planned capital city built in just four years, featuring distinctive modernist architecture that includes sports complexes suitable for equestrian events."
    }
  ]
}
```
```
