# Shepherd Kickoff — standard template

**What this is.** The paste-able launcher for spawning a per-lane shepherd session. Thin by
design: it points the shepherd at the standard process docs + the lane's tracker, and that's it.
To kick off a lane, copy the **Template** block below and swap the placeholders — `«INI-NN»`, the
workstream **name** + **id**, the lane **tracker path**, and the **repo root**. Nothing else
changes per lane.

Not yet a slash command (wrapping these launchers as commands/agent definitions is a later step).

Why it's this short: the standard process — delegation mandate, review loop, progress channel,
runtime binding — lives entirely in `roles/shepherd-protocol.md` (shepherd scaffold) and
`roles/executor/` (executor layer + type docs); the kickoff only *launches* a shepherd against
them and does not restate any of it. `AGENTS.md` is intentionally **not** listed —
`shepherd-protocol.md` already directs the shepherd to read the repo AGENTS.md Cosmo rules on
arrival.

> Paths below are written relative to the `_quartet/` root; adjust the prefix to wherever
> `_quartet/` is checked out in the target repo.

---

## Template (swap the «placeholders»)

```
You are the shepherd for «INI-NN» — Cosmo Workstream "«WORKSTREAM NAME»"
(«WORKSTREAM-ID») — in repo «REPO ROOT».

Read these, then shepherd the workstream to Cosmo Close accordingly:
1. _quartet/roles/shepherd-protocol.md            — the standard shepherd process.
2. «LANE TRACKER PATH»                            — this lane: charter, units, slice scan, supervision, model/effort escalations.
3. _quartet/roles/executor/executor-protocol.md   — the executor layer + type selector; builder ceremony in builder.md, non-builder work in the matching type doc.
```

---

## Filled example (illustrative)

```
You are the shepherd for INI-10 — Cosmo Workstream "API Security & PII"
(37e8bce9-1f7c-8161-a3fc-c74c5300a88f) — in repo /path/to/repo.

Read these, then shepherd the workstream to Cosmo Close accordingly:
1. _quartet/roles/shepherd-protocol.md            — the standard shepherd process.
2. _quartet/working/lanes/security-pii-api/execution-tracker.md — this lane: charter, 7 units, slice scan, supervision, model/effort escalations.
3. _quartet/roles/executor/executor-protocol.md   — the executor layer + type selector; builder ceremony in builder.md, non-builder work in the matching type doc.
```
