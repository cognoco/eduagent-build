import type { EvalProfile } from '../fixtures/profiles';
import {
  PARK_AND_RETURN_NOW,
  parkAndReturnRankingScenarios,
  type ParkAndReturnRankingScenario,
} from '../fixtures/park-and-return';
import {
  buildNowFeedFromCandidates,
  buildNowOverflowFromCandidates,
  rankCandidates,
} from '../../src/services/now-feed';
import { qualityError } from '../runner/quality';
import type {
  DeterministicCheckContext,
  FlowDefinition,
  PromptMessages,
  QualityIssue,
  Scenario,
} from '../runner/types';

const TARGET_PROFILE_ID = '12yo-dinosaurs';

function cardIdsFromParams(
  items: Array<{ params: Record<string, unknown> }>,
): string[] {
  return items
    .map((item) => item.params.id)
    .filter((id): id is string => typeof id === 'string');
}

function evaluateScenario(input: ParkAndReturnRankingScenario): QualityIssue[] {
  const ranked = rankCandidates(input.candidates, PARK_AND_RETURN_NOW);
  const rankedIds = ranked.map((candidate) => candidate.id);
  const feed = buildNowFeedFromCandidates(
    input.candidates,
    'self',
    PARK_AND_RETURN_NOW,
  );
  const overflow = buildNowOverflowFromCandidates(
    input.candidates,
    'self',
    PARK_AND_RETURN_NOW,
  );
  const cardIds = cardIdsFromParams(feed.cards);
  const overflowIds = cardIdsFromParams(overflow.items);

  switch (input.scenarioId) {
    case 'PR-RANK-1':
      return cardIds.includes('aged-parked')
        ? []
        : [
            qualityError(
              'PR-RANK-1.starved',
              `Expected aged parked item in top 3 under competition; cards=${cardIds.join(', ')} ranked=${rankedIds.join(', ')}`,
            ),
          ];

    case 'PR-RANK-2':
      return !cardIds.includes('fresh-parked') &&
        overflowIds.includes('fresh-parked')
        ? []
        : [
            qualityError(
              'PR-RANK-2.unreachable',
              `Expected fresh parked item to be overflow-reachable but outside top 3; cards=${cardIds.join(', ')} overflow=${overflowIds.join(', ')}`,
            ),
          ];

    case 'PR-RANK-3': {
      const deepeningIndex = rankedIds.indexOf('near-expiry-deepening');
      const parkedIndex = rankedIds.indexOf('aged-parked');
      return deepeningIndex >= 0 &&
        parkedIndex >= 0 &&
        deepeningIndex < parkedIndex
        ? []
        : [
            qualityError(
              'PR-RANK-3.precedence',
              `Expected near-expiry needs_deepening before aged parked item; ranked=${rankedIds.join(', ')}`,
            ),
          ];
    }
  }
}

function evaluateDeterministic(
  context: DeterministicCheckContext<ParkAndReturnRankingScenario>,
): QualityIssue[] {
  return evaluateScenario(context.input);
}

function scenarioNotes(input: ParkAndReturnRankingScenario): string[] {
  const ranked = rankCandidates(input.candidates, PARK_AND_RETURN_NOW);
  const feed = buildNowFeedFromCandidates(
    input.candidates,
    'self',
    PARK_AND_RETURN_NOW,
  );
  const overflow = buildNowOverflowFromCandidates(
    input.candidates,
    'self',
    PARK_AND_RETURN_NOW,
  );

  return [
    `Scenario: ${input.scenarioId} - ${input.purpose}`,
    `Candidates: ${input.candidates.map((candidate) => candidate.id).join(', ')}`,
    `Ranked: ${ranked.map((candidate) => candidate.id).join(', ')}`,
    `Cards: ${cardIdsFromParams(feed.cards).join(', ')}`,
    `Overflow: ${cardIdsFromParams(overflow.items).join(', ') || 'none'}`,
  ];
}

export const parkAndReturnRankingFlow: FlowDefinition<ParkAndReturnRankingScenario> =
  {
    id: 'park-and-return-ranking',
    name: 'Park and Return Ranking',
    sourceFile: 'apps/api/src/services/now-feed.ts',

    buildPromptInput(): ParkAndReturnRankingScenario | null {
      return null;
    },

    enumerateScenarios(
      profile: EvalProfile,
    ): Array<Scenario<ParkAndReturnRankingScenario>> | null {
      if (profile.id !== TARGET_PROFILE_ID) return [];
      return parkAndReturnRankingScenarios.map((scenario) => ({
        scenarioId: scenario.scenarioId,
        input: scenario,
      }));
    },

    buildPrompt(input: ParkAndReturnRankingScenario): PromptMessages {
      return {
        system:
          'Deterministic park-and-return ranking gate. No LLM call is made; evaluateDeterministic checks the real Now-feed ranker.',
        notes: scenarioNotes(input),
      };
    },

    evaluateDeterministic,
  };

export const __testExports = {
  evaluateScenario,
};
