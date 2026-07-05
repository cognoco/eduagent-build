# Precedent register — MentoMate productization (PGM-1)

Remit rulings already made. Before filing an Operator Queue row or escalating to the PM/operator,
check this list: if a prior ruling covers your question class, it is **within your remit — rule it
yourself, citing the precedent**. One line per precedent; PM (program-manager:fable) is the only
writer. Format: `date — question class — ruling — who decides next time`.

- 2026-07-03 — M2b execution go — PRE-AUTHORIZED with Neon-branch-snapshot rider; proceed without a
  new confirm whenever the three per-env conditions recorded on the WS-18 directive hold — orchestrator.
- 2026-07-04 — ENE re-dating on a live lane — routine; re-date freely with an [orch-status], no
  approval needed; set ENE to orchestrator-level checkpoints (hours/gates), not shepherd 30-min
  sol windows — orchestrator.
- 2026-07-04 — valid code-review should-fix findings — fix immediately, never ask permission; only
  validity disputes escalate — shepherd/executor.
- 2026-07-04 — mechanical Gate-2 bounces (AC form, missing clause, template shape — no code rework) —
  orchestrator adjudicates and amends; not an operator matter — orchestrator.
- 2026-07-05 — fleet-wide directives — require a positive ack by the named deadline; silence past it
  is treated as non-receipt, not compliance — PM probes, then operator relay.
- 2026-07-05 — headless `claude -p` in fleet tooling — VETOED fleet-wide: print mode will not run on
  the Max subscription (requires API credits); no watchdog/script/monitor may depend on it — design
  for interactive `--resume` (tmux on Unix, logged-on user session on Windows) — everyone.
- 2026-07-05 — session-recovery execution model (OPQ-14) — Option B per-OS: Windows = watchdog in
  logged-on user session (auto-logon accepted), `wt.exe … claude --resume`; macOS/Linux = detached
  tmux hosting `claude --resume`; recovery unproven until validated against a real rate-limit
  death — orchestrator executes, no re-ask.
- 2026-07-05 — orchestrator remit (WS-quiet incident) — pipeline custodian, not dispatcher:
  accountability spans every stage (triage / refine / dispatch / unstick / Gate-2 close) of every
  assigned workstream, shepherd-less lanes included (drive activation, don't ignore); empty Ready =
  refill signal; shepherd "exhausted" reports are audited, not relayed; sweep caps disclosed with
  their numbers; token/model discipline governs how work runs, never whether available work is
  done — full duty spec on WI-1526 — orchestrator.
