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

## Hosted exact-head aggregate

GitHub Actions E2E Web run `30222631190` executed on exact head
`aaff1546c8d1e241bf56016bdd3c23988dac0a6e` after the base synchronization and
provenance-only commit. It completed strict green:

- V2 release: 16/16 passed in 3.5 minutes, including both the WI-2234
  returning-learner journey and the nav-shell journey;
- classifier: `FAILURE_CLASS=success`, `GATE_DECISION=pass`;
- required-stable legacy Playwright: 24/24 passed;
- `run-smoke` and the required `Playwright web smoke` check concluded success.

The exact head does not contain WI-2822 commit `c0002155`; the hosted result is
therefore independent WI-2838 strict-green evidence, not a combined or skipped
suite.

## Hosted bounce and corrected lifecycle

GitHub Actions E2E Web run `30223075316` on later exact head `fe52d114` exposed
the remaining lifecycle mismatch. The WI-2234 journey timed out at
`page.waitForResponse` on both the initial attempt and workflow retry; the gate
reported `FAILURE_CLASS=product` and `GATE_DECISION=fail`. One unrelated
homework case was flaky and passed its retry; 14 other V2 cases passed.

The deterministic focused seam reproduced that a later response Request wrapper
can retain the original URL after `route.continue({ url })`. It exited 1 with
the expected `true` versus received `false`. The corrected route-owned
fetch/fulfill seam then exited 0 with 4/4 cases passing. Fresh Prettier, ESLint,
and mobile typecheck gates passed. The corrected named staging journey passed
3/3 with one worker, retries disabled, and no dependency projects.

The corrected complete V2 release project was then rerun with retries disabled
and normal four-worker parallelism. The WI-2234 journey passed; the result was
15/16 with only the same independently owned WI-2822 nav-shell stale-doorway
assertion failing. No WI-2838 failure remained in the local aggregate run.

## Scope audit

- No timeout value changed.
- No retries were added or widened.
- No product assertion was removed.
- The route-owned response wait retains the prior 15-second bound, clears its
  timer on success or failure, and emits a specific timeout diagnostic.
- The Session-held boundary, response success/freshness, Mentor arrival, and
  both exact returning-learner card assertions remain in the named journey.

## Exact-head provenance after base synchronization

PR #2664 was externally advanced after the executor published `732b684`.
The executor did not author or initiate the merge and did not reset, rebase, or
force-push it. The base-synchronization merge head is
`d3caddaa3ece0a187cc3b34ec3625f3c6aebbb3c`; provenance-only commit `aaff1546`
then recorded that event and became the hosted strict-green evidence head.

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

## Subsequent head provenance

Evidence-only commit `8256149708720c35054ae9f8afb8f680a5163e87` followed
`aaff1546`, then merge commit `fe52d114192d15373ef5ba215c19b19e3e24ebda`
added current `origin/main` as second parent
`69b1818a6bf0674af1cb3d01c01fbf394952f3dc`. GitHub PushEvent actor was
`jojorgen`; both commits use the shared Lord Vetinari Git identity, so repository
evidence cannot distinguish the initiating local session. The merge added only
six `zdx-config.yaml` lines from main. The three WI E2E code-file diff hashes
before and after that merge were identical:
`df8b8db132d35dbbf8390bb5669df1538cd6d23482cba8ba2cc9d20a362b082e`.
