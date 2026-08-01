# WI-2737 rework regression receipt

This directory contains the machine-generated Jest result files and the final
RED → GREEN → production-only REVERT → RESTORE receipts for the rework
regressions. Committed Jest strings use repository-relative paths; only the
developer-workstation prefix was normalised after each run.

The original 55-test rework cycle used these concrete per-phase commands:

```sh
node scripts/doppler-run.mjs run -- pnpm test:api:unit --runTestsByPath apps/api/src/services/minor-pii-echo-gate.test.ts apps/api/src/services/learner-egress-filter.test.ts apps/api/src/services/llm/router.egress-filter.test.ts apps/api/src/inngest/functions/post-session-suggestions.test.ts --no-coverage --json --outputFile=docs/evidence/WI-2737/red.json
node scripts/doppler-run.mjs run -- pnpm test:api:unit --runTestsByPath apps/api/src/services/minor-pii-echo-gate.test.ts apps/api/src/services/learner-egress-filter.test.ts apps/api/src/services/llm/router.egress-filter.test.ts apps/api/src/inngest/functions/post-session-suggestions.test.ts --no-coverage --json --outputFile=docs/evidence/WI-2737/green.json
node scripts/doppler-run.mjs run -- pnpm test:api:unit --runTestsByPath apps/api/src/services/minor-pii-echo-gate.test.ts apps/api/src/services/learner-egress-filter.test.ts apps/api/src/services/llm/router.egress-filter.test.ts apps/api/src/inngest/functions/post-session-suggestions.test.ts --no-coverage --json --outputFile=docs/evidence/WI-2737/revert-red.json
node scripts/doppler-run.mjs run -- pnpm test:api:unit --runTestsByPath apps/api/src/services/minor-pii-echo-gate.test.ts apps/api/src/services/learner-egress-filter.test.ts apps/api/src/services/llm/router.egress-filter.test.ts apps/api/src/inngest/functions/post-session-suggestions.test.ts --no-coverage --json --outputFile=docs/evidence/WI-2737/restore-green.json
```

The address-token boundary follow-up used the same contract with its focused
21-test file and separate artifacts:

```sh
node scripts/doppler-run.mjs run -- pnpm test:api:unit --runTestsByPath apps/api/src/services/minor-pii-echo-gate.test.ts --no-coverage --json --outputFile=docs/evidence/WI-2737/address-bounds-red.json
node scripts/doppler-run.mjs run -- pnpm test:api:unit --runTestsByPath apps/api/src/services/minor-pii-echo-gate.test.ts --no-coverage --json --outputFile=docs/evidence/WI-2737/address-bounds-green.json
node scripts/doppler-run.mjs run -- pnpm test:api:unit --runTestsByPath apps/api/src/services/minor-pii-echo-gate.test.ts --no-coverage --json --outputFile=docs/evidence/WI-2737/address-bounds-revert-red.json
node scripts/doppler-run.mjs run -- pnpm test:api:unit --runTestsByPath apps/api/src/services/minor-pii-echo-gate.test.ts --no-coverage --json --outputFile=docs/evidence/WI-2737/address-bounds-restore-green.json
```

Each phase writes a separate JSON result. `receipt.json` records the identical
commands, phase outcomes, production-file hashes, and result pointers.
