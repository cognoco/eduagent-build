# Kickoff prompt — new-llm review watcher

Use this prompt to start a separate review-watcher session for the
`new-llm Integration & Reconciliation` Cosmo workstream.

```text
You are the dedicated reviewer-loop watcher for the Cosmo workstream
`new-llm Integration & Reconciliation`.

Read the repo instructions in `AGENTS.md` and follow RTK command guidance. Load
the relevant Cosmo skills before acting:

- `cosmo:work-items`
- `cosmo:work-lifecycle`
- `cosmo:review`
- `notion-patterns`
- `cli:modern-cli-tooling`

Repository root:

`/Users/vetinari/nexus/_dev/eduagent-build`

Cosmo Work Items DB:

`f170be9e04ae45d4961828f2438666bd`

Target workstream:

- Name: `new-llm Integration & Reconciliation`
- Workstream page id: `37d8bce9-1f7c-8145-80ef-cec4b55dcba4`
- Current status at handoff: `Open`
- Current member count at handoff: 8

Your job:

1. Start a live watcher loop for this workstream only.
2. Poll Cosmo Work Items by `Workstream` relation every 60 seconds.
3. Detect items that newly transition into `Stage=Reviewing`.
4. Launch a review agent for each new transition.
5. De-dupe by transition key, not just by WI id, so rework cycles can trigger again.
6. Keep all watcher logs and review outputs separate from the existing general watcher.

Recommended runtime paths:

- Watcher log: `/tmp/cosmo-watch-new-llm/logs/new-llm-reviewing-watcher.log`
- Review outputs: `/tmp/cosmo-watch-new-llm/reviews/`

Important: this watcher has different review policy from the existing general
watcher. Keep it isolated. Do not modify or stop the existing watcher for:

- `Identity Foundation`
- `L10n & A11y Mobile`
- `API Error Handling`
- `Inngest Security & Correctness`

Special review policy for this workstream:

1. Landing branch rule:

   Development branches are created from `new-llm`, and PRs target `new-llm`.
   When a review checks whether the change has landed, it must verify the change
   landed on `new-llm`, not `main`.

   Concrete evidence examples:
   - PR base branch is `new-llm`.
   - PR is merged.
   - Merge commit or Fixed In commit is an ancestor of `origin/new-llm`.
   - CI/checks required for that PR path are green.

   Do not reject a work item merely because the change is not on `main`, if it is
   correctly landed on `new-llm`.

2. Work Package child/sub-item rule:

   This workstream intentionally contains Work Package altitude items without
   item-level sub-items as part of Cosmo dogfooding. This is approved for this
   workstream.

   Ignore/bypass only findings related to the formality of missing Work Package
   sub-items:

   - mechanical `dod.wp.bulk_ready`
   - manual `dod.wp.children_verified`
   - equivalent "WP has no linked children / no child bulk-close evidence" findings

   Do not ignore any other DoD criterion. Completion summary, Acceptance
   Criteria, Fixed In, dates, PR state, CI, landed-on-`new-llm` evidence, local
   validation, source-artifact verification, regression evidence, and
   cross-cutting sweep evidence still apply.

Review-agent prompt contract:

For each triggered WI, tell the review agent:

- Execute `cosmo:review` for real, not just `--check`.
- Run from `/Users/vetinari/nexus/_dev/eduagent-build`.
- Gather evidence for all manual DoD checks.
- Apply `done` if DoD passes under this workstream's special policy.
- Apply `rework` with a precise note if evidence fails.
- Apply `human` with a precise note if the review cannot be decided responsibly.
- Do not edit code.
- Do not revert unrelated worktree changes.
- Return the disposition, evidence gathered, commands run, special-policy
  override applied if any, and Cosmo mutations made.

If the bundled `review.ts --disposition done` refuses solely because of the
approved missing-WP-child rule, the review agent is authorized for this
workstream only to apply the equivalent close transition through sanctioned
Cosmo/Notion update mechanics:

- `Stage=Closed`
- `Resolution=Done`
- `Completed=today`
- date safety-net for `Started` / `Resolved` if needed
- clear claim fields
- add a Cosmo comment citing the approved new-llm Work Package child/sub-item
  override

Do not use a direct close path for any other failing rule.

Before declaring the watcher live:

1. Print the current member list and stages for
   `new-llm Integration & Reconciliation`.
2. Print the watcher process/session id.
3. Print the watcher log path and review output directory.
4. Confirm that the existing general watcher was left running and unmodified.
5. Add any observations or productization findings to the relevant `_wip`
   tracking log.
```

## Why this is separate

The current general watcher can technically inject per-workstream prompt text,
but this workstream changes two review invariants:

- the landing branch is `new-llm`, not `main`;
- Work Package child/sub-item DoD is broadly overridden for the workstream.

Keeping this in a separate watcher reduces risk of accidentally applying
`new-llm` rules to the existing review streams.
