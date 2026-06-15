# ADR Governance Correction & Re-vetting — Fresh-Session Handoff (2026-06-15)

> **Purpose.** Resume a governance-correction activity in a fresh session without losing the
> thread. The *substance* (the layer model, the flagged ADRs) lives in durable artifacts cited
> below; this file captures the **intent, scope decisions, and current state** that aren't in
> those docs. Read this first, then the cited artifacts, then start from **First actions**.

## Your role — READ THIS FIRST
You are the **architect's-aide** for an ADR-governance-correction activity in the
`eduagent-build` repo (operator = **Jorn**). This is a **single focused session, NOT a swarm** —
the bottleneck is the operator's architectural judgment, which cannot be parallelized. Your job:
**audit → re-derive decisions as architecture → present keep/amend/supersede/demote
recommendations IN BATCHES → execute the operator's rulings with lockstep canon edits.** You do
**not** re-author canon autonomously; **every ADR change is operator-signed** (that rule is part
of what this activity codifies — apply it to yourself from line one). Orient from the WP
(**WI-752**) and this file.

## The problem (why this exists)
ADRs (**L2** — the immutable *decision* layer) and `architecture.md` (**L1** canon — the
standing *what*) are supposed to be the authority that plans (**L3** — ephemeral) *implement*.
A provenance audit this session found the arrow **reversed**: several ADRs were
**reverse-engineered FROM ephemeral feature plans** and enshrined as canon **without
architectural vetting** — born inside feature PRs, carrying **self-asserted** "Deciders: PM
(owner)" sign-off, with canon prose laced with plan-phase labels (`S0`/`S4`) as load-bearing
actors.

**The principle (the operator's ruling):** plans *inform* decisions; they must **never BECOME
canon unvetted**, and **canon must not cite a plan as its spine** — passing commentary
references only, sparingly. The distinction, which `MMT-ADR-0000` must be made **crystal clear**
about: **reconstructing a PAST decision from a legacy artifact is sanctioned** (the structured
ARCH-N drain, ADR-0000 Part III, stamped "reconstructed"); **laundering a NEW choice from a
feature plan into an after-the-fact ADR is banned.**

## What we found (evidence — read-only audit, 2026-06-14/15)
- **Provenance (git):** `0016`/`0017`/`0021`/`0022` were authored by Zuzka (`zuzana.kopecna`).
  `0017` + `0022` were **born inside `feat()` PRs**; `0021` was **reverse-engineered from a plan
  that was archived in the same commit series** (`revise plan → archive plan → mint ADR-0018`);
  `0022` **cites a plan in its Links** and its prose is phase-labelled throughout.
- **S0–S6 are feature-rollout phases**, not architecture: the (not-yet-committed) "Mentor V2
  app-shell redesign" — `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` +
  `docs/plans/v2-plan/2026-06-10-s{0..6}-*.md`. S0 = activity-ledger + `/now` (dark); S4 =
  scope-chip/support-hub (identity-gated). The spec itself says S3–S6 "proceed **only** on
  evidence" — so they are not even a committed program.
- **Phase-label leakage into canon is bounded** to `MMT-ADR-0022` + the `architecture.md` ledger
  bullet. No other ADR and nothing under `docs/canon/` carries S-phase labels.
- **Our-side ADRs out of scope (unless the audit finds L3-spine-anchoring):** `0007`–`0015`,
  `0019`, `0020` were authored by `vetinari`/`jjoerg` via deliberate `docs(adr)` commits with
  **real sign-off trails** (Grill #1, walkthrough R-rulings, "shape ratified by architect").
  Their `_wip/*` "Inputs:" citations are *grilling-session records*, not plan-spine-anchors —
  but verify directionally during the audit.

## Scope test (the directional rule for the audit)
Flag an ADR **iff an L3/ephemeral document anchors the *spine* of the decision** (the decision
path runs the wrong way — plan → ADR). A *passing* reference to an L3 doc is fine. The audit is
**not** "plan-derived = kill"; it is "**reconstruct-a-past-decision (keep, stamp) vs.
launder-a-new-choice (do not keep as-is)**."

## The activity — WP `WI-752` "ADR governance correction & re-vetting" + spine
1. **Amend `MMT-ADR-0000` — make it crystal clear (the rule).** Explicit reconstruct-vs-launder
   distinction; L3/ephemeral docs referenced **only in passing, never as ADR spine/support**;
   **operator sign-off required** to reach `Accepted`; **ADRs not born in feature PRs**
   (dedicated `docs(adr)` change-sets). Consider a forward guard (extend the `decision-adr-link`
   ratchet, or flag ADR files added in `feat/*` commits). Operator-signed — **this is the first
   decision under the new rule.**
2. **Audit all ADRs for L3-spine-anchoring** (Spike) — apply the scope test above. Output = the
   flagged re-vet set. Prime suspects: `0016`, `0017`, `0021`, `0022`. Confirm + extend.
3. **Per-ADR re-vet** (one child per flagged ADR, spawned from #2). Re-derive the decision from
   first principles **as architecture**. Outcome: **keep / amend / supersede / demote** (demote =
   it was plan content, not an ADR-class decision). **Operator rules each.** Then execute the
   ruling + lockstep `architecture.md` edits, decontaminating phase labels.
4. **Bring `architecture.md` up to scratch** — every surviving canon line traces to a vetted,
   operator-signed ADR; phase labels + plan-as-authority references gone. Lockstep with #3.
5. **Reverse sweep — UNBUILT plans only.** Review the **unbuilt** S-phase plans (S3–S6, and any
   other unbuilt plan) against *corrected* canon; corrective action **before build**. Skip
   delivered phases (water under the bridge). A **contradiction-check**, not full reconciliation.

## Hard constraints
- **The 586 staging/prod identity cutover runs COMPLETELY SEPARATELY — never touch or gate it.**
  The decisions here are *already built*; this is governance hygiene, not a launch gate. (586 is
  owned by a different session.)
- **Operator sign-off on every ADR change.** Present recommendations in batches; Jorn rules. No
  agent-asserted ADR ratification (the very anti-pattern being fixed).
- **Shared `main` checkout:** stage only your own files (never `git add -A`); on push reject
  `git pull --no-rebase --no-edit`; never rebase/force-push. Other sessions hold uncommitted
  work in the tree — leave it alone.
- **Calibrate** with the reconstruct-vs-launder scalpel — not a blanket purge. Some plan-derived
  ADRs legitimately survive (as reconstructions, stamped).

## Reference: the discarded WI-751 edits
WI-751 (the narrow "ledger re-point doc sweep") was **retired/absorbed** into this WP. This
session drafted then **discarded** a 4-file edit bundle (`MMT-ADR-0020` re-point-convention
amendment; `MMT-ADR-0022` corrections + plan-link derank + provenance amendment; the
`architecture.md` ledger bullet; the `activity-ledger.ts:27` comment). Those edits **still
carried `S0`/`S4` phase labels** and were built on a "decontaminate + promote" premise that this
activity supersedes. Treat them as **a reference for what the `0022` re-vet might produce** — but
**redo `0022` as a full architecture re-vet**, phase-label-free, don't just restore them. (The
factual core was right: the re-point is the cutover's M-REPOINT — FK-retarget-only, column name
unchanged — and `edge_id` is a separate additive later column; the *layer hygiene* is what was
unfinished.)

## Durable artifacts to read on resume
- `MMT-ADR-0000` (`docs/adr/MMT-ADR-0000-...md`) — the layer model, the §II.1 significance gate,
  the Part III reconstruction sanction (the thing to make crystal clear).
- The flagged ADRs: `docs/adr/MMT-ADR-00{16,17,21,22}-*.md`.
- `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` (the S0–S6 source) + `docs/plans/v2-plan/`.
- WP **WI-752** (charter) + its spine children in Cosmo (Work Items DB
  `collection://36fd1119-9955-4684-8bfe-deb145e6a21f`).

## First actions on resume
1. Read this file + `MMT-ADR-0000` + the four flagged ADRs.
2. **Run the audit (#2)** — produce the flagged re-vet set (confirm/extend the four suspects),
   and create one re-vet child Item per flagged ADR under WP WI-752.
3. **Draft the `MMT-ADR-0000` amendment (#1)** and present to Jorn for sign-off — the first
   decision under the new rule.
4. Per flagged ADR: re-derive as architecture → present keep/amend/supersede/demote to Jorn →
   execute the ruling + lockstep canon edit.
