import { z } from 'zod';

export const nowScopeSchema = z.enum(['self', 'supporter-hub', 'person']);
export type NowScope = z.infer<typeof nowScopeSchema>;

export const nowCardKindSchema = z.enum([
  'billing_alert',
  'unfinished_session',
  'retention_due',
  'parked_item',
  'needs_deepening',
  'challenge_ready',
  'ledger_moment',
  'support_hub_pointer',
]);
export type NowCardKind = z.infer<typeof nowCardKindSchema>;

export const nowDeepLinkRouteSchema = z.enum([
  'settings.more',
  'settings.account',
  'billing.manage',
  'session.resume',
  'session.summary',
  'subject.topic',
  'subject.hub',
  'retention.review',
  'challenge.start',
  'journal',
  'support.hub',
]);
export type NowDeepLinkRoute = z.infer<typeof nowDeepLinkRouteSchema>;

export const nowDeepLinkSchema = z.object({
  route: nowDeepLinkRouteSchema,
  params: z.record(z.string(), z.string()),
  chain: z.array(z.string()),
});
export type NowDeepLink = z.infer<typeof nowDeepLinkSchema>;

// Typed card params — routing-relevant UUID fields (from ROUTE_CATALOG) are
// validated; non-routing display fields (subjectName, topicTitle, etc.) pass
// through via the z.record base.
// open-record: base for display fields not part of deep-link routing
export const nowCardParamsSchema = z.record(z.string(), z.unknown()).and(
  z.object({
    sessionId: z.string().uuid().optional(),
    subjectId: z.string().uuid().optional(),
    bookId: z.string().uuid().optional(),
    topicId: z.string().uuid().optional(),
  }),
);
export type NowCardParams = z.infer<typeof nowCardParamsSchema>;

export const nowCardSchema = z.object({
  kind: nowCardKindSchema,
  templateKey: z.string(),
  params: nowCardParamsSchema,
  deepLink: nowDeepLinkSchema,
  scope: nowScopeSchema,
  personId: z.string().uuid().optional(),
  edgeId: z.string().uuid().optional(),
});
export type NowCard = z.infer<typeof nowCardSchema>;

export const nowOverflowItemSchema = z.object({
  kind: nowCardKindSchema,
  templateKey: z.string(),
  params: nowCardParamsSchema,
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
