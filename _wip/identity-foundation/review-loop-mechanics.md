# Shepherd↔reviewer loop — mechanics inventory (for productionization)

**What this is.** A complete inventory of the moving parts behind the
Identity-Foundation execution loop as actually run (2026-06-10 → 11), written
for the productionization agent. Companion files in this directory:
`review-loop-observations.md` (shepherd-side lessons), 
`review-loop-reviewer-observations.md` (reviewer-side lessons, owned by the
reviewer session), `executor-protocol.md` (the executor process scaffold),
`executor-protocol-example.md` (a verbatim dispatch prompt).

**The headline caveat: almost all orchestration machinery is SESSION-BOUND.**
The shepherd is a single long-lived Claude Code session; its monitor, CI
watchers, and executor handles all die with it. The only durable state is
(a) Cosmo itself, (b) the committed docs in this directory, (c) `.cosmo/WI-NN/`
artifact dirs, and (d) the git/GitHub record. A fresh session reconstructs the
rest from the execution tracker (§5 carries the restart instruction).

---

## 1. The actors

| Actor | Runtime | Lifetime |
|---|---|---|
| **Shepherd** (this doc's author) | Claude Code session in the repo | session |
| **Executors** (`wiNNN-executor`) | Agent-tool sub-agents, `run_in_background: true`, resumable via SendMessage with the launch-time agent id | session of the shepherd |
| **Reviewer watcher** | separate session; `/tmp/cosmo-watch` watcher v2, 60s Notion poll, transition-key de-dupe, launches `codex exec` review agents running `/cosmo:review` | that session / detached shell |
| **Repo gates** | GitHub: CI (`main`, `Playwright web smoke`, `API Quality Gate`), Claude Code Review comment (advisory verdict), CodeRabbit + Codex review threads | durable |

## 2. Shepherd-side machinery

### 2.1 Stage monitor (the loop's only inbound signal)

A persistent Monitor-tool task: 90-second loop polling the Cosmo Work Items
data source for all items in the Identity Foundation workstream, snapshotting
`{WI, Stage, Resolution, Claimed By}` to a TSV, diffing against the previous
snapshot, and emitting one line per transition (e.g.
`WI-583: Stage Reviewing -> Executing`). The emitted lines re-invoke the
shepherd as notifications. State file: `/tmp/if-wi-stage-state.tsv`.

Canonical reconstruction of the script (the original lives only in the
session's Monitor task):

```bash
# constants
DS=36fd1119-9955-4684-8bfe-deb145e6a21f          # Cosmo Work Items data source
WS=37b8bce9-1f7c-81c2-bb42-cf7f47f839cc          # Identity Foundation workstream page
STATE=/tmp/if-wi-stage-state.tsv

while true; do
  curl -s -X POST "https://api.notion.com/v1/data_sources/$DS/query" \
    -H "Authorization: Bearer $NOTION_TOKEN" \
    -H "Notion-Version: 2025-09-03" -H "Content-Type: application/json" \
    -d "{\"filter\":{\"property\":\"Workstream\",\"relation\":{\"contains\":\"$WS\"}}}" \
  | jq -r '.results[] | [
      ("WI-" + (.properties.ID.unique_id.number|tostring)),
      (.properties.Stage.select.name // "-"),
      (.properties.Resolution.select.name // "-"),
      (.properties["Claimed By"].rich_text[0].plain_text // "-")
    ] | @tsv' | sort > "$STATE.new"
  if [ -f "$STATE" ]; then
    join -t $'\t' -j 1 "$STATE" "$STATE.new" | awk -F'\t' \
      '$2 != $5 { printf "%s: Stage %s -> %s", $1, $2, $5;
                  if ($6 != "-") printf " (Resolution=%s)", $6; print "" }'
  fi
  mv "$STATE.new" "$STATE"
  sleep 90
done
```

Notes for productionization: this is N-agents-polling-one-DB; the observations
files both call for an event channel (webhook/queue) instead. Pagination is
unhandled (fine at 21+children items; not at scale). Notion has no event
stream, so the transition key is derived by diffing — the reviewer side
independently converged on transition-key de-dupe as the correct model.

### 2.2 Per-PR CI watchers

One throwaway background Bash per PR round — single terminal notification,
then exits (deliberately NOT a Monitor: one event, bounded life):

```bash
until state=$(gh pr checks <PR> --json state --jq '[.[].state] |
    if any(. == "PENDING" or . == "QUEUED" or . == "IN_PROGRESS") then "pending"
    elif any(. == "FAILURE" or . == "ERROR") then "failed"
    else "green" end' 2>/dev/null) && [ "$state" != "pending" ]; do sleep 60; done
echo "PR<PR>-CI-TERMINAL: $state"
```

Why these exist: executor-side cross-turn waiters die silently when the
executor's turn ends (3 observed stalls). Standing rule since: **the shepherd
owns all cross-turn waits**; executors end their turn at the PR-open boundary.

### 2.3 The merge gate (shepherd judgment, per PR round)

Inputs gathered per round, all via `gh`:
1. `gh pr checks <PR>` / check-runs on the exact head SHA — all green, none pending.
2. The Claude Code Review **comment verdict** (`gh api .../issues/<PR>/comments`,
   last `claude[bot]` body) — never the check colour (green check = "review ran").
3. Unresolved review threads (GraphQL `reviewThreads`) — every Codex/CodeRabbit
   thread needs an executor disposition (fix-commit cite or evidence-based
   rejection) before merge.
4. `gh pr diff` shape vs the WI scope (plan files, scope creep, file list).

Disposition: merge (`gh pr merge <PR> --merge --subject "..."`), or send the
executor ONE batched fix round via SendMessage. Verdict-parsing is mechanical
enough to script; thread-validity triage is the judgment part.

### 2.4 Cosmo writes the shepherd performs directly (Notion REST)

Used for the orchestration-level mutations no plugin command covers:

- **Children sweep at merge time** (standing step — see observations): PATCH
  each provenance child `Stage=Closed, Resolution=Done, Fixed In=<landed head
  commit URL>`; query pages by `{"property":"ID","unique_id":{"equals":N}}`.
- **Stage restore after a shepherd-side rework** (e.g. children swept post-
  bounce): PATCH parent `Stage=Reviewing` + a `[shepherd:rework]` page comment
  stating what was addressed (the reviewer reads it on re-pick).
- Page-body brief transcription + `Sub-item` relation for the WP DoR bridge.

Headers: `Notion-Version: 2025-09-03`, `$NOTION_TOKEN` from env. JSON bodies
via python3/urllib when curl quoting gets risky (one parse failure observed).

### 2.5 Cosmo plugin CLIs (sanctioned lifecycle writers)

`~/.claude/plugins/cache/zdx-marketplace/cosmo/0.6.0/skills/`:
- `capture/capture.ts --in-file <json>` — new WIs (children stubs, incidental
  findings). `project` field takes a page id, not a name.
- `refine/refine.ts --check WI-NN` / `--wi-id WI-NN --to-ready` (+ JSON patch
  on stdin) — the DoR gate; used for the WP bridge.
- `execute/execute.ts fetch/claim/complete` — executor-side only; `complete`
  authors Fixed In + completion summary and sets Stage=Reviewing. Its summary
  self-gate requires colon-terminated headers and a literal single-line
  `Caveats / Follow-ups:` header.

### 2.6 Executor dispatch + resume

- Launch: Agent tool, `run_in_background: true`, named `wiNNN-executor`;
  prompt = pointer-brief (see `executor-protocol-example.md`).
- Resume: SendMessage to the launch-time agent id — used for fix rounds,
  merge confirmations, and `complete` triggers. Ids are session-scoped; a new
  session cannot resume an old session's executors (it re-briefs fresh ones).

## 3. Durable artifacts (what a fresh session / the productionizer reads)

| Artifact | Where | Role |
|---|---|---|
| Execution tracker | `_wip/identity-foundation/execution-tracker.md` | charter, rulings, status table, §5 restart instructions — committed at every state change |
| Shepherd observations | `review-loop-observations.md` | dated lessons + productionization implications |
| Reviewer observations | `review-loop-reviewer-observations.md` | other side of the loop (reviewer session owns it; untracked) |
| Executor protocol | `executor-protocol.md` | phases 0–7 scaffold (NOTE: stale vs the live amendments block — see example file) |
| Dispatch example | `executor-protocol-example.md` | verbatim WI-578 brief incl. amendments |
| WI artifacts | `.cosmo/WI-NN/` (repo root) | execute.ts fetch/claim/complete artifacts per WI |
| Reviewer watcher v3 draft | `_wip/identity-foundation/review-watcher-v3.ts` (untracked) | reviewer session's; not shepherd-owned |
| Reviewer runtime | `/tmp/cosmo-watch/` (logs/, reviews/) | watcher v2 logs + per-review outputs |

## 4. Ephemeral state at risk on session death

Monitor task, CI watcher tasks, executor agent ids, `/tmp/if-wi-stage-state.tsv`.
Recovery procedure (validated once, post-compaction): read tracker §4/§5 →
poll PR + Cosmo state directly → restart monitor → re-brief or resume work
via fresh executors. Nothing in the loop's correctness depends on ephemeral
state surviving; only latency does.

## 5. Productionization pointers (condensed; full list in the observations files)

1. Event channel over polling (one authoritative watcher, leased).
2. Children sweep belongs INSIDE `/cosmo:execute complete`, not as a shepherd step.
3. Per-risk-class DoD depth (WI-583 needed 5 passes; a docs WP needs 1).
4. Mechanize the cheap gate checks (green-on-HEAD, plan-file-in-diff, CWD
   assertion, verdict parsing); spend judgment only on thread validity + scope.
5. Brief generation from a living checklist (protocol file + auto-accreted
   amendments), not shepherd-retyped per dispatch.
6. A first-class "blocked-on-human" lane (CODEOWNERS episode) instead of
   policy erosion under loop pressure.
7. Structured review-result events (the reviewer side proposes a JSON schema —
   see their observations §"review outputs need stable, parseable structure").
