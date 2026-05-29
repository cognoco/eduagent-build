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

function findProfileReadSegments(text: string): string[] {
  const reads =
    /\b(?:from|innerJoin)\(\s*profiles\b|\bdb\.query\.profiles\.(?:findFirst|findMany)\b/g;
  return Array.from(text.matchAll(reads), (match) => readSegment(text, match));
}

function findSubjectReadSegments(text: string): string[] {
  const reads =
    /\b(?:from|innerJoin)\(\s*subjects\b|\bdb\.query\.subjects\.(?:findFirst|findMany)\b/g;
  return Array.from(text.matchAll(reads), (match) => readSegment(text, match));
}

function readSegment(text: string, match: RegExpMatchArray): string {
  const index = match.index ?? 0;
  const lineStart = text.lastIndexOf('\n', index);
  const previousLineStart = text.lastIndexOf('\n', Math.max(0, lineStart - 1));
  const currentLineStart = lineStart === -1 ? 0 : lineStart + 1;
  const previousLine =
    lineStart === -1 ? '' : text.slice(previousLineStart + 1, lineStart);
  const start = /^\/\/\s*archived-(?:subject-)?exempt:\s+\S.+$/.test(
    previousLine,
  )
    ? previousLineStart + 1
    : currentLineStart;
  const end = text.indexOf(';', index);
  return text.slice(start, end === -1 ? text.length : end + 1);
}

function hasArchivedProfileFilter(text: string): boolean {
  return text.includes('isNull(profiles.archivedAt)');
}

function hasArchivedProfileExemption(text: string): boolean {
  return /^\/\/\s*archived-exempt:\s+\S.+$/m.test(text);
}

function hasArchivedSubjectExemption(text: string): boolean {
  return /^\/\/\s*archived-subject-exempt:\s+\S.+$/m.test(text);
}

function hasArchivedSubjectSuppression(text: string): boolean {
  return (
    text.includes('subjects.status') &&
    text.includes("'archived'") &&
    (text.includes('ne(') || text.includes('not(eq('))
  );
}

describe('cross-profile Inngest archived profile guard', () => {
  it('catches an unguarded profile scan even when another scan in the same file is guarded', () => {
    const text = `
// @inngest-admin: cross-profile
await db.select().from(profiles).where(isNull(profiles.archivedAt));
await db.select().from(profiles).where(eq(profiles.role, 'student'));
`;

    const unguardedReads = findProfileReadSegments(text).filter(
      (segment) => !hasArchivedProfileFilter(segment),
    );

    expect(unguardedReads).toHaveLength(1);
  });

  it('catches subject joins that rely on unrelated archived-subject suppression', () => {
    const text = `
// @inngest-admin: cross-profile
await db.select().from(subjects).where(ne(subjects.status, 'archived'));
await db.select().from(subjects).where(eq(subjects.profileId, profileId));
`;

    const unguardedReads = findSubjectReadSegments(text).filter(
      (segment) => !hasArchivedSubjectSuppression(segment),
    );

    expect(unguardedReads).toHaveLength(1);
  });

  it('requires archived-profile handling in every cross-profile profile scan', () => {
    const offenders = walkTsFiles(FUNCTIONS_DIR)
      .map((absPath) => ({
        absPath,
        relPath: path.relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
        text: fs.readFileSync(absPath, 'utf8'),
      }))
      .filter(({ text }) => text.includes('@inngest-admin: cross-profile'))
      .filter(({ text }) => readsProfiles(text))
      .flatMap(({ relPath, text }) =>
        findProfileReadSegments(text)
          .filter(
            (segment) =>
              !hasArchivedProfileFilter(segment) &&
              !hasArchivedProfileExemption(segment),
          )
          .map((segment) => ({
            relPath,
            segment: segment.trim().split('\n')[0],
          })),
      );

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
      .flatMap(({ relPath, text }) =>
        findSubjectReadSegments(text)
          .filter(
            (segment) =>
              !hasArchivedSubjectSuppression(segment) &&
              !hasArchivedSubjectExemption(segment),
          )
          .map((segment) => ({
            relPath,
            segment: segment.trim().split('\n')[0],
          })),
      );

    expect(offenders).toEqual([]);
  });
});
