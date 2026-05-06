import { memoryFacts } from '@eduagent/database';
import {
  interestEntrySchema,
  interestsArraySchema,
  strengthEntrySchema,
  struggleEntrySchema,
  type ConfidenceLevel,
  type InterestEntry,
  type StrengthEntry,
  type StruggleEntry,
} from '@eduagent/schemas';

export type MemoryFactCategory =
  | 'strength'
  | 'struggle'
  | 'interest'
  | 'communication_note'
  | 'suppressed';

export type MemoryFactInsert = typeof memoryFacts.$inferInsert;

export type MemoryProjection = {
  strengths: StrengthEntry[];
  struggles: StruggleEntry[];
  interests: InterestEntry[];
  communicationNotes: string[];
  suppressedInferences: string[];
  interestTimestamps: Record<string, string>;
  createdAt: Date;
};

export type MalformedMemoryEntry = {
  category: string;
  reason: string;
  value: unknown;
};

export type BackfillBuildResult = {
  rows: MemoryFactInsert[];
  malformed: MalformedMemoryEntry[];
};

export function normalizeMemoryText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function dateOrFallback(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function mapStrengthToFact(
  profileId: string,
  entry: StrengthEntry,
  observedAt: Date
): MemoryFactInsert {
  const text = `${entry.subject}: ${entry.topics.join(', ')} (${
    entry.confidence
  })`;
  return {
    profileId,
    category: 'strength',
    text,
    textNormalized: normalizeMemoryText(text),
    metadata: {
      subject: entry.subject,
      topics: entry.topics,
      source: entry.source,
    },
    observedAt,
    confidence: entry.confidence,
  };
}

export function mapStruggleToFact(
  profileId: string,
  entry: StruggleEntry,
  fallbackObservedAt: Date
): MemoryFactInsert {
  const text = `${entry.subject ? `${entry.subject}: ` : ''}${entry.topic} (${
    entry.confidence
  }, attempts ${entry.attempts})`;
  return {
    profileId,
    category: 'struggle',
    text,
    textNormalized: normalizeMemoryText(entry.topic),
    metadata: {
      subject: entry.subject,
      topic: entry.topic,
      attempts: entry.attempts,
      source: entry.source,
    },
    observedAt: dateOrFallback(entry.lastSeen, fallbackObservedAt),
    confidence: entry.confidence,
  };
}

export function mapInterestToFact(
  profileId: string,
  entry: InterestEntry,
  timestamps: Record<string, string>,
  fallbackObservedAt: Date
): MemoryFactInsert {
  return {
    profileId,
    category: 'interest',
    text: entry.label,
    textNormalized: normalizeMemoryText(entry.label),
    metadata: {
      label: entry.label,
      context: entry.context,
      timestamp: timestamps[normalizeMemoryText(entry.label)],
    },
    observedAt: dateOrFallback(
      timestamps[normalizeMemoryText(entry.label)],
      fallbackObservedAt
    ),
    confidence: 'medium',
  };
}

export function mapCommunicationNoteToFact(
  profileId: string,
  note: string,
  observedAt: Date
): MemoryFactInsert {
  return {
    profileId,
    category: 'communication_note',
    text: note,
    textNormalized: normalizeMemoryText(note),
    metadata: {},
    observedAt,
    confidence: 'medium',
  };
}

export function mapSuppressedInferenceToFact(
  profileId: string,
  value: string,
  observedAt: Date,
  originCategory = 'unknown'
): MemoryFactInsert {
  return {
    profileId,
    category: 'suppressed',
    text: value,
    textNormalized: normalizeMemoryText(value),
    metadata: { originCategory },
    observedAt,
    confidence: 'medium',
  };
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') out[normalizeMemoryText(key)] = raw;
  }
  return out;
}

function pushStringRows(
  rows: MemoryFactInsert[],
  malformed: MalformedMemoryEntry[],
  category: string,
  source: unknown,
  mapper: (value: string) => MemoryFactInsert
): void {
  if (!Array.isArray(source)) return;
  for (const value of source) {
    if (typeof value !== 'string' || value.trim() === '') {
      malformed.push({ category, reason: 'expected non-empty string', value });
      continue;
    }
    rows.push(mapper(value.trim()));
  }
}

export function buildMemoryFactRowsFromProjection(
  profileId: string,
  projection: MemoryProjection
): MemoryFactInsert[] {
  return dedupeMemoryFactRows([
    ...projection.strengths.map((entry) =>
      mapStrengthToFact(profileId, entry, projection.createdAt)
    ),
    ...projection.struggles.map((entry) =>
      mapStruggleToFact(profileId, entry, projection.createdAt)
    ),
    ...projection.interests.map((entry) =>
      mapInterestToFact(
        profileId,
        entry,
        projection.interestTimestamps,
        projection.createdAt
      )
    ),
    ...projection.communicationNotes.map((note) =>
      mapCommunicationNoteToFact(profileId, note, projection.createdAt)
    ),
    ...projection.suppressedInferences.map((value) =>
      mapSuppressedInferenceToFact(profileId, value, projection.createdAt)
    ),
  ]);
}

export function memoryFactIdentityKey(row: MemoryFactInsert): string {
  const metadata =
    row.metadata &&
    typeof row.metadata === 'object' &&
    !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return [
    row.profileId,
    row.category,
    typeof metadata['subject'] === 'string' ? metadata['subject'] : '',
    typeof metadata['context'] === 'string' ? metadata['context'] : '',
    row.textNormalized,
  ].join('\u001f');
}

export function dedupeMemoryFactRows(
  rows: MemoryFactInsert[]
): MemoryFactInsert[] {
  const byIdentity = new Map<string, MemoryFactInsert>();
  for (const row of rows) {
    byIdentity.set(memoryFactIdentityKey(row), row);
  }
  return [...byIdentity.values()];
}

export function buildBackfillRowsForProfile(profile: {
  profileId: string;
  strengths: unknown;
  struggles: unknown;
  interests: unknown;
  communicationNotes: unknown;
  suppressedInferences: unknown;
  interestTimestamps: unknown;
  createdAt: Date;
}): BackfillBuildResult {
  const rows: MemoryFactInsert[] = [];
  const malformed: MalformedMemoryEntry[] = [];
  const timestamps = asRecord(profile.interestTimestamps);

  if (Array.isArray(profile.strengths)) {
    for (const value of profile.strengths) {
      const parsed = strengthEntrySchema.safeParse(value);
      if (!parsed.success) {
        malformed.push({
          category: 'strength',
          reason: 'schema parse failed',
          value,
        });
        continue;
      }
      rows.push(
        mapStrengthToFact(profile.profileId, parsed.data, profile.createdAt)
      );
    }
  }

  if (Array.isArray(profile.struggles)) {
    for (const value of profile.struggles) {
      const parsed = struggleEntrySchema.safeParse(value);
      if (!parsed.success) {
        malformed.push({
          category: 'struggle',
          reason: 'schema parse failed',
          value,
        });
        continue;
      }
      rows.push(
        mapStruggleToFact(profile.profileId, parsed.data, profile.createdAt)
      );
    }
  }

  const interestsParsed = interestsArraySchema.safeParse(profile.interests);
  if (interestsParsed.success) {
    for (const entry of interestsParsed.data) {
      const parsed = interestEntrySchema.safeParse(entry);
      if (!parsed.success) {
        malformed.push({
          category: 'interest',
          reason: 'schema parse failed',
          value: entry,
        });
        continue;
      }
      rows.push(
        mapInterestToFact(
          profile.profileId,
          parsed.data,
          timestamps,
          profile.createdAt
        )
      );
    }
  } else if (Array.isArray(profile.interests)) {
    for (const value of profile.interests) {
      malformed.push({
        category: 'interest',
        reason: 'schema parse failed',
        value,
      });
    }
  }

  pushStringRows(
    rows,
    malformed,
    'communication_note',
    profile.communicationNotes,
    (note) =>
      mapCommunicationNoteToFact(profile.profileId, note, profile.createdAt)
  );
  pushStringRows(
    rows,
    malformed,
    'suppressed',
    profile.suppressedInferences,
    (value) =>
      mapSuppressedInferenceToFact(profile.profileId, value, profile.createdAt)
  );

  return { rows: dedupeMemoryFactRows(rows), malformed };
}

export function coerceConfidence(value: unknown): ConfidenceLevel {
  return value === 'low' || value === 'high' || value === 'medium'
    ? value
    : 'medium';
}
