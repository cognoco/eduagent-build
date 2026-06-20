const DEFAULT_EXPORT_TIMEOUT_MS = 180_000;

function parsePositiveInteger(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export function resolveExportTimeoutMs(env = process.env) {
  return (
    parsePositiveInteger(env.PLAYWRIGHT_WEB_EXPORT_TIMEOUT_MS) ??
    DEFAULT_EXPORT_TIMEOUT_MS
  );
}

export async function killProcessTree(childProcess) {
  if (!childProcess.pid) {
    childProcess.kill('SIGTERM');
    return;
  }

  if (process.platform === 'win32') {
    const { spawn } = await import('node:child_process');
    const killer = spawn(
      'taskkill',
      ['/pid', String(childProcess.pid), '/T', '/F'],
      { stdio: 'ignore' },
    );
    await new Promise((resolve) => killer.once('exit', resolve));
    return;
  }

  childProcess.kill('SIGTERM');
}

export async function waitForProcessExit(
  childProcess,
  {
    label,
    timeoutMs = resolveExportTimeoutMs(),
    killProcessTree: killTree = killProcessTree,
  },
) {
  let timeoutId;

  return await new Promise((resolve, reject) => {
    let settled = false;

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback(value);
    };

    const onError = (error) => {
      settle(
        reject,
        new Error(`${label} failed to start: ${error.message}`, {
          cause: error,
        }),
      );
    };

    const onExit = (code, signal) => {
      if (code === 0) {
        settle(resolve);
        return;
      }

      const detail =
        code == null
          ? `signal ${signal ?? 'unknown'}`
          : `code ${String(code)}`;
      settle(reject, new Error(`${label} exited with ${detail}.`));
    };

    childProcess.once('error', onError);
    childProcess.once('exit', onExit);

    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      childProcess.off('error', onError);
      childProcess.off('exit', onExit);
      void Promise.resolve()
        .then(() => killTree(childProcess))
        .catch((error) => {
          console.error(`[serve] failed to clean up stalled ${label}: ${error.message}`);
        })
        .finally(() => {
          clearTimeout(timeoutId);
          reject(
            new Error(
              `${label} timed out after ${timeoutMs}ms before the web server bound. ` +
                'Set PLAYWRIGHT_WEB_EXPORT_TIMEOUT_MS to tune the export preflight window; ' +
                'inspect Expo export output above for the underlying bundler stall.',
            ),
          );
        });
    }, timeoutMs);
  });
}
