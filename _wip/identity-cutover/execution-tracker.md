---
title: Identity Cutover — Execution Tracker (PRG-06)
status: ACTIVE (stood up 2026-06-15) — shepherd launch GATED (see §6)
owner: Jorn (orchestrator) + PRG-06 shepherd session (to be launched)
roster: PRG-06 in _wip/umbrella-program/program-roster.md
scope: complete the identity-foundation cutover end-to-end — reconcile the application
  reader/writer surface to the canonical new identity model, remove the IDENTITY_V2_ENABLED
  flag, re-run the corrected staging→prod cutover, and close WI-586.
---

# Identity Cutover — Execution Tracker

> **The durable entry point for PRG-06.** Charter / canon authority / slice sequence /
> coarse status / current position / launch gate / change log. Per the umbrella planning
> reference (`_wip/umbrella-program/planning-reference.md` §2.1), an Initiative = tracker +
> Cosmo Workstream + slice. Pointers, never copies (§1.4).

## 1. Charter

### Outcome (done means)
The app reads/writes the **new identity model end-to-end per canon** (person / login /
organization / membership / guardianship / supportership / consent_grant / subscription /
consent_request); `IDENTITY_V2_ENABLED` is **removed** (v2 is the only path); full unit
suite + the 51 cross-package integration suites green; the **corrected staging→prod cutover**
is re-run; **WI-586 closed** via the Cosmo lifecycle.

### Why this Initiative exists (the discovery)
The identity-foundation re-platform (PRG-01) built the new data model, the policy-engine /
router spine, the migrations, and rehearsed the **data cutover** on staging (converge → flip →
M-DROP — full record: `_wip/identity-foundation/586-staging-cutover-execution-log.md`).

WI-586 was scoped as the **data cutover only**, on the assumption that the application code
to work against the new model was already prepared by a **separate, parallel track** (the
S0–S6 *mentor-is-the-app* shell redesign,
`docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`, executed through ~S3). When the
staging cutover ran, the dovetail **failed**: S0–S3 was **not aligned to the canonical
architecture / to-be data model**, so post-drop the app still reads dropped legacy tables and
authenticated reads 500 (`relation "profiles" does not exist`). There was **no code half of
586**; this PRG is that code half — bringing the previously-parallel, now-critical app-code
gap into managed orchestration, reconciling it to canon, then re-running the cutover.

### Canon authority (standing rule)
- **Canon wins.** Where the S0–S6 work diverges from canon (canonical architecture, the
  identity-foundation design, the specs, the trusted ADRs, the to-be data model), **canon
  always wins**. **S0–S6 design choices are NOT canonical** and are not inherited — the
  reader/writer surface is reconciled *to canon*, not to what S0–S6 happened to build.
- **ADR caveat (temporary, launch-gated — NOT a standing distrust rule).** `MMT-ADR-0020`,
  `MMT-ADR-0021`, `MMT-ADR-0022` were reverse-engineered from the S0–S6 plans and are being
  cleaned up in a **separate session**. Their contents are **not yet trustworthy**. The
  shepherd is **not launched until that cleanup is operator-confirmed complete** (§6), so by
  the time the shepherd runs these three are **trusted canon** — there is no in-flight
  distrust for the shepherd to manage. (Until then, the orchestrator does not cite their
  contents.)

### Scope
- **IN:** reconcile the app reader/writer surface to the new model (wire existing `*V2`
  twins at unbranched call sites; **build the missing twins** — e.g. `listProfilesV2`,
  org-scoped, ownership-scoping security-sensitive → TDD); remove `IDENTITY_V2_ENABLED`;
  the **terminal data half** (re-run staging cutover with code merged; promote the
  M-REPOINT / M-DROP drafts to numbered migrations `0117`/`0118`; prod cutover; close WI-586).
- **OUT / deferred to shepherd post-enumeration:** whether **S4–S6** (the nav-shell
  remainder) folds into this PRG or stays a separate track. Decided after WP-1 sizes the
  real surface — not pre-guessed.

### Owner / sessions (planning-reference §2.5)
Orchestrator (program session, Jorn) authors + steers; **one shepherd** session drives
day-to-day; executors build WPs in isolated worktrees; a **separate reviewer** closes.
Shepherd + reviewer are **operator-launched** (§2.5) — orchestrator prepares the kickoff
(`shepherd-kickoff.md`), Jorn launches.

## 2. How to use this doc
- This tracker is the durable state for PRG-06; Cosmo holds live per-WI state; the
  cutover *mechanics* live in the cited identity-foundation artifacts (§3) — do not copy them
  here. Update coarse status here at checkpoint cadence.
- Disposable-shepherd invariant (§2.6): every state change is written back (Cosmo
  immediately; this tracker at checkpoint). Kill the session, lose nothing but warm cache.

## 3. Pointers / index
- **Process machinery (the orchestration standard — how the lane is operated):**
  - `_wip/identity-foundation/shepherd-protocol.md` — standard shepherd scaffold (the shepherd's process).
  - `_wip/identity-foundation/executor-protocol.md` (+ `-example`) — executor scaffold + thin pointer-brief shape.
  - `_wip/identity-cutover/shepherd-kickoff.md` — the shepherd launcher (standard template; prime-and-hold).
  - `_wip/identity-cutover/reviewer-kickoff.md` — the separate autonomous-reviewer launcher (Codex; standard policy).
  - `_wip/identity-foundation/progress-channel-design.md` — the orchestrator↔shepherd channel design.
  - **Lane channel (provisioned):** `_wip/identity-cutover/_state/{inbox,outbox}.jsonl`.
- **Initiative brief:** `_wip/identity-foundation/586-completion-prg-handoff.md` (the brief that stood this up).
- **Cutover mechanics (terminal data half):**
  - `_wip/identity-foundation/586-staging-cutover-execution-log.md` (steps 1–10 record + Rollback Plan + recovery markers).
  - `_wip/identity-foundation/2026-06-11-cutover-plan.md` §4 (runbook), §2.7 (M-REPOINT catalog generator), §4.2 (rollback truth table).
  - `_wip/identity-foundation/wi586-readiness-2026-06-14.md` (readiness; orphan re-homes).
  - `_wip/identity-foundation/pending-migrations/{m-repoint.sql, m-drop.sql, README.md}` (inert drafts → promote to `0117`/`0118` for prod).
- **Canon:** `docs/canon/identity/` (data-model / domain-model / ontology / prd); `docs/architecture.md`.
- **The parallel track being reconciled:** `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` (S0–S6; non-canonical).
- **Durable code asset to fold in:** pre-graph 401 fix — branch `fix-v2-pregraph-401`, commit `de8df6e86` (pushed, live on staging); makes `GET /v1/profiles` → `{profiles:[]}` and `GET /v1/subscription/status` → free-tier defaults for a graphless v2 user (CUT-B1 pre-graph allowlist contract). Land as slice-1, not standalone.

## 4. Execution sequence + status

Coarse status per planning-reference §2 vocabulary. Cosmo WI numbers assigned at slice.

### WP-1 — Static enumeration of the breaking reader/writer set  (FIRST — the diagnostic)
Statically enumerate the **full** set of legacy-table readers/writers and unbranched call
sites across the app (the ~868 reference sites / 77 non-test files are the upper bound);
classify each: (a) existing `*V2` twin + branched call site = OK; (b) existing twin,
unbranched call site = wire-up; (c) **no twin = build** (TDD; ownership-scoping
security-sensitive). Output sizes + sequences all downstream WPs. **Fold in the pre-graph
401 fix (`de8df6e86`) as slice-1.** — *Cosmo: **WI-765**, Stage=Backlog (shepherd refines to Ready).*

### WP-2…N — Domain-wise reader/writer cutover  (firmed off WP-1, not pre-guessed)
Domain-grouped PRs migrating readers/writers to v2 + building missing twins, TDD on the
scoping-sensitive readers, reviewed PRs, full + integration gate. Boundaries + count set by
WP-1's enumeration. — *Cosmo: TBD.*

### WP-FLAG — Remove `IDENTITY_V2_ENABLED`
After all readers/writers on v2: delete the flag, the legacy schema defs, `account-repository.ts`,
legacy twin modules/seams; repo-wide grep clean; full suite + 51 integration suites green. — *Cosmo: TBD.*

### Terminal data half — re-run cutover, promote migrations, prod, close 586
Reset staging (operator PITR-rewind to the pre-cutover marker in the execution log) → re-run
the data half (converge → flip → drop) with the code half merged → promote M-REPOINT / M-DROP
to numbered `0117`/`0118` → prod cutover (prod near-empty; non-gating to close per cutover-plan
§4.1) → **close WI-586**. Mechanics: the execution log + cutover-plan §4. — *Cosmo: WI-586 (moved into this workstream).*

## 5. Current position — pick up here
- **2026-06-15 — PRG-06 STOOD UP (Cosmo structure live).** B ruled (new PRG ∥ PRG-01; WI-586
  emigrates here; PRG-01 graduates). **Done:** Cosmo **Workstream "Identity Cutover" (WS-18)**
  (`3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8`); **WP-1 = WI-765** enumeration Item
  (`3808bce9-1f7c-816f-b1e8-f984b8dd3545`, `Stage=Backlog`, order 1); **WI-586 + its 2 sub-items
  moved in**, WI-586 Blocked-by re-pointed to WP-1, Description corrected; roster PRG-06 row +
  queue + change log updated; **PRG-01 graduated** (WS-9 52/52 audit clean → `Status=Closed`);
  committed (`2259fd04a` + `754c62cbb`). **Machinery provisioned 2026-06-15:** lane mailboxes
  `_state/{inbox,outbox}.jsonl`; standard shepherd launcher (`shepherd-kickoff.md`, prime-and-hold)
  + separate reviewer launcher (`reviewer-kickoff.md`). **Pending:** dashboard regen.
  **Shepherd + reviewer NOT launched** — gated on §6; the shepherd primes-and-holds, released via
  an inbox `directive`.

## 6. Launch sequence + preconditions
- **Done (orchestrator):** Cosmo structure live (WS-18 + WI-765 + WI-586 moved/re-blocked); lane
  mailboxes provisioned (`_state/{inbox,outbox}.jsonl`); standard shepherd launcher
  (`shepherd-kickoff.md`, prime-and-hold) + separate reviewer launcher (`reviewer-kickoff.md`) authored.
- **Gate (operator):** **ADR-0020/0021/0022 cleanup complete + operator-confirmed.**
- **On gate clear (operator):** launch the **shepherd** (paste `shepherd-kickoff.md` launcher) and
  the **separate reviewer** (paste `reviewer-kickoff.md`, or add WS-18 to a live general watcher).
  The shepherd primes + holds; the orchestrator then **arms its outbox watcher** (Monitor on
  `_state/outbox.jsonl`) and sends an inbox `directive` ("ADR gate cleared — proceed") to release
  the shepherd into WP-1 (WI-765).

## 7. Change log
- **2026-06-15 — created.** PRG-06 stood up per the B ruling on the WI-586 code-half
  organization (new PRG ∥ PRG-01). Charter, canon-authority rule (canon wins; S0–S6
  non-canonical; ADR-0020/0021/0022 temporary launch-gated caveat), slice plan (WP-1
  enumeration first; pre-graph 401 fix as slice-1), and launch gate recorded.
