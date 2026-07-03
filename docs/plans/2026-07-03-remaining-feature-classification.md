---
title: Remaining Feature Classification
date: 2026-07-03
status: Snapshot
source: Cosmo WI audit, code-checked against current V2 shell and V2 identity state
---

# Remaining Feature Classification

This is a classification snapshot for the remaining Work Items audited on
2026-07-03: the P1/P2 launch/security/product items plus the P3/can-wait
deferred batch. It is not an execution plan and does not change Work Item
lifecycle state. The corresponding Cosmo Work Item `Notes` fields were enriched
with the code-grounded findings from the audit.

## Priority Items

These items were previously classified as P1/P2 by another agent. This audit
checked them against the implemented code, the V2 shell direction, and the V2
identity-management model.

| Work Item | End-user value | Effort | Risk | Product impact | Still relevant? | Would build? |
|---|---|---:|---:|---:|---|---|
| `WI-1442` - consent audit trail before profile hard-delete | Compliance proof survives deletion | M/L | High | High | Yes | Yes, before launch |
| `WI-1438` - Challenge-grader model vetting record | Safer Challenge Round mastery decisions | S/M | Low impl, high decision | High | Yes | Yes, before `WI-1435` |
| `WI-1435` - flip `LLM_ROUTING_V2_ENABLED` + prod soak | Users get the intended Gemini-free V2 routing path | M | High | High | Yes | Yes, controlled soak only |
| `WI-1441` - `pushEnabled` on OS grant + review/daily toggle home | Push permission leads to actual review/daily nudges | M | Med | High | Yes | Yes, before notification launch |
| `WI-1447` - voice STT/TTS locale fallback mappings | Non-English voice feels credible for cs/ja/pl/en | S/M | Low/Med | High | Yes | Yes |
| `WI-1474` - billing T1 payment-failed notify | User knows payment failed and can recover | M | Med/High | High | Yes | Yes, before paid launch |
| `WI-1475` - billing T2 past-due banner | User sees in-app recovery path for past-due billing | M | Med | High | Yes | Yes, paired with `WI-1474` |
| `WI-1482` - Continuity T3 notes previews + proxy privacy gate | Prevents parent-proxy/private-note visibility mistakes | M | Med | High | Yes | Yes, before broader Journal/proxy exposure |
| `WI-1449` - CI scope guard for `profileId` predicates | Reduces cross-profile data leak risk | M/L | Med | High | Yes | Yes, with sanctioned-deviation allowlist |
| `WI-1461` - RR-3 dual push-cron consolidation | Avoids duplicate/confusing review nudges | M | Med | High | Yes | Yes, before broad notification enablement |
| `WI-1496` - tutor-prose language picker | User can choose tutor language separately from UI language | S/M | Low/Med | High | Yes | Yes if multilingual tutor prose is marketed |
| `WI-1446` - promote stranded `needs_deepening_topics` rows | Weak topics do not disappear before remediation | S/M | Med | High | Yes | Yes if pending rows are launch-active |
| `WI-1437` - Milestone NowCard in Mentor | Milestones appear in the Mentor feed with appropriate copy | S | Low | Med | Partly already built | Rewrite as milestone copy/QA polish |
| `WI-1492` - `SpeakingPracticeCard` wiring | Speaking practice component becomes live product UI | M | Med | Med/High | Yes | Yes only if speaking practice is launch scope |
| `WI-1473` - `retrieval_events` follow-ons | Better review routing and eval-corpus evidence | M | Med | Med | Yes | Split: build eval reader if needed; defer `relearn` producer |
| `WI-1472` - RR-15 review-backbone spec | Coherent deep-review strategy | M | Low/Med | High later | Yes | Spec only, after launch blockers |
| `WI-1460` - `epics.md` Annex A.5 superseded pass | Prevents stale identity/shell assumptions from guiding work | S/M | Low | Med | Yes | Yes, not launch-blocking |
| `WI-1457` - preview lesson for the "Me" trial path | Better pre-signup preview | L | High | Med | Weak for current app | No; rule as won't-do for launch |
| `WI-1495` - scoped-repo vocabulary gap | Security if vocabulary reads were unscoped | S verify | Low | Low incremental | Already covered | Verify and close/update |

### Priority Readout

Keep high priority:

- `WI-1442` - consent audit trail before profile hard-delete
- `WI-1438` - Challenge-grader model vetting record
- `WI-1435` - `LLM_ROUTING_V2_ENABLED` soak
- `WI-1441` - push permission/server preference wiring
- `WI-1447` - voice locale fallback mappings
- `WI-1474` / `WI-1475` - payment-failed notify and past-due banner
- `WI-1482` - proxy privacy gate for notes/bookmark previews
- `WI-1449` - `profileId` predicate guard

Reshape or split:

- `WI-1437` - current code already has the ledger-moment feed/rendering path;
  remaining work is milestone-specific copy and QA, not a full NowCard build.
- `WI-1473` - split the eval-corpus reader from the future `relearn`
  `nextAction` producer.
- `WI-1446` - build if launch flows actively create `pending_review` rows;
  otherwise keep as monitored review-backbone follow-up.
- `WI-1492` - build only if live speaking practice is part of launch scope.
- `WI-1472` - keep as strategy/spec; do not implement until the review fork is
  ruled.

Downgrade or close:

- `WI-1457` - recommend won't-do for launch because pre-consent preview must
  stay browse-only/no-AI/no-collection/no-network under the V2 identity canon.
- `WI-1495` - likely stale; `createProfileRepository` already scopes
  `vocabulary` and `vocabularyRetentionCards`.

## Deferred Items

| Work Item | End-user value | Effort | Risk | Product impact | Still relevant? | Would build? |
|---|---|---:|---:|---:|---|---|
| `WI-1436` - delete legacy Gemini routing | Less compliance/audit risk | M | High | Med | Yes | Defer until V2 router + grader soak |
| `WI-1440` - S6 V0/V1 shell retirement | Cleaner V2 app, less legacy drag | XL | High | High | Yes | Defer; product-gated and irreversible |
| `WI-1452` - evidence citation loop | Tutor can cite learner's own saved work | XL | High | High | Yes | Defer; needs substrate/eval/privacy work |
| `WI-1453` - rotating greeting pool | Less repetitive returning-session feel | M | Low | Med | Yes | Defer; polish, not core |
| `WI-1455` - note-correctness nudge | Helps learner compare shaky notes gently | M | Med | Med | Yes | Defer until note-correctness signal exists |
| `WI-1458` - trial parent clarity re-spec | Clearer parent onboarding | S | Low | Low/Med | Maybe | Defer or retire; legacy surface target |
| `WI-1465` - per-concept re-prove path | Learner can recover one weak concept | XL | High | High | Yes | Defer; needs product/design flow |
| `WI-1467` - deeper recall grading context | Recall grading feels more mentor-like | M/L | Med/High | Med | Yes | Defer behind correctness blockers |
| `WI-1468` - relearn reason tag | Learner sees why topic is queued | S/M | Low | Low now, Med later | Yes | Defer until Challenge data differs |
| `WI-1470` - topicOrder path preview | Better session wrap-up path clarity | M | Med | Med | Yes | Defer; useful polish |
| `WI-1471` - cooldown/startRelearn hygiene | Protects future session invariants | S/M | Med | Low/Med | Yes | Fold into adjacent retention work |
| `WI-1477` - child-allocated top-ups | Parent can give child extra capacity | L | High | High | Yes | Defer; needs allocation model |
| `WI-1478` - parent action from child-cap banner | Parent can resolve child quota block | M/XL | Med | Med | Yes | Defer; blocked by `WI-1477` + V2 surface |
| `WI-1479` - billing recovery observability | Support/on-call sees failed recovery | S/M | Low | Med | Yes | Tail task after billing paths land |
| `WI-1484` - V2 parent nudges | Parent sends more grounded nudges | M/L | Med | Med | Yes | Defer until guardian surface is ruled |
| `WI-1488` - child-to-parent nudges | Learner can ask guardian for help | L | High | Med/High | Yes | Defer; needs auth/rate-limit/spec |
| `WI-1489` - resumable practice | Learner resumes paused practice | XL | High | High | Yes | Defer; needs NowCard priority spec |
| `WI-1491` - note-correctness umbrella | Trustworthy learner note feedback | XL | High | High | Yes | Defer and split later |
| `WI-1494` - RLS activation | Defense-in-depth tenant isolation | XL | High | High | Yes | Defer as dedicated security WP |

## Not Really Deferred

| Work Item | Recommendation |
|---|---|
| `WI-1451` - freeform note CTA to bookmark | Close/cancel as stale |
| `WI-1456` - concept star re-home | Supersede; conflicts with note-correctness direction |
| `WI-1490` - validateNoteDraft wiring | Close/cancel as already implemented |

## Readout

Most deferred items are still relevant, but they are deferred because they are
gated, high-risk, or need a product surface/model decision first.

Highest-value deferred bets:

- `WI-1452` - evidence citation loop
- `WI-1465` - per-concept re-prove path
- `WI-1489` - resumable practice
- `WI-1491` - note-correctness umbrella
- `WI-1494` - RLS activation

Lowest-risk deferred polish:

- `WI-1453` - rotating greeting pool
- `WI-1470` - topicOrder path preview
- `WI-1471` - cooldown/startRelearn hygiene


To discuss these:

Never Build / Close

  - WI-1457 — preview lesson for the “Me” trial path: I would not build a live pre-signup lesson. It fights the V2 consent model, adds privacy/legal complexity, and distracts from making the real first session excellent. Keep static preview only.
  - WI-1458 — trial parent clarity re-spec: likely stale. I would not invest unless the current V2 onboarding still has measurable confusion.
  - WI-1453 — rotating greeting pool: not worth a Work Item. If greetings feel repetitive later, fix opportunistically inside Mentor copy work.
  - WI-1451 — freeform note CTA to bookmark: stale/closed by current note/bookmark direction.
  - WI-1456 — concept star re-home: I would scrap. “Stars” create another lightweight signal that competes with notes, correctness, and mastery.
  - WI-1495 — scoped-repo vocabulary gap: do not build as a feature; verify and close because code appears already covered.

  Do Not Build As Standalone Features

  - WI-1477 — child-allocated top-ups: too much billing/accounting complexity for likely low usage. I’d only revisit if many families ask for per-child quota control.
  - WI-1478 — parent action from child-cap banner: depends on child-allocated top-ups, so scrap with it for now.
  - WI-1488 — child-to-parent nudges: useful-sounding but risky. It needs rate limits, abuse prevention, guardian UX, notification policy, and consent nuance. I’d defer indefinitely unless user research proves it.
  - WI-1489 — resumable practice: I would not build as its own system. Fold “resume” into the main Now/Mentor feed only if abandoned practice becomes common.
  - WI-1491 — note-correctness umbrella: too broad. Scrap the umbrella and rebuild only narrow, evidence-backed slices later.

  Keep, But Shrink Hard

  - WI-1437 — Milestone NowCard in Mentor: keep only the small copy/QA gap. Do not build a new milestone system.
  - WI-1473 — retrieval_events follow-ons: build the eval-corpus reader if it supports launch quality; defer or drop the relearn nextAction producer until the review backbone is designed.
  - WI-1472 — RR-15 review-backbone spec: keep as a short strategy decision, not a large spec project.
  - WI-1460 — stale epics.md headers: do once as hygiene, then stop maintaining old epics as active truth.