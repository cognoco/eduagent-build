import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  subjects,
  topicNotes,
  type Database,
} from '@eduagent/database';
import {
  createNote,
  createNoteForSession,
  deleteNoteById,
  getNote,
  getNotesForBook,
  getNotesForTopic,
  getTopicIdsWithNotes,
  listAllNotes,
  updateNote,
} from './notes';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();
let db: Database;
let counter = 0;

// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded v2 ids for
// cleanup (shared across every describeIfDb block in this file).
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedProfile(): Promise<{ profileId: string }> {
  const idx = ++counter;
  const clerkUserId = `clerk_allnotes_${RUN_ID}_${idx}`;
  const email = `allnotes-${RUN_ID}-${idx}@test.invalid`;
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    displayName: 'Notes Learner',
    birthYear: 2012,
    clerkUserId,
    email,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);
  return { profileId };
}

async function cleanupSeededProfiles(): Promise<void> {
  await deleteV2IdentitiesForTest(db, {
    accountIds: seededAccountIds,
    profileIds: seededProfileIds,
  });
}

async function seedTopic(
  profileId: string,
  subjectName: string,
  topicTitle: string,
): Promise<{ subjectId: string; topicId: string }> {
  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: subjectName })
    .returning({ id: subjects.id });
  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id })
    .returning({ id: curricula.id });
  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `${subjectName} Book`,
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });
  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: topicTitle,
      description: `${topicTitle} description`,
      sortOrder: 0,
      estimatedMinutes: 10,
    })
    .returning({ id: curriculumTopics.id });

  return { subjectId: subject!.id, topicId: topic!.id };
}

async function seedSession(
  profileId: string,
  subjectId: string,
  topicId: string,
): Promise<string> {
  const [session] = await db
    .insert(learningSessions)
    .values({ profileId, subjectId, topicId })
    .returning({ id: learningSessions.id });

  return session!.id;
}

describeIfDb('listAllNotes (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await cleanupSeededProfiles();
  });

  it('is profile-scoped and includes topic context', async () => {
    const owner = await seedProfile();
    const other = await seedProfile();
    const ownerTopic = await seedTopic(
      owner.profileId,
      'Chemistry',
      'Atomic Structure',
    );
    const otherTopic = await seedTopic(
      other.profileId,
      'Biology',
      'Cell Structure',
    );
    await db.insert(topicNotes).values([
      {
        profileId: owner.profileId,
        topicId: ownerTopic.topicId,
        content: 'Atoms are mostly empty space.',
      },
      {
        profileId: other.profileId,
        topicId: otherTopic.topicId,
        content: 'Cells have membranes.',
      },
    ]);

    const result = await listAllNotes(db, owner.profileId);

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({
      subjectName: 'Chemistry',
      topicTitle: 'Atomic Structure',
      content: 'Atoms are mostly empty space.',
    });
    expect(result.notes[0]!.content).not.toContain('Cells');
  });

  it('supports subject filtering and cursor pagination', async () => {
    const { profileId } = await seedProfile();
    const chemistry = await seedTopic(profileId, 'Chemistry', 'Bonds');
    const history = await seedTopic(profileId, 'History', 'Ancient Rome');
    await db.insert(topicNotes).values([
      {
        profileId,
        topicId: history.topicId,
        content: 'Rome note should be filtered out.',
      },
      {
        profileId,
        topicId: chemistry.topicId,
        content: 'First chemistry note.',
      },
      {
        profileId,
        topicId: chemistry.topicId,
        content: 'Second chemistry note.',
      },
    ]);

    const page1 = await listAllNotes(db, profileId, {
      subjectId: chemistry.subjectId,
      limit: 1,
    });
    expect(page1.notes).toHaveLength(1);
    expect(page1.notes[0]!.subjectName).toBe('Chemistry');
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listAllNotes(db, profileId, {
      subjectId: chemistry.subjectId,
      limit: 1,
      cursor: page1.nextCursor!,
    });
    expect(page2.notes).toHaveLength(1);
    expect(page2.notes[0]!.subjectName).toBe('Chemistry');
    expect(page2.notes[0]!.id).not.toBe(page1.notes[0]!.id);
    expect(page2.nextCursor).toBeNull();
  });

  it('lists multiple manually written chat notes from the same session', async () => {
    const { profileId } = await seedProfile();
    const { subjectId, topicId } = await seedTopic(
      profileId,
      'Chemistry',
      'Reaction Rates',
    );
    const sessionId = await seedSession(profileId, subjectId, topicId);

    await createNote(
      db,
      profileId,
      subjectId,
      topicId,
      'First chat note from today.',
      sessionId,
    );
    await createNote(
      db,
      profileId,
      subjectId,
      topicId,
      'Second chat note from today.',
      sessionId,
    );

    const result = await listAllNotes(db, profileId);

    expect(result.notes.map((note) => note.content)).toEqual(
      expect.arrayContaining([
        'First chat note from today.',
        'Second chat note from today.',
      ]),
    );
    expect(result.notes).toHaveLength(2);
  });

  it('dedupes exact auto-summary retries without hiding different session notes', async () => {
    const { profileId } = await seedProfile();
    const { subjectId, topicId } = await seedTopic(
      profileId,
      'History',
      'The Silk Road',
    );
    const sessionId = await seedSession(profileId, subjectId, topicId);

    const first = await createNoteForSession(db, {
      profileId,
      topicId,
      sessionId,
      content: 'Auto summary reflection.',
    });
    const retry = await createNoteForSession(db, {
      profileId,
      topicId,
      sessionId,
      content: 'Auto summary reflection.',
    });
    await createNoteForSession(db, {
      profileId,
      topicId,
      sessionId,
      content: 'A different note from the same session.',
    });

    const result = await listAllNotes(db, profileId);

    expect(retry.id).toBe(first.id);
    expect(result.notes.map((note) => note.content)).toEqual(
      expect.arrayContaining([
        'Auto summary reflection.',
        'A different note from the same session.',
      ]),
    );
    expect(result.notes).toHaveLength(2);
  });

  it('[WI-1195] rejects clinical characterisations at every topic-note write boundary', async () => {
    const { profileId } = await seedProfile();
    const { subjectId, topicId } = await seedTopic(
      profileId,
      'Math',
      'Fractions',
    );
    const sessionId = await seedSession(profileId, subjectId, topicId);

    await expect(
      createNote(
        db,
        profileId,
        subjectId,
        topicId,
        'The learner likely has ADHD.',
      ),
    ).rejects.toThrow(/health or disability characterisation/i);

    await expect(
      createNoteForSession(db, {
        profileId,
        topicId,
        sessionId,
        content: 'The child appears to have autism.',
      }),
    ).rejects.toThrow(/health or disability characterisation/i);

    const safeNote = await createNote(
      db,
      profileId,
      subjectId,
      topicId,
      'The learner confuses numerator and denominator.',
    );
    await expect(
      updateNote(
        db,
        profileId,
        safeNote.id,
        'The student may have dyscalculia.',
      ),
    ).rejects.toThrow(/health or disability characterisation/i);
  });
});

// ---------------------------------------------------------------------------
// [WI-1658] createNoteForSession — artifactSource marker
// ---------------------------------------------------------------------------

describeIfDb(
  'createNoteForSession — artifactSource marker (integration)',
  () => {
    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterAll(async () => {
      await cleanupSeededProfiles();
    });

    it('persists artifactSource when provided', async () => {
      const { profileId } = await seedProfile();
      const { subjectId, topicId } = await seedTopic(
        profileId,
        'Physics',
        'Newton’s Laws',
      );
      const sessionId = await seedSession(profileId, subjectId, topicId);

      await createNoteForSession(db, {
        profileId,
        topicId,
        sessionId,
        content: 'Verified concept quote.',
        artifactSource: 'challenge_drafted_note',
      });

      const [row] = await db
        .select({ artifactSource: topicNotes.artifactSource })
        .from(topicNotes)
        .where(eq(topicNotes.profileId, profileId));

      expect(row?.artifactSource).toBe('challenge_drafted_note');
    });

    it('writes learner-authored metadata when omitted', async () => {
      const { profileId } = await seedProfile();
      const { subjectId, topicId } = await seedTopic(
        profileId,
        'Physics',
        'Kinematics',
      );
      const sessionId = await seedSession(profileId, subjectId, topicId);

      await createNoteForSession(db, {
        profileId,
        topicId,
        sessionId,
        content: 'Ordinary session-summary note.',
      });

      const [row] = await db
        .select({ artifactSource: topicNotes.artifactSource })
        .from(topicNotes)
        .where(eq(topicNotes.profileId, profileId));

      expect(row?.artifactSource).toBe('learner_authored_note');
    });

    it('regression: a marker on an otherwise-identical-content call is not swallowed by dedup', async () => {
      // insertNoteWithCap's dedupeExactSessionContent match keys on
      // (profileId, sessionId, topicId, content, artifactSource). Seed an
      // ordinary learner-authored note first, then call createNoteForSession with the
      // SAME tuple but a marker set (e.g. a same-turn Challenge-Round
      // finalize) — the marked write must not be silently dropped by the dedup
      // hit on the earlier ordinary row.
      const { profileId } = await seedProfile();
      const { subjectId, topicId } = await seedTopic(
        profileId,
        'Physics',
        'Thermodynamics',
      );
      const sessionId = await seedSession(profileId, subjectId, topicId);
      const content = 'Identical content from two callers.';

      await createNoteForSession(db, {
        profileId,
        topicId,
        sessionId,
        content,
      });
      await createNoteForSession(db, {
        profileId,
        topicId,
        sessionId,
        content,
        artifactSource: 'challenge_drafted_note',
      });

      const rows = await db
        .select({ artifactSource: topicNotes.artifactSource })
        .from(topicNotes)
        .where(eq(topicNotes.profileId, profileId));

      expect(
        rows.some((r) => r.artifactSource === 'challenge_drafted_note'),
      ).toBe(true);
      // Prove both rows genuinely coexist — the dedup fix must not have
      // instead started duplicating writes it used to correctly collapse.
      expect(rows).toHaveLength(2);
    });
  },
);

// ---------------------------------------------------------------------------
// Cross-topic archive order — notes are globally ordered, not per-topic
// ---------------------------------------------------------------------------

describeIfDb('listAllNotes — cross-topic archive order (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await cleanupSeededProfiles();
  });

  it('orders notes globally by descending id, not per-topic', async () => {
    const { profileId } = await seedProfile();
    const topicA = await seedTopic(profileId, 'Physics', 'Gravity');
    const topicB = await seedTopic(profileId, 'Chemistry', 'Acids');

    // Insert into topicA first, then topicB — UUIDv7 ensures topicB notes
    // have higher ids and therefore appear first when sorted desc.
    await createNote(
      db,
      profileId,
      topicA.subjectId,
      topicA.topicId,
      'Physics note — created first',
    );
    await createNote(
      db,
      profileId,
      topicB.subjectId,
      topicB.topicId,
      'Chemistry note — created second',
    );

    const result = await listAllNotes(db, profileId);
    expect(result.notes).toHaveLength(2);
    // Newest first (global order), not grouped per topic
    expect(result.notes[0]!.subjectName).toBe('Chemistry');
    expect(result.notes[1]!.subjectName).toBe('Physics');
  });
});

// ---------------------------------------------------------------------------
// Orphaned session references — handler must not crash on null sessionId rows
// ---------------------------------------------------------------------------

describeIfDb('listAllNotes — orphaned session references (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await cleanupSeededProfiles();
  });

  it('returns notes with null sessionId without crashing', async () => {
    const { profileId } = await seedProfile();
    const { topicId } = await seedTopic(profileId, 'Biology', 'Cell Division');

    // Insert a note with no sessionId directly (bypasses session validation).
    await db.insert(topicNotes).values({
      profileId,
      topicId,
      sessionId: null,
      content: 'No session attached.',
    });

    const result = await listAllNotes(db, profileId);
    const note = result.notes.find((n) => n.content === 'No session attached.');
    expect(note).toBeDefined();
    expect(note!.sessionId).toBeNull();
  });

  it('getTopicIdsWithNotes returns topicId even when sessionId is null', async () => {
    const { profileId } = await seedProfile();
    const { topicId } = await seedTopic(profileId, 'History', 'Ancient Egypt');

    await db.insert(topicNotes).values({
      profileId,
      topicId,
      sessionId: null,
      content: 'Session-less note.',
    });

    const ids = await getTopicIdsWithNotes(db, profileId);
    expect(ids).toContain(topicId);
  });
});

// ---------------------------------------------------------------------------
// Pagination stability — cursors must not skip or duplicate items
// ---------------------------------------------------------------------------

describeIfDb('listAllNotes — pagination stability (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await cleanupSeededProfiles();
  });

  it('cursor pagination yields no duplicates and no skips across all pages', async () => {
    const { profileId } = await seedProfile();
    const { topicId } = await seedTopic(profileId, 'Mathematics', 'Algebra');

    const TOTAL = 7;
    for (let i = 0; i < TOTAL; i++) {
      await db.insert(topicNotes).values({
        profileId,
        topicId,
        content: `Note ${i}`,
      });
    }

    const collected: string[] = [];
    let cursor: string | null = null;

    do {
      const page = await listAllNotes(db, profileId, {
        limit: 3,
        cursor: cursor ?? undefined,
      });
      for (const note of page.notes) {
        expect(collected).not.toContain(note.id); // no duplicates
        collected.push(note.id);
      }
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(collected).toHaveLength(TOTAL);
  });

  it('stale cursor from a deleted item does not crash — returns remaining items', async () => {
    const { profileId } = await seedProfile();
    const { subjectId, topicId } = await seedTopic(
      profileId,
      'Geography',
      'Continents',
    );

    // Create 3 notes; UUIDv7 ensures the last insert has highest id.
    await createNote(db, profileId, subjectId, topicId, 'Continent 1');
    await createNote(db, profileId, subjectId, topicId, 'Continent 2');
    await createNote(db, profileId, subjectId, topicId, 'Continent 3');

    // Get first page (newest note).
    const page1 = await listAllNotes(db, profileId, { limit: 1 });
    expect(page1.nextCursor).not.toBeNull();

    // Delete the note at the cursor boundary between pages.
    await deleteNoteById(db, profileId, page1.notes[0]!.id);

    // Using the saved cursor after the deletion must not throw.
    const page2 = await listAllNotes(db, profileId, {
      limit: 2,
      cursor: page1.nextCursor!,
    });
    // We still get the remaining items older than the deleted cursor note.
    expect(Array.isArray(page2.notes)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Profile isolation — all CRUD functions enforce profileId
// ---------------------------------------------------------------------------

describeIfDb('notes profile isolation (integration)', () => {
  let ownerProfileId: string;
  let otherProfileId: string;

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
    const owner = await seedProfile();
    const other = await seedProfile();
    ownerProfileId = owner.profileId;
    otherProfileId = other.profileId;
  });

  afterAll(async () => {
    await cleanupSeededProfiles();
  });

  it('getNote — rejects cross-profile access (NotFoundError)', async () => {
    const { subjectId, topicId } = await seedTopic(
      ownerProfileId,
      'Art',
      'Impressionism',
    );
    // verifyTopicOwnership checks subjects.profileId — other profile must be rejected.
    await expect(
      getNote(db, otherProfileId, subjectId, topicId),
    ).rejects.toThrow('Topic not found');
  });

  it('getNotesForBook — rejects cross-profile subject access', async () => {
    const { subjectId, topicId } = await seedTopic(
      ownerProfileId,
      'Chemistry P2',
      'Organic',
    );
    // Scoped repo will not find subject for otherProfile.
    await expect(
      getNotesForBook(db, otherProfileId, subjectId, topicId),
    ).rejects.toThrow('Subject not found');
  });

  it('getNotesForTopic — rejects cross-profile topic access', async () => {
    const { subjectId, topicId } = await seedTopic(
      ownerProfileId,
      'Physics P2',
      'Optics',
    );
    await expect(
      getNotesForTopic(db, otherProfileId, subjectId, topicId),
    ).rejects.toThrow('Topic not found');
  });

  it('updateNote — rejects cross-profile update with NotFoundError', async () => {
    const { subjectId, topicId } = await seedTopic(
      ownerProfileId,
      'History P2',
      'French Revolution',
    );
    const note = await createNote(
      db,
      ownerProfileId,
      subjectId,
      topicId,
      'Original content',
    );

    // BUG-CANDIDATE-CRITICAL: if updateNote omits profileId scope, any profile
    // could overwrite this note. Break test: must throw.
    await expect(
      updateNote(db, otherProfileId, note.id, 'Hijacked content'),
    ).rejects.toThrow('Note not found');
  });

  it('deleteNoteById — cross-profile delete returns false (note survives)', async () => {
    const { subjectId, topicId } = await seedTopic(
      ownerProfileId,
      'Music',
      'Harmony',
    );
    const note = await createNote(
      db,
      ownerProfileId,
      subjectId,
      topicId,
      'Original note',
    );

    // BUG-CANDIDATE-CRITICAL: if deleteNoteById omits profileId scope, any
    // profile could delete notes they do not own.
    const deleted = await deleteNoteById(db, otherProfileId, note.id);
    expect(deleted).toBe(false);

    // The note must still exist for the owner.
    const ownerNote = await getNote(db, ownerProfileId, subjectId, topicId);
    expect(ownerNote).not.toBeNull();
  });

  it('createNote — cannot create note on another profile topic', async () => {
    const { subjectId, topicId } = await seedTopic(
      ownerProfileId,
      'Literature',
      'Romanticism',
    );

    // verifyTopicOwnership must reject this: otherProfile does not own this subject.
    await expect(
      createNote(db, otherProfileId, subjectId, topicId, 'Injected note'),
    ).rejects.toThrow('Topic not found');
  });

  it('listAllNotes — never leaks notes from another profile', async () => {
    const { topicId: ownerTopicId } = await seedTopic(
      ownerProfileId,
      'Biology P3',
      'Genetics',
    );
    const { topicId: otherTopicId } = await seedTopic(
      otherProfileId,
      'Physics P3',
      'Thermodynamics',
    );

    await db.insert(topicNotes).values([
      {
        profileId: ownerProfileId,
        topicId: ownerTopicId,
        content: 'Owner note — must be private',
      },
      {
        profileId: otherProfileId,
        topicId: otherTopicId,
        content: 'Other profile note — must be private',
      },
    ]);

    const ownerResult = await listAllNotes(db, ownerProfileId);
    const otherResult = await listAllNotes(db, otherProfileId);

    const ownerContents = ownerResult.notes.map((n) => n.content);
    const otherContents = otherResult.notes.map((n) => n.content);

    expect(ownerContents).toContain('Owner note — must be private');
    expect(ownerContents).not.toContain('Other profile note — must be private');
    expect(otherContents).toContain('Other profile note — must be private');
    expect(otherContents).not.toContain('Owner note — must be private');
  });
});
