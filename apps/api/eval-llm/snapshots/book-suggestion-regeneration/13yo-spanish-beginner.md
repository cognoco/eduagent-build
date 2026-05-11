# Book Suggestion Regeneration × 13yo-spanish-beginner

> **Flow source:** `apps/api/src/services/book-suggestion-generation.ts:buildPrompt`
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
  "subjectName": "horses",
  "existingBookTitles": [
    "Spanish present tense verbs",
    "Spanish family vocabulary"
  ],
  "existingSuggestionTitles": [],
  "studiedTopics": [
    "Spanish present tense verbs",
    "Spanish family vocabulary",
    "Spanish numbers 1-1000",
    "Spain geography"
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
<subject_name>horses</subject_name>
Studied topics so far:
- Spanish present tense verbs
- Spanish family vocabulary
- Spanish numbers 1-1000
- Spain geography

EXISTING titles to avoid:
- Spanish present tense verbs
- Spanish family vocabulary

Generate the suggestions now.
```

## Builder notes

- subjectName: horses
- studiedTopics: 4 (2+2 split path)
- existingTitles: 2 books + 0 suggestions to avoid
