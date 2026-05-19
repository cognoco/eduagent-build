# Adaptive teaching — direct instruction + method preference × 17yo-french-advanced

> **Flow source:** `apps/api/src/services/adaptive-teaching.ts:getDirectInstructionPrompt+buildMethodPreferencePrompt`
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
  "topicTitle": "subjonctif imparfait",
  "concept": "subjonctif imparfait",
  "method": "step_by_step",
  "scenarioNote": "Direct-instruction switch on the profile's first recorded struggle (\"subjonctif imparfait\"); method preference = step_by_step."
}
```

## Generated prompt — system

```
The learner hasn't mastered "subjonctif imparfait" in "subjonctif imparfait" yet. Switch to direct instruction mode:

1. Acknowledge that this concept is challenging — they haven't got it *yet*, and that is okay.
2. Explain the concept clearly and directly with a concrete example.
3. Walk through the example step-by-step.
4. Use a "Not Yet" frame: "You're building understanding of this. Let's look at it from a different angle."
5. After explaining, ask the learner to restate the concept in their own words.
6. If the learner still struggles, that is a signal for Needs Deepening — this topic needs more time.

---

Teaching method preference: step_by_step
Break every explanation into clearly numbered steps.
Each step should build on the previous one. Keep steps small and focused.
Check understanding after each step before moving to the next.
```

## Generated prompt — user

```
Continue the exchange with the direct instruction frame above.
```

## Builder notes

- Direct-instruction switch on the profile's first recorded struggle ("subjonctif imparfait"); method preference = step_by_step.
- Receives (direct): topicTitle, concept — both sanitised via sanitizeXmlValue (200 chars).
- Receives (method): one of visual_diagrams / step_by_step / real_world_examples / practice_problems.
- Direct instruction fires after 3 strikes (DEFAULT_MAX_STRIKES).
- No personalization fields beyond struggle/method are read here — age/voice/interest tweaks would have to be added at the call site.
