# PRG-06 "Identity Cutover" — Shepherd Kickoff (standard launcher)

> Standard thin launcher per `_wip/identity-foundation/shepherd-kickoff-template.md`. The role,
> the review-loop, the channel mechanics, and the Cosmo lifecycle all live in
> `shepherd-protocol.md` — this file only *launches* a shepherd against it. **Operator-launched**
> (planning-reference §2.5): the orchestrator authors this; Jorn spawns the session by pasting
> the block below.

## Launch model — prime-and-hold (this lane is gated)
This lane has a launch precondition: the **ADR-0020/0021/0022 cleanup** (reverse-engineered from
S0–S6; re-vetted in a separate session) must be **operator-confirmed complete** before execution.
So the shepherd can be launched **early**: it primes (reads its scaffold, arms its inbox watcher
+ Cosmo monitor, confirms the reviewer covers WS-18) and then **holds**, waiting on the channel
for the orchestrator's go — rather than the operator timing the spawn to the gate. Release is an
inbox `directive` ("ADR gate cleared — proceed").

## The launcher (paste to spawn the shepherd session)

```text
You are the shepherd for PRG-06 — Cosmo Workstream "Identity Cutover"
(WS-18, 3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8) — in repo /Users/vetinari/nexus/_dev/eduagent-build.

Read these, then shepherd the workstream to Cosmo Close accordingly:
1. _wip/identity-foundation/shepherd-protocol.md              — the standard shepherd process (your scaffold).
2. _wip/identity-cutover/execution-tracker.md                 — this lane: charter, canon authority, slice (WP-1 = WI-765 enumeration first), launch gate, escalations.
3. _wip/identity-foundation/executor-protocol.md (+ -example) — the scaffold your executors follow; the brief shape you hand them.

Standing rule for this lane (also in the tracker): CANON WINS — the canonical architecture / identity-foundation design / specs / trusted ADRs / the to-be data model are the authority. S0–S6 design choices are NOT canonical: reconcile the app code TO canon, do not inherit S0–S6. A change that conforms to S0–S6 but diverges from canon is wrong.

Up front (detail in shepherd-protocol.md): the review loop is run by a SEPARATE reviewer session — do not touch/own the watcher; confirm it covers "Identity Cutover" (WS-18) before relying on verdicts. Set up your own Cosmo monitor on the "Identity Cutover" workstream to catch each WI's verdict (Closed vs rework→Executing) and re-engage.
Two mandatory gates: a green PR to merge (shepherd-protocol.md → Merging the WP — never merge a red PR or call it "green"), then Cosmo Close to graduate.
Progress channel: append exceptions/decisions to _wip/identity-cutover/_state/outbox.jsonl at the four triggers only, and ARM a live inbox watcher (Monitor on _wip/identity-cutover/_state/inbox.jsonl) at activation so rulings wake you while holding — read at checkpoint/on-block as fallback (shepherd-protocol.md → Progress channel).

LAUNCH GATE — PRIME AND HOLD: this lane is gated on the ADR-0020/0021/0022 cleanup. On arrival, PRIME ONLY — read the above, arm the inbox watcher + the Cosmo monitor, confirm the reviewer covers WS-18 — then emit ONE outbox `decision` line ("primed; holding for ADR-gate release") and HOLD. Do NOT claim or refine WP-1 (WI-765) until an orchestrator inbox `directive` ("ADR gate cleared — proceed") or a direct operator go arrives. First substantive work once released: refine WP-1 (WI-765) Backlog→Ready, then dispatch the enumeration (fold the pre-graph 401 fix de8df6e86 in as slice-1) per the tracker §4.
```
