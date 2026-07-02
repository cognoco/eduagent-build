# Q4 — identity-v2 ↔ app-shell-v2 seam (OPERATOR PRIORITY)

## Question
Where does one system assume a shape, role, flag, or state the other does not provide? What
integration gaps would unit tests inside either system miss?

## Scope
- Included: mobile shell consumption of identity shape (profile/person, isOwner, roles,
  guardianship, age, premium, birthYear); the API `/profiles` adapters that serve it; RLS/DB
  backstop posture; materialized seam-bug history.
- Full artifact: `artifacts/map-appshell-seam.md` (6-row seam inventory, file:line) +
  `artifacts/map-identity-v2.md` + `artifacts/rls-posture-note.md`.
- `listProfilesV2` body was READ at audit close (`profile-v2.ts:449-476`) — org-scoped; remaining
  question is the "one org = one household" invariant (Q4-F6). No longer an excluded/open gap.

## Method
- Sonnet seam-mapper agent: nav contract engines, flag matrix, seam inventory (both directions).
- Sonnet identity-v2 mapper: table family, services, flip-flag existence.
- Prep RLS catalog checks (stg/prd) + controls.
- Cross-ref Cosmo materialized-bug WIs (Q6).

## Findings

| ID | Claim | Severity | Confidence | Evidence | Gap / caveat |
| --- | --- | --- | --- | --- | --- |
| Q4-F1 | **The V2 shell spec's phase-gating premise is STALE / falsified by code.** Spec §9 asserts S0–S3 are identity-independent and `person`/`membership`/`guardianship` "do not yet exist in code." They exist, are live, and are wired **unconditionally (no flag)** into `GET/POST /profiles` via identity-v2 adapters. The shell already depends on identity-v2 transitively without the S4 coupling review it deferred. **Strongest evidence for "built separately, don't fit."** | high | high | `docs/specs/2026-06-09-...redesign.md` §9; `apps/api/src/routes/profiles.ts:20-28,135,178,295`; `profile-v2.ts:19-26` | Both prod (V0 shell) and V2 channels hit these adapters — so this isn't V2-only. |
| Q4-F2 | **No `IDENTITY_V2_ENABLED` runtime flag exists** — identity-v2 is a call-site-by-call-site cutover (flag deleted, WI-868 Closed). So there is NO runtime toggle isolating legacy vs v2 reads; a legacy reader that survived the sweep is simply live. | medium | high | identity-v2 map (grep: flag absent anywhere in `apps/api/src`); Cosmo WI-868 | Refines Q1/Q3: "flag-gated legacy" is moot; correctness rides entirely on the sweep being exhaustive (WI-1239/1254 open). |
| Q4-F3 | **Identity-v2 tables have NO DB-RLS backstop** (17/18 RLS-off in prod+stg; verified — all 18 checked incl. 5 policy tables). Consistent with legacy identity baseline (also RLS-off) and NOT a regression — but it means app-layer ownership guards on `person`/`subscription`/`guardianship`/`financial_record` are **fully load-bearing**. | high | high | `artifacts/rls-posture-note.md`; `rls-identity-v2-{stg,prd}.txt`, `rls-legacy-dev.txt`, `rls-control-stg.txt` | Combined with Q4-F4 fail-open, a single missing app-guard is directly exploitable. |
| Q4-F4 | **`isOwner` is now DERIVED (`membership.roles.includes('admin')`), and fails OPEN.** A person with empty/malformed `roles` reads as non-owner → hits the `!isOwner` child branch → lands in `child-study-only` shape (hides billing/account/export-delete) rather than erroring visibly. | medium | high | `profile-v2.ts:302`; `navigation-contract.ts:317` | Fails safe for owner-only *data* gates, fails confusingly for shell shape. Fable: does any owner-only data leak through a shape a malformed-roles person can reach? |
| Q4-F5 | **`hasPremiumLlm` hardcoded `return false`** in `profile-v2.ts:100-102` — v2 can never report premium regardless of real subscription tier. Contained today (no non-test mobile consumer), but a silent landmine. | low | high | `profile-v2.ts:14-15,100-102,125,345`; consumer grep empty | Self-flagged provisional in code. |
| Q4-F6 | **`linkedChildIds` scoping — READ at audit close, reframed to org-boundary integrity.** `listProfilesV2` (`profile-v2.ts:449-476`) IS org-scoped ("the IDOR guard: only persons with a membership in THIS org"), then attributes guardianship edges; `account.id = organization.id`. Mobile `getLinkedChildIds` filters `profiles[]` by `!isOwner` only, which is safe **iff an org never contains two unrelated families' children**. | medium | medium | `apps/api/src/services/identity-v2/profile-v2.ts:449-476` (read); `navigation-contract.ts:195-203` | No longer "unread." Residual: verify the "one org = one household" invariant holds across child-creation/guardianship paths (could an org accrue an unrelated child membership?). |
| Q4-F7 | **The seam is empirically fragile — 3 materialized prod/500 bugs.** WI-1255 (v1-pinned deletion → dropped tables, live prod 500 + GDPR gap), WI-1161 (export-v2 parsed v2 row against legacy schema → 500), WI-1138 (consent-deny GDPR store-teardown leak). All at the identity-v2/consumer seam. | high | high | Cosmo `cosmo-ws18.tsv`; commits a52b8282f, 666127c28 | These are the seam failing in practice, not hypothetically. |
| Q4-F8 | **Policy-engine tables (`regimes`, `policy_cells`, `policy_rules`, `knowledge_assertions`, `allowed_models`) have ZERO service consumers.** Schema comment claims "router reads `allowed_models`"; code does not. Designed-but-unwired identity-v2 surface. | medium | high | `git grep` @ `145e74d5e`: policy-table symbols (`regimes`/`policyCells`/`policyRules`/`knowledgeAssertions`/`allowedModels`) appear ONLY in `schema/identity.ts` + tests; `judge-dispatch.ts` imports no `@eduagent/database` and no policy table (uses age helpers only) | Confidence restored to high after the WI-367 re-check — the tables remain inert at the freeze SHA. |

## Seam integration-test gap (what unit tests miss)
- **No mobile unit test exercises the real `profile-v2.ts` adapter** — all use hand-built
  `Profile` fixtures (`test-utils/profile-factories.ts`). Rows Q4-F4/F6 would not be caught by
  the mobile suite if the API adapter drifts.
- Real cross-boundary coverage is **staging-only Playwright** against `doppler -c stg`.
  **RESOLVED (2026-07-02 audit):** the CI smoke script `test:e2e:web:smoke` (`package.json:42`,
  run at `e2e-web.yml:185`) selects only `--project=smoke-auth --project=smoke-learner
  --project=smoke-parent` — these DO run under V2 flags (so learner/parent seam gets *some*
  default coverage), but the dedicated seam-registry spec `mentor-audit-registry-smoke`
  (`playwright.config.ts:241`) is **opt-in, not in the smoke gate**. So the richest V2-seam
  assertion is advisory, not hard-gated per PR.

## Contradictions
- Shell spec §9 ("person/membership do not exist in code") vs live code (they do, and are
  wired) — Q4-F1. Spec is stale relative to the identity build it was sequenced against.

## Fable prompts (open leads prep did not close)
- **Verify the "one org = one household" invariant** (Q4-F6, now read): can an org's membership
  ever accrue an unrelated family's child, which would let the mobile `!isOwner` filter surface a
  sibling-family child? Check child-creation + guardianship-grant paths.
- Enumerate app-layer ownership guards on every `person`/`subscription`/`financial_record`
  read/write path — no DB backstop exists (Q4-F3).
- Is `services/profile.ts` (legacy) still reachable from any live `/profiles` route, or
  write-helper-only? (Overlaps Q1.)
- Given WI-1255's live incident, are sibling v1-pinned paths still un-swept? (Q1/WI-1254.)
