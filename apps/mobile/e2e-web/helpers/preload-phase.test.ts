import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { recordPreloadPhase } from './preload-phase';

const originalPhaseFile = process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE;
let testDir: string | undefined;

afterEach(async () => {
  if (originalPhaseFile === undefined) {
    delete process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE;
  } else {
    process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE = originalPhaseFile;
  }
  if (testDir) {
    await rm(testDir, { recursive: true, force: true });
    testDir = undefined;
  }
});

describe('[WI-2948] privacy-safe Playwright preload markers', () => {
  it('writes only fixed allowlisted phase tokens', async () => {
    testDir = await mkdtemp(path.join(tmpdir(), 'wi2948-phase-marker-'));
    const phaseFile = path.join(testDir, 'phases.txt');
    process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE = phaseFile;

    recordPreloadPhase('global-setup-started');
    recordPreloadPhase('global-setup-completed');
    recordPreloadPhase('setup-test-body-entered');

    await expect(readFile(phaseFile, 'utf8')).resolves.toBe(
      'global-setup-started\nglobal-setup-completed\nsetup-test-body-entered\n',
    );
  });

  it('fails with a fixed message when the marker file cannot be written', async () => {
    testDir = await mkdtemp(path.join(tmpdir(), 'wi2948-phase-marker-'));
    const privatePathSentinel = path.join(
      testDir,
      'PII_SENTINEL_PERSON_NAME',
      'phases.txt',
    );
    process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE = privatePathSentinel;

    expect(() => recordPreloadPhase('global-setup-started')).toThrow(
      'Playwright preload phase recording failed',
    );
    try {
      recordPreloadPhase('global-setup-started');
    } catch (error) {
      expect(String(error)).not.toContain('PII_SENTINEL_PERSON_NAME');
      expect(String(error)).not.toContain(testDir);
    }
  });
});
