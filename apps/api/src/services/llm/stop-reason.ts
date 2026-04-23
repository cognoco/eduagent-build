// ---------------------------------------------------------------------------
// StopReason — shared type + normalization across LLM providers.
//
// Each provider reports the reason a generation ended in its own vocabulary:
//   - Anthropic: "end_turn", "max_tokens", "stop_sequence", "tool_use"
//   - OpenAI:    "stop", "length", "content_filter", "tool_calls", "function_call"
//   - Gemini:    "STOP", "MAX_TOKENS", "SAFETY", "RECITATION"
//
// We normalize to a single vocabulary so downstream code (metrics, fallback
// orchestrator, eval harness) never switches on provider-specific strings.
//
// `"length"` is the one we actually care about for truncation detection —
// the provider hit max_tokens before finishing.
// ---------------------------------------------------------------------------

export type StopReason = 'stop' | 'length' | 'filter' | 'tool_use' | 'unknown';

export type StopReasonProvider = 'anthropic' | 'openai' | 'gemini';

export function normalizeStopReason(
  provider: StopReasonProvider,
  raw: string | undefined | null
): StopReason {
  if (!raw) return 'unknown';
  const v = String(raw);

  if (provider === 'anthropic') {
    if (v === 'max_tokens') return 'length';
    if (v === 'end_turn' || v === 'stop_sequence') return 'stop';
    if (v === 'tool_use') return 'tool_use';
    return 'unknown';
  }

  if (provider === 'openai') {
    if (v === 'length') return 'length';
    if (v === 'stop') return 'stop';
    if (v === 'content_filter') return 'filter';
    if (v === 'tool_calls' || v === 'function_call') return 'tool_use';
    return 'unknown';
  }

  // gemini — case-insensitive
  const up = v.toUpperCase();
  if (up === 'MAX_TOKENS') return 'length';
  if (up === 'STOP') return 'stop';
  if (up === 'SAFETY' || up === 'RECITATION') return 'filter';
  return 'unknown';
}
