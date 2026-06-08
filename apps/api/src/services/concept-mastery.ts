import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import {
  conceptMastery,
  concepts,
  needsDeepeningTopics,
  type Database,
} from '@eduagent/database';

export interface ConceptMasterySignal {
  verified: boolean;
  hasTutorAddition: boolean;
  tutorAdditions: string[];
}

function emptySignal(): ConceptMasterySignal {
  return {
    verified: false,
    hasTutorAddition: false,
    tutorAdditions: [],
  };
}

export async function getConceptMasterySignalsForTopics(
  db: Database,
  profileId: string,
  topicIds: string[],
): Promise<Map<string, ConceptMasterySignal>> {
  const uniqueTopicIds = [...new Set(topicIds)];
  if (uniqueTopicIds.length === 0) return new Map();

  const masteryRows = await db
    .select({
      topicId: concepts.topicId,
      status: conceptMastery.status,
    })
    .from(concepts)
    .innerJoin(conceptMastery, eq(conceptMastery.conceptId, concepts.id))
    .where(
      and(
        eq(concepts.profileId, profileId),
        eq(conceptMastery.profileId, profileId),
        inArray(concepts.topicId, uniqueTopicIds),
        isNull(conceptMastery.supersededAt),
      ),
    );

  if (masteryRows.length === 0) return new Map();

  const signals = new Map<string, ConceptMasterySignal>();
  const conceptCounts = new Map<string, number>();
  const solidCounts = new Map<string, number>();

  for (const row of masteryRows) {
    const signal = signals.get(row.topicId) ?? emptySignal();
    signal.hasTutorAddition ||= row.status !== 'solid';
    signals.set(row.topicId, signal);
    conceptCounts.set(row.topicId, (conceptCounts.get(row.topicId) ?? 0) + 1);
    if (row.status === 'solid') {
      solidCounts.set(row.topicId, (solidCounts.get(row.topicId) ?? 0) + 1);
    }
  }

  for (const [topicId, signal] of signals) {
    const count = conceptCounts.get(topicId) ?? 0;
    signal.verified = count > 0 && (solidCounts.get(topicId) ?? 0) === count;
  }

  const correctionRows = await db
    .select({
      topicId: needsDeepeningTopics.topicId,
      correction: needsDeepeningTopics.correction,
    })
    .from(needsDeepeningTopics)
    .where(
      and(
        eq(needsDeepeningTopics.profileId, profileId),
        inArray(needsDeepeningTopics.topicId, [...signals.keys()]),
        inArray(needsDeepeningTopics.status, ['active', 'pending_review']),
        isNotNull(needsDeepeningTopics.correction),
      ),
    );

  for (const row of correctionRows) {
    if (!row.correction) continue;
    const signal = signals.get(row.topicId);
    if (!signal || signal.tutorAdditions.includes(row.correction)) continue;
    signal.tutorAdditions.push(row.correction);
  }

  return signals;
}
