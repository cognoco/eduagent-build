import { getProfile } from '../fixtures/profiles';
import { parkAndReturnRankingScenarios } from '../fixtures/park-and-return';
import {
  __testExports,
  parkAndReturnRankingFlow,
} from './park-and-return-ranking';

describe('parkAndReturnRankingFlow', () => {
  const profile = getProfile('12yo-dinosaurs');

  if (!profile) {
    throw new Error('12yo-dinosaurs profile missing');
  }

  it('enumerates the three deterministic P3 gate scenarios for the target profile', () => {
    const scenarios = parkAndReturnRankingFlow.enumerateScenarios?.(profile);

    expect(scenarios?.map((scenario) => scenario.scenarioId)).toEqual([
      'PR-RANK-1',
      'PR-RANK-2',
      'PR-RANK-3',
    ]);
    expect(
      parkAndReturnRankingFlow.enumerateScenarios?.({
        ...profile,
        id: 'other-profile',
      }),
    ).toEqual([]);
  });

  it('passes all fixture scenarios against the real Now-feed ranker', async () => {
    const scenarios = parkAndReturnRankingFlow.enumerateScenarios?.(profile);
    if (!scenarios) throw new Error('ranking scenarios missing');

    for (const scenario of scenarios) {
      const messages = parkAndReturnRankingFlow.buildPrompt(scenario.input);
      expect(messages.notes?.join('\n')).toContain(scenario.scenarioId);
      await expect(
        Promise.resolve(
          parkAndReturnRankingFlow.evaluateDeterministic?.({
            input: scenario.input,
            messages,
            profile,
            scenarioId: scenario.scenarioId,
          }),
        ),
      ).resolves.toEqual([]);
    }
  });

  it('fails PR-RANK-1 when the parked item is not aged enough to earn promotion', () => {
    const prRank1 = parkAndReturnRankingScenarios.find(
      (scenario) => scenario.scenarioId === 'PR-RANK-1',
    );
    if (!prRank1) throw new Error('PR-RANK-1 scenario missing');

    const broken = {
      ...prRank1,
      candidates: prRank1.candidates.map((candidate) =>
        candidate.id === 'aged-parked'
          ? {
              ...candidate,
              createdAt: new Date('2026-06-13T12:00:00.000Z'),
            }
          : candidate,
      ),
    };

    expect(__testExports.evaluateScenario(broken)).toEqual([
      expect.objectContaining({
        code: 'PR-RANK-1.starved',
        severity: 'error',
      }),
    ]);
  });
});
