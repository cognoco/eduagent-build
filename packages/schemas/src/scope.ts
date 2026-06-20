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

export const supporteeStructuralTopicSchema = z.strictObject({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  chapter: z.string().nullable(),
  sortOrder: z.number().int(),
  estimatedMinutes: z.number().int(),
  skipped: z.boolean(),
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
