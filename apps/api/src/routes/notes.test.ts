import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import { noteRoutes } from './notes';
import type { AppVariables } from '../types/hono';
import { TEST_PROFILE_ID, TEST_SESSION_ID } from '@eduagent/test-utils';

// [WI-2416] assertCanReadProfile (all GET /notes* routes) calls
// verifyPersonOwnershipV2, which runs a raw db.select() membership query.
// This file's fake db is a call-order shift-queue keyed to the ROUTE's own
// selects (see makeFakeDb) — an extra, unaccounted-for select from the guard
// would desync the queue and return the wrong pre-programmed rows to
// unrelated assertions. Every scenario in this file is a caller-self read
// (makeApp sets callerPersonId === profileId); the cross-account read attack
// this guard exists to close is covered by the real-DB break test in
// tests/integration/wi2416-read-idor.integration.test.ts.
// gc1-allow: verifyPersonOwnershipV2 runs a raw db.select() membership query
// with no real implementation available in this file's shift-queue mock DB.
jest.mock('../services/identity-v2/ownership-v2', () => ({
  ...jest.requireActual('../services/identity-v2/ownership-v2'),
  verifyPersonOwnershipV2: jest.fn().mockResolvedValue(undefined),
}));

const PROFILE_ID = TEST_PROFILE_ID;
const SUBJECT_ID = 'a0000000-0000-4000-a000-000000000010';
const TOPIC_ID = 'a0000000-0000-4000-a000-000000000020';
const NOTE_ID = 'a0000000-0000-4000-a000-000000000030';
const NOTE_ID_2 = 'a0000000-0000-4000-a000-000000000031';
const BOOK_ID = 'a0000000-0000-4000-a000-000000000040';
const SESSION_ID = TEST_SESSION_ID;

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
      const builder = {
        from() {
          return builder;
        },
        innerJoin() {
          return builder;
        },
        where() {
          return builder;
        },
        orderBy() {
          return builder;
        },
        limit() {
          return Promise.resolve(rows);
        },
        then<TResult1 = unknown[], TResult2 = never>(
          onfulfilled?:
            | ((value: unknown[]) => TResult1 | PromiseLike<TResult1>)
            | null,
          onrejected?:
            | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
            | null,
        ) {
          return Promise.resolve(rows).then(onfulfilled, onrejected);
        },
      };
      return builder;
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
    // [WI-2416] assertCanReadProfile requires both; self-scoped throughout
    // this file (callerPersonId === profileId).
    c.set('account', { id: 'test-account-id' } as AppVariables['account']);
    c.set('callerPersonId', PROFILE_ID);
    c.set('profileId', PROFILE_ID);
    c.set('profileMeta', {
      isOwner: true,
      resolvedVia: 'explicit-header',
    } as AppVariables['profileMeta']);
    await next();
  });

  app.route('/v1', noteRoutes);
  return app;
}

// Helper: build an app that simulates a proxy (non-owner) session
function makeProxyApp(db: FakeDb) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use('*', async (c, next) => {
    c.set('db', db as AppVariables['db']);
    c.set('profileId', PROFILE_ID);
    c.set('profileMeta', {
      isOwner: false,
      resolvedVia: 'auto',
    } as AppVariables['profileMeta']);
    await next();
  });

  app.route('/v1', noteRoutes);
  return app;
}

// Helper: build an app with no profileId resolved (simulates missing/inactive profile)
function makeNoProfileApp(db: FakeDb) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use('*', async (c, next) => {
    c.set('db', db as AppVariables['db']);
    // profileId intentionally left unset — requireProfileId will throw 400
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
            origin: 'self',
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

    it('returns 400 for limit over max (51)', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeApp(db);

      const res = await app.request('/v1/notes?limit=51');
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-numeric limit', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeApp(db);

      const res = await app.request('/v1/notes?limit=abc');
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid cursor (not a UUID)', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeApp(db);

      const res = await app.request('/v1/notes?cursor=not-a-uuid');
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid subjectId (not a UUID)', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeApp(db);

      const res = await app.request('/v1/notes?subjectId=not-a-uuid');
      expect(res.status).toBe(400);
    });

    it('returns 400 when no profileId is resolved (missing/inactive profile)', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeNoProfileApp(db);

      const res = await app.request('/v1/notes');
      expect(res.status).toBe(400);
    });

    it('returns 200 with empty notes array (not 404)', async () => {
      const db = makeFakeDb({ noteExists: false });
      db.selectRows = [[]]; // empty result from service
      const app = makeApp(db);

      const res = await app.request('/v1/notes');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.notes).toEqual([]);
      expect(body.nextCursor).toBeNull();
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

    it('returns 403 when in proxy mode (isOwner=false)', async () => {
      const db = makeFakeDb({ noteExists: true });
      const app = makeProxyApp(db);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/note`,
        { method: 'DELETE' },
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('PROXY_MODE');
    });

    it('returns 400 for non-UUID subjectId', async () => {
      const db = makeFakeDb({ noteExists: true });
      const app = makeApp(db);

      const res = await app.request(
        `/v1/subjects/not-a-uuid/topics/${TOPIC_ID}/note`,
        { method: 'DELETE' },
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-UUID topicId', async () => {
      const db = makeFakeDb({ noteExists: true });
      const app = makeApp(db);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/not-a-uuid/note`,
        { method: 'DELETE' },
      );
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /v1/notes/:noteId', () => {
    it('returns 204 on successful delete', async () => {
      const db = makeFakeDb({ noteExists: true, deleteSucceeds: true });
      const app = makeApp(db);

      const res = await app.request(`/v1/notes/${NOTE_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
    });

    it('returns 404 when note not found', async () => {
      const db = makeFakeDb({ noteExists: false, deleteSucceeds: false });
      const app = makeApp(db);

      const res = await app.request(`/v1/notes/${NOTE_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });

    it('returns 400 for non-UUID noteId', async () => {
      const db = makeFakeDb({ noteExists: true });
      const app = makeApp(db);

      const res = await app.request('/v1/notes/not-a-uuid', {
        method: 'DELETE',
      });
      expect(res.status).toBe(400);
    });

    it('returns 403 when in proxy mode (isOwner=false)', async () => {
      const db = makeFakeDb({ noteExists: true, deleteSucceeds: true });
      const app = makeProxyApp(db);

      const res = await app.request(`/v1/notes/${NOTE_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('PROXY_MODE');
    });
  });

  describe('POST /v1/subjects/:subjectId/topics/:topicId/notes', () => {
    it('returns 403 when in proxy mode (isOwner=false)', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeProxyApp(db);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Note content' }),
        },
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('PROXY_MODE');
    });

    it('returns 400 for missing content field', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeApp(db);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      expect(res.status).toBe(400);
    });

    it('[WI-1788] rejects client attempts to claim Challenge-Round provenance', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeApp(db);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: 'Fabricated content with no overlap to verified answers.',
            artifactSource: 'challenge_drafted_note',
          }),
        },
      );

      // Challenge provenance is server-owned. The strict request schema keeps
      // generic learner-authored notes from masquerading as verified proof.
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-UUID subjectId', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeApp(db);

      const res = await app.request(
        `/v1/subjects/not-a-uuid/topics/${TOPIC_ID}/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Note content' }),
        },
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-UUID topicId', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeApp(db);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/not-a-uuid/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Note content' }),
        },
      );
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /v1/notes/:noteId', () => {
    it('returns 403 when in proxy mode (isOwner=false)', async () => {
      const db = makeFakeDb({ noteExists: true });
      const app = makeProxyApp(db);

      const res = await app.request(`/v1/notes/${NOTE_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content' }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('PROXY_MODE');
    });

    it('returns 400 for missing content field', async () => {
      const db = makeFakeDb({ noteExists: true });
      const app = makeApp(db);

      const res = await app.request(`/v1/notes/${NOTE_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-UUID noteId', async () => {
      const db = makeFakeDb({ noteExists: true });
      const app = makeApp(db);

      const res = await app.request('/v1/notes/not-a-uuid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/notes/topic-ids', () => {
    it('returns 400 when no profileId is resolved', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeNoProfileApp(db);

      const res = await app.request('/v1/notes/topic-ids');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/notes/concept-mastery', () => {
    it('returns concept-mastery signals for requested topics', async () => {
      const db = makeFakeDb({ noteExists: false });
      db.selectRows = [[{ topicId: TOPIC_ID, status: 'solid' }], []];
      const app = makeApp(db);

      const res = await app.request(
        `/v1/notes/concept-mastery?topicIds=${TOPIC_ID}`,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        signals: {
          [TOPIC_ID]: {
            verified: true,
            hasMentorAddition: false,
            mentorAdditions: [],
          },
        },
      });
      expect(db.selectRows).toHaveLength(0);
    });

    it('returns an empty signal object for topics with no captured concepts', async () => {
      const db = makeFakeDb({ noteExists: false });
      db.selectRows = [[]];
      const app = makeApp(db);

      const res = await app.request(
        `/v1/notes/concept-mastery?topicIds=${TOPIC_ID}`,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ signals: {} });
    });

    it('rejects invalid topic IDs', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeApp(db);

      const res = await app.request(
        `/v1/notes/concept-mastery?topicIds=${TOPIC_ID},not-a-uuid`,
      );

      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/subjects/:subjectId/topics/:topicId/sessions', () => {
    it('returns 400 for non-UUID subjectId', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeApp(db);

      const res = await app.request(
        `/v1/subjects/not-a-uuid/topics/${TOPIC_ID}/sessions`,
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-UUID topicId', async () => {
      const db = makeFakeDb({ noteExists: false });
      const app = makeApp(db);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/not-a-uuid/sessions`,
      );
      expect(res.status).toBe(400);
    });
  });
});
