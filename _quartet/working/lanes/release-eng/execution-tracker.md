# Release engineering — Execution Tracker

> The lane's substance. The Shepherd protocol
> (`../../../roles/shepherd-protocol.md`) carries process only and points here for
> specifics. **Disposable by construction:** a fresh Shepherd pointed at this
> tracker should lose nothing but warm cache. This tracker is not a membership,
> lifecycle, claim, gate, or GitHub authority.

## Charter

Drive **`BID-42` — Release engineering: activation instrumentation, RevenueCat,
and push credentials; formed delivery batch; live relation is authoritative**
through its release-engineering gates until every live Delivery Batch member is
independently reviewed and Closed/Done, with external/operator gates surfaced
without idling the rest of the batch.

## Canon authority

The [live BID-42 page and Brief](https://www.notion.so/3a58bce91f7c8122ba4cf7fc3079d5a3)
define batch intent. Its **live Delivery Batch relation is the sole membership
authority**. Never treat a member list in this file, a local handoff, a monitor
snapshot, or an executor report as authoritative membership.

The committed topology declaration is
[`topology-mentomate-003` — full MentoMate topology; release-eng lane owns
WS-54; stable](https://github.com/cognoco/nexus/blob/main/_quartet/working/program/program-roster.md).
Its schema and invariants live in the
[Quartet topology mode contract](https://github.com/cognoco/nexus/blob/main/_quartet/topology-mode-contract.md).
The live declaration and operator rulings outrank this tracker.

For each Work Item, its live Cosmo properties, page body, and discussion own
lifecycle state, gates, and execution evidence. GitHub owns commit, PR, check,
and merge facts. The batch Brief owns the rule to record an exact operator ask
at a human gate and continue with the next non-colliding member.

## How to use

Read the live BID-42 Brief first, query the complete Delivery Batch relation,
then compare the result with the timestamped observation below. Follow the
member page/discussion and GitHub pointers for current gates and evidence.
Resolve the next action from the live `Stage` + `State` + claim tuple under the
Shepherd and executor protocols; do not route from cached prose or `Workflow
Status`. After every membership ruling, executor hand-back, claim-expiry event,
PR transition, review verdict, or Close, update the observed checkpoint and the
Shepherd-owned runtime pointers named below.

## Pointers

- Batch membership and intent:
  [BID-42 live Brief and relation](https://www.notion.so/3a58bce91f7c8122ba4cf7fc3079d5a3).
  Query Work Items data source
  `36fd1119-9955-4684-8bfe-deb145e6a21f` where `Delivery Batch` contains page
  `3a58bce9-1f7c-8122-ba4c-f7fc3079d5a3`; paginate until `has_more=false`.
- Cosmo Workstream:
  [**`WS-54` — Store, Billing & Release; open Workstream; broader than BID-42**](https://www.notion.so/39e8bce91f7c814a92d7efcdd7cb43a9).
  The Workstream is a lane lens, not batch membership authority.
- Topology:
  [`cognoco/nexus:_quartet/working/program/program-roster.md`](https://github.com/cognoco/nexus/blob/main/_quartet/working/program/program-roster.md)
  and
  [`cognoco/nexus:_quartet/topology-mode-contract.md`](https://github.com/cognoco/nexus/blob/main/_quartet/topology-mode-contract.md).
- Process:
  [`planning-rules.md`](../../../planning-rules.md),
  [`roles/shepherd-protocol.md`](../../../roles/shepherd-protocol.md),
  [`roles/executor/executor-protocol.md`](../../../roles/executor/executor-protocol.md),
  and [`roles/executor/builder.md`](../../../roles/executor/builder.md).
- GitHub truth:
  [open and merged pull requests for `cognoco/eduagent-build`](https://github.com/cognoco/eduagent-build/pulls).
  Read the PR and exact-head checks rather than inferring state from Cosmo's
  `PR` or `Pipeline` cache.
- Durable executor evidence:
  each live Work Item discussion plus
  `/Users/vetinari/nexus/.cosmo-watch/release-eng/executors/<WI-ID>/`.
  Prefer the latest `execution-*-last-message.md` or `last-message.md`, then
  verify its claims against Cosmo/GitHub.
- Shepherd runtime:
  `/Users/vetinari/nexus/.cosmo-watch/release-eng/SESSION-HANDOFF.md` and
  `/Users/vetinari/nexus/.cosmo-watch/release-eng/monitor-manifest.json`.
  These are Shepherd-owned, gitignored runtime state; they point here and never
  replace this tracker.

### Runtime consistency contract

The Shepherd must add the exact repo-relative pointer
`_quartet/working/lanes/release-eng/execution-tracker.md` to both runtime
artifacts. `SESSION-HANDOFF.md` must begin its resume path with that pointer and
must describe membership as a timestamped live-relation observation, not a
fixed three- or seven-member authority. `monitor-manifest.json` must retain a
dynamic stage monitor over the BID-42 Brief, Status, Delivery Batch relation,
and every member returned by that relation, and add top-level
`"tracker": "_quartet/working/lanes/release-eng/execution-tracker.md"`.
Whenever either runtime artifact disagrees with live Cosmo/GitHub, update the
runtime artifact; never edit this tracker to preserve stale runtime prose.

## Units / slice

**Observed snapshot only — not membership authority.** Direct live-relation
query at `2026-07-24T14:49:08Z`: eight rows, `has_more=false`. Re-query before
acting.

| WI | Altitude | Observed lifecycle / ownership | Evidence and current gate | Next ordinary action |
|---|---|---|---|---|
| [WI-1328 — RevenueCat production monetization setup](https://www.notion.so/3928bce91f7c81c1aadbdf0ec5315671) | WP | Executing/Active; `codex:general:WI-1328-r2`; worktree `WI-1328`; claim expired at 11:42Z | Latest WI discussion and `executors/WI-1328/execution-r2-last-message.md`; [PR #2516](https://github.com/cognoco/eduagent-build/pull/2516) merged as `ee9f3e339`; Play access plus WI-2704/WI-2705 remain | Shepherd runs the expired-claim liveness/recovery discriminator; after WI-2704 and WI-2705 land/Close and the recorded Play gate clears, resume the parent proof, then normal completion/review |
| [WI-1337 — Push notification production credentials](https://www.notion.so/3928bce91f7c81fc9fe6e8d2bb399548) | Item | Closed/Done; no claim/worktree | Live completion summary, evidence manifest, discussion, and Fixed In | Terminal member: no execution action; include in batch-close accounting |
| [WI-1588 — Activation instrumentation and LLM kill-switch verification](https://www.notion.so/3938bce91f7c81f68067daee7de1ffe0) | Item | Executing/Active; `codex:general:WI-1588-r2`; worktree `WI-1588`; claim expired at 11:42Z | Latest WI discussion and `executors/WI-1588/last-message.md`; only the external daily-volume alert remains | Shepherd runs the expired-claim liveness/recovery discriminator; after WI-2706 proves alert delivery, reconcile the parent AC and continue through normal completion/review |
| [WI-2686 — Materialize this canonical tracker](https://www.notion.so/3a68bce91f7c81839586e2ae8edfbfef) | Item | Executing/Active; `codex:builder:WI-2686-r1`; worktree `WI-2686`; claim live to 17:22Z | WI discussion, branch `WI-2686`, and `executors/WI-2686/execution-r1-last-message.md` | Builder delivers the strict-green tracker PR; Shepherd handles the ordinary merge boundary, then lifecycle completion/review |
| [WI-2704 — Accept RevenueCat Google base-plan identifiers](https://www.notion.so/3a78bce91f7c81a58916ecf441ad4823) | Item | Executing/Active; `codex:builder:WI-2704-r1`; worktree `WI-2704`; claim live at observation | WI discussion and branch/PR at exact head; Adversarial review tier | Builder delivers a strict-green PR and stops at the merge boundary; after authorized landing, continue completion/review before the colliding WI-2705 slice |
| [WI-2705 — Bounded RevenueCat sandbox-to-entitlement verification](https://www.notion.so/3a78bce91f7c818c8f6de2e582c1bc77) | Item | Ready/Active; unclaimed | Live AC and discussion; Adversarial review tier; overlaps the RevenueCat webhook surface | Once WI-2704 clears the collision and lane WIP has capacity, claim and dispatch a typed Builder; land/Close before resuming WI-1328's sandbox proof |
| [WI-2706 — Daily LLM-volume threshold alert delivery](https://www.notion.so/3a78bce91f7c8195839ce635aa8bc9ab) | Item | Executing/Active; `codex:general:WI-2706-r1`; workspace recorded as `cognoco/eduagent-build@main`; claim live to 17:10Z | WI discussion and `executors/WI-2706/`; live evidence exposed the missing source-to-alert transport captured as WI-2717 | Preserve the partial hand-back and hold the alert-rule proof until WI-2717 lands source-to-sink evidence; then resume bounded rule/read-back/firing/delivery/cleanup proof |
| [WI-2717 — Route the daily LLM-volume threshold signal into an alertable production sink](https://www.notion.so/3a78bce91f7c81118c70db2e05bef41e) | Item | Executing/Active; `codex:builder:WI-2717-r1`; worktree `WI-2717`; claim live to 17:47Z | Live AC/discussion; Adversarial review tier; hard prerequisite for WI-2706 and WI-1588 | Builder preserves the canonical PII-free signal, proves and deploys one authorized source-to-sink transport, and returns landed/deployment/synthetic evidence before either dependent resumes |

Slice scan: the live relation currently contains the original three release
members plus five formally admitted execution findings. Rows named as excluded
in the BID-42 Brief remain valid work outside this batch and must not appear
here unless a later authoritative Brief-and-relation amendment admits them.

For any newly admitted member absent from this observation: fetch its live page
and discussion, add a timestamped row at the next checkpoint, and apply the
ordinary protocol action for its live axes (`Ready/Active` → non-colliding
claim/dispatch; `Executing` → claim/worktree liveness; `Reviewing`/`In Review`
→ verdict monitor; `Closed/Done` → terminal accounting). A non-Active State or
recorded gate overrides that default and must be followed from the live page.

## Sequence

- WI-2686 and the WI-2717 → WI-2706 → WI-1588 chain are independent of the
  RevenueCat code path.
- Finish and land WI-2704 before dispatching the overlapping WI-2705 webhook
  slice; both must Close before WI-1328's controlled purchase proof can finish.
- WI-2717's sanctioned source-to-sink transport and synthetic evidence are a
  hard prerequisite for WI-2706. WI-2706's alert-delivery proof then feeds the
  remaining WI-1588 Acceptance Criterion. Reconcile WI-1588 only after both
  evidence layers exist.
- WI-1337 is terminal. No later action may repeat its credential operation.

These are lane delivery/collision edges. Live Cosmo dependencies and operator
gates still control execution; update this sequence when their authority
changes.

## Supervision / escalations

- Follow each live Work Item's `Review Tier`; WI-2704 and WI-2705 currently
  require Adversarial review, as does WI-2717. This tracker grants no review or
  merge exception.
- WI-1328 touches store/RevenueCat production configuration and operator-held
  Play access. WI-2717 touches a production signal transport and WI-2706
  touches its alert rule and delivery target. Executors stop at any authority
  boundary named on the live page; credentials and operator gates are never
  copied here.
- WI-1328 and WI-1588 have expired claim tuples plus durable executor hand-backs.
  Do not infer liveness from `Stage=Executing`, and do not redispatch until the
  Shepherd applies the sanctioned liveness/recovery path.
- WI-2717's same-owner renewal records the mandatory `WI-2717` worktree and a
  live claim through 17:47Z. Its Adversarial review and production-transport
  authority boundaries still apply.
- Executors never merge, review, or close. They run lifecycle completion only
  after the artifact lands and the governing execute flow reaches that gate.

## Current position

At `2026-07-24T14:49:08Z`, WI-2686, WI-2704, WI-2706, and WI-2717 have live
executor claims; WI-2705 is Ready/unclaimed; WI-1328 and WI-1588 have partial
durable hand-backs but expired claims; WI-1337 is Closed/Done. WI-2706 is
downstream of WI-2717 and must not resume its alert-delivery proof until the
transport evidence exists. WI-2717 is executing from its isolated `WI-2717`
worktree with a live claim through 17:47Z. The next lane checkpoint is the first
of: an active executor hand-back, a live Stage/State/claim change, a PR
transition, or a Brief/relation membership amendment.

Before the next dispatch, re-query the relation, reconcile the two expired
claims, enforce the lane WIP/collision rules, and use each member's live
discussion as the gate/evidence source.

## Launch gate

BID-42 remains Formed. The lane is not graduated, and release readiness is not
met, until every member returned by the authoritative live relation is
Closed/Done, every operator/production gate named by those members is
resolved, the final relation/Brief parity query is clean, and residue is handed
back to the Orchestrator. No tracker text can waive those conditions.

## Change log

- 2026-07-24 — Canonical tracker materialized for WI-2686. Direct reads
  verified the committed release-eng topology, BID-42 Brief/relation parity
  (eight rows, `has_more=false`, including the mid-execution admission of
  WI-2717), current lifecycle/claim/PR facts, and the
  Shepherd-owned runtime pointer contract. No Delivery Batch membership,
  lifecycle field, credential, service, production behavior, operator gate, or
  runtime monitor/handoff file changed.
