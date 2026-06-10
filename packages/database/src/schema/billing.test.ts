// ---------------------------------------------------------------------------
// billing.ts — schema shape tests
//
// WI-569 (W0 baseline reset): the T1 organizationId column was removed from
// the subscriptions schema when migration 0106 was removed from the effective
// chain. The T1 shape guard tests below were removed. W1 schema cleanup will
// add shape guards for the new subscription table once it is declared.
// ---------------------------------------------------------------------------
