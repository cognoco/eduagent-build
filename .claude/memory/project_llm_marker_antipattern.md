---
name: LLM free-text marker anti-pattern family
description: 5 places where LLM responses are parsed for state-machine decisions via free-text markers or JSON-in-prose. F-042 (INTERVIEW_COMPLETE) is the critical one. Full scope, risks, migration plan.
type: project
---

## The anti-pattern

A prompt asks the LLM to include a `[MARKER]` token (or JSON blob) inside its free-text response. Server code parses with `.includes()` or regex to make a state-machine decision. If the LLM drops/mis-spells/moves the marker, the decision breaks — no retry, no fallback, no type system.

## The 5 instances (full scope verified 2026-04-18)

| # | Marker | File:line | Risk | Status |
|---|---|---|---|---|
| F1.1 | `[INTERVIEW_COMPLETE]` | `interview.ts:234, :280` — `response.includes()` | **CRITICAL** — user trapped if not emitted; only 7-day TTL recovery | **MIGRATED** (3ce28b45) |
| F1.2 | `[PARTIAL_PROGRESS]` | `escalation.ts:108` + `exchanges.ts:948` | HIGH — freeze escalation counter | **MIGRATED** (3ce28b45). Divergent matchers fixed earlier in 3b32b0a1. |
| F1.3 | `[NEEDS_DEEPENING]` | `exchanges.ts:943` | MEDIUM — queue topic for remediation | **MIGRATED** (3ce28b45) |
| F2.1 | `{"notePrompt":true}` JSON-in-text | `exchanges.ts:861` | MEDIUM — UI hint, safe fallback | **MIGRATED** (3ce28b45) |
| F2.2 | `{"fluencyDrill":{...}}` JSON-in-text | `language-prompts.ts:59` + `exchanges.ts:890` | MEDIUM — UI hint, safe fallback | **MIGRATED** (3ce28b45) |

## Near-miss worth watching

`UNDERSTANDING_CHECK_PATTERNS` in `exchanges.ts:156-164` mixes the real marker `[UNDERSTANDING_CHECK]` with six natural-language phrases (`'does that make sense'`, `'what do you think'`, etc.). Currently only drives behavioral telemetry, not control flow — but if any future feature keys off `isUnderstandingCheck` for routing, the free-text phrases become fragile. Either remove the NL phrases or keep only the marker entry.

## The 2026-04-19 hotfix (commit `3b32b0a1`)

`escalation.ts:detectPartialProgress` used permissive `.includes('[PARTIAL_PROGRESS]')`. `exchanges.ts` used strict `/(?:^|\n)\[PARTIAL_PROGRESS\]\s*$/`. The permissive version fires on mid-sentence occurrences; the strict strip step then fails to remove the raw token, leaking `[PARTIAL_PROGRESS]` visibly into learner-facing messages.

**Fix:** unified both to the strict regex. Added regression test in `escalation.test.ts`: `detectPartialProgress refuses mid-sentence occurrences (F1.2 regression)`.

## The migration pattern (from response envelope spec)

```ts
// BEFORE — fragile
system prompt: "End with [PARTIAL_PROGRESS] on its own line if..."
parser: response.includes('[PARTIAL_PROGRESS]')

// AFTER — typed
system prompt: "Respond with JSON: {reply, signals: {partial_progress: bool, ...}}"
parser: validated.signals.partial_progress  // Zod-validated envelope
```

Plus server-side cap as belt + suspenders — e.g. `MAX_INTERVIEW_EXCHANGES = 6` forces `ready_to_finish = true` regardless of what the LLM returned.

Full envelope shape in `docs/specs/2026-04-18-llm-response-envelope.md`:

```ts
{
  reply: string;
  signals?: { ready_to_finish?, partial_progress?, needs_deepening?, understanding_check? };
  ui_hints?: { note_prompt?, fluency_drill? };
  confidence?: 'low' | 'medium' | 'high';
}
```

## Migration order (COMPLETE — 3ce28b45)

1. **F1.1 INTERVIEW_COMPLETE** (P0) — reference implementation. Done.
2. **F1.2 + F1.3** (P1) — main exchange loop. Done.
3. **F2.1 + F2.2** (P2) — UI hints in same envelope. Done.

## Formal implementation plan

`docs/plans/2026-04-19-bucket-a-envelope-migration.md` — per-flow fix table with finding IDs, server caps, break-test names, failure-modes table, telemetry gate (2% disagreement over 7 days), commit-message convention. Use this plan as the build-time reference. Design spec (envelope shape) lives alongside at `docs/specs/2026-04-18-llm-response-envelope.md`.

Harness supports validation: `FlowDefinition.expectedResponseSchema` (added in `3b32b0a1`) validates structured responses during Tier 2 `--live` runs and renders violations as a Schema-violation section in the snapshot.

## How to apply

- When you see a new feature wanting LLM-gated state transitions, use the envelope pattern — NOT a new marker.
- Break-test mandate (per `feedback_fix_verification_rules.md`): every migrated flow needs a "model returns false / malformed JSON" test proving the server cap engages.
