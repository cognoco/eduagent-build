# Execution Tracker — PRG-34 · Platform Hardening (WS-34) — PARKED

> Lane substance for the `platform-hardening` lane. Process lives in `roles/shepherd-protocol.md`.
> **This lane is PARKED** — provisioned but not activated. Do not launch a shepherd against it yet.

## Charter
Burn down platform/hardening debt in WS-34 (14 WIs): mobile dep upgrades + Clerk-Core-3 migration,
i18n echoed-English guard, observability gaps, API route→service extraction + query-perf, and
root-dependency hygiene. "Done" = all 14 WIs Closed via the review gate. **Tier 3 — deferrable debt.**

## PARK rationale (why not active, why not folded into mobile-ux-nav)
- **Too large to fold:** 14 WIs = a full lane. Bolting onto the `mobile-ux-nav` shepherd would blow
  its context (violates the context-longevity mandate). → its own lane.
- **Tier 3 / spin-up rank 6:** the workstream's own metadata defers it ("Deferrable debt").
- **Cross-instance file-surface overlap (WI-1263 gap):** several WIs plausibly collide with
  **Ramtop's** lanes at the file level — WI-1183 (i18n) ↔ Ramtop `l10n-a11y`; WI-1179 (Clerk migration),
  WI-1069 (mobile data-hooks), WI-1098 (mobile trust-boundary parse) ↔ mobile surface Ramtop may touch.
  Parallel execution risks the half-migration pattern. **Deconflict with the operator/Ramtop before
  activating.**

## Canon authority (record now; bind at activation)
- Route/service boundary (eslint G1/G5), `createScopedRepository` / parent-chain reads, `@eduagent/schemas` contract, i18n hygiene scripts (`check-i18n-*`), GC1/GC6 mock ratchets, migration immutability. Most WIs are `Assisted`/`Manual` refactors — high blast radius, needs careful review invariants at activation.

## Pointers
- **Cosmo Workstream:** WS-34 "Platform Hardening" — page id `3918bce9-1f7c-8142-9b75-dfcafbc94d65` (Status: On hold; description: "Tier 3. Deferrable debt. Spin-up rank 6").
- **Work Items DB (data source):** `36fd1119-9955-4684-8bfe-deb145e6a21f`. **Workstreams DS:** `08b3ab36-709d-44af-b78c-5e9f74f6e745`.
- **Clacks channel:** `_quartet/working/lanes/platform-hardening/_state/{inbox,outbox}.jsonl` (provisioned; no watchers armed while parked).

## Units / slice (14 WIs — snapshot 2026-07-02; all Workstream Order unset)
Ready: WI-1190, WI-1183, WI-1181, WI-1180, WI-1179, WI-1178, WI-1177, WI-1096(WP), WI-1088, WI-1069, WI-1041, WI-482.
Captured: WI-1188. Refining/**Blocked**: WI-1098 (mobile trust-boundary parseJson sweep — State=Blocked).
Sub-threads (~5-6): mobile deps/Clerk/i18n · API route-extraction/query-perf/service-split · root-dep hygiene · observability · mock-backlog burn-down.

## Sequence
Deferred — establish at activation. Likely bundle into WPs by sub-thread; sequence root-dep + lockfile
items (WI-1041, WI-1181) before dependent upgrades (WI-1180, WI-1179) to avoid lockfile churn.

## Supervision / escalations
- **Scope-risk / half-migration:** WI-1179 (Clerk migration) and dep upgrades are exactly the
  "new code ships, old kill-switch stays" class — executors must enumerate the full surface/matrix
  before editing (repo scope-risk hook). Bind this as a review invariant at activation.
- WI-1098 already Blocked — check its blocker at activation.

## Current position
**PARKED** 2026-07-02. Lane dir + channel provisioned; tracker written. No shepherd, no kickoffs
finalized for launch, no monitors armed. Revisit when WS-31/WS-33 are moving AND the Ramtop overlap
is deconflicted.

## Launch gate
**Parked.** Release conditions (all): (a) attention budget freed from WS-31/WS-33; (b) Ramtop
file-surface overlap deconflicted (WI-1183/1179/1069/1098); (c) operator go. On release: refine slice
to DoR, bundle into WPs by sub-thread, then execute.

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
