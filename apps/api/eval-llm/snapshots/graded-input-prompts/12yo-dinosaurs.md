# Language — Graded Input generation prompt × 12yo-dinosaurs

> **Flow source:** `apps/api/src/services/graded-input-prompts.ts:buildGradedInputGenerationPrompt`
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
| Preferred explanations | humor, examples, stories |
| Pace | quick |
| Analogy domain | nature |

## Builder input

```json
{
  "cefrLevel": null,
  "knownWords": [],
  "targetWords": [],
  "modality": "reading",
  "interests": [
    "dinosaurs",
    "fossils",
    "paleontology",
    "extinction events",
    "volcanoes"
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
Learner interests (weave in loosely if it fits naturally, do not force it): dinosaurs, fossils, paleontology, extinction events, volcanoes
```

## Builder notes

- Empty known vocabulary — exercises the complete-beginner branch.
- No target language set — falls back to "the target language".
- Anti-drift instruction: use ONLY provided vocabulary + basic function words.
