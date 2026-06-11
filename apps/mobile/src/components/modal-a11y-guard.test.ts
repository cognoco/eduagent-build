import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Every <Modal> must trap screen-reader focus: without accessibilityViewIsModal,
// VoiceOver/TalkBack focus escapes behind the overlay and reads the obscured
// screen, so SR users interact with content they cannot see. This forward-only
// guard scans every production .tsx file for <Modal ...> JSX openings and fails
// if any opening tag lacks the accessibilityViewIsModal prop or sets a literal
// accessibilityViewIsModal={false}.
// Limitation: non-literal values (accessibilityViewIsModal={someCondition}) are
// accepted — the guard does not statically judge conditional expressions.
// Pattern mirrors persona-fossil-guard.test.ts (source-text scan over git ls-files).

interface ModalOpening {
  line: number;
  tag: string;
}

function listMobileTsxSources(): string[] {
  const repoRoot = resolve(__dirname, '../../../..');
  const out = execSync('git ls-files "apps/mobile/src/**/*.tsx"', {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  return out
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .filter((l) => !/\.test\.tsx$/.test(l));
}

// Brace-depth-aware: tracks {/} so '>' inside prop expressions doesn't truncate the tag.
function findModalOpenings(source: string): ModalOpening[] {
  const openings: ModalOpening[] = [];
  const re = /<Modal[\s/>]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    let depth = 0;
    let end = -1;
    for (let i = match.index; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) continue;
    openings.push({
      line: source.slice(0, match.index).split('\n').length,
      tag: source.slice(match.index, end + 1),
    });
  }
  return openings;
}

// A tag violates if the prop is absent, or present but disabled with a literal {false}.
function tagViolates(tag: string): boolean {
  if (!tag.includes('accessibilityViewIsModal')) return true;
  return /accessibilityViewIsModal\s*=\s*\{\s*false\s*\}/.test(tag);
}

describe('MODAL-A11Y-GUARD — every <Modal> traps screen-reader focus', () => {
  const repoRoot = resolve(__dirname, '../../../..');
  const files = listMobileTsxSources();

  it('finds mobile tsx source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('finds the existing Modal population (sanity — guard must not silently scan nothing)', () => {
    const total = files.reduce((n, f) => {
      const abs = resolve(repoRoot, f);
      if (!existsSync(abs)) return n;
      return n + findModalOpenings(readFileSync(abs, 'utf-8')).length;
    }, 0);
    // 15 Modal instances existed when this guard landed; the population may
    // grow or shrink, but a sudden drop to zero means the scanner is broken.
    expect(total).toBeGreaterThan(0);
  });

  it('rejects an explicit accessibilityViewIsModal={false} opt-out', () => {
    expect(tagViolates('<Modal accessibilityViewIsModal={false}>')).toBe(true);
    expect(tagViolates('<Modal accessibilityViewIsModal = { false }>')).toBe(
      true,
    );
    // Bare prop and non-literal conditional are accepted (see header limitation).
    expect(tagViolates('<Modal accessibilityViewIsModal>')).toBe(false);
    expect(tagViolates('<Modal accessibilityViewIsModal={isOpen}>')).toBe(
      false,
    );
  });

  it('every <Modal> opening tag carries accessibilityViewIsModal', () => {
    const violations: string[] = [];
    for (const file of files) {
      const abs = resolve(repoRoot, file);
      if (!existsSync(abs)) continue;
      const source = readFileSync(abs, 'utf-8');
      for (const opening of findModalOpenings(source)) {
        if (tagViolates(opening.tag)) {
          violations.push(`  - ${file}:${opening.line}`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `<Modal> without accessibilityViewIsModal:\n` +
          violations.join('\n') +
          `\n\nEvery modal must trap screen-reader focus. Without ` +
          `accessibilityViewIsModal, VoiceOver/TalkBack focus escapes behind ` +
          `the overlay and reads the obscured screen. Add the ` +
          `accessibilityViewIsModal prop to the <Modal> opening tag.`,
      );
    }
  });
});
