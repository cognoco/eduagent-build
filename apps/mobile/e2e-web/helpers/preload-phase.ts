import { appendFileSync } from 'node:fs';

export type PlaywrightPreloadPhase =
  | 'global-setup-started'
  | 'global-setup-completed'
  | 'global-setup-failed'
  | 'setup-test-body-entered';

export function recordPreloadPhase(phase: PlaywrightPreloadPhase): void {
  const phaseFile = process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE;
  if (!phaseFile) return;

  try {
    appendFileSync(phaseFile, `${phase}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch {
    throw new Error('Playwright preload phase recording failed');
  }
}
