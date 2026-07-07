# Quartet role charters — DRAFT for operator ratification

**Drafted:** 2026-07-06 · PM (program-manager:fable) · UQ track 2, scoped by FINDINGS-B B-36/B-37/B-38.
**Status: RATIFIED (operator, 2026-07-07; amendment: WIP N=4).** Binding at next session boundaries.
Landing into `_quartet/roles/charters/` via a WI (change-control gate), protocols thinned in the
same change-set.

## What a charter is (vs a protocol)

A **charter** is the one-page accountability spine of a role: ACCOUNTABLE-FOR (outcomes the role
answers for) / MANDATE (what it does by default, without asking) / MUST-ESCALATE (the exhaustive
list of what it may NOT decide). A **protocol** is the mechanics: checklists, schemas, boot
sequences. The charter is what a session reads to know *whether something is its job*; the protocol
is how to do it. Incident-scar one-liners stay in the charters WITH their motivating WI citations —
they are anti-rationalization accountability, not mechanics (B-37 warning).

## Shared conventions (apply to all three)

**The overlap rule.** Where two charters could both claim a duty, the tie-break is: **the role
closest to the work owns the act; the role above owns the gate.** Concretely: shepherd owns
dispatch inside its lane; orchestrator owns activation, cross-lane routing, and pipeline custody
of shepherd-less workstreams; reviewer owns disposition and nothing upstream of it. If a duty is
genuinely unclaimed after applying this rule, that is a charter defect — escalate it as such
(don't quietly absorb or quietly drop it).

**Escalation ladder.** executor → shepherd → orchestrator → PM (Operator Queue) → operator.
Escalate on **authority, not stakes** (C1 canon-gap / C2 out-of-remit / C3 irreversible-outward —
orchestrator-protocol's classifier, which all roles inherit). Check the precedent register first;
a covered question class is within remit — rule it yourself, citing the precedent.

**SLA floor.** A `needs-*` line is answered or explicitly parked-with-reason within one working
session of the addressee seeing it; a `blocked` line gets a first response within the same
session. Liveness: every role emits its heartbeat per the substrate convention; silence past
`expected_activity_by` + margin is treated as down, never as quiet work.

**Decision-log convention (operator-agreed shape).** Within-mandate but non-obvious decisions are
**logged-and-proceeded** — a substrate `decision` event (or outbox `decision` line) at the moment
of decision; never pre-blocked on approval. Ratification is **async**: the PM/operator reviews the
log; a rejected decision is unwound as rework and the ruling enters the **precedent register** so
the class is settled forward. A decision NOT logged is a breach even if it was correct.

**Adoption timing.** Charters bind at the next session boundary, never hot-swapped (standing
Quartet rule).
