# PR 419 sanitize merge

`pnpm eval:llm` was run after merging `origin/main`, which brought in
`apps/api/src/services/llm/sanitize.ts` changes. The Tier 1 prompt snapshots were
regenerated and no generated prompt output changed.
