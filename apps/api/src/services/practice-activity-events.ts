import {
  practiceActivityEvents,
  type Database,
  type PracticeActivityEvent,
} from '@eduagent/database';
import type { ReportPracticeActivityType } from '@eduagent/schemas';

export interface RecordPracticeActivityEventInput {
  profileId: string;
  subjectId?: string | null;
  activityType: ReportPracticeActivityType;
  activitySubtype?: string | null;
  completedAt?: Date;
  pointsEarned?: number | null;
  score?: number | null;
  total?: number | null;
  sourceType: string;
  sourceId: string;
  dedupeKey?: string;
  occurrenceKey?: string | null;
  metadata?: Record<string, unknown>;
}

export function buildPracticeActivityDedupeKey(
  input: Pick<
    RecordPracticeActivityEventInput,
    'activityType' | 'sourceType' | 'sourceId' | 'activitySubtype'
  > & { occurrenceKey?: string | null },
): string {
  const subtype = input.activitySubtype ? `:${input.activitySubtype}` : '';
  const occurrence = input.occurrenceKey ? `:${input.occurrenceKey}` : '';
  return `${input.activityType}:${input.sourceType}${subtype}:${input.sourceId}${occurrence}`;
}

export async function recordPracticeActivityEvent(
  db: Database,
  input: RecordPracticeActivityEventInput,
): Promise<PracticeActivityEvent | null> {
  const dedupeKey = input.dedupeKey ?? buildPracticeActivityDedupeKey(input);
  const [row] = await db
    .insert(practiceActivityEvents)
    .values({
      profileId: input.profileId,
      subjectId: input.subjectId ?? null,
      activityType: input.activityType,
      activitySubtype: input.activitySubtype ?? null,
      completedAt: input.completedAt ?? new Date(),
      pointsEarned: Math.max(0, input.pointsEarned ?? 0),
      score: input.score ?? null,
      total: input.total ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      dedupeKey,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing({
      target: [
        practiceActivityEvents.profileId,
        practiceActivityEvents.dedupeKey,
      ],
    })
    .returning();

  return row ?? null;
}
