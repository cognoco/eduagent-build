# Book Suggestion Regeneration × 12yo-dinosaurs

> **Flow source:** `apps/api/src/services/book-suggestion-generation.ts:buildPrompt`
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
  "subjectName": "dinosaurs",
  "existingBookTitles": [
    "Mesozoic era",
    "fossilization"
  ],
  "existingSuggestionTitles": [],
  "studiedTopics": [
    "Mesozoic era",
    "fossilization",
    "plate tectonics",
    "long division"
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

Return ONLY valid JSON in this exact shape:
{"suggestions":[{"title":"...","description":"...","emoji":"...","category":"related"}]}
```

## Generated prompt — user

```
<subject_name>dinosaurs</subject_name>
Studied topics so far:
- Mesozoic era
- fossilization
- plate tectonics
- long division

EXISTING titles to avoid:
- Mesozoic era
- fossilization

Generate the suggestions now.
```

## Builder notes

- subjectName: dinosaurs
- studiedTopics: 4 (2+2 split path)
- existingTitles: 2 books + 0 suggestions to avoid
