import type { AllNote, Bookmark } from '@eduagent/schemas';

import { normalizeSubjectHubNotes } from './use-subject-notes';

const UUID1 = '550e8400-e29b-41d4-a716-446655440000';
const UUID2 = '660e8400-e29b-41d4-a716-446655440001';
const UUID3 = '770e8400-e29b-41d4-a716-446655440002';
const UUID4 = '880e8400-e29b-41d4-a716-446655440003';
const UUID5 = '990e8400-e29b-41d4-a716-446655440004';

function note(overrides: Partial<AllNote> = {}): AllNote {
  return {
    id: UUID1,
    topicId: UUID2,
    topicTitle: 'Greetings',
    bookId: UUID3,
    bookTitle: 'Spanish 1',
    subjectId: UUID4,
    subjectName: 'Spanish',
    sessionId: null,
    content: 'My note',
    origin: 'self',
    artifactSource: 'learner_authored_note',
    verificationState: 'unverified',
    createdAt: '2026-06-10T10:00:00.000Z',
    updatedAt: '2026-06-11T10:00:00.000Z',
    ...overrides,
  };
}

function bookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: UUID5,
    eventId: UUID1,
    sessionId: UUID2,
    subjectId: UUID4,
    topicId: null,
    subjectName: 'Spanish',
    topicTitle: null,
    content: 'Saved mentor reply',
    artifactSource: 'freeform_keep',
    verificationState: 'unverified',
    createdAt: '2026-06-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeSubjectHubNotes', () => {
  it('normalizes learner notes and bookmarks into one explicit-origin list', () => {
    const result = normalizeSubjectHubNotes({
      notes: [note()],
      bookmarks: [bookmark()],
      labels: { self: 'My notes', mentor: 'Saved from mentor' },
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: UUID5,
        topicId: null,
        content: 'Saved mentor reply',
        origin: 'mentor',
        authorLabel: 'Saved from mentor',
        updatedAt: '2026-06-12T10:00:00.000Z',
        sessionId: UUID2,
      }),
      expect.objectContaining({
        id: UUID1,
        topicId: UUID2,
        content: 'My note',
        origin: 'self',
        authorLabel: 'My notes',
        updatedAt: '2026-06-11T10:00:00.000Z',
        sessionId: null,
      }),
    ]);
  });
});
