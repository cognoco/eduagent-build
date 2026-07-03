---
title: Remaining Feature Classification
date: 2026-07-03
status: Snapshot
source: Cosmo WI audit, code-checked against current V2 shell and V2 identity state
---

# Remaining Feature Classification

This is a classification snapshot for the P3/can-wait Work Items audited on
2026-07-03. It is not an execution plan and does not change Work Item lifecycle
state. The corresponding Cosmo Work Item `Notes` fields were enriched with the
code-grounded findings from the audit.

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
