import {
  resolveDeepLink,
  type NowFeedCandidate,
} from '../../src/services/now-feed';

export const PARK_AND_RETURN_NOW = new Date('2026-06-14T12:00:00.000Z');

const SUBJECT_ID = 'a0000000-0000-4000-8000-000000000100';
const BOOK_ID = 'b0000000-0000-4000-8000-000000000100';
const TOPIC_ID = 'c0000000-0000-4000-8000-000000000100';

type CandidateKind = NowFeedCandidate['kind'];

export type ParkAndReturnRankingScenarioId =
  | 'PR-RANK-1'
  | 'PR-RANK-2'
  | 'PR-RANK-3';

export interface ParkAndReturnRankingScenario {
  scenarioId: ParkAndReturnRankingScenarioId;
  purpose: string;
  candidates: NowFeedCandidate[];
}

function daysAgo(days: number): Date {
  return new Date(PARK_AND_RETURN_NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function daysFromNow(days: number): Date {
  return new Date(PARK_AND_RETURN_NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

function candidate(
  id: string,
  kind: CandidateKind,
  createdAt: Date,
  sortAt?: Date,
): NowFeedCandidate {
  return {
    id,
    kind,
    createdAt,
    sortAt,
    templateKey: `now.${kind}.default`,
    params: { id, title: id },
    deepLink: deepLinkFor(kind, id),
    scope: 'self',
  };
}

function deepLinkFor(kind: CandidateKind, id: string) {
  switch (kind) {
    case 'unfinished_session':
      return resolveDeepLink('session.resume', { sessionId: `session-${id}` });
    case 'retention_due':
      return resolveDeepLink('retention.review', {
        subjectId: SUBJECT_ID,
        topicId: TOPIC_ID,
      });
    case 'challenge_ready':
      return resolveDeepLink('challenge.start', {
        subjectId: SUBJECT_ID,
        topicId: TOPIC_ID,
      });
    case 'needs_deepening':
    case 'parked_item':
      return resolveDeepLink('subject.topic', {
        subjectId: SUBJECT_ID,
        bookId: BOOK_ID,
        topicId: TOPIC_ID,
      });
    case 'ledger_moment':
      return resolveDeepLink('journal', {});
    case 'support_hub_pointer':
      return resolveDeepLink('support.hub', {});
  }
}

export const parkAndReturnRankingScenarios: ParkAndReturnRankingScenario[] = [
  {
    scenarioId: 'PR-RANK-1',
    purpose:
      'An aged parked item competes with three higher-base-priority cards and must still land in the three-card highlight feed.',
    candidates: [
      candidate('unfinished-session', 'unfinished_session', daysAgo(1)),
      candidate('retention-due', 'retention_due', daysAgo(2), daysAgo(3)),
      candidate('challenge-ready', 'challenge_ready', daysAgo(3)),
      candidate('aged-parked', 'parked_item', daysAgo(9)),
    ],
  },
  {
    scenarioId: 'PR-RANK-2',
    purpose:
      'A fresh parked item can lose the top-three slots, but it must remain reachable through overflow.',
    candidates: [
      candidate('unfinished-session', 'unfinished_session', daysAgo(1)),
      candidate('retention-due', 'retention_due', daysAgo(2), daysAgo(3)),
      candidate(
        'ordinary-deepening',
        'needs_deepening',
        daysAgo(4),
        daysFromNow(5),
      ),
      candidate('challenge-ready', 'challenge_ready', daysAgo(3)),
      candidate('fresh-parked', 'parked_item', daysAgo(1)),
    ],
  },
  {
    scenarioId: 'PR-RANK-3',
    purpose:
      'When needs-deepening and parked items are both promoted, the expiring weak concept precedes the parked curiosity.',
    candidates: [
      candidate('retention-due', 'retention_due', daysAgo(2), daysAgo(3)),
      candidate(
        'near-expiry-deepening',
        'needs_deepening',
        daysAgo(4),
        daysFromNow(1),
      ),
      candidate('aged-parked', 'parked_item', daysAgo(9)),
      candidate('challenge-ready', 'challenge_ready', daysAgo(3)),
    ],
  },
];
