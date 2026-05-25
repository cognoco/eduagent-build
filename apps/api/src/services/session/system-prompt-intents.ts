import type {
  MessageFeedbackAction,
  SystemPromptIntent,
  SystemPromptQuickChip,
} from '@eduagent/schemas';

/**
 * WI-373 — server-owned system-prompt resolution.
 *
 * The `POST /sessions/:sessionId/system-prompt` endpoint used to accept
 * arbitrary client `content` and replay it verbatim as a trusted
 * `role:'system'` LLM message. We inverted the trust: the client now sends a
 * typed intent (validated by `systemPromptIntentSchema`) and the server
 * resolves the canonical prompt string here. The client can no longer dictate
 * system-role text.
 *
 * These strings were moved verbatim from the mobile client (the only previous
 * source): the silence nudge from `use-session-streaming.ts`, the per-chip
 * steers from `QUICK_CHIP_CONFIG` and the per-action steers from the former
 * `systemPromptByAction` map in `use-session-actions.ts`. Behaviour is
 * unchanged — only the authorship moved server-side.
 */

const SILENCE_NUDGE_PROMPT =
  "Still working on it? Take your time - I'm here when you're ready.";

const QUICK_CHIP_PROMPTS: Record<SystemPromptQuickChip, string> = {
  hint: 'The learner tapped the hint chip. Give one short hint, not a full solution.',
  example:
    'The learner wants a fresh worked example. Use one similar example and keep it concise.',
  know_this:
    'The learner says they already know this. Briefly verify, then move forward or increase the challenge slightly.',
  explain_differently:
    'The learner wants a different explanation. Re-explain with a new angle and one concrete example.',
  too_easy:
    'The learner says this is too easy. Raise the challenge a little and ask for more independent thinking.',
  too_hard:
    'The learner says this is too hard. Lower the difficulty, add more structure, and keep the next step small.',
};

const MESSAGE_FEEDBACK_PROMPTS: Record<MessageFeedbackAction, string> = {
  helpful:
    'The learner marked the previous answer as helpful. Keep the same pace and level of guidance.',
  not_helpful:
    'The learner marked the previous answer as not helpful. Re-explain more clearly with one new example.',
  incorrect:
    'The learner believes the previous answer was incorrect. Correct it clearly, explain what changed, and continue from there.',
};

/**
 * Resolve a validated system-prompt intent to its canonical server-owned
 * prompt string. The switch is exhaustive over the discriminated union, so a
 * new intent kind is a compile error until it is handled here.
 */
export function resolveSystemPromptIntent(intent: SystemPromptIntent): string {
  switch (intent.kind) {
    case 'silence_nudge':
      return SILENCE_NUDGE_PROMPT;
    case 'quick_chip':
      return QUICK_CHIP_PROMPTS[intent.chip];
    case 'message_feedback':
      return MESSAGE_FEEDBACK_PROMPTS[intent.action];
  }
}
