import { z } from 'zod';

export const conceptMasterySignalSchema = z.object({
  verified: z.boolean(),
  hasMentorAddition: z.boolean(),
  mentorAdditions: z.array(z.string()),
});

export type ConceptMasterySignal = z.infer<typeof conceptMasterySignalSchema>;

export const conceptMasterySignalsResponseSchema = z.object({
  signals: z.record(z.string().uuid(), conceptMasterySignalSchema),
});

export type ConceptMasterySignalsResponse = z.infer<
  typeof conceptMasterySignalsResponseSchema
>;
