# WI-2037 implementation plan

**Profile:** Design · **Producer:** `codex:builder:WI-2037` · **Worktree:**
`.worktrees/WI-2037` · **Authority gate:** provisionally satisfied on
2026-08-01; final ratification is assigned to Zuzka in OPQ-160 and delivery is
authorized to proceed.

## Outcome

Define the guardian-consent authority ceremony for a credentialed learner aged
13–16 who is below the current residence-policy consent age, reconcile canon
and roadmap wording, and hand an executable contract to WI-2533 without
asserting that the implementation has landed.

## File map

Product changes are bounded to the nine files named by the executor brief:

1. new L3 ceremony spec;
2. pre-live rewrite of MMT-ADR-0010;
3. identity domain model §6;
4. identity PRD join-my-family section;
5. documentation index;
6–9. the graduated and working-source MVP definition/runway pairs.

Lifecycle evidence lives only under `.workitem-artifacts/WI-2037/`.

## Tasks and checks

- [x] T1 — Re-read the live claim, dependency, worktree, and collision gates;
  require an isolated branch at current `origin/main`.
- [x] T2 — Freeze the authority/implementation crosswalk and preserve the
  login-versus-consent, Guardianship-versus-grant, and
  Guardianship-versus-Supportership boundaries.
- [x] T3 — Author the L3 state, trust, assertion, replay, transaction, failure,
  API/mobile, migration, and regression contract.
- [x] T4 — Rewrite pre-live MMT-ADR-0010 in place; record the timeless standing
  decision and alternatives without claiming final Architecture ratification
  or delegating authority to Work Items/L3 artifacts.
- [x] T5 — Reconcile the identity domain model and PRD.
- [x] T6 — Reconcile both roadmap copies and index the L3 spec.
- [x] T7 — Map every Acceptance Criterion to evidence and prepare lifecycle
  artifacts.
- [x] T8 — Run decision/provenance/teen-claim, change-class, formatting, diff,
  stale-doctrine, exact-scope, and mirror checks.
- [x] T9 — Run independent Standards and Spec-axis shepherd reviews, correct
  every blocker, and obtain clean re-review verdicts.
- [x] T10 — Record Jørn's provisional Architecture approval in an explicit ADR
  rider and create OPQ-160 for Zuzka's final ratification, with delivery
  authorized to proceed as fully approved.
- [ ] T11 — Re-verify, commit, push, open the PR, and run the governed
  strict-green landing lifecycle.
