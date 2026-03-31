# Issue Fix Plan — Session Recovery, Summary State, and Celebration Integrity

**Author:** Codex
**Date:** 2026-03-31
**Context:** Follow-up plan for the current project-wide code review. This plan covers the concrete issues found in the active session, summary, and celebration flows.

---

## Goal

Fix the current regressions in the learner session flow before further session-lifecycle work lands:

1. Summary skips are not persisted.
2. Milestones are lost across session resume.
3. Persisted system prompts are not restored in resumed sessions.
4. Validation confidence is reduced by the current Jest/Nx runner instability.

---

## Findings Summary

| ID | Severity | Area | Issue |
|----|----------|------|-------|
| IF1 | High | Session close + summary flow | "Skip for now" no longer updates backend summary state, so skip tracking and Casual Explorer prompting silently break. |
| IF2 | Medium-High | Session recovery + milestone tracking | Milestones earned before app backgrounding/crash are lost on resume and can be re-triggered or omitted from the final summary. |
| IF3 | Medium | Transcript recovery | `system_prompt` events are persisted but excluded from transcript restore, so recovery drops the silence nudge history it just saved. |
| IF4 | Medium | Validation tooling | Project test execution is currently unreliable from this environment due Jest/TS config and Nx plugin-worker failures. |

---

## Fix Streams

### Stream A — Restore Summary State Integrity

**Issue:** IF1

**Files likely involved**
- `apps/mobile/src/app/(learner)/session/index.tsx`
- `apps/mobile/src/app/session-summary/[sessionId].tsx`
- `apps/mobile/src/hooks/use-sessions.ts`
- `apps/api/src/routes/sessions.ts`
- `apps/api/src/inngest/functions/session-completed.ts`

**Plan**
- Decide on a single source of truth for post-close summary state.
- Preferred approach:
  - Close the session with `summaryStatus: 'pending'` when the learner finishes normally.
  - Add an explicit backend action for "skip summary" so the summary decision is persisted after the summary screen.
  - Ensure "submit summary" also finalizes summary state server-side if it has not already been updated.
- Keep auto-closed sessions on `summaryStatus: 'auto_closed'`.
- Verify `incrementSummarySkips`, `resetSummarySkips`, and `shouldPromptCasualSwitch` are driven by real learner behavior again.

**Acceptance criteria**
- Skipping the summary produces a persisted backend state of `skipped`.
- Submitting the summary produces a persisted backend state of `submitted` or `accepted`.
- Casual-switch prompting works again from real skip counts.

---

### Stream B — Make Milestones Resume-Safe

**Issue:** IF2

**Files likely involved**
- `apps/mobile/src/app/(learner)/session/index.tsx`
- `apps/mobile/src/hooks/use-milestone-tracker.ts`
- `apps/mobile/src/lib/session-recovery.ts`
- `apps/api/src/services/session.ts`
- `packages/schemas/src/sessions.ts`

**Plan**
- Persist milestone progress before session close instead of only at close time.
- Choose one of these implementations:
  - Add milestone state to the recovery marker and restore it on resume.
  - Better: persist milestones in session metadata incrementally via API so recovery is server-backed.
- Ensure restored sessions hydrate both:
  - already reached milestones
  - enough tracker state to avoid duplicate firing
- Preserve milestone recap on the final summary route even after a resumed session.

**Acceptance criteria**
- A learner can background or crash mid-session, resume, and keep prior milestones.
- Previously earned milestones do not replay unless a genuinely new one is reached.
- Final summary recap contains milestones earned before and after resume.

---

### Stream C — Include System Prompts in Recovery Transcript

**Issue:** IF3

**Files likely involved**
- `apps/api/src/services/session.ts`
- `packages/schemas/src/sessions.ts`
- `apps/mobile/src/app/(learner)/session/index.tsx`

**Plan**
- Expand transcript response to include `system_prompt` events, or add a dedicated transcript event model that can represent them safely.
- Update the mobile restore logic to render restored system prompts in a controlled way.
- Keep transcript rendering rules strict so only intended event types appear in the learner chat.

**Acceptance criteria**
- A persisted silence nudge survives session recovery.
- Transcript payload and client rendering stay type-safe.
- No unintended internal-only events leak into the learner UI.

---

### Stream D — Repair Validation Path

**Issue:** IF4

**Files likely involved**
- `jest.config.ts`
- `apps/api/jest.config.ts`
- `apps/mobile/jest.config.cts`
- `tsconfig.base.json`
- Nx/Jest project wiring as needed

**Plan**
- Fix the Jest/TypeScript config mismatch causing `TS5095`.
- Fix or document the Nx plugin-worker startup issue if it is environmental.
- Re-enable reliable targeted test runs for API and mobile session flows.
- Add tests for the new fixes rather than relying only on mock-heavy happy paths.

**Acceptance criteria**
- Targeted API and mobile test suites can be run reliably.
- New tests cover:
  - summary skip persistence
  - milestone restoration
  - transcript restoration of system prompts

---

## Recommended Order

1. Stream A — summary state integrity
2. Stream B — milestone resume safety
3. Stream C — transcript/system prompt recovery
4. Stream D — validation tooling, then full regression pass

Why this order:
- Stream A fixes the only clear high-severity behavior regression.
- Stream B and Stream C both touch recovery behavior and should be aligned after summary state is stable.
- Stream D should happen before final merge so the fix set can be verified properly.

---

## Regression Checklist

- Close session and skip summary.
- Close session and submit accepted summary.
- Auto-close stale session and open summary screen.
- Trigger milestones, background app, resume session, continue learning.
- Trigger a silence prompt, background app, resume session, confirm restored chat state.
- Confirm celebration polling and "seen" behavior still work for learner and parent views.

---

## Definition of Done

- Summary state is persisted correctly for skip, submit, accept, and auto-close.
- Session recovery preserves milestones and relevant system prompts.
- No duplicate celebration or milestone firing after resume.
- Automated tests exist for each fixed bug path.
- Project test execution path is reliable enough to validate the touched flows.
