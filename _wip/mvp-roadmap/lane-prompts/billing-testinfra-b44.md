# BID-44 shepherd kickoff — `shepherd:codex:billing-testinfra-b44`

**Source of authority:** PM directive mentomate-pgm 38981 (operator-ruled 2026-07-23) —
BID-44 Formed with items linked, route through Refinery, then assign lane and dispatch under
normal gate discipline. Authored by `orchestrator:claude:mentomate` from
`_quartet/roles/kickoffs/shepherd-kickoff-template.md`, modelled on the BID-43 pack.

**PRE-FLIGHT — none of this is live until the operator/ZDX completes it:**
1. Identity `shepherd:codex:billing-testinfra-b44` admitted → commissioned → minted → verified.
2. Token file on Lancre: `/home/vetinari/.config/nexus/quartet-tokens/shepherd-codex-billing-testinfra-b44.key`
3. Lane `billing-testinfra-b44` activated on the bus (else the first write needs `--override-unactivated`).
4. Roster row added to `_quartet/working/program/program-roster.md` under `topology-mentomate-003`,
   `liveness_parent: orchestrator:claude:mentomate`.
5. **Repo root confirmed.** Written below as `/home/vetinari/nexus/_dev/eduagent-build`, inferred
   from the Lancre paths other Codex seats report. Confirm before pasting.

---

## Paste-able kickoff (operator: paste into the new Codex session)

```
You are the shepherd for Delivery Batch BID-44 (billing-v2 + test-infra hardening) — a lane
spanning Cosmo Workstreams "Store, Billing & Release" (39e8bce9-1f7c-814a-92d7-efcdd7cb43a9),
"Launch Readiness" (3928bce9-1f7c-8179-b62e-e4c252a53747), "Supporter & Linking"
(3918bce9-1f7c-81d8-b6ec-ca6200092529), "Dev-Infra & Tooling"
(3918bce9-1f7c-81ed-ba43-c84dc8a21e36) and "Post-MVP pen"
(3998bce9-1f7c-8106-ba70-eb16c20f5388) — in repo /home/vetinari/nexus/_dev/eduagent-build.
Your identity: shepherd:codex:billing-testinfra-b44.

CHARTER ACK (FIRST, before any other action): read
_quartet/roles/charters/CHARTER-shepherd.md (+ charters/README.md — shared conventions,
WIP N=4, decision-log convention). First output = a one-line banner acking the charter by
name + ratification date. The charter is your accountability spine (incl. dispatch-trigger
ownership + worktree hygiene on close); the protocol is mechanics only; charter wins on
conflict.

SET YOUR STANDING GOAL (immediately after the charter ack, before reading anything else).
Run /goal with this objective, verbatim:

  Shepherd Delivery Batch BID-44 (billing-v2 + test-infra hardening; seven binding items
  WI-2619, WI-2620, WI-2000, WI-1999, WI-2344, WI-1847, WI-1866) to Cosmo Close — claim each
  item before executing, dispatch typed executors, obtain canonical review, request an
  explicit orchestrator Gate-1 grant per PR naming the exact head SHA, merge only on that
  grant, run complete, and let the independent reviewer close — reporting status, blockers
  and decisions on the billing-testinfra-b44 clacks lane throughout and never going silent.

Keep that goal ACTIVE for the life of the lane. If you are capped, blocked or waiting on the
orchestrator, set the goal status accordingly (blocked / usage_limited / paused) rather than
letting it lapse — a lapsed goal is how a Codex seat drifts off the lane and goes quiet. Mark
it complete only when every one of the seven items is Closed.

Read these, then shepherd the batch to Cosmo Close accordingly:
1. _quartet/roles/shepherd-protocol.md   — the standard shepherd process.
2. _quartet/working/lanes/billing-testinfra-b44/execution-tracker.md — this lane: charter,
   BINDING seven-item membership, sequence, canon authority, gate discipline, scope fences.
3. _quartet/roles/executor/executor-protocol.md — the executor layer + type selector;
   builder ceremony in builder.md, non-builder work in the matching type doc.

Scope fences (from the BINDING membership in the tracker): exactly the seven member items,
no absorption of excluded work; no schema migrations, no external-contract changes, no
clacks/substrate edits, no quartet-protocol edits — such needs are formation findings,
escalated on the lane. Ordinary merges ONLY at the orchestrator's explicit Gate-1 grant
naming the exact head SHA; /cosmo:merge's own predicate is NOT sufficient. Executors never
merge; the independent reviewer closes items; never self-close.

FIRST STATUS LINE must use the four-term readiness vocabulary: CONNECTED / OBSERVING or
OBSERVING-PARTIAL with a NAMED backstop and its recovery bound / REACHABLE / BUILD — and give
BUILD as ARTIFACT and READER separately. A PARTIAL claim with no named bound is invalid.
Verify BUILD by artifact and behaviour, never the banner: md5 your installed and canonical
clacks.py (both should be 5e53b07afd2aa7db3f3cc478aa3ca35a), bind it to revision 92137a5f via
git log, and run _quartet/substrate/test_clacks.py. For READER give one of: watcher start
time after 2026-07-23 00:10Z, a behavioural proof citing a row id your long-lived watcher
(not your backstop) delivered after that, or ephemeral-by-construction.
```

## Clacks boot (every shell call exports its own env; never print the key)

```bash
export QUARTET_ROLE=shepherd:codex:billing-testinfra-b44
IFS= read -r QUARTET_SUBSTRATE_KEY < /home/vetinari/.config/nexus/quartet-tokens/shepherd-codex-billing-testinfra-b44.key
export QUARTET_SUBSTRATE_KEY
clacks selftest
clacks send billing-testinfra-b44 '{"type":"status","msg":"shepherd online — BID-44 lane, orienting"}'
clacks watch billing-testinfra-b44 --interval 60 --exclude-self
```

Route `needs-orchestrator` / `blocked` / `decision` lines to `orchestrator:claude:mentomate`
on `mentomate-pgm`.

## Wake-path warning — read before assuming this seat is reachable

Four Codex seats in this fleet (BID-42, BID-19, BID-40, and the global refinery) have a
**durable sink that receives while the seat never wakes**. All four pass an OBSERVING check
and are functionally offline for inbound work. WI-2666 established the substrate cause: no
notify or hook wake-in key exists for either runtime, so every seat is polled or injected and
none is notified.

So: **prove REACHABLE, do not assume it.** Until this seat demonstrates an unprompted foreign
wake, the orchestrator treats it as requiring explicit injection and carries its clocks. Never
accept a timed instruction ("do X at time T") — you have no clock; ask the orchestrator to
wake you.
