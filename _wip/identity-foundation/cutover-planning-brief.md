# Cutover Planning Brief — the IF application cutover (the missing wave)

**Date:** 2026-06-12 · **Commissioned by:** umbrella program session · **Operator:** Jorn
**Your role:** dedicated architecture + planning session. You design; you do not execute,
instantiate, or coordinate. One deliverable: a ratified-plan-grade document.

## Mission

Design the application cutover from the five legacy identity tables to the ratified
identity-foundation (IF) model — the wave the Phase-O master plan missed. The new model
(8-table schema, policy engine, router spine, guards) is **built and landed** (W0–W4,
34 units closed), but the app still runs 100% on the legacy tables: the W1 spine is a
fail-closed scaffold with zero DB reads, and the migration of every caller was hidden
inside WI-586's "S-sized" *drop* scope ("remove legacy readers"). Your plan closes that
gap.

**PLAN ONLY.** Output is one committed markdown document. No code, no migrations, no
Cosmo writes, no messages to other agents.

## What happened (one paragraph of context)

The WI-586 executor's mandatory plan-phase stop caught the gap pre-code. Scope evidence
from its inventory: **~80 non-test runtime files** read the legacy tables — including the
auth middleware, **both payment webhooks**, and **22 Inngest functions**; the
consent-request workflow (PENDING states, parent email, tokens, the WI-374 request caps)
has **no home in the new model**; store correlation/idempotency IDs live only on legacy
rows (dropping them would re-open closed webhook races); **57 FKs** re-point; **~190 test
files** reference legacy symbols. The operator ruled a SPLIT: **WP-CUT-A** (additive
model completion) → **WP-CUT-B** (domain-wise reader cutover, 2–3 PRs, legacy
frozen-but-live) → **WI-586 shrunk** to the final convergence (reseed → verify → atomic
flip → drop → grep-clean).

## Read first (in order)

1. `_wip/identity-foundation/2026-06-09-phase-o-master-plan.md` — the ratified master
   plan; especially the WP-TAIL-reseed / WP-TAIL-drop-legacy sections (~lines 408–430).
2. `_wip/identity-foundation/CANONICAL-SET.md` + `docs/canon/identity/` — the ratified
   target model. Your plan extends it; it never reopens it.
3. **WI-586 Notion page** — `37b8bce9-1f7c-8166-b539-eb1a69ebf0fe`
   ("WP-TAIL-drop-legacy"). The executor's scope report there, with its per-orphan
   mapping, is the **authoritative inventory** of legacy readers. Build on it; do not
   re-derive it from scratch (do verify spot-checks against the repo).
4. `_wip/identity-foundation/execution-tracker.md` — read-only context (shepherd-owned;
   **never edit it**).
5. `.claude/memory/feedback_plan_cutover_ownership.md` — the lesson that produced this
   brief. Your plan must pass its switch-flip check explicitly: name the unit that makes
   the system USE the new model, and the unit that owns data/state convergence at the
   flip.
6. `AGENTS.md` — especially *Schema And Deploy Safety* (the `## Rollback` requirement for
   destructive migrations) and *Planning Discipline* (no placeholders; show actual
   code/SQL where a step needs it).
7. `docs/adr/MMT-ADR-0000` — the ADR significance gate, for deliverable 1.

## Binding constraints — design to these, do not relitigate

- **Clean-cut doctrine:** no dual-model sync layer, ever. Ratified.
- **Single-live-store invariant:** CUT-B PRs may merge incrementally ONLY if, at every
  commit/deploy, legacy remains the sole live store and new-model paths stay inert until
  ONE atomic convergence step (freeze → final reseed → verify → flip → drop). Partial
  per-domain activation = split-brain = never acceptable.
- **Operator-accepted sub-rulings** (direction set; final confirmation happens at plan
  ratification — flag in your plan if any proves unworkable):
  - `conversation_language` re-homes to the person entity.
  - Store correlation/idempotency IDs: **additive columns** in the new model.
  - Consent-request workflow: **new `consent_request` table** in the new model.
  - `has_premium_llm`: derived per MMT-ADR-0014 + `docs/registers/llm-models/master.md`,
    not stored legacy-style.
  - Ownerless accounts: dev = bulk-delete; staging = case-by-case (plan produces the
    list for the operator); prod receives the whole chain via the post-BUG-12 deploy and
    does not gate close.
- **Recovery posture at convergence:** Neon PITR marker + a pre-drop Neon branch
  immediately before the irreversible drop.
- The V0 5-tab nav hard constraint and all AGENTS.md engineering rules apply to whatever
  your plan prescribes.

## Deliverables — one plan document, four sections

Write to `_wip/identity-foundation/2026-06-12-cutover-plan.md`.

1. **CUT-A schema-extension design** (the only architecture-grade section).
   `consent_request` table design at full depth: states, token lifecycle, parent-email
   flow, WI-374 cap mapping, how it attaches to the authority graph. Apply the
   MMT-ADR-0000 significance gate; if it crosses (likely), include the ADR text as an
   appendix — the formal `docs/adr/` file + canon lockstep edit land with CUT-A
   implementation, not now. Plus the two smaller deltas: store-correlation ID columns,
   `conversation_language` re-home. Actual DDL for each.
2. **Read-path cutover map.** For each of the ~80 runtime readers (seeded from the
   executor inventory): current legacy read → new-model equivalent (table read, scoped
   repo, or policy-engine call). Depth is graded: full detail for the sensitive surfaces
   (auth middleware, both payment webhooks, the 22 Inngest functions); pattern-level for
   the rest. Include the 57-FK re-point list and the test-file transition approach
   (~190 files — when do tests flip relative to their domain's reader PR?).
3. **CUT-B PR partition.** Which domains land in which PR, sequenced, with an explicit
   argument per PR for why the single-live-store invariant holds at its merge point.
4. **Convergence runbook** (the shrunk WI-586). Freeze → final reseed → parity
   verification (actual queries, legacy vs new) → flip mechanism → drop → grep-clean.
   Named flip owner. Neon PITR marker + pre-drop branch steps. A `## Rollback` section
   stating explicitly what is recoverable at each step and what becomes impossible
   post-drop. Grep-clean means **full legacy retirement**, not just symbol removal:
   legacy tables, legacy reader/writer code, the legacy-securing guards and fail-closed
   scaffolds the W-waves built that become obsolete once the drop lands, and stale doc
   references. This plan owns cleanup end-to-end — there is no separate cleanup phase
   after it.

Open questions you cannot resolve from canon or repo: collect them in an
**Open Questions** section at the top of the plan doc — do not block on them, do not
guess silently.

## Stop line / handback

- **Do:** read, design, write the plan doc, commit it.
- **Do NOT:** create or edit Cosmo work items; touch WI-586's stage/properties; message
  the IF shepherd; write code or migration files; edit the shepherd's execution tracker.
- Ratification happens in the program session with the operator. Graduation into Cosmo
  WPs happens there too, after ratification. Your job ends at the committed plan doc.

## Repo hygiene

- Shared `main` checkout, multiple concurrent sessions: stage ONLY your own file(s),
  never `git add -A`. Commit via the repo commit skill (`/commit`). On push rejection:
  `git pull --no-rebase`, then push. Never rebase or force-push.
- Notion read access: `NOTION_TOKEN` is in your environment (if missing:
  `source /Users/vetinari/.config/nexus/host.env`). Never print it or write it to a file.
- Plan-doc-only changes are docs — committing on `main` is fine.
