# Book Suggestion Regeneration × 17yo-french-advanced · age-register-adult

> **Flow source:** `apps/api/src/services/book-suggestion-generation.ts:buildPrompt`
> **Profile:** 17-year-old EU teen, Czech native but conversational French with tutor, advanced French (CEFR B2), literature and philosophy
> **Scenario:** `age-register-adult`

## Profile summary

| Field | Value |
|---|---|
| Age | 17 years (birth year 2009) |
| Native language | cs |
| Conversation language | fr |
| Location | EU |
| Pronouns | they/them |
| Interests | French literature (both), philosophy (both), existentialism (free time), creative writing (free time) |
| Library topics | Camus — L'Étranger, French subjunctive, essay structure, Enlightenment thinkers |
| CEFR | B2 |
| Target language | fr |
| Struggles | subjonctif imparfait (French); nuanced connectors (French) |
| Strengths | reading comprehension (French); essay argument structure (writing) |
| Learning mode | serious |
| Preferred explanations | step-by-step, analogies |
| Pace | thorough |
| Analogy domain | music |

## Builder input

```json
{
  "subjectName": "Biology for an 18-year-old adult learner",
  "existingBookTitles": [
    "Human Biology",
    "Cell Structure"
  ],
  "existingSuggestionTitles": [
    "Tiny Cell Facts"
  ],
  "studiedTopics": [
    "Homeostasis",
    "Cell membranes",
    "Digestive system"
  ],
  "learnerAge": 18,
  "languageName": null,
  "notes": [
    "Adult learner register: no childish framing, stickers, or tiny novelty books."
  ]
}
```

## Generated prompt — system

```
You are MentoMate's curriculum architect proposing fresh book-level suggestions inside an existing subject.

Audience and naming style:
- Use the learner age as a curriculum register, not as a gimmick.
- For ages 18+, use clear adult-learning titles: direct, specific, and calm.
- For ages 11-17, use accessible school-age language, but never preschool, early-reader, or babyish wording.
- Avoid cutesy labels, exclamation marks, "amazing/wonders/tiny/my body" phrasing, and mascot-like enthusiasm.
- Prefer subject-native terms when they are understandable, with descriptions carrying any needed simplification.

Return exactly 4 suggestions: 2 with category "related" (built on the studied topics) and 2 with category "explore" (adjacent areas the learner has not seen yet).

Rules:
- Each suggestion has: title (1-200 chars), description (1+ chars), emoji (1+ chars), category ("related" or "explore").
- Titles MUST NOT be (case-insensitive) equivalent to any title in the EXISTING list.
- Titles MUST NOT duplicate each other.
- If the subject name or existing context says adult or 18+, use adult-learning register: direct, specific, calm, and never childish.
- Avoid tiny/novelty/remedial shelves. Do not use "Tiny", "Quick Tricks", "Basics" duplicates, "Amazing", "Wonders", sticker-like, or mascot-like framing when the existing shelf already covers basics.
- Descriptions must be source-neutral learning objectives, not factual mini-lessons. Do not include precise dates, years, century/decade labels, percentages, statistics, or unsupported factual specifics anywhere. Forbidden examples: "1914", "summer of 1914", "early 20th century", "1940s", "80%". For history/science, prefer "investigate evidence" or "compare explanations" over asserting facts that require a source.

Return ONLY valid JSON in this exact shape:
{"suggestions":[{"title":"...","description":"...","emoji":"...","category":"related"}]}
```

## Generated prompt — user

```
<subject_name>Biology for an 18-year-old adult learner</subject_name>
Studied topics so far:
- Homeostasis
- Cell membranes
- Digestive system

EXISTING titles to avoid:
- Human Biology
- Cell Structure
- Tiny Cell Facts

Generate the suggestions now.
```

## Builder notes

- subjectName: Biology for an 18-year-old adult learner
- learnerAge: 18
- studiedTopics: 3 (2+2 split path)
- existingTitles: 2 books + 1 suggestions to avoid
- Adult learner register: no childish framing, stickers, or tiny novelty books.
