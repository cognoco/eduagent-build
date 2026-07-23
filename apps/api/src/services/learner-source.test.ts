import type { Database } from '@eduagent/database';

import { assembleLearnerSource } from './learner-source';

const PROFILE_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_PROFILE_ID = '10000000-0000-4000-8000-000000000002';
const NOTE_ID = '20000000-0000-4000-8000-000000000001';
const BOOKMARK_ID = '20000000-0000-4000-8000-000000000002';
const EVENT_ID = '20000000-0000-4000-8000-000000000003';
const SESSION_ID = '20000000-0000-4000-8000-000000000004';
const TOPIC_ID = '30000000-0000-4000-8000-000000000001';
const SUBJECT_ID = '40000000-0000-4000-8000-000000000001';
const CREATED_AT = new Date('2026-07-22T12:00:00.000Z');

type SourceRow = {
  id: string;
  profileId: string;
  subjectId: string;
  topicId: string | null;
  sessionId: string | null;
  content?: string;
  metadata?: unknown;
  createdAt: Date;
};

function boundStrings(expression: unknown): Set<string> {
  const values = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if ('value' in value && 'encoder' in value) {
      const bound = (value as { value: unknown }).value;
      if (typeof bound === 'string') values.add(bound);
    }
    if ('queryChunks' in value) {
      visit((value as { queryChunks: unknown }).queryChunks);
    }
  };
  visit(expression);
  return values;
}

function createDb(rows: {
  notes: SourceRow[];
  bookmarks: SourceRow[];
  events: SourceRow[];
  sessions: SourceRow[];
}): Database {
  const findScoped =
    (sourceRows: SourceRow[]) =>
    async ({ where }: { where: unknown }): Promise<SourceRow | undefined> => {
      const values = boundStrings(where);
      return sourceRows.find(
        (row) => values.has(row.id) && values.has(row.profileId),
      );
    };

  const db = {
    query: {
      bookmarks: { findFirst: findScoped(rows.bookmarks) },
      sessionEvents: { findFirst: findScoped(rows.events) },
      learningSessions: { findFirst: findScoped(rows.sessions) },
    },
    select: () => ({
      from: () => {
        const chain = {
          innerJoin: () => chain,
          where: (where: unknown) => ({
            limit: async () => {
              const values = boundStrings(where);
              const row = rows.notes.find(
                (candidate) =>
                  values.has(candidate.id) && values.has(candidate.profileId),
              );
              return row
                ? [
                    {
                      id: row.id,
                      profileId: row.profileId,
                      topicId: row.topicId,
                      subjectId: row.subjectId,
                      sessionId: row.sessionId,
                      excerpt: row.content,
                      createdAt: row.createdAt,
                    },
                  ]
                : [];
            },
          }),
        };
        return chain;
      },
    }),
  };

  return db as unknown as Database;
}

function sourceRows(): Parameters<typeof createDb>[0] {
  return {
    notes: [
      {
        id: NOTE_ID,
        profileId: PROFILE_ID,
        subjectId: SUBJECT_ID,
        topicId: TOPIC_ID,
        sessionId: SESSION_ID,
        content: 'My note',
        createdAt: CREATED_AT,
      },
    ],
    bookmarks: [
      {
        id: BOOKMARK_ID,
        profileId: PROFILE_ID,
        subjectId: SUBJECT_ID,
        topicId: null,
        sessionId: SESSION_ID,
        content: 'Kept mentor reply',
        createdAt: CREATED_AT,
      },
    ],
    events: [
      {
        id: EVENT_ID,
        profileId: PROFILE_ID,
        subjectId: SUBJECT_ID,
        topicId: TOPIC_ID,
        sessionId: SESSION_ID,
        content: 'Learner explanation',
        createdAt: CREATED_AT,
      },
    ],
    sessions: [
      {
        id: SESSION_ID,
        profileId: PROFILE_ID,
        subjectId: SUBJECT_ID,
        topicId: null,
        sessionId: SESSION_ID,
        metadata: {
          homework: {
            problemCount: 1,
            currentProblemIndex: 0,
            problems: [],
            ocrText: 'OCR worksheet text',
          },
        },
        createdAt: CREATED_AT,
      },
    ],
  };
}

describe('assembleLearnerSource', () => {
  it('assembles all four decided source kinds with shared metadata', async () => {
    const db = createDb(sourceRows());

    await expect(
      assembleLearnerSource(db, PROFILE_ID, { kind: 'note', id: NOTE_ID }),
    ).resolves.toEqual({
      kind: 'note',
      id: NOTE_ID,
      profileId: PROFILE_ID,
      topicId: TOPIC_ID,
      subjectId: SUBJECT_ID,
      sessionId: SESSION_ID,
      excerpt: 'My note',
      createdAt: CREATED_AT.toISOString(),
    });
    await expect(
      assembleLearnerSource(db, PROFILE_ID, {
        kind: 'bookmark',
        id: BOOKMARK_ID,
      }),
    ).resolves.toEqual({
      kind: 'bookmark',
      id: BOOKMARK_ID,
      profileId: PROFILE_ID,
      subjectId: SUBJECT_ID,
      sessionId: SESSION_ID,
      excerpt: 'Kept mentor reply',
      createdAt: CREATED_AT.toISOString(),
    });
    await expect(
      assembleLearnerSource(db, PROFILE_ID, {
        kind: 'transcript_excerpt',
        id: EVENT_ID,
      }),
    ).resolves.toEqual({
      kind: 'transcript_excerpt',
      id: EVENT_ID,
      profileId: PROFILE_ID,
      topicId: TOPIC_ID,
      subjectId: SUBJECT_ID,
      sessionId: SESSION_ID,
      excerpt: 'Learner explanation',
      createdAt: CREATED_AT.toISOString(),
    });
    await expect(
      assembleLearnerSource(db, PROFILE_ID, {
        kind: 'homework_ocr',
        id: SESSION_ID,
      }),
    ).resolves.toEqual({
      kind: 'homework_ocr',
      id: SESSION_ID,
      profileId: PROFILE_ID,
      subjectId: SUBJECT_ID,
      sessionId: SESSION_ID,
      excerpt: 'OCR worksheet text',
      createdAt: CREATED_AT.toISOString(),
    });
  });

  it('never assembles another profile source', async () => {
    const db = createDb(sourceRows());

    await expect(
      Promise.all([
        assembleLearnerSource(db, OTHER_PROFILE_ID, {
          kind: 'note',
          id: NOTE_ID,
        }),
        assembleLearnerSource(db, OTHER_PROFILE_ID, {
          kind: 'bookmark',
          id: BOOKMARK_ID,
        }),
        assembleLearnerSource(db, OTHER_PROFILE_ID, {
          kind: 'transcript_excerpt',
          id: EVENT_ID,
        }),
        assembleLearnerSource(db, OTHER_PROFILE_ID, {
          kind: 'homework_ocr',
          id: SESSION_ID,
        }),
      ]),
    ).resolves.toEqual([null, null, null, null]);
  });
});
