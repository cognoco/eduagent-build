# Book Suggestion Regeneration × 15yo-football-gaming · relevance-diversity

> **Flow source:** `apps/api/src/services/book-suggestion-generation.ts:buildPrompt`
> **Profile:** 15-year-old US teen, English native, into football and competitive gaming, low patience for formality
> **Scenario:** `relevance-diversity`

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
  "subjectName": "football",
  "existingBookTitles": [
    "algebra equations",
    "US history: Civil War",
    "physics: forces and motion"
  ],
  "existingSuggestionTitles": [
    "More of the Same Basics",
    "Generic Study Skills"
  ],
  "studiedTopics": [
    "algebra equations",
    "US history: Civil War",
    "physics: forces and motion"
  ],
  "learnerAge": 15,
  "languageName": null,
  "notes": [
    "Suggestions should be relevant but not duplicates of studied topics.",
    "Descriptions should be varied enough to avoid a one-note shelf."
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
<subject_name>football</subject_name>
Studied topics so far:
- algebra equations
- US history: Civil War
- physics: forces and motion

EXISTING titles to avoid:
- algebra equations
- US history: Civil War
- physics: forces and motion
- More of the Same Basics
- Generic Study Skills

Generate the suggestions now.
```

## Builder notes

- subjectName: football
- learnerAge: 15
- studiedTopics: 3 (2+2 split path)
- existingTitles: 3 books + 2 suggestions to avoid
- Suggestions should be relevant but not duplicates of studied topics.
- Descriptions should be varied enough to avoid a one-note shelf.
