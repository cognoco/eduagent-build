# Book Suggestion Regeneration × 11yo-czech-animals · duplicate-tiny-avoidance

> **Flow source:** `apps/api/src/services/book-suggestion-generation.ts:buildPrompt`
> **Profile:** 11-year-old EU girl, Czech native, youngest in the target range, loves animals and nature, thorough pacer
> **Scenario:** `duplicate-tiny-avoidance`

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
  "subjectName": "Mathematics",
  "existingBookTitles": [
    "Fractions Basics",
    "Adding Fractions",
    "Multiplying Fractions",
    "Fraction Word Problems"
  ],
  "existingSuggestionTitles": [
    "Fractions Basics",
    "Quick Fraction Tricks",
    "Tiny Fractions"
  ],
  "studiedTopics": [
    "Equivalent fractions",
    "Adding unlike denominators",
    "Mixed numbers",
    "Fraction word problems"
  ],
  "learnerAge": 11,
  "languageName": null,
  "notes": [
    "Avoid duplicate/tiny books; suggest a substantial next direction with distinct titles."
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
<subject_name>Mathematics</subject_name>
Studied topics so far:
- Equivalent fractions
- Adding unlike denominators
- Mixed numbers
- Fraction word problems

EXISTING titles to avoid:
- Fractions Basics
- Adding Fractions
- Multiplying Fractions
- Fraction Word Problems
- Fractions Basics
- Quick Fraction Tricks
- Tiny Fractions

Generate the suggestions now.
```

## Builder notes

- subjectName: Mathematics
- learnerAge: 11
- studiedTopics: 4 (2+2 split path)
- existingTitles: 4 books + 3 suggestions to avoid
- Avoid duplicate/tiny books; suggest a substantial next direction with distinct titles.
