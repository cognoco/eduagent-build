import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as ts from 'typescript';

interface BottomSheetOpening {
  file: string;
  attributes: ReadonlySet<string>;
}

const DISMISSIBLE_CONSUMERS = new Set([
  'apps/mobile/src/components/library/TopicPickerSheet.tsx',
  'apps/mobile/src/components/subject-hub/TopicDetailSheet.tsx',
  'apps/mobile/src/components/support/SupportPersonPickerSheet.tsx',
]);

const NON_DISMISSIBLE_CONSUMERS = new Set([
  'apps/mobile/src/components/family/LearnTogetherSheet.tsx',
  'apps/mobile/src/components/nudge/NudgeActionSheet.tsx',
]);

function listBottomSheetOpenings(): BottomSheetOpening[] {
  const repoRoot = resolve(__dirname, '../../../../..');
  const files = execSync('git ls-files "apps/mobile/src/**/*.tsx"', {
    cwd: repoRoot,
    encoding: 'utf-8',
  })
    .split('\n')
    .filter((file) => file.length > 0 && !file.endsWith('.test.tsx'));
  const openings: BottomSheetOpening[] = [];

  for (const file of files) {
    const source = readFileSync(resolve(repoRoot, file), 'utf-8');
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    const visit = (node: ts.Node): void => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(sourceFile) === 'BottomSheet'
      ) {
        openings.push({
          file,
          attributes: new Set(
            node.attributes.properties
              .filter(ts.isJsxAttribute)
              .map((attribute) => attribute.name.getText(sourceFile)),
          ),
        });
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return openings;
}

describe('BottomSheet consumer contract', () => {
  const openings = listBottomSheetOpenings();

  it('enumerates every production consumer and gives every dialog an accessible name', () => {
    expect(openings.map(({ file }) => file).sort()).toEqual(
      [...DISMISSIBLE_CONSUMERS, ...NON_DISMISSIBLE_CONSUMERS].sort(),
    );
    expect(
      openings.every(({ attributes }) => attributes.has('accessibilityLabel')),
    ).toBe(true);
  });

  it('keeps the three picker/detail sheets dismissible and LearnTogether/Nudge backdrop-locked', () => {
    for (const { file, attributes } of openings) {
      expect(attributes.has('backdropDismissible')).toBe(
        DISMISSIBLE_CONSUMERS.has(file),
      );
    }
  });
});
