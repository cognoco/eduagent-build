# Identity Foundation — working folder

**What this is:** the home for re-platforming the app's **identity / tenancy / role** foundation —
the bedrock that auth, consent, billing, data-scoping, and the whole authorization surface sit on.
Today that bedrock is a single fused `accounts` row + `profiles` (with an `isOwner` boolean) +
`family_links` + `subscriptions`, and it has drifted badly from where the product is actually headed.

**Status:** `ROADMAP.md` is the live status doc. As of **2026-06-08**, product intent and the
domain/data model are **ratified** (`identity-ontology.md`, `domain-model.md`, `data-model.md`,
`identity-foundation-prd.md`), the decision trail lives in `docs/adr/MMT-ADR-0007…0016`, and the
pre-implementation runway (phases A–P) is mid-flight. No clean-cut code has started. The prior
(rejected) implementation plans — incl. the T1 revert — are in `archive/`.

---

## The decision driving this work

**Strategy: pre-launch CLEAN CUT.** Pre-launch, zero real users → we define the target model, build
it directly, re-seed dev/staging, and delete the legacy model. Explicitly **rejected**: the
incremental / dual-model / **flag-gated** / **backfill** approach (no `MODE_IDENTITY_V1` flag, no
backfill, no compatibility shims, no V0/V1 parallel run).

> A prior batch of plans (2026-05-31) chose the incremental approach and even began executing it.
> That work is the cautionary tale this folder exists to correct — see `archive/`.

---

## Guardrails (the anti-drift rules — read before contributing)

1. **Product intent FIRST; the data model is *derived* from it — never the reverse.** The drift
   happened because a plausible technical design (orgs/memberships) got built and then started
   pulling the product toward itself. Do not let table shapes pre-shape the product.
2. **The archived plans are *discussion input only*, NOT approved design.** Their model shapes, the
   "7 lifecycle flows," and decisions D1–D6 must be re-derived from product intent, not carried
   forward as-is. Only their *design-independent lessons* are safe to reuse (current-system bug
   findings, edge-case traps, the migration-immutability CI guard idea).
3. **Consent / COPPA under own-logins is the load-bearing unknown.** Today's model assumes a parent
   owns the account and consents by email for a managed minor. The moment a minor can have their own
   login, the consent model changes materially. This needs a dedicated functional spec (and likely a
   legal check) before any code that touches it.
4. **Don't delete migration `0106` in isolation.** It is committed *and* applied to the shared DBs.
   Reverting T1 means a forward drop-migration or folding the un-apply into the clean re-baseline —
   deleting an applied migration recreates the ledger drift the old plan itself fought.
5. **No identity code lands until the product intent is ratified** (the §11 questions in the
   reconstructed PRD), and the clean-cut target is designed from it.

---

## What's here

**Live, load-bearing docs (root):**

| Path | What it is |
|---|---|
| `ROADMAP.md` | Pre-implementation roadmap + tracker (phases A–P, cross-cutting threads, decision log) — **the live status doc.** |
| `2026-06-XX-a-vs-b-decision-capture.md` | The signed A-vs-B decision memo — 25 ratified decisions; §7 is the canonical `WP-1…WP-10` namespace. Immutable. |
| `identity-ontology.md` | **RATIFIED** ontology v1.1 — the entity / role / capacity vocabulary; the `CONTEXT.md` identity glossary is extracted from it in lockstep. |
| `domain-model.md` | **RATIFIED** Phase-D domain model — entities / roles / consent / tenancy. |
| `data-model.md` | Phase-E data model (baseline + pre-baseline amendments per `MMT-ADR-0011`/`0015`); the ADR lockstep partner. |
| `identity-foundation-prd.md` | The anchored-spine PRD, built bottom-up from the ontology + glossary. |
| `identity-model-diagrams.html` | Visual companion to the model (dark/light toggle). *(may need a refresh post-A-vs-B — see ROADMAP)* |

**Subfolders:**

| Path | What it is |
|---|---|
| `_handoffs/` | Session-continuity handoff docs. |
| `_walkthroughs/` | Facilitated rulings sessions — `policy-engine-spine-`, `counsel-`, `b-product-`, `phase-e-fillers-` walkthroughs (packages + capture ledgers). |
| `_research/` | Investigations + analyses **still consulted** (incl. forward inputs to later phases) — the **Phase-A drift map** (`drift-map.md` + exec-summary; a live input to Phase K's cross-check), `age-consent-landscape/`, `gemini-minors-zdr.md`, `age-consent-spike.md`, plus `raw/`. |
| `archive/` | Superseded / completed artifacts — the rejected 2026-05-31 plans, the A-vs-B audit tracks, the reconstructed-PRD drafts, and discovery/options briefs. Kept as decision record + discussion input. |

## The work still owed

See `ROADMAP.md` — it owns the live phase sequence (A–P), the cross-cutting threads, and the decision
log. The rough 2026-06-01 sequence that used to live here is superseded by the roadmap.

## Decision log

- **2026-06-01** — Clean cut chosen over the incremental/flag-gated approach. The three identity
  plans archived + marked superseded. T1 (merged in PR #668) flagged for forward-only revert.
  Reconstructed PRD produced to expose how little forward product intent existed.
