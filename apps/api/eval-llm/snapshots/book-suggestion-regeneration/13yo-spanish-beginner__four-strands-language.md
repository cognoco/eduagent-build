# Book Suggestion Regeneration × 13yo-spanish-beginner · four-strands-language

> **Flow source:** `apps/api/src/services/book-suggestion-generation.ts:buildPrompt`
> **Profile:** 13-year-old EU girl, English native, learning Spanish (CEFR A2), loves horses and equestrian sports
> **Scenario:** `four-strands-language`

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
  "subjectName": "Spanish Four Strands practice",
  "existingBookTitles": [
    "Basic Greetings",
    "Connectors for Opinions"
  ],
  "existingSuggestionTitles": [
    "Vocabulary Flashcards"
  ],
  "studiedTopics": [
    "Useful input",
    "Meaning-focused output",
    "Language-focused learning",
    "Fluency practice"
  ],
  "learnerAge": 13,
  "languageName": "Spanish",
  "notes": [
    "Four Strands-adjacent language suggestions should include output, input, fluency, and form practice."
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

The subject is a language-learning subject. The learner is studying Spanish.

Language-specific rules:
- Suggestions should be practice lanes inside Spanish, not generic school subjects or the language name by itself.
- Prefer useful communication themes, vocabulary domains, grammar-in-context, pronunciation/listening practice, culture, media, and real-life situations.
- If the subject is Four Strands practice, make the set visibly cover all four strands across the four suggestions: meaning-focused input, meaning-focused output, language-focused learning/form, and fluency development.
- For Four Strands practice, make the strand visible in the descriptions; the fluency suggestion should use words like "fluency", "fluent", "smooth", or "natural speech".
- Titles should be concrete and pickable, like "Travel Conversations", "Music and Lyrics", or "Everyday Speaking".

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
<subject_name>Spanish Four Strands practice</subject_name>
Target language: <target_language>Spanish</target_language>
Studied topics so far:
- Useful input
- Meaning-focused output
- Language-focused learning
- Fluency practice

EXISTING titles to avoid:
- Basic Greetings
- Connectors for Opinions
- Vocabulary Flashcards

Generate the suggestions now.
```

## Builder notes

- subjectName: Spanish Four Strands practice
- languageName: Spanish
- learnerAge: 13
- studiedTopics: 4 (2+2 split path)
- existingTitles: 2 books + 1 suggestions to avoid
- Four Strands-adjacent language suggestions should include output, input, fluency, and form practice.
