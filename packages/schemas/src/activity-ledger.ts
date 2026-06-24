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

// Typed params per ledger kind — routing-relevant UUID fields are validated;
// non-routing display fields (topicTitle, subjectName, etc.) pass through.
export const ledgerKindParamsSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('session_filed'),
    sessionId: z.string().uuid().optional(),
    subjectId: z.string().uuid().optional(),
    bookId: z.string().uuid().optional(),
    topicId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('topic_mastered'),
    subjectId: z.string().uuid().optional(),
    bookId: z.string().uuid().optional(),
    topicId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('retention_due'),
    subjectId: z.string().uuid().optional(),
    topicId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('needs_deepening_added'),
    subjectId: z.string().uuid().optional(),
    bookId: z.string().uuid().optional(),
    topicId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('recap_ready'),
    subjectId: z.string().uuid().optional(),
    bookId: z.string().uuid().optional(),
    topicId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('snapshot_ready'),
    subjectId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('milestone_reached'),
    subjectId: z.string().uuid().optional(),
    bookId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('reward_receipt'),
    subjectId: z.string().uuid().optional(),
  }),
]);
export type LedgerKindParams = z.infer<typeof ledgerKindParamsSchema>;

// open-record: raw DB params column; use ledgerKindParamsSchema when kind is known
export const ledgerParamsSchema = z.record(z.string(), z.unknown());

export function parseLedgerParams(raw: unknown): Record<string, unknown> {
  const result = ledgerParamsSchema.safeParse(raw);
  return result.success ? result.data : {};
}
