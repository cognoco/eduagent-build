# WI-2737 rework regression receipt

This directory contains the machine-generated Jest result files and the final
RED → GREEN → production-only REVERT → RESTORE receipt for the rework regression.

The focused command is:

```text
pnpm test:api:unit --runTestsByPath apps/api/src/services/minor-pii-echo-gate.test.ts apps/api/src/services/learner-egress-filter.test.ts apps/api/src/services/llm/router.egress-filter.test.ts apps/api/src/inngest/functions/post-session-suggestions.test.ts --no-coverage --json
```

Each phase writes a separate JSON result. `receipt.json` records the exact command,
phase outcome, production-file hashes, and result pointer after the full cycle.
