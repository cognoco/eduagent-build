import { z } from 'zod';
import { isoDateField } from './common.ts';
import { sessionTranscriptSchema } from './sessions';

const llmSummaryBaseSchema = z.object({
  // [SHORT-SESSION] No minimum length: very short sessions (2-3 turns) may not
  // have enough content for a meaningful narrative. Forcing a 40-char floor
  // caused the model to pad/fabricate rather than be concise. An empty string
  // is valid — the refine below exempts empty narratives from the topic-anchor
  // requirement so they do not fail validation.
  narrative: z.string().max(1500),
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
    'iu',
  );
  return pattern.test(narrative);
}

const narrativeMentionsTopic = (value: {
  narrative: string;
  topicsCovered: string[];
  sessionState: string;
}): boolean => {
  // [SHORT-SESSION] An empty narrative is valid regardless of topicsCovered or
  // sessionState — a 2-3 turn session may have nothing meaningful to say in
  // prose form, and an empty string is more honest than forced padding.
  if (value.narrative.length === 0) return true;
  return value.topicsCovered.length === 0
    ? value.sessionState === 'auto-closed'
    : value.topicsCovered.some((topic) =>
        topicMatchesNarrative(value.narrative, topic),
      );
};

const narrativeMentionsTopicOptions = {
  message:
    'narrative must mention at least one topic from topicsCovered by name; only auto-closed sessions may omit topicsCovered',
  path: ['narrative'],
};

export const llmSummarySchema = llmSummaryBaseSchema.refine(
  narrativeMentionsTopic,
  narrativeMentionsTopicOptions,
);
export type LlmSummary = z.infer<typeof llmSummarySchema>;

export const archivedTranscriptSummarySchema = llmSummaryBaseSchema
  .extend({
    learnerRecap: z.string().min(1).nullable(),
    topicId: z.string().uuid().nullable(),
  })
  .refine(narrativeMentionsTopic, narrativeMentionsTopicOptions);
export type ArchivedTranscriptSummary = z.infer<
  typeof archivedTranscriptSummarySchema
>;

export const archivedTranscriptResponseSchema = z.object({
  archived: z.literal(true),
  archivedAt: isoDateField,
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
