# Monitor Hygiene — manifest + reconcile ritual

**What this is.** The discipline that keeps a role's **monitors** (Monitor watchers on Clacks
mailboxes and on Cosmo Stage) trustworthy across session boundaries. A Clacks-layer concern, so it
lives here. It applies to the **orchestrator** and every **shepherd**.

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

The manifest is the source of truth for *intent*; the live `/tasks` list is the source of truth
for *actuality*. Hygiene = keeping them in agreement.

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
- **The orchestrator runs a durable central backstop** — a standing Cosmo-Stage / reviewer-transition
  watcher across the program — so a single dead lane watcher can't drop a verdict on the floor.

## Where this binds
- `roles/orchestrator-protocol.md` → Progress channel + Orient on resume (reconcile before trusting
  silence; run the central backstop).
- `roles/shepherd-protocol.md` → review loop + Progress channel (manifest the Stage monitor + the
  inbox watcher; reconcile after restart).
- The **rehydration / session-start hook** must say **"reconcile against the manifest,"** not
  "watchers die → re-arm."
