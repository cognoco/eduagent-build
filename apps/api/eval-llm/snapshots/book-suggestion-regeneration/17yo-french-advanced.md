# Book Suggestion Regeneration × 17yo-french-advanced

> **Flow source:** `apps/api/src/services/book-suggestion-generation.ts:buildPrompt`
> **Profile:** 17-year-old EU teen, Czech native but conversational French with tutor, advanced French (CEFR B2), literature and philosophy

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
  "subjectName": "French literature",
  "existingBookTitles": [
    "Camus — L'Étranger",
    "French subjunctive"
  ],
  "existingSuggestionTitles": [],
  "studiedTopics": [
    "Camus — L'Étranger",
    "French subjunctive",
    "essay structure",
    "Enlightenment thinkers"
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
<subject_name>French literature</subject_name>
Studied topics so far:
- Camus — L'Étranger
- French subjunctive
- essay structure
- Enlightenment thinkers

EXISTING titles to avoid:
- Camus — L'Étranger
- French subjunctive

Generate the suggestions now.
```

## Builder notes

- subjectName: French literature
- studiedTopics: 4 (2+2 split path)
- existingTitles: 2 books + 0 suggestions to avoid
