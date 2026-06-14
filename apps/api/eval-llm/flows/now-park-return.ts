import type { FlowDefinition, QualityIssue, Scenario } from '../runner/types';
import {
  buildNowFeedFromCandidates,
  buildNowOverflowFromCandidates,
  rankCandidates,
  resolveDeepLink,
  type NowFeedCandidate,
} from '../../src/services/now-feed';

type ParkReturnScenario = {
  check: 'aged-parked-promotes' | 'near-expiry-deepening-wins' | 'overflow';
  candidates: NowFeedCandidate[];
};

const NOW = new Date('2026-06-14T12:00:00.000Z');
const SUBJECT_ID = 'a0000000-0000-4000-8000-000000000100';
const TOPIC_ID = 'b0000000-0000-4000-8000-000000000100';

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

function candidate(
  id: string,
  kind: NowFeedCandidate['kind'],
  createdAt: Date,
  sortAt?: Date,
): NowFeedCandidate {
  return {
    id,
    kind,
    createdAt,
    sortAt,
    templateKey: `now.${kind}`,
    params: { title: id },
    deepLink: resolveDeepLink('subject.topic', {
      subjectId: SUBJECT_ID,
      bookId: 'c0000000-0000-4000-8000-000000000100',
      topicId: TOPIC_ID,
    }),
    scope: 'self',
  };
}

const scenarios: Array<Scenario<ParkReturnScenario>> = [
  {
    scenarioId: 'aged-parked-promotes',
    input: {
      check: 'aged-parked-promotes',
      candidates: [
        candidate('fresh-parked', 'parked_item', daysAgo(1)),
        candidate('aged-parked', 'parked_item', daysAgo(9)),
        candidate('ordinary-deepening', 'needs_deepening', daysAgo(2)),
        candidate('challenge-ready', 'challenge_ready', daysAgo(3)),
      ],
    },
  },
  {
    scenarioId: 'near-expiry-deepening-wins',
    input: {
      check: 'near-expiry-deepening-wins',
      candidates: [
        candidate('aged-parked', 'parked_item', daysAgo(9)),
        candidate(
          'near-expiry-deepening',
          'needs_deepening',
          daysAgo(4),
          daysFromNow(1),
        ),
        candidate('challenge-ready', 'challenge_ready', daysAgo(2)),
      ],
    },
  },
  {
    scenarioId: 'overflow',
    input: {
      check: 'overflow',
      candidates: [
        candidate('retention', 'retention_due', daysAgo(3)),
        candidate('aged-parked', 'parked_item', daysAgo(9)),
        candidate('ordinary-deepening', 'needs_deepening', daysAgo(2)),
        candidate('ledger', 'ledger_moment', daysAgo(1)),
      ],
    },
  },
];

function fail(code: string, message: string): QualityIssue {
  return { severity: 'error', code, message };
}

function evaluate(input: ParkReturnScenario): QualityIssue[] {
  const ranked = rankCandidates(input.candidates, NOW);
  const ids = ranked.map((item) => item.id);

  if (input.check === 'aged-parked-promotes') {
    return ids[0] === 'aged-parked'
      ? []
      : [
          fail(
            'aged-parked-not-first',
            `Expected aged parked item first; got ${ids.join(', ')}`,
          ),
        ];
  }

  if (input.check === 'near-expiry-deepening-wins') {
    return ids[0] === 'near-expiry-deepening'
      ? []
      : [
          fail(
            'near-expiry-deepening-not-first',
            `Expected near-expiry deepening first; got ${ids.join(', ')}`,
          ),
        ];
  }

  const feed = buildNowFeedFromCandidates(input.candidates, 'self', NOW);
  const overflow = buildNowOverflowFromCandidates(
    input.candidates,
    'self',
    NOW,
  );
  const cardKeys = feed.cards.map((card) => card.params.title);
  if (feed.cards.length !== 3 || feed.overflowCount !== 1) {
    return [
      fail(
        'overflow-window-wrong',
        `Expected 3 cards and 1 overflow; got ${feed.cards.length} / ${feed.overflowCount}`,
      ),
    ];
  }
  if (!cardKeys.includes('aged-parked')) {
    return [
      fail(
        'aged-parked-missing-from-feed',
        `Expected aged parked item in visible feed; got ${cardKeys.join(', ')}`,
      ),
    ];
  }
  return overflow.items.length === 1
    ? []
    : [
        fail(
          'overflow-item-count-wrong',
          `Expected one overflow item; got ${overflow.items.length}`,
        ),
      ];
}

export const nowParkReturnFlow: FlowDefinition<ParkReturnScenario> = {
  id: 'now-park-return',
  name: 'Now Feed Park and Return Ranking',
  sourceFile: 'apps/api/src/services/now-feed.ts',
  buildPromptInput: () => null,
  enumerateScenarios: (profile) =>
    profile.id === '12yo-dinosaurs' ? scenarios : null,
  buildPrompt: (input) => ({
    system: 'Deterministic Now-feed ranking check; no LLM call is made.',
    notes: [
      `Check: ${input.check}`,
      `Candidate order: ${input.candidates.map((item) => item.id).join(', ')}`,
    ],
  }),
  evaluateDeterministic: ({ input }) => evaluate(input),
};
