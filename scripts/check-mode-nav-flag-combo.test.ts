import {
  classifyCombo,
  diffAgainstBaseline,
  type BaselineEntry,
  type Occurrence,
} from './check-mode-nav-flag-combo';

describe('check-mode-nav-flag-combo', () => {
  describe('classifyCombo', () => {
    it('is green on the 3 sanctioned rows', () => {
      expect(classifyCombo({ v0: false, v1: true, v2: true })).toBe('config-t');
      expect(classifyCombo({ v0: false, v1: true, v2: false })).toBe(
        'config-f',
      );
      expect(classifyCombo({ v0: true, v1: false, v2: false })).toBe('legacy');
    });

    it('is red on the R9 dead-zone combo (V2=on/V1=off)', () => {
      expect(classifyCombo({ v0: false, v1: false, v2: true })).toBe('banned');
      expect(classifyCombo({ v0: true, v1: false, v2: true })).toBe('banned');
    });

    it('is red on V0=on combined with V1/V2 on', () => {
      expect(classifyCombo({ v0: true, v1: true, v2: false })).toBe('banned');
      expect(classifyCombo({ v0: true, v1: true, v2: true })).toBe('banned');
    });

    it('is red on all-flags-off', () => {
      expect(classifyCombo({ v0: false, v1: false, v2: false })).toBe('banned');
    });
  });

  describe('diffAgainstBaseline', () => {
    const baseline: BaselineEntry[] = [
      {
        site: 'apps/mobile/eas.json:build.development',
        v0: true,
        v1: true,
        v2: true,
      },
    ];

    it('does not flag a baselined site holding its exact combo', () => {
      const current: Occurrence[] = [
        {
          site: 'apps/mobile/eas.json:build.development',
          combo: { v0: true, v1: true, v2: true },
          cls: 'banned',
        },
      ];
      expect(diffAgainstBaseline(current, baseline).newViolations).toEqual([]);
    });

    it('flags a NEW unbaselined banned site', () => {
      const current: Occurrence[] = [
        {
          site: 'apps/mobile/eas.json:build.development',
          combo: { v0: true, v1: true, v2: true },
          cls: 'banned',
        },
        {
          site: '.github/workflows/ci.yml:new-job:Some new step',
          combo: { v0: true, v1: false, v2: true }, // the R9 dead zone
          cls: 'banned',
        },
      ];
      const { newViolations } = diffAgainstBaseline(current, baseline);
      expect(newViolations).toHaveLength(1);
      expect(newViolations[0]).toMatchObject({
        site: '.github/workflows/ci.yml:new-job:Some new step',
      });
    });

    it('flags a baselined site that drifts to a DIFFERENT banned combo (e.g. toward the dead zone)', () => {
      const current: Occurrence[] = [
        {
          site: 'apps/mobile/eas.json:build.development',
          combo: { v0: false, v1: false, v2: true }, // flipped toward V2=on/V1=off
          cls: 'banned',
        },
      ];
      const { newViolations } = diffAgainstBaseline(current, baseline);
      expect(newViolations).toHaveLength(1);
    });

    it('does not flag a site that flips to a sanctioned combo, and reports the stale baseline entry', () => {
      const current: Occurrence[] = [
        {
          site: 'apps/mobile/eas.json:build.development',
          combo: { v0: false, v1: true, v2: true }, // now Config T
          cls: 'config-t',
        },
      ];
      const { newViolations, staleBaselineEntries } = diffAgainstBaseline(
        current,
        baseline,
      );
      expect(newViolations).toEqual([]);
      expect(staleBaselineEntries).toEqual(baseline);
    });
  });
});
