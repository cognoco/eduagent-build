# Learning-Product Evolution — Next Phase

Continue the learning-product evolution audit by proposing (and on confirmation, executing) the next phase. This is **third-attempt** territory: prior attempts shipped end-to-end without removing the old surfaces, so the strict rule is **understand current wiring before recommending anything**.

## Inputs (read these in this order)

1. **Master audit plan** (single source of truth for slice/wave structure):
   `docs/plans/app evolution plan/2026-05-06-learning-product-evolution-audit.md`

2. **Done folder** (everything already shipped on this initiative):
   `docs/plans/app evolution plan/done/`
   List the directory and read each plan to know what's actually completed — names + acceptance criteria. Don't infer from filenames alone.

3. **Mobile flow inventory** (current wiring snapshot, dated):
   `docs/flows/mobile-app-flow-inventory.md`
   This is the authoritative current-state map. Always cross-check the date at the top vs. the plan date. If the plan was written before the inventory's "What changed since" entries, the plan may already be partially superseded by changes you haven't accounted for.

## Workflow

### Phase 1 — Read

Read all three inputs in full. Don't skim. The audit plan has a "What Is Already Shipped But Not Turned On" section and explicit Wave 1/2/3/4 structure under "Recommended Sequencing" — those are the load-bearing parts.

### Phase 2 — Reconcile plan vs. reality

For each remaining slice/wave item, do not trust the plan's "depends on" or "already in place" claims at face value. Verify against code:

- For each PR letter (5a, 5b, 5d, 5e, 5g, 5h, 5i, etc.) the plan still lists as pending, check whether:
  - The file paths it names still exist and still contain the code the plan describes.
  - A `done/` doc already covers it under a different name.
  - The flow inventory marks the surface as `shipped`, `flag-gated`, `prompt-only`, or `data-only`.
- For each flow involved in the next candidate slice, **read the inventory entry and read the actual code** in `apps/mobile/src/app/(app)/...` and `apps/api/src/services/...`. The flow inventory is dated; code is the real state.
- If a plan item says "X already exists" and X doesn't actually exist (or vice versa), **stop and surface the discrepancy** — don't paper over it.

This step is the whole point of the skill. Skipping it is exactly the failure mode of the prior two attempts.

### Phase 3 — Propose the next phase

Output a single concise proposal with:

1. **Which wave/slice is next**, with the reason (what blocks it, what unblocks it).
2. **Per-PR breakdown** for that wave. For each PR:
   - User story (1 line) and acceptance criteria (bullets), copied or refined from the audit plan.
   - **Current wiring evidence** — file paths and line numbers showing the existing state. This is mandatory; without it, the proposal is rejected.
   - **What changes** — concrete files to add/edit/delete, not vague intent.
   - **Parallel-safe with** which other PRs in the same wave (the plan has a table; verify it still holds after any reconciliation in Phase 2).
3. **Risks / open questions** — anything Phase 2 surfaced that the plan didn't anticipate.
4. **What I will NOT do without your sign-off** — especially anything that deletes screens, flips a default flag in production, or touches LLM prompts (the latter requires `pnpm eval:llm` per `CLAUDE.md`).

### Phase 4 — Wait for go / no-go

Do not start implementing. Present the proposal. The user decides whether to greenlight the wave, swap PR ordering, defer something, or kill an item.

When greenlit, follow the existing dispatch / commit conventions from `CLAUDE.md` and the user's memory:
- Subagents never commit (memory: `feedback_agents_commit_push.md`).
- Coordinator commits via `/commit` only.
- LLM-prompt PRs run `pnpm eval:llm` before commit.
- Old-screen deletion PRs (5h pattern) require the file-count guardrail to drop after the change.

## Hard rules

- **Never recommend a wave without first reading every flow it touches in the inventory AND in code.** If you skip this, you are repeating attempt #1 and attempt #2.
- **Never claim "already implemented" without a file:line citation.** The audit plan calls this out explicitly — fast-path bypass code "exists and works" but isn't on in prod, and prior teach-first work shipped but the old screens were never removed. Existence ≠ active.
- **Never delete a screen without verifying the new path is green in E2E.** Wave 4 (5h) is gated on Wave 3 (5f E2E) being green for a reason.
- **Never flip a feature flag default in production as part of "next phase" without explicitly flagging it as a separate decision.** Production flag flips need their own approval.
- **Plan filenames lie** (memory: `feedback_verify_status_in_code.md`). A doc named `2026-05-06-slice1-pr5d-curriculum-prewarm.md` in `done/` does not by itself prove 5d is shipped. Read the doc, then verify in code.

## Output shape

Structure the proposal as:

```
## Reconciliation summary
- <discrepancies found between plan and code, if any>
- <items the plan lists as pending that are actually done, or vice versa>

## Next wave: <Wave N — title>
**Why this wave next:** <unblocked because…>

### PR <letter> — <name>
- **User story:** …
- **Acceptance:** …
- **Current wiring:** `path/to/file.ts:NN` …
- **Changes:** …
- **Parallel-safe with:** …

### PR <letter> — …
…

## Risks / open questions
- …

## Awaiting your go-ahead before starting.
```

Keep it tight. The user is non-coder — make decisions on technical details yourself, only escalate user-facing/UX choices and anything that flips a production flag or deletes user-visible surfaces.
