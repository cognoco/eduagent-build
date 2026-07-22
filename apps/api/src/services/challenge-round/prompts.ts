import { MAX_CHALLENGE_QUESTIONS } from './caps';

export const challengeOfferPrompt = `
The learner has shown solid grasp of this topic across several exchanges and the system rules them ELIGIBLE for a Challenge Round.

If — and only if — the learner's last message reads as confident and complete, you MAY offer a Challenge Round.
Emit the offer by setting "signals.challenge_round_offer": true and writing a single-sentence invitation in "reply", e.g.:
  "You've got the basics — want a challenge round where you explain this in depth, and I'll turn your answers into a note?"

Never offer if the learner sounds tired, confused, or is mid-question. Do not offer twice in the same session.
`.trim();

// The inline evaluation prose injected into the active prompt when the tutor
// (not a separate grader) is responsible for emitting challenge_round_evaluation.
// Extracted so buildChallengeRoundActivePrompt() can gate it on the grader flag.
const CHALLENGE_ROUND_EVAL_PROSE = `- After EACH learner answer, emit "signals.challenge_round_evaluation" with ONE item describing the concept assessed, result in {solid, partial, missing, misconception}, the learner answer event id, and a short \`learnerQuote\` copied from the learner's answer.`;

function buildActivePromptString(includeEvalProse: boolean): string {
  const evalLine = includeEvalProse ? `\n${CHALLENGE_ROUND_EVAL_PROSE}` : '';
  return `
You are now running a Challenge Round. The learner accepted. Ask ONE deeper question at a time that requires them to:
- explain WHY something works (not what it is)
- compare/contrast two related ideas
- apply the idea to a new context
- teach the concept back in their own words

Constraints:
- Maximum ${MAX_CHALLENGE_QUESTIONS} questions per round (do not exceed; the server will cap).
- One question per turn. No multi-part questions.
- Use the prior lesson and earlier Challenge turns as context: ask a new transfer or reasoning question, not an exact repeat or the same underlying problem.
- Match the learner's age and energy. Do not use academic jargon.${evalLine}
- When all questions are answered, proceed to drafting. The server drives the active→drafting transition from the evaluation signals — do not emit any additional field to signal completion.

Failure framing is banned. Never use "failed", "wrong", "incorrect", "struggle", "weak". Use "got it", "close", "let's tighten this", "not quite yet".
`.trim();
}

// Baseline constant — grader OFF (tutor emits inline). Byte-identical to the
// original string; kept as a named export so existing tests reference it directly.
export const challengeRoundActivePrompt = buildActivePromptString(true);

/**
 * Build the active-round system-prompt block with the grader flag applied.
 * When graderEnabled is true, the "emit signals.challenge_round_evaluation"
 * prose line is omitted — the grader owns that signal; the tutor converses only.
 * Default (false) is byte-identical to the challengeRoundActivePrompt constant.
 */
export function buildChallengeRoundActivePrompt(graderEnabled = false): string {
  return buildActivePromptString(!graderEnabled);
}

export const challengeRoundDraftingPrompt = `
The Challenge Round is complete. Draft a learner-owned note in "ui_hints.note_draft.content".

Hard rules:
- Use ONLY content the learner actually said in their challenge answers. Do not invent facts they did not state.
- Pull from the \`learnerQuote\` values attached to concepts the evaluation marked "solid". Do NOT include partial, missing, or misconception concepts.
- If a concept is marked solid but its \`learnerQuote\` is vague ("yes", "got it", "I know"), exclude it from the draft rather than inventing detail.
- 2-5 short sentences. Written in the learner's voice ("I learned that...", "in my own words...").
- Title is NOT included; the note system handles that.

In "reply", briefly tell the learner what you've drafted, e.g.:
  "Here's what you now know — based on your own words. You can save it, edit it, or skip."

If no concepts were solid, do NOT emit a note_draft. Instead set "reply" to something supportive like:
  "We're close on this — let's revisit it next time and tighten one piece together."
`.trim();
