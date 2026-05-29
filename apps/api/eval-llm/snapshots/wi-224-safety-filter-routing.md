# WI-224 safety filter routing

`pnpm eval:llm` was run after changing `apps/api/src/services/llm/router.ts`
and provider transport code to treat provider safety/content-filter blocks and
non-429 HTTP 4xx responses as terminal non-transient errors.

`pnpm eval:llm` was run again after extending router classification to inspect
nested provider `Error.cause` details for HTTP status and validation/policy error
types.

`pnpm eval:llm` was run a final time after preserving HTTP 408 timeout responses
as transient retry/fallback candidates.

The change affects retry, failover, and circuit-breaker classification only. It
does not alter prompt construction, model request payloads, or response text
projection. The eval harness rewrote prompt snapshots with no tracked snapshot
content changes.
