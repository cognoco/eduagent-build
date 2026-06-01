# Identity Foundation — working folder

**What this is:** the home for re-platforming the app's **identity / tenancy / role** foundation —
the bedrock that auth, consent, billing, data-scoping, and the whole authorization surface sit on.
Today that bedrock is a single fused `accounts` row + `profiles` (with an `isOwner` boolean) +
`family_links` + `subscriptions`, and it has drifted badly from where the product is actually headed.

**Status:** 2026-06-01 — **product intent NOT yet locked.** No clean-cut code has started. The prior
(rejected) implementation plans are archived here; one of them (T1) shipped to `main` and is slated
for revert (see below).

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

| Path | What it is |
|---|---|
| `ROADMAP.md` | Pre-implementation roadmap + tracker (phases A–F, cross-cutting threads, sibling re-triage, decision log) — the live status doc. |
| `identity-reconstructed-prd.md` | The product intent *reverse-engineered* from the rejected plans, with every element tagged `[STATED] / [IMPLIED] / [GAP] / [CONFLICT]`. Deliberately thin — the thinness IS the finding (real forward intent was never captured). **Its §11 is the open-questions agenda.** A strawman to gap-check, not a ratified spec. |
| `archive/` | The three rejected 2026-05-31 plans (`identity-org-membership-redesign`, `identity-t1-data-model`, `identity-t2-auth`), each bannered SUPERSEDED. Kept as decision record + discussion input. |

## The work still owed (rough sequence)

1. **Author the product intent** — answer the reconstructed-PRD §11 questions (target user, role
   capabilities, consent-under-own-logins, one-owner-per-org, multi-org rules, credential
   thresholds, success criteria). PM-owned; needs a real product-definition session, not a doc mine.
2. **Derive the target data model** from that intent. *Then* check whether the archived design
   happens to fit — as a finding, not an input.
3. **Plan + execute the clean cut** — including the **T1 revert** (forward-only) as an early step.
4. **Re-baseline the canonical docs** (PRD / ARCHITECTURE.md / CONTEXT.md) to the new truth.

## Decision log

- **2026-06-01** — Clean cut chosen over the incremental/flag-gated approach. The three identity
  plans archived + marked superseded. T1 (merged in PR #668) flagged for forward-only revert.
  Reconstructed PRD produced to expose how little forward product intent existed.
