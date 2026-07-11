# Language — Graded Input generation prompt × 13yo-spanish-beginner

> **Flow source:** `apps/api/src/services/graded-input-prompts.ts:buildGradedInputGenerationPrompt`
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
| Preferred explanations | step-by-step, examples |
| Pace | thorough |
| Analogy domain | nature |

## Builder input

```json
{
  "languageCode": "es",
  "cefrLevel": "A2",
  "knownWords": [
    "el caballo",
    "la escuela",
    "el perro"
  ],
  "targetWords": [],
  "modality": "reading",
  "interests": [
    "horses",
    "showjumping",
    "eventing",
    "nature photography"
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
Write the passage in Spanish.
CEFR level: A2.
Modality: reading (will be read silently).
Known vocabulary: el caballo, la escuela, el perro
Target vocabulary (must appear in the passage): NONE
Learner interests (weave in loosely if it fits naturally, do not force it): horses, showjumping, eventing, nature photography
```

## Builder notes

- 3 known vocabulary item(s).
- Target language: es.
- Anti-drift instruction: use ONLY provided vocabulary + basic function words.
