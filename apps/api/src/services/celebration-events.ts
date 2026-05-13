import {
  celebrationEvents,
  type CelebrationEvent,
  type Database,
} from '@eduagent/database';
import type { CelebrationName, CelebrationReason } from '@eduagent/schemas';

export interface RecordCelebrationEventInput {
  profileId: string;
  celebrationType: CelebrationName | string;
  reason: CelebrationReason | string;
  celebratedAt?: Date;
  sourceType?: string | null;
  sourceId?: string | null;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
}

export function buildCelebrationDedupeKey(
  input: Pick<
    RecordCelebrationEventInput,
    'celebrationType' | 'reason' | 'sourceId'
  >,
): string {
  const encodeSegment = (value: string) => encodeURIComponent(value);

  return [
    encodeSegment(input.celebrationType),
    encodeSegment(input.reason),
    encodeSegment(input.sourceId ?? 'none'),
  ].join(':');
}

export async function recordCelebrationEvent(
  db: Database,
  input: RecordCelebrationEventInput,
): Promise<CelebrationEvent | null> {
  const dedupeKey = input.dedupeKey ?? buildCelebrationDedupeKey(input);
  const [row] = await db
    .insert(celebrationEvents)
    .values({
      profileId: input.profileId,
      celebratedAt: input.celebratedAt ?? new Date(),
      celebrationType: input.celebrationType,
      reason: input.reason,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      dedupeKey,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing({
      target: [celebrationEvents.profileId, celebrationEvents.dedupeKey],
    })
    .returning();

  return row ?? null;
}
