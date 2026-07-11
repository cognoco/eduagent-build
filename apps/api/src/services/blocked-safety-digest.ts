import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import {
  blockedSafetyDailyBuckets,
  blockedSafetyDigestReceipts,
  type BlockedSafetyDailyBucket,
  type Database,
} from '@eduagent/database';
import type { BlockedSafetyDigestEvent } from '@eduagent/schemas';
import { buildEmailIdempotencyKey } from './dedupe-key';
import {
  sendEmail,
  type EmailOptions,
  type EmailPayload,
  type EmailResult,
} from './notifications/email';

type DigestCounterKey =
  | 'dangerousProcedureBlockedCount'
  | 'minorPiiEchoRedactedCount'
  | 'suitabilityBlockedCount';

function counterForEvent(
  name: BlockedSafetyDigestEvent['name'],
): DigestCounterKey {
  switch (name) {
    case 'app/safety.dangerous_procedure_blocked':
      return 'dangerousProcedureBlockedCount';
    case 'app/safety.minor_pii_echo_redacted':
      return 'minorPiiEchoRedactedCount';
    case 'app/safety.suitability_blocked':
      return 'suitabilityBlockedCount';
  }
}

export async function recordBlockedSafetyDigestEvent(
  db: Database,
  event: BlockedSafetyDigestEvent,
  now: Date = new Date(),
): Promise<{ recorded: boolean; bucketDate: string }> {
  const bucketDate = now.toISOString().slice(0, 10);
  const counterKey = counterForEvent(event.name);
  const counterColumn = blockedSafetyDailyBuckets[counterKey];

  return db.transaction(async (tx) => {
    const insertedReceipts = await tx
      .insert(blockedSafetyDigestReceipts)
      .values({
        eventId: event.eventId,
        eventName: event.name,
        bucketDate,
        recordedAt: now,
      })
      .onConflictDoNothing({
        target: blockedSafetyDigestReceipts.eventId,
      })
      .returning({ eventId: blockedSafetyDigestReceipts.eventId });

    if (insertedReceipts.length === 0) {
      return { recorded: false, bucketDate };
    }

    await tx
      .insert(blockedSafetyDailyBuckets)
      .values({ bucketDate, [counterKey]: 1 })
      .onConflictDoUpdate({
        target: blockedSafetyDailyBuckets.bucketDate,
        set: {
          [counterKey]: sql`${counterColumn} + 1`,
          updatedAt: now,
        },
      });

    return { recorded: true, bucketDate };
  });
}

interface BlockedSafetyDigestEmailConfig {
  to: string;
  resendApiKey?: string;
  emailFrom?: string;
}

type SendDigestEmail = (
  payload: EmailPayload,
  options?: EmailOptions,
) => Promise<EmailResult>;

export async function deliverBlockedSafetyDigestBucket(
  db: Database,
  bucket: BlockedSafetyDailyBucket,
  config: BlockedSafetyDigestEmailConfig,
  send: SendDigestEmail = sendEmail,
  now: Date = new Date(),
): Promise<{ delivered: true } | { delivered: false; reason: 'empty' }> {
  const total =
    bucket.dangerousProcedureBlockedCount +
    bucket.minorPiiEchoRedactedCount +
    bucket.suitabilityBlockedCount;
  if (total === 0) return { delivered: false, reason: 'empty' };

  const result = await send(
    {
      to: config.to,
      subject: `Blocked-safety digest — ${bucket.bucketDate} UTC`,
      body: [
        'Blocked-safety operator digest',
        `UTC date: ${bucket.bucketDate}`,
        `Dangerous procedure blocks: ${bucket.dangerousProcedureBlockedCount}`,
        `Minor PII echo redactions: ${bucket.minorPiiEchoRedactedCount}`,
        `Suitability blocks: ${bucket.suitabilityBlockedCount}`,
      ].join('\n'),
      type: 'blocked_safety_digest',
    },
    {
      resendApiKey: config.resendApiKey,
      emailFrom: config.emailFrom,
      idempotencyKey: buildEmailIdempotencyKey(
        'blocked-safety-digest',
        bucket.bucketDate,
      ),
      db,
    },
  );

  if (!result.sent) {
    throw new Error(
      `blocked-safety digest email failed: ${result.reason ?? 'unknown'}`,
    );
  }

  const marked = await db
    .update(blockedSafetyDailyBuckets)
    .set({ deliveredAt: now })
    .where(
      and(
        eq(blockedSafetyDailyBuckets.bucketDate, bucket.bucketDate),
        isNull(blockedSafetyDailyBuckets.deliveredAt),
      ),
    )
    .returning({ bucketDate: blockedSafetyDailyBuckets.bucketDate });

  if (marked.length !== 1) {
    const current = await db.query.blockedSafetyDailyBuckets.findFirst({
      where: eq(blockedSafetyDailyBuckets.bucketDate, bucket.bucketDate),
      columns: { deliveredAt: true },
    });
    if (current?.deliveredAt) return { delivered: true };
    throw new Error('blocked-safety digest bucket was not marked delivered');
  }

  return { delivered: true };
}

export async function listUndeliveredClosedBlockedSafetyBuckets(
  db: Database,
  currentUtcDate: string,
): Promise<BlockedSafetyDailyBucket[]> {
  return db
    .select()
    .from(blockedSafetyDailyBuckets)
    .where(
      and(
        lt(blockedSafetyDailyBuckets.bucketDate, currentUtcDate),
        isNull(blockedSafetyDailyBuckets.deliveredAt),
      ),
    )
    .orderBy(asc(blockedSafetyDailyBuckets.bucketDate));
}
