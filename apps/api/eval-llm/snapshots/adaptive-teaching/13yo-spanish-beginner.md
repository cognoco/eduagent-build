# Adaptive teaching — direct instruction + method preference × 13yo-spanish-beginner

> **Flow source:** `apps/api/src/services/adaptive-teaching.ts:getDirectInstructionPrompt+buildMethodPreferencePrompt`
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
  "topicTitle": "ser vs estar",
  "concept": "ser vs estar",
  "method": "step_by_step",
  "scenarioNote": "Direct-instruction switch on the profile's first recorded struggle (\"ser vs estar\"); method preference = step_by_step."
}
```

## Generated prompt — system

```
The learner hasn't mastered "ser vs estar" in "ser vs estar" yet. Switch to direct instruction mode:

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

- Direct-instruction switch on the profile's first recorded struggle ("ser vs estar"); method preference = step_by_step.
- Receives (direct): topicTitle, concept — both sanitised via sanitizeXmlValue (200 chars).
- Receives (method): one of visual_diagrams / step_by_step / real_world_examples / practice_problems.
- Direct instruction fires after 3 strikes (DEFAULT_MAX_STRIKES).
- No personalization fields beyond struggle/method are read here — age/voice/interest tweaks would have to be added at the call site.
