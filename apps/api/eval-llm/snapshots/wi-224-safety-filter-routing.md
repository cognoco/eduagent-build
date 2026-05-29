# WI-224 safety filter routing

`pnpm eval:llm` was run after changing `apps/api/src/services/llm/router.ts`
to treat provider safety/content-filter blocks as terminal non-transient errors.

The change affects retry, failover, and circuit-breaker classification only. It
does not alter prompt construction, model request payloads, or response text
projection. The eval harness rewrote prompt snapshots with no tracked snapshot
content changes.
