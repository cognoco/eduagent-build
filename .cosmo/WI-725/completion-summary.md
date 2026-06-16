What was done: Extracted ExchangeContext and its local type dependencies from apps/api/src/services/exchanges.ts into a new apps/api/src/services/exchange-types.ts module, and re-pointed all importers, breaking both type-only import cycles (#7 exchanges⇄exchange-prompts, #8 exchanges⇄language-prompts via exchange-prompts).

What changed: New exchange-types.ts holds ExchangeContext plus ExchangeSourceEvidence, ExchangeSourceEvidenceKind, ExchangeSourceReliability, and the GENERAL_KNOWLEDGE_SOURCE_ID / GENERAL_KNOWLEDGE_CONFIDENCE_FLOOR constants. exchanges.ts now imports these from exchange-types and re-exports them for backward compatibility (local definitions removed; the two source-evidence aliases unused in the body were dropped from the import-for-use clause but kept in the re-export). exchange-prompts.ts, language-prompts.ts, and session/session-exchange.ts now import ExchangeContext from exchange-types instead of from exchanges.

Verification: pnpm exec nx run api:typecheck green; pnpm eval:llm produced 366 snapshots with zero diff (type-only, no prompt-generation impact); pre-push hook (tsc --build + jest --findRelatedTests on the push delta) passed. PR #1149 squash-merged to main as f48b76909 under the strict green gate; review triage clean (0 must-fix, 0 should-fix, 0 inline comments).

Caveats / Follow-ups: None — pure type-only move with no runtime change.
