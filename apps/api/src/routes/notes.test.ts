import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import { noteRoutes } from './notes';
import type { AppVariables } from '../types/hono';

const PROFILE_ID = 'a0000000-0000-4000-a000-000000000001';
const SUBJECT_ID = 'a0000000-0000-4000-a000-000000000010';
const TOPIC_ID = 'a0000000-0000-4000-a000-000000000020';
const NOTE_ID = 'a0000000-0000-4000-a000-000000000030';
const NOTE_ID_2 = 'a0000000-0000-4000-a000-000000000031';
const BOOK_ID = 'a0000000-0000-4000-a000-000000000040';
const SESSION_ID = 'a0000000-0000-4000-a000-000000000050';

type FakeDb = Database & {
  selectRows: unknown[][];
  deleteRows: unknown[][];
};

function makeFakeDb({
  noteExists,
  deleteSucceeds = true,
}: {
  noteExists: boolean;
  deleteSucceeds?: boolean;
}): FakeDb {
  const db = {
    selectRows: [
      [{ id: TOPIC_ID }],
      noteExists
        ? [
            {
              id: NOTE_ID,
              topicId: TOPIC_ID,
              content: 'Latest note',
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
          ]
        : [],
    ],
    deleteRows: [deleteSucceeds ? [{ id: NOTE_ID }] : []],
    select() {
      const rows = this.selectRows.shift() ?? [];
      return {
        from() {
          return this;
        },
        innerJoin() {
          return this;
        },
        where() {
          return this;
        },
        orderBy() {
          return this;
        },
        limit() {
          return Promise.resolve(rows);
        },
      };
    },
    delete() {
      const rows = this.deleteRows.shift() ?? [];
      return {
        where() {
          return this;
        },
        returning() {
          return Promise.resolve(rows);
        },
      };
    },
  };

  return db as unknown as FakeDb;
}

function makeApp(db: FakeDb) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use('*', async (c, next) => {
    c.set('db', db as AppVariables['db']);
    c.set('profileId', PROFILE_ID);
    c.set('profileMeta', { isOwner: true } as AppVariables['profileMeta']);
    await next();
  });

  app.route('/v1', noteRoutes);
  return app;
}

describe('note routes', () => {
  describe('GET /v1/notes', () => {
    it('returns global notes for the active profile', async () => {
      const db = makeFakeDb({ noteExists: false });
      db.selectRows = [
        [
          {
            id: NOTE_ID,
            topicId: TOPIC_ID,
            topicTitle: 'Atomic Structure',
            bookId: BOOK_ID,
            bookTitle: 'Chemistry Basics',
            subjectId: SUBJECT_ID,
            subjectName: 'Chemistry',
            sessionId: SESSION_ID,
            content: 'Remember that atoms are mostly empty space.',
            createdAt: new Date('2026-05-15T10:00:00.000Z'),
            updatedAt: new Date('2026-05-15T10:05:00.000Z'),
          },
        ],
      ];
      const app = makeApp(db);

      const res = await app.request('/v1/notes?limit=1');

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        notes: [
          {
            id: NOTE_ID,
            topicId: TOPIC_ID,
            topicTitle: 'Atomic Structure',
            bookId: BOOK_ID,
            bookTitle: 'Chemistry Basics',
            subjectId: SUBJECT_ID,
            subjectName: 'Chemistry',
            sessionId: SESSION_ID,
            content: 'Remember that atoms are mostly empty space.',
            createdAt: '2026-05-15T10:00:00.000Z',
            updatedAt: '2026-05-15T10:05:00.000Z',
          },
        ],
        nextCursor: null,
      });
      expect(db.selectRows).toHaveLength(0);
    });

    it('returns a next cursor when more notes are available', async () => {
      const db = makeFakeDb({ noteExists: false });
      db.selectRows = [
        [
          {
            id: NOTE_ID,
            topicId: TOPIC_ID,
            topicTitle: 'Atomic Structure',
            bookId: BOOK_ID,
            bookTitle: 'Chemistry Basics',
            subjectId: SUBJECT_ID,
            subjectName: 'Chemistry',
            sessionId: null,
            content: 'First visible note.',
            createdAt: new Date('2026-05-15T10:00:00.000Z'),
            updatedAt: new Date('2026-05-15T10:05:00.000Z'),
          },
          {
            id: NOTE_ID_2,
            topicId: TOPIC_ID,
            topicTitle: 'Atomic Structure',
            bookId: BOOK_ID,
            bookTitle: 'Chemistry Basics',
            subjectId: SUBJECT_ID,
            subjectName: 'Chemistry',
            sessionId: null,
            content: 'Second row is the lookahead row.',
            createdAt: new Date('2026-05-15T09:00:00.000Z'),
            updatedAt: new Date('2026-05-15T09:05:00.000Z'),
          },
        ],
      ];
      const app = makeApp(db);

      const res = await app.request('/v1/notes?limit=1');

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        notes: [{ id: NOTE_ID, content: 'First visible note.' }],
        nextCursor: NOTE_ID,
      });
    });

    it('rejects invalid query params', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeApp(db);

      const res = await app.request('/v1/notes?limit=0');

      expect(res.status).toBe(400);
      expect(db.selectRows).toHaveLength(2);
    });
  });

  describe('DELETE /v1/subjects/:subjectId/topics/:topicId/note', () => {
    it('deletes the latest topic note through the legacy mobile URL', async () => {
      const db = makeFakeDb({ noteExists: true });
      const app = makeApp(db);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/note`,
        { method: 'DELETE' },
      );

      expect(res.status).toBe(204);
      expect(db.selectRows).toHaveLength(0);
      expect(db.deleteRows).toHaveLength(0);
    });

    it('returns 404 when the legacy URL has no latest note to delete', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeApp(db);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/note`,
        { method: 'DELETE' },
      );

      expect(res.status).toBe(404);
      expect(db.selectRows).toHaveLength(0);
      expect(db.deleteRows).toHaveLength(1);
    });
  });
});
