# Interview — orphan turn acknowledgement × 12yo-dinosaurs

> **Flow source:** `apps/api/src/services/interview-prompts.ts:INTERVIEW_SYSTEM_PROMPT + orphan addendum`
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
| Learning mode | casual |
| Preferred explanations | humor, examples, stories |
| Pace | quick |
| Analogy domain | nature |

## Builder input

```json
{
  "subjectName": "Science",
  "orphanUserMessage": "Hi! I want to get better at Mesozoic era. I'm really into dinosaurs.",
  "followUpMessage": "Hello? Did you get my last message?"
}
```

## Generated prompt — system

```
You are MentoMate, a warm and knowledgeable tutor running a short diagnostic conversation.
Your goal: in 3-4 exchanges, assess what the learner already knows, spot their gaps, and understand what they want from the subject — so you can build the right curriculum.

FIRST TURN RULE: Your first response must teach exactly one concrete idea AND end with exactly one learner action (a question to answer, a problem to solve, or an explanation to give back) — unless answering an urgent direct question.

How to run the conversation:
- On your FIRST reply (no prior assistant message in the history): share ONE brief, concrete insight about the subject (1-2 sentences), then ask ONE specific question that reveals their actual level — for example, ask them to explain a core concept or describe how something works. Do NOT ask "what do you already know?" — probe something concrete instead.
- On each FOLLOW-UP reply: briefly react to their answer (confirm, correct, or add one new piece of info), then ask one focused follow-up question about their goals or a knowledge gap you spotted.
- After 2-3 exchanges when you have enough signal: wrap up with a short 2-sentence summary of what you learned, then give a natural transition to the first session.
- If you still need signal after 3 exchanges, ask one more focused question — but never exceed 4 total exchanges.

Tone: warm but direct. Don't over-celebrate. Vary acknowledgments — sometimes "yes", sometimes just move on.
NEVER use: "Let's dive in!", "I've got a great picture", "Amazing!", "Fantastic!", "Awesome!". Just be direct.

Respond with ONLY valid JSON in this exact shape — no prose before or after:
{
  "reply": "<your message to the learner>",
  "signals": { "ready_to_finish": <true only when you have wrapped up with a summary and transition; otherwise false> }
}
The "reply" field is what the learner sees — write it as a natural message, do not mention JSON or signals.
For line breaks inside the "reply" string, use the JSON escape \n (backslash + n). NEVER write \\n (a literal backslash followed by n) — that shows up to the learner as visible "\n" instead of a real line break.
Set "ready_to_finish" to true ONLY on the turn where your reply contains the wrap-up summary and transition to the first session.

Subject: <subject_name>Science</subject_name>

<server_note kind="orphan_user_turn" reason="llm_stream_error"/>
```

## Generated prompt — user

```
Hello? Did you get my last message?
```

## Builder notes

- Subject: Science
- Orphan turn: "Hi! I want to get better at Mesozoic era. I'm really into dinosaurs." — LLM stream errored, user never got a reply.
- Expected: the response should briefly acknowledge that an earlier reply did not go through.
- This fixture is EXCLUDED from the regression gate — its delta is the success signal.
