---
name: Use Sonnet for subagents
description: User prefers Sonnet model for subagents where possible to save cost/speed
type: feedback
---

Use Sonnet (model: "sonnet") for subagents where possible, reserving Opus for tasks that genuinely need deeper reasoning.

**Why:** User explicitly requested "use sonnet where possible" — likely cost and speed optimization.

**How to apply:** When dispatching Agent tool calls, set `model: "sonnet"` unless the task requires complex architectural reasoning, nuanced code review, or multi-step debugging where Opus would materially improve quality.
