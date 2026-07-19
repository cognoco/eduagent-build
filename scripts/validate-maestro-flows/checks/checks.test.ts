import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import type { FlowFile, ValidatorInputs } from '../shared';
import { extractTags } from '../shared';
import { runC1, _internals as c1i } from './c1-flow-refs';
import { runC2 } from './c2-helpers';
import { runC3, _internals as c3i } from './c3-test-ids';
import { runC4 } from './c4-seed-scenarios';
import { runC5 } from './c5-launch-legacy';
import { runC6, _internals as c6i } from './c6-optional';
import { runC7 } from './c7-tags';

function mkFlow(
  repoPath: string,
  contents: string,
  tagsOverride?: string[],
): FlowFile {
  return {
    absPath: '/tmp/' + repoPath,
    repoPath,
    contents,
    lines: contents.split(/\r?\n/),
    tags: tagsOverride ?? extractTags(contents),
    isSetup: repoPath.includes('/_setup/'),
  };
}

function baseInputs(over: Partial<ValidatorInputs> = {}): ValidatorInputs {
  return {
    repoRoot: '/tmp/repo',
    flows: [],
    setupFlows: [],
    appTestIds: new Set(),
    appTestIdWildcards: [],
    seedScenarios: new Set(),
    setupHelperNames: new Set(),
    optionalAllowlist: [],
    testIdAllowlist: new Set(),
    launchLegacyAllowlist: new Set(),
    registryTags: new Set(),
    ...over,
  };
}

describe('extractTags', () => {
  it('reads block-form tags from frontmatter', () => {
    const yaml =
      'appId: foo\ntags:\n  - smoke\n  - learning\n---\n- launchApp\n';
    expect(extractTags(yaml)).toEqual(['smoke', 'learning']);
  });

  it('reads inline-form tags', () => {
    const yaml = 'appId: foo\ntags: [smoke, learning]\n---\n- launchApp\n';
    expect(extractTags(yaml)).toEqual(['smoke', 'learning']);
  });

  it('returns empty when no tags block exists', () => {
    expect(extractTags('appId: foo\n---\n- launchApp\n')).toEqual([]);
  });

  it('stops scanning at frontmatter terminator', () => {
    const yaml = 'tags:\n  - smoke\n---\ntags:\n  - body-tag-ignored\n';
    expect(extractTags(yaml)).toEqual(['smoke']);
  });
});

describe('C1 — flow file references', () => {
  it('passes when all runFlow targets resolve', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'c1-pass-'));
    try {
      mkdirSync(join(tmp, 'flows/_setup'), { recursive: true });
      writeFileSync(join(tmp, 'flows/_setup/foo.yaml'), 'noop');
      writeFileSync(
        join(tmp, 'flows/test.yaml'),
        '- runFlow: _setup/foo.yaml\n',
      );
      const flow: FlowFile = {
        absPath: join(tmp, 'flows/test.yaml'),
        repoPath: 'flows/test.yaml',
        contents: '- runFlow: _setup/foo.yaml\n',
        lines: ['- runFlow: _setup/foo.yaml'],
        tags: [],
        isSetup: false,
      };
      const result = runC1(baseInputs({ repoRoot: tmp, flows: [flow] }));
      expect(result.passed).toBe(true);
      expect(result.violations).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('fails when runFlow target is missing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'c1-fail-'));
    try {
      mkdirSync(join(tmp, 'flows'), { recursive: true });
      writeFileSync(
        join(tmp, 'flows/test.yaml'),
        '- runFlow: _setup/missing.yaml\n',
      );
      const flow: FlowFile = {
        absPath: join(tmp, 'flows/test.yaml'),
        repoPath: 'flows/test.yaml',
        contents: '- runFlow: _setup/missing.yaml\n',
        lines: ['- runFlow: _setup/missing.yaml'],
        tags: [],
        isSetup: false,
      };
      const result = runC1(baseInputs({ repoRoot: tmp, flows: [flow] }));
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].reason).toMatch(/not found/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('extracts both inline and block-form runFlow targets', () => {
    const yaml = [
      '- runFlow: _setup/inline.yaml',
      '- runFlow:',
      '    file: _setup/block.yaml',
      '    env:',
      '      X: 1',
    ].join('\n');
    const flow = mkFlow('flows/x.yaml', yaml);
    const targets = c1i.extractRunFlowTargets(flow);
    expect(targets.map((t) => t.target).sort()).toEqual([
      '_setup/block.yaml',
      '_setup/inline.yaml',
    ]);
  });
});

describe('C2 — setup helper references', () => {
  it('passes when helper exists on the allowlist', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'c2-pass-'));
    try {
      mkdirSync(join(tmp, 'apps/mobile/e2e/flows/_setup'), { recursive: true });
      writeFileSync(join(tmp, 'apps/mobile/e2e/flows/_setup/foo.yaml'), '');
      const flow: FlowFile = {
        absPath: join(tmp, 'apps/mobile/e2e/flows/test.yaml'),
        repoPath: 'apps/mobile/e2e/flows/test.yaml',
        contents: '- runFlow: _setup/foo.yaml',
        lines: ['- runFlow: _setup/foo.yaml'],
        tags: [],
        isSetup: false,
      };
      const result = runC2(
        baseInputs({
          repoRoot: tmp,
          flows: [flow],
          setupHelperNames: new Set(['foo.yaml']),
        }),
      );
      expect(result.passed).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('fails when setup helper is not on the allowlist', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'c2-fail-'));
    try {
      mkdirSync(join(tmp, 'apps/mobile/e2e/flows/_setup'), { recursive: true });
      const flow: FlowFile = {
        absPath: join(tmp, 'apps/mobile/e2e/flows/test.yaml'),
        repoPath: 'apps/mobile/e2e/flows/test.yaml',
        contents: '- runFlow: _setup/old-helper.yaml',
        lines: ['- runFlow: _setup/old-helper.yaml'],
        tags: [],
        isSetup: false,
      };
      const result = runC2(
        baseInputs({
          repoRoot: tmp,
          flows: [flow],
          setupHelperNames: new Set(['known.yaml']),
        }),
      );
      expect(result.passed).toBe(false);
      expect(result.violations[0].reason).toMatch(/missing _setup helper/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('C3 — testID references', () => {
  it('passes when testID is exact in app source', () => {
    const flow = mkFlow(
      'flows/a.yaml',
      '- assertVisible:\n    id: "sign-in-button"',
    );
    const result = runC3(
      baseInputs({ flows: [flow], appTestIds: new Set(['sign-in-button']) }),
    );
    expect(result.passed).toBe(true);
    expect(result.checkedCount).toBe(1);
  });

  it('passes when testID matches a template wildcard from source', () => {
    const flow = mkFlow(
      'flows/a.yaml',
      '- tapOn:\n    id: "subject-card-abc123"',
    );
    const result = runC3(
      baseInputs({
        flows: [flow],
        appTestIds: new Set(),
        appTestIdWildcards: [/^subject-card-.+$/],
      }),
    );
    expect(result.passed).toBe(true);
  });

  it('passes when flow uses ${VAR} matching an exact app id', () => {
    const flow = mkFlow(
      'flows/a.yaml',
      '- tapOn:\n    id: "subject-${SUBJECT_ID}"',
    );
    const result = runC3(
      baseInputs({
        flows: [flow],
        appTestIds: new Set(['subject-foo']),
      }),
    );
    expect(result.passed).toBe(true);
  });

  it('fails when testID is missing and not allowlisted', () => {
    const flow = mkFlow('flows/a.yaml', '- tapOn:\n    id: "ghost-id"');
    const result = runC3(
      baseInputs({ flows: [flow], appTestIds: new Set(['real-id']) }),
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0].reason).toMatch(/ghost-id/);
  });

  it('passes when allowlist contains the testID', () => {
    const flow = mkFlow('flows/a.yaml', '- tapOn:\n    id: "ghost-id"');
    const result = runC3(
      baseInputs({
        flows: [flow],
        appTestIds: new Set(),
        testIdAllowlist: new Set(['ghost-id']),
      }),
    );
    expect(result.passed).toBe(true);
  });

  it('matchesAppId handles allowlist template wildcards', () => {
    const inputs = baseInputs({
      testIdAllowlist: new Set(['report-${REPORT_ID}-row']),
    });
    expect(c3i.matchesAppId('report-abc-row', inputs)).toBe(true);
    expect(c3i.matchesAppId('report-other', inputs)).toBe(false);
  });
});

describe('C4 — seed scenarios', () => {
  it('passes when SEED_SCENARIO is a known scenario', () => {
    const flow = mkFlow(
      'flows/x.yaml',
      '      SEED_SCENARIO: "learning-active"',
    );
    const result = runC4(
      baseInputs({
        flows: [flow],
        seedScenarios: new Set(['learning-active']),
      }),
    );
    expect(result.passed).toBe(true);
  });

  it('fails when SEED_SCENARIO is not in the SeedScenario type', () => {
    const flow = mkFlow(
      'flows/x.yaml',
      '      SEED_SCENARIO: "ghost-scenario"',
    );
    const result = runC4(
      baseInputs({
        flows: [flow],
        seedScenarios: new Set(['learning-active']),
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0].reason).toMatch(/ghost-scenario/);
  });
});

describe('C5 — legacy launch usage', () => {
  it('passes when flow with launchApp is on the allowlist', () => {
    const flow = mkFlow(
      'flows/auth/welcome.yaml',
      '- launchApp:\n    stopApp: false',
    );
    const result = runC5(
      baseInputs({
        flows: [flow],
        launchLegacyAllowlist: new Set(['flows/auth/welcome.yaml']),
      }),
    );
    expect(result.passed).toBe(true);
  });

  it('fails when flow uses launchApp without being on the allowlist', () => {
    const flow = mkFlow('flows/auth/random.yaml', '- launchApp\n');
    const result = runC5(
      baseInputs({ flows: [flow], launchLegacyAllowlist: new Set() }),
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0].reason).toMatch(/launchApp/);
  });

  it('flags runFlow: _setup/launch-devclient.yaml usage', () => {
    const flow = mkFlow(
      'flows/learning/x.yaml',
      '- runFlow: _setup/launch-devclient.yaml',
    );
    const result = runC5(
      baseInputs({ flows: [flow], launchLegacyAllowlist: new Set() }),
    );
    expect(result.passed).toBe(false);
  });
});

describe('C6 — unjustified optional: true', () => {
  it('passes when optional: true has inline # justified comment', () => {
    const yaml = [
      'tags:',
      '  - smoke',
      '---',
      '- tapOn:',
      '    id: "x"',
      '    optional: true  # justified: flaky on Android',
    ].join('\n');
    const flow = mkFlow('flows/a.yaml', yaml);
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(true);
  });

  it('passes when optional: true has a preceding # justified comment', () => {
    const yaml = [
      'tags:',
      '  - pr-blocking',
      '---',
      '- tapOn:',
      '    id: "x"',
      '    # justified: previous comment',
      '    optional: true',
    ].join('\n');
    const flow = mkFlow('flows/a.yaml', yaml);
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(true);
  });

  it('fails on unjustified optional: true in pr-blocking flow', () => {
    const yaml = [
      'tags:',
      '  - pr-blocking',
      '---',
      '- tapOn:',
      '    id: "x"',
      '    optional: true',
    ].join('\n');
    const flow = mkFlow('flows/a.yaml', yaml);
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(false);
  });

  it('fails on unjustified optional: true in a v2-only flow', () => {
    const yaml = [
      'tags:',
      '  - v2',
      '---',
      '- assertVisible:',
      '    id: "v2-shell"',
      '    optional: true',
    ].join('\n');
    const flow = mkFlow('flows/v2/shell.yaml', yaml);
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.reason).toMatch(/v2.*hard assertion/i);
  });

  it('fails on a justified optional assertion in a v2 flow', () => {
    const yaml = [
      'tags: [v2]',
      '---',
      '- assertNotVisible:',
      '    id: "legacy-shell"',
      '    optional: true # justified: transitional UI',
    ].join('\n');
    const flow = mkFlow('flows/v2/no-legacy.yaml', yaml);
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.reason).toMatch(/hard assertion/i);
  });

  it('fails on an allowlisted optional assertion in a v2 flow', () => {
    const repoPath = 'apps/mobile/e2e/flows/v2/allowlisted.yaml';
    const yaml = [
      'tags: [v2]',
      '---',
      '- assertVisible:',
      '    id: "v2-shell"',
      '    optional: true',
    ].join('\n');
    const flow = mkFlow(repoPath, yaml);
    const result = runC6(
      baseInputs({
        flows: [flow],
        optionalAllowlist: ['flows/v2/allowlisted.yaml'],
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.reason).toMatch(/hard assertion/i);
  });

  it('fails on a bare optional inline-map assertion in a v2 flow', () => {
    const flow = mkFlow(
      'flows/v2/inline.yaml',
      [
        'tags: [v2]',
        '---',
        '- assertVisible: { id: "v2-shell", optional: true }',
      ].join('\n'),
    );
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(false);
    expect(result.checkedCount).toBe(1);
    expect(result.violations[0]?.reason).toMatch(/hard assertion/i);
  });

  it('fails on a justified optional inline-map assertion in a v2 flow', () => {
    const flow = mkFlow(
      'flows/v2/inline-justified.yaml',
      [
        'tags: [v2]',
        '---',
        '- assertNotVisible: { id: "legacy-shell", optional: true } # justified: transitional UI',
      ].join('\n'),
    );
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.reason).toMatch(/hard assertion/i);
  });

  it('fails on an allowlisted optional inline-map assertion in a v2 flow', () => {
    const repoPath = 'apps/mobile/e2e/flows/v2/inline-allowlisted.yaml';
    const flow = mkFlow(
      repoPath,
      [
        'tags: [v2]',
        '---',
        '- assertVisible: { text: "V2 home", optional: true }',
      ].join('\n'),
    );
    const result = runC6(
      baseInputs({
        flows: [flow],
        optionalAllowlist: ['flows/v2/inline-allowlisted.yaml'],
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.reason).toMatch(/hard assertion/i);
  });

  it('fails on a split sequence-map optional assertion in a v2 flow', () => {
    const flow = mkFlow(
      'flows/v2/split-map.yaml',
      [
        'tags: [v2]',
        '---',
        '-',
        '  assertVisible:',
        '    id: "v2-shell"',
        '    optional: true',
      ].join('\n'),
    );
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(false);
    expect(result.checkedCount).toBe(1);
    expect(result.violations[0]?.reason).toMatch(/hard assertion/i);
  });

  it('fails on a quoted block optional key in a v2 assertion', () => {
    const flow = mkFlow(
      'flows/v2/quoted-block.yaml',
      [
        'tags: [v2]',
        '---',
        '- assertVisible:',
        '    id: "v2-shell"',
        '    "optional": true',
      ].join('\n'),
    );
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(false);
    expect(result.checkedCount).toBe(1);
    expect(result.violations[0]?.reason).toMatch(/hard assertion/i);
  });

  it('fails on a quoted inline optional key in a v2 assertion', () => {
    const flow = mkFlow(
      'flows/v2/quoted-inline.yaml',
      [
        'tags: [v2]',
        '---',
        '- assertNotVisible: { id: "legacy-shell", "optional": true }',
      ].join('\n'),
    );
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(false);
    expect(result.checkedCount).toBe(1);
    expect(result.violations[0]?.reason).toMatch(/hard assertion/i);
  });

  it('fails closed when a v2 flow is malformed YAML', () => {
    const flow = mkFlow(
      'flows/v2/malformed.yaml',
      [
        'tags: [v2]',
        '---',
        '- assertVisible: { id: "v2-shell", optional: true',
      ].join('\n'),
    );
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.reason).toMatch(/malformed YAML/i);
  });

  it.each([
    [
      'quoted inline optional key',
      '- tapOn: { id: "dismiss-dialog", "optional": true }',
    ],
    [
      'uppercase block boolean',
      ['- tapOn:', '    id: "dismiss-dialog"', '    optional: TRUE'].join('\n'),
    ],
  ])(
    'fails on an unjustified V2 non-assert action with %s',
    (_name, command) => {
      const flow = mkFlow(
        'flows/v2/unjustified-action.yaml',
        ['tags: [v2]', '---', command].join('\n'),
      );
      const result = runC6(baseInputs({ flows: [flow] }));
      expect(result.passed).toBe(false);
      expect(result.checkedCount).toBe(1);
      expect(result.violations[0]?.reason).toMatch(/without # justified/i);
    },
  );

  it.each([
    [
      'quoted inline optional key',
      '- tapOn: { id: "dismiss-dialog", "optional": true } # justified: dialog is conditional',
    ],
    [
      'uppercase block boolean',
      [
        '- tapOn:',
        '    id: "dismiss-dialog"',
        '    optional: TRUE # justified: dialog is conditional',
      ].join('\n'),
    ],
  ])('permits a justified V2 non-assert action with %s', (_name, command) => {
    const flow = mkFlow(
      'flows/v2/justified-action.yaml',
      ['tags: [v2]', '---', command].join('\n'),
    );
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(true);
    expect(result.checkedCount).toBe(1);
  });

  it('permits a preceding justification on a quoted V2 optional key', () => {
    const flow = mkFlow(
      'flows/v2/preceding-justification.yaml',
      [
        'tags: [v2]',
        '---',
        '- tapOn:',
        '    id: "dismiss-dialog"',
        '    # justified: dialog is conditional',
        '    "optional": TRUE',
      ].join('\n'),
    );
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(true);
    expect(result.checkedCount).toBe(1);
  });

  it.each([
    [
      'quoted inline optional key',
      '- tapOn: { id: "dismiss-dialog", "optional": true }',
    ],
    [
      'uppercase block boolean',
      ['- tapOn:', '    id: "dismiss-dialog"', '    optional: TRUE'].join('\n'),
    ],
  ])(
    'permits an allowlisted V2 non-assert action with %s',
    (_name, command) => {
      const repoPath = 'apps/mobile/e2e/flows/v2/allowlisted-action.yaml';
      const flow = mkFlow(repoPath, ['tags: [v2]', '---', command].join('\n'));
      const result = runC6(
        baseInputs({
          flows: [flow],
          optionalAllowlist: ['flows/v2/allowlisted-action.yaml'],
        }),
      );
      expect(result.passed).toBe(true);
      expect(result.checkedCount).toBe(1);
    },
  );

  it('fails a V2 assertion whose optional options arrive through an alias', () => {
    const flow = mkFlow(
      'flows/v2/aliased-assertion.yaml',
      [
        'tags: [v2]',
        '---',
        '- tapOn: &conditional-options',
        '    id: "dismiss-dialog"',
        '    optional: true # justified: dialog is conditional',
        '- assertVisible: *conditional-options',
      ].join('\n'),
    );
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(false);
    expect(result.checkedCount).toBe(2);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.reason).toMatch(/hard assertion/i);
  });

  it('permits a justified optional inline-map non-assert action in a v2 flow', () => {
    const flow = mkFlow(
      'flows/v2/inline-action.yaml',
      [
        'tags: [v2]',
        '---',
        '- tapOn: { id: "dismiss-dialog", optional: true } # justified: dialog is conditional',
      ].join('\n'),
    );
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(true);
    expect(result.checkedCount).toBe(1);
  });

  it('permits a justified optional non-assert action in a v2 flow', () => {
    const yaml = [
      'tags: [v2]',
      '---',
      '- tapOn:',
      '    id: "dismiss-transient-dialog"',
      '    optional: true # justified: dialog is conditional',
    ].join('\n');
    const flow = mkFlow('flows/v2/conditional-dialog.yaml', yaml);
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(true);
  });

  it('exempts flows not tagged pr-blocking, smoke, or v2', () => {
    const yaml = [
      'tags:',
      '  - nightly',
      '---',
      '- tapOn:',
      '    id: "x"',
      '    optional: true',
    ].join('\n');
    const flow = mkFlow('flows/a.yaml', yaml);
    const result = runC6(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(true);
  });

  it('exempts files on the optional-allowlist entirely', () => {
    const yaml = [
      'tags:',
      '  - smoke',
      '---',
      '- tapOn:',
      '    id: "x"',
      '    optional: true',
    ].join('\n');
    const flow = mkFlow('apps/mobile/e2e/flows/_setup/foo.yaml', yaml);
    const result = runC6(
      baseInputs({
        flows: [flow],
        optionalAllowlist: ['flows/_setup/foo.yaml'],
      }),
    );
    expect(result.passed).toBe(true);
  });

  it('scanOptional counts total and unjustified', () => {
    const yaml = [
      'tags: [smoke]',
      '---',
      '    optional: true  # justified: ok',
      '    optional: true',
    ].join('\n');
    const flow = mkFlow('flows/a.yaml', yaml);
    const result = c6i.scanOptional(flow);
    expect(result.total).toBe(2);
    expect(result.unjustified).toHaveLength(1);
  });
});

describe('C7 — flow tags', () => {
  it('fails when a non-setup flow has no tags block', () => {
    const flow = mkFlow('flows/a.yaml', 'appId: foo\n---\n- launchApp');
    const result = runC7(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(false);
    expect(result.violations[0].reason).toMatch(/no tags/);
  });

  it('passes when tags are present and registry is empty', () => {
    const flow = mkFlow('flows/a.yaml', 'tags:\n  - smoke\n---\n- launchApp');
    const result = runC7(baseInputs({ flows: [flow] }));
    expect(result.passed).toBe(true);
  });

  it('fails on unrecognised tag when registry is populated', () => {
    const flow = mkFlow(
      'flows/a.yaml',
      'tags:\n  - smoke\n  - ghost\n---\n- launchApp',
    );
    const result = runC7(
      baseInputs({
        flows: [flow],
        registryTags: new Set(['smoke', 'learning']),
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0].reason).toMatch(/ghost/);
  });

  it('exempts _setup flows', () => {
    const flow = mkFlow('flows/_setup/foo.yaml', 'appId: x\n---\n- noop');
    const setupFlow = { ...flow, isSetup: true };
    // C7 only walks inputs.flows (non-setup), so setupFlows in input are ignored.
    const result = runC7(baseInputs({ flows: [], setupFlows: [setupFlow] }));
    expect(result.passed).toBe(true);
    expect(result.checkedCount).toBe(0);
  });
});
