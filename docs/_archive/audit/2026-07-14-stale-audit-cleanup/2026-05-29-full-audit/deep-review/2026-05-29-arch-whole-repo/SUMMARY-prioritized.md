# Arch Whole-Repo Sweep — Prioritized Summary (2026-05-29)

Coordinator's holistic re-prioritization of the five architecture agents. Raw per-agent
findings in [`agents/`](./agents/); merged synthesis in [`REPORT.md`](./REPORT.md).

**Scope:** whole monorepo, `arch` aspect only (dependency-mapper, cycle-detector,
hotspot-analyzer, pattern-scout, scale-assessor). Not a PR diff — all findings
[PRE-EXISTING]. **0 critical, 0 P0.**

**Caveat:** git history is squashed to a single day (all commits 2026-05-29), so
churn×complexity was unavailable — hotspots ranked on size/responsibility/fan-in instead.
Re-run hotspot analysis once real history accumulates.

---

## P1 — Should fix (concrete failure modes or real degradation)

### 1. Unbounded lifetime materialization on a hot path → Worker OOM risk
- **Source:** scale-assessor · **Loc:** `apps/api/src/services/snapshot-aggregation.ts:244-252`
- `loadProgressStateOnce` does `findMany()` with **no limit** on assessments, retention
  cards, vocabulary, vocab-retention cards — loads a learner's *entire lifetime* into
  Worker memory on **every progress read AND every daily snapshot cron tick**. Sessions
  were already bounded to 2 years (`:230-243`); these sibling tables were missed.
- **Failure mode:** a power user's progress screen + nightly cron grow linearly toward the
  Workers 128MB ceiling → request failures on the most-used read path. Closest thing to a
  future page.
- **Fix:** window the queries, or build the pre-aggregated counters table the code's own
  `:236` comment already prescribes.

### 2. Per-request Neon pool churn → latency tax + connection pressure at scale
- **Source:** scale-assessor · **Loc:** `apps/api/src/middleware/database.ts:103`; `packages/database/src/client.ts:96-120` (`cacheNeonPool: false`)
- Fresh Neon WebSocket pool created + torn down **per request**; cache path exists but is
  disabled. Every request pays a new WS handshake; Neon connection pressure scales with raw
  traffic — biting at the ~2K–10K-user inflection the architecture doc flags.
- **Fix:** re-enable the isolate-scoped cache where RLS/txn semantics allow, or route reads
  through Neon's HTTP driver. First confirm whether per-request isolation is required for
  correctness. Highest-ROI scale change.

### 3. `session-exchange.ts` — structural epicenter (triple-corroborated)
- **Source:** dependency-mapper + hotspot-analyzer + scale-assessor (independently) · **Loc:** `apps/api/src/services/session/session-exchange.ts` (3,321 LOC)
- Largest non-seed file; sits on the **LLM trust boundary + challenge-round mastery
  policy**; mixes pure decision functions with async I/O orchestration; ~20 sibling-service
  fan-out. Merge-conflict magnet and hardest-to-test surface.
- **Fix (low-risk, high-leverage):** split the pure decision layer into
  `session/exchange-decisions.ts` (no I/O, trivially unit-testable) — a no-behavior-change
  first move. Then pull cohesive concerns into composed sub-steps.

### 4. Runtime circular dependency: `{settings, family-access, consent, notifications}`
- **Source:** cycle-detector · **Loc:** `settings.ts:25 → family-access.ts:11 → consent.ts:33 → notifications.ts:21 → settings.ts`
- Genuine 4-node runtime SCC fusing four core back-office services into one init unit.
- **Failure mode:** implicit, bundler-dependent module-init order → **TDZ crash risk** on
  any future load-time change touching a partner export; none of the four unit-testable in
  isolation. Root cause: `settings.ts` is a god-module.
- **Fix:** split notification plumbing out of `settings.ts`; extract consent predicates into
  a leaf `consent-rules.ts` (also kills the `consent⇄notifications` 2-cycle).

### 5. Silent Inngest registration sync point
- **Source:** scale-assessor · **Loc:** `apps/api/src/inngest/index.ts:194` (~76 entries)
- New background functions must be hand-added to the array; miss it and events **dispatch
  but never run** — no type/runtime error. The "wired-but-untriggered" failure CLAUDE.md's
  UX-Resilience rules call out as worse than dead code.
- **Fix:** one systematic guard test diffing exported Inngest functions vs the array.

### 6. "Fetch-all-then-filter-in-JS" on hot read paths
- **Source:** scale-assessor · **Loc:** `coaching-cards.ts:168`, `interleaved.ts:72`, `retention-data.ts:1578`, `progress.ts:1427/1691`, + cron candidate-set scans
- Dominant data-access anti-pattern — pulls work onto Worker CPU instead of Postgres.
  Combined with #1, the progress/snapshot path is most likely to hit the subrequest budget
  (50 free / 1000 paid) and CPU ceiling first.
- **Fix:** push filters/aggregates into SQL `WHERE`; instrument CPU/subrequest on that path.

---

## P2 — Worth noting (no immediate failure mode)

- **God components/files cluster** (same vertical): mobile `session/index.tsx` (82 hook
  calls), `shelf/.../book/[bookId].tsx` (68 hooks, 2,110 LOC); services `curriculum.ts`
  (2,643), `session-crud.ts` (2,228), `learner-profile.ts` (1,948), `session-completed.ts`
  (1,820, 35-step Inngest pipeline). 40 files >1,000 LOC. Split per the `session/`/`llm/`
  precedent.
- **`@eduagent/schemas` flat-barrel fan-in** (~378 non-test consumers, ~37% of source). Any
  schema edit marks all consumers affected in Nx/CI. Add per-domain subpath exports while
  keeping the barrel.
- **`metering.ts` name collision** — `services/metering.ts` (pure quota math) vs
  `services/billing/metering.ts` (DB mutators). Mechanical rename, 3 importers.
- **Half-migrated billing domain** — `billing/` folder exists but 4 flat files
  (`stripe.ts`, `subscription.ts`, `metering.ts`, `billing-pricing.ts`) never moved in or
  became facades.
- **2nd runtime cycle** `curriculum.ts ⇄ language-curriculum.ts`; **type-only cycles**
  (`exchanges`/`exchange-prompts`) — relocate `ExchangeContext` to schemas to kill both.
- **`database → schemas` doc divergence** — `architecture.md:710-715` warns of a "circular
  dependency" that doesn't exist (all edges `import type`). Reconcile the doc.
- **Permissive nx boundary enforcement** (`eslint.config.mjs:106`) — direction is
  review-enforced, not machine-enforced. Add layer tags + `depConstraints`; wire
  `madge --circular` into CI (allow type-only pairs, fail new runtime cycles).
- **`test-seed.ts`** (5,668 LOC, mounted gated into the live app) — verify excluded from the
  deployed Worker bundle.

*(Omitted as noise: 2 ad-hoc `c.json(4xx)` sites, route-count doc drift, two compile-erased
type-only layer inversions, the service-folder graduation doc rule.)*

---

## Architecture health

| Check | Status |
|---|---|
| No circular dependencies | **Fail** — 1 HIGH 4-node runtime SCC + 2 runtime 2-cycles (all in `api/services/`); package graph clean |
| Clean layer boundaries | **Pass** (caveats: type-only doc divergence; permissive enforcement) |
| No god modules | **Fail** — `session-exchange.ts` + session-vertical cluster + mobile god screens |
| Consistent patterns | **Pass** — unusually strong, guard-tested |
| Scalable structure | **Fail** — 3 HIGH scale risks (Neon pool, unbounded materialization, Inngest sync) |
| Concurrency safety | **Pass** (caveat: cycle-induced init ordering = TDZ risk on refactor) |
| Performance efficiency | **Fail** — fetch-all-filter-in-JS + unbounded finds + per-request handshake |
| Platform conventions | **Pass** |

**Strengths worth keeping:** 0 direct DB calls in routes; 165 scoped-repo sites; 41
`safeSend` dispatches with every bare `inngest.send` justified; centralized error
classification (0 screens parse status codes); forward-only guard-test culture (GC1,
persona-fossil, i18n keep-rot); clean facade pattern; batched dashboard fan-out; bounded
session reads; correct SSE-aware DB lifecycle.

---

## Suggested sequencing

1. **#1 (bound lifetime tables)** + **#2 (Neon pool cache)** — small, self-contained, most
   directly de-risk production.
2. **#3 (split `session-exchange` decisions)** — highest-leverage structural move, no
   behavior change.
3. Remainder is steady-state hygiene.
