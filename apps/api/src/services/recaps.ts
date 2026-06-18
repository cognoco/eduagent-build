import { and, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  curriculumBooks,
  curriculumTopics,
  profiles,
  sessionSummaries,
  subjects,
  type Database,
} from '@eduagent/database';
import type { RecapListItem } from '@eduagent/schemas';
import { ForbiddenError } from '../errors';

import {
  getChildSessionDetail,
  getChildSessions,
  getChildrenForParent,
} from './dashboard';
import { listProfileSessions } from './session/session-crud';

type DashboardChildSummary = Awaited<
  ReturnType<typeof getChildrenForParent>
>[number];

interface NextTopic {
  nextTopicTitle: string | null;
  nextTopicReason: string | null;
}

const NO_NEXT_TOPIC: NextTopic = {
  nextTopicTitle: null,
  nextTopicReason: null,
};

function toRecapItem(
  child: DashboardChildSummary,
  session: Awaited<ReturnType<typeof getChildSessions>>[number],
  nextTopic: NextTopic = NO_NEXT_TOPIC,
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
    nextTopicTitle: nextTopic.nextTopicTitle,
    nextTopicReason: nextTopic.nextTopicReason,
  };
}

function profileSessionToRecapItem(
  profileId: string,
  displayName: string,
  session: Awaited<ReturnType<typeof listProfileSessions>>['sessions'][number],
  nextTopic: NextTopic = NO_NEXT_TOPIC,
): RecapListItem {
  return {
    recapId: session.sessionId,
    sessionId: session.sessionId,
    childProfileId: profileId,
    childDisplayName: displayName,
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
    nextTopicTitle: nextTopic.nextTopicTitle,
    nextTopicReason: nextTopic.nextTopicReason,
  };
}

/**
 * One targeted lookup for the next-topic the mentor lined up on each recap
 * session. Reads `session_summaries.next_topic_id` / `.next_topic_reason`
 * (already stored — no generation change, no migration) and resolves the
 * topic title through an ALIASED `curriculum_topics` join so it never collides
 * with the current-topic title resolution elsewhere in the recap pipeline.
 *
 * Scoped to the caller's already-access-checked child profile ids AND the
 * specific recap session ids — it cannot widen access beyond what
 * `listRecapsForParent` already enforces. Deliberately NOT folded into the
 * shared `hydrateChildSessions` projection: that query also backs child-overview
 * history/progress and has a far wider blast radius than this feature needs
 * (plan T10 / Challenge HIGH-2).
 */
async function loadNextTopicMap(
  db: Database,
  childProfileIds: string[],
  sessionIds: string[],
): Promise<Map<string, NextTopic>> {
  if (childProfileIds.length === 0 || sessionIds.length === 0) {
    return new Map();
  }

  const nextTopic = alias(curriculumTopics, 'recap_next_topic');
  const nextBook = alias(curriculumBooks, 'recap_next_book');
  const nextSubject = alias(subjects, 'recap_next_subject');
  // [DATA-INTEGRITY] Re-anchor ownership of the resolved next-topic title
  // through the curriculum_topics → curriculum_books → subjects parent chain,
  // constraining subjects.profileId to the SAME summary's profileId. Without
  // this the title is pulled from whatever topic `next_topic_id` points at,
  // regardless of owner — so a corrupt/cross-profile next_topic_id would render
  // a foreign topic title on a parent's recap card. The joins are LEFT so a
  // null/unowned next_topic_id simply yields a null title (the existing
  // "no coming-up topic" state) rather than dropping the recap row.
  const rows = await db
    .select({
      sessionId: sessionSummaries.sessionId,
      nextTopicTitle: nextTopic.title,
      // ownedSubjectId is non-null only when the owned parent chain resolved
      // (subjects.profileId === the summary's profileId). The title is gated on
      // this so a foreign/corrupt next_topic_id never surfaces its title.
      ownedSubjectId: nextSubject.id,
      nextTopicReason: sessionSummaries.nextTopicReason,
    })
    .from(sessionSummaries)
    .leftJoin(nextTopic, eq(sessionSummaries.nextTopicId, nextTopic.id))
    .leftJoin(nextBook, eq(nextBook.id, nextTopic.bookId))
    .leftJoin(
      nextSubject,
      and(
        eq(nextSubject.id, nextBook.subjectId),
        eq(nextSubject.profileId, sessionSummaries.profileId),
      ),
    )
    .where(
      and(
        inArray(sessionSummaries.profileId, childProfileIds),
        inArray(sessionSummaries.sessionId, sessionIds),
      ),
    );

  return new Map(
    rows.map((row) => [
      row.sessionId,
      {
        // Only expose the title when ownership re-anchored through the parent
        // chain; otherwise treat as "no coming-up topic".
        nextTopicTitle: row.ownedSubjectId
          ? (row.nextTopicTitle ?? null)
          : null,
        nextTopicReason: row.nextTopicReason ?? null,
      },
    ]),
  );
}

export async function listRecapsForParent(
  db: Database,
  parentProfileId: string,
  options: {
    childProfileId?: string;
    limit?: number;
    identityV2Enabled?: boolean;
  } = {},
): Promise<RecapListItem[]> {
  const children = await getChildrenForParent(db, parentProfileId, {
    identityV2Enabled: options.identityV2Enabled,
  });
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
          // [WI-821] Forward identityV2Enabled so assertParentAccess reads
          // guardianship (not family_links) and person (not profiles) under v2.
          { identityV2Enabled: options.identityV2Enabled },
        );
        return { child, sessions };
      } catch (err) {
        if (err instanceof ForbiddenError) return { child, sessions: [] };
        throw err;
      }
    }),
  );

  // Next-topic enrichment. One targeted, access-scoped lookup over the recap
  // session ids, then merge each result in by sessionId. Non-fatal by design
  // (plan Failure Modes): a lookup failure must never fail the whole recap
  // list — the cards simply render without a "Coming up" line.
  const sessionIds = sessionsByChild.flatMap(({ sessions }) =>
    sessions.map((session) => session.sessionId),
  );
  const childProfileIds = selectedChildren.map((child) => child.profileId);
  let nextTopicBySession: Map<string, NextTopic>;
  try {
    nextTopicBySession = await loadNextTopicMap(
      db,
      childProfileIds,
      sessionIds,
    );
  } catch {
    nextTopicBySession = new Map();
  }

  return sessionsByChild
    .flatMap(({ child, sessions }) =>
      sessions.map((session) =>
        toRecapItem(child, session, nextTopicBySession.get(session.sessionId)),
      ),
    )
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, Math.min(Math.max(options.limit ?? 20, 1), 50));
}

export async function listRecapsForProfile(
  db: Database,
  profileId: string,
  options: {
    limit?: number;
  } = {},
): Promise<RecapListItem[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const [profile, page] = await Promise.all([
    db.query.profiles.findFirst({
      where: eq(profiles.id, profileId),
      columns: { displayName: true },
    }),
    listProfileSessions(db, profileId, { limit }),
  ]);

  const sessionIds = page.sessions.map((session) => session.sessionId);
  let nextTopicBySession: Map<string, NextTopic>;
  try {
    nextTopicBySession = await loadNextTopicMap(db, [profileId], sessionIds);
  } catch {
    nextTopicBySession = new Map();
  }

  return page.sessions.map((session) =>
    profileSessionToRecapItem(
      profileId,
      profile?.displayName ?? 'Learner',
      session,
      nextTopicBySession.get(session.sessionId),
    ),
  );
}

export async function getRecapForParent(
  db: Database,
  parentProfileId: string,
  recapId: string,
  opts?: { identityV2Enabled?: boolean },
): Promise<RecapListItem | null> {
  const children = await getChildrenForParent(db, parentProfileId, {
    identityV2Enabled: opts?.identityV2Enabled,
  });

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
