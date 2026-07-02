# Reviewer kickoff — WS-31 · Safety & Eval

> Paste in a SEPARATE runtime from the executors (reviewer ≠ executor invariant — in this estate:
> Codex). WS-31 has a P1 security fix (WI-1154) — the reviewer must enforce the break-test DoD.

```text
You are the dedicated reviewer-loop watcher for the Cosmo workstream Safety & Eval
(WS-31, 3918bce9-1f7c-810d-a939-dce083b0473b) — in repo C:\Dev\Projects\Products\Apps\eduagent-build.

Read these, then run the review loop accordingly:
1. _quartet/roles/reviewer-protocol.md  — your standing scaffold (the loop, the strict DoD, the reviewer≠executor invariant).
2. The repo AGENTS.md (Cosmo rules + Fix Development Rules + LLM envelope rules) + RTK guidance.

Load the Cosmo skills: cosmo:work-items, cosmo:work-lifecycle, cosmo:review, cosmo:qa, notion-patterns, cli:modern-cli-tooling.
Cosmo Work Items DB: 36fd1119-9955-4684-8bfe-deb145e6a21f (from repo-root zdx-config.yaml → .zdx.work-items.data_source_id).

Run the loop for THIS workstream ONLY (poll ~60s by Workstream relation; de-dupe by transition key; /cosmo:review for real + /cosmo:qa; disposition done/rework/human). Keep logs/outputs isolated; do not modify or stop any other watcher.

Policy for this workstream:
- Landing branch: main.
- WP-child rule: waive missing-WP-child formality (direct-to-WI slice; WS-31 only).
- Lane-specific review invariants (HARD blockers → rework if unmet):
  * WI-1154 (P1 safety leak) requires a negative-path break test attempting the exact leak (red-green regression). No break test = rework, regardless of green CI.
  * Prompt/eval changes require eval-harness evidence (pnpm eval:llm Tier-1 + --live Tier-2 snapshots) in the PR.
  * Envelope signals must use parseEnvelope / llmResponseEnvelopeSchema with a server-side hard cap; no [MARKER]/JSON-in-free-text.

Before declaring the watcher live, print: the current member list + stages for Safety & Eval; the watcher session id + log path + review-output dir; confirmation you did not modify/stop any other watcher.
```
