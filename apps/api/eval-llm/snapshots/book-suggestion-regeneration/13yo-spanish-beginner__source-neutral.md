# Book Suggestion Regeneration × 13yo-spanish-beginner · source-neutral

> **Flow source:** `apps/api/src/services/book-suggestion-generation.ts:buildPrompt`
> **Profile:** 13-year-old EU girl, English native, learning Spanish (CEFR A2), loves horses and equestrian sports
> **Scenario:** `source-neutral`

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
  "learnerAge": 13,
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
- learnerAge: 13
- studiedTopics: 3 (2+2 split path)
- existingTitles: 1 books + 0 suggestions to avoid
- Descriptions must stay source-neutral: no precise unsourced dates, percentages, or overconfident claims.
