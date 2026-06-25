import {
  coLearningPromptPayloadSchema,
  reportableFactKindSchema,
  reportableFactSchema,
  sharedRecordSchema,
  visibilityContractSchema,
  visibilityMomentPayloadSchema,
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

  describe('[WI-992] visibilityMomentPayloadSchema — typed per-notice payloads', () => {
    const UUID_A = '00000000-0000-4000-8000-000000000001';
    const UUID_B = '00000000-0000-4000-8000-000000000002';
    const NOW = '2026-06-20T12:00:00.000Z';

    // The PASS cases feed the EXACT object each sole producer constructs, copied
    // field-for-field from the source so the schema can never drift from reality.

    it('accepts the support_link_ended payload exactly as the producer builds it', () => {
      // Mirrors apps/api/src/inngest/functions/supportership-revocation.ts:29-33:
      //   { supporteePersonId: parsed.supporteePersonId, revokedAt: parsed.revokedAt,
      //     graceDays: SUPPORTERSHIP_GRACE_DAYS }   (SUPPORTERSHIP_GRACE_DAYS = 7)
      expect(
        visibilityMomentPayloadSchema.safeParse({
          supporteePersonId: UUID_A,
          revokedAt: NOW,
          graceDays: 7,
        }).success,
      ).toBe(true);
    });

    it('rejects the invented support_link_ended shape (graceEndsAt instead of graceDays)', () => {
      // Regression guard for the original bug: the schema was modeled with an
      // invented `graceEndsAt: isoDateField` and NO `graceDays`. The real producer
      // never emits graceEndsAt — a payload of that old shape must be rejected, or
      // the schema would silently strip graceDays and demand a field that never exists.
      expect(
        visibilityMomentPayloadSchema.safeParse({
          supporteePersonId: UUID_A,
          revokedAt: NOW,
          graceEndsAt: NOW,
        }).success,
      ).toBe(false);
    });

    it('rejects support_link_ended payload when supporteePersonId is not a UUID', () => {
      expect(
        visibilityMomentPayloadSchema.safeParse({
          supporteePersonId: 'not-a-uuid',
          revokedAt: NOW,
          graceDays: 7,
        }).success,
      ).toBe(false);
    });

    it('rejects support_link_ended payload when graceDays is not an integer', () => {
      expect(
        visibilityMomentPayloadSchema.safeParse({
          supporteePersonId: UUID_A,
          revokedAt: NOW,
          graceDays: 7.5,
        }).success,
      ).toBe(false);
    });

    it('accepts the graduation_contract_restamped payload exactly as the producer builds it', () => {
      // Mirrors apps/api/src/services/graduation-narration.ts:60-64:
      //   { supporterPersonId: row.edge.supporterPersonId, occurredAt: occurredAt.toISOString(),
      //     contractVersion: row.contract.contractVersion + 1 }
      expect(
        visibilityMomentPayloadSchema.safeParse({
          supporterPersonId: UUID_B,
          occurredAt: NOW,
          contractVersion: 2,
        }).success,
      ).toBe(true);
    });

    it('rejects graduation_contract_restamped payload when supporterPersonId is not a UUID', () => {
      expect(
        visibilityMomentPayloadSchema.safeParse({
          supporterPersonId: 'not-a-uuid',
          occurredAt: NOW,
          contractVersion: 2,
        }).success,
      ).toBe(false);
    });
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
