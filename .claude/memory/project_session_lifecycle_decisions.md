---
name: Session lifecycle key decisions (Epic 13)
description: Wall-clock time shown to ALL users. Active time internal only. LLM-adaptive silence via expectedResponseMinutes. Hard caps removed.
type: project
---

Key design decisions for Epic 13 (session lifecycle overhaul), agreed 2026-03-30:

**1. Wall-clock time for everyone.**
Both child and parent see wall-clock time — learning includes reading, paper work, and thinking away from the screen. Parent also sees exchange count for engagement context ("45 min, 18 exchanges" vs "120 min, 2 exchanges"). Active/engaged time (`durationSeconds` via `computeActiveSeconds()`) is internal analytics only, never shown to any user.

**Why:** A child reading a textbook for 20 minutes between messages IS learning. Showing only "active" time undervalues the actual work. Wall-clock + exchange count gives honest engagement context.

**2. Hard caps removed (Epic 13.2).**
No more forced session ends at 20/30 minutes. Sessions end when the user says "I'm done" or silence timeout fires. The `hard_cap` close reason is being removed from the schema.

**Why:** Hard caps are hostile — forcing a session end mid-thought punishes engaged learners.

**3. LLM-adaptive silence detection (Epic 13.5, not yet implemented).**
Each AI response includes `expectedResponseMinutes` in metadata. The silence timer uses this instead of a fixed constant. A "What's 2+2?" gets 2 min, a "Solve this system of equations" gets 10 min.

**Why:** Fixed silence caps (8 min) either interrupt students doing paper work or wait too long for simple recall questions. The LLM knows what it just asked.

**4. `computeActiveSeconds()` gap-cap algorithm (FR210).**
Sums capped inter-event gaps: sessionStart→event[0], event[0]→event[1], etc. Each gap capped at `min(gap, perGapCap)`. Per-gap cap defaults to 8 min, overridden by LLM's `expectedResponseMinutes * 1.5`. Tail gap (last event → session close) is intentionally excluded — only observable events count.

**How to apply:** When building UI that shows time, use `wallClockSeconds`. When building analytics/internal reporting, use `durationSeconds`. Never expose `durationSeconds` to users.
