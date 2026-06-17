---
name: feedback_code_review_should_fix
description: Valid code-review should-fix/flip-critical findings get fixed immediately — never ask whether to fix; only rule on validity.
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-16
  last_confirmed: 2026-06-16
  status: active
  originSessionId: 70f541f3-fdda-4b86-9098-8a8cf1398fca
---

A VALID code-review should-fix (or flip-critical finding) is fixed NOW, in the same WI — never deferred, never escalated to the operator as "should we fix this?". The ONLY judgment call is **validity**: if a finding is genuinely invalid, the orchestrator or shepherd rules it invalid **with a documented reason** and proceeds. It is never acceptable to leave a valid should-fix.

A "ping on any review finding" pre-authorization means **stop the auto-merge and surface the finding** — NOT ask permission to fix it. Don't ask the operator the obvious; see [[feedback_just_do_it]] and [[feedback_autonomous_speccing]].

**Why:** operator correction 2026-06-16 (WI-586 finalize) — I asked how to handle a valid Claude-Code-Review should-fix instead of just relaying the fix.

**How to apply:** on any review (claude-review/CodeRabbit/codex) verdict → triage each finding for validity → fix-if-valid / rule-invalid-with-reason; only escalate genuine product/semantics forks or scope trade-offs, never the fix-vs-leave decision on a valid finding.
