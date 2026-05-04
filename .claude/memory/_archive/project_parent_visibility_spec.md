---
name: Parent visibility & progress highlights specs (2026-04-18)
description: Two companion specs written 2026-04-18 covering privacy boundaries + RLS updates, and empty states + session highlights. Split after scope-creep review.
type: project
---

Two design specs written 2026-04-18 and under review:

- `docs/superpowers/specs/2026-04-18-parent-visibility-privacy-design.md` — transcript access removal, streaks/XP in dashboard, curated mentor-memory view (categorized delete, Option A with escape hatch), `family_links` RLS policies, parent-read subquery policies for 11 child-data tables in Phase 2, `session_events` explicitly excluded from parent-read.
- `docs/superpowers/specs/2026-04-18-progress-empty-states-highlights-design.md` — lower milestone thresholds (sessions [1,3,5,...], topics [1,3,...], streaks [3,...], vocab [5,...]), LLM session highlights for 3+ exchange sessions via Haiku-class through `services/llm/router.ts`, template fallback for brief sessions, empty-state copy, vocabulary section hidden for non-four_strands subjects. New `session_summaries.highlight` column.

**Why:** User originally asked for a combined "parent dashboard" spec. Review found (a) existing dashboard is NOT greenfield — 10 API routes, 8 mobile screens already built; (b) scope spanned three distinct projects (privacy, RLS, UX). Split into two independent specs to match feedback_spec_before_code.md discipline. Key design decisions: parents see summary + learning notes, NOT raw transcripts (GDPR Art. 8); mentor memory uses categorized list with per-item delete (not LLM-mediated deletion — preserves `feedback_human_override_everywhere` principle).

**How to apply:** Specs are pending implementation. Known pre-implementation gaps flagged in review: (1) categorization field in learner_profile_items is a placeholder ("inferenceType or tag"), needs schema verification; (2) prompt injection risk for session highlights — mitigations not yet in failure modes table; (3) orphan cleanup language is loose in Section 1; (4) 11-table list for parent-read RLS needs cross-check against actual dashboard service imports; (5) multi-subject vocabulary visibility edge case. The Phase 2-4 RLS plan (`docs/plans/2026-04-15-S06-rls-phase-2-4-enforcement.md`) must be updated as a spec deliverable before implementation.
