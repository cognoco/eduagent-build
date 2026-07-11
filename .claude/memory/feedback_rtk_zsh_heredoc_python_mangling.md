---
name: feedback_rtk_zsh_heredoc_python_mangling
description: "Inline python via rtk bash -lc heredoc breaks repeatedly (zsh 'unmatched quote' / python SyntaxError on quote-dense lines) — write the script to the scratchpad and run `rtk python3 <file>` instead."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e4fddf1e-c6e3-4067-b3c4-777ec3856ceb
---

Three separate failures in one session (2026-07-11): `rtk bash -lc 'python3 - <<"EOF" …'`
with quote-dense python (nested dict literals containing long double-quoted strings) died at
parse time — sometimes as zsh `unmatched "` before python even ran, sometimes as a python
SyntaxError pointing at a line whose quotes had been mangled in transit. Short/simple heredocs
work; density of mixed quotes is the trigger, and the failure is parse-time (nothing executes,
safe to retry).

**Why:** two nested quoting layers (zsh single-quote wrapper + heredoc body) plus rtk's
wrapping make long mixed-quote payloads fragile; debugging the mangling costs more than
avoiding it.

**How to apply:** for any non-trivial Notion/REST python, Write the script to the session
scratchpad and run `rtk python3 <file>` — also gives idempotent re-runs via a state file,
which pairs with the never-re-run-capture-on-parse-failure lesson.
