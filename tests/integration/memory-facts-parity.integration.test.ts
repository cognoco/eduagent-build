import { eq } from 'drizzle-orm';
import {
  accounts,
  createScopedRepository,
  learningProfiles,
} from '@eduagent/database';

import {
  runBackfillForOneProfile,
  seedLearningProfile,
  setupTestDb,
} from './helpers/memory-facts';
import { readMemorySnapshotFromFacts } from '../../apps/api/src/services/memory/memory-facts';

const FIXTURES = [
  {
    strengths: [{ subject: 'Math', topics: ['fractions'], confidence: 'high' }],
    struggles: [],
    interests: [],
    communicationNotes: [],
    suppressedInferences: [],
  },
  {
    strengths: [
      {
        subject: 'Math',
        topics: ['fractions', 'decimals'],
        confidence: 'high',
      },
      {
        subject: 'English',
        topics: ['comprehension'],
        confidence: 'medium',
      },
    ],
    struggles: [
      {
        subject: 'Math',
        topic: 'long division',
        lastSeen: '2026-04-15T10:00:00.000Z',
        attempts: 3,
        confidence: 'medium',
      },
    ],
    interests: [
      { label: 'soccer', context: 'free_time' },
      { label: 'space', context: 'school' },
    ],
    communicationNotes: ['prefers analogies', 'short bursts'],
    suppressedInferences: ['ignored fact'],
  },
  {
    strengths: [],
    struggles: [],
    interests: [{ label: 'cats', context: 'free_time' }],
    communicationNotes: [],
    suppressedInferences: [],
  },
];

describe('memory_facts parity vs JSONB', () => {
  it.each(FIXTURES.map((fixture, index) => [index, fixture] as const))(
    'fixture %i reconstructs the JSONB memory snapshot',
    async (_index, fixture) => {
      const { db } = await setupTestDb();
      const { profileId, accountId } = await seedLearningProfile(db, fixture);
      try {
        await runBackfillForOneProfile(db, profileId);

        const profile = await db.query.learningProfiles.findFirst({
          where: eq(learningProfiles.profileId, profileId),
        });
        expect(profile).toBeDefined();

        const scoped = createScopedRepository(db, profileId);
        const fromFacts = await readMemorySnapshotFromFacts(scoped, profile!);

        expect(new Set(fromFacts.communicationNotes)).toEqual(
          new Set(profile!.communicationNotes as string[])
        );
        expect(new Set(fromFacts.suppressedInferences)).toEqual(
          new Set(profile!.suppressedInferences as string[])
        );
        expect(new Set(fromFacts.interests.map((i) => i.label))).toEqual(
          new Set(
            (profile!.interests as Array<{ label: string }>).map((i) => i.label)
          )
        );
        expect(new Set(fromFacts.strengths.flatMap((s) => s.topics))).toEqual(
          new Set(
            (profile!.strengths as Array<{ topics: string[] }>).flatMap(
              (s) => s.topics
            )
          )
        );
        expect(
          new Set(
            fromFacts.struggles.map((s) =>
              JSON.stringify({
                subject: s.subject,
                topic: s.topic,
                attempts: s.attempts,
              })
            )
          )
        ).toEqual(
          new Set(
            (
              profile!.struggles as Array<{
                subject: string | null;
                topic: string;
                attempts: number;
              }>
            ).map((s) =>
              JSON.stringify({
                subject: s.subject,
                topic: s.topic,
                attempts: s.attempts,
              })
            )
          )
        );
      } finally {
        await db.delete(accounts).where(eq(accounts.id, accountId));
      }
    }
  );
});
