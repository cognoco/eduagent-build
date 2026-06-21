import {
  coLearningPromptPayloadSchema,
  reportableFactKindSchema,
  reportableFactSchema,
  sharedRecordSchema,
  visibilityContractSchema,
} from './visibility-contract.js';

const UUID_1 = '00000000-0000-4000-8000-000000000001';
const UUID_2 = '00000000-0000-4000-8000-000000000002';
const UUID_3 = '00000000-0000-4000-8000-000000000003';
const NOW = '2026-06-20T12:00:00.000Z';

describe('visibility contract schemas', () => {
  it('defines the reportable allow-list without affect', () => {
    expect(reportableFactKindSchema.options).toEqual([
      'mastery',
      'effort',
      'observable_engagement',
    ]);
    expect(() => reportableFactKindSchema.parse('confided_affect')).toThrow();
  });

  it('requires artifact wall, render equivalence, and safety exception', () => {
    expect(
      visibilityContractSchema.parse({
        id: UUID_1,
        supportershipId: UUID_2,
        supporterPersonId: UUID_1,
        supporteePersonId: UUID_3,
        relation: 'teacher',
        status: 'pending',
        contractVersion: 1,
        reportableKinds: ['mastery'],
        artifactWall: true,
        renderEquivalence: true,
        safetyException: true,
        supporterAcceptedAt: null,
        supporteeAcceptedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      }).artifactWall,
    ).toBe(true);

    expect(() =>
      visibilityContractSchema.parse({
        id: UUID_1,
        supportershipId: UUID_2,
        supporterPersonId: UUID_1,
        supporteePersonId: UUID_3,
        relation: 'teacher',
        status: 'pending',
        contractVersion: 1,
        reportableKinds: ['mastery'],
        artifactWall: false,
        renderEquivalence: true,
        safetyException: true,
        supporterAcceptedAt: null,
        supporteeAcceptedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ).toThrow();
  });

  it('keeps shared-record fact ids equivalent across both views', () => {
    const fact = reportableFactSchema.parse({
      id: 'fact-1',
      kind: 'effort',
      title: 'Practiced fractions',
      source: 'session',
    });

    expect(
      sharedRecordSchema.parse({
        supportershipId: UUID_1,
        generatedAt: NOW,
        factIds: ['fact-1'],
        supporterView: {
          audience: 'supporter',
          factIds: ['fact-1'],
          headline: 'Emma kept practicing.',
          facts: [fact],
        },
        supporteeView: {
          audience: 'supportee',
          factIds: ['fact-1'],
          headline: 'You kept practicing.',
          facts: [fact],
        },
      }).factIds,
    ).toEqual(['fact-1']);
  });

  it('pins co-learning prompts to fill-only, dismissible, no-read-receipt payloads', () => {
    expect(
      coLearningPromptPayloadSchema.parse({
        supportershipId: UUID_1,
        supporterPersonId: UUID_2,
        supporteePersonId: UUID_3,
        suggestedText: 'Zuzana learned this too. Want to explain it back?',
        dismissible: true,
        fillOnly: true,
        readReceipt: false,
      }).readReceipt,
    ).toBe(false);
  });
});
