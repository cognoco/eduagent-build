// ---------------------------------------------------------------------------
// [WI-2929] consent_receipt — the durable Art 7(1) evidence that outlives the
// person. ONE writer for every path that must record or refresh a receipt.
//
// The durability gap this closes (consent-log spec
// docs/compliance/evidence/2026-07-30-consent-log-spec.md §2.7): receipts used
// to be written ONLY at teardown time — `executeDeletionV2`, `rehomeGrantsTx`,
// and `archiveSourceConsentGrants` each archived a person's grants immediately
// before deleting them. That is correct today only because all three current
// `delete(consent_grant)` sites remember to archive first; the evidence's
// existence is a property nobody enforces, and the next grant-deleting path
// silently loses consent history. It is the same fragility as finding C-2 —
// correctness by convention, not by construction.
//
// The fix is to move the write EARLIER, not to add another teardown-time one:
// a receipt is written the moment a grant is written, so the proof exists from
// the instant consent is taken and no later code path can lose it.
//
// `consent_receipt.consent_grant_id` (nullable, partial-unique, deliberately
// NOT a foreign key — the receipt outlives the grant row) is the upsert key
// that makes this safe to call repeatedly:
//   - at GRANT time      → INSERT the receipt
//   - at WITHDRAWAL time → refresh `withdrawn_at` / `prior_value` / `audit_fact`
//   - at RE-HOME time    → final refresh, then the grant rows are deleted
// so a person whose grants are re-homed at deletion ends with exactly one
// receipt per grant, not two.
//
// `assurance_token` / `assurance_method` are deliberately never copied — they
// drop at re-home time (spec §7), and writing the receipt earlier must not
// start retaining them.
// ---------------------------------------------------------------------------

import { isNotNull, sql } from 'drizzle-orm';
import { consentReceipt, type Database } from '@eduagent/database';

/**
 * A transaction handle as Drizzle hands it to a `db.transaction` callback.
 * `syncConsentReceipts` accepts either it or the root `Database`, so every
 * caller can pass whatever handle it already holds — several of these writes
 * happen inside a larger identity-graph or deletion transaction and MUST NOT
 * open their own.
 */
export type ConsentReceiptWriter =
  | Database
  | Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * The `consent_grant` fields a receipt copies. Structurally a subset of the
 * grant row, so any `.returning()` from a `consent_grant` insert/update — or a
 * `findMany` over the table — satisfies it without a mapping step.
 */
export interface ConsentGrantReceiptSource {
  id: string;
  chargePersonId: string;
  organizationId: string;
  purpose: string;
  lawfulBasis: string;
  granted: boolean;
  grantedAt: Date;
  withdrawnAt: Date | null;
  priorValue: boolean | null;
  auditFact: unknown;
  policyVersion: string | null;
}

/**
 * Write (or refresh) the durable receipt for each supplied grant.
 *
 * Idempotent by construction: keyed on `consent_grant_id`, so calling it at
 * grant time, again at withdrawal, and again at re-home yields ONE receipt row
 * per grant carrying the grant's latest evidence state. A no-op for an empty
 * list.
 *
 * `granted_at` and `policy_version` are refreshed too, but neither the
 * withdrawal path nor the re-home path ever changes them on the grant — that
 * is the point of promoting `policy_version` to a column — so in practice the
 * grant-time values are what survive.
 */
export async function syncConsentReceipts(
  db: ConsentReceiptWriter,
  grants: readonly ConsentGrantReceiptSource[],
): Promise<void> {
  if (grants.length === 0) return;
  await db
    .insert(consentReceipt)
    .values(
      grants.map((grant) => ({
        consentGrantId: grant.id,
        personId: grant.chargePersonId,
        organizationId: grant.organizationId,
        purpose: grant.purpose,
        lawfulBasis: grant.lawfulBasis,
        granted: grant.granted,
        grantedAt: grant.grantedAt,
        withdrawnAt: grant.withdrawnAt,
        priorValue: grant.priorValue,
        auditFact: grant.auditFact,
        policyVersion: grant.policyVersion,
        // Counsel-owned seam (spec §2.7, retention gap G-2) — unchanged here.
        retentionPeriod: null,
      })),
    )
    .onConflictDoUpdate({
      target: consentReceipt.consentGrantId,
      // The unique index is PARTIAL; Postgres only infers it when the arbiter
      // predicate is restated.
      targetWhere: isNotNull(consentReceipt.consentGrantId),
      set: {
        granted: sqlExcluded('granted'),
        grantedAt: sqlExcluded('granted_at'),
        withdrawnAt: sqlExcluded('withdrawn_at'),
        priorValue: sqlExcluded('prior_value'),
        auditFact: sqlExcluded('audit_fact'),
        policyVersion: sqlExcluded('policy_version'),
      },
    });
}

/**
 * `excluded.<column>` — the row Postgres could not insert — for the
 * ON CONFLICT DO UPDATE set clause. Drizzle has no typed helper for it.
 */
function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}
