# Language — Graded Input generation prompt × 11yo-czech-animals

> **Flow source:** `apps/api/src/services/graded-input-prompts.ts:buildGradedInputGenerationPrompt`
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
| Preferred explanations | stories, examples |
| Pace | thorough |
| Analogy domain | nature |

## Builder input

```json
{
  "cefrLevel": null,
  "knownWords": [],
  "targetWords": [],
  "modality": "reading",
  "interests": [
    "horses",
    "forest animals",
    "nature journaling",
    "drawing"
  ]
}
```

## Generated prompt — system

```
You are a language-learning content writer. Your only task is to write a
short passage for a learner to read or hear, using ONLY the vocabulary you
are given, plus one or two comprehension questions about that passage.

Rules:
1. Use ONLY vocabulary from the known-words and target-words lists provided,
   plus basic function words (articles, pronouns, conjunctions, common verbs
   like "to be"/"to have") that are unavoidable for grammar. Do NOT introduce
   other content words, names, or topics not implied by the provided vocabulary
   and interests.
2. If the known-words list is empty, treat the learner as a complete beginner:
   write the simplest possible passage using target words plus minimal
   grammar glue, introducing each target word naturally.
3. Keep the passage short: 2-5 sentences.
4. Write EXACTLY ONE comprehension question in the SAME target language,
   with a short answerHint (a phrase or sentence from the passage that
   answers it).

Return ONLY a single JSON object — no prose, no explanation, no code fence,
nothing before or after it. The object must have EXACTLY this shape:
{
  "text": "<the passage, in the target language>",
  "comprehensionQuestions": [
    { "prompt": "<question, in the target language>", "answerHint": "<short answer hint>" }
  ]
}
```

## Generated prompt — user

```
Write the passage in the target language.
CEFR level: A1.
Modality: reading (will be read silently).
Known vocabulary: NONE
Target vocabulary (must appear in the passage): NONE
Learner interests (weave in loosely if it fits naturally, do not force it): horses, forest animals, nature journaling, drawing
```

## Builder notes

- Empty known vocabulary — exercises the complete-beginner branch.
- No target language set — falls back to "the target language".
- Anti-drift instruction: use ONLY provided vocabulary + basic function words.
