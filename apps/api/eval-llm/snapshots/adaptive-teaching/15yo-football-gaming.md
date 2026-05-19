# Adaptive teaching — direct instruction + method preference × 15yo-football-gaming

> **Flow source:** `apps/api/src/services/adaptive-teaching.ts:getDirectInstructionPrompt+buildMethodPreferencePrompt`
> **Profile:** 15-year-old US teen, English native, into football and competitive gaming, low patience for formality

## Profile summary

| Field | Value |
|---|---|
| Age | 15 years (birth year 2011) |
| Native language | en |
| Conversation language | en |
| Location | US |
| Pronouns | he/him |
| Interests | football (free time), NFL (free time), esports (free time), competitive gaming (free time), sports statistics (both) |
| Library topics | algebra equations, US history: Civil War, physics: forces and motion |
| CEFR | — |
| Target language | — |
| Struggles | factoring polynomials (math); Reconstruction era (history) |
| Strengths | mental arithmetic (math); Newton's laws (physics) |
| Preferred explanations | examples, analogies |
| Pace | quick |
| Analogy domain | sports |

## Builder input

```json
{
  "topicTitle": "factoring polynomials",
  "concept": "factoring polynomials",
  "method": "real_world_examples",
  "scenarioNote": "Direct-instruction switch on the profile's first recorded struggle (\"factoring polynomials\"); method preference = real_world_examples."
}
```

## Generated prompt — system

```
The learner hasn't mastered "factoring polynomials" in "factoring polynomials" yet. Switch to direct instruction mode:

1. Acknowledge that this concept is challenging — they haven't got it *yet*, and that is okay.
2. Explain the concept clearly and directly with a concrete example.
3. Walk through the example step-by-step.
4. Use a "Not Yet" frame: "You're building understanding of this. Let's look at it from a different angle."
5. After explaining, ask the learner to restate the concept in their own words.
6. If the learner still struggles, that is a signal for Needs Deepening — this topic needs more time.

---

Teaching method preference: real_world_examples
Ground every concept in a real-world analogy or example.
Connect abstract ideas to everyday experiences the learner can relate to.
Use stories, scenarios, and practical applications to make concepts tangible.
```

## Generated prompt — user

```
Continue the exchange with the direct instruction frame above.
```

## Builder notes

- Direct-instruction switch on the profile's first recorded struggle ("factoring polynomials"); method preference = real_world_examples.
- Receives (direct): topicTitle, concept — both sanitised via sanitizeXmlValue (200 chars).
- Receives (method): one of visual_diagrams / step_by_step / real_world_examples / practice_problems.
- Direct instruction fires after 3 strikes (DEFAULT_MAX_STRIKES).
- No personalization fields beyond struggle/method are read here — age/voice/interest tweaks would have to be added at the call site.
