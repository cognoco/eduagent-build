import { z } from 'zod';

// MMT-ADR-0022 (activity feed = derive-on-read + thin seen-state): the ledger
// is a narrow seen-state store, not a materialized log of every moment. Only
// genuinely-written kinds are declared here — the five derive-on-read kinds
// (topic_mastered, retention_due, needs_deepening_added, recap_ready,
// snapshot_ready) were never written and have been pruned. A new moment kind is
// a read-time projection in now-feed.ts, NOT a new entry here + a writer.
export const ledgerKindSchema = z.enum([
  'session_filed',
  'milestone_reached',
  'reward_receipt',
]);
export type LedgerKind = z.infer<typeof ledgerKindSchema>;

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
