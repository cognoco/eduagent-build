---
name: batch1-shepherd-lessons
description: "Durable orchestration lessons from shepherding Batch 1 (verified-learning engine, 2026-07-10/11) — reviewer ceremony, shared-checkout traps, deploy-time secret propagation"
metadata: 
  node_type: memory
  type: project
  originSessionId: bb8bb484-fdb3-4968-91d7-ebe5edaa53c4
---

Batch 1 (13 WIs, 14 PRs, 2026-07-10/11) shepherd lessons — each cost a rework round or incident:

- **Doppler→Worker propagation is DEPLOY-TIME ONLY.** Setting a prd secret/flag in Doppler does nothing until the next deploy's sync step (`deploy.yml` → wrangler secret bulk). Local `pnpm secrets:sync` is CI-only (unrendered wrangler placeholder). Every flag flip = Doppler set + deploy dispatch + environment-approval click.
- **Shared-checkout cwd trap:** agent bash cwd resets to the shared main checkout between calls — a bare `bun execute.ts complete` derives Fixed In from the WRONG HEAD (someone else's concurrent commit). Always `cd <worktree> && <cmd>` in ONE invocation for git-cwd-sensitive cosmo commands.
- **No-code WI evidence durability:** the autonomous reviewer cannot reach host-local scratchpad paths or gitignored corpora, and its harness pauses `revision_missing` on descriptive (non-commit) Fixed In. For evidence-only WIs: post key artifacts (metrics/log) VERBATIM as WI-page comments at completion time; expect a human close if the harness jams (producer-is-not-closer gate: pass `--actor human:operator`).
- **DIRTY PR = zero GitHub-Actions runs** (known); NEW: a red "Merge completeness check" from a stale test-merge is NOT fixed by rerun — GitHub only regenerates the merge ref when branch/base moves; use `gh pr update-branch`.
- **Reviewer ceremony bar** (bounces otherwise): scope rulings as comments ON THE WI PAGE before complete; AC text amended when rulings change scope; Bug ACs literally declare fails-without/passes-with; RED/GREEN outputs verbatim on the PR thread; head-SHA CI URLs (never squash SHA); independent non-producer receipts when the reviewer sandbox can't execute. Ops-type WIs (flips): the reviewer reads ACs literally — a "flip" WI cannot complete at mechanism-ready; the flip + observation must actually happen (or ACs be formally amended).
- **Reviewer sandbox is flaky** (4 infra holds in one day: Notion/GitHub ConnectionRefused, EROFS blocks jest, wrong runner): silence≠failure — answer Awaiting-Info with receipts + reset State to Active; it usually clears on re-pick. Findings captured estate-side (operator confirmed).
- Related: [[feedback_bg_while_true_watcher_is_write_only]], [[project_batch3_gotchas]].
