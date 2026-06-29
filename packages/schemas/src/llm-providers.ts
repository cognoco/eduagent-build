import { z } from 'zod';

// ---------------------------------------------------------------------------
// LLM Provider Wire Format Schemas
//
// These schemas validate raw JSON responses from external LLM API providers
// (OpenAI, Cerebras, Mistral) before any field access in the provider adapters.
// Exported from the @eduagent/schemas barrel (index.ts) like every other shared
// schema; imported via the single package barrel, not a subpath. Shared here to
// avoid file-local duplication across adapters.
//
// All three providers use an OpenAI-compatible chat completions wire format.
// The schemas are intentionally permissive on optional fields (all nullable/
// optional) so that missing optional fields don't fail the parse — only truly
// unexpected shapes (e.g. completely wrong JSON structure) throw.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared building blocks (OpenAI-compatible wire format)
// ---------------------------------------------------------------------------

const providerErrorSchema = z.object({
  message: z.string().optional(),
  type: z.string().optional(),
  code: z.union([z.string(), z.number()]).optional(),
});

const chatChoiceSchema = z.object({
  message: z
    .object({
      // Vendors may return null for content (e.g. tool-use turns); callers
      // gate on !content already, so coerce null → undefined to keep the
      // inferred type as string | undefined and avoid TS2345 at call sites.
      content: z
        .string()
        .nullable()
        .optional()
        .transform((v) => v ?? undefined),
    })
    .optional(),
  delta: z
    .object({
      content: z
        .string()
        .nullable()
        .optional()
        .transform((v) => v ?? undefined),
    })
    .optional(),
  finish_reason: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
});

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

export const openAIResponseSchema = z.object({
  choices: z.array(chatChoiceSchema).optional(),
  error: providerErrorSchema.optional(),
});

export type OpenAIResponseParsed = z.infer<typeof openAIResponseSchema>;

// ---------------------------------------------------------------------------
// Cerebras (OpenAI-compatible wire format, verbatim model passthrough)
// ---------------------------------------------------------------------------

export const cerebrasResponseSchema = z.object({
  choices: z.array(chatChoiceSchema).optional(),
  error: providerErrorSchema.optional(),
});

export type CerebrasResponseParsed = z.infer<typeof cerebrasResponseSchema>;

// ---------------------------------------------------------------------------
// Mistral (OpenAI-compatible wire format; uses max_tokens not max_completion_tokens)
// ---------------------------------------------------------------------------

export const mistralResponseSchema = z.object({
  choices: z.array(chatChoiceSchema).optional(),
  error: providerErrorSchema.optional(),
});

export type MistralResponseParsed = z.infer<typeof mistralResponseSchema>;

// ---------------------------------------------------------------------------
// Anthropic (native Messages API wire format — NOT OpenAI-compatible)
//
// Anthropic returns a top-level `content` array of typed blocks and a
// `stop_reason`, not `choices`. Validated at the provider trust boundary so a
// malformed/wrong-shape body fails closed (createProviderApiError) instead of
// surfacing as a TypeError on a later field access. [WI-481]
// ---------------------------------------------------------------------------

const anthropicContentBlockSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
});

export const anthropicResponseSchema = z.object({
  content: z.array(anthropicContentBlockSchema).optional(),
  stop_reason: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  error: providerErrorSchema.optional(),
});

export type AnthropicResponseParsed = z.infer<typeof anthropicResponseSchema>;

// ---------------------------------------------------------------------------
// Gemini (native generateContent wire format — NOT OpenAI-compatible)
//
// Gemini nests text under candidates[].content.parts[].text and signals safety
// blocks via promptFeedback.blockReason / candidates[].finishReason. Validated
// at the provider trust boundary for both the non-streaming body and each SSE
// chunk. [WI-481]
// ---------------------------------------------------------------------------

const geminiPartSchema = z.object({ text: z.string().optional() });

const geminiCandidateSchema = z.object({
  content: z.object({ parts: z.array(geminiPartSchema).optional() }).optional(),
  finishReason: z.string().optional(),
});

export const geminiResponseSchema = z.object({
  candidates: z.array(geminiCandidateSchema).optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  error: providerErrorSchema.optional(),
});

export type GeminiResponseParsed = z.infer<typeof geminiResponseSchema>;
