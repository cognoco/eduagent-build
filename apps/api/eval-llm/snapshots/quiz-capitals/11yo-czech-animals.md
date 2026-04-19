# Quiz — Capitals × 11yo-czech-animals

> **Flow source:** `apps/api/src/services/quiz/generate-round.ts:buildCapitalsPrompt`
> **Profile:** 11-year-old EU girl, Czech native, youngest in the target range, loves animals and nature, thorough pacer

## Profile summary

| Field | Value |
|---|---|
| Age | 11 years (birth year 2015) |
| Native language | cs |
| Conversation language | cs |
| Location | EU |
| Pronouns | — (not provided) |
| Interests | horses (free time), forest animals (free time), nature journaling (both), drawing (free time) |
| Library topics | Czech reading comprehension, basic fractions, human body systems, water cycle |
| CEFR | — |
| Target language | — |
| Struggles | fraction addition (math); long multi-clause sentences (reading) |
| Strengths | vocabulary retention (Czech) |
| Learning mode | casual |
| Preferred explanations | stories, examples |
| Pace | thorough |
| Analogy domain | nature |

## Builder input

```json
{
  "discoveryCount": 6,
  "ageBracket": "adolescent",
  "recentAnswers": [],
  "interests": [
    {
      "label": {
        "label": "horses",
        "context": "free_time"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "forest animals",
        "context": "free_time"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "nature journaling",
        "context": "both"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "drawing",
        "context": "free_time"
      },
      "context": "free_time"
    }
  ],
  "libraryTopics": [
    "Czech reading comprehension",
    "basic fractions",
    "human body systems",
    "water cycle"
  ],
  "ageYears": 11
}
```

## Generated prompt — system

```
You are generating a multiple-choice capitals quiz for a 11-year-old learner.

Activity: Capitals quiz
Choose a capitals theme that relates to the learner's interests: [object Object], [object Object], [object Object]. For example, if they love dinosaurs, pick "Capitals of countries with famous dinosaur fossil sites". Be creative — make the theme vivid and specific to these interests.
Library context: The learner is currently studying: Czech reading comprehension; basic fractions; human body systems; water cycle. Where possible, prefer capitals of countries relevant to these topics.
Questions needed: exactly 6

No exclusions.

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

- Fine-grained age: 11. Interests passed: [object Object], [object Object], [object Object], [object Object].
- Library topics passed: Czech reading comprehension; basic fractions; human body systems; water cycle.
