# WI-586 Completion — Code-Half Migration PRG: Fresh-Session Handoff (2026-06-15)

> Resume WI-586 (identity-foundation cutover) in a fresh session. The **data-half**
> (converge → flip → drop) was rehearsed on staging and is mechanically sound; the rehearsal
> revealed the **code-half — migrate every legacy-table reader/writer to v2 — is the real
> remaining work and must precede the drop.** Read this first, then the cited artifacts.

## Your role
Orchestrator / control point of the `eduagent-build` pre-launch umbrella program (operator = **Jorn**).
**This is the sole live thread.** The only other active initiative is **S4–S6 of the
mentor-is-the-app shell redesign** (`docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`),
which is **blocked on WI-586** (its S4 repoints `profileId → personId`). So 586 is the critical path.

## TWO different "v2"s — do not conflate
- **`IDENTITY_V2_ENABLED`** = identity-foundation **data-model** re-platform (person / login /
  organization / membership / guardianship / supportership / consent_grant / subscription /
  consent_request). **THIS is WI-586.** Stages CUT-A / CUT-B1 / B2 / B3. Canon: `docs/canon/identity/`,
  `_wip/identity-foundation/`, ADRs `MMT-ADR-0011/0015/0020`.
- **`MODE_NAV_V2_ENABLED`** = the mentor-is-the-app **nav shell** (the S0–S6 plan). DIFFERENT track;
  S4+ depends on identity-foundation landing. The "v2" in each name is coincidental.

## Where we are — the ratified framing
WI-586 is ONE cutover with two halves; the runbook sequenced them backwards:
1. **CODE half** — migrate every legacy reader/writer to v2 behind the flag, fully tested: wire the
   ~290 existing `*V2` twins at their call sites, **build the missing ones**, remove the flag.
   **This is the bulk and the remaining work → a PRG.**
2. **DATA half** — converge → verify (exit 0) → M-REPOINT → flip → M-DROP. Rehearsed on staging; sound.

Correct order is **code half → data half**. The staging rehearsal ran the data half (flip + drop)
while the code half does not yet exist → post-drop, authenticated read endpoints **500** with
`relation "profiles" does not exist` / `relation "family_links" does not exist`, because the code
still reads the dropped legacy tables. **Finding: the drop is the terminal step of the code
migration, not a precursor to it.** (The pre-graph 401 loop — separate, smaller — is already fixed; see below.)

## DECISION (ratified by Jorn, 2026-06-15)
Stand up a **PRG-level activity** to do the code-half migration on `main` through the full process
(writing-plans skill → scoped work packages → TDD on the scoping-sensitive readers → reviewed PRs →
**full unit suite + 51 integration suites** gate). Then re-run the data-half on staging to validate
the corrected sequence, then prod. **Not** an ad-hoc 77-file sweep.
- **Staging being down is NOT a cost factor** — it serves nothing else. Optimize purely for finishing
  586 correctly + efficiently (rollback or forward, on merits).

## Scope of the code-half (first-order — the PRG's first task is to firm this up)
- ~**868 reference sites across 77 files** (non-test source) touch the 5 legacy tables
  (`profiles`/`accounts`/`subscriptions`/`family_links`/`consent_states`). Upper bound / full removal
  surface — includes the legacy schema defs + reseed/conversion code that get removed wholesale.
- ~**290 `*V2` functions already exist** → much of it is mechanical **wire-up** (add the v2 branch at
  unbranched call sites; same shape as the pre-graph fix).
- **Missing twins must be BUILT** — e.g. `listProfiles` has **no** `listProfilesV2`; needs a new
  org-scoped `person`/`membership` query (**ownership-scoping = security-sensitive**, TDD it).
  `getFamilyPoolStatusV2` + `listFamilyMembersV2` **exist** (the dashboard 500'd only because its call
  site didn't branch to them).
- **Breaking readers observed so far** (incremental, NOT exhaustive): `GET /v1/profiles` (listProfiles),
  `GET /v1/dashboard` (family_links), `GET /v1/nudges` (profiles). **PRG step 1 = enumerate the full
  breaking set statically**, don't discover it endpoint-by-endpoint.
- Risk profile: mostly bounded wire-up; real risk concentrated in the no-twin readers (correct scoping)
  + semantic-equivalence of each v2 read (e.g. consent `guardianEmail` vs legacy `parentEmail`) + the
  heavy verification gate. Days of careful work, multi-PR — not minutes, not mechanical.

## Durable artifacts
- **Pre-graph 401 fix** — branch `fix-v2-pregraph-401`, commit **`de8df6e86`**, **pushed**, deployed to
  staging (deploySha `de8df6e8`). **Fold into the PRG as its first slice** (don't land standalone:
  flag-gated so harmless on prod, but piecemeal-landing a flagged migration invites half-states).
  What it does: `GET /v1/profiles` → `{profiles:[]}` and `GET /v1/subscription/status` → free-tier
  defaults for a graphless v2 user (CUT-B1 pre-graph allowlist contract) instead of 401. Red-green
  tests in `profiles.test.ts` + `billing.test.ts`; typecheck + lint + 905 tests green.
- **Cutover execution log** — `_wip/identity-foundation/586-staging-cutover-execution-log.md`:
  the full data-half record (steps 1–10), the concrete **Rollback Plan**, and the recovery markers
  (pre-cutover PITR marker + the pre-drop `T_drop` point + the `pg_dump` path). Authoritative for markers.
- Prior session handoff (data-half): `_wip/identity-foundation/586-staging-cutover-handoff.md`.

## Staging current state
Post-drop, broken for authenticated reads (spent rehearsal). `IDENTITY_V2_ENABLED=true`, maintenance
flags off, serving the branch build. **Recovery is deferred (no urgency):** when the PRG reaches its
validation phase, reset staging — easiest is operator **PITR-rewind to the pre-cutover marker** (in
the execution log; Neon console — no `neonctl`/`NEON_API_KEY` on this host) — then re-rehearse the
data-half with the code-half merged.

## Next steps (the hand-over work — fresh session, full budget)
1. **Enumerate** the breaking readers statically (legacy-table readers reachable under the flag; which
   have `*V2` twins vs need building).
2. **Draft the 586-completion PRG plan** (writing-plans skill) for Jorn's review; fold in `de8df6e86`.
3. **Execute the code-half** as reviewed/tested PRs.
4. **Re-run the data-half** on staging to validate the corrected sequence; then prod (prod cutover is
   non-gating to 586 close per cutover-plan §4.1).

## Operational constraints (carry forward — also AGENTS.md + prior handoff)
- Secrets via **Doppler** (`doppler run --config <dev|stg|prd> --project mentomate`); never print values.
- **rtk** for shell, but read precise strings (SQL / endpoint / constraint names) natively.
- Worktrees via `.agents/skills/worktree-setup/SKILL.md` (`.worktrees/<branch>`); commit via the commit
  skill (own-work scope; never `git add -A`).
- Ephemeral leftovers from this session, safe to ignore/clean: a `wrangler tail` (auto-expires ~13:55Z),
  an Expo web dev server (orphan PID `91694` on `:8089` pointed at staging), and
  `apps/mobile/.env.local.pre-stg-preview` (the pre-session dev env backup — restore `.env.local` from
  it to return the dual-use checkout to dev).
