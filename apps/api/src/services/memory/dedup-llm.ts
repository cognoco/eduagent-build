import { extractFirstJsonObject, routeAndCall, type ChatMessage } from '../llm';
import {
  buildDedupPrompt,
  dedupResponseSchema,
  type DedupPair,
  type DedupResponse,
} from './dedup-prompt';

export type DedupLlmResult =
  | {
      ok: true;
      decision: DedupResponse;
      modelVersion: string;
      /**
       * [WI-2628] The VENDOR that produced this decision (`result.provider`), kept
       * separate from `modelVersion` (`result.model`). The judge's independence
       * exclusion matches against the vendor pool, so a model string excludes
       * nothing and lets a vendor grade its own output.
       */
      provider: string;
    }
  | {
      ok: false;
      reason: 'invalid_response' | 'transient' | 'no_api_key';
      message: string;
    };

export interface DedupLlmDeps {
  caller?: typeof routeAndCall;
}

export async function runDedupLlm(
  pair: DedupPair,
  deps: DedupLlmDeps = {},
): Promise<DedupLlmResult> {
  const messages: ChatMessage[] = [
    { role: 'user', content: buildDedupPrompt(pair) },
  ];

  let raw: string;
  let modelVersion: string;
  let provider: string;
  try {
    // conversationLanguage not threaded: output is a similarity decision, not prose
    const result = await (deps.caller ?? routeAndCall)(messages, 1, {
      llmTier: 'flash',
      flow: 'memory-dedup',
    });
    raw = result.response;
    modelVersion = result.model;
    provider = result.provider;
  } catch (err) {
    return {
      ok: false,
      reason: 'transient',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const extracted = extractFirstJsonObject(raw);
    if (!extracted) {
      return {
        ok: false,
        reason: 'invalid_response',
        message: `Non-JSON LLM output: ${raw.slice(0, 200)}`,
      };
    }
    try {
      parsed = JSON.parse(extracted);
    } catch {
      return {
        ok: false,
        reason: 'invalid_response',
        message: `Invalid JSON LLM output: ${extracted.slice(0, 200)}`,
      };
    }
  }

  const result = dedupResponseSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      reason: 'invalid_response',
      message: result.error.message,
    };
  }
  return { ok: true, decision: result.data, modelVersion, provider };
}
