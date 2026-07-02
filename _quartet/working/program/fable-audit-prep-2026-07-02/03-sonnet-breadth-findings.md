# 03 — Breadth-First Findings (tier-1, for Fable triage)

Anchor: **FROZEN at `origin/main` = `145e74d5e`**, 2026-07-02 (recon began at ancestor `a52b8282f`;
see `05-audit-response.md` § Frozen Anchor). All findings trace to an `evidence/` pack. Prep
did not adjudicate the ship/go decision — these are risks for Fable to verify/deepen/decide.

## Executive risk list

| ID | Area | Finding | Sev | Conf | Why Fable should care |
| --- | --- | --- | --- | --- | --- |
| SBF-001 | Cutover / dead code | Large orphaned legacy subtree loaded-but-dead; instant prod-500 if any caller re-wired; resurrection already happened once (WI-1255) | High | High | Latent minefield; proves the risk is real, not theoretical |
| SBF-002 | Migration integrity | Journal does NOT reproduce prod/stg; CI is journal-built (`drizzle-kit migrate`) → **CI DB matches no deployed env** (legacy FKs + `subscriptions` present) | High | High | Integration tests confirmed running against a non-deployed schema |
| SBF-003 | Env convergence | 3 envs at 3 cutover stages (prd>stg>dev); stg orphan `subscriptions`; dev fully legacy | High | High | "v2-only target met" is false today; blocks a clean go |
| SBF-004 | Seam | Shell spec's phase-gating premise falsified — shell already identity-v2-coupled unconditionally, no S4 coupling review | High | High | The operator-priority "built separately" seam, in the spec itself |
| SBF-005 | Seam / access | `listProfilesV2` IS org-scoped (IDOR guard); residual = whether an org's membership can hold unrelated families' children | Med | Med | Reframed from "unread" — now an org-boundary-integrity question |
| SBF-006 | Security posture | identity-v2 has no DB-RLS backstop + `isOwner` fails open → app-layer guards fully load-bearing | High | High | One missing app-guard = directly exploitable, no safety net (but NOT a regression) |
| SBF-007 | AC/canon | Canonical plan stale vs Cosmo; unclear if supporter-gap WIs shipped to done-conditions | Med | High | The pivotal ship-decision coherence question |
| SBF-008 | Process state | identity-cutover workstream NOT closed (WS-18 open incl WI-1239 Executing; WI-1128 full promotion pending — deploy-unblock slice landed) | Med | High | "Cutover complete" is not defensible at the process level |
| SBF-009 | identity-v2 completeness | Policy-engine tables (regimes/policy_*/allowed_models) have zero service consumers | Med | High | Designed-but-inert surface; part of the model unwired |
| SBF-010 | Billing | `hasPremiumLlm` hardcoded `false` in v2 | Low | High | Silent landmine; contained today (no live consumer) |

## Findings

### SBF-001 — Orphaned legacy subtree, prod-500-on-resurrection
- Area: cutover completeness / dead code. Sev High. Conf High.
- Claim: **Zero LIVE legacy readers** — swept at `a52b8282f`, re-verified clean at freeze
  `145e74d5e` (delta adds none; live-surface grep empty — see Q1 § Scope) — but a large legacy subtree
  (`services/profile.ts` 12/15 exports, `billing/family.ts`, `tier.ts`, `quota-*`,
  `revenuecat.ts`, `subscription-core.ts`, `alias-merge.ts`, legacy webhook handlers,
  `solo-progress-reports.ts`, `services/deletion.ts`) still imports/queries `profiles`/`accounts`/
  `subscriptions` — reachable only from each other + dead entry points, not flag-gated.
- Primary evidence: `evidence/Q1-cutover-completeness.md`.
- Counter-evidence: none live-reachable; cutover IS complete at the live-code level.
- Gap CLOSED (audit): `updateAccountEmailFromClerk` traced — only test/comment/v2-twin refs, zero live callers (dead). `artifacts/q1-updateAccountEmail-trace.txt`.
- Recommended Fable action: **decide** — is loaded-but-dead legacy acceptable for ship, or a
  WI-779 blocker? (WI-1255 shows resurrection → prod 500 is a real failure mode.)

### SBF-002 — Migration non-reproducibility
- Sev High, Conf High. Claim: terminal cutover (0117/0118/0119) is intentionally de-journaled;
  `drizzle-kit migrate` from the journal yields legacy FKs + retained `subscriptions`.
- Primary evidence: `evidence/Q3-migration-integrity.md`; `artifacts/ci-schema-build-evidence.txt`.
- **RESOLVED (2026-07-02 audit close):** CI is journal-built — `drizzle-kit migrate` at
  `ci.yml:131` (main lane) and `:496` (flag-on integration lane, "FRESH committed-migration DB").
  The freeze-only 0117/0118/0119 are out-of-journal, so CI's DB retains legacy `subscriptions` +
  legacy FKs → **CI integration tests run against a schema that matches NO deployed env.** The
  reproducibility gap is confirmed, not hypothetical.
- Recommended Fable action: **decide** if the reproducibility gap is a waived exception or a
  go-blocker, given CI cannot catch a v2-schema regression its own DB doesn't have.

### SBF-003 — Environment divergence
- Sev High, Conf High. Claim: prd (cleanest, empty), stg (orphan `subscriptions`), dev (fully
  legacy + data) — three stages. Every divergence is a tracked-open Cosmo item.
- Primary evidence: `evidence/Q2-schema-db-convergence.md`, cross-ref Q6.
- Recommended Fable action: **decide** which env is the intended target; verify promoting stg is safe.

### SBF-004 — Shell spec phase-gating stale
- Sev High, Conf High. Claim: spec §9 says person/membership "don't exist in code"; they do and
  are wired unconditionally into `/profiles`.
- Primary evidence: `evidence/Q4-*` F1; `artifacts/map-appshell-seam.md` row 1.
- Recommended Fable action: **deepen** — is the shell's S0–S3 gating logic safe given the
  unreviewed identity coupling?

### SBF-005 — Org-boundary integrity (was: cross-account leak, UNREAD — now closed)
- Sev Med, Conf Med. **Read at audit close (`profile-v2.ts:449-476`):** `listProfilesV2` is
  **org-scoped** — selects only persons with a `membership` in THIS org (the code's own words:
  "the IDOR guard: only persons with a membership in THIS org"), then attributes guardianship
  edges. `account.id = organization.id` (org maps 1:1 to the legacy account).
- Reframed risk: the mobile `getLinkedChildIds` `!isOwner` filter is safe **iff an org never
  contains two unrelated families' children**. Org == household by construction (1:1 with the
  legacy account), so the leak requires a multi-family org — an org-boundary-integrity question,
  not an unscoped read.
- Primary evidence: `apps/api/src/services/identity-v2/profile-v2.ts:449-476`; `evidence/Q4-*` F6.
- Recommended Fable action: **verify** the invariant "one org = one household" holds across
  child-creation/guardianship paths (can an org ever accrue an unrelated child membership?).

### SBF-006 — No RLS backstop + isOwner fail-open
- Sev High, Conf High. Claim: 17/18 identity-v2 tables RLS-off (verified prod+stg, all 18 checked); `isOwner`
  derived and fails open into child-study-only. NOT a regression (legacy baseline also RLS-off),
  but app-layer guards are the only defense.
- Primary evidence: `artifacts/rls-posture-note.md`; `evidence/Q4-*` F3/F4.
- Recommended Fable action: **verify** every app-layer ownership guard on
  person/subscription/financial_record; **deepen** the fail-open data-leak question.

### SBF-007 — AC/canon vs Cosmo drift
- Sev Med, Conf High. Claim: canonical plan (2026-06-30) shows supporter-gap tasks unchecked;
  Cosmo marks them Closed/Done. Unclear if closed to done-conditions.
- Primary evidence: `evidence/Q5-*`, `evidence/Q6-*` F4.
- Recommended Fable action: **verify** WI-1170/1171 shipped code vs the plan's done-conditions.

### SBF-008 — Cutover workstream open
- Sev Med, Conf High. WS-18 open incl WI-1239 Executing, WI-779 Ready; WI-1128 full freeze-repoint promotion pending (deploy-unblock slice `56b9ded15` landed — Q3-F7/Q6-F7).
- Primary evidence: `evidence/Q6-*`.
- Recommended Fable action: **decide** whether "cutover complete" is defensible with these open.

### SBF-009 — Inert policy-engine tables
- Sev Med, Conf High. Zero service consumers for regimes/policy_*/knowledge_assertions/allowed_models.
- Primary evidence: `artifacts/map-identity-v2.md`.
- Recommended Fable action: **decide** if inert identity surface affects "identity-v2 complete."

### SBF-010 — hasPremiumLlm hardcoded false
- Sev Low, Conf High. Contained (no live consumer). Evidence: `evidence/Q4-*` F5.
- Recommended Fable action: **ignore** for now; note for post-ship.

## Non-findings (checked, NOT a risk)
- **No live legacy readers/writers on origin/main** — cutover complete at the live-code level (Q1).
- **RLS absence on identity-v2 is NOT a cutover regression** — matches legacy identity baseline;
  scoped leaf tables do have RLS (`rls-posture-note.md`).
- **Zero production users corroborated** — prd v2 parents empty (Q2-F5). (Safety review still required.)

## Prep gaps
**Closed at audit close (2026-07-02) — see `05-audit-response.md`:**
- ~~`listProfilesV2` scoping~~ → read: org-scoped IDOR guard (SBF-005 reframed).
- ~~CI test-lane schema origin~~ → journal-built via `drizzle-kit migrate` (SBF-002 resolved).
- ~~`updateAccountEmailFromClerk` trace~~ → only test/comment/v2-twin refs; dead (Q1 closed).
- ~~e2e-web seam CI gating~~ → default smoke = auth/learner/parent under V2 flags; the dedicated
  `mentor-audit-registry-smoke` is opt-in, not gated (Q4 updated).

**Genuinely open for Fable:**
1. prd pre-drop Neon PITR marker for 0119 (rollback window) — needs operator/Neon console.
2. What gates the *full* WI-1128 freeze-repoint promotion (deploy-unblock slice landed) — needs the raw WI-779 Cosmo record.
3. Whether "one org = one household" invariant holds across child-creation paths (SBF-005 residual).
