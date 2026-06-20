import type { CoLearningPromptPayload } from '@eduagent/schemas';
import { RateLimitedError } from '@eduagent/schemas';

import {
  NUDGE_QUIET_HOURS_END,
  NUDGE_QUIET_HOURS_START,
  NUDGE_RATE_LIMIT,
  NUDGE_WINDOW_HOURS,
} from './nudge';

const DISALLOWED_FRAMING = [
  /\bquiz\b/i,
  /\bprove\b/i,
  /\bchecking\b/i,
  /\bowe\b/i,
  /\byou must\b/i,
  /\bparent wants\b/i,
  /\bmum wants\b/i,
  /\bmom wants\b/i,
  /\bdad wants\b/i,
];

export class CoLearningPromptPolicyError extends Error {
  readonly code = 'CO_LEARNING_PROMPT_POLICY_VIOLATION';

  constructor(message: string) {
    super(message);
    this.name = 'CoLearningPromptPolicyError';
  }
}

export interface CoLearningPromptPolicyInput {
  supportershipId: string;
  supporterPersonId: string;
  supporteePersonId: string;
  suggestedText: string;
  recentPromptCount?: number;
  now?: Date;
  timezone?: string;
}

function isQuietHours(now: Date, timezone: string | undefined): boolean {
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone ?? 'UTC',
      }).format(now),
    );
    return hour >= NUDGE_QUIET_HOURS_START || hour < NUDGE_QUIET_HOURS_END;
  } catch {
    return false;
  }
}

export function assertCoLearningPromptAllowed(
  input: CoLearningPromptPolicyInput,
): CoLearningPromptPayload & { quietHours: boolean } {
  const text = input.suggestedText.trim();
  if (!text) {
    throw new CoLearningPromptPolicyError('Prompt text is required.');
  }
  if (DISALLOWED_FRAMING.some((pattern) => pattern.test(text))) {
    throw new CoLearningPromptPolicyError(
      'Co-learning prompts must be optional connection invitations.',
    );
  }
  if ((input.recentPromptCount ?? 0) >= NUDGE_RATE_LIMIT) {
    throw new RateLimitedError(
      `Co-learning prompts are limited to ${NUDGE_RATE_LIMIT} per ${NUDGE_WINDOW_HOURS} hours.`,
      'CO_LEARNING_PROMPT_RATE_LIMITED',
    );
  }

  return {
    supportershipId: input.supportershipId,
    supporterPersonId: input.supporterPersonId,
    supporteePersonId: input.supporteePersonId,
    suggestedText: text,
    dismissible: true,
    fillOnly: true,
    readReceipt: false,
    quietHours: isQuietHours(input.now ?? new Date(), input.timezone),
  };
}
