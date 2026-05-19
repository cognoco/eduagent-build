# Book Suggestion Regeneration × 17yo-french-advanced · source-neutral

> **Flow source:** `apps/api/src/services/book-suggestion-generation.ts:buildPrompt`
> **Profile:** 17-year-old EU teen, Czech native but conversational French with tutor, advanced French (CEFR B2), literature and philosophy
> **Scenario:** `source-neutral`

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
  "subjectName": "History",
  "existingBookTitles": [
    "Causes of World War I"
  ],
  "existingSuggestionTitles": [],
  "studiedTopics": [
    "Alliances",
    "Militarism",
    "July Crisis"
  ],
  "learnerAge": 17,
  "languageName": null,
  "notes": [
    "Descriptions must stay source-neutral: no precise unsourced dates, percentages, or overconfident claims."
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
<subject_name>History</subject_name>
Studied topics so far:
- Alliances
- Militarism
- July Crisis

EXISTING titles to avoid:
- Causes of World War I

Generate the suggestions now.
```

## Builder notes

- subjectName: History
- learnerAge: 17
- studiedTopics: 3 (2+2 split path)
- existingTitles: 1 books + 0 suggestions to avoid
- Descriptions must stay source-neutral: no precise unsourced dates, percentages, or overconfident claims.
