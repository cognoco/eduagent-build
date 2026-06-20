import { z } from 'zod';

export const ledgerVisibilitySchema = z.enum(['self', 'supporter', 'both']);
export type LedgerVisibility = z.infer<typeof ledgerVisibilitySchema>;

export const ledgerKindSchema = z.enum([
  'session_filed',
  'topic_mastered',
  'retention_due',
  'needs_deepening_added',
  'recap_ready',
  'snapshot_ready',
  'milestone_reached',
  'reward_receipt',
]);
export type LedgerKind = z.infer<typeof ledgerKindSchema>;

export const ledgerTemplateKeySchema = z.enum([
  'ledger.session_filed.default',
  'ledger.topic_mastered.default',
  'ledger.retention_due.default',
  'ledger.needs_deepening_added.default',
  'ledger.recap_ready.default',
  'ledger.snapshot_ready.default',
  'ledger.milestone_reached.default',
  'ledger.reward_receipt.default',
]);
export type LedgerTemplateKey = z.infer<typeof ledgerTemplateKeySchema>;

export const ledgerParamsSchema = z.record(z.string(), z.unknown());

export function parseLedgerParams(raw: unknown): Record<string, unknown> {
  const result = ledgerParamsSchema.safeParse(raw);
  return result.success ? result.data : {};
}
