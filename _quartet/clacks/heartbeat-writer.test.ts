// Tests for the WI-1615 heartbeat WRITER + the WI-1615 contract fix (no `-p` / headless
// relaunch anywhere). Run offline with `bun test` (same convention as heartbeat-cadence.test.ts
// and lease.test.ts).

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildHeartbeat,
  buildRelaunchCommand,
  signalsFromEnv,
  writeHeartbeat,
} from './heartbeat-writer';

// OPQ-14 (operator ruling): `claude -p` / `--print` / any headless invocation is forbidden fleet-
// wide — it does not run under the operator's subscription. Every relaunch_command this writer
// (or the contract's own example) emits must be an Option-B interactive-resume form instead.
function assertNeverHeadless(command: string) {
  expect(command).not.toMatch(/-p\b/);
  expect(command).not.toMatch(/--print\b/);
}

describe('buildRelaunchCommand — Option-B interactive resume (OPQ-14)', () => {
  test('Windows: visible wt.exe new-tab, no -p', () => {
    const cmd = buildRelaunchCommand(
      'orchestrator:ramtop-20260704T1900Z',
      'win32',
    );
    expect(cmd).toBe(
      'wt.exe new-tab -- claude --resume orchestrator:ramtop-20260704T1900Z',
    );
    assertNeverHeadless(cmd);
  });

  test('macOS/Linux: detached tmux session hosting the resume, no -p', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      const cmd = buildRelaunchCommand(
        'shepherd:alice-20260704T1900Z',
        platform,
      );
      expect(cmd).toContain('tmux new-session -d -s');
      expect(cmd).toContain('claude --resume shepherd:alice-20260704T1900Z');
      assertNeverHeadless(cmd);
    }
  });

  test('tmux session name is sanitized (no raw colon, which tmux treats as session:window)', () => {
    const cmd = buildRelaunchCommand(
      'orchestrator:ramtop-20260704T1900Z',
      'linux',
    );
    const sessionNameArg = cmd.split(' -s ')[1].split(' ')[0];
    expect(sessionNameArg).not.toContain(':');
    // The --resume argument itself must stay verbatim (unsanitized) — Claude Code needs the exact id.
    expect(cmd).toContain('--resume orchestrator:ramtop-20260704T1900Z');
  });
});

describe('buildHeartbeat — schema-valid heartbeat.json (heartbeat-contract.md)', () => {
  test('emits every contract field, with a rolling +5h window_resets_at (AC4)', () => {
    const now = new Date('2026-07-05T00:32:00Z');
    const record = buildHeartbeat({
      sessionId: 'orchestrator:ramtop-20260704T1900Z',
      role: 'orchestrator',
      lane: 'program',
      now,
      host: 'Surface',
      pid: 41232,
      platform: 'win32',
    });

    expect(record).toEqual({
      session_id: 'orchestrator:ramtop-20260704T1900Z',
      role: 'orchestrator',
      lane: 'program',
      host: 'Surface',
      pid: 41232,
      last_alive: '2026-07-05T00:32:00.000Z',
      window_resets_at: '2026-07-05T05:32:00.000Z',
      relaunch_command:
        'wt.exe new-tab -- claude --resume orchestrator:ramtop-20260704T1900Z',
    });
    assertNeverHeadless(record.relaunch_command);
  });

  test("window_resets_at always rolls forward from THIS tick's last_alive, not a fixed origin", () => {
    const t1 = new Date('2026-07-05T00:32:00Z');
    const t2 = new Date('2026-07-05T00:34:00Z'); // one heartbeat-cadence base tick later
    const r1 = buildHeartbeat({
      sessionId: 's',
      role: 'shepherd',
      lane: 'ws-1',
      now: t1,
    });
    const r2 = buildHeartbeat({
      sessionId: 's',
      role: 'shepherd',
      lane: 'ws-1',
      now: t2,
    });
    expect(
      Date.parse(r2.window_resets_at) - Date.parse(r1.window_resets_at),
    ).toBe(t2.getTime() - t1.getTime());
  });
});

describe('signalsFromEnv — the design-fork integration seam', () => {
  test('defaults to always-active (no env overrides) — safe, non-adaptive default', () => {
    const now = new Date('2026-07-05T00:00:00Z');
    const signals = signalsFromEnv({}, now);
    expect(signals).toEqual({
      hasInFlightWork: true,
      lastActivityAt: now.toISOString(),
      explicitBlockedOrPaused: false,
    });
  });

  test('a role that tracks its own liveness can override every signal', () => {
    const now = new Date('2026-07-05T00:00:00Z');
    const signals = signalsFromEnv(
      {
        HEARTBEAT_HAS_IN_FLIGHT_WORK: 'false',
        HEARTBEAT_LAST_ACTIVITY_AT: '2026-07-04T23:00:00Z',
        HEARTBEAT_BLOCKED: 'true',
      },
      now,
    );
    expect(signals).toEqual({
      hasInFlightWork: false,
      lastActivityAt: '2026-07-04T23:00:00Z',
      explicitBlockedOrPaused: true,
    });
  });
});

describe('writeHeartbeat — round-trips a schema-valid file to disk', () => {
  test('writes JSON readable back with the same shape, creating parent dirs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wi1615-heartbeat-'));
    const path = join(dir, 'lanes', 'ws-1', '_state', 'heartbeat.json');
    const record = buildHeartbeat({
      sessionId: 'shepherd:ws-1-20260705T0000Z',
      role: 'shepherd',
      lane: 'ws-1',
      now: new Date('2026-07-05T00:00:00Z'),
    });
    try {
      writeHeartbeat(path, record);
      const readBack = JSON.parse(readFileSync(path, 'utf8'));
      expect(readBack).toEqual(record);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Required close-out check: the contract example itself must no longer emit `-p`, and must show
// the per-OS Option-B form this writer implements.
describe('heartbeat-contract.md — the contract-fix half of WI-1615', () => {
  test('the relaunch_command example contains no -p / --print', () => {
    const contractPath = join(
      import.meta.dir,
      '..',
      'library',
      'heartbeat-contract.md',
    );
    const contract = readFileSync(contractPath, 'utf8');
    const exampleLine = contract
      .split('\n')
      .find((l) => l.includes('"relaunch_command"'));
    expect(exampleLine).toBeDefined();
    assertNeverHeadless(exampleLine!);
    expect(exampleLine).toContain('wt.exe new-tab -- claude --resume');
  });

  test('the contract documents both per-OS Option-B forms', () => {
    const contractPath = join(
      import.meta.dir,
      '..',
      'library',
      'heartbeat-contract.md',
    );
    const contract = readFileSync(contractPath, 'utf8');
    expect(contract).toContain(
      'wt.exe new-tab -- claude --resume <session_id>',
    );
    expect(contract).toContain(
      'tmux new-session -d -s <name> "claude --resume <session_id>"',
    );
    expect(contract).toContain('OPQ-14');
  });
});
