# Adaptive teaching — direct instruction + method preference × 11yo-czech-animals

> **Flow source:** `apps/api/src/services/adaptive-teaching.ts:getDirectInstructionPrompt+buildMethodPreferencePrompt`
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
| Learning mode | casual |
| Preferred explanations | stories, examples |
| Pace | thorough |
| Analogy domain | nature |

## Builder input

```json
{
  "topicTitle": "fraction addition",
  "concept": "fraction addition",
  "method": "real_world_examples",
  "scenarioNote": "Direct-instruction switch on the profile's first recorded struggle (\"fraction addition\"); method preference = real_world_examples."
}
```

## Generated prompt — system

```
The learner hasn't mastered "fraction addition" in "fraction addition" yet. Switch to direct instruction mode:

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

- Direct-instruction switch on the profile's first recorded struggle ("fraction addition"); method preference = real_world_examples.
- Receives (direct): topicTitle, concept — both sanitised via sanitizeXmlValue (200 chars).
- Receives (method): one of visual_diagrams / step_by_step / real_world_examples / practice_problems.
- Direct instruction fires after 3 strikes (DEFAULT_MAX_STRIKES).
- No personalization fields beyond struggle/method are read here — age/voice/interest tweaks would have to be added at the call site.
