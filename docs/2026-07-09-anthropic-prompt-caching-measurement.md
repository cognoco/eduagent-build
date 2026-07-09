# Anthropic Prompt Caching Measurement Note

Date: 2026-07-09

Scope: WI-1448, session tutor exchanges routed to Anthropic through
`apps/api/src/services/llm/providers/anthropic.ts`.

## What Is Cached

Only the stable, static system-prompt prefix emitted by
`buildSystemPromptMessages()` is marked with:

```json
{ "cache_control": { "type": "ephemeral" } }
```

The volatile suffix remains uncached. That suffix includes learner/profile
personalization, age framing, session state, source packs, topic context,
memory context, app-help context, challenge-round state, and the JSON response
format directive.

## Repeated-Session Effect

Anthropic's prompt caching pricing model charges:

- 5-minute cache writes at 1.25x base input-token price.
- Cache reads at 0.1x base input-token price.
- Uncached input tokens at normal base input-token price.

For a stable prefix of `S` input tokens repeated `N` times within the cache
window:

```text
without cache: N * S
with cache:    1.25 * S + 0.1 * S * (N - 1)
```

That makes the stable-prefix cost effect:

| Repeated Anthropic calls | Stable-prefix cost vs uncached | Stable-prefix savings |
| --- | ---: | ---: |
| 2 | 67.5% | 32.5% |
| 3 | 48.3% | 51.7% |
| 5 | 33.0% | 67.0% |
| 10 | 21.5% | 78.5% |
| Steady repeated hits | 10.0% | 90.0% |

The full request does not save by these percentages unless the stable prefix is
the full request. Volatile suffix tokens and output tokens are unchanged.

## How To Verify In Live Usage

Check Anthropic `usage` fields on repeated calls with the same stable prefix:

```text
total_input_tokens =
  cache_read_input_tokens +
  cache_creation_input_tokens +
  input_tokens
```

Expected pattern:

- First eligible call: `cache_creation_input_tokens > 0`.
- Subsequent eligible calls within the cache window:
  `cache_read_input_tokens > 0`.
- `input_tokens` continues to represent uncached suffix material.

Short stable prefixes below Anthropic's model/platform minimum may be processed
without caching; in that case both cache usage fields stay zero.
