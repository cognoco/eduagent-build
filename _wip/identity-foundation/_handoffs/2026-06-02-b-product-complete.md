# Handoff — Identity Foundation, **B-product complete → back to the main roadmap stream**

**For:** a fresh session resuming the identity-foundation initiative. **What happened:** the **B-product**
PM walkthrough (the six-segment product/UX decision session) is **complete** — every open Part-10 product
item is ruled `P✓`. **What you do next depends on your role** (architect vs. PM) — see "What's now unblocked."
Repo: `eduagent-build`.

## Read these first (in order)

1. `_wip/identity-foundation/ROADMAP.md` — the spine; status line + **Decision log entry dated 2026-06-02
   "Phase B-product complete"** is the authoritative summary.
2. `_wip/identity-foundation/identity-foundation-prd.md` **Part 10** — the decision ledger; every ruling below
   is recorded inline there with rationale (commit `d6d93505d`).
3. `_wip/identity-foundation/identity-ontology.md` — the locked model (invariants referenced below live here).

Project rules: `CLAUDE.md`. Canonical model = the ontology; Part 10 = the live decision ledger.

## What B-product decided (all `P✓`, 2026-06-02)

| Item | Ruling (one line) |
|---|---|
| **E6** | Split spaces, landing led by the "What brings you here?" choice; family-door-but-no-child → focused "add your first child" screen *(unbuilt — PM Notion follow-up)*. |
| **C2 / C3** | "Homework-helper" = ads wedge only; audience = serious learners **and** mentors, any age; learners long-term, parents the near-term wedge. |
| **D2** | Lock the browse-only consent-pending preview **as-built**; constraint: must stay no-AI / no-collection. |
| **D1** | Self-signup → own login (no age steering); **+ add-child must ask "own device/account, or yours?"** (managed vs credentialed charge). |
| **E0** | Teen self-pay stays **store-delegated** (no product age block); managed child keeps "Notify Parent". |
| **E5** | *(P-lean)* Departing last-guardian chooses **export / attach-another-adult / delete**, scoped to under-age children; abandonment handled by a **cross-cutting inactivity-expiry policy**; "never lost" softened to honest promise + disclaimer. |
| **E1 (visibility)** | Parent visibility **off by default** at the consent age (~99% of teens want off); **reshare/ask-to-keep** for the rest; never auto-on. |
| **E1 (takeover)** | Account control passes **by prompt, not automatically** (status-quo until the teen takes over). |
| **D3** | Keep built caps (3 resends / 3 recipient changes / 7-day link) + a short ~30–60s resend cooldown; 7-day withdrawal grace. |
| **E12** | **Un-deferred: a minimal "join my family" is REQUIRED in v1** (parent invites an existing, self-consenting teen → joins family/shares quota + teen-granted mentorship + admin/Payer; no auto-guardianship; **history preserved**). |
| **E13** | Minor-initiated **guardianship** ban kept; **parent-initiated** join = v1; child-initiated request-to-join may stay deferred. |
| **E2** | Move to stricter jurisdiction → **suspend AI to the browse-preview** (not a cold lock); detection via **declared residence + conditional soft nudge** (holiday/VPN never re-gates). |
| **F1-BT-b** | Birth-year is **fixable in-app** (dead-end removed); a **boundary-crossing** edit triggers **light verification**, an honest non-crossing edit just saves. |

## 🔶 The 4 ripples — architecture reopened (DO honour before D ratifies)

Per the Part-10 **ripple rule**, these PM decisions reopen architecture `T✓` items. The architect must
re-confirm each; **D's exit gate cannot lock until they're resolved.**

1. **Child-own-login provisioning mechanism** (from D1; also underpins the E1 takeover). *How* do we give a
   child their own login — **invite-flow** (child completes their own login) vs **parent-creates-credential**?
   Maps to the parked **§6 "entry-point asymmetry / self-registered-minor"** item. Net-new / T2+.
2. **E5 last-guardian.** (a) Does a **parent-initiated explicit delete** (with export offered) reconcile with
   **inv 21** ("never orphan / learning never cascade-deleted"), or must inv 21 be amended? (b) The
   **abandonment fallback** = the inactivity-expiry policy — needs the scheduler (#4).
3. **E12 "join my family" — `T` reverts to pending.** Elevated from Phase-D-deferred to **v1-required**.
   Architect scopes the cheapest honest version: **membership + billing/quota reconciliation + home-org
   handling**, honoring never-orphan (inv 21) + a named **migration-pending** interim state (inv 25); interacts
   with **E7 multi-org governance**. The *below-consent-age* teen variant (guardianship + VPC via R13) may stay
   deferred; v1 covers the **consent-capable** teen join.
4. **Shared durable scheduler (inv 24) — net-new, now load-bearing for THREE things:** inactivity-expiry (E5),
   birthday/age re-check (E1), and residence re-eval (E2). Size it once; it doesn't exist today.

## ⚖️ Counsel queue (PM-owned, with the lawyer — REQ-2)

- **Inactivity-deletion policy** specifics: exact dormancy period, mandatory pre-deletion notice + grace/export,
  children's-data handling, and **carve-outs for legally-mandated retention** (billing/tax/transaction records).
- A **child's erasure right** + the **parent's authority** to exercise it for a charge.
- **Grace-window length** for the moved-country suspended state.
- **Verification method** for boundary-crossing birth-year edits (age-assurance vendor).

## ✅ Open action — PM

- Log the **"add your first child" landing screen** (E6) as a **missing feature in Notion** — it was specced
  in the mode-nav plan (HIGH-1) but is **stranded/unbuilt** (`onboarding/intent.tsx` + `family-setup-empty`
  testID absent).

## What's now unblocked (sequencing)

- **Gate order unchanged:** B-product → **D-ratify** → E-ratify → F.
- **D's *work* may already be in flight** (parallel-track model). What changes now: **D-ratify is no longer
  blocked on the PM pass** — but it **must absorb the 4 ripples first** (esp. E12's reverted `T` and the
  scheduler). Track 2 may stop modelling both options for the now-decided P-tails (e.g. E6 is decided: split).
- **C (doc-strategy)** is independent and unaffected.

## Repo conventions

- **Commit via the `/commit` skill** (handles staging, hooks, push). Stage only intended files.
- Record any further rulings in **Part 10** + the **ROADMAP decision log**; architecture decisions also as ADRs.
- Worktrees: `.worktrees/<branch>/` via the `worktree-setup` skill.

## First moves for the receiving agent

1. Read the ROADMAP status + 2026-06-02 "B-product complete" decision-log entry, then Part 10.
2. **If architect:** take the 4 ripples one by one; re-confirm or amend the affected `T✓`; the E12 v1-scope and
   the shared scheduler are the two with real build weight. Then proceed to lock D's exit gate.
3. **If PM:** the product pass is done; your only open item is the Notion follow-up + steering the counsel queue.
4. Update the ROADMAP decision log + Part 10 sign-offs as ripples close, and `/commit`.
