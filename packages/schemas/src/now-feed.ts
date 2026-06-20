import { z } from 'zod';

export const nowScopeSchema = z.enum(['self', 'supporter-hub', 'person']);
export type NowScope = z.infer<typeof nowScopeSchema>;

export const nowCardKindSchema = z.enum([
  'unfinished_session',
  'retention_due',
  'parked_item',
  'needs_deepening',
  'challenge_ready',
  'ledger_moment',
]);
export type NowCardKind = z.infer<typeof nowCardKindSchema>;

export const nowDeepLinkRouteSchema = z.enum([
  'session.resume',
  'subject.topic',
  'subject.hub',
  'retention.review',
  'challenge.start',
]);
export type NowDeepLinkRoute = z.infer<typeof nowDeepLinkRouteSchema>;

export const nowDeepLinkSchema = z.object({
  route: nowDeepLinkRouteSchema,
  params: z.record(z.string(), z.string()),
  chain: z.array(z.string()),
});
export type NowDeepLink = z.infer<typeof nowDeepLinkSchema>;

export const nowCardSchema = z.object({
  kind: nowCardKindSchema,
  templateKey: z.string(),
  params: z.record(z.string(), z.unknown()),
  deepLink: nowDeepLinkSchema,
  scope: nowScopeSchema,
  personId: z.string().uuid().optional(),
  edgeId: z.string().uuid().optional(),
});
export type NowCard = z.infer<typeof nowCardSchema>;

export const nowOverflowItemSchema = z.object({
  kind: nowCardKindSchema,
  templateKey: z.string(),
  params: z.record(z.string(), z.unknown()),
  deepLink: nowDeepLinkSchema,
  scope: nowScopeSchema,
  personId: z.string().uuid().optional(),
  edgeId: z.string().uuid().optional(),
});
export type NowOverflowItem = z.infer<typeof nowOverflowItemSchema>;

export const nowQuerySchema = z
  .object({
    scope: nowScopeSchema.default('self'),
    personId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === 'person' && !value.personId) {
      ctx.addIssue({
        code: 'custom',
        path: ['personId'],
        message: 'personId is required for person scope',
      });
    }

    if (value.scope !== 'person' && value.personId) {
      ctx.addIssue({
        code: 'custom',
        path: ['personId'],
        message: 'personId is only valid for person scope',
      });
    }
  });
export type NowQuery = z.infer<typeof nowQuerySchema>;

export const nowResponseSchema = z.object({
  scope: nowScopeSchema,
  cards: z.array(nowCardSchema).max(3),
  overflowCount: z.number().int().min(0),
  generatedAt: z.string(),
});
export type NowResponse = z.infer<typeof nowResponseSchema>;

export const nowOverflowResponseSchema = z.object({
  scope: nowScopeSchema,
  items: z.array(nowOverflowItemSchema),
});
export type NowOverflowResponse = z.infer<typeof nowOverflowResponseSchema>;
