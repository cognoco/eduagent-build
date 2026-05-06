import { z } from 'zod';

export const dedupResponseSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('merge'),
    merged_text: z.string().min(1).max(512),
  }),
  z.object({ action: z.literal('supersede') }),
  z.object({ action: z.literal('keep_both') }),
  z.object({ action: z.literal('discard_new') }),
]);

export type DedupResponse = z.infer<typeof dedupResponseSchema>;

export interface DedupPair {
  candidate: { text: string; category: string };
  neighbour: { text: string; category: string };
}

export function buildDedupPrompt({ candidate, neighbour }: DedupPair): string {
  return [
    'You decide whether two memory facts about the same learner are duplicates.',
    'Choose one action. Output only a single JSON object matching the schema.',
    '',
    'Rules:',
    '- Output only semantic content present in at least one input.',
    '- Do not add detail, infer cause, or rephrase into new claims.',
    '- If the two inputs disagree, prefer the more recent and emit "supersede", not "merge".',
    '- If the inputs are about different things, emit "keep_both".',
    '- If the new fact adds nothing the existing fact does not already say, emit "discard_new".',
    '- Only emit "merge" when both facts say the same thing in different words.',
    '',
    'Schemas:',
    '{ "action": "merge", "merged_text": "<canonical text>" }',
    '{ "action": "supersede" }',
    '{ "action": "keep_both" }',
    '{ "action": "discard_new" }',
    '',
    `Existing fact (category=${neighbour.category}): ${neighbour.text}`,
    `New candidate fact (category=${candidate.category}): ${candidate.text}`,
  ].join('\n');
}
