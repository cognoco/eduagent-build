import type { LearningSession, SessionSummary } from '@eduagent/schemas';
import { uuidv7 } from 'uuidv7';

let counter = 0;

export function buildSession(
  overrides?: Partial<LearningSession>
): LearningSession {
  counter++;
  const now = new Date().toISOString();
  return {
    id: uuidv7(),
    subjectId: uuidv7(),
    topicId: null,
    sessionType: 'learning',
    verificationType: null,
    status: 'active',
    escalationRung: 1,
    exchangeCount: 0,
    startedAt: now,
    lastActivityAt: now,
    endedAt: null,
    durationSeconds: null,
    ...overrides,
  };
}

export function buildSessionSummary(
  overrides?: Partial<SessionSummary>
): SessionSummary {
  return {
    id: uuidv7(),
    sessionId: uuidv7(),
    content: `Summary content ${counter}`,
    aiFeedback: null,
    status: 'pending',
    ...overrides,
  };
}

/** Reset the internal counter — useful in test `beforeEach` blocks. */
export function resetSessionCounter(): void {
  counter = 0;
}
