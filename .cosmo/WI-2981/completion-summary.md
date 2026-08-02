# WI-2981 completion summary

## What was done

Reworked the WI-2981 proof after independent review rejected the first
submission. The rejection was correct: the deterministic model's variant B fed
the scheduler three distinct SHA groups, so it never entered the same-group
replacement branch and never reproduced the baseline defect, and its retention
check compared set sizes — which held trivially whatever the workflow said.
Only that proof gap was fixed.

This change is **test-and-evidence only**. The CI workflow file is byte-identical
to the base branch; the production concurrency fix landed previously in the
merge of pull request 2897 (see
https://github.com/cognoco/eduagent-build/pull/2897) and its semantics are
untouched here.

## What changed

- `scripts/ci-concurrency-contract.test.ts`
  - Added a small dependency-free GitHub Actions expression evaluator (context
    paths, single-quoted strings, a format call, equality and negation
    operators, and operand-returning boolean operators with GitHub's falsy set)
    and used it to *derive* concurrency groups from the parsed workflow file
    instead of hand-writing them.
  - Replaced variant B with two tests that execute the defect: the pre-fix
    expression collapses all three main-push SHAs onto one shared main-ref
    group, and the third push displaces the pending middle SHA.
  - The workflow-derived counterpart asserts every SHA retained, by exact
    ordered value — no set-size comparisons anywhere.
  - The baseline and the current workflow run through the **same** evaluator,
    so the comparison is not a hand-written strawman.
  - Kept variants A and D and the OTA serialization and live-tip tests; kept PR
    cancellation but made it group-name agnostic so it asserts behavior and
    stays honest under mutation.
- `.cosmo/WI-2981/red-green.md` — rewritten (not appended) with the mutation
  proof, the RED tests named individually, and the withdrawn OTA claim.
- `.cosmo/WI-2981/evidence.json` — claims realigned to the live four-criterion
  acceptance set (previously mislabelled with six) and pointers made explicit
  `.cosmo/WI-2981/` paths instead of bare names.

## Verification

Commands run, with full transcripts and per-assertion outcomes recorded in
`.cosmo/WI-2981/red-green.md`:

- Focused contract suite against the current workflow — exit 0; outcome
  recorded in the GREEN section of the evidence file.
- Mutation experiment: only the concurrency group line was reverted to the
  pre-fix expression. The suite exited 1, and **the retention assertion itself
  failed** — the pending middle SHA was displaced. The PR-cancellation and OTA
  assertions were unaffected by the mutation, so the failure is attributable to
  the concurrency key alone. Each flipped assertion is named individually in
  the RED section of the evidence file.
- The workflow file was then restored, the suite exited 0 again, and a diff of
  the workflow file against the base branch is empty.
- Full scripts jest suite — exit 0.
- Repository workflow security guard — exit 0.
- Workflow YAML parses; Prettier reports no formatting diff on the changed
  files; a no-emit TypeScript check of the contract file exits 0.

## Caveats / Follow-ups

Caveats:

- GitHub-hosted rapid-merge racing was not executed; the contract is a
  deterministic model of GitHub's one-running plus one-pending queue, now bound
  to the real workflow expression so it cannot pass against the defective group.
- The earlier claim that a superseded OTA run still finishes successfully is
  **withdrawn**.
  The OTA job enables cancel-in-progress on its preview concurrency group, so a
  superseded OTA job can be cancelled outright. The real contract is that no
  stale publish occurs and the guard step itself exits 0 rather than failing.
- No claim is made about branch-protection required checks; that configuration
  is GitHub-side, not declared in this repo, and untouched here.
- The evaluator covers the operators these concurrency keys use; it is not a
  complete GitHub expression implementation and throws on unsupported syntax.

Follow-ups: none. The contract suite remains the regression guard for future CI
concurrency edits and will now fail behaviorally, not just on a string pin, if
the main group loses its SHA scoping.
