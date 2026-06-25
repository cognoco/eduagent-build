/**
 * parseStructuredLlmOutput — shared seam for LLM structured JSON parsing.
 *
 * WI-1073: Centralizes the ~12 divergent `extractFirstJsonObject + JSON.parse +
 * schema.safeParse` call sites that previously implemented their own error
 * handling independently.
 *
 * Contract:
 *   - On success: returns the validated value T.
 *   - On any failure (no JSON, invalid JSON, schema violation): logs a structured
 *     warning via the logger and returns null. The CALLER decides the fallback.
 *
 * Why this is not `parseEnvelope`:
 *   `parseEnvelope` (envelope.ts) is for state-machine signal envelopes
 *   (`llmResponseEnvelopeSchema`) used in exchange flows. This helper is for
 *   raw-JSON structured outputs (curriculum, homework, assessments, etc.) that
 *   do not use the envelope format. Do NOT route state-machine calls here.
 *
 * Error handling note:
 *   This helper logs parse failures for telemetry. Call sites that need Sentry
 *   captures (e.g. billing, dictation) should capture AFTER checking for null,
 *   so their custom context is preserved. The logger call here is always emitted
 *   regardless.
 */

import type { ZodType } from 'zod';
import { extractFirstJsonObject } from './extract-json';
import { createLogger } from '../logger';

const logger = createLogger();

/**
 * Parse a structured JSON output from an LLM response string using a Zod schema.
 *
 * @param schema - Zod schema to validate the parsed JSON.
 * @param response - Raw LLM response string (may contain markdown fences or prose).
 * @param context - Call-site label used in log entries (e.g. `'homework-summary'`).
 * @returns Validated value or `null` on any parse/validation failure.
 */
export function parseStructuredLlmOutput<T>(
  schema: ZodType<T>,
  response: string,
  context: string,
): T | null {
  const jsonStr = extractFirstJsonObject(response);
  if (!jsonStr) {
    logger.warn('llm.structured_output.no_json', {
      context,
      responseLength: response.length,
    });
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch (error) {
    logger.warn('llm.structured_output.invalid_json', {
      context,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    logger.warn('llm.structured_output.schema_violation', {
      context,
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
    return null;
  }

  return result.data;
}
