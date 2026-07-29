---
name: project_enduser_gate_carveout_turn_allowlist
description: "source-audit gate exemptions must key on turn identity, not reply-content regex (reviewer treadmill)"
metadata: 
  node_type: memory
  type: project
  created: 2026-07-12
  last_confirmed: 2026-07-12
  status: active
  originSessionId: 9de690ff-6947-4cf4-b828-7dc15bf0b9e9
---

The enduser-gate source_audit check exempts turns that make no sourceable claim.
Keying that exemption on a reply-content regex ("does this reply assert a fact?")
is a reviewer treadmill — reviewer:codex:global executes the code and finds a new
factual phrasing each round (bare → prefixed "Sure, X" → question "Did you know X?").
A regex cannot be both conservative (exclude every phrasing) AND reliable (exempt
VARIABLE model-generated openers) — same hard problem as WI-1894. Robust design
(operator-ruled WI-1823): a TURN-IDENTITY ALLOWLIST — `exemptSourceAudit` marker on
designated non-teaching fixture turns (setup / recall-prompt / quiz / drill /
illustrative language-example); `sourceAuditGateFires(status, exempt)` takes NO
reply text, so phrasing structurally cannot bypass it. Language-example turns
(four-strands "tiny example") make no sourceable claim → exempt; grammar-correction
turns grounded in curriculum definitions stay gated. Lesson: run the reviewer's exact
adversarial inputs yourself BEFORE merge — I once merged a carve-out with a known
residual bypass and the reviewer caught it. [[project_known_bug_patterns]]
