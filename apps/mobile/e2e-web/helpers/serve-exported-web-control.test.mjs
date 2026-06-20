import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  resolveExportTimeoutMs,
  waitForProcessExit,
} from './serve-exported-web-control.mjs';

class FakeChildProcess extends EventEmitter {
  constructor() {
    super();
    this.pid = 12345;
    this.killedWith = null;
  }

  kill(signal) {
    this.killedWith = signal ?? true;
    return true;
  }
}

test('waitForProcessExit rejects stalled exports with actionable timeout and cleanup', async () => {
  const child = new FakeChildProcess();
  let cleanupCalled = false;

  await assert.rejects(
    waitForProcessExit(child, {
      label: 'Expo web export',
      timeoutMs: 5,
      killProcessTree: async (target) => {
        cleanupCalled = target === child;
        target.kill('SIGTERM');
      },
    }),
    /Expo web export timed out after 5ms before the web server bound.*PLAYWRIGHT_WEB_EXPORT_TIMEOUT_MS/s,
  );

  assert.equal(cleanupCalled, true);
  assert.equal(child.killedWith, 'SIGTERM');
});

test('waitForProcessExit rejects nonzero export exits before server startup', async () => {
  const child = new FakeChildProcess();
  const result = waitForProcessExit(child, {
    label: 'Expo web export',
    timeoutMs: 1_000,
    killProcessTree: async () => {
      throw new Error('timeout cleanup should not run');
    },
  });

  child.emit('exit', 1, null);

  await assert.rejects(result, /Expo web export exited with code 1/);
});

test('resolveExportTimeoutMs defaults below the Playwright webServer timeout', () => {
  assert.equal(resolveExportTimeoutMs({}), 180_000);
  assert.equal(
    resolveExportTimeoutMs({ PLAYWRIGHT_WEB_EXPORT_TIMEOUT_MS: '2500' }),
    2_500,
  );
});
