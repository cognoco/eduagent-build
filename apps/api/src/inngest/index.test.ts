import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as inngestBarrel from './index';

// [BUG-698] Regression guard for the wired-but-untriggered progress-backfill
// pair (orchestrator + per-profile worker). Both Inngest functions used to be
// registered via `app/progress.backfill.start` and a per-profile fan-out event,
// but no production code path ever emitted those events. The dead handlers
// created false confidence that the backfill was operational. They were
// removed on 2026-04-28; this test makes sure they (or any equivalent
// wired-but-untriggered pair) cannot be re-added without an explicit trigger.

describe('inngest barrel — BUG-698 progress-backfill regression guard', () => {
  const indexSource = readFileSync(resolve(__dirname, 'index.ts'), 'utf-8');

  it('does not export a progressBackfill symbol', () => {
    const exportedNames = Object.keys(inngestBarrel);
    const matches = exportedNames.filter((name) =>
      /progressBackfill|progress_backfill/i.test(name)
    );
    expect(matches).toEqual([]);
  });

  it('does not import the deleted progress-backfill module', () => {
    expect(indexSource).not.toMatch(
      /from\s+['"]\.\/functions\/progress-backfill['"]/
    );
  });

  it('does not declare an `app/progress.backfill` event handler', () => {
    expect(indexSource).not.toMatch(/app\/progress\.backfill/);
  });

  it('does not have a progress-backfill function source file', () => {
    const sourcePath = resolve(__dirname, 'functions', 'progress-backfill.ts');
    expect(existsSync(sourcePath)).toBe(false);
  });
});
