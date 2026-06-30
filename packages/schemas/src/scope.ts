import { z } from 'zod';
import { subjectStatusSchema } from './subjects.ts';

export const scopeKindSchema = z.enum(['supporter-hub', 'person', 'me']);
export type ScopeKind = z.infer<typeof scopeKindSchema>;

export const supporterHubScopeDescriptorSchema = z.strictObject({
  kind: z.literal('supporter-hub'),
});
export type SupporterHubScopeDescriptor = z.infer<
  typeof supporterHubScopeDescriptorSchema
>;

export const personScopeDescriptorSchema = z.strictObject({
  kind: z.literal('person'),
  personId: z.string().uuid(),
  edgeId: z.string().uuid(),
  displayName: z.string().trim().min(1),
});
export type PersonScopeDescriptor = z.infer<typeof personScopeDescriptorSchema>;

export const meScopeDescriptorSchema = z.strictObject({
  kind: z.literal('me'),
});
export type MeScopeDescriptor = z.infer<typeof meScopeDescriptorSchema>;

export const scopeDescriptorSchema = z.discriminatedUnion('kind', [
  supporterHubScopeDescriptorSchema,
  personScopeDescriptorSchema,
  meScopeDescriptorSchema,
]);
export type ScopeDescriptor = z.infer<typeof scopeDescriptorSchema>;

const learnerScopeListSchema = z.strictObject({
  shape: z.literal('learner'),
  defaultScopeIndex: z.null().optional(),
});

const supporterScopeListShapeSchema = z
  .strictObject({
    shape: z.literal('supporter'),
    scopes: z.array(scopeDescriptorSchema).min(1),
    defaultScopeIndex: z.number().int().min(0),
  })
  .superRefine((value, ctx) => {
    if (value.scopes[0]?.kind !== 'supporter-hub') {
      ctx.addIssue({
        code: 'custom',
        path: ['scopes', 0],
        message: 'supporter scopes must start with the Support hub',
      });
    }

    if (value.defaultScopeIndex >= value.scopes.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultScopeIndex'],
        message: 'defaultScopeIndex must point inside scopes',
      });
    }
  });

export const supporterScopeListSchema = z.discriminatedUnion('shape', [
  learnerScopeListSchema,
  supporterScopeListShapeSchema,
]);
export type SupporterScopeList = z.infer<typeof supporterScopeListSchema>;

export const supporteeStructuralTopicProgressStateSchema = z.enum([
  'not-started',
  'learning',
  'review-due',
  'mastered',
]);
export type SupporteeStructuralTopicProgressState = z.infer<
  typeof supporteeStructuralTopicProgressStateSchema
>;

export const supporteeStructuralTopicSchema = z.strictObject({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  chapter: z.string().nullable(),
  sortOrder: z.number().int(),
  estimatedMinutes: z.number().int(),
  skipped: z.boolean(),
  progressState: supporteeStructuralTopicProgressStateSchema,
  nextReviewAt: z.string().datetime().nullable(),
  masteredAt: z.string().datetime().nullable(),
});
export type SupporteeStructuralTopic = z.infer<
  typeof supporteeStructuralTopicSchema
>;

export const supporteeStructuralBookSchema = z.strictObject({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  emoji: z.string().nullable(),
  sortOrder: z.number().int(),
  topics: z.array(supporteeStructuralTopicSchema),
});
export type SupporteeStructuralBook = z.infer<
  typeof supporteeStructuralBookSchema
>;

export const supporteeStructuralSubjectSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string(),
  status: subjectStatusSchema,
  books: z.array(supporteeStructuralBookSchema),
});
export type SupporteeStructuralSubject = z.infer<
  typeof supporteeStructuralSubjectSchema
>;

export const supporteeStructuralSubjectsResponseSchema = z.strictObject({
  personId: z.string().uuid(),
  edgeId: z.string().uuid(),
  subjects: z.array(supporteeStructuralSubjectSchema),
});
export type SupporteeStructuralSubjectsResponse = z.infer<
  typeof supporteeStructuralSubjectsResponseSchema
>;

export const supporterColdStartCardSchema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('none'),
    anchor: z.literal('add-child'),
  }),
  z.strictObject({
    personId: z.string().uuid(),
    edgeId: z.string().uuid(),
    displayName: z.string().trim().min(1),
    state: z.literal('managed'),
    anchor: z.literal('handoff'),
  }),
  z.strictObject({
    pendingLinkId: z.string().uuid(),
    displayName: z.string().trim().min(1),
    state: z.literal('consent-pending'),
    anchor: z.literal('approve'),
  }),
  z.strictObject({
    personId: z.string().uuid(),
    edgeId: z.string().uuid(),
    displayName: z.string().trim().min(1),
    state: z.literal('granted-idle'),
    anchor: z.literal('kickstart'),
    staleIdleStep: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
      .optional(),
  }),
]);
export type SupporterColdStartCard = z.infer<
  typeof supporterColdStartCardSchema
>;

export const supporterColdStartSchema = z
  .strictObject({
    variant: z.enum(['variant-zero', 'per-child']),
    cards: z.array(supporterColdStartCardSchema),
    selfLearningDoorway: z.literal(true),
  })
  .superRefine((value, ctx) => {
    const hasAddChild = value.cards.some((card) => card.state === 'none');
    if (value.variant === 'variant-zero') {
      if (value.cards.length !== 1 || !hasAddChild) {
        ctx.addIssue({
          code: 'custom',
          path: ['cards'],
          message: 'variant-zero must contain only the add-child card',
        });
      }
    } else if (hasAddChild) {
      ctx.addIssue({
        code: 'custom',
        path: ['cards'],
        message: 'per-child cold start must not contain add-child cards',
      });
    }
  });
export type SupporterColdStart = z.infer<typeof supporterColdStartSchema>;
