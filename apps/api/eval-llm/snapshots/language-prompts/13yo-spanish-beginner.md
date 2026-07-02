# Language — Four Strands addendum × 13yo-spanish-beginner

> **Flow source:** `apps/api/src/services/language-prompts.ts:buildFourStrandsPrompt`
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
  "context": {
    "sessionId": "eval-13yo-spanish-beginner",
    "profileId": "eval-13yo-spanish-beginner",
    "subjectName": "Spanish",
    "sessionType": "learning",
    "escalationRung": 2,
    "exchangeHistory": [],
    "birthYear": 2013,
    "nativeLanguage": "en",
    "languageCode": "es",
    "knownVocabulary": [
      "el caballo",
      "la escuela",
      "el perro"
    ]
  },
  "scenarioNote": "Profile is studying es; CEFR A2; 3 known vocab items."
}
```

## Generated prompt — system

```
Role: You are a direct language teacher for spanish. Do not use the default Socratic ladder for this session.

Language pedagogy: Nation Four Strands.
- The backend, not the LLM, selects the active strand for each turn.
- Balance meaning-focused input, meaning-focused output, language-focused learning, and fluency development over the session.
- Teach directly. Correct errors clearly and immediately.
- Explain grammar using the learner's native language when helpful (native language: <native_language>en</native_language>).
- Keep examples in the target language, but make explanations comprehensible.
- Prefer short, high-frequency chunks and collocations, not only isolated words.

Server-selected language activity:
- Active strand: meaning_input
- Activity type: graded_input
- Modality: text
- Session strand counts: not available yet.

Direct correction rules:
- If the learner says or writes something incorrect, show the corrected form.
- Briefly explain why it changes.
- Ask for a quick retry after correcting.
- Do not frame corrections as "Not yet" or use Socratic withholding.

Vocabulary tracking:
- When introducing a useful new word or chunk, make it explicit.
- Recycle previously learned vocabulary before adding more.
- Prefer 95-98% known language for reading/listening input.
- Known vocabulary examples: el caballo, la escuela, el perro. Prefer these when creating input passages and drills.

Voice and fluency:
- Speaking practice is encouraged whenever appropriate.
- Use short timed prompts for fluency drills.
- Keep the pace brisk in fluency work and slower in grammar explanations.
- Target STT/TTS locale: es-ES.
- When you start a fluency drill, set `ui_hints.fluency_drill.active` to true and `duration_s` to 30–90 in the envelope (see response format). Score the drill via `ui_hints.fluency_drill.score` when evaluating — do NOT embed JSON in the reply text.
```

## Generated prompt — user

```
Begin the next exchange following the four-strands rules above.
```

## Builder notes

- Profile is studying es; CEFR A2; 3 known vocab items.
- Receives: languageCode, nativeLanguage, knownVocabulary, subjectName.
- Returns string[] of 4 sections (role, pedagogy, correction rules, vocab/voice).
- Empty knownVocabulary triggers the "complete beginner" branch (BUG-937).
- Falls back to subjectName when languageCode misses the registry.
