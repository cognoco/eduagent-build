import type { Database } from '@eduagent/database';

import { validateNoticeEvidence } from '../../src/services/mentor-notices/evidence';
import { PROFILES } from '../fixtures/profiles';
import { homeworkNoticeFlow } from './homework-notice';

describe('homeworkNoticeFlow', () => {
  it('covers genuine-slip and clean-homework prompt branches', () => {
    const profile = PROFILES[0];
    if (!profile) throw new Error('Expected at least one eval profile');
    const scenarios = homeworkNoticeFlow.enumerateScenarios?.(profile);

    expect(scenarios?.map((scenario) => scenario.scenarioId)).toEqual([
      'genuine-slip',
      'clean-homework',
    ]);
    for (const scenario of scenarios ?? []) {
      const messages = homeworkNoticeFlow.buildPrompt(scenario.input);
      expect(messages.system).toContain('signals.noticed_gap');
      expect(messages.system).toContain('Do not promise a future check-in');
      expect(
        homeworkNoticeFlow.evaluateDeterministic?.({
          input: scenario.input,
          messages,
          profile,
          scenarioId: scenario.scenarioId,
        }),
      ).toEqual([]);
    }
  });

  it('rejects a fabricated quote at the server evidence boundary', async () => {
    const db = {
      query: {
        sessionEvents: {
          findFirst: jest.fn().mockResolvedValue({
            id: '550e8400-e29b-41d4-a716-446655440020',
            content: 'I added three to both sides, so x equals eight.',
          }),
        },
      },
    } as unknown as Database;

    await expect(
      validateNoticeEvidence(
        db,
        '550e8400-e29b-41d4-a716-446655440021',
        '550e8400-e29b-41d4-a716-446655440022',
        {
          concept: 'Cellular respiration',
          answerEventId: '550e8400-e29b-41d4-a716-446655440020',
          learnerQuote: 'Mitochondria make cellular energy.',
        },
      ),
    ).resolves.toBeNull();
  });

  it('treats observed=false as no noticed gap in the quality gate', async () => {
    const profile = PROFILES[0];
    if (!profile) throw new Error('Expected at least one eval profile');
    const scenario = (
      homeworkNoticeFlow.enumerateScenarios?.(profile) ?? []
    ).find((candidate) => candidate.scenarioId === 'clean-homework');
    if (!scenario) throw new Error('Expected the clean-homework eval scenario');

    const issues = await homeworkNoticeFlow.evaluateQuality?.({
      input: scenario.input,
      messages: homeworkNoticeFlow.buildPrompt(scenario.input),
      profile,
      scenarioId: scenario.scenarioId,
      liveResponse: JSON.stringify({
        reply: 'That is correct.',
        signals: {
          noticed_gap: {
            observed: false,
            concept: '',
            correctionHint: '',
            answerEventId: '',
            learnerQuote: '',
          },
        },
      }),
    });

    expect(issues).toEqual([]);
  });

  it('flags provenance failures and visible future promises', async () => {
    const profile = PROFILES[0];
    if (!profile) throw new Error('Expected at least one eval profile');
    const scenarios = homeworkNoticeFlow.enumerateScenarios?.(profile);
    const scenario = scenarios?.find(
      (candidate) => candidate.scenarioId === 'genuine-slip',
    );
    if (!scenario) throw new Error('Expected the genuine-slip eval scenario');
    const issues = await homeworkNoticeFlow.evaluateQuality?.({
      input: scenario.input,
      messages: homeworkNoticeFlow.buildPrompt(scenario.input),
      profile,
      scenarioId: scenario.scenarioId,
      liveResponse: JSON.stringify({
        reply: 'I will check back on this next time.',
        signals: {
          noticed_gap: {
            answerEventId: 'wrong-event',
            learnerQuote: 'Mitochondria make cellular energy.',
          },
        },
      }),
    });

    expect(issues?.map((candidate) => candidate.code)).toEqual(
      expect.arrayContaining([
        'homework-notice.event-id',
        'homework-notice.provenance',
        'homework-notice.future-promise',
      ]),
    );
  });
});
