# WI-2981 completion summary

## What was done

Reworked the WI-2981 proof after independent review rejected the first
submission. The rejection was correct: the deterministic model's variant B fed
`schedule()` three *distinct* SHA groups (`ci-main-main-1/2/3`), so it never
entered the same-group replacement branch and never reproduced the baseline
defect, and its retention check compared set sizes — which held trivially
whatever the workflow said. Only that proof gap was fixed.

This change is **test-and-evidence only**. `.github/workflows/ci.yml` is
byte-identical to `origin/main`; the production concurrency fix landed
previously in `2b6ffb064` and its semantics are untouched.

## What changed

- `scripts/ci-concurrency-contract.test.ts`
  - Added a small dependency-free GitHub Actions expression evaluator (context
    paths, single-quoted strings, `format()`, `==`/`!=`, `!`, operand-returning
    `&&`/`||`, GitHub's falsy set) and used it to *derive* concurrency groups
    from the parsed workflow file instead of hand-writing them.
  - Replaced variant B with two tests that execute the defect: the pre-fix
    expression collapses `sha-1/2/3` onto one `ci-refs/heads/main` group, and
    `sha-3` displaces pending `sha-2` (retained `['sha-1','sha-3']`).
  - The workflow-derived counterpart asserts all three SHAs retained by exact
    ordered value — no set-size comparisons anywhere.
  - The baseline and the current workflow run through the **same** evaluator,
    so the comparison is not a hand-written strawman.
  - Kept variants A and D and the OTA serialization/live-tip tests; kept PR
    cancellation but made it group-name agnostic so it asserts behavior and
    stays honest under mutation.
- `.cosmo/WI-2981/red-green.md` — rewritten (not appended) with the mutation
  proof, the RED tests named individually, and the withdrawn OTA claim.
- `.cosmo/WI-2981/evidence.json` — claims realigned to the live AC1–AC4 set
  (previously mislabelled AC-1..AC-6) and pointers made explicit
  `.cosmo/WI-2981/...` paths instead of bare names.

## Verification

- Current workflow: **13/13 passed**, exit 0.
- Mutation (only the concurrency `group:` line reverted to the pre-fix
  expression): **5 failed / 8 passed**, exit 1. The retention assertion itself
  failed — expected `['sha-1','sha-2','sha-3']`, received `['sha-1','sha-3']`.
  PR cancellation and all OTA tests stayed green, so the RED is attributable to
  the concurrency key alone.
- Restored via `git checkout -- .github/workflows/ci.yml`;
  `git diff origin/main -- .github/workflows/ci.yml` is empty; rerun 13/13.
- `pnpm run test:scripts` — 74 suites passed (1 skipped), 1248 tests, exit 0.
- `pnpm check:github-workflow-security` passed; workflow YAML parses; Prettier
  clean; `tsc --noEmit` on the contract test exit 0.

## Caveats / Follow-ups

Caveats:

- GitHub-hosted rapid-merge racing was not executed; the contract is a
  deterministic model of GitHub's one-running/one-pending queue, now bound to
  the real workflow expression so it cannot pass against the defective group.
- The earlier claim that a superseded OTA run "remains green" is **withdrawn**.
  `ota-update` sets `cancel-in-progress: true` on the `ota-preview` group, so a
  superseded OTA job can be cancelled outright. The real contract is that no
  stale publish occurs and the guard step itself exits 0 rather than failing.
- No claim is made about branch-protection required checks; that configuration
  is GitHub-side, not declared in this repo, and untouched here.
- The evaluator covers the operators these concurrency keys use; it is not a
  complete GitHub expression implementation and throws on unsupported syntax.

Follow-ups: none. The contract suite remains the regression guard for future CI
concurrency edits and will now fail behaviorally, not just on a string pin, if
the main group loses its SHA scoping.
