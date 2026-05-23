# Anthropic Response Format × 12yo-dinosaurs

> **Flow source:** `apps/api/src/services/llm/providers/anthropic.ts:toAnthropicFormat`
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
  "responseFormat": "json",
  "messages": [
    {
      "role": "system",
      "content": "You classify learner intent. Return exactly the requested JSON shape."
    },
    {
      "role": "user",
      "content": "Classify this request: \"Can you make me a quick quiz about volcanoes?\""
    }
  ]
}
```

## Generated prompt — system

```
You classify learner intent. Return exactly the requested JSON shape.

Respond with a single JSON object only. No prose, no markdown, no code fences.
```

## Generated prompt — user

```
[
  {
    "role": "user",
    "content": "Classify this request: \"Can you make me a quick quiz about volcanoes?\""
  }
]
```

## Builder notes

- Transport snapshot for Anthropic responseFormat=json conversion.
