# Reviewer loop — PoC observations

**What this is.** Meta-observations from the reviewer side of the
Identity-Foundation closed-loop experiment (2026-06-11 ->). This is the other
side of `_wip/identity-foundation/review-loop-observations.md`: the shepherd
session executes and submits work items; this side watches for
`Stage=Reviewing`, launches `/cosmo:review`, and records what made the loop work
or wobble. Keep this file current while the PoC runs. Prefer dated observations
with a direct productionization implication.

## The mechanism as currently wired

- **Queue signal:** `Stage=Reviewing` on a Cosmo Work Item in the
  `Identity Foundation` workstream.
- **Workstream filter:** relation filter on the Workstream page
  `37b8bce9-1f7c-81c2-bb42-cf7f47f839cc` (`Identity Foundation`).
- **Bootstrap items:** `WI-583` and `WI-584` were already `Reviewing` when the
  reviewer loop started, so they were intentionally launched once as bootstrap
  review targets.
- **Primary live watcher:** `/tmp/cosmo-watch` watcher v2 polls every 60s,
  de-dupes by transition key, and launches `codex -a never exec ...` review
  agents directly. Logs:
  `/tmp/cosmo-watch/logs/identity-foundation-reviewing-watcher.log`; review
  outputs: `/tmp/cosmo-watch/reviews/`.
- **Coordinator-side observer:** this chat also has an older shell poller
  running as session `16766`. It detects transitions and emits `TRIGGER` lines,
  but does not own a runner adapter. It is useful as an observation feed, not as
  the production shape.
- **Review action:** the launched review agent runs the `cosmo:review` skill,
  gathers manual DoD evidence, and applies one of `done`, `rework`, or `human`.

## Reviewer-side event log

- **2026-06-11 09:36Z — first coordinator poller started.** It baselined 21
  Identity Foundation items and saw `WI-583,WI-584` already `Reviewing`. This
  proved the Notion query/filter path works. *Production:* baseline state must
  be explicit and persisted so already-reviewing items do not repeatedly fire
  unless bootstrap mode is deliberately enabled.
- **2026-06-11 09:38Z — bootstrap reviews launched.** The loop intentionally
  reviewed `WI-583` and `WI-584` even though they were already in the target
  state. `WI-583` was bounced to `Executing`; `WI-584` was closed as `Done`.
  *Production:* bootstrap mode is valuable for takeover/restart, but it needs a
  separate flag and audit line from transition-driven pickup.
- **2026-06-11 09:41Z — watcher v2 took over launch ownership.** The first
  shell watcher could detect transitions but could not itself call the internal
  `spawn_agent` tool. Watcher v2 solved that by launching Codex review agents
  directly from the shell. *Production:* the watcher must own an agent-runner
  adapter; a passive poller that waits for a human/coordinator to read stdout is
  not autonomous.
- **2026-06-11 09:53Z — `WI-575` transition detected and reviewed.** Watcher v2
  saw `WI-575` move `Executing -> Reviewing`, launched a review agent, and the
  review bounced it back to `Executing`. The PR/code/test evidence passed, but
  WP child items `WI-600` and `WI-601` were still open, so WP child-closure DoD
  failed. *Production:* WP closure must either bulk-close children before
  parent review or make child closure a mechanical precondition of submitting
  the parent to `Reviewing`.
- **2026-06-11 09:54Z — `WI-583` re-entered review and was bounced again.**
  Watcher v2 launched a fresh review after `WI-583` moved back to `Reviewing`.
  The review again found the PR unmerged/not landed and child findings still
  open, so it returned the item to `Executing`. *Production:* transition-key
  de-dupe is the right model; an item can legitimately trigger multiple times
  across rework cycles.
- **2026-06-11 09:59Z — `WI-575` re-entered review and triggered again.**
  Watcher v2 launched another review agent for the new transition. The older
  coordinator poller also emitted a trigger line, but did not launch because
  the v2 watcher already owned execution. *Production:* only one component
  should be authoritative for dispatch; secondary observers should be clearly
  read-only to avoid duplicate reviews.

## Observations (dated)

- **2026-06-11 — stdout polling is not an autonomous trigger channel.** The
  coordinator-side poller detected `WI-575` and `WI-583` transitions, but those
  lines were only visible when the agent later polled the shell session. That
  creates an accidental "human/agent must be watching the watcher" dependency.
  *Production:* trigger detection and review launch must happen inside the same
  durable process, or through a durable queue/event bus.
- **2026-06-11 — forked-context agents can over-inherit coordinator intent.**
  A bootstrap review sub-agent picked up enough surrounding context to restart
  the watcher and bootstrap additional review processes, not just review its
  assigned WI. The outcome was useful here, but it is a role-boundary smell.
  *Production:* spawned review workers should receive a narrow prompt and no
  coordinator history unless explicitly needed; watcher ownership should stay
  in one supervisor process.
- **2026-06-11 — review workers are doing real evidence work, not just closing
  on mechanical DoD.** `WI-584` closed only after PR merge, CI, local Jest/TS,
  AC/source artifact, and symptom evidence were gathered. `WI-575` and `WI-583`
  bounced despite mechanical DoD passing. *Production:* keep the split:
  mechanical check is a gate to proceed; disposition still requires evidence.
- **2026-06-11 — WP child closure is the first recurring reviewer-side failure
  mode.** `WI-575` and `WI-583` both had parent-level implementation evidence
  but failed because child findings remained open or lacked `Fixed In`.
  *Production:* move child bulk-close into a single close path and/or have
  `/cosmo:execute complete` refuse to submit a WP unless child closure
  readiness is present.
- **2026-06-11 — transition-key de-dupe behaved better than item-id de-dupe.**
  `WI-575` was bounced to `Executing`, fixed/resubmitted, and correctly
  triggered again. *Production:* de-dupe keys should include the transition
  event, not just `WI-N`; otherwise rework cycles get starved.
- **2026-06-11 — multiple watchers are easy to create accidentally.** At least
  two loops existed during the PoC: coordinator session `16766` and watcher v2
  under `/tmp/cosmo-watch`. They observed the same queue; only v2 should launch.
  *Production:* use a lock/lease with owner identity, heartbeat, and clear
  read-only observer mode.
- **2026-06-11 — review outputs need stable, parseable structure.** The current
  review outputs are useful for humans, but they are freeform Markdown files.
  *Production:* have each review agent write a small JSON result next to the
  Markdown summary: `wi_id`, `transition_key`, `disposition`, `stage_before`,
  `stage_after`, `comment_id`, `evidence_urls`, `blocking_dod_rules`,
  `commands_run`, `started_at`, `finished_at`, `exit_code`.
- **2026-06-11 — child-review and parent-review ownership is unclear.** The
  reviewer catches open child findings, but it does not know whether to close
  them, bounce the parent, or call a richer `/cosmo:close` path. Current
  behavior is conservative: bounce. *Production:* define whether parent review
  owns child closure or only verifies it.
- **2026-06-11 — review can mutate the queue faster than observers notice.**
  `WI-583` and `WI-584` left `Reviewing` within a few poll cycles. The
  coordinator-side observer saw heartbeats with shrinking reviewing sets, but
  without review-result ingestion it could only infer outcomes from Stage.
  *Production:* emit explicit review-result events; Stage is a lossy signal.
- **2026-06-11 — operator-authorized anomaly needs first-class override
  handling.** `WI-585` and `WI-586` are Work Package altitude items that
  intentionally have no item-level children during Harness Hygiene PR #832
  dogfooding. The default review skill treats that as mechanical
  `dod.wp.bulk_ready` failure and also surfaces `dod.wp.children_verified` in
  the manual WP checklist. Watcher v3 now injects a narrow override into review
  prompts for only those two IDs: ignore only the child/sub-item WP criterion;
  all other DoD evidence still applies. *Production:* overrides should be
  modeled as structured, scoped policy (`wi_id`, `rule_id`, `reason`,
  `expires_at`, `approved_by`) rather than free-text prompt instructions.
- **2026-06-12 — branch-target and broad-WP overrides should be isolated until
  policy is structured.** The `new-llm Integration & Reconciliation` workstream
  uses PRs targeting `new-llm`, so landed-change evidence must check
  `origin/new-llm` rather than `origin/main`. It also has an approved
  workstream-wide exception for Work Package altitude items without sub-items.
  That combination changes review invariants enough that the safer PoC move is
  a separate watcher/session rather than stacking more prompt conditionals into
  the shared watcher. A kickoff prompt was captured in
  `new-llm-review-watcher-kickoff-prompt.md`. *Production:* this is the forcing
  case for first-class per-workstream policy: `base_branch`, `landing_ref`,
  `allowed_dod_overrides`, `approval_reason`, and `scope`.
- **2026-06-14 — reboot recovery exposed the durable-state boundary.** After a
  forced machine reboot, all runtime state was gone: no tmux server, no watcher
  processes, and no `/tmp/cosmo-watch*` logs or review outputs. Durable repo
  artifacts survived, including `review-watcher-v3.ts`,
  `review-loop-productization-handoff.md`, and the `new-llm` kickoff prompt.
  The general watcher could be restarted cleanly from the saved script and
  reached a baseline with `Reviewing=none` across all monitored workstreams.
  The dedicated `new-llm` watcher did not yet have a durable script, only a
  kickoff prompt, so `new-llm-review-watcher.ts` was created and then started
  in its own tmux session. *Production:* runtime state cannot live only in
  `/tmp`/tmux/in-memory maps. The dispatcher needs durable lease/heartbeat
  state, persistent review-result storage, restart-aware de-dupe, and scripts or
  config for every watcher that is expected to survive operator handoff.
- **2026-06-14 — restart baseline semantics are safe but can miss already
  reviewing items.** Both watchers intentionally treat the first post-start poll
  as a baseline and only launch on later `Stage -> Reviewing` transitions. This
  avoided duplicate reviews after restart, but it would also skip items that
  entered `Reviewing` while the machine was down. During this recovery pass,
  an explicit one-off Cosmo query showed `Reviewing=none` for all monitored
  workstreams before the watchers were armed, so no catch-up launches were
  needed. *Production:* restart should have an explicit catch-up mode: query
  `Stage=Reviewing`, compare against durable review-attempt/result state, and
  either launch, skip with reason, or require operator confirmation. Baseline
  should be an auditable decision, not an implicit side effect of process start.

## Open design questions for productionization

1. Single authoritative watcher vs multiple watchers with a distributed lease.
2. Durable trigger source: Notion/Cosmo webhook, polling service, or queue
   written by the shepherd when it submits for review.
3. Runner adapter contract: direct Codex CLI, API call, Archon workflow, or
   task queue worker.
4. Bootstrap semantics: when to launch reviews for items already in
   `Reviewing`, and how to avoid repeated bootstrap after restart.
5. Transition-key schema: which timestamp/property version is authoritative for
   `Executing -> Reviewing` when Notion lacks an event stream.
6. Review-result schema and where it is written: Cosmo comment, local log,
   durable DB, GitHub check, or all of them.
7. WP close policy: review bounces when children are open vs review performs
   child bulk-close through a single close primitive.
8. Role isolation: how much context review workers inherit, and how to prevent
   workers from becoming supervisors.
9. Human-hold semantics: how shepherd merge holds or known-dirty PRs are made
   visible so reviewers do not spend effort on artifacts already rejected.
