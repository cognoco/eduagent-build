What was done:

Aligned the mobile-to-api dependency documentation with the current, intentional AppType exception.

What changed:

Updated docs/project_context.md to keep the general mobile-to-api dependency ban while documenting the single allowed apps/mobile/tsconfig.json project reference to ../api for type-only Hono RPC AppType resolution. The text now explicitly keeps runtime imports and package.json dependencies on @eduagent/api forbidden.

Verification:

Verified the PR diff was docs-only and scoped to docs/project_context.md. GitHub required checks passed: API Quality Gate, CI main, E2E changes, Merge completeness, Playwright smoke, and CodeRabbit status. The Flag-ON integration lane failed with the known account-export identity-v2 diagnostic failure; the workflow marks that lane continue-on-error/non-blocking and an unrelated docs-only PR reproduced the same failure signature.

Caveats / Follow-ups:

No code tests were run because the change was documentation-only.
No follow-ups.
