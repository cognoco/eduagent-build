import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Nudge, NudgeTemplate } from '@eduagent/schemas';
import { ConsentRequiredError, RateLimitedError } from '@eduagent/schemas';
import {
  accounts,
  familyLinks,
  nudges,
  profiles,
  type Database,
} from '@eduagent/database';

import { assertParentAccess } from './family-access';
import { getConsentStatus } from './consent';
import { createLogger } from './logger';
import { sendPushNotification } from './notifications';

const logger = createLogger();

const NUDGE_RATE_LIMIT = 4;
const NUDGE_WINDOW_HOURS = 24;
const QUIET_HOURS_START = 21;
const QUIET_HOURS_END = 7;

const TEMPLATE_COPY: Record<NudgeTemplate, string> = {
  you_got_this: 'You got this',
  proud_of_you: 'Proud of you',
  quick_session: 'Want to do a quick session?',
  thinking_of_you: 'Just thinking of you',
};

function mapNudgeRow(row: {
  id: string;
  fromProfileId: string;
  toProfileId: string;
  fromDisplayName: string;
  template: NudgeTemplate;
  createdAt: Date;
  readAt: Date | null;
}): Nudge {
  return {
    id: row.id,
    fromProfileId: row.fromProfileId,
    toProfileId: row.toProfileId,
    fromDisplayName: row.fromDisplayName,
    template: row.template,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

function isQuietHours(now: Date, timezone: string | null | undefined): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone ?? 'UTC',
  });
  const hour = Number(formatter.format(now));
  if (!Number.isFinite(hour)) return false;
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}

export async function createNudge(
  db: Database,
  params: {
    fromProfileId: string;
    toProfileId: string;
    template: NudgeTemplate;
    now?: Date;
  },
): Promise<{ nudge: Nudge; pushSent: boolean }> {
  const now = params.now ?? new Date();
  await assertParentAccess(db, params.fromProfileId, params.toProfileId);

  const consentStatus = await getConsentStatus(db, params.toProfileId);
  if (consentStatus !== 'CONSENTED') {
    throw new ConsentRequiredError(
      "This child can't receive nudges until consent is active.",
      'CONSENT_REQUIRED',
    );
  }

  const windowStart = new Date(
    now.getTime() - NUDGE_WINDOW_HOURS * 60 * 60 * 1000,
  );
  const inserted = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${
        'nudge-rate:' + params.fromProfileId + ':' + params.toProfileId
      }, 0))`,
    );

    const [countRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(nudges)
      .where(
        and(
          eq(nudges.fromProfileId, params.fromProfileId),
          eq(nudges.toProfileId, params.toProfileId),
          gt(nudges.createdAt, windowStart),
        ),
      );
    if ((countRow?.count ?? 0) >= NUDGE_RATE_LIMIT) {
      throw new RateLimitedError(
        "You've sent enough encouragement for now.",
        'NUDGE_RATE_LIMITED',
      );
    }

    const [row] = await tx
      .insert(nudges)
      .values({
        fromProfileId: params.fromProfileId,
        toProfileId: params.toProfileId,
        template: params.template,
        createdAt: now,
      })
      .returning();
    if (!row) throw new Error('Nudge insert did not return a row');
    return row;
  });

  const [fromProfile, toProfile] = await Promise.all([
    db.query.profiles.findFirst({
      where: eq(profiles.id, params.fromProfileId),
      columns: { displayName: true, accountId: true },
    }),
    db.query.profiles.findFirst({
      where: eq(profiles.id, params.toProfileId),
      columns: { displayName: true, accountId: true },
    }),
  ]);
  const parentName = fromProfile?.displayName ?? 'Your parent';

  const account = toProfile?.accountId
    ? await db.query.accounts.findFirst({
        where: eq(accounts.id, toProfile.accountId),
        columns: { timezone: true },
      })
    : null;

  let pushSent = false;
  if (isQuietHours(now, account?.timezone)) {
    logger.info('Nudge push suppressed by quiet hours', {
      event: 'notification.nudge.quiet_hours_suppressed',
      toProfileId: params.toProfileId,
    });
  } else {
    const push = await sendPushNotification(
      db,
      {
        profileId: params.toProfileId,
        title: `${parentName} sent you a nudge`,
        body: TEMPLATE_COPY[params.template],
        type: 'nudge',
        data: {
          nudgeId: inserted.id,
          fromDisplayName: parentName,
          templateKey: params.template,
        },
      },
      { skipDailyCap: true },
    );
    pushSent = push.sent;
  }

  return {
    nudge: mapNudgeRow({
      ...inserted,
      fromDisplayName: parentName,
    }),
    pushSent,
  };
}

export async function listUnreadNudges(
  db: Database,
  profileId: string,
): Promise<Nudge[]> {
  const rows = await db
    .select({
      id: nudges.id,
      fromProfileId: nudges.fromProfileId,
      toProfileId: nudges.toProfileId,
      fromDisplayName: profiles.displayName,
      template: nudges.template,
      createdAt: nudges.createdAt,
      readAt: nudges.readAt,
    })
    .from(nudges)
    .innerJoin(profiles, eq(profiles.id, nudges.fromProfileId))
    .innerJoin(
      familyLinks,
      and(
        eq(familyLinks.parentProfileId, nudges.fromProfileId),
        eq(familyLinks.childProfileId, nudges.toProfileId),
      ),
    )
    .where(and(eq(nudges.toProfileId, profileId), isNull(nudges.readAt)))
    .orderBy(desc(nudges.createdAt));

  return rows.map(mapNudgeRow);
}

export async function markNudgeRead(
  db: Database,
  profileId: string,
  nudgeId: string,
): Promise<number> {
  const rows = await db
    .update(nudges)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(nudges.id, nudgeId),
        eq(nudges.toProfileId, profileId),
        isNull(nudges.readAt),
      ),
    )
    .returning({ id: nudges.id });
  return rows.length;
}

export async function markAllNudgesRead(
  db: Database,
  profileId: string,
): Promise<number> {
  const rows = await db
    .update(nudges)
    .set({ readAt: new Date() })
    .where(and(eq(nudges.toProfileId, profileId), isNull(nudges.readAt)))
    .returning({ id: nudges.id });
  return rows.length;
}
