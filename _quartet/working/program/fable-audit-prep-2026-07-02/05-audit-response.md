# 05 — Prep Self-Audit Response

This bundle was reviewed three times. **Round 1** (7 findings, substance), **Round 2**
(propagation + anchor freshness), **Round 3** (residual consistency: 5 findings). I re-verified
every finding against source rather than accept it; all were valid. This log is the authoritative
index of corrections, the **frozen anchor**, and the **freshness record**.

## Round-3 findings (residual consistency — all valid, all applied)
1. **Q1 anchored to ancestor** → re-verified "zero live legacy readers" at freeze `145e74d5e`
   (delta adds no reader; live-surface grep empty). Q1 § Scope + SBF-001 relabeled.
2. **CI-schema-origin still listed open** in structural-map / charter / Q2 / Q3 → all marked
   RESOLVED (Q3-F6: journal-built, matches no deployed env; now a decision, not discovery).
3. **`listProfilesV2` internally contradictory** (Q4 scope said "excluded/open" while Q4-F6 said
   "read") → Q4 scope line corrected to "read; residual = one-org-one-household."
4. **WI-1207 counted open without stale-note** → Q6-F6 gets the same stale-capture treatment as
   WI-1128/WI-367 (WI-1207 + WI-1120 code landed; Cosmo may lag).
5. **WI-367 policy caveat over-cautious** → verified `judge-dispatch.ts` imports no DB / no policy
   table (`git grep` @ freeze); Q4-F8 confidence restored to high (tables genuinely inert).

## ⚑ FROZEN ANCHOR & FRESHNESS (read first)

**This bundle is a point-in-time snapshot frozen at `origin/main` = `145e74d5e` (2026-07-02).**
`main` moves continuously on this shared checkout (multiple agent/CI sessions push around it), so
it advanced *three times* during prep+review. Rather than chase the tip, the bundle is FROZEN
here; Fable may re-anchor but the facts below are pinned to `145e74d5e`.

Anchor lineage and per-commit audit impact (`git log a52b8282f..145e74d5e`):

| SHA | WI | What | Impact on findings |
| --- | --- | --- | --- |
| `a52b8282f` | WI-1255 | v1-pinned deletion → v2 (prod-500 fix) | Original anchor; = Q6-F1 incident commit |
| `ed3806ef6` | WI-1120 | reduced-motion assertion (mobile test) | none (mobile test) |
| `0c053c06f` | WI-1207 | restore Journal practice access (mobile) | none (mobile) |
| `56b9ded15` | **WI-1128** | **make journal tail 0124/0128 replayable on dropped-legacy DBs** | **Q3-F7 (new), Q6-F7; supersedes "WI-1128 Blocked"** |
| `8060b4ae0` | WI-1207 | i18n keep-pattern (mobile) | none |
| `145e74d5e` | **WI-367** | exact-birth-date age gating (identity) | Q6-F7 (was open); yellow-flag on Q4-F8 "policy-engine unused" — `judge-dispatch.ts` touched |

Earlier packs cite `a52b8282f` / `a4798547e` in-line — those are **ancestors** of the freeze SHA
and remain valid as historical provenance (e.g. Q1's working-tree-vs-ref trap discussion, Q6-F1's
WI-1255 = `a52b8282f`). Live DB checks (catalog/FK/RLS/rowcount) were run against stg/prd/dev DBs
on 2026-07-02 and are point-in-time DB observations independent of the git tip.

## Round-2 honesty note
Round 1 claimed "in-place corrections applied" but only propagated to the top-of-funnel docs
(04/05) — stale claims survived in the evidence packs and maps (RLS 12/13, `listProfilesV2`
unread, WI-1128 Blocked, `updateAccountEmail` gap). That was the *same* drift the round-1 audit
flagged, re-committed. Round 2 swept **every** occurrence (owned packs edited in place; sub-agent
maps carry a superseded banner), refreshed the anchor, and folded in the WI-1128/WI-367 landings.
Lesson banked: "corrections applied" is not true until a repo-wide grep for the stale token is
clean — verify-before-claiming, not claim-then-hope.

## Round-1 findings (all valid)
Rulings + actions below. In-place corrections were applied to the affected packs; this log is the index.

| # | Auditor finding | My verification | Ruling | Action taken |
| --- | --- | --- | --- | --- |
| 1 | CI schema fidelity is answerable, left as a gap | `ci.yml:131` (main) + `:496` (integration) both `drizzle-kit migrate` on a fresh committed-migration DB; freeze 0117/0118/0119 out-of-journal → CI DB has legacy FKs + `subscriptions` | **Valid, high-value** | Added **Q3-F6** (CI journal-built → matches no deployed env); SBF-002 & fable-brief upgraded from "unknown" to resolved; evidence `artifacts/ci-schema-build-evidence.txt` |
| 2 | "0 live legacy readers" overstated — `updateAccountEmailFromClerk` untraced | `git grep` on origin/main → only tests/comments/v2-twin; definition has zero live callers | **Valid** | Closed the Q1 gap in-place; "zero live readers holds with no untraced exceptions"; evidence `artifacts/q1-updateAccountEmail-trace.txt` |
| 3 | Revision provenance inconsistent (a52b8282f vs a4798547e) | `origin/main` = `a4798547e`; the +1 commit `ed3806ef6` is mobile-test-only (reduced-motion) — no identity/billing/API | **Valid (immaterial delta)** | fable-brief anchor normalized to `a4798547e` with the mobile-test-only note; findings hold at either SHA |
| 4 | Highest-value seam gap (`listProfilesV2`) left unread | Read `profile-v2.ts:449-476`: org-scoped ("the IDOR guard"), then guardianship edges; `account.id = organization.id` | **Valid** | SBF-005 reframed from "unread/possible leak" → "org-scoped; residual = one-org-one-household invariant"; Q4-F6 unchanged pointer |
| 5 | e2e seam coverage status answerable | `test:e2e:web:smoke` = auth/learner/parent only (`package.json:42`, `e2e-web.yml:185`); `mentor-audit-registry-smoke` opt-in (`playwright.config.ts:241`) | **Valid** | Q4 "Missing integration tests" updated: default smoke runs under V2 flags but the dedicated seam-registry spec is not gated |
| 6 | RLS evidence scope (13) narrower than "18 tables" wording | Queried the 5 policy tables (stg): all RLS-off, 0 policies → **17 of 18** RLS-off | **Valid** | `rls-posture-note.md` corrected to 17/18 (all 18 checked); policy tables also inert |
| 7 | "Every claim carries source" stronger than Q1 artifacts support | Q1 sub-agent returned a reduced summary; raw zero-result greps not all persisted | **Valid** | fable-brief provenance para softened + caveated; two key Q1 greps back-filled as artifacts; rest reproducible-from-cited-command |

## My take on the meta-critique
The audit is fair and I'd rather bank it than defend the bundle. The common thread — I applied
the "Sonnet breadth, Fable depth" split too liberally and punted four **locally-answerable**
discovery gaps (CI origin, `updateAccountEmailFromClerk`, `listProfilesV2`, e2e gating) to Fable.
The handover was explicit that discovery is prep's job and "Fable tokens buy judgment, not
discovery," so those punts were the wrong kind of lazy. Findings 3/6/7 are provenance-discipline
hits, and provenance is the point of an audit bundle. Net effect of the fixes: the reproducibility
gap is now a *confirmed* high finding rather than an open question, the cutover-completeness claim
is airtight, and the seam's sharpest risk is a bounded invariant question instead of an unread
function. Two genuinely-open items remain that need the operator/Neon or the raw WI-779 Cosmo
record (prd PITR marker; the *full* WI-1128 freeze-repoint promotion gate — its deploy-unblock
slice already landed, Q3-F7) — those are correctly Fable/operator territory.
