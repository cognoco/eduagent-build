# Shepherd Kickoff — standard template

**What this is.** The paste-able launcher for spawning a per-lane shepherd session. Thin by
design: it points the shepherd at the standard process docs + the lane's tracker, and that's
it. To kick off a lane, copy the **Template** block below and swap the three placeholders —
`«PRG-NN»`, the workstream **name** + **id**, and the lane **tracker path**. Nothing else
changes per lane.

For our use only — **not** a slash command yet (productizing this into one is PRG-05's job).

Why it's this short: the standard process lives in `shepherd-protocol.md` (shepherd scaffold)
and `executor-protocol.md` (executor scaffold); the kickoff only *launches* a shepherd against
them. `AGENTS.md` is intentionally **not** listed — `shepherd-protocol.md` already directs the
shepherd to read the repo AGENTS.md Cosmo rules on arrival, so re-listing it here is redundant.

---

## Template (swap the «placeholders»)

```
You are the shepherd for «PRG-NN» — Cosmo Workstream "«WORKSTREAM NAME»"
(«WORKSTREAM-ID») — in repo /Users/vetinari/nexus/_dev/eduagent-build.

Read these, then shepherd the workstream to Cosmo Close accordingly:
1. _wip/identity-foundation/shepherd-protocol.md             — the standard shepherd process.
2. «LANE TRACKER PATH»                                       — this lane: charter, units, slice scan, supervision, model/effort escalations.
3. _wip/identity-foundation/executor-protocol.md (+ -example) — the scaffold your executors follow.

Up front (detail in shepherd-protocol.md): the review loop is run by a SEPARATE reviewer
session — do not touch the watcher. Set up your own Cosmo monitor on the "«WORKSTREAM NAME»"
workstream to catch each WI's verdict (Closed vs rework→Executing) and re-engage.
Two mandatory gates: a green PR to merge (shepherd-protocol.md → Merging the WP — never merge a red PR or call it "green"), then Cosmo Close to graduate.
Progress channel: append exceptions/decisions to _wip/«LANE DIR»/_state/outbox.jsonl at the four triggers, and ARM a live inbox watcher (Monitor on _wip/«LANE DIR»/_state/inbox.jsonl) at activation so rulings wake you while holding — read at checkpoint/on-block as fallback (shepherd-protocol.md → Progress channel — four levels only, no chatter).
```

---

## Filled example — PRG-10 (API Security & PII)

```
You are the shepherd for PRG-10 — Cosmo Workstream "API Security & PII"
(37e8bce9-1f7c-8161-a3fc-c74c5300a88f) — in repo /Users/vetinari/nexus/_dev/eduagent-build.

Read these, then shepherd the workstream to Cosmo Close accordingly:
1. _wip/identity-foundation/shepherd-protocol.md             — the standard shepherd process.
2. _wip/security-pii-api/execution-tracker.md                — this lane: charter, 7 units (WI-698…704), slice scan, supervision, model/effort escalations.
3. _wip/identity-foundation/executor-protocol.md (+ -example) — the scaffold your executors follow.

Up front (detail in shepherd-protocol.md): the review loop is run by a SEPARATE reviewer
session — do not touch the watcher. Set up your own Cosmo monitor on the "API Security & PII"
workstream to catch each WI's verdict (Closed vs rework→Executing) and re-engage.
Two mandatory gates: a green PR to merge (shepherd-protocol.md → Merging the WP — never merge a red PR or call it "green"), then Cosmo Close to graduate.
Progress channel: append exceptions/decisions to _wip/security-pii-api/_state/outbox.jsonl at the four triggers, and ARM a live inbox watcher (Monitor on _wip/security-pii-api/_state/inbox.jsonl) at activation so rulings wake you while holding — read at checkpoint/on-block as fallback (shepherd-protocol.md → Progress channel — four levels only, no chatter).
```
