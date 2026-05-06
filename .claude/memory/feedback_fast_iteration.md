---
name: User demands fast iteration — 60-min feedback loops are unacceptable
description: User strongly values fast device testing. CI must gate builds (no wasted builds on broken code) but feedback loop must be minimized.
type: feedback
---

User explicitly called the 60-min CI+build feedback loop "an awful waste of time" (2026-04-02). Key principles:

1. **CI must gate builds/updates** — user said "I don't want to waste builds on broken code." CI main (lint, test, typecheck) must pass before any artifact is published.
2. **Speed matters more than ceremony** — user is willing to accept OTA tradeoffs (5s launch delay, fix-forward on rare CI-passing-but-broken code) to cut the loop.
3. **E2E tests and native builds are the bottlenecks** — user identified these specifically. CI main (~2 min) is acceptable; E2E (~15 min) and native build (~30 min) are not for every push.

**Why:** User is in active device testing phase, finding bugs within 1 minute of opening the app. The 60-min wait per iteration is the #1 developer experience pain point.

**How to apply:** When proposing CI or build changes, always optimize for the fastest path to a testable artifact on device. Never add gates that increase iteration time without clear safety justification. Prefer OTA updates over full builds for JS-only changes.

Sweep + guard tests required by CLAUDE.md `Sweep when you fix` are *correctness* gates, not ceremony. They count as "clear safety justification" and override iteration-speed preference.
