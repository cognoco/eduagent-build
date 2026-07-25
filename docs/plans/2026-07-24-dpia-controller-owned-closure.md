---
title: DPIA Controller-Owned Closure — Implementation Plan
date: 2026-07-24
profile: change
work_items: [WI-1109, WI-1192, WI-1194, WI-1335, WI-1577, WI-1659, WI-2390, WI-2411, WI-2690, WI-2697]
status: in-progress
---

# DPIA Controller-Owned Closure — Implementation Plan

**Goal:** Close and evidence every launch-DPIA action owned by ZWIZZLY AS,
while asking Stephan only for independent legal/privacy advice.

**Approach:** Keep the external correspondence short and decision-focused.
Track implementation, operational evidence, and external execution internally.
Existing Work Item ownership is respected; missing delivery items are captured
before implementation.

## Scope

In scope:

- `docs/compliance/DPO exchanges/2026-07-23-dpia-review-response-draft.md`
- `docs/compliance/DPO exchanges/2026-07-24-stephan-decision-annex.md`
- `docs/compliance/`
- country/residence/consent enforcement in `apps/api`, `apps/mobile`, shared
  schemas, and database migrations
- LLM egress and fallback enforcement
- retention, deletion, rights/export, Article 9 minimisation, provider,
  transparency, and launch-gate evidence
- the relevant Cosmo Work Items and Operator Queue actions

Out of scope:

- Stephan’s independent legal conclusions and formal DPO opinion
- management’s final proceed/no-proceed decision
- later higher-threshold-country launch until guardian authorisation is
  implemented and separately evidenced

## Tasks

- [x] T1: Replace the external remediation audit with a concise decision
  request — done when: the response and annex contain no internal Work Item
  status, code-defect inventory, or controller-owned “incomplete” list, and
  every question asks Stephan for a legal/privacy judgment rather than
  implementation.
- [ ] T2: Close the threshold-13 launch-country control — done when:
  **WI-2690 (DB-mastered country matrix and consent resolver)** is landed on
  `origin/main`, exact residence drives an effective-dated rule, unsupported
  and stale cells fail closed, and synthetic positive/negative country tests
  pass.
- [ ] T3: Close jurisdiction-aware AI egress and distinct-provider fallback —
  done when: **WI-2697 (canonical-jurisdiction AI-egress gate)** is landed on
  `origin/main`, every conversational, vision, judge, asynchronous, and
  embedding path is covered, the same-primary vision fallback defect has a
  dedicated delivery item and landed regression test, and no unapproved route
  receives a synthetic request.
- [ ] T4: Close affirmative adult consent before AI processing — done when:
  **WI-2411 (mobile consumption of `needsAdultConsent`)** is refined, executed,
  and landed; a dedicated server-side item makes missing, unknown, withdrawn,
  or stale required grants fail closed before every AI dispatch; acceptance,
  refusal, withdrawal, and re-consent tests pass.
- [ ] T5: Close retention and deletion implementation — done when:
  **WI-1194 (retention gaps and dormancy)** is landed by its current owner;
  category periods approved through **OPQ-24 (counsel-approved retention
  periods)** are implemented; null-summary, verbatim-quote, derived-data,
  dormancy, monitoring, provider, backup/cache/vector, and end-to-end erasure
  evidence is retained.
- [ ] T6: Close Article 9 minimisation — done when: Stephan’s advice identifies
  the applicable legal treatment; a dedicated delivery item covers
  child-readable discouragement, non-solicitation, durable-record suppression,
  supported-language tests, short incidental-content retention, and the
  safeguarding/crisis procedure; the implementation and evidence are landed.
- [ ] T7: Close rights, export, deletion recovery, and guardian access — done
  when: export includes all relevant raw and derived data; **WI-2390
  (account/person deletion recovery and audit proof)** is refined and landed;
  correction, withdrawal, restriction, objection, portability, internal and
  external erasure, authority/revocation, privileged-access, and isolation
  tests pass.
- [ ] T8: Close controller, provider, notice, and store evidence — done when:
  the controller/main-establishment memorandum names Zuzana Kopečná as
  accountable management; **WI-1192 (processor and transfer evidence ledger)**,
  **WI-1109 (privacy-policy and child-readable publication package)**,
  **WI-1335 (Google Play/Data Safety package)**, and **WI-1659 (AI Act
  obligation integration)** are landed; contacts and launch facts are
  consistent.
- [ ] T9: Complete controller-owned external actions — done when: the DPO
  retainer/appointment, executed provider terms and TIAs, store territory
  restrictions, published notices, consultation evidence, and console
  submissions have dated records in the appropriate secure or operational
  system.
- [ ] T10: Run the final launch gate — done when: **WI-1577 (launch compliance
  closure final gate)** is rerun against the exact `origin/main` release and
  external evidence, produces GO, and the final DPIA receives Stephan’s formal
  DPO opinion followed by Zuzana’s recorded management decision.

## Verification

- External response contains only settled management facts, proposed legal
  positions, and explicit questions for Stephan.
- Every controller-owned statement in the final DPIA resolves to landed code,
  a dated operational artefact, an executed external document, or an explicit
  management decision.
- `git diff --check`, local Markdown-link validation, relevant change-class
  validation, Work Item lifecycle checks, and the final launch gate pass.
