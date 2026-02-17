// ---------------------------------------------------------------------------
// Data Export Service — Story 0.6
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import type { DataExport } from '@eduagent/schemas';

export async function generateExport(accountId: string): Promise<DataExport> {
  // TODO: Query all tables for accountId's profiles
  // Collects: account info, profiles, consent states, subjects, sessions, summaries, assessments
  void accountId;

  return {
    account: {
      email: 'user@example.com', // TODO: look up from DB
      createdAt: new Date().toISOString(),
    },
    profiles: [], // TODO: query profiles for this account
    consentStates: [], // TODO: query consent states for account's profiles
    exportedAt: new Date().toISOString(),
  };
}
