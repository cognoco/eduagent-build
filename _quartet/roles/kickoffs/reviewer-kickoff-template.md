# Reviewer Kickoff — standard template

**What this is.** The paste-able launcher for spawning a per-workstream **reviewer** session.
Thin: points at `roles/reviewer-protocol.md` + the workstream + its policy. Swap the
«placeholders». The reviewer runs a **different runtime from the executors** (in this estate:
Codex). It is the review corner of the **Quartet** and stays context-agnostic — it signals only
through Cosmo Stage and does **not** read the **Clacks**. Not yet a slash command.

> Paths are relative to the `_quartet/` root; adjust the prefix per checkout.

## Template (swap the «placeholders»)

```text
You are the dedicated reviewer-loop watcher for the Cosmo workstream «WORKSTREAM NAME»
(WS-«N», «WORKSTREAM-ID») — in repo «REPO ROOT».

Read these, then run the review loop accordingly:
1. _quartet/roles/reviewer-protocol.md  — your standing scaffold (the loop, the strict DoD, the reviewer≠executor invariant).
2. The repo AGENTS.md (Cosmo rules) + RTK guidance.

Load the Cosmo skills: cosmo:work-items, cosmo:work-lifecycle, cosmo:review, cosmo:qa, notion-patterns, cli:modern-cli-tooling.
Cosmo Work Items DB: «WORK-ITEMS-DB-ID» (from repo-root zdx-config.yaml → .zdx.work-items.data_source_id; see _quartet/dependencies.md).

Run the loop for THIS workstream ONLY (poll ~60s by Workstream relation; de-dupe by transition key; /cosmo:review for real + /cosmo:qa; disposition done/rework/human). Keep logs/outputs isolated; do not modify or stop any other watcher.

Policy for this workstream:
- Landing branch: «main | «feature-branch»».
- WP-child rule: «standard | waive missing-WP-child formality (dogfood — approved for this workstream only)».
- Lane-specific review invariant (if any): «e.g. canon wins — a change conforming to the source plan but diverging from canon is rework».

Before declaring the watcher live, print: the current member list + stages for «WORKSTREAM NAME»; the watcher session id + log path + review-output dir; confirmation you did not modify/stop any other watcher.
```
