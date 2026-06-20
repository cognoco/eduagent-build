import * as fs from 'fs';
import * as path from 'path';

const TARGET_FILES = [
  'components/guards/RequireFamilyContext.tsx',
  'app/(app)/_components/save-wizard/ProfileBasicsStep.tsx',
  'app/(app)/_components/save-wizard/ConfirmStep.tsx',
  'app/(app)/_components/ConsentWithdrawnGate.tsx',
  'components/common/OfflineBanner.tsx',
  'components/family/AddToMyLearningButton.tsx',
  'components/session/QuotaExceededCard.tsx',
  'components/session/SessionFooter.tsx',
  'components/session/SessionModals.tsx',
];

describe('semantic color tokens', () => {
  it('[WI-507] shared UI does not use hardcoded white foregrounds', () => {
    const root = path.resolve(__dirname, '..');
    const violations: string[] = [];

    for (const relative of TARGET_FILES) {
      const source = fs.readFileSync(path.join(root, relative), 'utf8');
      if (source.includes('text-white')) {
        violations.push(`${relative}: text-white`);
      }
      if (source.includes('color="white"')) {
        violations.push(`${relative}: color="white"`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('[WI-507] OfflineBanner keeps foreground color on the same token source as its background', () => {
    const root = path.resolve(__dirname, '..');
    const source = fs.readFileSync(
      path.join(root, 'components/common/OfflineBanner.tsx'),
      'utf8',
    );

    expect(source).toContain('className="text-background');
    expect(source).not.toContain('style={{ color: colors.background }}');
    expect(source).not.toContain('color={colors.background}');
  });
});
