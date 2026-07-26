# WI-2838 verification

## Focused discriminator seam

- RED: focused Jest exited 1 under the legacy object-identity predicate;
  one expected failure and one passing adjacent-request case.
- GREEN: focused Jest exited 0; 1 suite, 3 tests passed.
- Prettier check: exit 0.
- ESLint on the three changed code/test files: exit 0.
- GC1 Pattern-A scanner: exit 0 with no findings.
- Mobile typecheck: exit 0; mobile and all six dependencies succeeded.
- Branch-scoped fast change-class gate: exit 0; TypeScript build passed.

## Named real-browser journey, retries disabled

Environment: staging API and V2 navigation flags, through Doppler staging.

Command shape:

```text
pnpm exec playwright test -c apps/mobile/playwright.config.ts apps/mobile/e2e-web/flows/v2/returning-learner-resume.spec.ts --project=v2-release --workers=1 --retries=0 --reporter=line --no-deps
```

- First corrected run: exit 0; 1 passed.
- Repeated corrected run with `--repeat-each=3`: exit 0; 3 passed.

## Complete V2 release project

Command shape:

```text
pnpm exec playwright test -c apps/mobile/playwright.config.ts --project=v2-release --retries=0 --reporter=line
```

Result: exit 1; 15 passed, 1 failed. The WI-2234 case passed. The sole failure
was `nav-shell.spec.ts` expecting `supporter-self-learning-doorway` to be absent,
while current product behavior intentionally renders it. This is pre-existing,
independently tracked WI-2822; PR #2658 at branch WI-2822 updates that exact
contract. WI-2838 does not copy or absorb that colliding work.

## Scope audit

- No timeout value changed.
- No retries were added or widened.
- No product assertion was removed.
- The Session-held boundary, response success/freshness, Mentor arrival, and
  both exact returning-learner card assertions remain in the named journey.

## Exact-head provenance after base synchronization

PR #2664 was externally advanced after the executor published `732b684`.
The executor did not author or initiate the merge and did not reset, rebase, or
force-push it. The preserved exact head is
`d3caddaa3ece0a187cc3b34ec3625f3c6aebbb3c`.

- `git show --no-patch --pretty=raw` records tree
  `7df708ac08df6a4531d9fa41d0eddfff9e396b72`, first parent
  `732b684eb69d1ffaa8613c59318e804f18566fbe`, and second parent
  `f8aa11b086e8787f672c6d326018ee4bcfc32c6f`.
- The branch and HEAD reflogs both record `merge origin/main: Merge made by the
  'ort' strategy` at 2026-07-27 00:06:04 +0200.
- `git ls-remote` recorded `refs/heads/WI-2838` and
  `refs/pull/2664/head` at `d3caddaa`; `refs/heads/main` remained `f8aa11b`.
- The WI patch before synchronization (`2b277b9..732b684`) and after it
  (`f8aa11b..d3caddaa`) have the identical binary-diff SHA-256
  `e2db8f4c352bf32013b5a747ed8f8b0cc167a99dd673079ecab51478772776c5`.
  The latter still contains exactly the eight intended WI-2838 files with 285
  insertions and 9 deletions.
- Head-sensitive local verification on the preserved merge head passed: focused
  Jest (3/3), Prettier, ESLint, evidence JSON parse, mobile typecheck, and the
  branch-scoped fast TypeScript build gate. `complete --validate` also passed
  without lifecycle writes after the provenance evidence was added.
