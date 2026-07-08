import { getTableConfig } from 'drizzle-orm/pg-core';

import {
  supportVisibilityAuditEvents,
  supportVisibilityContracts,
  supportVisibilityNotices,
  supportership,
} from './index.js';

describe('visibility contract schema', () => {
  it('exports separate S5 contract, audit, and notice tables', () => {
    expect(supportVisibilityContracts).toBeDefined();
    expect(supportVisibilityAuditEvents).toBeDefined();
    expect(supportVisibilityNotices).toBeDefined();
  });

  it('defines supportership-keyed contract storage with trust invariant columns', () => {
    expect(supportVisibilityContracts.id).toBeDefined();
    expect(supportVisibilityContracts.supportershipId).toBeDefined();
    expect(supportVisibilityContracts.supporterPersonId).toBeDefined();
    expect(supportVisibilityContracts.supporteePersonId).toBeDefined();
    expect(supportVisibilityContracts.relation).toBeDefined();
    expect(supportVisibilityContracts.status).toBeDefined();
    expect(supportVisibilityContracts.contractVersion).toBeDefined();
    expect(supportVisibilityContracts.reportableKinds).toBeDefined();
    expect(supportVisibilityContracts.artifactWall).toBeDefined();
    expect(supportVisibilityContracts.renderEquivalence).toBeDefined();
    expect(supportVisibilityContracts.safetyException).toBeDefined();
    expect(supportVisibilityContracts.supporterAcceptedAt).toBeDefined();
    expect(supportVisibilityContracts.supporteeAcceptedAt).toBeDefined();
  });

  it('defines core audit and read-time notice storage', () => {
    expect(supportVisibilityAuditEvents.eventType).toBeDefined();
    expect(supportVisibilityAuditEvents.payload).toBeDefined();
    expect(supportVisibilityNotices.noticeType).toBeDefined();
    expect(supportVisibilityNotices.targetAudience).toBeDefined();
    expect(supportVisibilityNotices.targetPersonId).toBeDefined();
    expect(supportVisibilityNotices.acknowledgedAt).toBeDefined();
  });

  it('deduplicates retry-created visibility notices by domain identity and payload', () => {
    const cfg = getTableConfig(supportVisibilityNotices);
    const idx = cfg.indexes.find(
      (i) =>
        i.config.name ===
        'support_visibility_notices_supportership_type_target_payload_uq',
    );

    expect(idx).toBeDefined();
    expect(idx!.config.unique).toBe(true);
    expect(
      (idx!.config.columns as Array<{ name: string }>).map((c) => c.name),
    ).toEqual([
      'supportership_id',
      'notice_type',
      'target_audience',
      'target_person_id',
      'payload',
    ]);
  });

  it('does not add ceremony columns to the canonical supportership edge', () => {
    expect('status' in supportership).toBe(false);
    expect('contractVersion' in supportership).toBe(false);
    expect('relation' in supportership).toBe(false);
    expect('supporterAcceptedAt' in supportership).toBe(false);
    expect('supporteeAcceptedAt' in supportership).toBe(false);
  });
});
