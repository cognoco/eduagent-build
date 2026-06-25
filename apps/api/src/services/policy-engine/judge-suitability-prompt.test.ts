// ---------------------------------------------------------------------------
// Suitability-judge rubric prompt — unit tests (MMT-ADR-0016 §1/§2, judge
// framework phase 4 increment 1).
//
// Data minimization is enforced STRUCTURALLY: SuitabilityJudgeInput accepts
// only the tutor reply, the immediately-preceding learner message, the age
// band, and an optional language hint. There is no extra-history field to leak,
// and no IDs/metadata reach the prompt (those ride in routeAndCall options).
// ---------------------------------------------------------------------------

import { JUDGE_FLAG_CATEGORIES } from '@eduagent/schemas';
import {
  buildSuitabilityJudgePrompt,
  type SuitabilityJudgeInput,
} from './judge-suitability-prompt';

const baseInput: SuitabilityJudgeInput = {
  reply: 'Photosynthesis is how plants turn sunlight into energy.',
  precedingLearnerMessage: 'How do plants make food?',
  ageBracket: 'adolescent',
  conversationLanguage: 'en',
};

const fullText = (input: SuitabilityJudgeInput): string =>
  buildSuitabilityJudgePrompt(input)
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n');

describe('buildSuitabilityJudgePrompt', () => {
  it('returns a system + user ChatMessage pair', () => {
    const msgs = buildSuitabilityJudgePrompt(baseInput);
    expect(msgs.length).toBeGreaterThanOrEqual(2);
    expect(msgs[0]?.role).toBe('system');
    expect(msgs.some((m) => m.role === 'user')).toBe(true);
  });

  it('includes the tutor reply under review', () => {
    expect(fullText(baseInput)).toContain(baseInput.reply);
  });

  it('includes the immediately-preceding learner message', () => {
    expect(fullText(baseInput)).toContain(
      baseInput.precedingLearnerMessage as string,
    );
  });

  it('references every schema flag category (rubric ↔ schema coupling)', () => {
    const text = fullText(baseInput);
    for (const category of JUDGE_FLAG_CATEGORIES) {
      expect(text).toContain(category);
    }
  });

  it('frames over-blocking as a hard failure equal to under-blocking', () => {
    const text = fullText(baseInput).toLowerCase();
    expect(text).toMatch(/over-block/);
    expect(text).toMatch(/equal/);
  });

  it('instructs the exact verdict JSON shape (overall / flags / rationale)', () => {
    const text = fullText(baseInput);
    expect(text).toContain('overall');
    expect(text).toContain('flags');
    expect(text).toContain('rationale');
  });

  it('frames the learner age band', () => {
    expect(fullText(baseInput)).toContain('adolescent');
  });

  it('is model-agnostic — carries no vendor or model token', () => {
    const text = fullText(baseInput).toLowerCase();
    for (const token of [
      'haiku',
      'anthropic',
      'claude',
      'gpt',
      'openai',
      'cerebras',
      'gpt-oss',
      'gemini',
      'google',
      'mistral',
      'deepseek',
    ]) {
      expect(text).not.toContain(token);
    }
  });

  it('handles a null preceding message without leaking null/undefined literals', () => {
    const text = fullText({ ...baseInput, precedingLearnerMessage: null });
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
    // Still includes the reply being judged.
    expect(text).toContain(baseInput.reply);
  });
});
