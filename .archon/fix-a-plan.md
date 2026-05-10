# Archon: Fix-A Plan — Unblock Claude-Flavored Cleanup-PR Workflow

**Author handoff for the Archon-managing agent. Read end-to-end before acting.**

## Background

**Claude-flavored runs hit `claude.first_event_timeout` 100% of the time once the implement loop needs more than one iteration.** PR-02 claude died on iter 2; PR-03 claude died on iter 3 after committing 2 of 3 phases. Codex flavor — which embeds the SDK as a library and doesn't cold-spawn a subprocess per iteration — went through 2-, 3-, even 4-iteration loops fine. Diagnostic: `~/.archon/logs/archon.stdout.log` lines 5191-5194 (PR-02) and 5591-5594 (PR-03). The CLI subprocess emits zero bytes for 60 seconds after spawn, then Archon kills it.

This plan unblocks the matrix by raising that timeout via env var. A separate, deferred plan (`fix-3-plan.md`) tracks a small efficiency win on trailing iterations; it is not in scope here.

---

## The fix — bump first_event_timeout via env var

### Discovery (already done)

- Archon fork: `/Users/vetinari/_dev/Archon`
- Timeout source: `packages/providers/src/claude/provider.ts:127-134` — `getFirstEventTimeoutMs()` already reads `ARCHON_CLAUDE_FIRST_EVENT_TIMEOUT_MS` from env, defaults to 60000ms. **No code change, no rebuild.**
- Daemon entry point: `/Users/vetinari/.local/bin/archon serve`. Started by hand from a shell (parent PID 1, no launchd plist).
- Archon's env loader (`provider.ts:86`, `packages/docs-web/.../reference/security.md:123`) reads `~/.archon/.env` and `<cwd>/.archon/.env` with `override: true` after the daemon process starts. **Use `~/.archon/.env`, not `~/.zshenv`.**

### Pre-flight check — DO NOT skip

Before stopping the daemon, list active workflows:

```bash
sqlite3 ~/.archon/archon.db \
  "SELECT id, workflow_name, started_at, last_activity_at \
   FROM remote_agent_workflow_runs WHERE status = 'running' \
   ORDER BY started_at DESC;"
```

As of authoring time the user had two PR-08 runs in flight (`6de62ee2…` codex, `2359ad11…` claude). Killing the daemon mid-run would lose their work. If anything is running:

- Wait for them to settle (check the `last_activity_at` column — anything within the last few minutes is alive).
- If the user wants the restart now, ask first; the running workflows must be cancelled cleanly via the Archon UI or CLI.

Do not proceed past this point until `status='running'` returns zero rows or the user has explicitly authorised an interrupt.

### Step 1 — Persist the env var

Append (do not overwrite — the file may have other secrets) to `~/.archon/.env`:

```
ARCHON_CLAUDE_FIRST_EVENT_TIMEOUT_MS=180000
```

180000 ms = 3 minutes. Generous-but-not-absurd starting value; raise to 300000 if 180000 still fails (see Verification step).

If `~/.archon/.env` doesn't exist, create it. The file is owned by the user, gitignored, mode 0600 is reasonable.

### Step 2 — Stop the daemon

Once Pre-flight is clean:

```bash
PID=$(pgrep -f 'archon serve')
[[ -n "$PID" ]] && kill "$PID"
# Confirm
sleep 2
pgrep -f 'archon serve' && echo "STILL RUNNING" || echo "stopped"
curl -sf http://localhost:3090/health && echo "STILL RESPONDING" || echo "down"
```

### Step 3 — Restart

Use **append-mode log redirects**, not truncation, so the prior session's diagnostics survive. The reviewer specifically flagged that overwriting `archon.stdout.log` with `>` would lose the `claude.first_event_timeout` traces we may want to compare against.

```bash
nohup ~/.local/bin/archon serve \
  >> ~/.archon/logs/archon.stdout.log \
  2>> ~/.archon/logs/archon.stderr.log &
disown
```

Note: there's a known interaction where running `archon serve` from inside a Claude Code shell can cause workflows to hang silently (`archon --version` prints a warning about `CLAUDECODE=1`). Restart from a regular terminal session.

If the user wants the daemon to come up at login long-term, replace the `nohup` with a launchd plist at `~/Library/LaunchAgents/com.archon.daemon.plist` that has `EnvironmentVariables.ARCHON_CLAUDE_FIRST_EVENT_TIMEOUT_MS=180000` and `ProgramArguments` pointing at the binary. Defer this if the user prefers manual control.

### Step 4 — Verify env propagation

```bash
ps eww $(pgrep -f 'archon serve') | tr ' ' '\n' | grep ARCHON_CLAUDE
# Expected: ARCHON_CLAUDE_FIRST_EVENT_TIMEOUT_MS=180000
```

If the env var doesn't appear, the most likely cause is that `~/.archon/.env` is being loaded *for workflow subprocesses* but not into the daemon's own process env. In that case, set the variable in the launching shell explicitly:

```bash
export ARCHON_CLAUDE_FIRST_EVENT_TIMEOUT_MS=180000
nohup ~/.local/bin/archon serve >> ... &
```

(The `getFirstEventTimeoutMs()` call happens in the same Bun process, not a subprocess — the daemon's own env is what matters.)

### Step 5 — Test

Trigger a re-run of PR-02 claude flavor (single-phase, the simplest reproduction of the iter-2 timeout). Possible outcomes:

| Outcome | Interpretation | Next action |
|---|---|---|
| Reaches `summary` node, no `claude.first_event_timeout` in log | Cold-spawn was just slow; 180s was enough | Settle on 180000, document, move on |
| Dies again at first_event_timeout, observed delay between 60s and 180s | Bumped value still slightly too tight | Raise to 300000, retest once |
| Dies again at first_event_timeout near 180s ceiling | Real hang, not slowness — every timeout will fire | Escalate; this implies replacing the CLI subprocess with the Claude Agent SDK is the only path. Do not raise the timeout further. |

If PR-02 goes green, also retry PR-03 (multi-phase) for confirmation before declaring victory.

### Don't do

- Don't change `provider.ts`. The env var is the right knob and is already wired.
- Don't raise the timeout above 600000 (10 min). At that point the loop's idle-iteration timeout becomes the next safety net and we lose a real signal.
- Don't `> ~/.archon/logs/archon.stdout.log` (truncating). Always `>>`.

---

## Related: Fix-3 (deferred)

The original handoff bundled a second fix to eliminate trailing "confirm done" iterations. After reviewer audit, the savings projection shrank from 30-60 min to ~10 min across the 28-PR queue, and the design needed to change from a shell snippet to `loop.until_bash`. That work is now scoped separately as `.archon/fix-3-plan.md` and is **deferred** until Fix-1 is verified and the matrix has run cleanly. Re-evaluate it from data, not assumption.

Do **not** land Fix-3 changes as part of this handoff.

---

## Reporting back

After Fix B is verified, send back to the user:

1. The final value chosen for `ARCHON_CLAUDE_FIRST_EVENT_TIMEOUT_MS` (180000 or higher) and the persistence mechanism (`~/.archon/.env` line, or launchd plist path).
2. A snippet of `~/.archon/logs/archon.stdout.log` showing the new env var picked up at daemon start, plus the SHA/range of the verification re-run's `archon.db` events.
3. The workflow_run_id of the verification re-run that reached `summary` cleanly.
4. If the iter count is interesting (e.g. ratio above 1.2), a one-line note recommending we revisit Fix A; otherwise note "Fix A not needed."

Do not commit Fix A code as part of this handoff. If we decide to do it later, it'll be a separate commit on its own merits.
