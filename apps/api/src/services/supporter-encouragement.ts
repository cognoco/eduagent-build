import { and, eq, gt, isNull, sql } from 'drizzle-orm';

import {
  person,
  supporterEncouragementChips,
  supportership,
  type Database,
} from '@eduagent/database';
import { RateLimitedError } from '@eduagent/schemas';

import { ForbiddenError } from '../errors';
import {
  NUDGE_QUIET_HOURS_END,
  NUDGE_QUIET_HOURS_START,
  NUDGE_RATE_LIMIT,
  NUDGE_WINDOW_HOURS,
} from './nudge';

export type SupporterEncouragementSource = 'kickstart' | 'co_learning_payoff';

export interface SendSupporterEncouragementChipInput {
  supporterPersonId: string;
  supporteePersonId: string;
  source: SupporterEncouragementSource;
  suggestedText: string;
  subjectId?: string;
  topicId?: string;
  now?: Date;
}

export interface SupporterEncouragementChipDescriptor {
  id: string;
  supportershipId: string;
  supporterPersonId: string;
  supporteePersonId: string;
  supporterDisplayName: string;
  source: SupporterEncouragementSource;
  suggestedText: string;
  subjectId?: string | null;
  topicId?: string | null;
  createdAt: Date;
  dismissedAt: Date | null;
  consumedAt: Date | null;
}

function isQuietHours(now: Date, timezone: string | null | undefined): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone ?? 'UTC',
    });
    const hour = Number(formatter.format(now));
    if (!Number.isFinite(hour)) return false;
    return hour >= NUDGE_QUIET_HOURS_START || hour < NUDGE_QUIET_HOURS_END;
  } catch {
    return false;
  }
}

async function assertActiveSupportership(
  db: Database,
  input: SendSupporterEncouragementChipInput,
): Promise<{ edgeId: string; supporterDisplayName: string }> {
  const rows = await db
    .select({
      edgeId: supportership.id,
      supporterDisplayName: person.displayName,
    })
    .from(supportership)
    .innerJoin(person, eq(person.id, supportership.supporterPersonId))
    .where(
      and(
        eq(supportership.supporterPersonId, input.supporterPersonId),
        eq(supportership.supporteePersonId, input.supporteePersonId),
        isNull(supportership.revokedAt),
        isNull(person.archivedAt),
      ),
    )
    .limit(1);

  const edge = rows[0];
  if (!edge) {
    throw new ForbiddenError('You do not have access to this supportee.');
  }
  return edge;
}

export async function sendSupporterEncouragementChip(
  db: Database,
  input: SendSupporterEncouragementChipInput,
): Promise<{
  chip: SupporterEncouragementChipDescriptor;
  pushSuppressedByQuietHours: boolean;
}> {
  const now = input.now ?? new Date();
  const edge = await assertActiveSupportership(db, input);
  const windowStart = new Date(
    now.getTime() - NUDGE_WINDOW_HOURS * 60 * 60 * 1000,
  );

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supporterEncouragementChips)
    .where(
      and(
        eq(
          supporterEncouragementChips.supporterPersonId,
          input.supporterPersonId,
        ),
        eq(
          supporterEncouragementChips.supporteePersonId,
          input.supporteePersonId,
        ),
        gt(supporterEncouragementChips.createdAt, windowStart),
      ),
    )
    .limit(1);

  if ((countRow?.count ?? 0) >= NUDGE_RATE_LIMIT) {
    throw new RateLimitedError(
      "You've sent enough encouragement for now.",
      'NUDGE_RATE_LIMITED',
    );
  }

  const rows = await db
    .insert(supporterEncouragementChips)
    .values({
      supportershipId: edge.edgeId,
      supporterPersonId: input.supporterPersonId,
      supporteePersonId: input.supporteePersonId,
      source: input.source,
      suggestedText: input.suggestedText.trim(),
      subjectId: input.subjectId,
      topicId: input.topicId,
      createdAt: now,
    })
    .returning();

  const row = rows[0];
  if (!row) throw new Error('Supporter encouragement insert returned no row');

  return {
    chip: {
      id: row.id,
      supportershipId: row.supportershipId,
      supporterPersonId: row.supporterPersonId,
      supporteePersonId: row.supporteePersonId,
      supporterDisplayName: edge.supporterDisplayName,
      source: row.source as SupporterEncouragementSource,
      suggestedText: row.suggestedText,
      subjectId: row.subjectId,
      topicId: row.topicId,
      createdAt: row.createdAt,
      dismissedAt: row.dismissedAt,
      consumedAt: row.consumedAt,
    },
    pushSuppressedByQuietHours: isQuietHours(now, undefined),
  };
}
