---
title: Phase N.1 — Sequencing (dependency map + critical path)
date: 2026-06-09
status: DRAFT — awaiting architect ratification (Phase N is `Claude — you ratify`)
phase: N.1 (follows N.0; feeds Phase O master plan)
inputs:
  - docs/audit/2026-05-29-full-audit/M-triage-closure.md (four-bucket triage)
  - docs/audit/2026-05-29-full-audit/gate1-k5-postgate.md (IF-slice workstream sizing)
  - docs/audit/2026-05-29-full-audit/gate1-closure.md (the 11 execution-blocking patch-now list)
  - _wip/umbrella-program/stream-2-backlog.md § N.0 partition (pull-forward subset = EMPTY)
  - docs/adr/MMT-ADR-0012-one-time-baseline-reset.md (baseline reset — supersedes the old "T1 revert")
  - ROADMAP.md (clean-cut lifecycle; execution-model parallel tracks)
---

# Phase N.1 — Sequencing

**What this is.** The dependency map + critical path over the identity-foundation
*in-scope* set, sequenced for execution. It is the skeleton Phase O (the master plan)
fleshes out into work packages and Phase P slices into Cosmo work items. It is **not**
the master plan and **not** a Cosmo artifact — it is the ordering decision N produces.

**What N.1 sequences.** The in-scope set only:
- the **49 bucket-2 model obligations** (the rewrite must satisfy each as an acceptance criterion);
- the **rewrite work itself** (the clean-cut: new identity/tenancy/consent schema, the
  policy-engine + router + safety/judge spine, the three-axis age model);
- the **N.0 pull-forward subset** — which is **empty** (see `stream-2-backlog.md § N.0
  partition`), so nothing parked is injected here.

**What N.1 does NOT detail-sequence.** The 125 clear-out + 9 deferred findings. They are
owned by other named workstreams; Phase O *names* them with rationale and slots them by
**blast-radius** (in-radius → serialize behind execution; out-of-radius → parallel-safe).
They are listed at the foot of this doc for completeness, not ordered here.

**The dogfood rule (runway-mandated).** The identity-foundation workstream is sequenced
**first** — its waves (W0–W4 below) are the master plan's leading critical path. It runs
first deliberately, to prove the planning→execution pipeline before the same machinery is
applied to the other workstreams.

---

## The wave structure

Five waves. W0 leads and runs parallel to the build; W1 is the structural root; W2→W3 is
the critical path; W4 is a parallel billing track. The clean-cut lifecycle (baseline-reset →
build → satisfy → re-seed → delete-legacy) wraps the waves as noted.

### W0 — Pre-execution / stop-the-bleeding *(parallel; independent of the rewrite)*

The clean-cut's **first implementation step is the one-time baseline reset** — governed by
**`MMT-ADR-0012` — accepted 2026-06-04; pre-launch one-time collapse of the migration chain
to a fresh baseline**. The reset **removes migration `0106`** (`identity_t1_org_membership`
— the sole shipped artifact of the abandoned `T1`→`T6` staged-identity plan: empty
`organizations`/`memberships` tables + a data-copy backfill, zero readers/writers) **from
the *effective chain* — it is _not_ undone with a follow-up migration.** ADR-0012 explicitly
**rejects the "forward-only revert"** (the prior provisional call) as a wasted migration on a
zero-data, pre-launch baseline. Concretely the step is: remove `0106` from the effective
chain → reset dev + staging DBs → land the **single** clean baseline migration that creates
the eight target tables from empty (`data-model.md` §1). This clears the ground before W1.

Alongside it, the **11 execution-blocking live defects** (the `gate1-closure.md` patch-now
list) close live exposure *now*. The rewrite later supersedes most by construction, but that
does **not** relax the gate (see the hard gate below):

| Patch | Pri | Owner | Rewrite successor (does NOT relax the W0 gate) |
|---|---|---|---|
| F-117 proxy write authority | P1 | security-pii-api | superseded by W2 (policy engine, ADR-0008) |
| F-118 consent-authority IDOR | P1 | security-pii-api | superseded by W2 (ADR-0015) |
| F-122 deletion atomicity | P0 | security-pii-api | superseded by W2 (data-model §6.1, inv 21) |
| F-130 age-gate (birthYear-only) | P2 | security-pii-api | superseded by W2 (C-1, central gate) |
| F-133 policy-blocked Gemini fail-over | P2 | security-pii-api | superseded by W3 (ADR-0014 §4 fail-closed) |
| F-144 proxy mutates child progress | P1 | security-pii-api | superseded by W2 (ADR-0008, inv 7/8) |
| F-145 age-gate fail-open | P1 | security-pii-api | superseded by W2 (central gate, inv 29/30) |
| F-019 freeform-filing skips GDPR check | P2 | security-pii-inngest | superseded by W3 (C-1 guard) |
| F-020 cross-account minor-name leak | P1 | security-pii-inngest | superseded by W3 (ontology inv 8/9) |
| F-092 child report to wrong parent | P2 | security-pii-inngest | superseded by W3 (ADR-0008 call-site) |
| **F-121 trial-expiry downgrades paid sub** | **P0** | billing-subscriptions | **none** — standalone; ships as a patch |

> **Hard gate — all 11, not just F-121.** Gate 1 lists **all eleven** as execution-blocking
> patch-now inputs (`gate1-closure.md:22`; `M-triage-closure.md:86`), not only F-121. **Every
> one must be explicitly resolved before W1 begins** — each either **(a)** shipped as a
> standalone patch, or **(b)** carried by an architect-ratified *"not exposed in the current
> deploy"* proof (these are live P0–P2 IDOR / GDPR-consent / deletion-atomicity / age-gate /
> fail-open-router defects; "the rewrite may be fast enough" is **not** an acceptable
> disposition). The "rewrite successor" column says which patches the rewrite later rebuilds
> by construction — that informs whether a given standalone patch is throwaway, but it does
> **not** authorize deferral. Live exposure is closed before execution proper, either by patch
> or by ratified proof. O's only per-patch discretion is *patch vs. ratified-not-exposed* —
> **never *defer*.** This aligns with the repo security-fix rules (a CRITICAL/HIGH fix needs a
> break test; silent recovery without escalation is banned).

### W1 — Structural foundation *(the critical-path root)*

Creates the seams everything else lands in. Nothing in W2–W4 can satisfy-by-construction
until these exist.

- **Architecture decomposition obligations** — F-003 (`session-exchange.ts` carved into
  router/spine/judge slices, ADR-0013/0014/0016), F-004 (break the
  {settings, family-access, consent, notifications} 4-node SCC, inv 22 three-layer
  authority), F-029 (consent⇄notifications cycle — the GDPR-gate binding edge, folds with
  F-004), F-005 (Inngest registration silent-sync → ADR-0009 wired-and-triggered),
  F-032 (scoped-repo per-table `profile_id`, data-model §5.1).
- **The new 8-table identity/tenancy/consent schema** (clean-cut, built direct — no
  dual-model, no backfill).
- **The policy-engine + router + safety/judge spine scaffolding** (ADR-0013/0014/0016).

### W2 — Identity / consent / proxy / age obligations *(critical path; heaviest — security-pii-api `L`)*

Depends on W1 (schema + engine). The identity bedrock's correctness obligations, satisfied
by construction on the new model:

- **Scope / ownership / RLS:** F-097 (IDOR ownership check, data-model §5.1 person-scope),
  F-078 (IF RLS two-layer contract, ADR-0011 T3), F-152 (latent cross-profile IDOR,
  ADR-0007 edge-derived write), F-125 (deletion-status owner gate, domain inv 8),
  F-153 (consent-restore contract divergence), F-021 (JWT-claims age/consent transport
  slice, ADR-0001).
- **Proxy authority:** F-117, F-144 (proxy write/progress, ADR-0008), F-126 (library-filing
  proxy guard, ADR-0007), F-023 (unmetered-route proxy-guard skip, guardian act-for).
- **Consent authority + deletion:** F-118 (consent-authority, ADR-0015), F-122 (deletion
  atomicity, data-model §6.1 inv 21), F-093 (account-isolation on consent delete, ADR-0001),
  F-029 (covered structurally in W1; the consent-gate semantics land here).
- **Age gate:** F-130, F-145 (full-birth-date central gate, C-1, prd, inv 29/30).

### W3 — PII-handling + envelope/router integrity *(critical path; security-pii-inngest `M` + api)*

Depends on W1 (router spine for the envelope; clean person-scoping from the schema) and is
cleaner after W2's authority model lands.

- **Minor-PII out of payloads / logs / Sentry / LLM providers:** F-018, F-073, F-074, F-075,
  F-076, F-083, F-084, F-085, F-086, F-087, F-088, F-089, F-095, F-140.
- **Envelope / router integrity (ADR-0016/0014):** F-025 (hard-fail on out-of-range field),
  F-131 (streamed vs persisted divergence), F-133 (fail-closed on policy block), F-136
  (raw-envelope leak on empty reply), F-137 (allowlist fail-open), F-141 (unescaped learner
  text into system prompt — preamble safety).
- **Inngest authority (satisfy-by-construction on W1 engine + W2 model):** F-019, F-020, F-092.
- **Entitlement / credit isolation:** F-134 (RevenueCat cross-account leak, ADR-0001/0002),
  F-135 (owner credit balance leaked to child, ADR-0015).

### W4 — Billing + remaining *(parallel track; `S`/`XS`)*

Largely orthogonal (ADR-0002 store-delegation); runs parallel to W2/W3.

- F-121 (trial-expiry downgrade — landed in W0 as the standalone patch; confirmed here),
  F-124 (top-up credits stranded on tier change, ADR-0002 no-silent-recovery),
  F-096 (untested billing/quota/idempotency — payer-model coherence),
  F-163 (child sees parent accommodation, ADR-0008 view self-fallback — l10n, `XS`).

### Clean-cut tail *(after W2–W4 obligations are satisfied on the new model)*

**Re-seed** live data into the new model → **delete legacy** identity tables/readers. These
close the clean-cut; they cannot run until the obligations land on the new schema.

---

## Dependency map

```
            ┌─────────────────────────────────────────────┐
  W0  ──────│ baseline reset (MMT-ADR-0012) + 11 patch-now │
            │  (all 11 resolved before W1 — hard gate)     │
            └─────────────────────────────────────────────┘

  W1  (schema + arch-decomposition seams + engine/router/judge spine)   ◀── critical-path ROOT
   │
   ├──────────────▶  W2  (identity / consent / proxy / age — security-pii-api L)   ◀── critical path
   │                  │
   │                  ▼
   ├──────────────▶  W3  (PII redaction + envelope/router integrity — inngest M + api)   ◀── critical path
   │
   └──────────────▶  W4  (billing + l10n — parallel, S/XS)

  Clean-cut tail:  (W2 ∧ W3 ∧ W4 satisfied)  ──▶  re-seed  ──▶  delete-legacy
```

**Critical path:** `W1 → W2 → W3 → (re-seed → delete-legacy)`. W1 is the root (no obligation
satisfies before the schema + engine exist); W2 is the heaviest single wave (security-pii-api
sized `L`); W3's envelope/router slice depends on the W1 spine. **W0 leads and parallels;
W4 parallels W2/W3.** The clean-cut tail gates on all obligation waves completing.

## Workstream sizing *(carried from `gate1-k5-postgate.md`, the IN work only)*

| Workstream | IF obligations | Blocking | IF-slice effort | Canon dep | Readiness | Lands in |
|---|---|---|---|---|---|---|
| security-pii-api | 23 | 7 | **L** | blocking | has-partial-canon | W2 (+W3 envelope) |
| security-pii-inngest | 14 | 3 | M | blocking | has-partial-canon | W3 |
| architecture | 7 | 0 | M | partial | has-partial-canon | W1 |
| billing-subscriptions | 2 | 1 | S | partial | has-partial-canon | W0/W4 |
| errors-api | 1 | 0 | XS | none | has-partial-canon | W3 |
| l10n-a11y-mobile | 1 | 0 | XS | none | from-scratch | W4 |
| billing-and-quotas | 1 | 0 | XS | partial | has-partial-canon | W4 |
| **Total** | **49** | **11** | — | — | — | — |

All 3 pre-gate contradictions were dissolved by the Gate-1 rulings (0 remaining).

---

## Out-of-scope workstreams *(named, NOT sequenced here — Phase O orders by blast-radius)*

The 125 clear-out + 9 deferred findings are owned elsewhere. Listed for completeness; their
ordering is O's job, governed by the blast-radius axis (in clean-cut radius → serialize
behind execution; outside → parallel-safe):

- **Clear-out (125), by owner spread (21+ workstreams):** l10n-a11y-mobile (34 — mostly
  outside radius, parallel-safe), security-pii-api / -inngest (the non-IF code remainder),
  architecture-as-code (god-modules, package-boundaries — partly in radius), errors-api,
  agent-instructions (10 — owned by Harness Hygiene / roster **PRG-03**, sequenced pre-P),
  plus singletons (backend-performance, platform-infra, secrets-hygiene, ci-cd-hardening,
  test-infrastructure, navigation/audience-matrix, learning-engine, …).
- **Deferred (9), bucket-4, no mature workstream:** F-008, F-013, F-033, F-043, F-044,
  F-100, F-101, F-102, F-115 — all non-blocking (see `stream-2-backlog.md § N.0 Population C`).
- **Parked Stream-2 canon body:** ruled DEFER en bloc by N.0 (pull-forward empty) —
  `stream-2-backlog.md § N.0 partition` + `§ Inventory`.

---

## Handoff to Phase O

O consumes this skeleton and produces the master plan: the in-scope work packages (W0–W4 +
clean-cut tail, decomposed to WP granularity), the out-of-scope workstreams named with
rationale, the dependency map and bundle grouping above, and the Cosmo-enablement interface
(identity-foundation as the first dogfood). The N.0 pull-forward subset being empty means O
carries **no pre-execution Stream-2 doc-work** — the only pre-W1 work is the baseline reset
(MMT-ADR-0012) and the 11 execution-blocking patch-now defects, all of which must be resolved
(patch or ratified-not-exposed proof) before W1, per the W0 hard gate.
