import {
  evidenceLinks,
  sessionEvents,
  topicNotes,
  type Database,
} from '@eduagent/database';

import { BadRequestError } from '../errors';
import {
  getArtifactEvidenceAvailability,
  persistVerifiedChallengeArtifact,
  persistVerifiedChallengeArtifacts,
  resolveEvidenceLink,
} from './evidence-links';

const PROFILE_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_PROFILE_ID = '10000000-0000-4000-8000-000000000002';
const ARTIFACT_ID = '20000000-0000-4000-8000-000000000001';
const SECOND_ARTIFACT_ID = '20000000-0000-4000-8000-000000000002';
const EVENT_ID = '30000000-0000-4000-8000-000000000001';
const LINK_ID = '40000000-0000-4000-8000-000000000001';
const TOPIC_ID = '50000000-0000-4000-8000-000000000001';
const SESSION_ID = '60000000-0000-4000-8000-000000000001';
const CREATED_AT = new Date('2026-07-22T12:00:00.000Z');

type EvidenceRow = {
  id: string;
  profileId: string;
  fromKind: 'artifact';
  fromId: string;
  toKind: 'transcript_excerpt';
  toId: string;
  createdAt: Date;
};

type SessionEventRow = {
  id: string;
  profileId: string;
  content: string;
};

function boundStringValues(expression: unknown): string[] {
  if (!expression || typeof expression !== 'object') return [];
  const chunks = (expression as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) return [];

  const values: string[] = [];
  const collect = (chunk: unknown): void => {
    if (Array.isArray(chunk)) {
      chunk.forEach(collect);
      return;
    }
    if (
      chunk &&
      typeof chunk === 'object' &&
      'value' in chunk &&
      'encoder' in chunk
    ) {
      const value = (chunk as { value: unknown }).value;
      if (typeof value === 'string') values.push(value);
      return;
    }
    if (
      chunk &&
      typeof chunk === 'object' &&
      'queryChunks' in chunk &&
      Array.isArray((chunk as { queryChunks: unknown[] }).queryChunks)
    ) {
      collect((chunk as { queryChunks: unknown[] }).queryChunks);
    }
  };
  chunks.forEach(collect);
  return values;
}

function tableName(table: unknown): string | undefined {
  return (table as { [key: symbol]: string | undefined })[
    Symbol.for('drizzle:Name')
  ];
}

function createEvidenceReadDb(state: {
  links: EvidenceRow[];
  events: SessionEventRow[];
}): { db: Database; selectedSessionEventFields: string[][] } {
  const selectedSessionEventFields: string[][] = [];

  const db = {
    query: {
      evidenceLinks: {
        findMany: async ({ where }: { where: unknown }) => {
          const values = new Set(boundStringValues(where));
          return state.links.filter(
            (row) =>
              values.has(row.profileId) &&
              values.has(row.fromKind) &&
              values.has(row.fromId),
          );
        },
      },
    },
    select: (selection: Record<string, unknown>) => ({
      from: (table: unknown) => {
        if (table !== sessionEvents) {
          throw new Error(
            `Unexpected direct select from ${tableName(table) ?? 'unknown table'}`,
          );
        }
        selectedSessionEventFields.push(Object.keys(selection));
        return {
          where: (where: unknown) => ({
            limit: async (limit: number) => {
              const values = new Set(boundStringValues(where));
              return state.events
                .filter(
                  (row) => values.has(row.id) && values.has(row.profileId),
                )
                .slice(0, limit)
                .map((row) => ({ id: row.id }));
            },
          }),
        };
      },
    }),
  };

  return {
    db: db as unknown as Database,
    selectedSessionEventFields,
  };
}

function evidenceRow(overrides: Partial<EvidenceRow> = {}): EvidenceRow {
  return {
    id: LINK_ID,
    profileId: PROFILE_ID,
    fromKind: 'artifact',
    fromId: ARTIFACT_ID,
    toKind: 'transcript_excerpt',
    toId: EVENT_ID,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function createPersistenceDb(options: { failEvidenceInsertAt?: number } = {}): {
  db: Database;
  artifacts: Array<Record<string, unknown>>;
  links: Array<Record<string, unknown>>;
} {
  const artifacts: Array<Record<string, unknown>> = [];
  const links: Array<Record<string, unknown>> = [];
  let evidenceInsertCount = 0;

  const insert = (table: unknown) => ({
    values: (
      input: Record<string, unknown> | Array<Record<string, unknown>>,
    ) => {
      if (table === topicNotes) {
        return {
          returning: async () => {
            const id =
              artifacts.length === 0 ? ARTIFACT_ID : SECOND_ARTIFACT_ID;
            const row = {
              ...(input as Record<string, unknown>),
              id,
            };
            artifacts.push(row);
            return [{ id }];
          },
        };
      }
      if (table === evidenceLinks) {
        return {
          onConflictDoNothing: async () => {
            evidenceInsertCount += 1;
            if (options.failEvidenceInsertAt === evidenceInsertCount) {
              throw new Error('simulated evidence-link insert failure');
            }
            links.push(...(Array.isArray(input) ? input : [input]));
          },
        };
      }
      throw new Error(
        `Unexpected insert into ${tableName(table) ?? 'unknown table'}`,
      );
    },
  });

  const db = {
    insert,
    transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      const artifactSnapshot = artifacts.map((row) => ({ ...row }));
      const linkSnapshot = links.map((row) => ({ ...row }));
      try {
        return await callback({ insert });
      } catch (error) {
        artifacts.splice(0, artifacts.length, ...artifactSnapshot);
        links.splice(0, links.length, ...linkSnapshot);
        throw error;
      }
    },
  };

  return { db: db as unknown as Database, artifacts, links };
}

describe('verified Challenge artifact persistence', () => {
  it.each([
    'challenge_solid_quote' as const,
    'challenge_drafted_note' as const,
  ])(
    'rejects Art-9 clinical inference before persisting %s',
    async (artifactSource) => {
      const transaction = jest.fn();
      const db = { transaction } as unknown as Database;

      await expect(
        persistVerifiedChallengeArtifact(db, {
          profileId: PROFILE_ID,
          topicId: TOPIC_ID,
          sessionId: SESSION_ID,
          content: 'The learner has ADHD.',
          artifactSource,
          sourceEventIds: [EVENT_ID],
        }),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('persists the artifact and its opaque provenance in one transaction', async () => {
    const { db, artifacts, links } = createPersistenceDb();

    await persistVerifiedChallengeArtifact(db, {
      profileId: PROFILE_ID,
      topicId: TOPIC_ID,
      sessionId: SESSION_ID,
      content: 'Plants convert light into chemical energy.',
      artifactSource: 'challenge_solid_quote',
      sourceEventIds: [EVENT_ID],
    });

    expect(artifacts).toEqual([
      expect.objectContaining({
        profileId: PROFILE_ID,
        content: 'Plants convert light into chemical energy.',
        artifactSource: 'challenge_solid_quote',
        verificationState: 'verified',
      }),
    ]);
    expect(links).toEqual([
      expect.objectContaining({
        profileId: PROFILE_ID,
        fromKind: 'artifact',
        fromId: ARTIFACT_ID,
        toKind: 'transcript_excerpt',
        toId: EVENT_ID,
      }),
    ]);
  });

  it('rolls back the artifact when provenance persistence fails', async () => {
    const { db, artifacts, links } = createPersistenceDb({
      failEvidenceInsertAt: 1,
    });

    await expect(
      persistVerifiedChallengeArtifact(db, {
        profileId: PROFILE_ID,
        topicId: TOPIC_ID,
        sessionId: SESSION_ID,
        content: 'Plants convert light into chemical energy.',
        artifactSource: 'challenge_drafted_note',
        sourceEventIds: [EVENT_ID],
      }),
    ).rejects.toThrow('simulated evidence-link insert failure');
    expect(artifacts).toEqual([]);
    expect(links).toEqual([]);
  });

  it('rolls back the entire solid-artifact set when one provenance insert fails', async () => {
    const { db, artifacts, links } = createPersistenceDb({
      failEvidenceInsertAt: 2,
    });

    await expect(
      persistVerifiedChallengeArtifacts(db, {
        profileId: PROFILE_ID,
        topicId: TOPIC_ID,
        sessionId: SESSION_ID,
        artifacts: [
          {
            content: 'Plants absorb light energy.',
            artifactSource: 'challenge_solid_quote',
            sourceEventIds: [EVENT_ID],
          },
          {
            content: 'That energy helps produce glucose.',
            artifactSource: 'challenge_solid_quote',
            sourceEventIds: ['30000000-0000-4000-8000-000000000002'],
          },
        ],
      }),
    ).rejects.toThrow('simulated evidence-link insert failure');
    expect(artifacts).toEqual([]);
    expect(links).toEqual([]);
  });
});

describe('evidence-link availability reads', () => {
  it('reports available while returning no transcript body', async () => {
    const { db, selectedSessionEventFields } = createEvidenceReadDb({
      links: [evidenceRow()],
      events: [
        {
          id: EVENT_ID,
          profileId: PROFILE_ID,
          content: 'raw transcript body must never leave the resolver',
        },
      ],
    });

    await expect(
      getArtifactEvidenceAvailability(db, PROFILE_ID, ARTIFACT_ID),
    ).resolves.toBe('available');
    const resolution = await resolveEvidenceLink(db, {
      ...evidenceRow(),
      createdAt: CREATED_AT.toISOString(),
    });

    expect(resolution).toEqual({
      evidenceLinkId: LINK_ID,
      toKind: 'transcript_excerpt',
      availability: 'available',
    });
    expect(resolution).not.toHaveProperty('content');
    expect(selectedSessionEventFields).toEqual([['id'], ['id']]);
  });

  it('reports source_unavailable when the transcript target was purged', async () => {
    const { db } = createEvidenceReadDb({
      links: [evidenceRow()],
      events: [],
    });

    await expect(
      getArtifactEvidenceAvailability(db, PROFILE_ID, ARTIFACT_ID),
    ).resolves.toBe('source_unavailable');
  });

  it('reports source_unavailable when no evidence link exists', async () => {
    const { db } = createEvidenceReadDb({ links: [], events: [] });

    await expect(
      getArtifactEvidenceAvailability(db, PROFILE_ID, ARTIFACT_ID),
    ).resolves.toBe('source_unavailable');
  });

  it("does not resolve another profile's link or transcript target", async () => {
    const { db } = createEvidenceReadDb({
      links: [evidenceRow()],
      events: [
        {
          id: EVENT_ID,
          profileId: PROFILE_ID,
          content: 'other profile transcript',
        },
      ],
    });

    await expect(
      getArtifactEvidenceAvailability(db, OTHER_PROFILE_ID, ARTIFACT_ID),
    ).resolves.toBe('source_unavailable');
  });
});
