// ---------------------------------------------------------------------------
// bookmarks.ts unit tests — projection guard for legacy ai_response rows
// ---------------------------------------------------------------------------
// NOTE: createBookmark is an async DB operation and requires a real or
// fully-mocked Drizzle client. The break test below validates the projection
// logic by mocking @eduagent/database to return a fixture event row whose
// content is raw envelope JSON, and asserting the value written to the
// bookmarks table is projected to plain reply text.
// ---------------------------------------------------------------------------

jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  return {
    ...actual,
    // We override the database exports used at import time; the test supplies
    // a fake db instance directly, so the table references just need to exist.
  };
});

import { createBookmark } from './bookmarks';

// Build a minimal Drizzle-shaped db stub. Only the call paths exercised by
// createBookmark need to be present: a select chain (for the event lookup)
// and an insert chain with .returning() (for the bookmark insert).
function makeDbStub(options: {
  eventContent: string;
  capturedInsertValues: { content?: string }[];
}): unknown {
  const { capturedInsertValues } = options;

  const selectResult = {
    id: 'event-id-1',
    sessionId: 'session-id-1',
    subjectId: 'subject-id-1',
    topicId: null,
    content: options.eventContent,
    subjectName: 'Science',
    topicTitle: null,
  };

  // Simulate the returning bookmark row
  const bookmarkRow = {
    id: 'bookmark-id-1',
    eventId: 'event-id-1',
    sessionId: 'session-id-1',
    subjectId: 'subject-id-1',
    topicId: null,
    content: '', // will be set by the capture below
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: async () => [selectResult],
            }),
          }),
        }),
      }),
    }),
    insert: () => ({
      values: (vals: { content?: string }) => {
        // Capture whatever content was passed to the insert
        capturedInsertValues.push({ content: vals.content });
        bookmarkRow.content = vals.content ?? '';
        return {
          returning: async () => [bookmarkRow],
        };
      },
    }),
  };
}

describe('createBookmark — [BUG-934] legacy raw-envelope projection', () => {
  it('projects raw envelope JSON content to plain reply before persisting', async () => {
    const rawEnvelope = JSON.stringify({
      reply: 'Photosynthesis converts light into energy.',
      signals: {
        partial_progress: false,
        needs_deepening: false,
        understanding_check: false,
      },
      ui_hints: { note_prompt: { show: false, post_session: false } },
    });

    const capturedInsertValues: { content?: string }[] = [];
    const db = makeDbStub({ eventContent: rawEnvelope, capturedInsertValues });

    const bookmark = await createBookmark(
      db as Parameters<typeof createBookmark>[0],
      'profile-id-1',
      'event-id-1'
    );

    // The returned bookmark content must be plain reply text, not raw JSON.
    expect(bookmark.content).toBe('Photosynthesis converts light into energy.');
    expect(bookmark.content).not.toContain('"signals"');
    expect(bookmark.content).not.toContain('"ui_hints"');

    // The value written to the DB must also be projected.
    expect(capturedInsertValues[0]?.content).toBe(
      'Photosynthesis converts light into energy.'
    );
  });

  it('passes through plain prose content unchanged', async () => {
    const plainContent = 'Mitosis divides one cell into two identical cells.';
    const capturedInsertValues: { content?: string }[] = [];
    const db = makeDbStub({ eventContent: plainContent, capturedInsertValues });

    const bookmark = await createBookmark(
      db as Parameters<typeof createBookmark>[0],
      'profile-id-1',
      'event-id-1'
    );

    expect(bookmark.content).toBe(plainContent);
    expect(capturedInsertValues[0]?.content).toBe(plainContent);
  });
});
