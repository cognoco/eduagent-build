import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import { noteRoutes } from './notes';
import type { AppVariables } from '../types/hono';

const PROFILE_ID = 'a0000000-0000-4000-a000-000000000001';
const SUBJECT_ID = 'a0000000-0000-4000-a000-000000000010';
const TOPIC_ID = 'a0000000-0000-4000-a000-000000000020';
const NOTE_ID = 'a0000000-0000-4000-a000-000000000030';

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
