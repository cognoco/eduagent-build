import { z } from 'zod';
import { sessionTranscriptSchema } from './sessions.ts';

const llmSummaryBaseSchema = z.object({
  narrative: z.string().min(40).max(1500),
  topicsCovered: z.array(z.string().min(2).max(120)).max(20),
  sessionState: z.enum(['completed', 'paused-mid-topic', 'auto-closed']),
  reEntryRecommendation: z.string().min(20).max(400),
});

const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

// Unicode-aware word boundary: `\b` in JS only recognises ASCII word chars,
// so an accented topic like "Příroda" would dangle into longer words. The
// lookarounds match position not adjacent to any Unicode letter or number.
function topicMatchesNarrative(narrative: string, topic: string): boolean {
  const trimmed = topic.trim();
  if (trimmed.length === 0) return false;
  const escaped = trimmed.replace(REGEX_METACHARACTERS, '\\$&');
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    'iu'
  );
  return pattern.test(narrative);
}

export const llmSummarySchema = llmSummaryBaseSchema.refine(
  (value) =>
    value.topicsCovered.length === 0 ||
    value.topicsCovered.some((topic) =>
      topicMatchesNarrative(value.narrative, topic)
    ),
  {
    message:
      'narrative must mention at least one topic from topicsCovered by name',
    path: ['narrative'],
  }
);
export type LlmSummary = z.infer<typeof llmSummarySchema>;

export const archivedTranscriptSummarySchema = llmSummarySchema.safeExtend({
  learnerRecap: z.string().min(1).nullable(),
  topicId: z.string().uuid().nullable(),
});
export type ArchivedTranscriptSummary = z.infer<
  typeof archivedTranscriptSummarySchema
>;

export const archivedTranscriptResponseSchema = z.object({
  archived: z.literal(true),
  archivedAt: z.string().datetime(),
  summary: archivedTranscriptSummarySchema,
});
export type ArchivedTranscriptResponse = z.infer<
  typeof archivedTranscriptResponseSchema
>;

export const liveTranscriptResponseSchema = sessionTranscriptSchema.extend({
  archived: z.literal(false),
});
export type LiveTranscriptResponse = z.infer<
  typeof liveTranscriptResponseSchema
>;

export const transcriptResponseSchema = z.discriminatedUnion('archived', [
  archivedTranscriptResponseSchema,
  liveTranscriptResponseSchema,
]);
export type TranscriptResponse = z.infer<typeof transcriptResponseSchema>;
