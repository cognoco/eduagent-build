import { familyJoinJourney as table } from './index.js';

describe('family_join_journey schema', () => {
  it('exports the durable workflow row and its identity bindings', () => {
    expect(table).toBeDefined();

    expect(table.id).toBeDefined();
    expect(table.inviteId).toBeDefined();
    expect(table.chargePersonId).toBeDefined();
    expect(table.familyOrgId).toBeDefined();
    expect(table.state).toBeDefined();
    expect(table.boundAt).toBeDefined();
  });

  it('records the current legal posture and supportership decision owner', () => {
    expect(table).toBeDefined();

    expect(table.jurisdiction).toBeDefined();
    expect(table.policyVersion).toBeDefined();
    expect(table.authorizationForm).toBeDefined();
    expect(table.learnerAssentedAt).toBeDefined();
    expect(table.learnerSupportershipPreference).toBeDefined();
    expect(table.supportershipAuthority).toBeDefined();
    expect(table.supportershipDecision).toBeDefined();
  });

  it('binds guardian completion and the resulting visibility contract', () => {
    expect(table).toBeDefined();

    expect(table.guardianPersonId).toBeDefined();
    expect(table.guardianAuthorityRedemptionId).toBeDefined();
    expect(table.guardianCompletedAt).toBeDefined();
    expect(table.visibilityContractId).toBeDefined();
  });

  it('keeps explicit terminal timestamps for resumable outcomes', () => {
    expect(table).toBeDefined();

    expect(table.declinedAt).toBeDefined();
    expect(table.withdrawnAt).toBeDefined();
    expect(table.joinedAt).toBeDefined();
    expect(table.createdAt).toBeDefined();
    expect(table.updatedAt).toBeDefined();
  });

  it('declares one journey per invite and one active journey per charge', () => {
    const source = readSource();

    expect(source).toContain(
      "uniqueIndex('family_join_journey_invite_unique')",
    );
    expect(source).toContain(
      "uniqueIndex('family_join_journey_charge_active_unique')",
    );
    expect(source).toContain("IN ('awaiting_guardian','ready_to_join')");
  });

  it('constrains states, legal forms, decision authority, and terminal timestamps', () => {
    const source = readSource();

    expect(source).toContain("'family_join_journey_state_valid'");
    expect(source).toContain("'family_join_journey_authorization_form_valid'");
    expect(source).toContain(
      "'family_join_journey_supportership_authority_valid'",
    );
    expect(source).toContain(
      "'family_join_journey_supportership_decision_valid'",
    );
    expect(source).toContain("'family_join_journey_terminal_timestamp_valid'");
  });
});

function readSource(): string {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const sourcePath = path.resolve(__dirname, 'family-join-journey.ts');

  return fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
}
