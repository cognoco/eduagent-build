# Artefact-consistency — consolidated overview

**Date:** 2026-05-02
**Scope:** Synthesis of six audit lenses + the existing punch list, viewed through three lenses. Helicopter view for human decision-making, not an execution tracker — the punch list keeps that role.
**Companion:** `docs/audit/2026-05-02-artefact-consistency-punchlist.md`
**Inputs:** Six audit lenses (TYPES-1, TESTS-1, MOBILE-1, PACKAGE-SCRIPTS-1, DEPENDENCY-DRIFT-1, SCHEMA-2); the punch list; the cleanup-triage baseline (parallel granularity, separate track); PR #137 review-validation doc (already-shipped findings).

---

## 1. Coverage statement

**Audited (6 lenses).** Six read-only audits cover the codebase as of 2026-05-02. Five ran over 2026-05-01 → 2026-05-02 against the artefact-consistency template at `docs/audit/_audit-report-template.md`: response-schema completeness and typed-error hierarchy in `packages/schemas/` (TYPES-1); test-density and integration mock boundaries (TESTS-1); mobile router/persona/token compliance (MOBILE-1); monorepo `package.json` scripts and CLAUDE.md handy-command resolution (PACKAGE-SCRIPTS-1); dependency hygiene across the 7 workspace manifests including phantom/orphan deps and lockfile freshness (DEPENDENCY-DRIFT-1). The sixth lens is **SCHEMA-2** (`docs/audit/2026-05-02-audit-schema-2-plan.md`) — a hybrid audit-plus-remediation doc whose audit half catalogues 36 of 41 API route files (88%) calling `c.json` without runtime validation, and whose plan half is now superseded on the schema-count claim by TYPES-1's correction (22 response schemas exist, not the ~50 SCHEMA-2 originally claimed). The 5 template-conformant lenses live at `docs/audit/2026-05-02-audit-{name}-1-recon.md`; SCHEMA-2's lens predates the template.

**Audit staleness.** Audit corpus reflects codebase state as of 2026-05-02. Zero source-code commits have landed since; the only post-audit commits are within `docs/audit/` itself (housekeeping). Findings can be treated as current.

**Already-shipped baseline.** 14 items shipped via PRs #131–#137 between 2026-04-30 and 2026-05-02 (full table in punch list). PR #137's three review-comment findings were validated and shipped via PR #139 (in flight at synthesis time); the validation reasoning is captured in `docs/audit/2026-05-02-pr-137-review-validation.md`. None of these are counted into the magnitude estimate below — this overview describes remaining work, with shipped items used only as evidence for the meta-pattern in §2.

**Cleanup-triage runs in parallel.** The 2026-04-30 cleanup-triage doc separately catalogues 164 active files (25 Cat 1 obsolete, 23 Cat 2 possibly-obsolete, 116 Cat 3 keep) plus 8 inbound-link conflicts requiring co-changes. That work has its own granularity (per-file) and is not merged into the pattern-level clusters below. Where a cluster intersects cleanup-triage items, the intersection is named explicitly.

**Not audited (see §9).** CI workflows, external-service integrations beyond the SCHEMA-2 surface, infrastructure-as-code, secrets/Doppler scope mapping, observability dashboards, security/auth surfaces outside SCHEMA-2's 36 RAW list, performance/cost. These are acknowledged blind spots, not new audits proposed.

---

## 2. Meta-pattern

A consistent pattern recurs across the audit corpus: **the team fixes drift locally and does not sweep backward**. Each fresh observation lands cleanly; the equivalent class of fix at sibling locations gets left behind. Concrete witnesses across the audit corpus:

- **DEP-DRIFT F1** — apps/mobile evolved past the original Nx scaffold's root `package.json`; 14 mobile-runtime deps are version-drifted because mobile got the bumps, root did not.
- **PACKAGE-SCRIPTS F1** — PR #131 renamed three of four `db:*:stg → db:*:dev`; `db:generate` (the fourth) was missed.
- **PACKAGE-SCRIPTS F5** — `pnpm test:e2e` got a friendly maestro-PATH barricade; `nx run mobile:e2e` did not (same Unicode failure mode, no guard).
- **MOBILE-1 F1** — six nested layouts comply with `unstable_settings`; three (including the four-child `child/[profileId]`) do not.
- **SCHEMA-2** — `bookmarks.ts` adopted `responseSchema.parse()` before `c.json()`; 35 other route files (88% of the 41 audited) did not. The exemplar is on disk; the sweep that should have followed it isn't. This is the cleanest single expression of the meta-pattern in the audit corpus.
- **TYPES-1 F1, F4** — typed-error hierarchy half-consolidated (`ForbiddenError` migrated; `QuotaExceededError`, `ResourceGoneError` did not). Schemas package authored 22 response schemas, only 3 are wired up.
- **TESTS-1 F3** — schemas exist in `@eduagent/schemas` (TYPES-1 witness); route handlers don't `parse()` against them (SCHEMA-2 witness); tests don't assert against them either. Three facets of one half-finished migration, observed independently by three different audit lenses.
- **AUDIT-INNGEST-2** (already on punch list) — PR #132 added the `app/payment.failed` observer; three sibling orphan events from the same era were not swept.
- **AUDIT-SPECS-2** (already on punch list) — RLS plan's reconciliation header in PR #131 says "Phase 0.0 done"; the inline status table inside the same file still says "NOT DONE."

**Falsification check.** Not every finding fits the pattern. Roughly 25–30% don't:

- **PACKAGE-SCRIPTS F2, F3** — `apps/api` has no eslint config and no `tsconfig.lib.json`/`tsconfig.spec.json`. This is not a failed sweep — it's a configuration outlier that was *never* established. Different root cause (originating gap, not sweep gap).
- **DEP-DRIFT F2, F3** — phantom deps (`@eduagent/test-utils` in apps/api; `@react-navigation/native` in apps/mobile) reflect "imported without ever being declared," not "declared then drifted." A different shape of mistake.
- **MOBILE-1 F4** — `RemediationCard` persona-keyed strings is a fresh governance question, not a swept-and-missed item.
- **DEP-DRIFT F8** — Prettier is one major version behind; that's deferred-upgrade tax, not local-fix-without-sweep.

The pattern fits the majority of findings but is not universal. Treat it as the dominant, not exclusive, theme.

---

## 3. Cluster matrix

Eight clusters span the consolidated findings. Same set is regrouped three ways in §4–§6.

| # | Cluster | Root cause | Artifact | Fix shape | Evidence | Severity (recalibrated) |
|---|---|---|---|---|---|---|
| C1 | Schema contract enforcement | Schemas exist, are not load-bearing; runtime parse missing on 88% of routes; tests don't assert against schemas either | code | multi-PR | cross-confirmed | **RED** (was YELLOW-RED; promoted: gates C2 timing) |
| C2 | Test integration boundary | Internal Inngest + database mocks in integration tests defeat their purpose | tests | multi-PR | cross-confirmed | YELLOW |
| C3 | Mobile navigation safety nets | 3 layouts missing `unstable_settings` + 1 cross-tab push missing parent-first chain | code | one-PR | single-source (MOBILE-1) but rule is explicit in CLAUDE.md | YELLOW |
| C4 | Mobile design system drift | Hardcoded hex codes in `session/index.tsx`; persona-keyed strings in shared component; deferred aggregate sweep | code | mixed (one-PR + governance + deferred) | cross-confirmed | YELLOW |
| C5 | Manifest & dep-declaration hygiene | Root package.json is a junk drawer (24 mobile deps, 14 drifted); 2 phantom deps; naming/path inconsistencies | configs | multi-PR | cross-confirmed | **RED** (was YELLOW-RED; promoted: structural, largest single violation in batch) |
| C6 | apps/api config & E2E symmetry | `apps/api` is the only workspace member without eslint/tsconfig completeness; e2e maestro-PATH guard asymmetric between pnpm and nx | configs | one-PR + governance | cross-confirmed | YELLOW |
| C7 | Doc & plan reconciliation | Plans, CLAUDE.md, and SCHEMA-2 plan contradict the code they describe | docs | quick-sweep + governance | cross-confirmed | YELLOW |
| C8 | Track C archeology | Dead snapshots, dead memory files, missing READMEs, orphan deps, deferred upgrades | mixed | multi-PR (independent items) | cross-confirmed | GREEN-leaning-YELLOW |

Severity recalibration applied per plan: C1 promoted to RED (gates C2 paired test migration); C5 promoted to RED (largest structural violation; latent build-break risk on `pnpm install` after registry update). All other audit-supplied severities preserved.

---

## 4. Lens A — by root cause

**Half-finished migrations (C1, C5).** The biggest two clusters are both half-done sweeps. C1 is the response-schema migration — `bookmarks.ts` adopted the pattern, 35 other route files did not, and the schemas package itself has 16 dead-by-orphan exports. C5 is the manifest cleanup — apps/mobile evolved past the Nx scaffold root, but root `package.json` was never reconciled, leaving 24 duplicated and 14 drifted dep declarations. Both share the meta-pattern: a visible exemplar of the right approach exists on disk; the sweep that should have followed didn't.

**Implicit contracts that should be explicit (C2, C6).** C2 is integration tests that mock the very modules they're supposed to integrate (`@eduagent/database`, internal Inngest client). C6 is `apps/api` relying on plugin inference instead of declarative configs (no `eslint.config.*`, no `tsconfig.lib.json`/`tsconfig.spec.json`). Both work today; both depend on hidden machinery that can shift across tooling upgrades. Both want the contract on the page rather than in the runtime.

**Documented rules with violations (C3, C4).** C3 is direct violation of the CLAUDE.md `unstable_settings` rule on three layouts and the cross-tab push-the-chain rule in one component. C4 is direct violation of the "shared mobile components stay persona-unaware" / "use semantic tokens" rules. The rules are written; the violations exist; the fix is mechanical for C3 and partly mechanical / partly governance for C4.

**Drift between sources of truth (C7).** Plans claim things the code has done (RLS plan), CLAUDE.md hardcodes machine-specific paths, the SCHEMA-2 plan claims ~50 schemas where actually 22 exist, the cleanup-triage doc has 8 inbound-link conflicts requiring co-changes. Each item is small; the cluster is the meta-issue: docs and code don't agree on what's true.

**Accumulated low-stakes hygiene (C8).** 10 missing Drizzle snapshot files, ~96 memory files for dedupe, vendored bmad commands vs. installed plugin, MentoMate → Mentomate rename sweep, 4 orphan deps, Prettier-3 upgrade. None of it is urgent; all of it accrues entropy if ignored indefinitely.

---

## 5. Lens B — by artifact type

**Code (C1, C3, C4).** The largest absolute file count sits in code. C1 alone touches ~36 route files plus ~16 schema modules plus the typed-error hierarchy migration. C3 and C4 are smaller (3 layouts + 1 component for C3; ~10 hex-code lines + 1 persona discussion + a deferred ~50–80-site sweep for C4). Code-cluster fixes are the ones an agent can execute fastest mechanically; review and shape decisions dominate human time.

**Tests (C2).** Two distinct subclusters: 5 integration tests that mock Inngest, and 2 setup files that mock `@eduagent/database` globally. The latter has unclear blast radius (depends on which integration tests actually consume the global setup) and likely needs a small infrastructure plan for a real-DB harness before remediation.

**Configs (C5, C6).** The structural mess. Three `package.json` files (root + apps/api + apps/mobile) need coordinated edits for C5, plus regenerating the lockfile. C6 wants new config files in `apps/api` (`eslint.config.mjs`, `tsconfig.lib.json`, `tsconfig.spec.json`) and small edits to `nx.json` and root `package.json`. None of these are large diffs; the human-side decision overhead is what makes them YELLOW-RED, not the file count.

**Docs (C7).** Mostly small reconciliation edits across plans, CLAUDE.md, and the SCHEMA-2 plan, plus 2 new Inngest observer functions (mirror existing `payment-failed-observe.ts`). The 8 cleanup-triage inbound conflicts touch this cluster directly — when cleanup-triage executes, C7 should run in lockstep so the link-redirects and the doc reconciliations land together.

**Mixed (C8).** Migrations, memory, vendored skills, READMEs, deps, formatting. Independent items per Track C history, suitable for either one large janitor PR or many small ones — execution shape is a process choice, not a technical constraint.

---

## 6. Lens C — by fix shape

**Multi-PR initiatives (C1, C2).** C1 is the largest single line of work in this consolidation. SCHEMA-2's plan proposed 3–4 PRs based on "wrap c.json calls"; TYPES-1's correction reframes ~23 of those PRs as "author the schema first, then wrap" — meaningfully larger scope. C2 should run paired with C1 so test-side parsing migrations land alongside route-side wrapping; doing them serially would mean two passes across the same files.

**One-PR cleanups (C3, C6).** Both are small in total surface area but high in decision overhead per artifact. C3 is mechanical (3 layout edits + 1 component edit) — a single bundled PR is the natural shape. C6 is decisions-in-a-trench-coat: explicit eslint config or explicit nx targets? Resolve sessions.ts drizzle exception or accept it permanently? Mirror maestro guard or remove the broken scripts? Each is bounded.

**Mixed-shape clusters (C4, C5, C7).** Each splits into sub-fixes with different shapes. C4 = one-PR for `session/index.tsx` (10 hex codes mapped to tokens); governance call for `RemediationCard`; deferred multi-day sweep for the ~50–80 production residue. C5 = the heavy "1a" PR (architectural call: which deps belong at root) plus six quick-sweep cleanups (1b–g) plus one deferred "1h" Prettier upgrade. C7 = quick-sweeps for the doc edits plus governance for `AUDIT-GOVERNING-1d` CLAUDE.md sweep plus a one-PR for the 2 new Inngest observers.

**Quick-sweep / janitor work (C8).** Standalone-shippable items that benefit from being landed individually for clean git blame. Ten or so independent fixes, each ~5–30 min agent-exec.

---

## 7. Magnitude estimate

| Cluster | Findings rolled up | Files affected | Agent-exec | Human review/decide | Decision overhead |
|---|---|---|---|---|---|
| C1 Schema contract | TYPES-1 F1–F5; TESTS-1 F3; SCHEMA-2 plan | ~36 routes + ~16 schema modules + 3 priority test files + 2 mobile error classes | ~3–5 hr | ~6–12 hr | HIGH |
| C2 Test boundary | TESTS-1 F1, F2 | 5 integration tests + 2 setup files + new harness | ~1–3 hr | hours-to-day | HIGH |
| C3 Mobile nav safety | MOBILE-1 F1, F2 | 3 layouts + 1 component | ~5–10 min¹ | ~30 min | LOW |
| C4 Mobile design drift | MOBILE-1 F3, F4, F5 | 1 screen + 1 component + ~50–80 deferred sites | ~15–30 min (immediate) | ~1 hr + governance | MED |
| C5 Manifest hygiene | DEP-DRIFT F1, F2, F3, F7; PACKAGE-SCRIPTS F1, F7 | root package.json + apps/mobile + apps/api + pnpm-workspace + CLAUDE.md | ~25–40 min | ~2–4 hr | HIGH (1a only) |
| C6 apps/api config | PACKAGE-SCRIPTS F2, F3, F4, F5; AUDIT-GOVERNING-2 | apps/api/{eslint,tsconfig.lib,tsconfig.spec,project.json} + nx.json + sessions.ts + package.json | ~30–45 min | ~1–2 hr | MED |
| C7 Doc reconciliation | AUDIT-INNGEST-2; AUDIT-SPECS-2; AUDIT-GOVERNING-1d; TYPES-1 F5; cleanup-triage C1–C8 conflicts | ~10 docs/plans + 2 new Inngest observers + CLAUDE.md | ~30–60 min | ~1–2 hr | LOW |
| C8 Track C archeology | AUDIT-MIGRATIONS-{1,2,3-SWEEP}; AUDIT-MEMORY-2; AUDIT-SKILLS-2; AUDIT-EXTREFS-{2,3}; DEP-DRIFT F4, F5, F6, F8; PACKAGE-SCRIPTS F6 | ~10–15 small surfaces | ~3–4 hr | ~3–5 hr | LOW |
| **Totals (excluding cleanup-triage 164 files)** | **~30 deduped findings** | **~120 files touched** | **~9–14 hr agent-exec** | **~17–28 hr human time** | — |

¹ Agent-exec for C3 is downward-adjusted from MOBILE-1's "~10 min per layout" inherited estimate. A coding agent can produce three layout exports plus a component edit in single-digit minutes. The 30-minute per-layout estimate is human-baseline. Same logic applied throughout: where the source audit gave a single human-baseline number, the agent-exec column is reduced by 5–10× per the plan's recalibration rule. Human review/decide is unaffected.

**Severity distribution (recalibrated):** 2 RED (C1, C5), 5 YELLOW (C2, C3, C4, C6, C7), 1 GREEN-leaning-YELLOW (C8). Bimodal — the two RED clusters together account for roughly 60% of total agent-execution time and 50% of human time.

**Cleanup-triage parallel baseline.** 164 files in three categories (25 Cat 1, 23 Cat 2, 116 Cat 3) plus 8 inbound conflicts. Execution time dominated by human review of category assignments rather than mechanical edits. Not summed into the totals above — runs in parallel.

---

## 8. Dependencies between clusters

Structural information only. Sequencing decisions belong to the user.

- **C1 (Schema) ↔ C2 (Tests).** Pair them. C1 will introduce runtime parsing on `c.json`; C2 should add test-side parsing in lockstep so schema drift is caught at CI rather than at production request time. Doing them serially means two passes across the same route+test pairs. C1 is the gating side; C2 cannot meaningfully proceed without C1's schemas existing.
- **C1 prerequisite step.** TYPES-1 F2 (`quickCheckResponseSchema` and `consentResponseSchema` misused as input validators) MUST be reconciled before SCHEMA-2 wraps responses with the same schemas. This is a sub-cluster prerequisite, not a separate cluster.
- **C5 1a (junk-drawer reconciliation) is a parallel architectural call.** It can run any time; its blast radius is the lockfile, the Metro bundler, EAS Build, and Expo Go install paths. Not coupled to C1, but has its own "blocking" property: any deps-touching PR landed before 1a may cause a merge conflict 1a then has to absorb. Do it early or expect the rebase tax.
- **C6 (apps/api config) is an independent prerequisite for declarative CI claims.** Today CLAUDE.md's `pnpm exec nx run api:lint` works via plugin inference. If C6 is not addressed, any future nx upgrade that tightens default behavior will silently change what `api:lint` covers. C6 doesn't gate other clusters but de-risks them.
- **C7 (doc reconciliation) intersects cleanup-triage.** The 8 inbound-link conflicts (C1–C8 in cleanup-triage's "Conflicts" section) require co-changes when Cat 1 files move. Ideally C7 and cleanup-triage execution land in the same PR, or at minimum the same week — splitting them produces a window of broken cross-references.
- **C8 is independent of all others.** Each item ships standalone. The only coupling is convention: prefer one-item-per-PR for clean git blame on archeology work.
- **C3 and C4 are independent of all others** and of each other. Smallest and simplest to dispatch.

---

## 9. Coverage gaps

The six audits cover what they cover. Surfaces deliberately not investigated, named here so they don't become invisible. **These are not new audits proposed.**

- **CI workflows** (`.github/workflows/`). No audit looked at workflow YAML — what runs on PR vs. main, secret-scope per environment, parallelism, cache strategy, deploy-step gating, environment-protection rules.
- **External-service integrations beyond SCHEMA-2's surface.** Stripe webhook handlers, Clerk JWKS rotation, Resend bounce/complaint flows, RevenueCat webhooks. SCHEMA-2 looks at these only as `c.json` callers; the integration-correctness lens is unaudited.
- **Infrastructure-as-code.** `wrangler.toml`, Cloudflare Pages config, environment bindings, KV/R2/Durable Object scope, deploy-target → environment mapping.
- **Secrets and Doppler scope mapping.** Doppler is the single source per CLAUDE.md, but which secrets exist in which scope, which are referenced by which environment, and whether dev/stg/prod scopes are in sync — unaudited.
- **Observability dashboards and alerts.** Inngest UI state (concurrency, in-flight retries), error tracking (Sentry?), runtime metrics, alert thresholds, on-call coverage. AUDIT-INNGEST-2 covers event emission orphans, not dashboard health.
- **Security and auth surfaces outside SCHEMA-2's 36 RAW list.** Profile-scoping enforcement (`createScopedRepository` adoption), Clerk session handling, JWT verification middleware, RLS rollout state on staging/prod (AUDIT-SPECS-2 surfaced one piece of this).
- **Performance and cost.** LLM router fallback semantics under load, Inngest concurrency caps, hot-path latency (sessions stream, dashboard), per-environment compute cost.
- **Drizzle migration historical correctness.** Beyond AUDIT-MIGRATIONS-1 (10 missing snapshots), AUDIT-MIGRATIONS-2 (non-monotonic timestamps), AUDIT-MIGRATIONS-3-SWEEP (rollback notes), the per-migration data-integrity story (especially destructive ones) is not surveyed.

The dominant theme of the unaudited list is **runtime and operations** versus the dominant theme of the audited list which is **artefacts at rest**. That asymmetry is itself useful information for deciding what the next audit cycle should target — once this one's clusters are remediated.

---

## Sanity check

A reader can answer in 5–10 minutes:

- **How many clusters?** 8.
- **How many deduped findings?** ~30, plus the 164-file cleanup-triage as a parallel baseline.
- **How many files touched?** ~120 across the eight clusters (cleanup-triage adds 164 more on its parallel track).
- **Agent-exec vs. human time?** ~9–14 hr agent vs. ~17–28 hr human. Human time dominates by roughly 2×, mostly in C1 and C5 review and architectural calls.
- **What's coupled?** C1↔C2 must run paired. C7 should run in lockstep with cleanup-triage execution. Everything else is independent.
- **What we don't know?** CI, external services, IaC, secrets scope, observability, security/auth (outside SCHEMA-2), performance/cost, deep-migration correctness.
