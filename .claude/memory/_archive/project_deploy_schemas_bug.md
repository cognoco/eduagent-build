---
name: Deploy workflow bug — RESOLVED
description: deploy.yml schemas dist not built before API — FIXED in PR #97 (2026-04-03). schemas:build step added to deploy.yml.
type: project
---

**Status: RESOLVED (2026-04-03, PR #97).**

`deploy.yml` now includes `pnpm exec nx run schemas:build` (line 141) before the API build step. The deploy workflow passes.

**Original root cause:** The `api-deploy` job ran esbuild which followed `package.json` exports → `./dist/index.js`, but no prior step built the schemas package. Tests passed because TypeScript resolves via path aliases (pointing to source), not package.json exports.

**How to apply:** No action needed — this is resolved. If a similar "Could not resolve" error appears for other workspace packages in deploy, the same pattern applies: add an `nx run <pkg>:build` step before the consuming build.
