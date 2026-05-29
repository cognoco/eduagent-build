import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FUNCTIONS_DIR = path.join(REPO_ROOT, 'apps/api/src/inngest/functions');

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function readsProfiles(text: string): boolean {
  return (
    /\bfrom\(\s*profiles\b/.test(text) ||
    /\binnerJoin\(\s*profiles\b/.test(text) ||
    /\bdb\.query\.profiles\.(findFirst|findMany)\b/.test(text)
  );
}

function readsSubjects(text: string): boolean {
  return (
    /\bfrom\(\s*subjects\b/.test(text) ||
    /\binnerJoin\(\s*subjects\b/.test(text) ||
    /\bdb\.query\.subjects\.(findFirst|findMany)\b/.test(text)
  );
}

function hasArchivedSubjectSuppression(text: string): boolean {
  return (
    text.includes('subjects.status') &&
    text.includes("'archived'") &&
    (text.includes('ne(') || text.includes('not(eq('))
  );
}

describe('cross-profile Inngest archived profile guard', () => {
  it('requires archived-profile handling in every cross-profile profile scan', () => {
    const offenders = walkTsFiles(FUNCTIONS_DIR)
      .map((absPath) => ({
        absPath,
        relPath: path.relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
        text: fs.readFileSync(absPath, 'utf8'),
      }))
      .filter(({ text }) => text.includes('@inngest-admin: cross-profile'))
      .filter(({ text }) => readsProfiles(text))
      .filter(
        ({ text }) =>
          !text.includes('profiles.archivedAt') &&
          !/^\/\/\s*archived-exempt:\s+\S.+$/m.test(text),
      )
      .map(({ relPath }) => relPath);

    expect(offenders).toEqual([]);
  });

  it('requires archived-subject suppression when cross-profile scans join subjects', () => {
    const offenders = walkTsFiles(FUNCTIONS_DIR)
      .map((absPath) => ({
        absPath,
        relPath: path.relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
        text: fs.readFileSync(absPath, 'utf8'),
      }))
      .filter(({ text }) => text.includes('@inngest-admin: cross-profile'))
      .filter(({ text }) => readsSubjects(text))
      .filter(
        ({ text }) =>
          !hasArchivedSubjectSuppression(text) &&
          !/^\/\/\s*archived-subject-exempt:\s+\S.+$/m.test(text),
      )
      .map(({ relPath }) => relPath);

    expect(offenders).toEqual([]);
  });
});
