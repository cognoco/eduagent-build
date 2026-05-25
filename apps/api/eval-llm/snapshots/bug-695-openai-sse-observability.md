# BUG-695 OpenAI SSE observability

`pnpm eval:llm` was run after changing `apps/api/src/services/llm/providers/openai.ts`
to log malformed OpenAI SSE chunks instead of silently discarding them.

The change is transport observability only: it does not alter prompt construction,
model routing, request payloads, or response text projection. The eval harness
rewrote prompt snapshots with no tracked snapshot content changes.
