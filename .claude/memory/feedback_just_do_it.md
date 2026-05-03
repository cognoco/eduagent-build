---
name: Just do what the user asks — don't add unnecessary confirmation gates
description: When user gives a clear action command (e.g. "start a build"), execute it immediately without asking confirmation questions
type: feedback
---

When the user gives a clear, unambiguous action command like "start a new APK" — just do it. Don't add extra confirmation gates or ask clarifying questions about uncommitted changes, branch state, etc. Warn briefly if critical, but execute the action in the same step.

**Why:** User was frustrated waiting 30+ minutes for a build that should have been triggered immediately. The confirmation question about uncommitted changes was unnecessary — the user knows their own intent.

**How to apply:** If the user says "do X", do X first, then mention any caveats. Don't block on non-critical warnings. Reserve confirmation gates for truly destructive or irreversible actions (force push, data deletion), not routine builds.

This rule is about confirmation gates, not fix scope. If a fix touches 3+ sibling locations, the sweep rule (CLAUDE.md `Sweep when you fix`) applies — sweep or track-defer in the same PR; do not ship a single-site fix and "come back later" without a tracked entry.
