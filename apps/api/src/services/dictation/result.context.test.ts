import type { Database } from '@eduagent/database';
import { fetchGenerateContext } from './result';

// ---------------------------------------------------------------------------
// fetchGenerateContext personalization regression
//
// The dictation generate prompt (buildGeneratePrompt -> buildInterestThemeBlock
// in ./generate.ts) themes the passage around the learner's `interests` and
// currently-studied `libraryTopics`. Those fields live on GenerateContext, but
// historically `fetchGenerateContext` only returned { nativeLanguage, ageYears }
// and never fetched interests/libraryTopics — so the personalization block was
// ALWAYS empty and the feature was dead.
//
// This exercises the REAL fetchGenerateContext against a hand-built fake
// Database at the boundary (no internal jest.mock) and asserts the returned
// context actually CONTAINS the learner's interests + library topics, mirroring
// the canonical sources used by the quiz feature:
//   - interests:     getLearningProfile(db, profileId).interests (string[])
//   - libraryTopics: curriculum_topics.title joined to subjects via the
//                    parent chain, scoped on subjects.profileId.
// ---------------------------------------------------------------------------

const PROFILE_ID = 'profile-dictation-ctx';
const BIRTH_YEAR = 2014;

/**
 * Build a fake Database that returns the supplied personalization rows.
 * - db.query.teachingPreferences.findFirst -> native language ('de').
 * - db.query.learningProfiles.findFirst    -> interests string[].
 * - db.select()...limit()                  -> library-topic title rows.
 */
function buildFakeDb(opts: {
  interests: string[];
  libraryTopicTitles: string[];
}): Database {
  const libraryRows = opts.libraryTopicTitles.map((title) => ({ title }));

  // db.select(...).from(...).innerJoin(...).innerJoin(...).where(...)
  //   .orderBy(...).limit(...) resolves to the topic-title rows.
  const limit = jest.fn().mockResolvedValue(libraryRows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ orderBy });
  const innerJoin2 = jest.fn().mockReturnValue({ where });
  const innerJoin1 = jest.fn().mockReturnValue({ innerJoin: innerJoin2 });
  const from = jest.fn().mockReturnValue({ innerJoin: innerJoin1 });
  const select = jest.fn().mockReturnValue({ from });

  return {
    select,
    query: {
      teachingPreferences: {
        findFirst: jest.fn().mockResolvedValue({ nativeLanguage: 'de' }),
      },
      learningProfiles: {
        findFirst: jest.fn().mockResolvedValue({ interests: opts.interests }),
      },
    },
  } as unknown as Database;
}

describe('fetchGenerateContext personalization (interests + libraryTopics)', () => {
  it('threads the learner interests and library topics into the generate context', async () => {
    const db = buildFakeDb({
      interests: ['dinosaurs', 'space travel'],
      libraryTopicTitles: ['The Mesozoic era', 'Volcanoes'],
    });

    const ctx = await fetchGenerateContext(db, PROFILE_ID, BIRTH_YEAR);

    // Baseline fields still present.
    expect(ctx.nativeLanguage).toBe('de');
    expect(ctx.ageYears).toBe(new Date().getFullYear() - BIRTH_YEAR);

    // RED before fix: interests are dropped entirely.
    expect(ctx.interests).toBeDefined();
    expect(ctx.interests).toEqual([
      { label: 'dinosaurs', context: 'free_time' },
      { label: 'space travel', context: 'free_time' },
    ]);

    // RED before fix: libraryTopics are dropped entirely.
    expect(ctx.libraryTopics).toEqual(['The Mesozoic era', 'Volcanoes']);
  });
});
