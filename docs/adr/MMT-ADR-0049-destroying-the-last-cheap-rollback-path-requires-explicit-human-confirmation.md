# MMT-ADR-0049 — Destroying the last cheap rollback path requires explicit human confirmation that names the loss

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** Agent and automation authority over migration steps that remove a rollback mechanism · **Deciders:** pending Architecture sign-off

## Context

A staged migration usually keeps its predecessor alive behind a flag. While both paths exist, reverting is a build-time flag flip and, where the change is client-side, an over-the-air update measured in minutes. That cheapness is what makes the migration safe to advance: each stage can be undone by someone who notices a problem, without a rebuild and without a coordinated release.

The final stage of such a migration is different in kind, not in degree. Deleting the superseded code paths and promoting the successor to default is the step that removes the flag flip. After it, rollback means reverting source and rebuilding — a different order of cost, a different set of people, and a different timescale. Every prior stage is a decision that can be revisited; this one closes the option.

The operating default elsewhere is that an agent proceeds without asking, on the grounds that stopping to confirm routine work wastes the human's attention. That default is correct precisely because the work is reversible. Applied to the step that ends reversibility it inverts: the cost of a wrong autonomous action is no longer a quick undo, and the human's attention is cheap relative to what is being spent.

Compounding this, the readiness signals that gate the earlier stages measure whether the successor *works*. They cannot measure whether the organisation is ready to stop being able to retreat, which is a judgement about risk appetite rather than a fact about the code.

## Decision

1. **A step that removes the last cheap rollback path is not autonomously executable.** Where a change deletes the mechanism by which a migration could previously be reverted, an agent must stop and obtain explicit human confirmation before any destructive action.

2. **The confirmation request must name the loss in plain terms.** It states which fallback paths are being deleted, that the flag-based route back will no longer exist, and that rollback afterwards requires reverting source and rebuilding. A request that asks for approval without stating what is being given up does not satisfy this decision.

3. **Green readiness gates do not substitute for the confirmation.** Passing every technical precondition establishes that the successor is ready, not that the fallback should be destroyed. The two are separate questions and only the second is being asked here.

4. **Going live and retiring the predecessor are two decisions, not one.** They are separated by a deliberate validation window during which the successor serves traffic while the retreat path still exists. Bundling them forfeits the window, which is the only period in which a real-world problem can be cheaply undone.

5. **The rule keys on the loss of reversibility, not on the name of any particular migration.** Any change that deletes a fallback, removes a flag's off-state, or otherwise makes an in-place revert impossible is in scope, whether or not it is part of a planned cutover.

6. **Where reversibility is already absent, this decision does not restore it.** Some changes — notably data migrations — are not flag-reversible at any stage. Those carry their own handling; clause 1 is about not silently spending a rollback path that still exists.

## Consequences

- The default autonomous posture acquires a narrow, well-defined exception. It is scoped by a property of the change rather than by a list of surfaces, so it does not erode into general permission-seeking, and an agent can evaluate it without a judgement call about importance.
- Superseded code paths stay alive longer than they are needed, carrying maintenance cost and a standing instruction not to tidy them. That cost is accepted as the price of the validation window.
- Because the confirmation must state the loss, an approval is on the record as informed. A human who approves has been told what disappears.
- Clause 4 makes the validation window a planning artifact rather than an intention: work that assumes the predecessor is gone cannot be scheduled against the go-live date.
- The scope test in clause 5 requires the author of a change to ask whether it removes a rollback path — which is not always obvious, and is the clause most likely to be missed on a change that is not labelled as a cutover.

## Alternatives considered

- **Rely on the readiness gates and execute autonomously once they pass.** Rejected under clause 3: the gates answer a different question, and passing them is exactly the moment at which the mistake becomes most tempting.
- **Treat the deletion as ordinary work under the general no-need-to-ask posture.** Rejected: that posture is justified by reversibility, so applying it to the step that removes reversibility uses the rule outside the conditions that make it sound.
- **Delete the fallbacks at go-live to avoid carrying dead code.** Rejected under clause 4: it collapses two decisions into one and removes the validation window at precisely the moment real traffic first exercises the successor.
- **Require confirmation for all destructive operations.** Rejected as too broad: routine reversible deletions would be swept in, the exception would fire constantly, and a confirmation that fires constantly stops being read.
