## What was done:

Added `apps/api/src/inngest/registration-sync.guard.test.ts` — a forward-only
AST-based ratchet that closes the silent registration-sync gap identified in F-005.

The guard walks every `export const X = inngest.createFunction(...)` in
`apps/api/src/inngest/functions/` (recursively), collects the exported symbol names,
then parses the `functions[]` array in `apps/api/src/inngest/index.ts` and asserts
every defined function symbol is present. A `// registration-exempt: <reason>` opt-out
comment mirrors the existing `// orphan-allow:` pattern in the sibling guards.

## What changed:

Single new file:
- `apps/api/src/inngest/registration-sync.guard.test.ts` (373 lines, 9 test cases)

Two commits on branch `WI-573`:
- `fd942aff6` — initial guard with non-recursive file walker
- `608c0e562` — fix: recurse into subdirectories (CodeRabbit/Codex review finding)

No production code changed. No functions array modified. No function removed or added.

## Verification:

- All 9 registration-sync guard tests pass locally and in CI.
- All 45 sibling guard tests pass (orphan-dispatcher, orphan-handler, registration-sync combined).
- Typecheck and lint pass (api:typecheck, api:lint).
- CI: PR #867 — 6/6 checks pass on final commit `608c0e562` (none pending).
- Audit result: all 77 currently defined Inngest functions confirmed present in `functions[]`. No registration gap exists today. Guard prevents future gaps.

## Caveats / Follow-ups:

- Scope boundary: authority enforcement INSIDE Inngest functions is W3 (WI-577/578/579/580/581). Not touched here.
- The `app/billing.alias_received` known-pending orphan in `orphan-dispatcher.guard.test.ts` remains pending — it's a product decision (subscription-merge workflow), not in WI-573 scope.
- WI-573 branch was cut from `origin/main` at commit `898eae72a` which includes PR #860 (WI-571, the spine predecessor).
