import type { Database } from '@eduagent/database';
import type { RecapListItem } from '@eduagent/schemas';
import { ForbiddenError } from '../errors';

import {
  getChildSessionDetail,
  getChildSessions,
  getChildrenForParent,
} from './dashboard';

type DashboardChildSummary = Awaited<
  ReturnType<typeof getChildrenForParent>
>[number];

function toRecapItem(
  child: DashboardChildSummary,
  session: Awaited<ReturnType<typeof getChildSessions>>[number],
): RecapListItem {
  return {
    recapId: session.sessionId,
    sessionId: session.sessionId,
    childProfileId: child.profileId,
    childDisplayName: child.displayName,
    subjectId: session.subjectId,
    subjectName: session.subjectName,
    topicId: session.topicId,
    topicTitle: session.topicTitle,
    sessionType: session.sessionType as RecapListItem['sessionType'],
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    exchangeCount: session.exchangeCount,
    displayTitle: session.displayTitle,
    displaySummary: session.displaySummary,
    highlight: session.highlight,
    narrative: session.narrative,
    conversationPrompt: session.conversationPrompt,
    engagementSignal: session.engagementSignal,
  };
}

export async function listRecapsForParent(
  db: Database,
  parentProfileId: string,
  options: {
    childProfileId?: string;
    limit?: number;
  } = {},
): Promise<RecapListItem[]> {
  const children = await getChildrenForParent(db, parentProfileId);
  const selectedChildren = options.childProfileId
    ? children.filter((child) => child.profileId === options.childProfileId)
    : children;

  // [H1-RECAP-IDOR] If a specific childProfileId was requested but that child
  // is not in the parent's family-link set, fail with 403 immediately.
  // Previously this fell through to a getChildSessions() call whose only
  // purpose was to invoke assertParentAccess as a side-effect, leaving a
  // dead `return []` after a line that always throws. Explicit guard is
  // clearer and does not depend on getChildSessions' internal IDOR logic.
  if (options.childProfileId && selectedChildren.length === 0) {
    throw new ForbiddenError('You do not have access to this child profile.');
  }

  // Per-child ForbiddenError (hidden consent) is the *expected* state for an
  // individual child and must not poison sibling lookups — Promise.all would
  // reject the whole parent dashboard when any one child has hidden data.
  // Other errors (DB, etc.) still propagate via the outer await.
  const sessionsByChild = await Promise.all(
    selectedChildren.map(async (child) => {
      try {
        const sessions = await getChildSessions(
          db,
          parentProfileId,
          child.profileId,
        );
        return { child, sessions };
      } catch (err) {
        if (err instanceof ForbiddenError) return { child, sessions: [] };
        throw err;
      }
    }),
  );

  return sessionsByChild
    .flatMap(({ child, sessions }) =>
      sessions.map((session) => toRecapItem(child, session)),
    )
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, Math.min(Math.max(options.limit ?? 20, 1), 50));
}

export async function getRecapForParent(
  db: Database,
  parentProfileId: string,
  recapId: string,
): Promise<RecapListItem | null> {
  const children = await getChildrenForParent(db, parentProfileId);

  // [L7-F2] Parallelize per-child lookups instead of awaiting in series. A
  // single-query refactor (fetch session by recapId, then assert membership
  // in the parent's child set) was rejected because getChildSessionDetail
  // does multiple parallel reads (summary, subject, topic, drill rows) and
  // duplicating that here would fork dashboard.ts logic.
  //
  // Per-child ForbiddenError (hidden consent) is the *expected* state for an
  // individual child and must not block the lookup against siblings — the
  // recap may belong to a visible child even if a sibling is hidden. Other
  // errors still propagate via the outer await.
  const sessions = await Promise.all(
    children.map(async (child) => {
      try {
        return await getChildSessionDetail(
          db,
          parentProfileId,
          child.profileId,
          recapId,
        );
      } catch (err) {
        if (err instanceof ForbiddenError) return null;
        throw err;
      }
    }),
  );

  for (let i = 0; i < children.length; i += 1) {
    const session = sessions[i];
    const child = children[i];
    if (session && child) return toRecapItem(child, session);
  }

  return null;
}
