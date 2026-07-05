# Monitor Hygiene — manifest + reconcile ritual

**What this is.** The discipline that keeps a role's **monitors** (Monitor watchers on Clacks
mailboxes and on Cosmo Stage) trustworthy across session boundaries. A Clacks-layer concern, so it
lives here. It applies to the **orchestrator** and every **shepherd**.

**Binding note.** This is the runtime-neutral monitor discipline. Claude Code, Codex, or another
harness may host monitors if it preserves manifest-first reconcile semantics.

**Why it exists.** Monitors are session/host-scoped: they die silently on compaction, reboot, or
session-end, and **a dead monitor's silence looks identical to "nothing happened."** The old
reflex — "watchers die on compaction → re-arm" — is itself a cause of monitor proliferation
(blind re-arming stacks duplicates and orphans). The fix is **reconcile, never blind-add**. (Origin:
a missed review-gate bounce that a human caught by eye because the watcher had quietly died.)

## The manifest — "what good looks like"
Each role keeps a **durable record of the monitor set it expects to be running** — one entry per
monitor:

| field | meaning |
|---|---|
| `target` | what it watches (e.g. lane `outbox.jsonl`, the workstream's Cosmo Stage) |
| `purpose` | why it exists (catch rulings; catch review verdicts) |
| `command` | the canonical command/spec that arms it |
| `task-id` | the live task/session id of the running monitor (filled when armed) |
| `expected_activity_by` | *(optional, liveness entries only — WI-1313)* the deadline a scheduled liveness check probes against; set on every pause/hold or long-running dispatch, cleared once activity is observed |
| `margin_minutes` | *(optional, liveness entries only — WI-1313)* grace period added to `expected_activity_by` before the L1 check fires a `WAKE`; defaults to 30 if absent |

A manifest is a JSON object — `lane` plus a `monitors` array, one entry per row above — matching
what `l1-liveness-check.js` actually reads:

```json
{
  "lane": "WS-99",
  "monitors": [
    { "target": "outbox.jsonl", "purpose": "catch needs-* / blocked", "command": "Monitor(...)", "task-id": "t-123" },
    { "target": "liveness-probe", "purpose": "wake on lane silence", "command": "Monitor(...)", "task-id": "t-124",
      "expected_activity_by": "2026-07-04T18:00:00Z", "margin_minutes": 30 }
  ]
}
```

The manifest is the source of truth for *intent*; the live `/tasks` list is the source of truth
for *actuality*. Hygiene = keeping them in agreement. `expected_activity_by` is what makes a
liveness deadline **durable** — the same reconcile ritual below (§ *The reconcile ritual*) that
re-arms an ordinary dead monitor also re-arms a liveness check's scheduled probe after
compaction/resume, instead of the deadline living only in a session's transient memory. Full
liveness mechanism (deadline + scheduled check + escalation, both Quartet layers, plus the L2
claim-TTL checker): `library/liveness-checker.md`.

**Where it lives:** `working/program/monitor-manifest.json` for the orchestrator's program-wide
watchers; `working/lanes/<lane>/_state/monitor-manifest.json` for a shepherd's lane watchers. One
manifest per role-instance, beside the working state it tracks.

**Runtime instance location (WI-1417):** watcher processes launched from tracked templates write
their live config, logs, review outputs, and de-dupe state under `.cosmo-watch/` or the declared
gitignored runtime dir for the program. The tracked `_quartet/clacks/*` files are templates/tooling,
not mutable live instances.

## The reconcile ritual
Run at **session-start**, **post-compaction**, **post-resume**, and **on suspicion** (prolonged
silence where you'd expect signal). Diff actual (`/tasks`) against the manifest, then:
- **keep** — healthy monitor matching an expected entry → leave it, refresh its `task-id`.
- **replace** — expected monitor missing or stale → re-arm it, update `task-id`.
- **add** — a needed monitor not in the manifest → arm it, add the entry.
- **delete** — a running monitor with no manifest entry (duplicate / orphan) → stop it.

Then the manifest reflects reality. **Never** simply re-arm everything — that is the proliferation
bug.

## Rules
- **`persistent:true` is mandatory** for standing watches. A non-persistent monitor **expires
  silently** — that *is* the stale mechanism. Standing Clacks/Cosmo watchers are session-length.
- **Per active lane keep BOTH watchers:** a **Clacks watcher** (inbox/outbox) *and* a
  **Cosmo-Stage watcher**. The Clacks one is blind to Stage; the Cosmo-Stage one catches reviewer
  bounces. One does not substitute for the other.
- **Silence is unverified.** At any finalize / close / decision boundary, **direct-read the Cosmo
  Stage** rather than trust a monitor's quiet. A quiet monitor is "unknown," not "nothing changed."
  This also covers the **differ baseline blind spot**: a freshly-armed differ baselines on its first
  read, so a transition that *already happened* (or lands within its first poll) never fires an
  event. After any finalize / Stage-write, **re-read the verdict once explicitly**; keep the monitor
  for *subsequent* changes only.
- **The orchestrator runs a durable central backstop** — a standing Cosmo-Stage / reviewer-transition
  watcher across the program — so a single dead lane watcher can't drop a verdict on the floor.
- **Restart handoff must replay, never silently seed (WI-1606, fleet retro 2026-07-05).** Replacing
  a watcher (upgrade, restart, post-crash re-arm) opens a delivery gap: events emitted after the old
  watcher's last *delivered* notification are consumed by the new watcher's first seed pass and
  recorded as already-seen — silently dropped. On any watcher replacement, either (a) the first pass
  of the new watcher **emits** every delta newer than the last delivery you can attest to (replay,
  accept the duplicate risk), or (b) overlap old and new watchers for one poll cycle before stopping
  the old. A restart that seeds silently is the mechanism that swallowed a fleet DRAINED status.

## Where this binds
- `roles/orchestrator-protocol.md` → Progress channel + Orient on resume (reconcile before trusting
  silence; run the central backstop).
- `roles/shepherd-protocol.md` → review loop + Progress channel (manifest the Stage monitor + the
  inbox watcher; reconcile after restart).
- `library/liveness-checker.md` → the `expected_activity_by` field's consumer: the scheduled
  liveness check (L1) that probes it, and the executor claim-TTL checker (L2).
- The **rehydration / session-start hook** must say **"reconcile against the manifest,"** not
  "watchers die → re-arm."

## Self-referential framework change — adopts at the next session boundary
This doc is **framework canon** (consistent with the same discipline in
`roles/orchestrator-protocol.md`'s "Self-referential framework change" clause and
`roles/shepherd-protocol.md`'s "Adoption timing" note). Per the framework's own operating
discipline, it is never hot-swapped under a running session — it takes effect starting with the
**next session** (or resume/post-compaction reconcile) that reads it. A live orchestrator or
shepherd session mid-run under the pre-amendment ritual is not retroactively bound by an amendment
it never read.
