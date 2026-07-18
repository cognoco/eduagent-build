import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  gte,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  createScopedRepository,
  billingAlerts,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  mentorActivityLedger,
  needsDeepeningTopics,
  parkingLotItems,
  person,
  progressSnapshots,
  retentionCards,
  sessionSummaries,
  subjects,
  supportVisibilityContracts,
  supportership,
  subscription,
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
  subscriptionStatusSchema,
  subscriptionTierSchema,
} from '@eduagent/schemas';

import { markMomentSurfaced } from './activity-ledger';
import { acceptedVisibilityCondition } from './linking-ceremony';
import { getAssessmentEligibleTopics } from './retention-data';
import { resolveEffectiveAccessTier } from './subscription';

export const PARKED_AGING_WINDOW_DAYS = 7;
export const DEEPENING_SURFACE_LEAD_DAYS = 2;
// [WI-1121 / MMT-ADR-0022] Read-time-projected moments (topic_mastered,
// recap_ready, snapshot_ready) have no ledger row and therefore no
// `surfacedAt` seen-state — a recency window is the only thing stopping them
// from surfacing forever. Shared across the three; none is individually
// tuned enough yet to warrant its own constant.
export const LEDGER_PROJECTION_RECENCY_DAYS = 3;

export const RANKING = {
  BILLING_ALERT: -1,
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
  'settings.more': { params: [], chain: [] },
  'settings.account': { params: [], chain: ['settings.more'] },
  'billing.manage': {
    params: [],
    chain: ['settings.more', 'settings.account'],
  },
  'session.resume': { params: ['sessionId'], chain: [] },
  // [WI-1121 review fix] A completed session's recap lives at
  // /session-summary/[sessionId] (mobile: session-detail-navigation.ts's
  // buildSessionDetailHref, already used by JournalTabView's own recap
  // rows) — distinct from 'session.resume', which reopens the LIVE session
  // chat and is wrong for a "recap is ready" moment on an ended session.
  'session.summary': { params: ['sessionId'], chain: [] },
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
    case 'billing_alert':
      return RANKING.BILLING_ALERT;
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
    profileId,
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
    profileId,
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
// inside the S0 service; ruled correct, not a tier leak
// (docs/plans/v2-plan/2026-06-10-s0-backend-primitives.md). That ruling is
// about S0-vs-S4 layering only — it does not cover accepted-visibility
// gating, which is a separate axis. [WI-2237] added the
// `supportVisibilityContracts` join below because a client-supplied
// `personId` on a merely-created (never accepted) supportership previously
// still returned real Now-feed data.
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
    .innerJoin(
      supportVisibilityContracts,
      eq(supportVisibilityContracts.supportershipId, supportership.id),
    )
    .where(
      and(
        eq(supportership.supporterPersonId, profileId),
        eq(supportership.supporteePersonId, query.personId),
        acceptedVisibilityCondition(),
      ),
    )
    .limit(1);

  const edgeId = rows[0]?.edgeId;
  if (!edgeId) {
    throw new ForbiddenError('You do not have access to this person.');
  }

  return { personId: query.personId, edgeId };
}

/**
 * @internal - exported for testing only. [WI-2237] Also the seam the
 * revoke-race regression test calls directly, bypassing `resolveNowTarget`'s
 * pre-check, to prove the candidate reads below are self-authorizing even
 * when a caller reaches them without (or with a stale) pre-check result —
 * the exact intra-call TOCTOU window Codex's review flagged.
 */
export async function collectCandidatesForRequest(
  db: Database,
  personId: string,
  request: NowQuery,
  now: Date,
  edgeId: string | undefined,
  viewerPersonId: string,
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
    request.scope === 'self' ? undefined : viewerPersonId,
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
// inside the S0 service; ruled correct, not a tier leak
// (docs/plans/v2-plan/2026-06-10-s0-backend-primitives.md). That ruling is
// about S0-vs-S4 layering only — see the `resolveNowTarget` note above for
// why the `supportVisibilityContracts` join [WI-2237] is a separate,
// necessary axis.
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
    .innerJoin(
      supportVisibilityContracts,
      eq(supportVisibilityContracts.supportershipId, supportership.id),
    )
    .where(
      and(
        eq(supportership.supporterPersonId, supporterPersonId),
        acceptedVisibilityCondition(),
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
        supporterPersonId,
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
  supporterPersonId?: string,
): Promise<NowFeedCandidate[]> {
  // [WI-2237] Self-authorizing re-check embedded directly in every
  // supporter-scoped candidate read below, mirroring
  // readSupporteeStructuralSubjects's correlated EXISTS
  // (supporter-structural-mask.ts). resolveNowTarget /
  // collectSupporterHubCandidates already gate the caller before this
  // function runs, but that gate and these reads are separate queries — a
  // revoke/restamp/lapse landing between them previously could still
  // surface Now-feed data. See acceptedSupporterAccessExists.
  const accessGuard =
    visibility === 'supporter' && supporterPersonId
      ? acceptedSupporterAccessExists(db, supporterPersonId, profileId)
      : undefined;

  const [
    billing,
    unfinished,
    dueRetention,
    needsDeepening,
    challengeReady,
    parked,
    ledgerMoments,
    topicMastered,
    recapReady,
    snapshotReady,
  ] = await Promise.all([
    visibility === 'self' && scope === 'self'
      ? collectBillingAlertCandidates(db, profileId, now)
      : Promise.resolve([]),
    collectUnfinishedSessionCandidates(db, profileId, scope, accessGuard),
    collectRetentionDueCandidates(db, profileId, scope, now, accessGuard),
    collectNeedsDeepeningCandidates(db, profileId, scope, now, accessGuard),
    collectChallengeReadyCandidates(db, profileId, scope, accessGuard),
    visibility === 'self'
      ? collectParkedItemCandidates(db, profileId, scope)
      : Promise.resolve([]),
    visibility === 'self'
      ? collectLedgerMomentCandidates(db, profileId, scope)
      : Promise.resolve([]),
    visibility === 'self'
      ? collectTopicMasteredCandidates(db, profileId, scope, now)
      : Promise.resolve([]),
    visibility === 'self'
      ? collectRecapReadyCandidates(db, profileId, scope, now)
      : Promise.resolve([]),
    visibility === 'self'
      ? collectSnapshotReadyCandidates(db, profileId, scope, now)
      : Promise.resolve([]),
  ]);

  return [
    ...billing,
    ...unfinished,
    ...dueRetention,
    ...needsDeepening,
    ...challengeReady,
    ...parked,
    ...ledgerMoments,
    ...topicMastered,
    ...recapReady,
    ...snapshotReady,
  ].map((candidate) => ({
    ...candidate,
    ...(scope === 'person' ? { personId: profileId } : {}),
    ...(edgeId ? { edgeId } : {}),
  }));
}

async function collectBillingAlertCandidates(
  db: Database,
  payerPersonId: string,
  now: Date,
): Promise<NowFeedCandidate[]> {
  const rows = await db
    .select({
      id: billingAlerts.id,
      createdAt: billingAlerts.createdAt,
      occurredAt: billingAlerts.occurredAt,
      planTier: subscription.planTier,
      status: subscription.status,
      periodEndAt: subscription.periodEndAt,
    })
    .from(billingAlerts)
    .innerJoin(subscription, eq(subscription.id, billingAlerts.subscriptionId))
    .where(
      and(
        eq(subscription.payerPersonId, payerPersonId),
        eq(subscription.status, 'past_due'),
      ),
    )
    .orderBy(desc(billingAlerts.occurredAt), desc(billingAlerts.id))
    .limit(1);

  return rows.flatMap((row) => {
    const tier = subscriptionTierSchema.safeParse(row.planTier);
    const status = subscriptionStatusSchema.safeParse(row.status);
    if (!tier.success || !status.success) return [];
    const access = resolveEffectiveAccessTier(
      {
        tier: tier.data,
        status: status.data,
        trialEndsAt: null,
        currentPeriodEnd: row.periodEndAt?.toISOString() ?? null,
      },
      now,
    );

    return [
      {
        id: row.id,
        kind: 'billing_alert' as const,
        createdAt: row.createdAt,
        sortAt: row.occurredAt,
        templateKey: 'now.billing_alert.payment_failed',
        params: {
          planTier: tier.data,
          accessState: access.billingAccess,
          deadlineAt: row.periodEndAt?.toISOString() ?? null,
        },
        deepLink: resolveDeepLink('billing.manage', {}),
        scope: 'self' as const,
      },
    ];
  });
}

// [WI-2237] The correlated EXISTS embedded by every supporter-scoped
// candidate read in this file — reuses `acceptedVisibilityCondition()`
// (linking-ceremony.ts), the same predicate `resolveNowTarget` and
// `readSupporteeStructuralSubjects` (supporter-structural-mask.ts) use, so a
// revoke/restamp/lapse is honored by the read itself rather than trusting an
// earlier, separate pre-check query.
function acceptedSupporterAccessExists(
  db: Database,
  supporterPersonId: string,
  supporteePersonId: string,
): SQL {
  return exists(
    db
      .select({ _: sql`1` })
      .from(supportership)
      .innerJoin(
        supportVisibilityContracts,
        eq(supportVisibilityContracts.supportershipId, supportership.id),
      )
      .innerJoin(person, eq(person.id, supportership.supporteePersonId))
      .where(
        and(
          eq(supportership.supporterPersonId, supporterPersonId),
          eq(supportership.supporteePersonId, supporteePersonId),
          acceptedVisibilityCondition(),
        ),
      ),
  );
}

async function collectUnfinishedSessionCandidates(
  db: Database,
  profileId: string,
  scope: NowScope,
  accessGuard?: SQL,
): Promise<NowFeedCandidate[]> {
  const repo = createScopedRepository(db, profileId);
  const rows = await repo.sessions.findMany(
    and(eq(learningSessions.status, 'active'), accessGuard),
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
  accessGuard?: SQL,
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
        accessGuard,
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
  accessGuard?: SQL,
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
        accessGuard,
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
  accessGuard?: SQL,
): Promise<NowFeedCandidate[]> {
  // [WI-2237] The accepted-visibility authorization is now embedded in the
  // eligibility read itself: `getAssessmentEligibleTopics` injects `accessGuard`
  // (the same correlated `acceptedSupporterAccessExists` EXISTS threaded to the
  // other supporter-scoped reads in this file) into its primary query WHERE, so
  // the read is default-deny within the SAME query — a revoke/restamp/lapse is
  // honored by the read, not by an earlier separate pre-check.
  const rows = await getAssessmentEligibleTopics(db, profileId, accessGuard);

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

// [WI-1121 / MMT-ADR-0022] The three kinds below have no `mentor_activity_ledger`
// row and are assembled straight from operational tables — a read-time
// projection, per the ADR, rather than a new LedgerKind + writer. They are
// synthesized with `kind: 'ledger_moment'` and a `now.ledger_moment.<kind>`
// templateKey so they reuse the same mobile rendering path
// (JournalTabView.renderLedgerMomentText, LedgerMomentCard) that real ledger
// rows use — that mobile dispatch, and its `journal.moments.{topic_mastered,
// recap_ready,snapshot_ready}` copy in en.json, already existed pre-built for
// this exact shape. No `ledgerId`, so no seen-state; `LEDGER_PROJECTION_RECENCY_DAYS`
// is what keeps them from surfacing indefinitely.

async function collectTopicMasteredCandidates(
  db: Database,
  profileId: string,
  scope: NowScope,
  now: Date,
): Promise<NowFeedCandidate[]> {
  const cutoff = new Date(
    now.getTime() - LEDGER_PROJECTION_RECENCY_DAYS * DAY_MS,
  );

  const rows = await db
    .select({
      id: retentionCards.id,
      masteredAt: retentionCards.masteredAt,
      subjectId: subjects.id,
      topicId: curriculumTopics.id,
      bookId: curriculumTopics.bookId,
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
        isNotNull(retentionCards.masteredAt),
        gt(retentionCards.masteredAt, cutoff),
      ),
    )
    .orderBy(desc(retentionCards.masteredAt), asc(retentionCards.id))
    .limit(20);

  return rows
    .filter((row) => row.masteredAt)
    .map((row) => ({
      id: `topic-mastered:${row.id}`,
      kind: 'ledger_moment' as const,
      createdAt: row.masteredAt as Date,
      sortAt: row.masteredAt as Date,
      templateKey: 'now.ledger_moment.topic_mastered',
      params: {
        ledgerKind: 'topic_mastered',
        subjectId: row.subjectId,
        topicId: row.topicId,
        bookId: row.bookId,
        topicTitle: row.topicTitle,
      },
      // [WI-1121 review fix] Routes per-topic (subject.topic), not
      // per-subject (subject.hub): two topics mastered in the same subject
      // within the recency window previously produced identical
      // kind/templateKey/route/params, so getNowCardDismissKey() collided —
      // dismissing one card hid both.
      deepLink: resolveDeepLink('subject.topic', {
        subjectId: row.subjectId,
        bookId: row.bookId,
        topicId: row.topicId,
      }),
      scope,
    }));
}

// [WI-1121 caveat] Windowing on `updatedAt` is an approximation, not an exact
// "recap just generated" signal: `summary-reconciliation-cron.ts`'s
// find-missing-llm-summaries step (lines 62-101) can regenerate a session's
// private `llmSummary`/`summaryGeneratedAt` up to 37 days after the session
// ended without touching `learnerRecap`, bumping `updatedAt` in the process.
// A learner_recap set weeks ago can therefore resurface as if it were new.
// No dedicated "recap became visible" timestamp exists to fix this precisely;
// out of scope for this WI — flagged for a possible follow-up.
async function collectRecapReadyCandidates(
  db: Database,
  profileId: string,
  scope: NowScope,
  now: Date,
): Promise<NowFeedCandidate[]> {
  const cutoff = new Date(
    now.getTime() - LEDGER_PROJECTION_RECENCY_DAYS * DAY_MS,
  );

  const rows = await db
    .select({
      id: sessionSummaries.id,
      sessionId: sessionSummaries.sessionId,
      updatedAt: sessionSummaries.updatedAt,
    })
    .from(sessionSummaries)
    .where(
      and(
        eq(sessionSummaries.profileId, profileId),
        isNotNull(sessionSummaries.learnerRecap),
        isNull(sessionSummaries.purgedAt),
        gt(sessionSummaries.updatedAt, cutoff),
      ),
    )
    .orderBy(desc(sessionSummaries.updatedAt), asc(sessionSummaries.id))
    .limit(20);

  return rows.map((row) => ({
    id: `recap-ready:${row.id}`,
    kind: 'ledger_moment' as const,
    createdAt: row.updatedAt,
    sortAt: row.updatedAt,
    templateKey: 'now.ledger_moment.recap_ready',
    params: {
      ledgerKind: 'recap_ready',
      sessionId: row.sessionId,
    },
    // [WI-1121 review fix] 'session.summary' (→ /session-summary/[sessionId]),
    // not 'session.resume' (→ the live session chat) — this session already
    // ended; its recap lives on the summary screen.
    deepLink: resolveDeepLink('session.summary', { sessionId: row.sessionId }),
    scope,
  }));
}

async function collectSnapshotReadyCandidates(
  db: Database,
  profileId: string,
  scope: NowScope,
  now: Date,
): Promise<NowFeedCandidate[]> {
  const cutoffDate = new Date(
    now.getTime() - LEDGER_PROJECTION_RECENCY_DAYS * DAY_MS,
  )
    .toISOString()
    .slice(0, 10);

  const rows = await db
    .select({
      id: progressSnapshots.id,
      snapshotDate: progressSnapshots.snapshotDate,
      createdAt: progressSnapshots.createdAt,
    })
    .from(progressSnapshots)
    .where(
      and(
        eq(progressSnapshots.profileId, profileId),
        gte(progressSnapshots.snapshotDate, cutoffDate),
      ),
    )
    .orderBy(desc(progressSnapshots.snapshotDate))
    .limit(1);

  // No subjectId/sessionId anchor exists for a snapshot — unlike
  // `resolveLedgerDeepLink`'s catch-all (used only for real ledger rows whose
  // kind is a runtime-unknown string), this collector knows its shape
  // statically, so it builds the deepLink directly rather than going through
  // that helper (which would need widening for a kind it doesn't handle).
  return rows.map((row) => ({
    id: `snapshot-ready:${row.id}`,
    kind: 'ledger_moment' as const,
    createdAt: row.createdAt,
    sortAt: row.createdAt,
    templateKey: 'now.ledger_moment.snapshot_ready',
    params: { ledgerKind: 'snapshot_ready' },
    deepLink: resolveDeepLink('journal', {}),
    scope,
  }));
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
  // [WI-1121] `reward_receipt` removed from ledgerKindSchema — dropped from
  // this catch-all; `ledgerKindSchema.safeParse` at the caller can no longer
  // produce it, so `kind` is now always 'session_filed' or 'milestone_reached'.
  if (kind === 'milestone_reached') {
    return resolveDeepLink('journal', {});
  }
  return null;
}
