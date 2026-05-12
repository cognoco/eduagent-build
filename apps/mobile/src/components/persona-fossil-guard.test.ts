import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Epic 12 removed personaType from the database. Several vocabulary fossils
// survived under aliases (personaFromBirthYear, isLearner, Persona type).
// PR-11 (C4 P7) migrates all callers to computeAgeBracket / AgeBracket from
// @eduagent/schemas. This guard prevents NEW fossils from appearing.
// Remove entries from KNOWN_SITES as P7 migrates each file.

const KNOWN_SITES = new Set<string>([
  'apps/mobile/src/lib/profile.ts',
  'apps/mobile/src/lib/consent-copy.ts',
  'apps/mobile/src/lib/consent-copy.test.ts',
  'apps/mobile/src/app/create-profile.test.tsx',
  'apps/mobile/src/app/(app)/_layout.tsx',
  'apps/mobile/src/app/(app)/_layout.test.tsx',
  'apps/mobile/src/app/(app)/session/index.tsx',
  'apps/mobile/src/app/(app)/mentor-memory.tsx',
  'apps/mobile/src/app/(app)/mentor-memory.test.tsx',
  'apps/mobile/src/app/(app)/topic/relearn.tsx',
  'apps/mobile/src/app/(app)/topic/relearn.test.tsx',
  'apps/mobile/src/app/session-summary/[sessionId].tsx',
  'apps/mobile/src/app/session-summary/[sessionId].test.tsx',
]);

const FOSSIL_PATTERNS: RegExp[] = [
  /\bpersonaFromBirthYear\b/,
  /\bisLearner\b/,
  /\bpersonaType\b/,
  /\bPersona\b/,
];

function listMobileSources(): string[] {
  const repoRoot = resolve(__dirname, '../../../..');
  const out = execSync(
    'git ls-files "apps/mobile/src/**/*.ts" "apps/mobile/src/**/*.tsx"',
    { cwd: repoRoot, encoding: 'utf-8' },
  );
  return out
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .filter((l) => !l.endsWith('persona-fossil-guard.test.ts'));
}

function fileHasPersonaFossil(absPath: string): boolean {
  if (!existsSync(absPath)) return false;
  const source = readFileSync(absPath, 'utf-8');
  return FOSSIL_PATTERNS.some((p) => p.test(source));
}

describe('EPIC-12-GUARD — persona-fossil forward-only guard', () => {
  const repoRoot = resolve(__dirname, '../../../..');
  const files = listMobileSources();

  it('finds mobile source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('does not introduce NEW persona-fossil patterns outside the known-sites allowlist', () => {
    const violators = files
      .filter((f) => fileHasPersonaFossil(resolve(repoRoot, f)))
      .map((f) => f.replace(/\\/g, '/'));

    const newViolators = violators.filter((f) => !KNOWN_SITES.has(f));

    if (newViolators.length > 0) {
      throw new Error(
        `[EPIC-12] New persona-fossil pattern(s) found:\n` +
          newViolators.map((f) => `  - ${f}`).join('\n') +
          `\n\nEpic 12 removed personaType from the database. ` +
          `Do not use personaFromBirthYear, isLearner, or the local Persona type. ` +
          `Use computeAgeBracket() and AgeBracket from @eduagent/schemas instead.`,
      );
    }
  });

  it('shrinks the known-sites allowlist as files are migrated', () => {
    const stillViolating = Array.from(KNOWN_SITES).filter((f) =>
      files.some((g) => g.replace(/\\/g, '/') === f)
        ? fileHasPersonaFossil(resolve(repoRoot, f))
        : false,
    );
    expect(stillViolating.sort()).toEqual(Array.from(KNOWN_SITES).sort());
  });
});
