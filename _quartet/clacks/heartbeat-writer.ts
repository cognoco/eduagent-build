#!/usr/bin/env bun
// WI-1615 — heartbeat WRITER: the persistent companion process an orchestrator/shepherd/
// program-manager session runs alongside itself to prove L0 liveness
// (`library/heartbeat-contract.md`). This module WRITES heartbeat.json on the interval WI-1602's
// `heartbeat-cadence.ts` decides — it does not decide cadence policy itself (that module owns it)
// and does not read the file back (`supervisor-watchdog.ps1`/`.sh` does that). Mirrors
// `review-watcher.ts`'s existing shape: a `#!/usr/bin/env bun` script, configured entirely by env
// vars, run as a standalone persistent process (Monitor(persistent:true), or a detached background
// process) alongside the session it reports on — not the LLM turn loop itself (see the contract's
// "Write cadence" section).
//
// Env:
//   HEARTBEAT_PATH        (required) full path to the heartbeat.json to write. The contract's
//                          directory convention (working/program/heartbeat.json for an
//                          orchestrator/PM, working/lanes/<lane>/_state/heartbeat.json for a
//                          shepherd) is the caller's job to resolve, same as COSMO_WATCH_OUTDIR
//                          is the caller's job in review-watcher.ts.
//   HEARTBEAT_SESSION_ID  (required) this session's `<role>:<identity>-<start-ts>` id (WI-1221
//                          shape, `clacks/lease.ts` convention) — used verbatim in relaunch_command
//   HEARTBEAT_ROLE        (required) orchestrator | shepherd | program-manager
//   HEARTBEAT_LANE        (required) lane slug, or "program" for a program-wide session
//   HEARTBEAT_INTERVAL_OVERRIDE_MS  (optional, testing only) skip the cadence module and write on
//                          a fixed interval instead
//
// Liveness-signal env vars (all optional — see "Design fork" below):
//   HEARTBEAT_HAS_IN_FLIGHT_WORK  "true" | "false", default "true"
//   HEARTBEAT_LAST_ACTIVITY_AT    ISO-8601 UTC, default: now, refreshed every tick
//   HEARTBEAT_BLOCKED             "true" | "false", default "false"
//
// Design fork (flagged, not guessed at — same posture as the contract's own window-reset fork):
// `heartbeat-cadence.ts`'s LivenessSignals (hasInFlightWork / lastActivityAt /
// explicitBlockedOrPaused) are projections of Cosmo Stage + Clacks channel state that only the
// orchestrator/shepherd protocol machinery currently computes — this writer has no Cosmo/Clacks
// reader of its own, and building one here would duplicate that machinery and couple every
// heartbeat write to a Notion round-trip. Until a role wires its real signals through, this writer
// defaults to "always active" (hasInFlightWork=true, lastActivityAt=now every tick), which
// `nextHeartbeatInterval` always resolves to the base ~2min cadence (AC5: still a valid interval,
// just not adaptive). The env vars above are the integration seam: a role that already tracks its
// own liveness can export them before invoking this script and the adaptive backoff activates with
// no change to this file.
//
// Run (persistent — runs until killed):
//   bun run clacks/heartbeat-writer.ts

import { hostname } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  nextHeartbeatInterval,
  type CadenceState,
  type LivenessSignals,
} from './heartbeat-cadence.ts';

export interface HeartbeatRecord {
  session_id: string;
  role: string;
  lane: string;
  host: string;
  pid: number;
  last_alive: string;
  window_resets_at: string;
  relaunch_command: string;
}

const WINDOW_RESET_MS = 5 * 60 * 60 * 1000; // AC4: rolling last_alive + 5h, per the contract

/**
 * Option-B interactive-resume relaunch command (OPQ-14, operator ruling) — NEVER `claude -p` /
 * `--print` / headless anywhere. Windows opens a visible new Windows Terminal tab in the
 * logged-on user session; macOS/Linux hosts the resumed session in a detached tmux session
 * (attach later with `tmux attach -t <name>`). `sessionId` is passed to `--resume` verbatim —
 * only the tmux session *name* is sanitized (tmux treats `:` as a session:window separator when
 * parsing a `-t` target).
 */
export function buildRelaunchCommand(
  sessionId: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    return `wt.exe new-tab -- claude --resume ${sessionId}`;
  }
  const tmuxName = `hb-${sessionId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  return `tmux new-session -d -s ${tmuxName} "claude --resume ${sessionId}"`;
}

export function buildHeartbeat(params: {
  sessionId: string;
  role: string;
  lane: string;
  now: Date;
  host?: string;
  pid?: number;
  platform?: NodeJS.Platform;
}): HeartbeatRecord {
  const lastAlive = params.now.toISOString();
  return {
    session_id: params.sessionId,
    role: params.role,
    lane: params.lane,
    host: params.host ?? hostname(),
    pid: params.pid ?? process.pid,
    last_alive: lastAlive,
    window_resets_at: new Date(
      params.now.getTime() + WINDOW_RESET_MS,
    ).toISOString(),
    relaunch_command: buildRelaunchCommand(params.sessionId, params.platform),
  };
}

/** Reads the optional liveness-signal env-var overrides — see "Design fork" in the file header. */
export function signalsFromEnv(
  env: NodeJS.ProcessEnv,
  now: Date,
): LivenessSignals {
  return {
    hasInFlightWork: (env.HEARTBEAT_HAS_IN_FLIGHT_WORK ?? 'true') === 'true',
    lastActivityAt: env.HEARTBEAT_LAST_ACTIVITY_AT ?? now.toISOString(),
    explicitBlockedOrPaused: env.HEARTBEAT_BLOCKED === 'true',
  };
}

export function writeHeartbeat(path: string, record: HeartbeatRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
}

if (import.meta.main) {
  const path = process.env.HEARTBEAT_PATH;
  const sessionId = process.env.HEARTBEAT_SESSION_ID;
  const role = process.env.HEARTBEAT_ROLE;
  const lane = process.env.HEARTBEAT_LANE;
  if (!path) throw new Error('HEARTBEAT_PATH missing');
  if (!sessionId) throw new Error('HEARTBEAT_SESSION_ID missing');
  if (!role) throw new Error('HEARTBEAT_ROLE missing');
  if (!lane) throw new Error('HEARTBEAT_LANE missing');

  const fixedIntervalMs = process.env.HEARTBEAT_INTERVAL_OVERRIDE_MS
    ? Number(process.env.HEARTBEAT_INTERVAL_OVERRIDE_MS)
    : null;

  let cadenceState: CadenceState | null = null;
  let shuttingDown = false;

  function tick() {
    const now = new Date();
    writeHeartbeat(
      path!,
      buildHeartbeat({ sessionId: sessionId!, role: role!, lane: lane!, now }),
    );

    const signals = signalsFromEnv(process.env, now);
    cadenceState = nextHeartbeatInterval(signals, cadenceState, now);
    const intervalMs = fixedIntervalMs ?? cadenceState.intervalMs;

    console.log(
      `[${now.toISOString()}] wrote ${path} (session=${sessionId}); next write in ${intervalMs}ms`,
    );
    if (!shuttingDown) setTimeout(tick, intervalMs);
  }

  function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[${new Date().toISOString()}] received ${signal}: exiting`);
    process.exit(0);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  tick();
}
