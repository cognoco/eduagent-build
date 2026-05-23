import type { Database } from '@eduagent/database';
import type { RecapListItem } from '@eduagent/schemas';

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

  if (options.childProfileId && selectedChildren.length === 0) {
    await getChildSessions(db, parentProfileId, options.childProfileId);
    return [];
  }

  const sessionsByChild = await Promise.all(
    selectedChildren.map(async (child) => ({
      child,
      sessions: await getChildSessions(db, parentProfileId, child.profileId),
    })),
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

  for (const child of children) {
    const session = await getChildSessionDetail(
      db,
      parentProfileId,
      child.profileId,
      recapId,
    );
    if (session) return toRecapItem(child, session);
  }

  return null;
}
