**What was done:** Updated the Cosmo refine DoR gate in `plugins/cosmo/skills/refine/dor.ts` so childless accidental Work Packages receive one precise recovery diagnostic instead of the generic WP child and brief failures.

**What changed:** Added regression coverage in `plugins/cosmo/skills/refine/dor.test.ts` for the childless-WP recovery path while preserving the existing true-WP child-count and brief checks. Bumped Cosmo plugin manifests in `.claude-plugin/marketplace.json`, `plugins/cosmo/.claude-plugin/plugin.json`, and `plugins/cosmo/.codex-plugin/plugin.json`.

**Verification:** Red-green checked `bun test plugins/cosmo/skills/refine/dor.test.ts`, then ran `bun test plugins/cosmo/skills/refine`, `bun test plugins/cosmo`, `claude plugin validate plugins/cosmo`, and `claude plugin validate .`; all completed successfully.

**Caveats / Follow-ups:** The fix lives in the `zdx-marketplace` source checkout and was pushed on branch `WI-893`; the installed plugin cache was not edited.
