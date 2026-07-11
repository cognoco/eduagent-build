# Language — Graded Input generation prompt × 17yo-french-advanced

> **Flow source:** `apps/api/src/services/graded-input-prompts.ts:buildGradedInputGenerationPrompt`
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
| Preferred explanations | step-by-step, analogies |
| Pace | thorough |
| Analogy domain | music |

## Builder input

```json
{
  "languageCode": "fr",
  "cefrLevel": "B2",
  "knownWords": [
    "l'angoisse",
    "le fardeau",
    "éphémère"
  ],
  "targetWords": [],
  "modality": "reading",
  "interests": [
    "French literature",
    "philosophy",
    "existentialism",
    "creative writing"
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
Write the passage in French.
CEFR level: B2.
Modality: reading (will be read silently).
Known vocabulary: l'angoisse, le fardeau, éphémère
Target vocabulary (must appear in the passage): NONE
Learner interests (weave in loosely if it fits naturally, do not force it): French literature, philosophy, existentialism, creative writing
```

## Builder notes

- 3 known vocabulary item(s).
- Target language: fr.
- Anti-drift instruction: use ONLY provided vocabulary + basic function words.
