# Q3 — Migration integrity

## Question
Are all applied schema changes journaled and reproducible via `drizzle-kit migrate`, or are
out-of-journal/manual applications creating drift? What are the consequences?

## Scope
- Included: `apps/api/drizzle/meta/_journal.json` state; `_freeze-only/` contents + intent;
  whether the FK-repoint / subscriptions-drop are journaled; the guard enforcing de-journaling;
  mapping freeze-migrations → observed per-env DB state (Q2).
- Excluded (prep): reading 0118 M-DROP in full (header summarized by 0119); executing any
  migration; CI DB build.
- Timebox: journal + freeze-only + guard read; no apply.

## Method
- `jq '.entries | length' apps/api/drizzle/meta/_journal.json` → 127; tail tag `0128_lively_kylun`.
- `rg -n -i 'drop table[^;]*subscriptions' apps/api/drizzle/*.sql` → **no journaled drop**.
- `ls apps/api/drizzle/_freeze-only/` → 0117_m_repoint, 0118_m_drop, 0119_m_subscriptions_drop.
- Read `_freeze-only/0119_m_subscriptions_drop.sql` (full), `0117_m_repoint.sql` (head 55).
- `rg -rn '_freeze-only|_m_repoint|0119_m'` → guard + docs references.
- Files: `packages/database/scripts/check-reference-only-migrations.mjs` (guard), `docs/change-classes.md`.

## Findings

| ID | Claim | Severity | Confidence | Evidence | Gap / caveat |
| --- | --- | --- | --- | --- | --- |
| Q3-F1 | **The identity/billing terminal cutover SQL is intentionally OUT OF JOURNAL.** M-REPOINT, M-DROP, M-SUBSCRIPTIONS-DROP live in `apps/api/drizzle/_freeze-only/`, carry `-- @freeze-only`, are NOT in `_journal.json` (ends 0128), so `drizzle-kit migrate` never applies them. Enforced by a guard test. | high | high | `_freeze-only/*.sql` headers; `_journal.json` len 127; `check-reference-only-migrations.mjs` | This is a *designed* mechanism (WI-586 runbook), not accidental. Severity is about consequence, not intent. |
| Q3-F2 | **`drizzle-kit migrate` from the journal does NOT reproduce prod/stg schema.** A fresh env built from the journal keeps legacy `subscriptions` + legacy FK wiring; the repoint+drop only exist as un-journaled freeze files applied by hand. | high | high | no journaled `DROP TABLE subscriptions`; Q2 prd = dropped, stg = v2 FKs — neither reachable from journal | Direct consequence for CI test-lane fidelity (Q3-F6) and any new-env bootstrap. |
| Q3-F6 | **CI is journal-built → its DB matches NO deployed env.** CI applies `drizzle-kit migrate` (`ci.yml:131` main lane, `:496` flag-on integration lane "FRESH committed-migration DB"). The out-of-journal freeze 0117/0118/0119 are never applied → CI DB retains legacy `subscriptions` + legacy FKs. So the integration suite cannot catch a v2-schema regression its own DB doesn't have. | high | high | `ci.yml:131,496`; `artifacts/ci-schema-build-evidence.txt`; cross-ref Q3-F2 | Resolves the handover's open "CI-lane fidelity" question. Added at 2026-07-02 audit close. |
| Q3-F3 | **Freeze migrations were applied to environments at DIFFERENT stages** (prd: 0117+0119; stg: 0117 only; dev: neither) — manual, per-env, out-of-journal application. | high | high | Q2 matrix cross-referenced with 0117/0119 semantics | Whether each apply had its required pre-drop Neon PITR snapshot (0119 rollback section) is unverified — Fable lead. |
| Q3-F7 | **The out-of-band drop broke the committed journal tail against prod/stg — a ~13h deploy blocker.** `drizzle-kit migrate` aborted at **0124** on staging/prod because 0124/0128 still referenced the hand-dropped `profiles`. Fixed at freeze SHA by editing **committed** migrations 0124 (repoint `retrieval_events.profile_id` FK → `person`) and 0128 (catalog-gate the `profiles` ALTERs to no-op when absent), **both immutability-allowlisted** (WI-1128 slice `56b9ded15`, operator-authorized ic-362). | high | high | `git show 56b9ded15`; `apps/api/drizzle/0124_striped_thing.sql:1-6,31`; `scripts/migration-immutability-allowlist.json` (0124, 0128) | This is Q3's thesis *materialized*: out-of-band drop + out-of-journal freeze produced a journal that could not replay on the real envs. Freeze-only 0117/0118/0119 remain out-of-journal (journal still 127 entries, tail 0128). |
| Q3-F4 | **Known schema-vs-DB lag: `billing.ts` still `.references(() => subscriptions.id)`** for the 4 quota satellites, even where the DB FK is on v2 `subscription`. Realignment deferred to WI-779 (legacy-symbol removal). DB FK is source of truth; Drizzle schema lags. | medium | high | 0119 header lines 27–31; 0117 header (accounts/profiles refs left intact) | Feeds Q1 (does any *reader* resolve through the stale schema ref?) and Q4 (seam). Ties to §1-excluded WI-779 — use WI ID only. |
| Q3-F5 | **0119 (subscriptions drop) is rollback-IMPOSSIBLE in place** — recovery is Neon PITR of the whole branch to a pre-drop marker the operator must take first. | high | high | 0119 header `## Rollback` lines 41–47 | For prd (already dropped) the window is closed unless a marker was taken. Fable: confirm a prd pre-drop snapshot exists. |

### Migration architecture (from primary headers)
- Source runbook: **WI-586 convergence runbook** / `cutover-plan-2026-06-11 §2.7` — "catalog-authoritative, mapping-driven".
- Flip gate: `IDENTITY_V2_ENABLED` (writers land on v2 model after flip).
- Ordered stages: **M-REPOINT (0117)** repoints all live FKs `profiles→person`, `subscriptions→subscription`, asserts no live FK targets a legacy parent → **M-DROP (0118)** drops 4 legacy identity tables (retains `subscriptions` + its 2 enums) → **M-SUBSCRIPTIONS-DROP (0119, WI-805 fast-follow)** drops `subscriptions` + `subscription_status`/`subscription_tier` enums once billing readers serve v2 and the flip soaked.
- `_m_` filename infix: the natural numbers 0117/0118 were taken by journaled migrations (e.g. `0117_fix_family_preferences_rls_guc`, WI-794), so freeze files use `_m_` and promote to the next free numbers at freeze.
- Guard: `check-reference-only-migrations.mjs` is the durable enforcement that these stay out of `_journal.json`.

## Contradictions
- None internal. The mechanism is self-consistent and documented; the *risk* is that its
  reproducibility gap (Q3-F2) + inconsistent per-env application (Q3-F3) are exactly what a
  "reproducible via drizzle-kit migrate" invariant would forbid. Whether that invariant is
  waived for freeze-only is an operator/Fable ruling.

## Fable prompts
- [RESOLVED — Q3-F6: CI is journal-built, matches no deployed env.] Decision for Fable: is that
  reproducibility gap a waived exception or a go-blocker, given CI can't catch a v2-schema regression?
  If journal-built, integration tests run against a schema that matches NO deployed env.
- Was a pre-drop Neon PITR marker actually taken before 0119 was applied to prd? (Rollback
  window.)
- What promotes the freeze files into the journal, and is that promotion itself gated on all
  envs being at the same stage? Today they are not (Q3-F3).
- Does `store-teardown.ts` / `account-deletion.ts` (the 5 origin/main commits) assume v2-only
  schema that dev (legacy FKs) does not have — i.e., would those code paths fail against dev?
