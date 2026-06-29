## What was done

- Corrected MMT-ADR-0020 and `docs/canon/identity/data-model.md` §2B.1 so they no longer claim `consent_request` ships named service-role RLS policy exceptions for public token lookup or reminder sweeps.
- Replaced both passages with the actual access model: service-role consumers reach `consent_request` through the owner-role (`neondb_owner`) connection, which bypasses RLS today; a named policy exception is only needed if the future `app_user` role-switch cut-over lands.
- Folded in the ADR provenance rider by updating the ADR date to 2026-06-29 and Deciders to Architect (jjoerg) + PM.

## What changed

- `docs/adr/MMT-ADR-0020-cutover-completion-amendments.md`
- `docs/canon/identity/data-model.md`

PR: https://github.com/cognoco/eduagent-build/pull/1582
Fixed in: https://github.com/cognoco/eduagent-build/commit/5cda1499634a8879fba450c554953edbcf5f2170

## Verification

- `git diff --check`
- `pnpm exec prettier --check docs/adr/MMT-ADR-0020-cutover-completion-amendments.md docs/canon/identity/data-model.md`
- Stale-phrase scan confirmed the removed exception/provenance wording no longer appears in the two edited docs.
- PR #1582 required checks passed before merge: API Quality Gate, main CI, Merge completeness check, Playwright web smoke, CodeRabbit.

## Caveats / Follow-ups

- The optional `Flag-ON integration (IDENTITY_V2_ENABLED)` diagnostic lane failed after merge; this is the known non-blocking identity-v2 diagnostic lane and was not required for this docs-only PR.

- None.
