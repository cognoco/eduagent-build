# Execution Tracker — WS-34 · Platform Hardening — ACTIVE

> Lane substance for the `platform-hardening` lane. Process lives in `roles/shepherd-protocol.md`.
> **This lane is ACTIVE as of 2026-07-08** — operator lifted the hold on PM recommendation.
> Shepherd/reviewer launch remains operator-led.

## Charter
Burn down platform/hardening debt in WS-34 (17 WIs): mobile dep upgrades + Clerk-Core-3 migration,
i18n echoed-English guard, observability gaps, API route→service extraction + query-perf, and
root-dependency hygiene. "Done" = all 17 WIs Closed via the review gate, then the orchestrator
closes the WS-34 workstream container.

## Activation context (why separate from mobile-ux-nav)
- **Too large to fold:** 14 WIs = a full lane. Bolting onto the `mobile-ux-nav` shepherd would blow
  its context (violates the context-longevity mandate). → its own lane.
- **Cross-instance file-surface overlap (WI-1263 gap):** several WIs plausibly collide with
  **Ramtop's** lanes at the file level — WI-1183 (i18n) ↔ Ramtop `l10n-a11y`; WI-1179 (Clerk migration),
  WI-1069 (mobile data-hooks), WI-1098 (mobile trust-boundary parse) ↔ mobile surface Ramtop may touch.
  Parallel execution risks the half-migration pattern. Treat these as explicit coordination hazards
  before dispatching those WIs.

## Canon authority (record now; bind at activation)
- Route/service boundary (eslint G1/G5), `createScopedRepository` / parent-chain reads, `@eduagent/schemas` contract, i18n hygiene scripts (`check-i18n-*`), GC1/GC6 mock ratchets, migration immutability. Most WIs are `Assisted`/`Manual` refactors — high blast radius, needs careful review invariants at activation.

## Pointers
- **Cosmo Workstream:** WS-34 "Platform Hardening" — page id `3918bce9-1f7c-8142-9b75-dfcafbc94d65` (Status: Open as of 2026-07-08; was On hold).
- **Work Items DB (data source):** `36fd1119-9955-4684-8bfe-deb145e6a21f`. **Workstreams DS:** `08b3ab36-709d-44af-b78c-5e9f74f6e745`.
- **Clacks channel:** `_quartet/working/lanes/platform-hardening/_state/{inbox,outbox}.jsonl` (provisioned; orchestrator watches outbox, shepherd watches inbox after operator launch).
- **Kickoff:** `_quartet/working/lanes/platform-hardening/shepherd-kickoff.md`.
- **Decision log:** `_quartet/working/lanes/platform-hardening/decision-log.md`.

## Units / slice (17 WIs — REST snapshot 2026-07-08; all Workstream Order unset)
Fresh dispatchability check found exactly one Ready item with complete DoR properties:
- **Dispatchable now:** WI-1656 — GC1 Pattern-A checker false-positives on the type-generic requireActual form (`Ready`, `Active`, `Assisted`, Effort `S`, AC present, no blockers, unclaimed).

Ready but stale / not dispatchable until refined:
- **Effort missing:** WI-1190, WI-1183, WI-1181, WI-1180, WI-1179, WI-1178, WI-1177, WI-1088, WI-1069, WI-1041.
- **Ready WP missing State, Execution Path, Effort:** WI-1096.
- **Manual + Effort missing:** WI-482.

Not Ready:
- **Captured:** WI-1298 (no AC), WI-1188.
- **Backlog with blocker:** WI-1248 (blocked by Button API work).
- **Refining / Blocked:** WI-1098 (mobile trust-boundary parseJson sweep).

Sub-threads (~5-6): mobile deps/Clerk/i18n · API route-extraction/query-perf/service-split · root-dep hygiene · observability · mock-backlog burn-down · design-system Button tail.

## Sequence
First action for the shepherd is slice hygiene, not broad dispatch:
1. Dispatch only WI-1656 if the shepherd independently confirms the DoR read.
2. Route stale-Ready WIs back through refine before dispatching; do not treat `Ready` alone as sufficient.
3. Bundle by sub-thread where PR-sized: root-dep + lockfile items (WI-1041, WI-1181) before dependent upgrades (WI-1180, WI-1179) to avoid lockfile churn.
4. Coordinate Ramtop-overlap items before any file-touching executor brief: WI-1183, WI-1179, WI-1069, WI-1098.

## Supervision / escalations
- **Scope-risk / half-migration:** WI-1179 (Clerk migration) and dep upgrades are exactly the
  "new code ships, old kill-switch stays" class — executors must enumerate the full surface/matrix
  before editing (repo scope-risk hook). Bind this as a review invariant at activation.
- WI-1098 already Blocked — check its blocker at activation.

## Current position
**ACTIVE / awaiting operator launch** 2026-07-08. WS-34 status flipped to Open by REST after operator
overrode the missing `_quartet/SYNC-PROVENANCE.md` preflight requirement for Orion. Lane dir +
channel already existed; tracker refreshed; kickoff authored. Orchestrator outbox + stage watcher
instances live under `.cosmo-watch/platform-hardening/`.

## Launch gate
**Released by operator on PM recommendation.** The shepherd may start after the operator launches it.
Remaining constraints are execution-time coordination hazards, not activation gates: stale-Ready DoR
failures must go through refine, and Ramtop-overlap items must be coordinated before dispatch.

## Change log
- **2026-07-02** — Lane provisioned + PARKED by ORION. WS-34 resolved: "Platform Hardening", On hold,
  14 WIs, Tier-3 deferrable. Not folded into mobile-ux-nav (14 WIs = full lane, context-longevity).
  Held pending higher-tier lanes + Ramtop overlap deconfliction. Channel created; no watchers armed.
- **2026-07-02 (inbound)** — Two design-system items being re-homed here from WS-33 per ORION ruling
  (WI-1248 mis-refined + blocked on a Button API change): **WI-1248** (Button-consistency sweep, ~95
  files / 9 areas / 5 judgment classes — decompose at future refinement, NOT now) and a **new
  Button-API WI** the WS-33 shepherd is capturing ("Button.tsx lacks style/className override + danger
  variant"; WI-1248 blocked-by it). Both wait here until WS-34 activates. Re-home executed by the WS-33
  shepherd; verify their Workstream=WS-34 when WS-34 is next audited.
- **2026-07-08** — Operator lifted hold; ORION set WS-34 Status `Open` (was `On hold`) and refreshed
  REST census: 17 members, 13 marked Ready, only WI-1656 passes fresh DoR from visible properties.
  Stale-Ready failures are recorded above for refine before dispatch. Reviewer provisioning is a
  needs-operator item because a Codex reviewer is forbidden for this Codex-executor POC.
