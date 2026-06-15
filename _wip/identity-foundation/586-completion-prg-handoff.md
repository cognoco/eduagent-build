# WI-586 Code-Half PRG — Initiative Brief for the Orchestrator (2026-06-15)

> **For the already-running orchestrator of the `eduagent-build` pre-launch umbrella program.** You
> already know how to orchestrate (create initiatives, spawn + manage shepherds, run to completion) —
> this brief does **not** re-explain that. You have **no prior context on WI-586**; this is the
> situation and the single initiative you need to stand up. Authored by the outgoing session that held
> both the orchestrator and the 586-cutover roles. Operator = **Jorn**.

## What you're taking on
Stand up and manage one PRG-level initiative: **complete WI-586 — the identity-foundation cutover**,
end-to-end, through to close. **Spawn one shepherd** to drive it. It is the **critical path**: the only
other live initiative — **S4–S6 of the mentor-is-the-app shell redesign**
(`docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`) — is **blocked on 586** (its S4 repoints
`profileId → personId`).

## Two different "v2"s — don't conflate
- **`IDENTITY_V2_ENABLED`** = the identity-foundation **data-model** re-platform (person / login /
  organization / membership / guardianship / supportership / consent_grant / subscription /
  consent_request). **THIS is WI-586.** Stages CUT-A / CUT-B1 / B2 / B3. Canon: `docs/canon/identity/`,
  `_wip/identity-foundation/`; ADRs `MMT-ADR-0011/0015/0020`.
- **`MODE_NAV_V2_ENABLED`** = the mentor-is-the-app **nav shell** (the S0–S6 plan). Different track;
  S4+ depends on identity-foundation landing. The "v2" in each name is coincidental.

## The situation (why this PRG exists)
WI-586 is one cutover with two halves; the runbook sequenced them backwards:
1. **CODE half** — migrate every legacy-table reader/writer to v2 behind the flag, fully tested: wire
   the ~290 existing `*V2` twins at their call sites, **build the missing ones**, remove the flag.
2. **DATA half** — converge → verify (exit 0) → M-REPOINT → flip → M-DROP.

The data half was **rehearsed on staging and is mechanically sound** (full record in the execution log),
but it ran **before** the code half existed → post-drop, authenticated read endpoints **500** with
`relation "profiles" does not exist` / `relation "family_links" does not exist`, because the code still
reads the dropped legacy tables. **The drop is the terminal step of the code migration, not a precursor.**

## What this PRG must accomplish (operator-ratified — one shepherd, end-to-end)
The PRG owns WI-586 through to close, in order:
1. **Code half** — migrate all legacy readers/writers to v2 + remove the `IDENTITY_V2_ENABLED` flag;
   full unit suite + the 51 integration suites green.
2. **Terminal data half** — folded into this PRG per Jorn's ruling (**not** a separate track): re-run the
   staging cutover (converge → flip → drop) to validate the corrected sequence; **promote** the
   M-REPOINT / M-DROP inert drafts to numbered migrations (`0117`/`0118`); run the **prod cutover** (prod
   is near-empty; non-gating to 586 close per cutover-plan §4.1); **close WI-586** via the Cosmo lifecycle.

Staging being down is **not** a cost factor (it serves nothing else) — optimize purely for finishing 586
correctly. The cutover mechanics are fully captured in the execution log; the terminal phase reads it.

## Scope of the code half (first-order — the shepherd firms this up first)
- ~**868 reference sites / 77 files** (non-test source) touch the 5 legacy tables — upper bound / full
  removal surface; includes the legacy schema defs + reseed/conversion code, removed wholesale.
- ~**290 `*V2` functions already exist** → much is mechanical wire-up (add the v2 branch at unbranched
  call sites).
- **Missing twins must be built** — e.g. `listProfiles` has **no** `listProfilesV2`; needs a new
  org-scoped `person`/`membership` query (**ownership-scoping = security-sensitive**; TDD it).
  `getFamilyPoolStatusV2` + `listFamilyMembersV2` exist (the dashboard 500'd only because its call site
  didn't branch to them).
- **Breaking readers seen so far** (incremental, NOT exhaustive): `GET /v1/profiles`, `GET /v1/dashboard`,
  `GET /v1/nudges`. **First work package = enumerate the full breaking set statically**, don't discover
  it endpoint-by-endpoint.
- Run through the full process: writing-plans skill → scoped work packages → TDD on the scoping-sensitive
  readers → reviewed PRs → the full + integration gate. Not an ad-hoc 77-file sweep.

## Durable artifacts (feed the shepherd / executors via pointer-briefs)
- **Pre-graph 401 fix** — branch `fix-v2-pregraph-401`, commit `de8df6e86`, pushed, live on staging
  (deploySha `de8df6e8`). **Fold in as the PRG's first slice** (don't land standalone — flag-gated, so
  harmless on prod, but piecemeal-landing a flagged migration invites half-states). It makes
  `GET /v1/profiles` → `{profiles:[]}` and `GET /v1/subscription/status` → free-tier defaults for a
  graphless v2 user (CUT-B1 pre-graph allowlist contract) instead of 401. Red-green tests in
  `profiles.test.ts` + `billing.test.ts`; typecheck + lint + 905 tests green.
- **Cutover execution log** — `_wip/identity-foundation/586-staging-cutover-execution-log.md`: full
  data-half record (steps 1–10), the concrete Rollback Plan, and recovery markers (pre-cutover PITR
  marker + pre-drop `T_drop` + `pg_dump` path). Authoritative for the terminal-phase mechanics.
- **Prior data-half handoff** — `_wip/identity-foundation/586-staging-cutover-handoff.md`.

## Staging current state
Post-drop, broken for authenticated reads (spent rehearsal). `IDENTITY_V2_ENABLED=true`, maintenance
flags off. **Recovery deferred (no urgency):** when the PRG reaches its terminal phase, reset staging —
easiest is an operator **PITR-rewind to the pre-cutover marker** (in the execution log; Neon console —
no `neonctl`/`NEON_API_KEY` on this host) — then re-rehearse the data half with the code half merged.

## Repo conventions (for you + the shepherd/executors)
General rules: `AGENTS.md`. Domain-specific: secrets via **Doppler** (`--project mentomate`, configs
dev/stg/prd; never print values); read precise SQL/endpoint/constraint strings natively (not via rtk);
worktrees via `.agents/skills/worktree-setup/SKILL.md` (`.worktrees/<branch>`); commit via the commit
skill (own-work scope). Ephemeral leftovers from the authoring session, safe to ignore/clean: a
`wrangler tail` (auto-expires) and an Expo web dev server (orphan PID `91694` on `:8089`).
