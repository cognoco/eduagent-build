import {
  topicNoteSchema,
  createNoteInputSchema,
  updateNoteInputSchema,
  noteOriginSchema,
  noteResponseSchema,
  bookNotesResponseSchema,
  topicNotesResponseSchema,
  noteGetResponseSchema,
  noteMutationResponseSchema,
  topicIdsResponseSchema,
  allNotesQuerySchema,
  allNoteSchema,
  allNotesResponseSchema,
  topicSessionsResponseSchema,
  upsertNoteInputSchema,
} from './notes.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const UUID2 = '660e8400-e29b-41d4-a716-446655440001';
const ISO = '2025-01-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// topicNoteSchema
// ---------------------------------------------------------------------------

describe('topicNoteSchema', () => {
  const validNote = {
    id: UUID,
    topicId: UUID,
    profileId: UUID,
    sessionId: UUID,
    content: 'My note content',
    createdAt: ISO,
    updatedAt: ISO,
  };

  it('accepts a valid note with sessionId', () => {
    expect(topicNoteSchema.parse(validNote)).toEqual({
      ...validNote,
      origin: 'self',
    });
  });

  it('accepts null sessionId', () => {
    const parsed = topicNoteSchema.parse({ ...validNote, sessionId: null });
    expect(parsed.sessionId).toBeNull();
  });

  it('rejects missing content', () => {
    const { content: _content, ...rest } = validNote;
    const result = topicNoteSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('content');
    }
  });

  it('rejects invalid UUID for id', () => {
    const result = topicNoteSchema.safeParse({
      ...validNote,
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid datetime for createdAt', () => {
    const result = topicNoteSchema.safeParse({
      ...validNote,
      createdAt: '2025-13-99',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('createdAt');
    }
  });
});

// ---------------------------------------------------------------------------
// createNoteInputSchema
// ---------------------------------------------------------------------------

describe('createNoteInputSchema', () => {
  it('accepts content with optional sessionId', () => {
    const result = createNoteInputSchema.parse({
      content: 'Hello',
      sessionId: UUID,
    });
    expect(result.content).toBe('Hello');
  });

  it('accepts content without sessionId', () => {
    const result = createNoteInputSchema.parse({ content: 'Hello' });
    expect(result.sessionId).toBeUndefined();
  });

  it('rejects empty content', () => {
    const result = createNoteInputSchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 5000 chars', () => {
    const result = createNoteInputSchema.safeParse({
      content: 'x'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts content at max length (5000)', () => {
    const result = createNoteInputSchema.safeParse({
      content: 'x'.repeat(5000),
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateNoteInputSchema
// ---------------------------------------------------------------------------

describe('updateNoteInputSchema', () => {
  it('accepts valid content', () => {
    expect(updateNoteInputSchema.parse({ content: 'Updated' })).toEqual({
      content: 'Updated',
    });
  });

  it('rejects empty content', () => {
    expect(updateNoteInputSchema.safeParse({ content: '' }).success).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// noteResponseSchema
// ---------------------------------------------------------------------------

describe('noteResponseSchema', () => {
  const valid = {
    id: UUID,
    topicId: UUID,
    sessionId: null,
    content: 'Content',
    createdAt: ISO,
    updatedAt: ISO,
  };

  it('accepts valid note response', () => {
    expect(noteResponseSchema.parse(valid)).toEqual({
      ...valid,
      origin: 'self',
    });
  });

  it('accepts null sessionId', () => {
    expect(noteResponseSchema.parse(valid).sessionId).toBeNull();
  });

  it('accepts non-null sessionId', () => {
    const parsed = noteResponseSchema.parse({ ...valid, sessionId: UUID });
    expect(parsed.sessionId).toBe(UUID);
  });

  it('rejects invalid datetime for updatedAt', () => {
    const result = noteResponseSchema.safeParse({
      ...valid,
      updatedAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.path).toContain('updatedAt');
    }
  });

  it('defaults missing origin to self', () => {
    expect(noteResponseSchema.parse(valid).origin).toBe('self');
  });

  it('exports the additive note origin enum', () => {
    expect(noteOriginSchema.options).toEqual(['self', 'mentor']);
  });

  it('round-trips mentor origin when supplied', () => {
    expect(
      noteResponseSchema.parse({ ...valid, origin: 'mentor' }).origin,
    ).toBe('mentor');
  });
});

// ---------------------------------------------------------------------------
// bookNotesResponseSchema / topicNotesResponseSchema
// ---------------------------------------------------------------------------

const noteDbRow = {
  id: UUID,
  topicId: UUID,
  sessionId: null,
  content: 'Note',
  createdAt: ISO,
  updatedAt: ISO,
};

describe('bookNotesResponseSchema', () => {
  it('accepts empty notes array', () => {
    const parsed = bookNotesResponseSchema.parse({ notes: [] });
    expect(parsed.notes).toEqual([]);
  });

  it('accepts notes array with one item', () => {
    const parsed = bookNotesResponseSchema.parse({ notes: [noteDbRow] });
    expect(parsed.notes).toHaveLength(1);
  });

  it('accepts Date object for createdAt (Drizzle row compat)', () => {
    const row = { ...noteDbRow, createdAt: new Date('2025-01-01T00:00:00Z') };
    const parsed = bookNotesResponseSchema.parse({ notes: [row] });
    expect(typeof parsed.notes[0]!.createdAt).toBe('string');
  });
});

describe('topicNotesResponseSchema', () => {
  it('accepts empty notes array', () => {
    expect(topicNotesResponseSchema.parse({ notes: [] }).notes).toEqual([]);
  });

  it('accepts Date object for updatedAt (Drizzle row compat)', () => {
    const row = { ...noteDbRow, updatedAt: new Date('2025-06-01T12:00:00Z') };
    const parsed = topicNotesResponseSchema.parse({ notes: [row] });
    expect(typeof parsed.notes[0]!.updatedAt).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// noteGetResponseSchema
// ---------------------------------------------------------------------------

describe('noteGetResponseSchema', () => {
  it('accepts null note (no note for topic)', () => {
    const parsed = noteGetResponseSchema.parse({ note: null });
    expect(parsed.note).toBeNull();
  });

  it('accepts a valid note', () => {
    const row = {
      id: UUID,
      topicId: UUID,
      content: 'A note',
      updatedAt: ISO,
    };
    const parsed = noteGetResponseSchema.parse({ note: row });
    expect(parsed.note?.id).toBe(UUID);
  });

  it('rejects note with missing id', () => {
    const result = noteGetResponseSchema.safeParse({
      note: { topicId: UUID, content: 'x', updatedAt: ISO },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// noteMutationResponseSchema
// ---------------------------------------------------------------------------

describe('noteMutationResponseSchema', () => {
  it('accepts valid mutation response', () => {
    const parsed = noteMutationResponseSchema.parse({ note: noteDbRow });
    expect(parsed.note.id).toBe(UUID);
  });

  it('accepts Date object in mutation response (Drizzle row compat)', () => {
    const row = {
      ...noteDbRow,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-02'),
    };
    const parsed = noteMutationResponseSchema.parse({ note: row });
    expect(typeof parsed.note.createdAt).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// topicIdsResponseSchema
// ---------------------------------------------------------------------------

describe('topicIdsResponseSchema', () => {
  it('accepts empty topicIds array', () => {
    expect(topicIdsResponseSchema.parse({ topicIds: [] }).topicIds).toEqual([]);
  });

  it('accepts array of UUIDs', () => {
    const parsed = topicIdsResponseSchema.parse({ topicIds: [UUID, UUID2] });
    expect(parsed.topicIds).toHaveLength(2);
  });

  it('rejects non-UUID entry', () => {
    const result = topicIdsResponseSchema.safeParse({
      topicIds: ['not-a-uuid'],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// allNotesQuerySchema
// ---------------------------------------------------------------------------

describe('allNotesQuerySchema', () => {
  it('accepts empty query (all optional)', () => {
    const result = allNotesQuerySchema.parse({});
    expect(result.cursor).toBeUndefined();
    expect(result.limit).toBeUndefined();
  });

  it('accepts limit=1 (boundary)', () => {
    const result = allNotesQuerySchema.parse({ limit: 1 });
    expect(result.limit).toBe(1);
  });

  it('accepts limit=50 (boundary)', () => {
    const result = allNotesQuerySchema.parse({ limit: 50 });
    expect(result.limit).toBe(50);
  });

  it('rejects limit=0', () => {
    const result = allNotesQuerySchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects limit=51 (exceeds max)', () => {
    const result = allNotesQuerySchema.safeParse({ limit: 51 });
    expect(result.success).toBe(false);
  });

  it('coerces string limit to number', () => {
    const result = allNotesQuerySchema.parse({ limit: '10' });
    expect(result.limit).toBe(10);
  });

  it('accepts cursor as UUID', () => {
    const result = allNotesQuerySchema.parse({ cursor: UUID });
    expect(result.cursor).toBe(UUID);
  });

  it('rejects cursor that is not a UUID', () => {
    const result = allNotesQuerySchema.safeParse({ cursor: 'not-uuid' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// allNoteSchema
// ---------------------------------------------------------------------------

describe('allNoteSchema', () => {
  const validAllNote = {
    id: UUID,
    topicId: UUID,
    topicTitle: 'Topic',
    bookId: UUID,
    bookTitle: 'Book',
    subjectId: UUID,
    subjectName: 'Subject',
    sessionId: null,
    content: 'Content',
    createdAt: ISO,
    updatedAt: ISO,
  };

  it('accepts a valid all-note entry', () => {
    expect(allNoteSchema.parse(validAllNote)).toEqual({
      ...validAllNote,
      origin: 'self',
    });
  });

  it('accepts null sessionId', () => {
    expect(allNoteSchema.parse(validAllNote).sessionId).toBeNull();
  });

  it('accepts non-null sessionId', () => {
    const parsed = allNoteSchema.parse({ ...validAllNote, sessionId: UUID });
    expect(parsed.sessionId).toBe(UUID);
  });

  it('rejects missing subjectId', () => {
    const { subjectId: _, ...rest } = validAllNote;
    const result = allNoteSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.path).toContain('subjectId');
    }
  });

  it('rejects invalid datetime for createdAt', () => {
    const result = allNoteSchema.safeParse({
      ...validAllNote,
      createdAt: 'bad',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// allNotesResponseSchema — canonical archive-style endpoint
// ---------------------------------------------------------------------------

describe('allNotesResponseSchema', () => {
  const validAllNote = {
    id: UUID,
    topicId: UUID,
    topicTitle: 'Topic',
    bookId: UUID,
    bookTitle: 'Book',
    subjectId: UUID,
    subjectName: 'Subject',
    sessionId: null,
    content: 'Content',
    createdAt: ISO,
    updatedAt: ISO,
  };

  it('accepts a valid archive page with one note and nextCursor', () => {
    const parsed = allNotesResponseSchema.parse({
      notes: [validAllNote],
      nextCursor: UUID,
    });
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.nextCursor).toBe(UUID);
  });

  it('accepts empty page with null nextCursor', () => {
    const parsed = allNotesResponseSchema.parse({
      notes: [],
      nextCursor: null,
    });
    expect(parsed.notes).toEqual([]);
    expect(parsed.nextCursor).toBeNull();
  });

  it('rejects nextCursor that is not a UUID', () => {
    const result = allNotesResponseSchema.safeParse({
      notes: [],
      nextCursor: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.path).toContain('nextCursor');
    }
  });

  it('rejects missing nextCursor field', () => {
    const result = allNotesResponseSchema.safeParse({ notes: [] });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// topicSessionsResponseSchema
// ---------------------------------------------------------------------------

describe('topicSessionsResponseSchema', () => {
  it('accepts empty sessions array', () => {
    expect(
      topicSessionsResponseSchema.parse({ sessions: [] }).sessions,
    ).toEqual([]);
  });

  it('accepts valid session with nullable durationSeconds', () => {
    const parsed = topicSessionsResponseSchema.parse({
      sessions: [
        {
          id: UUID,
          sessionType: 'learning',
          durationSeconds: null,
          createdAt: ISO,
        },
      ],
    });
    expect(parsed.sessions[0]!.durationSeconds).toBeNull();
  });

  it('rejects invalid sessionType enum', () => {
    const result = topicSessionsResponseSchema.safeParse({
      sessions: [
        {
          id: UUID,
          sessionType: 'invalid_type',
          durationSeconds: null,
          createdAt: ISO,
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('sessionType'))).toBe(true);
    }
  });

  it('accepts all valid sessionType values', () => {
    for (const sessionType of [
      'learning',
      'homework',
      'interleaved',
    ] as const) {
      const result = topicSessionsResponseSchema.safeParse({
        sessions: [
          { id: UUID, sessionType, durationSeconds: 60, createdAt: ISO },
        ],
      });
      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// upsertNoteInputSchema (deprecated — backward compat mobile consumer)
// ---------------------------------------------------------------------------

describe('[BUG-212] topicNoteSchema and noteResponseSchema share a single base', () => {
  it('topicNoteSchema is noteResponseSchema + profileId — no other field drift', () => {
    const noteResponseKeys = Object.keys(noteResponseSchema.shape).sort();
    const topicNoteKeys = Object.keys(topicNoteSchema.shape).sort();
    const onlyInTopicNote = topicNoteKeys.filter(
      (k) => !noteResponseKeys.includes(k),
    );
    expect(onlyInTopicNote).toEqual(['profileId']);
    // Conversely, every noteResponse field must be present on topicNote.
    for (const k of noteResponseKeys) {
      expect(topicNoteKeys).toContain(k);
    }
  });

  // Regression guard (BUG-205 / BUG-212 / BUG-747): noteResponseSchema must
  // accept raw Date objects from neon-serverless Drizzle rows — same contract
  // as bookNotesResponseSchema / topicNotesResponseSchema (all use isoDateField).
  it('noteResponseSchema accepts Date objects (BUG-205 / BUG-212 unification)', () => {
    const parsed = noteResponseSchema.parse({
      id: UUID,
      topicId: UUID,
      sessionId: null,
      content: 'x',
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      updatedAt: new Date('2026-05-18T00:00:00.000Z'),
    });
    expect(typeof parsed.createdAt).toBe('string');
  });
});

describe('upsertNoteInputSchema (deprecated, backward compat)', () => {
  it('accepts content without append', () => {
    expect(upsertNoteInputSchema.parse({ content: 'Note' })).toMatchObject({
      content: 'Note',
    });
  });

  it('accepts content with append=true', () => {
    const parsed = upsertNoteInputSchema.parse({
      content: 'Note',
      append: true,
    });
    expect(parsed.append).toBe(true);
  });

  it('rejects empty content', () => {
    expect(upsertNoteInputSchema.safeParse({ content: '' }).success).toBe(
      false,
    );
  });
});
