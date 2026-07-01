import {
  and,
  asc,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';

import {
  createScopedRepository,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  mentorActivityLedger,
  needsDeepeningTopics,
  parkingLotItems,
  person,
  retentionCards,
  subjects,
  supportership,
  type Database,
} from '@eduagent/database';
import {
  ForbiddenError,
  ledgerKindSchema,
  parseLedgerParams,
  type NowCard,
  type NowCardKind,
  type NowDeepLink,
  type NowDeepLinkRoute,
  type NowOverflowItem,
  type NowOverflowResponse,
  type NowQuery,
  type NowResponse,
  type NowScope,
} from '@eduagent/schemas';

import { markMomentSurfaced } from './activity-ledger';
import { getAssessmentEligibleTopics } from './retention-data';

export const PARKED_AGING_WINDOW_DAYS = 7;
export const DEEPENING_SURFACE_LEAD_DAYS = 2;

export const RANKING = {
  UNFINISHED_SESSION: 0,
  RETENTION_DUE: 1,
  PROMOTED_AGING: 1.5,
  NEEDS_DEEPENING: 2,
  CHALLENGE_READY: 3,
  PARKED_ITEM: 4,
  LEDGER_MOMENT: 5,
  SUPPORT_HUB_POINTER: 0.5,
} as const;

export const ROUTE_CATALOG = {
  'session.resume': { params: ['sessionId'], chain: [] },
  'subject.hub': { params: ['subjectId'], chain: [] },
  'subject.topic': {
    params: ['subjectId', 'bookId', 'topicId'],
    chain: ['subject.hub'],
  },
  'retention.review': {
    params: ['subjectId', 'topicId'],
    chain: ['subject.hub'],
  },
  'challenge.start': {
    params: ['subjectId', 'topicId'],
    chain: ['subject.hub'],
  },
  journal: { params: [], chain: [] },
  'support.hub': { params: [], chain: [] },
} as const satisfies Record<
  NowDeepLinkRoute,
  { params: readonly string[]; chain: readonly NowDeepLinkRoute[] }
>;

export interface NowFeedCandidate {
  id: string;
  kind: NowCardKind;
  createdAt: Date;
  sortAt?: Date | null;
  templateKey: string;
  params: Record<string, unknown>;
  deepLink: NowDeepLink;
  scope: NowScope;
  personId?: string;
  edgeId?: string;
  ledgerId?: string;
}

interface RankedCandidate extends NowFeedCandidate {
  effectivePriority: number;
  sortValue: number;
  promotedOrder: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveDeepLink(
  route: NowDeepLinkRoute,
  params: Record<string, string>,
): NowDeepLink {
  const entry = ROUTE_CATALOG[route];
  for (const required of entry.params) {
    if (!params[required]) {
      throw new Error(
        `resolveDeepLink: missing param '${required}' for route '${route}'`,
      );
    }
  }
  return { route, params, chain: [...entry.chain] };
}

function basePriority(kind: NowCardKind): number {
  switch (kind) {
    case 'unfinished_session':
      return RANKING.UNFINISHED_SESSION;
    case 'retention_due':
      return RANKING.RETENTION_DUE;
    case 'needs_deepening':
      return RANKING.NEEDS_DEEPENING;
    case 'challenge_ready':
      return RANKING.CHALLENGE_READY;
    case 'parked_item':
      return RANKING.PARKED_ITEM;
    case 'ledger_moment':
      return RANKING.LEDGER_MOMENT;
    case 'support_hub_pointer':
      return RANKING.SUPPORT_HUB_POINTER;
  }
}

function isAgedParkedItem(candidate: NowFeedCandidate, now: Date): boolean {
  if (candidate.kind !== 'parked_item') return false;
  return (
    now.getTime() - candidate.createdAt.getTime() >
    PARKED_AGING_WINDOW_DAYS * DAY_MS
  );
}

function isNearExpiryNeedsDeepening(
  candidate: NowFeedCandidate,
  now: Date,
): boolean {
  if (candidate.kind !== 'needs_deepening' || !candidate.sortAt) return false;
  const msUntilExpiry = candidate.sortAt.getTime() - now.getTime();
  return (
    msUntilExpiry > 0 && msUntilExpiry <= DEEPENING_SURFACE_LEAD_DAYS * DAY_MS
  );
}

function rank(candidate: NowFeedCandidate, now: Date): RankedCandidate {
  const promotedNeeds = isNearExpiryNeedsDeepening(candidate, now);
  const promotedParked = isAgedParkedItem(candidate, now);
  const effectivePriority =
    promotedNeeds || promotedParked
      ? RANKING.PROMOTED_AGING
      : basePriority(candidate.kind);
  const sortDate = candidate.sortAt ?? candidate.createdAt;
  return {
    ...candidate,
    effectivePriority,
    sortValue:
      candidate.kind === 'unfinished_session'
        ? -sortDate.getTime()
        : sortDate.getTime(),
    promotedOrder: promotedNeeds ? 0 : promotedParked ? 1 : 0,
  };
}

export function rankCandidates(
  candidates: NowFeedCandidate[],
  now: Date = new Date(),
): NowFeedCandidate[] {
  return candidates
    .map((candidate) => rank(candidate, now))
    .sort((a, b) => {
      if (a.effectivePriority !== b.effectivePriority) {
        return a.effectivePriority - b.effectivePriority;
      }
      if (a.promotedOrder !== b.promotedOrder) {
        return a.promotedOrder - b.promotedOrder;
      }
      if (a.sortValue !== b.sortValue) {
        return a.sortValue - b.sortValue;
      }
      return a.id.localeCompare(b.id);
    });
}

export function orderSupporterHubCandidates(
  candidates: NowFeedCandidate[],
  now: Date = new Date(),
  visibleBudget = 3,
): NowFeedCandidate[] {
  const ranked = rankCandidates(candidates, now);
  const grouped = new Map<string, NowFeedCandidate[]>();
  for (const candidate of ranked) {
    if (!candidate.edgeId) continue;
    const group = grouped.get(candidate.edgeId) ?? [];
    group.push(candidate);
    grouped.set(candidate.edgeId, group);
  }

  const selected = new Set<string>();
  const fairTop = [...grouped.values()]
    .map((group) => group[0])
    .filter((candidate): candidate is NowFeedCandidate => Boolean(candidate))
    .sort((a, b) => {
      const aIndex = ranked.findIndex((item) => item.id === a.id);
      const bIndex = ranked.findIndex((item) => item.id === b.id);
      return aIndex - bIndex;
    })
    .slice(0, visibleBudget);

  for (const candidate of fairTop) selected.add(candidate.id);
  const fill = ranked.filter((candidate) => !selected.has(candidate.id));
  return [...fairTop, ...fill];
}

function toCard(candidate: NowFeedCandidate): NowCard {
  return {
    kind: candidate.kind,
    templateKey: candidate.templateKey,
    params: candidate.params,
    deepLink: candidate.deepLink,
    scope: candidate.scope,
    ...(candidate.personId ? { personId: candidate.personId } : {}),
    ...(candidate.edgeId ? { edgeId: candidate.edgeId } : {}),
  };
}

function toOverflowItem(candidate: NowFeedCandidate): NowOverflowItem {
  return toCard(candidate);
}

export function buildNowFeedFromCandidates(
  candidates: NowFeedCandidate[],
  scope: NowScope,
  now: Date = new Date(),
): NowResponse {
  const sorted = rankCandidates(candidates, now);
  return {
    scope,
    cards: sorted.slice(0, 3).map(toCard),
    overflowCount: Math.max(0, sorted.length - 3),
    generatedAt: now.toISOString(),
  };
}

export function buildNowOverflowFromCandidates(
  candidates: NowFeedCandidate[],
  scope: NowScope,
  now: Date = new Date(),
): NowOverflowResponse {
  const sorted = rankCandidates(candidates, now);
  return {
    scope,
    items: sorted.slice(3).map(toOverflowItem),
  };
}

export async function buildNowFeed(
  db: Database,
  profileId: string,
  query: NowScope | NowQuery = 'self',
): Promise<NowResponse> {
  const now = new Date();
  const request = normalizeNowQuery(query);
  const target = await resolveNowTarget(db, profileId, request);
  const candidates = await collectCandidatesForRequest(
    db,
    target.personId,
    request,
    now,
    target.edgeId,
  );
  const sorted =
    request.scope === 'supporter-hub'
      ? candidates
      : rankCandidates(candidates, now);
  const ledgerIds = sorted
    .slice(0, 3)
    .map((candidate) => candidate.ledgerId)
    .filter((id): id is string => typeof id === 'string');

  if (request.scope === 'self') {
    await markMomentSurfaced(db, profileId, ledgerIds);
  }

  return {
    scope: request.scope,
    cards: sorted.slice(0, 3).map(toCard),
    overflowCount: Math.max(0, sorted.length - 3),
    generatedAt: now.toISOString(),
  };
}

export async function buildNowOverflow(
  db: Database,
  profileId: string,
  query: NowScope | NowQuery = 'self',
): Promise<NowOverflowResponse> {
  const now = new Date();
  const request = normalizeNowQuery(query);
  const target = await resolveNowTarget(db, profileId, request);
  const candidates = await collectCandidatesForRequest(
    db,
    target.personId,
    request,
    now,
    target.edgeId,
  );
  if (request.scope === 'supporter-hub') {
    return {
      scope: request.scope,
      items: candidates.slice(3).map(toOverflowItem),
    };
  }
  return buildNowOverflowFromCandidates(candidates, request.scope, now);
}

function normalizeNowQuery(query: NowScope | NowQuery): NowQuery {
  return typeof query === 'string' ? { scope: query } : query;
}

// `person`/`supportership` reads here are S4-scoped and were shipped early
// inside the S0 service; ruled correct, not a tier leak (WI-1123, 2026-07-01;
// docs/plans/v2-plan/2026-06-10-s0-backend-primitives.md).
async function resolveNowTarget(
  db: Database,
  profileId: string,
  query: NowQuery,
): Promise<{ personId: string; edgeId?: string }> {
  if (query.scope !== 'person') {
    return { personId: profileId };
  }

  if (!query.personId) {
    throw new ForbiddenError('Person scope requires a personId.');
  }

  const rows = await db
    .select({ edgeId: supportership.id })
    .from(supportership)
    .innerJoin(person, eq(person.id, supportership.supporteePersonId))
    .where(
      and(
        eq(supportership.supporterPersonId, profileId),
        eq(supportership.supporteePersonId, query.personId),
        isNull(supportership.revokedAt),
        isNull(person.archivedAt),
      ),
    )
    .limit(1);

  const edgeId = rows[0]?.edgeId;
  if (!edgeId) {
    throw new ForbiddenError('You do not have access to this person.');
  }

  return { personId: query.personId, edgeId };
}

async function collectCandidatesForRequest(
  db: Database,
  personId: string,
  request: NowQuery,
  now: Date,
  edgeId?: string,
): Promise<NowFeedCandidate[]> {
  if (request.scope === 'supporter-hub') {
    return collectSupporterHubCandidates(db, personId, now);
  }

  const candidates = await collectNowCandidates(
    db,
    personId,
    request.scope,
    now,
    request.scope === 'self' ? 'self' : 'supporter',
    edgeId,
  );

  if (request.scope !== 'self') return candidates;

  const hubCandidates = await collectSupporterHubCandidates(db, personId, now);
  if (hubCandidates.length === 0) return candidates;

  return [
    ...candidates,
    {
      id: `support-hub-pointer:${personId}`,
      kind: 'support_hub_pointer',
      createdAt: now,
      sortAt: now,
      templateKey: 'now.support_hub_pointer.default',
      params: { count: hubCandidates.length },
      deepLink: resolveDeepLink('support.hub', {}),
      scope: 'self',
    },
  ];
}

// `person`/`supportership` reads here are S4-scoped and were shipped early
// inside the S0 service; ruled correct, not a tier leak (WI-1123, 2026-07-01;
// docs/plans/v2-plan/2026-06-10-s0-backend-primitives.md).
async function collectSupporterHubCandidates(
  db: Database,
  supporterPersonId: string,
  now: Date,
): Promise<NowFeedCandidate[]> {
  const edges = await db
    .select({
      edgeId: supportership.id,
      personId: supportership.supporteePersonId,
    })
    .from(supportership)
    .innerJoin(person, eq(person.id, supportership.supporteePersonId))
    .where(
      and(
        eq(supportership.supporterPersonId, supporterPersonId),
        isNull(supportership.revokedAt),
        isNull(person.archivedAt),
      ),
    )
    .orderBy(asc(supportership.id))
    .limit(50);

  if (edges.length === 0) return [];

  const perEdge = await Promise.all(
    edges.map((edge) =>
      collectNowCandidates(
        db,
        edge.personId,
        'person',
        now,
        'supporter',
        edge.edgeId,
      ),
    ),
  );

  return orderSupporterHubCandidates(perEdge.flat(), now);
}

async function collectNowCandidates(
  db: Database,
  profileId: string,
  scope: NowScope,
  now: Date,
  visibility: 'self' | 'supporter' = 'self',
  edgeId?: string,
): Promise<NowFeedCandidate[]> {
  const [
    unfinished,
    dueRetention,
    needsDeepening,
    challengeReady,
    parked,
    ledgerMoments,
  ] = await Promise.all([
    collectUnfinishedSessionCandidates(db, profileId, scope),
    collectRetentionDueCandidates(db, profileId, scope, now),
    collectNeedsDeepeningCandidates(db, profileId, scope, now),
    collectChallengeReadyCandidates(db, profileId, scope),
    visibility === 'self'
      ? collectParkedItemCandidates(db, profileId, scope)
      : Promise.resolve([]),
    visibility === 'self'
      ? collectLedgerMomentCandidates(db, profileId, scope)
      : Promise.resolve([]),
  ]);

  return [
    ...unfinished,
    ...dueRetention,
    ...needsDeepening,
    ...challengeReady,
    ...parked,
    ...ledgerMoments,
  ].map((candidate) => ({
    ...candidate,
    ...(scope === 'person' ? { personId: profileId } : {}),
    ...(edgeId ? { edgeId } : {}),
  }));
}

async function collectUnfinishedSessionCandidates(
  db: Database,
  profileId: string,
  scope: NowScope,
): Promise<NowFeedCandidate[]> {
  const repo = createScopedRepository(db, profileId);
  const rows = await repo.sessions.findMany(
    eq(learningSessions.status, 'active'),
    1,
    desc(learningSessions.lastActivityAt),
  );

  return rows.map((row) => ({
    id: row.id,
    kind: 'unfinished_session',
    createdAt: row.createdAt,
    sortAt: row.lastActivityAt,
    templateKey: 'now.unfinished_session.default',
    params: {
      sessionId: row.id,
      subjectId: row.subjectId,
      ...(row.topicId ? { topicId: row.topicId } : {}),
    },
    deepLink: resolveDeepLink('session.resume', { sessionId: row.id }),
    scope,
  }));
}

async function collectRetentionDueCandidates(
  db: Database,
  profileId: string,
  scope: NowScope,
  now: Date,
): Promise<NowFeedCandidate[]> {
  const rows = await db
    .select({
      id: retentionCards.id,
      topicId: retentionCards.topicId,
      nextReviewAt: retentionCards.nextReviewAt,
      createdAt: retentionCards.createdAt,
      subjectId: subjects.id,
      subjectName: subjects.name,
      topicTitle: curriculumTopics.title,
    })
    .from(retentionCards)
    .innerJoin(
      curriculumTopics,
      eq(retentionCards.topicId, curriculumTopics.id),
    )
    .innerJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
    .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
    .where(
      and(
        eq(retentionCards.profileId, profileId),
        eq(subjects.profileId, profileId),
        isNotNull(retentionCards.nextReviewAt),
        lt(retentionCards.nextReviewAt, now),
      ),
    )
    .orderBy(asc(retentionCards.nextReviewAt), asc(retentionCards.id))
    .limit(20);

  return rows
    .filter((row) => row.nextReviewAt)
    .map((row) => ({
      id: row.id,
      kind: 'retention_due',
      createdAt: row.createdAt,
      sortAt: row.nextReviewAt,
      templateKey: 'now.retention_due.default',
      params: {
        subjectId: row.subjectId,
        subjectName: row.subjectName,
        topicId: row.topicId,
        topicTitle: row.topicTitle,
      },
      deepLink: resolveDeepLink('retention.review', {
        subjectId: row.subjectId,
        topicId: row.topicId,
      }),
      scope,
    }));
}

async function collectNeedsDeepeningCandidates(
  db: Database,
  profileId: string,
  scope: NowScope,
  now: Date,
): Promise<NowFeedCandidate[]> {
  const rows = await db
    .select({
      id: needsDeepeningTopics.id,
      topicId: needsDeepeningTopics.topicId,
      concept: needsDeepeningTopics.concept,
      pendingExpiresAt: needsDeepeningTopics.pendingExpiresAt,
      createdAt: needsDeepeningTopics.createdAt,
      subjectId: subjects.id,
      subjectName: subjects.name,
      bookId: curriculumTopics.bookId,
      topicTitle: curriculumTopics.title,
    })
    .from(needsDeepeningTopics)
    .innerJoin(
      curriculumTopics,
      eq(needsDeepeningTopics.topicId, curriculumTopics.id),
    )
    .innerJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
    .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
    .where(
      and(
        eq(needsDeepeningTopics.profileId, profileId),
        eq(subjects.profileId, profileId),
        eq(needsDeepeningTopics.status, 'active'),
        or(
          isNull(needsDeepeningTopics.pendingExpiresAt),
          gt(needsDeepeningTopics.pendingExpiresAt, now),
        ),
      ),
    )
    .orderBy(
      sql`${needsDeepeningTopics.pendingExpiresAt} ASC NULLS LAST`,
      asc(needsDeepeningTopics.createdAt),
      asc(needsDeepeningTopics.id),
    )
    .limit(20);

  return rows.map((row) => ({
    id: row.id,
    kind: 'needs_deepening',
    createdAt: row.createdAt,
    sortAt: row.pendingExpiresAt,
    templateKey: 'now.needs_deepening.default',
    params: {
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      bookId: row.bookId,
      topicId: row.topicId,
      topicTitle: row.topicTitle,
      ...(row.concept ? { concept: row.concept } : {}),
      ...(row.pendingExpiresAt
        ? { pendingExpiresAt: row.pendingExpiresAt.toISOString() }
        : {}),
    },
    deepLink: resolveDeepLink('subject.topic', {
      subjectId: row.subjectId,
      bookId: row.bookId,
      topicId: row.topicId,
    }),
    scope,
  }));
}

async function collectChallengeReadyCandidates(
  db: Database,
  profileId: string,
  scope: NowScope,
): Promise<NowFeedCandidate[]> {
  const rows = await getAssessmentEligibleTopics(db, profileId);

  return rows.slice(0, 20).map((row) => ({
    id: row.topicId,
    kind: 'challenge_ready',
    createdAt: new Date(row.lastStudiedAt),
    sortAt: new Date(row.lastStudiedAt),
    templateKey: 'now.challenge_ready.default',
    params: {
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      topicId: row.topicId,
      topicTitle: row.topicTitle,
      ...(row.activeAssessmentId
        ? { activeAssessmentId: row.activeAssessmentId }
        : {}),
    },
    deepLink: resolveDeepLink('challenge.start', {
      subjectId: row.subjectId,
      topicId: row.topicId,
    }),
    scope,
  }));
}

async function collectParkedItemCandidates(
  db: Database,
  profileId: string,
  scope: NowScope,
): Promise<NowFeedCandidate[]> {
  const rows = await db
    .select({
      id: parkingLotItems.id,
      sessionId: parkingLotItems.sessionId,
      question: parkingLotItems.question,
      createdAt: parkingLotItems.createdAt,
      topicId: parkingLotItems.topicId,
      sessionProfileId: learningSessions.profileId,
      subjectId: curriculumBooks.subjectId,
      bookId: curriculumTopics.bookId,
      topicTitle: curriculumTopics.title,
    })
    .from(parkingLotItems)
    .innerJoin(
      learningSessions,
      eq(parkingLotItems.sessionId, learningSessions.id),
    )
    .leftJoin(
      curriculumTopics,
      eq(parkingLotItems.topicId, curriculumTopics.id),
    )
    .leftJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
    .where(
      and(
        eq(parkingLotItems.profileId, profileId),
        eq(learningSessions.profileId, profileId),
        eq(parkingLotItems.explored, false),
      ),
    )
    .orderBy(asc(parkingLotItems.createdAt), asc(parkingLotItems.id))
    .limit(20);

  return rows.map((row) => {
    const params: Record<string, unknown> = {
      sessionId: row.sessionId,
      question: row.question,
      ...(row.topicId ? { topicId: row.topicId } : {}),
      ...(row.topicTitle ? { topicTitle: row.topicTitle } : {}),
      ...(row.subjectId ? { subjectId: row.subjectId } : {}),
      ...(row.bookId ? { bookId: row.bookId } : {}),
    };
    const deepLink =
      row.topicId && row.subjectId && row.bookId
        ? resolveDeepLink('subject.topic', {
            subjectId: row.subjectId,
            bookId: row.bookId,
            topicId: row.topicId,
          })
        : resolveDeepLink('session.resume', { sessionId: row.sessionId });

    return {
      id: row.id,
      kind: 'parked_item',
      createdAt: row.createdAt,
      sortAt: row.createdAt,
      templateKey: 'now.parked_item.default',
      params,
      deepLink,
      scope,
    };
  });
}

async function collectLedgerMomentCandidates(
  db: Database,
  profileId: string,
  scope: NowScope,
): Promise<NowFeedCandidate[]> {
  const repo = createScopedRepository(db, profileId);
  const rows = await repo.mentorActivityLedger.findMany(
    isNull(mentorActivityLedger.surfacedAt),
    asc(mentorActivityLedger.createdAt),
    20,
  );

  return rows.flatMap((row) => {
    const kind = ledgerKindSchema.safeParse(row.kind);
    if (!kind.success) return [];
    const params = parseLedgerParams(row.params);
    const deepLink = resolveLedgerDeepLink(kind.data, params);
    if (!deepLink) return [];

    return [
      {
        id: row.id,
        kind: 'ledger_moment' as const,
        createdAt: row.createdAt,
        sortAt: row.createdAt,
        templateKey: `now.ledger_moment.${kind.data}`,
        params: {
          ...params,
          ledgerKind: kind.data,
        },
        deepLink,
        scope,
        ledgerId: row.id,
      },
    ];
  });
}

function stringParam(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function resolveLedgerDeepLink(
  kind: string,
  params: Record<string, unknown>,
): NowDeepLink | null {
  const subjectId = stringParam(params, 'subjectId');
  const sessionId = stringParam(params, 'sessionId');

  if (subjectId) {
    return resolveDeepLink('subject.hub', { subjectId });
  }
  if (sessionId) {
    return resolveDeepLink('session.resume', { sessionId });
  }
  // The new subject/session-less kinds route to the journal as a catch-all.
  // Other kinds keep their prior behavior: a row with no usable params is
  // excluded from the feed (caller drops candidates whose deepLink is null)
  // rather than masquerading behind a journal link.
  if (kind === 'milestone_reached' || kind === 'reward_receipt') {
    return resolveDeepLink('journal', {});
  }
  return null;
}
