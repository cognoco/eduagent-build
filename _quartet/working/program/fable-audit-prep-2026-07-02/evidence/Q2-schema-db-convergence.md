# Q2 — Schema/DB convergence

## Question
Do dev, staging, prod, and CI schemas match the intended v2-only target? Enumerate
divergences per environment.

## Scope
- Included: dev, stg, prd live catalogs — legacy identity/billing table presence, FK targets,
  row counts for identity/billing parents.
- CI test-lane schema fidelity: **RESOLVED at audit close (Q3-F6)** — journal-built, matches no
  deployed env.
- Excluded (prep): full column-level diff of every table.
- Timebox: catalog + FK + parent-table row counts only.

## Method
- Commands (all read-only catalog/count queries; no data rows, no PII, no secrets printed):
  - `doppler run --project mentomate --config {dev,stg,prd} -- psql "$DATABASE_URL" -f queries/staging-catalog.sql`
  - `… -f queries/staging-fk-targets.sql`
  - v2 parent counts: `person, organization, subscription, subscription_payers`
  - legacy counts: dev full set; stg `subscriptions`
- Raw output: `artifacts/catalog-{dev,stg,prd}.txt`, `artifacts/fk-targets-{dev,stg,prd}.txt`,
  `artifacts/rowcount-v2-{dev,stg,prd}.txt`, `artifacts/rowcount-legacy-{dev,stg}.txt`
- Timestamp: 2026-07-02 (Doppler last-fetch stg 08:02Z, prd 08:00Z same day)

## Findings

| ID | Claim | Severity | Confidence | Evidence | Gap / caveat |
| --- | --- | --- | --- | --- | --- |
| Q2-F1 | **Three environments are at three different cutover stages** (prd > stg > dev). Not one converged v2-only target. | high | high | catalog + fk artifacts, all 3 envs | Whether this is *intended* (staged rollout) vs *drift* is Q3 + operator; Fable decides. |
| Q2-F2 | **dev retains the full legacy schema WITH data** and legacy FK wiring — least converged. `accounts`=1429, `profiles`=1416, `consent_states`=155, `family_links`=21, `subscriptions`=8; quota/usage/top-up/profile_quota FKs still target legacy `profiles`+`subscriptions`. | medium | high | `catalog-dev.txt`, `fk-targets-dev.txt`, `rowcount-legacy-dev.txt` | dev iterates via `drizzle-kit push` (docs) so may be intentional; but "v2-only target" is not met in dev. |
| Q2-F3 | **stg keeps an orphaned legacy `subscriptions` table** (42 rows) with **zero inbound FKs** — all quota-child FKs already repointed to v2 `subscription`. Other legacy identity tables absent. | high | high | `catalog-stg.txt` (subscriptions present, accounts/profiles/family_links/consent_states NULL), `fk-targets-stg.txt` (all → person/subscription), `rowcount-legacy-stg.txt` (42) | Corroborates handover §4.1/§4.2 for stg. The retained table = 0119 M-SUBSCRIPTIONS-DROP not yet applied to stg (see Q3). |
| Q2-F4 | **prd is the CLEANEST env — legacy `subscriptions` already DROPPED** — inverting the usual "prod lags staging" direction. All legacy identity+billing tables absent; all FKs on v2; v2 parents EMPTY. | high | high | `catalog-prd.txt` (subscriptions NULL), `fk-targets-prd.txt` (all v2), `rowcount-v2-prd.txt` (person/org/subscription/payers all 0) | prd got 0119 drop; stg did not. Why prd is ahead of stg on the *drop* is a Fable question (Q3). |
| Q2-F5 | **prd v2 identity/billing parents are empty (0 rows)** — corroborates operator "zero production users" premise (§5). | info | high | `rowcount-v2-prd.txt` | Safety caveat (handover §5) still applies: do not relax privacy/consent/deletion review on this basis. Empty ≠ no legal/schema obligation. |

### Convergence matrix (regclass present = table exists)

| table | dev | stg | prd |
| --- | :--: | :--: | :--: |
| `accounts` (legacy) | ✅ 1429 | ❌ | ❌ |
| `profiles` (legacy) | ✅ 1416 | ❌ | ❌ |
| `family_links` (legacy) | ✅ 21 | ❌ | ❌ |
| `consent_states` (legacy) | ✅ 155 | ❌ | ❌ |
| `subscriptions` (legacy) | ✅ 8 | ✅ **42, 0 inbound FK** | ❌ dropped |
| `person` (v2) | ✅ 1353 | ✅ 261 | ✅ 0 |
| `organization` (v2) | ✅ 1361 | ✅ 168 | ✅ 0 |
| `subscription` (v2) | ✅ 6 | ✅ 55 | ✅ 0 |

### FK-target divergence (quota/usage satellites)

| satellite | dev target | stg target | prd target |
| --- | --- | --- | --- |
| `profile_quota_usage.profile_id` | `profiles` | `person` | `person` |
| `profile_quota_usage.subscription_id` | `subscriptions` | `subscription` | `subscription` |
| `quota_pools.subscription_id` | `subscriptions` | `subscription` | `subscription` |
| `top_up_credits.profile_id` | `profiles` | `person` | `person` |
| `top_up_credits.subscription_id` | `subscriptions` | `subscription` | `subscription` |
| `usage_events.profile_id` | `profiles` | `person` | `person` |
| `usage_events.subscription_id` | `subscriptions` | `subscription` | `subscription` |
| `subscription_payers.*` | `person`/`subscription` (v2) | v2 | v2 |

## Contradictions
- Handover §4.2 "reported observation": *"Zero FKs pointed at legacy subscriptions."* — TRUE for
  **stg/prd only**. **dev** has 6 FKs still pointing at legacy `profiles`/`subscriptions`. The
  handover observation was staging-scoped; the dev picture is new.
- Operator premise §5 "Staging was expected to be v2-only" — **contradicted**: stg retains the
  legacy `subscriptions` table (orphaned, 42 rows).

## Fable prompts
- Is the prd-ahead-of-stg ordering (prd dropped `subscriptions`, stg didn't) intended staged
  rollout, or an environment that was hand-applied inconsistently? What breaks if stg is
  promoted/reset from journal-only?
- Does any live code path still read stg's orphaned `subscriptions` table (42 rows)? (Feeds Q1.)
- Does CI's test-lane schema match prd's (v2-only, subscriptions dropped) or the journal's
  (legacy FKs intact)? See Q3 — the drop is NOT journaled, so a journal-built CI DB would still
  have legacy `subscriptions` + legacy FKs.
