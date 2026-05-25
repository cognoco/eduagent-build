---
name: learning-evolution-next
description: Use when continuing the EduAgent learning-product evolution audit, choosing the next wave or slice, reconciling shipped-vs-active mobile learning flows, or proposing the next phase before implementation.
---

# Learning Evolution Next

This is a planning skill, not an implementation shortcut. The prior failure mode was shipping new surfaces without proving old surfaces were removed or inactive. Verify wiring in docs and code before recommending any phase.

## Inputs

Read in this order:

1. `docs/plans/app evolution plan/2026-05-06-learning-product-evolution-audit.md`
2. Every file in `docs/plans/app evolution plan/done/`
3. `docs/flows/mobile-app-flow-inventory.md`

Do not infer completion from filenames. Read the done docs and then verify in code.

## Reconcile Reality

For each remaining wave/slice item:

- Check whether named files still exist and still contain the described code.
- Check whether a `done/` doc covers it under a different name.
- Check whether the flow inventory marks the surface `shipped`, `flag-gated`, `prompt-only`, or `data-only`.
- Read the actual mobile and API files touched by the candidate flow, especially under `apps/mobile/src/app/(app)/...` and `apps/api/src/services/...`.
- If a plan claim conflicts with code, stop and surface the discrepancy with file/line evidence.

## Proposal Output

Return only a proposal and wait for user go-ahead:

```text
## Reconciliation summary
- <discrepancies, pending-but-done, done-but-not-active, or none>

## Next wave: <Wave N - title>
Why this wave next: <reason>

### PR <letter> - <name>
- User story: <one line>
- Acceptance: <bullets>
- Current wiring: path/to/file.ts:NN ...
- Changes: <concrete files/actions>
- Parallel-safe with: <verified list>

## Risks / open questions
- <items>

## Awaiting your go-ahead before starting.
```

## Hard Rules

- Never recommend a wave without reading every flow it touches in the inventory and in code.
- Never claim "already implemented" without a file:line citation.
- Never delete a screen without verifying the new path is green in E2E.
- Never flip a production feature-flag default without explicit approval.
- Treat LLM prompt changes as eval-gated work: run `pnpm eval:llm` before commit.
- Use `$project-memory` if memory references this initiative; plan filenames can lie.
