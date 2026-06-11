# Review loop productization handoff

**Purpose.** This document is the pickup point for productizing the PoC reviewer
loop that watches Cosmo Work Items entering `Stage=Reviewing` and launches
Codex review agents to run `cosmo:review`.

## Current live shape

- **Active watcher process:** `bun _wip/identity-foundation/review-watcher-v3.ts`
  running from `/Users/vetinari/nexus/_dev/eduagent-build`.
- **Active process ID at last check:** Bun process `54591`.
- **Current scope:** one watcher covers `Identity Foundation`,
  `L10n & A11y Mobile`, `API Error Handling`, and
  `Inngest Security & Correctness`.
- **Trigger:** work item relation is in monitored Workstream and `Stage`
  transitions into `Reviewing`.
- **Runner:** launches `codex -a never exec --ephemeral ...` with a generated
  prompt and `shell_environment_policy.inherit="all"` so `NOTION_TOKEN` is
  available.
- **Review action:** review agent reads the `cosmo:review` skill, gathers DoD
  evidence, then applies `done`, `rework`, or `human`.

## Durable repo artifacts

- `_wip/identity-foundation/review-watcher-v3.ts`
  - Current monitor/launcher script.
  - Monitors `Identity Foundation`, `L10n & A11y Mobile`,
    `API Error Handling`, and `Inngest Security & Correctness`.
  - Hardcoded workstream page ids:
    `37b8bce9-1f7c-81c2-bb42-cf7f47f839cc` and
    `37c8bce9-1f7c-8169-8ce1-ddcf36b470c9`, and
    `37c8bce9-1f7c-817c-98ec-d1d4ba0a15e3`, and
    `37c8bce9-1f7c-81d7-9377-e79356055ff3`.
  - Hardcoded Work Items DB id:
    `f170be9e04ae45d4961828f2438666bd`.
  - Hardcoded special override ids: `WI-585`, `WI-586`.
- `_wip/identity-foundation/review-loop-reviewer-observations.md`
  - Reviewer-side observations from dogfooding.
  - Includes productization implications and known failure modes.
- `_wip/identity-foundation/review-loop-observations.md`
  - Shepherd/executor-side observations from the other end of the loop.

## Runtime/scratch artifacts

These are not durable repo state.

- `/tmp/cosmo-watch/logs/cosmo-reviewing-watcher.log`
  - Watcher heartbeat, transition, launch, and exit log.
  - Currently contains historical overlap from older watcher versions, so do
    not assume every heartbeat was emitted by the current v3 process.
- `/tmp/cosmo-watch/reviews/*.final.md`
  - Final review-agent summaries written via Codex `-o`.
- `/tmp/cosmo-watch/reviews/*.stdout.log`
  - Full review-agent stdout transcript.
- `/tmp/cosmo-watch/reviews/*.stderr.log`
  - Review-agent stderr.
- Older superseded scratch dirs:
  - `/tmp/cosmo-review-watch-20260611-113738/`
  - per-agent logs under that directory.

## Current prompt contract

`review-watcher-v3.ts` generates the prompt in `promptFor(id)`.

Base prompt:

```text
Live Cosmo watcher trigger for WI-NNN — Identity Foundation work item newly entered Stage=Reviewing. Execute the cosmo:review skill for real, not merely a mechanical check. Run from /Users/vetinari/nexus/_dev/eduagent-build. Follow repo AGENTS.md/RTK guidance and the cosmo:review skill exactly.

Gather evidence for the manual checklist: read the completion summary/page, identify Fixed In/PR, verify PR merged/CI green if applicable, map Acceptance Criteria to evidence, and verify the original symptom/source artifact as far as possible.

If DoD passes with evidence, apply disposition done. If evidence fails, apply rework with a precise note. If you cannot responsibly decide automatically, apply human with a precise note.

Do not edit code. Do not revert or overwrite unrelated edits. Return the disposition, evidence gathered, commands run, any override applied, and any Cosmo mutation made.
```

Special override prompt fragment for `WI-585` and `WI-586` only:

- Context: Harness Hygiene PR #832 dogfooding intentionally includes Work
  Package altitude items without item-level subitems.
- Ignore only:
  - `dod.wp.bulk_ready`
  - `dod.wp.children_verified`
- All other DoD criteria remain mandatory.
- If `review.ts --disposition done` refuses solely because of
  `dod.wp.bulk_ready`, the review agent is allowed for these two ids only to
  apply the equivalent close transition directly through Cosmo/Notion and add a
  comment citing the override.

## Known current gaps

- **PoC naming drift.** `review-watcher-v3.ts` is now multi-workstream despite
  the `v3` filename. Product should rename/version it cleanly.
- **No durable state.** The current script keeps `previousStages`,
  `lastLaunchKey`, and `running` in memory. Restarting the process loses
  de-dupe history.
- **No lease/lock.** The PoC accidentally ran multiple watchers earlier. A
  product version needs a single authoritative dispatcher lease.
- **No structured review result.** Review summaries are Markdown. Product needs
  JSON such as: `wi_id`, `workstream`, `transition_key`, `disposition`,
  `stage_before`, `stage_after`, `comment_id`, `blocking_dod_rules`,
  `evidence_urls`, `commands_run`, `started_at`, `finished_at`, `exit_code`.
- **Prompt-level overrides.** The `WI-585`/`WI-586` override is embedded in
  prompt text. Product should model overrides as structured policy:
  `wi_id`, `rule_id`, `reason`, `approved_by`, `expires_at`, `scope`.
- **No direct Notion event source.** Polling is acceptable for the PoC but a
  productized version should prefer webhooks/events if available, or a durable
  queue written by the shepherd when it submits a WI for review.
- **Runner coupling.** The script shells out to Codex CLI. Product should choose
  and document the runner abstraction: Codex CLI, API task runner, Archon
  workflow, or worker queue.
- **No backpressure model.** The current script prevents a second review of the
  same id while `running.has(id)`, but has no global concurrency limit.
- **Review worker context isolation.** Earlier forked review workers inherited
  too much context and one effectively became a supervisor. Product review
  workers should receive a narrow task prompt and no supervisor context unless
  needed.

## Current workstream configuration

The live watcher currently uses:

```ts
const workstreams = [
  {
    name: "Identity Foundation",
    id: "37b8bce9-1f7c-81c2-bb42-cf7f47f839cc",
    overrides: new Map([
      ["WI-585", ["dod.wp.bulk_ready", "dod.wp.children_verified"]],
      ["WI-586", ["dod.wp.bulk_ready", "dod.wp.children_verified"]],
    ]),
  },
  {
    name: "L10n & A11y Mobile",
    id: "37c8bce9-1f7c-8169-8ce1-ddcf36b470c9",
    overrides: new Map(),
  },
  {
    name: "API Error Handling",
    id: "37c8bce9-1f7c-817c-98ec-d1d4ba0a15e3",
    overrides: new Map(),
  },
  {
    name: "Inngest Security & Correctness",
    id: "37c8bce9-1f7c-81d7-9377-e79356055ff3",
    overrides: new Map(),
  },
];
```

The live script already tracks previous stage and last launch key by
`workstreamName + wiId`, not just `wiId`.
It includes the workstream name in:

- watcher log lines
- output paths
- review-agent prompts
- final JSON result once that exists

There should be one watcher process for all monitored workstreams.

## Useful commands

Check the active watcher:

```bash
rtk bash -lc 'ps -eo pid,ppid,command | rg "review-watcher-v3|cosmo-watch|codex -a never"'
```

Tail watcher log:

```bash
rtk bash -lc 'tail -n 80 /tmp/cosmo-watch/logs/cosmo-reviewing-watcher.log'
```

List review outputs:

```bash
rtk bash -lc 'fd . /tmp/cosmo-watch/reviews -t f | sort'
```

Query a workstream's current members:

```bash
DS_ID=$(yq -r ".zdx.work-items.data_source_id" zdx-config.yaml)
WS_ID="37c8bce9-1f7c-8169-8ce1-ddcf36b470c9"
curl -s -X POST "https://api.notion.com/v1/data_sources/${DS_ID}/query" \
  -H "Authorization: Bearer ${NOTION_TOKEN}" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d "{\"filter\":{\"property\":\"Workstream\",\"relation\":{\"contains\":\"${WS_ID}\"}},\"page_size\":100}" \
| jq -r '.results[] | [.properties.ID.unique_id.prefix + "-" + (.properties.ID.unique_id.number|tostring), (.properties.Stage.select.name // ""), ((.properties.Name.title // []) | map(.plain_text) | join(""))] | @tsv'
```

## Product direction

The PoC has proven the core loop:

1. Cosmo stage transition is observable.
2. Review agents can be launched automatically.
3. Agents can gather evidence and mutate Cosmo disposition.
4. Transition-key de-dupe supports rework cycles.

The production version should turn this into a dispatcher service with:

- durable state,
- a single lease,
- structured policy overrides,
- structured review results,
- explicit workstream configuration,
- bounded concurrency,
- durable event/queue integration,
- narrow worker prompts,
- and a first-class runner adapter.
