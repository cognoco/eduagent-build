---
name: Implementation phasing — Epics 0-16 COMPLETE. LLM tuning phase active on `improvements` branch (2026-04-19).
description: All Epics 0-16 complete. Latest work on improvements branch: Phase 3 LLM prompt tuning from the 2026-04-18 audits — 3 of 4 parallel agents merged, 1 pending.
type: project
---

**All Epics 1-16 COMPLETE as of 2026-04-08.** All phases (1-7) of the original plan complete.

**Active branch (2026-04-19):** `improvements` — supersedes `bugfix`. LLM audit + tuning work.

## Commit sequence on `improvements` (most recent first)

```
413ece4f  feat(api): enrich memory block with strengths + urgency + source metadata (P1.3, P1.4, F8 prep)     (Agent 3)
970a82a5  feat(api): dictation personalization + dead-code cleanup [P0.1, P0.2]                                (Agent 2)
349ecad8  fix(api): tone pass + shorten interview loop [F3, F7]                                                (Agent 4)
3b32b0a1  feat(api): LLM reliability hotfix, response envelope spec, harness extension                         (Phase 0, me)
1316619e  fix(mobile): web stack stacking + quiz/parent improvements [F-003,F-006,F-016,F-017,F-055]
1e50b6ea  feat: quiz UI redesign, parent visibility, home IA simplification (#121)
```

## Active work — LLM Phase 3 tuning (2026-04-19)

Triggered by two audits (see `project_llm_audit_2026_04_18.md`):
- `docs/specs/2026-04-18-llm-personalization-audit.md`
- `docs/specs/2026-04-18-llm-reliability-ux-audit.md`
- `docs/specs/2026-04-18-llm-response-envelope.md`

Four agents dispatched in parallel. State:

| Agent | Status | Commit |
|---|---|---|
| Phase 0 coordinator | Done | `3b32b0a1` |
| 4 — tone + F7 | Merged | `349ecad8` |
| 2 — dictation + dead-code | Merged | `970a82a5` |
| 3 — memory enrichment | Merged | `413ece4f` |
| 1 — quiz personalization | **Pending** — running in `worktree-agent-a7c54bc8` |

## Still open (from earlier epics — unchanged)

- EP15-C2 — Zero test coverage. 8 missing test files.
- EP15-C3 — Step ordering (snapshot vs coaching cards). Needs user decision.
- EP15-C4 — AR-13 session-complete debounce not implemented.

## LLM backlog remaining after Phase 3 lands

See `project_llm_audit_2026_04_18.md` for the full backlog. Highlights:

- **F1.1 INTERVIEW_COMPLETE migration** — biggest leverage, reference implementation for envelope pattern (see `project_llm_marker_antipattern.md`).
- **F1.2/F1.3/F2.1/F2.2 envelope migrations** — main tutoring loop signals.
- **Exchanges flow into eval harness** — the 700-line `buildSystemPrompt` with 13+ context inputs, its own session.
- **Onboarding schema** for the three new dimensions (see `project_onboarding_new_dimensions.md`).

## Epic 17 (Voice-First)

Spec + Phase A plan drafted earlier. Not started.

## How to apply

- Check this memory + `git log --oneline -10` on `improvements` for the current HEAD state.
- Before any new LLM work, read the three 2026-04-18 specs and `project_llm_audit_2026_04_18.md`.
- Eval harness at `apps/api/eval-llm/` — see `project_eval_llm_harness.md`.
