import { and, eq, sql } from 'drizzle-orm';
import {
  learningProfiles,
  memoryFacts,
  type Database,
  type ScopedRepository,
} from '@eduagent/database';
import {
  interestEntrySchema,
  interestsArraySchema,
  type InterestEntry,
  type StrengthEntry,
  type StruggleEntry,
} from '@eduagent/schemas';
import {
  buildMemoryFactRowsFromProjection,
  coerceConfidence,
  type MemoryProjection,
} from './backfill-mapping';

export type MemorySnapshot = {
  strengths: StrengthEntry[];
  struggles: StruggleEntry[];
  interests: InterestEntry[];
  communicationNotes: string[];
  suppressedInferences: string[];
  interestTimestamps: Record<string, string>;
};

type MemoryFactsWriter = Pick<Database, 'delete' | 'insert' | 'update'>;

export function emptyMemorySnapshot(): MemorySnapshot {
  return {
    strengths: [],
    struggles: [],
    interests: [],
    communicationNotes: [],
    suppressedInferences: [],
    interestTimestamps: {},
  };
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function reconstructStrength(
  text: string,
  metadata: Record<string, unknown>,
  confidence: unknown
): StrengthEntry | null {
  const subject =
    typeof metadata['subject'] === 'string' ? metadata['subject'] : '';
  const topics = asStringArray(metadata['topics']);
  if (!subject || topics.length === 0) return null;
  return {
    subject,
    topics,
    confidence: coerceConfidence(metadata['confidence'] ?? confidence),
    source:
      metadata['source'] === 'learner' ||
      metadata['source'] === 'parent' ||
      metadata['source'] === 'inferred'
        ? metadata['source']
        : undefined,
  };
}

function reconstructStruggle(
  text: string,
  metadata: Record<string, unknown>,
  confidence: unknown,
  observedAt: Date
): StruggleEntry | null {
  const topic =
    typeof metadata['topic'] === 'string' ? metadata['topic'] : text;
  if (!topic) return null;
  const subject =
    typeof metadata['subject'] === 'string' ? metadata['subject'] : null;
  const attempts =
    typeof metadata['attempts'] === 'number' &&
    Number.isInteger(metadata['attempts']) &&
    metadata['attempts'] > 0
      ? metadata['attempts']
      : 1;
  return {
    subject,
    topic,
    lastSeen: observedAt.toISOString(),
    attempts,
    confidence: coerceConfidence(metadata['confidence'] ?? confidence),
    source:
      metadata['source'] === 'learner' ||
      metadata['source'] === 'parent' ||
      metadata['source'] === 'inferred'
        ? metadata['source']
        : undefined,
  };
}

function reconstructInterest(
  text: string,
  metadata: Record<string, unknown>
): InterestEntry {
  const label =
    typeof metadata['label'] === 'string' ? metadata['label'] : text;
  const parsed = interestEntrySchema.safeParse({
    label,
    context:
      metadata['context'] === 'free_time' ||
      metadata['context'] === 'school' ||
      metadata['context'] === 'both'
        ? metadata['context']
        : 'both',
  });
  return parsed.success ? parsed.data : { label: text, context: 'both' };
}

export async function readMemorySnapshotFromFacts(
  scoped: ScopedRepository,
  profile: {
    memoryConsentStatus?: string | null;
    memoryEnabled?: boolean;
    memoryInjectionEnabled?: boolean;
  } | null,
  options?: { respectInjectionToggle?: boolean }
): Promise<MemorySnapshot> {
  const respectInjectionToggle = options?.respectInjectionToggle ?? true;
  const injectionEnabled =
    profile?.memoryConsentStatus === 'granted' &&
    (!respectInjectionToggle ||
      (profile.memoryInjectionEnabled ?? profile.memoryEnabled ?? true));
  if (!profile || !injectionEnabled) return emptyMemorySnapshot();

  const rows = await scoped.memoryFacts.findManyActive();
  const snapshot = emptyMemorySnapshot();

  for (const row of rows) {
    const metadata = metadataRecord(row.metadata);
    switch (row.category) {
      case 'strength': {
        const entry = reconstructStrength(row.text, metadata, row.confidence);
        if (entry) snapshot.strengths.push(entry);
        break;
      }
      case 'struggle': {
        const entry = reconstructStruggle(
          row.text,
          metadata,
          row.confidence,
          row.observedAt
        );
        if (entry) snapshot.struggles.push(entry);
        break;
      }
      case 'interest': {
        const entry = reconstructInterest(row.text, metadata);
        snapshot.interests.push(entry);
        snapshot.interestTimestamps[entry.label.toLowerCase()] =
          row.observedAt.toISOString();
        break;
      }
      case 'communication_note':
        snapshot.communicationNotes.push(row.text);
        break;
      case 'suppressed':
        snapshot.suppressedInferences.push(row.text);
        break;
    }
  }

  return snapshot;
}

export function buildProjectionFromMergedState(profile: {
  strengths: unknown;
  struggles: unknown;
  interests: unknown;
  communicationNotes: unknown;
  suppressedInferences: unknown;
  interestTimestamps: unknown;
  createdAt: Date;
}): MemoryProjection {
  const interestsParsed = interestsArraySchema.safeParse(profile.interests);
  return {
    strengths: Array.isArray(profile.strengths)
      ? (profile.strengths as StrengthEntry[])
      : [],
    struggles: Array.isArray(profile.struggles)
      ? (profile.struggles as StruggleEntry[])
      : [],
    interests: interestsParsed.success ? interestsParsed.data : [],
    communicationNotes: asStringArray(profile.communicationNotes),
    suppressedInferences: asStringArray(profile.suppressedInferences),
    interestTimestamps: metadataRecord(profile.interestTimestamps) as Record<
      string,
      string
    >,
    createdAt: profile.createdAt,
  };
}

export async function replaceActiveMemoryFactsForProfile(
  db: MemoryFactsWriter,
  profileId: string,
  projection: MemoryProjection
): Promise<void> {
  await db
    .delete(memoryFacts)
    .where(
      and(
        eq(memoryFacts.profileId, profileId),
        sql`${memoryFacts.supersededBy} IS NULL`
      )
    );

  const rows = buildMemoryFactRowsFromProjection(profileId, projection);
  if (rows.length > 0) {
    await db.insert(memoryFacts).values(rows);
  }
}

export async function writeMemoryFactsForAnalysis(
  db: MemoryFactsWriter,
  profileId: string,
  mergedState: Parameters<typeof buildProjectionFromMergedState>[0]
): Promise<void> {
  await replaceActiveMemoryFactsForProfile(
    db,
    profileId,
    buildProjectionFromMergedState(mergedState)
  );
  await db
    .update(learningProfiles)
    .set({ memoryFactsBackfilledAt: new Date() })
    .where(eq(learningProfiles.profileId, profileId));
}

export async function writeMemoryFactsForDeletion(
  db: MemoryFactsWriter,
  profileId: string,
  mergedState: Parameters<typeof buildProjectionFromMergedState>[0]
): Promise<void> {
  await writeMemoryFactsForAnalysis(db, profileId, mergedState);
}
