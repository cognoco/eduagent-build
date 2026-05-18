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
| Learning mode | serious |
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
  "theme": "Capitals of Countries with Legendary Equestrian History and Modern Showjumping Stars!",
  "questions": [
    {
      "country": "Argentina",
      "correctAnswer": "Buenos Aires",
      "distractors": [
        "Córdoba",
        "Rosario",
        "Mendoza"
      ],
      "funFact": "Buenos Aires boasts the widest avenue in the world, Avenida 9 de Julio, which has up to 16 lanes!"
    },
    {
      "country": "Mexico",
      "correctAnswer": "Mexico City",
      "distractors": [
        "Guadalajara",
        "Monterrey",
        "Puebla"
      ],
      "funFact": "Mexico City is built on what was once an ancient lake, and it's actually sinking a few inches every year!"
    },
    {
      "country": "Colombia",
      "correctAnswer": "Bogotá",
      "distractors": [
        "Medellín",
        "Cali",
        "Cartagena"
      ],
      "funFact": "Bogotá is the third-highest capital city in the world, sitting over 8,660 feet above sea level in the Andes mountains."
    },
    {
      "country": "France",
      "correctAnswer": "Paris",
      "distractors": [
        "Marseille",
        "Lyon",
        "Nice"
      ],
      "funFact": "There's a secret apartment at the very top of the Eiffel Tower that its designer, Gustave Eiffel, used for entertaining important guests."
    },
    {
      "country": "Germany",
      "correctAnswer": "Berlin",
      "distractors": [
        "Munich",
        "Hamburg",
        "Frankfurt"
      ],
      "funFact": "Berlin has more bridges than Venice, with around 1,700 bridges crisscrossing its many canals and rivers."
    },
    {
      "country": "Netherlands",
      "correctAnswer": "Amsterdam",
      "distractors": [
        "Rotterdam",
        "The Hague",
        "Utrecht"
      ],
      "funFact": "Amsterdam has more bicycles than residents, with over 800,000 bikes navigating its charming streets and canals."
    }
  ]
}
```
```
