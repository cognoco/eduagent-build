import { getTableConfig } from 'drizzle-orm/pg-core';

import {
  conceptMastery,
  conceptMasteryStatusEnum,
  concepts,
} from './concept-mastery.js';
import * as schema from './index.js';

describe('concept mastery schema', () => {
  it('exports concept identity, mastery state, and status enum through the barrel', () => {
    expect(schema).toHaveProperty('concepts');
    expect(schema).toHaveProperty('conceptMastery');
    expect(schema).toHaveProperty('conceptMasteryStatusEnum');
  });

  it('pins the additive concept-grain table constraints and indexes', () => {
    const conceptConfig = getTableConfig(concepts);
    const masteryConfig = getTableConfig(conceptMastery);

    expect(conceptMasteryStatusEnum.enumValues).toEqual([
      'solid',
      'partial',
      'missing',
      'misconception',
    ]);
    expect(conceptConfig.name).toBe('concepts');
    expect(masteryConfig.name).toBe('concept_mastery');
    expect(concepts).toHaveProperty('profileId');
    expect(concepts).toHaveProperty('subjectId');
    expect(concepts).toHaveProperty('topicId');
    expect(concepts).toHaveProperty('normalizedLabel');
    expect(conceptMastery).toHaveProperty('profileId');
    expect(conceptMastery).toHaveProperty('lastEvaluatedAt');
    expect(conceptMastery).toHaveProperty('supersededAt');

    expect(conceptConfig.uniqueConstraints.map((u) => u.name)).toContain(
      'concepts_profile_topic_label_unique',
    );
    expect(conceptConfig.indexes.map((i) => i.config.name)).toEqual(
      expect.arrayContaining([
        'concepts_profile_topic_idx',
        'concepts_profile_id_idx',
      ]),
    );
    expect(masteryConfig.uniqueConstraints.map((u) => u.name)).toContain(
      'concept_mastery_concept_unique',
    );
    expect(masteryConfig.indexes.map((i) => i.config.name)).toContain(
      'concept_mastery_profile_id_idx',
    );
  });
});
