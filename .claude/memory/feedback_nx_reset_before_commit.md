---
name: NX cache causes phantom lint failures
description: NX module boundaries eslint rule uses a cached project graph — stale cache triggers false "lazy-loaded library" errors on commit. Run `pnpm exec nx reset` to clear.
type: feedback
originSessionId: 9bdb1ed7-5f67-4a1f-b7a2-263760df9489
status: superseded
superseded_by: docs/ci-troubleshooting.md
---
Moved to a cross-runtime doc (WI-561). The full symptom + fix now live in
`docs/ci-troubleshooting.md` → `## Phantom @nx/enforce-module-boundaries errors`.
Read that section when a stale NX project-graph ESLint cache produces phantom
boundary errors; the fix is `pnpm exec nx reset`.
