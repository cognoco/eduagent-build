# Fable Audit - Prep Handover

**Date:** 2026-07-02
**From:** Mentomate-productization orchestrator (Quartet)
**To:** prep agent assembling the Fable audit inputs
**Subject:** Independent audit of the identity-v2 cutover + app-shell-v2 pipelines

---

## 0. Scope & verification discipline (read first)

This handover is designed to help a cheap-tier prep agent assemble inputs for an independent Fable audit without anchoring Fable to a prior conclusion.

Rules:

- **Verified observations** are starting points only. Re-run the checks and attach fresh evidence before Fable sees them.
- **Operator-stated premises** are inputs to test, not facts to trust.
- **Navigation pointers** are leads. Repo docs and working notes can be stale; source code, database catalogs, migration journals, Cosmo records, and git history win.
- **Fable tokens buy judgment, not discovery.** Do the source mapping, evidence reduction, and breadth pass before invoking Fable.
- **No claim goes into a Fable evidence pack without provenance.** Each claim needs a source, command or file path, timestamp, and confidence.

If anything here reads as a conclusion about whether the identity cutover is done or the V2 product is shippable, treat that as a handover defect. Fable reaches those conclusions.

---

## 1. Hard exclusion (non-negotiable)

Do **not** read, cite, summarize, or build on these derived-analysis artifacts during audit prep or execution:

- `_wip/identity-cutover/2026-07-01-identity-cutover-779-strip-proposal.md` (any revision)
- `_wip/identity-cutover/strip-proposal-critique.md`
- any derivative analysis whose substance is "WI-779 strip proposal / critique / response"

Reason: these files are one agent's analysis plus review of that analysis. The operator ruled them out so the audit is not anchored to an existing conclusion.

Allowed despite the exclusion:

- Raw primary sources: schema files, migrations, tests, specs, canon, source code, git commits, DB catalogs, and Cosmo records.
- The raw Cosmo work item for **WI-779 (identity-cutover strip/residue work item)**, if needed as a primary record.
- Later independently gathered evidence that happens to touch the same underlying facts.

If a source mixes raw facts with excluded analysis, extract the raw source pointer only and verify from the primary source before using it.

---

## 2. Preflight checklist

Before any audit prep, record the execution context in the prep output:

When these commands are run from an agent shell tool, follow `AGENTS.md` / `RTK.md`: prefix executable commands with `rtk`; run shell built-ins through `rtk zsh -lc '...'`.

1. Repo path and git SHA:
   - `rtk zsh -lc pwd`
   - `rtk git rev-parse --show-toplevel`
   - `rtk git rev-parse HEAD`
   - `rtk git status --short`
2. Exclusion acknowledgement:
   - list the excluded paths from §1;
   - confirm they were not read.
3. Tooling:
   - confirm `doppler`, `psql`, `node`, `pnpm`, `jq`, and `gh` availability as needed;
   - do not print secrets or resolved database URLs.
4. Environment access:
   - confirm which Doppler configs can run `psql "$DATABASE_URL"` (`dev`, `stg`, `prd`);
   - record failures verbatim, without exposing secret values.
5. Output directory:
   - create a dated prep folder, e.g. `_quartet/working/program/fable-audit-prep-2026-07-02/`;
   - place all maps, evidence packs, query outputs, and findings there.

---

## 3. Audit approach agreed with the operator (B + D + E)

The operator chose a composed approach:

- **B - Ultracode map-first.** Run a `/workflow` ultracode or equivalent fan-out using Sonnet workers to build the structural map of identity-v2, app-shell-v2, and the seam between them. Fable audits the map and evidence, not the raw monorepo.
- **D - Question-driven.** Reduce the audit to a small Charter. Each Charter question gets a focused evidence pack.
- **E - Two-tier verify.** Sonnet does the breadth-first risk pass. Fable then verifies, deepens, and challenges the high-stakes or contested findings.

Prep-agent deliverables before Fable:

1. `01-structural-map.md` - identity-v2, app-shell-v2, and seam map.
2. `02-charter.md` - final Charter questions, with required vs timeboxed scope.
3. `evidence/` - one evidence pack per Charter question.
4. `03-sonnet-breadth-findings.md` - tier-1 findings/risk list.
5. `04-fable-brief.md` - concise Fable input package linking to the evidence packs, with no excluded-analysis contamination.

Fable then does:

- adversarial verification of the flagged findings;
- answers the Charter;
- produces a risk register with severity and confidence;
- recommends decisions for:
  1. identity-cutover completion go/no-go;
  2. V2 product ship/hold.

Reusable-pattern note: if this process works, the operator wants it codified as a reusable "Fable audit kit" with Charter templates, evidence-pack tiering, and the B/D/E composition.

---

## 4. Verified observations to re-run before relying

The following were checked during the 2026-07-02 session and must be re-verified by the prep agent. Preserve fresh command output in the prep folder.

### 4.1 Staging DB catalog

Reported observation:

- legacy `subscriptions` table: present, 42 rows.
- legacy `accounts`, `profiles`, `family_links`, `consent_states`: absent (`to_regclass` returned NULL).
- v2 `subscription`, `person`, `organization`: present.

Save as `queries/staging-catalog.sql` in the prep output directory:

```sql
SELECT
  name,
  to_regclass(name) AS regclass
FROM (VALUES
  ('public.subscriptions'),
  ('public.accounts'),
  ('public.profiles'),
  ('public.family_links'),
  ('public.consent_states'),
  ('public.subscription'),
  ('public.person'),
  ('public.organization')
) AS t(name)
ORDER BY name;
```

Re-run shape:

```bash
PREP_DIR="$PWD/_quartet/working/program/fable-audit-prep-2026-07-02"
rtk doppler run --project mentomate --config stg -- \
  sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$1"' \
  sh "$PREP_DIR/queries/staging-catalog.sql"
```

If `public.subscriptions` exists, count it:

```bash
rtk doppler run --project mentomate --config stg -- \
  sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.subscriptions;"'
```

### 4.2 Staging FK targets

Reported observation:

- `quota_pools`, `top_up_credits`, `usage_events`, `profile_quota_usage`, and `subscription_payers` had FKs pointing at v2 `subscription`.
- Zero FKs pointed at legacy `subscriptions`.

Save as `queries/staging-fk-targets.sql` in the prep output directory:

```sql
SELECT
  conrelid::regclass AS source_table,
  conname,
  confrelid::regclass AS target_table
FROM pg_constraint
WHERE contype = 'f'
  AND (
    conrelid::regclass::text IN (
      'quota_pools',
      'top_up_credits',
      'usage_events',
      'profile_quota_usage',
      'subscription_payers'
    )
    OR confrelid::regclass::text IN ('subscription', 'subscriptions')
  )
ORDER BY source_table::text, conname;
```

Re-run shape:

```bash
PREP_DIR="$PWD/_quartet/working/program/fable-audit-prep-2026-07-02"
rtk doppler run --project mentomate --config stg -- \
  sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$1"' \
  sh "$PREP_DIR/queries/staging-fk-targets.sql"
```

### 4.3 Tooling / secrets

Reported observation:

- `doppler` CLI present.
- Doppler project `mentomate` has configs `dev`, `stg`, `prd`.
- `DATABASE_URL` is the DB secret per config.
- `psql` and `node` are available.
- Bulk Notion MCP queries are plan-gated; per-page + REST via `NOTION_TOKEN` work.

Re-run without printing secret values:

```bash
rtk zsh -lc 'command -v doppler && command -v psql && command -v node'
rtk doppler configs --project mentomate
rtk doppler run --project mentomate --config dev -- sh -c 'test -n "$DATABASE_URL" && echo "dev: DATABASE_URL present"'
rtk doppler run --project mentomate --config stg -- sh -c 'test -n "$DATABASE_URL" && echo "stg: DATABASE_URL present"'
rtk doppler run --project mentomate --config prd -- sh -c 'test -n "$DATABASE_URL" && echo "prd: DATABASE_URL present"'
```

### 4.4 Repo pointer sanity checks

Confirmed in this checkout on 2026-07-02:

- v2 identity schema path: `packages/database/src/schema/identity.ts`.
- legacy profile/billing schema paths:
  - `packages/database/src/schema/profiles.ts`
  - `packages/database/src/schema/billing.ts`
- migration directory: `apps/api/drizzle/`.
- out-of-journal freeze directory: `apps/api/drizzle/_freeze-only/`.
- app-shell flags include `MODE_NAV_V0_ENABLED`, `MODE_NAV_V1_ENABLED`, and `MODE_NAV_V2_ENABLED` in `apps/mobile/src/lib/feature-flags.ts`.

Re-run shape:

```bash
rtk fd -a '^(identity|profiles|billing)\.ts$' packages apps
rtk fd -a '^(_freeze-only|drizzle)$' apps/api packages
rtk rg -n 'MODE_NAV|EXPO_PUBLIC_ENABLE_MODE_NAV' \
  apps/mobile/src/lib/feature-flags.ts \
  apps/mobile/eas.json \
  .github/workflows/ci.yml
```

### 4.5 Process observations

Reported observations from the 2026-07-02 session:

- **WI-1102** had an acceptance-criteria clause superseded by later work.
- **WI-1118** had acceptance criteria requiring a topicless notes endpoint that the ratified `felt-knowing-loop` spec refutes.
- **WI-1120** had internally contradictory reduced-motion behavior criteria.
- **WI-1246** fixed a `/commit` worktree-to-shared-main fork hazard; a husky client-side main guard is now live on `main`.

Treat these as data points only. Re-verify through Cosmo, git, and reviewer logs before using them to support any process finding.

Unknowns not independently verified in the source session:

- completeness of legacy-table reader/writer removal in code;
- FK inventory in dev and prod;
- migration-journal state;
- CI test-lane schema fidelity;
- internal state of app-shell-v2 code;
- whether prod matches the intended target.

---

## 5. Operator-stated premises to test

The operator stated the following. They shape the audit but are not established facts:

- **Zero production users.** Verify before relying.
- **Data in dev and staging is low-to-zero value / disposable.** Verify before relying.
- **identity-v2 and app-shell-v2 were not co-designed.** The operator says they were built separately and "not built to fit directly with each other." The seam between them is the priority audit target.
- **Most identity cutover work happened around mid-June 2026.** The operator describes the current state as residual cleanup rather than an active cutover.
- **Staging was expected to be v2-only.** The reported staging catalog check found one legacy table still present, so premises need verification.

Safety caveat: even if there are zero production users and disposable non-prod data, do not relax privacy, security, deletion, consent, billing, or retention review until the environment and data-classification facts are verified.

---

## 6. Navigation pointers (leads, not conclusions)

Confirm all pointers before relying on them.

### 6.1 Identity data model

- v2 schema: `packages/database/src/schema/identity.ts`.
  - Expected table family includes `person`, `login`, `organization`, `membership`, `subscription`, `guardianship`, `supportership`, `consent_grant`, `consent_receipt`, `deletion_audit`, `financial_record`, policy/regime tables, knowledge assertions, allowed models, and `subscription_payers`.
- legacy schema:
  - `packages/database/src/schema/profiles.ts` (`accounts`, `profiles`, `family_links`, `consent_states`, plus related profile-era tables);
  - `packages/database/src/schema/billing.ts` (`subscriptions`, quota/usage/top-up tables unless repointed).
- canon:
  - `docs/canon/identity/`
  - `docs/adr/MMT-ADR-0012*`
  - related identity ADRs/specs discovered from `docs/INDEX.md`.
- migrations:
  - journaled: `apps/api/drizzle/`;
  - freeze-only / out-of-journal: `apps/api/drizzle/_freeze-only/`.

Audit note: `_freeze-only/` is a high-value migration-integrity vein. Investigate what is there, why it is out of journal, whether it was ever applied manually, and whether it causes environment divergence.

### 6.2 App-shell-v2

- spec:
  - `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`
  - `docs/specs/2026-06-27-felt-knowing-loop.md`
- navigation and shell contracts:
  - `apps/mobile/src/lib/navigation-contract.ts`
  - `apps/mobile/src/lib/legacy-navigation-contract.ts`
  - `apps/mobile/src/lib/feature-flags.ts`
- flags to verify per environment/build:
  - `MODE_NAV_V0_ENABLED` / `EXPO_PUBLIC_ENABLE_MODE_NAV`
  - `MODE_NAV_V1_ENABLED` / `EXPO_PUBLIC_ENABLE_MODE_NAV_V1`
  - `MODE_NAV_V2_ENABLED` / `EXPO_PUBLIC_ENABLE_MODE_NAV_V2`
- supporting docs:
  - `AGENTS.md` section "Profile Shapes"
  - `docs/audience-matrix.md`
  - `docs/flows/mobile-app-flow-inventory.md`

Audit note: nav mode is per environment and per build profile. Do not write "production uses X" until you have checked the actual profile and flag sources.

### 6.3 The identity-v2 to app-shell-v2 seam

There is no single seam file. Map all places where:

- mobile/shell code consumes identity shape: profiles/person, roles, ownership, guardianship, supportership, age, consent, subscriptions, and app context;
- API routes/services serve those shapes;
- shared schemas define the mobile-facing contract;
- tests assert old `profile` behavior while code now expects `person`, or vice versa;
- feature flags cause one shell to see a different identity shape than another shell;
- billing/subscription assumptions cross the legacy `subscriptions` vs v2 `subscription` boundary.

The seam map should identify both directions:

- shell assumptions identity-v2 may not satisfy;
- identity-v2 outputs the shell may not consume correctly.

---

## 7. Charter questions

Keep the Charter small enough that each question receives a serious evidence pack.

### Required Charter

1. **Cutover completeness:** Do any production code paths still read or write legacy identity/billing tables? Verify via Drizzle table references, imports, raw SQL, route/service paths, and tests. Do not rely on English text grep alone.
2. **Schema/DB convergence:** Do dev, staging, prod, and CI schemas match the intended v2-only target? Enumerate divergences per environment.
3. **Migration integrity:** Are all applied schema changes journaled and reproducible via `drizzle-kit migrate`, or are out-of-journal/manual applications creating drift? What are the consequences?
4. **Identity-v2 to app-shell-v2 seam:** Where does one system assume a shape, role, flag, or state the other system does not provide? What integration gaps would unit tests inside either system miss?

### Timeboxed Charter

5. **AC / canon / shipped-reality coherence:** Are work-item acceptance criteria aligned with ratified specs and actual shipped behavior, or are there systemic signs of drift?
6. **Process/state integrity:** Does Cosmo state match reality for the relevant workstreams and high-impact work items?

### Synthesized decision

Do not treat "V2 publish-readiness" as a separate broad discovery question. It is the synthesized Fable answer produced from the required Charter plus timeboxed findings:

- identity-cutover completion: go / no-go / conditional go;
- V2 product: ship / hold / conditional ship;
- explicit conditions, owners, and verification required for any conditional recommendation.

---

## 8. Evidence pack contract

Each Charter question gets one evidence pack in `evidence/`, named predictably:

- `evidence/Q1-cutover-completeness.md`
- `evidence/Q2-schema-db-convergence.md`
- `evidence/Q3-migration-integrity.md`
- `evidence/Q4-identity-app-shell-seam.md`
- optional `evidence/Q5-ac-canon-shipped-coherence.md`
- optional `evidence/Q6-process-state-integrity.md`

Use this template:

```markdown
# Q<N> - <question name>

## Question
<exact Charter question>

## Scope
- Included:
- Excluded:
- Timebox:

## Method
- Commands run:
- Files inspected:
- DB environments queried:
- Cosmo/Notion records queried:

## Findings
| ID | Claim | Severity | Confidence | Evidence | Gap / caveat |
| --- | --- | --- | --- | --- | --- |
| Q<N>-F1 |  | critical/high/medium/low/info | high/medium/low | file:line, command output, DB query, Cosmo page |  |

## Evidence excerpts
Short, source-linked excerpts only. Prefer file paths, command outputs, and concise summaries over long paste dumps.

## Contradictions
- <source A says X; source B says Y; what was done to resolve it>

## Fable prompts
- <specific question Fable should answer from this pack>
```

Evidence quality rules:

- Prefer primary sources over summaries.
- Include exact file paths and line numbers where possible.
- Store full command output separately when long, and link to it.
- Label inferred conclusions explicitly as inference.
- Do not include excluded §1 material.

---

## 9. Structural map contract

`01-structural-map.md` should be a map, not a narrative essay. Required sections:

1. **System boundaries**
   - identity-v2 files, tables, migrations, routes/services, shared schemas;
   - app-shell-v2 files, flags, navigation contracts, screens, tests.
2. **Data contracts**
   - API response shapes consumed by mobile;
   - shared schemas/types;
   - DB tables behind each contract.
3. **Flag matrix**
   - local, CI, dev/preview, staging, production if discoverable;
   - V0/V1/V2 mode flags and source of truth.
4. **Legacy-to-v2 dependency map**
   - table references;
   - imports;
   - FK targets;
   - migration sequence;
   - tests still exercising legacy paths.
5. **Seam inventory**
   - identity facts consumed by app shell;
   - app-shell assumptions identity must satisfy;
   - missing integration tests.
6. **Open gaps**
   - things not yet verified;
   - blocked checks;
   - facts needing operator confirmation.

---

## 10. Sonnet breadth-first findings contract

`03-sonnet-breadth-findings.md` should be optimized for Fable triage:

```markdown
# Sonnet Breadth Findings

## Executive risk list
| ID | Area | Finding | Severity | Confidence | Why Fable should care |
| --- | --- | --- | --- | --- | --- |

## Findings
### SBF-001 - <short name>
- Area:
- Severity:
- Confidence:
- Claim:
- Primary evidence:
- Counter-evidence:
- Gap:
- Recommended Fable action: verify / deepen / ignore / decide

## Non-findings
Important risks checked and not found, with evidence.

## Prep gaps
Checks not completed before Fable, with reason.
```

Severity definitions:

- **Critical:** can cause wrong user/account/data access, irreversible data loss, broken billing/deletion/consent guarantees, or invalid ship/go decision.
- **High:** likely user-visible breakage, environment drift that blocks safe deployment, or major untested seam.
- **Medium:** meaningful defect or process inconsistency with bounded impact.
- **Low:** cleanup, documentation drift, or low-impact inconsistency.
- **Info:** useful context but not a risk by itself.

Confidence definitions:

- **High:** primary source evidence plus at least one corroborating check.
- **Medium:** primary source evidence, but incomplete corroboration.
- **Low:** plausible signal requiring verification.

---

## 11. Process/state recon sources

The operator wants the audit to cover Cosmo plus Quartet ecosystem state, not only the codebase.

- **Cosmo Work Items DB:** `f170be9e04ae45d4961828f2438666bd`.
  - **WS-18 (identity cutover):** `3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8`.
  - **WS-28 (v2 finalization):** `38f8bce9-1f7c-8185-96b2-e79cb1a458fe`.
  - Also inspect **WS-25 (review backlog)** where relevant.
  - Query via REST with `NOTION_TOKEN` if bulk MCP is plan-gated.
  - Read Stage, AC, Resolution, Workstream, Fixed In, comments, and related/blocking links.
- **Quartet channel logs:**
  - `_wip/identity-cutover/_state/inbox.jsonl`
  - `_wip/identity-cutover/_state/outbox.jsonl`
  - `_wip/bug-lane/_state/inbox.jsonl`
  - `_wip/bug-lane/_state/outbox.jsonl`
  - `_quartet/working/lanes/v2-finalization/_state/inbox.jsonl`
  - `_quartet/working/lanes/v2-finalization/_state/outbox.jsonl`
- **Session narratives:**
  - `_quartet/_quartet-wip/session-handoff.md`
  - `_wip/identity-cutover/_state/SESSION-HANDOFF.md`
  - `_wip/bug-lane/_state/SESSION-HANDOFF.md`
  - `_quartet/working/lanes/v2-finalization/_state/shepherd-live-state.md`

Working-tree channel logs are not durable truth. They can be append-only in intent but still silently revert during non-fast-forward reconciliation. Use them for leads and timeline reconstruction; cross-check load-bearing claims against Cosmo, git, and source.

Distill raw logs into:

- a decisions ledger;
- a workstream state table;
- a contradiction list;
- only then feed Fable the reduced state.

---

## 12. What to hand back

Return the prep bundle with:

1. `01-structural-map.md`
2. `02-charter.md`
3. `evidence/*.md`
4. `03-sonnet-breadth-findings.md`
5. `04-fable-brief.md`
6. command-output artifacts referenced by the evidence packs

The final `04-fable-brief.md` should contain:

- one-page context;
- final Charter;
- top findings table;
- links to evidence packs;
- explicit list of unresolved gaps;
- confirmation that excluded §1 analysis was not used.

Before handing off, run a contamination check:

```bash
rtk rg -n 'strip-proposal|strip proposal|proposal critique|conditional-ship|2026-07-01-identity-cutover-779-strip-proposal' \
  _quartet/working/program/fable-audit-prep-2026-07-02
```

Any hit must be removed unless it is only the exclusion acknowledgement.

---

## 13. Final instruction to prep agent

Do your own reconnaissance first. Confirm §4, test §5, walk §6 and §11, and revise the Charter where reality differs from this handover.

If fresh reconnaissance contradicts this document, the fresh evidence wins. Record the contradiction so the reusable Fable audit kit can improve.
