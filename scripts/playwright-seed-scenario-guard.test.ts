import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const repoRoot = join(__dirname, '..');
const guardModulePath = join(__dirname, 'playwright-seed-scenario-guard.ts');

type ProjectInput = {
  name: string;
  dependencies?: string[];
  testMatch: RegExp;
};

type GuardModule = {
  collectSelectedPlaywrightSeedScenarios(input: {
    rootDir: string;
    testDir: string;
    projects: ProjectInput[];
    selectedProjects: string[];
  }): string[];
  assertDeployedSeedScenarioCoverage(input: {
    requiredScenarios: Iterable<string>;
    apiBaseUrl: string;
    headers: Record<string, string>;
    fetchImpl?: typeof fetch;
  }): Promise<void>;
};

function loadGuard(): GuardModule {
  expect(existsSync(guardModulePath)).toBe(true);
  return require(guardModulePath) as GuardModule;
}

function writeFixture(
  root: string,
  relativePath: string,
  source: string,
): void {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, source);
}

function collectShapeScenarios(root: string): string[] {
  const { collectSelectedPlaywrightSeedScenarios } = loadGuard();
  return collectSelectedPlaywrightSeedScenarios({
    rootDir: root,
    testDir: join(root, 'e2e'),
    projects: [{ name: 'shape', testMatch: /shape\.spec\.ts$/ }],
    selectedProjects: ['shape'],
  });
}

describe('[WI-2571] selected Playwright seed-scenario collector', () => {
  let fixtureRoot: string;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'wi-2571-playwright-'));

    writeFixture(
      fixtureRoot,
      'e2e/fixtures/scenarios.ts',
      `
        export const authScenarios = {
          solo: { seedScenario: 'onboarding-complete' },
          family: { seedScenario: 'parent-multi-child' },
        } as const;
        export const optInScenarios = {
          audit: { seedScenario: 'mentor-audit-empty-adult' },
        } as const;
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/test-seed.ts',
      `export async function seedScenario(input: { scenario: string }) { return input; }`,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/seed-and-sign-in.ts',
      `
        import { seedScenario } from './test-seed';
        export async function seedAndSignIn(input: { scenario: string }) {
          return seedScenario({ scenario: input.scenario });
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/auth.setup.ts',
      `
        import { authScenarios } from './fixtures/scenarios';
        import { seedScenario } from './helpers/test-seed';
        for (const scenario of Object.values(authScenarios)) {
          void seedScenario({ scenario: scenario.seedScenario });
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/v2.spec.ts',
      `
        import { seedAndSignIn as establishSession } from './helpers/seed-and-sign-in';
        import { seedScenario as mySeed } from './helpers/test-seed';
        void establishSession({ scenario: 'v2-account-non-owner-child' });
        void establishSession({ scenario: 'v2-returning-learner' });
        void establishSession({ scenario: 'v2-journal-paper-trail' });
        void establishSession({ scenario: 'v2-account-non-owner-child' });
        void establishSession({ scenario: 'aliased-selected-scenario' });
        void mySeed({ scenario: 'direct-aliased-scenario' });
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/opt-in.spec.ts',
      `
        import { optInScenarios } from './fixtures/scenarios';
        import { seedScenario } from './helpers/test-seed';
        void seedScenario({ scenario: optInScenarios.audit.seedScenario });
      `,
    );
  });

  afterEach(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  it('includes setup/import closure and direct calls, deduplicates, and excludes an unselected opt-in project', () => {
    const { collectSelectedPlaywrightSeedScenarios } = loadGuard();

    expect(
      collectSelectedPlaywrightSeedScenarios({
        rootDir: fixtureRoot,
        testDir: join(fixtureRoot, 'e2e'),
        projects: [
          { name: 'setup', testMatch: /auth\.setup\.ts$/ },
          {
            name: 'v2-release',
            dependencies: ['setup'],
            testMatch: /v2\.spec\.ts$/,
          },
          { name: 'opt-in', testMatch: /opt-in\.spec\.ts$/ },
        ],
        selectedProjects: ['v2-release'],
      }),
    ).toEqual([
      'aliased-selected-scenario',
      'direct-aliased-scenario',
      'onboarding-complete',
      'parent-multi-child',
      'v2-account-non-owner-child',
      'v2-journal-paper-trail',
      'v2-returning-learner',
    ]);
  });

  it('resolves default-imported wrappers exported as declarations and identifiers', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/default-declaration.ts',
      `
        import { seedScenario } from './test-seed';
        export default async function seedWithDefaultDeclaration(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/default-identifier.ts',
      `
        import { seedScenario } from './test-seed';
        const seedWithDefaultIdentifier = async (input: { scenario: string }) =>
          seedScenario(input);
        export default seedWithDefaultIdentifier;
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import seedWithDeclaration from './helpers/default-declaration';
        import seedWithIdentifier from './helpers/default-identifier';
        void seedWithDeclaration({ scenario: 'default-declaration-scenario' });
        void seedWithIdentifier({ scenario: 'default-identifier-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'default-declaration-scenario',
      'default-identifier-scenario',
    ]);
  });

  it('resolves an anonymous default-exported wrapper expression', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/default-expression.ts',
      `
        import { seedScenario } from './test-seed';
        export default async (input: { scenario: string }) => seedScenario(input);
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import seedWithDefaultExpression from './helpers/default-expression';
        void seedWithDefaultExpression({ scenario: 'default-expression-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'default-expression-scenario',
    ]);
  });

  it('resolves a parenthesized anonymous default-exported wrapper expression', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/parenthesized-default-expression.ts',
      `
        import { seedScenario } from './test-seed';
        export default (async (input: { scenario: string }) => seedScenario(input));
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import seedWithParenthesizedDefault from './helpers/parenthesized-default-expression';
        void seedWithParenthesizedDefault({
          scenario: 'parenthesized-default-expression-scenario',
        });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'parenthesized-default-expression-scenario',
    ]);
  });

  it('includes top-level seed side effects from value-imported and re-exported modules', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/value-import-runtime.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 'value-import-top-level-scenario' });
        export async function valueImportWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/re-export-runtime.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 're-export-top-level-scenario' });
        export async function reExportWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/runtime-barrel.ts',
      `export { reExportWrapper } from './re-export-runtime';`,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import { valueImportWrapper } from './helpers/value-import-runtime';
        import { reExportWrapper } from './helpers/runtime-barrel';
        void valueImportWrapper({ scenario: 'value-import-selected-scenario' });
        void reExportWrapper({ scenario: 're-export-selected-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      're-export-selected-scenario',
      're-export-top-level-scenario',
      'value-import-selected-scenario',
      'value-import-top-level-scenario',
    ]);
  });

  it('includes immediately invoked arrow and function-expression bodies during module evaluation', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/runtime-iifes.ts',
      `
        import { seedScenario } from './test-seed';
        void (() => {
          seedScenario({ scenario: 'runtime-arrow-iife-scenario' });
        })();
        void (function () {
          seedScenario({ scenario: 'runtime-function-iife-scenario' });
        })();
        void (() => {
          void (function () {
            seedScenario({ scenario: 'runtime-nested-iife-scenario' });
          })();
        })();
        export const runtimeIifeMarker = true;
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import { runtimeIifeMarker } from './helpers/runtime-iifes';
        void runtimeIifeMarker;
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'runtime-arrow-iife-scenario',
      'runtime-function-iife-scenario',
      'runtime-nested-iife-scenario',
    ]);
  });

  it('includes class static runtime effects without unused method bodies', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/runtime-classes.ts',
      `
        import { seedScenario } from './test-seed';
        export class UnreferencedRuntimeClass {
          static initialized = seedScenario({
            scenario: 'unreferenced-class-static-initializer-scenario',
          });
          static {
            seedScenario({
              scenario: 'unreferenced-class-static-block-scenario',
            });
          }
          unusedInstanceMethod() {
            return seedScenario({
              scenario: 'unreferenced-class-instance-method-scenario',
            });
          }
        }
        export class ReferencedRuntimeClass {
          instanceInitialized = seedScenario({
            scenario: 'referenced-class-instance-initializer-scenario',
          });
          static initialized = seedScenario({
            scenario: 'referenced-class-static-initializer-scenario',
          });
          static unusedArrow = () =>
            seedScenario({
              scenario: 'referenced-class-static-arrow-body-scenario',
            });
          static {
            seedScenario({
              scenario: 'referenced-class-static-block-scenario',
            });
          }
          unusedInstanceMethod() {
            return seedScenario({
              scenario: 'referenced-class-instance-method-scenario',
            });
          }
          static unusedStaticMethod() {
            return seedScenario({
              scenario: 'referenced-class-static-method-scenario',
            });
          }
          static calledStaticMethod() {
            return seedScenario({
              scenario: 'referenced-class-called-static-method-scenario',
            });
          }
        }
        export const runtimeClassMarker = true;
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import {
          ReferencedRuntimeClass,
          runtimeClassMarker,
        } from './helpers/runtime-classes';
        void ReferencedRuntimeClass.calledStaticMethod();
        void ReferencedRuntimeClass;
        void runtimeClassMarker;
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'referenced-class-called-static-method-scenario',
      'referenced-class-static-block-scenario',
      'referenced-class-static-initializer-scenario',
      'unreferenced-class-static-block-scenario',
      'unreferenced-class-static-initializer-scenario',
    ]);
  });

  it('preserves side-effect static import closure', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/side-effect-fixture.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 'side-effect-call-scenario' });
        export const sideEffectRecord = {
          seedScenario: 'side-effect-record-scenario',
        };
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `import './helpers/side-effect-fixture';`,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'side-effect-call-scenario',
      'side-effect-record-scenario',
    ]);
  });

  it('excludes seed calls inside unused exports of side-effect-imported modules', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/side-effect-runtime-only.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 'side-effect-runtime-scenario' });
        export async function unusedSeedWrapper() {
          return seedScenario({ scenario: 'unused-export-body-scenario' });
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `import './helpers/side-effect-runtime-only';`,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'side-effect-runtime-scenario',
    ]);
  });

  it('excludes wrappers that are imported or referenced but never called', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/unused-runtime-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function unusedRuntimeWrapper() {
          return seedScenario({ scenario: 'unused-runtime-reference-scenario' });
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/runtime-reference-only.ts',
      `
        import { seedScenario } from './test-seed';
        import { unusedRuntimeWrapper } from './unused-runtime-wrapper';
        void seedScenario({ scenario: 'runtime-reference-control-scenario' });
        const unused = unusedRuntimeWrapper;
        void unused;
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/unused-selected-import-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function unusedSelectedImportWrapper() {
          return seedScenario({ scenario: 'unused-selected-import-scenario' });
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import './helpers/runtime-reference-only';
        import { unusedSelectedImportWrapper } from './helpers/unused-selected-import-wrapper';
        void unusedSelectedImportWrapper;
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'runtime-reference-control-scenario',
    ]);
  });

  it('excludes runtime closure reachable only through type-only import and re-export edges', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/type-import-register.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 'type-import-erased-scenario' });
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/type-import-source.ts',
      `
        import './type-import-register';
        export interface ImportedShape { scenario: string }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/named-type-import-register.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 'named-type-import-erased-scenario' });
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/named-type-import-source.ts',
      `
        import './named-type-import-register';
        export interface NamedImportedShape { scenario: string }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/type-export-register.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 'type-re-export-erased-scenario' });
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/type-export-source.ts',
      `
        import './type-export-register';
        export interface ReExportedShape { scenario: string }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/named-type-export-register.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 'named-type-re-export-erased-scenario' });
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/named-type-export-source.ts',
      `
        import './named-type-export-register';
        export interface NamedReExportedShape { scenario: string }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/type-edge-runtime-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function runtimeWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/type-edge-barrel.ts',
      `
        export { runtimeWrapper } from './type-edge-runtime-wrapper';
        export type { ReExportedShape } from './type-export-source';
        export { type NamedReExportedShape } from './named-type-export-source';
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import type { ImportedShape } from './helpers/type-import-source';
        import { type NamedImportedShape } from './helpers/named-type-import-source';
        import { runtimeWrapper } from './helpers/type-edge-barrel';
        const imported: ImportedShape | null = null;
        const namedImported: NamedImportedShape | null = null;
        void imported;
        void namedImported;
        void runtimeWrapper({ scenario: 'runtime-value-edge-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'runtime-value-edge-scenario',
    ]);
  });

  it('does not expand erased class symbols while preserving runtime module effects', () => {
    for (const variant of [
      'declaration-import',
      'named-import',
      'declaration-export',
      'named-export',
    ]) {
      writeFixture(
        fixtureRoot,
        `e2e/helpers/${variant}-register.ts`,
        `
          import { seedScenario } from './test-seed';
          void seedScenario({ scenario: '${variant}-register-scenario' });
        `,
      );
      writeFixture(
        fixtureRoot,
        `e2e/helpers/${variant}-class.ts`,
        `
          import './${variant}-register';
          import { seedScenario } from './test-seed';
          export class ${variant
            .split('-')
            .map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
            .join('')}Class {
            unusedMethod() {
              return seedScenario({
                scenario: '${variant}-class-body-scenario',
              });
            }
          }
        `,
      );
    }
    writeFixture(
      fixtureRoot,
      'e2e/helpers/erased-class-barrel.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 'erased-class-runtime-control-scenario' });
        export type {
          DeclarationExportClass,
        } from './declaration-export-class';
        export {
          type NamedExportClass,
        } from './named-export-class';
        export const runtimeMarker = true;
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/erased-enum-register.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 'erased-enum-register-scenario' });
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/erased-enum.ts',
      `
        import './erased-enum-register';
        export enum ErasedEnum { Value = 'value' }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import type {
          DeclarationImportClass,
        } from './helpers/declaration-import-class';
        import {
          type NamedImportClass,
        } from './helpers/named-import-class';
        import type {
          DeclarationExportClass,
          NamedExportClass,
        } from './helpers/erased-class-barrel';
        import type { ErasedEnum } from './helpers/erased-enum';
        import { runtimeMarker } from './helpers/erased-class-barrel';
        type ErasedClasses =
          | DeclarationImportClass
          | NamedImportClass
          | DeclarationExportClass
          | NamedExportClass
          | ErasedEnum;
        void (null as ErasedClasses | null);
        void runtimeMarker;
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'erased-class-runtime-control-scenario',
    ]);
  });

  it('keeps mixed value/type edges and runtime extends separate from erased heritage', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/mixed-runtime-base.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 'mixed-runtime-base-scenario' });
        export class MixedRuntimeBase {}
        export interface MixedRuntimeType {}
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/erased-heritage-register.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 'erased-heritage-scenario' });
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/erased-heritage.ts',
      `
        import './erased-heritage-register';
        export interface ErasedHeritage {}
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/mixed-runtime-derived.ts',
      `
        import {
          MixedRuntimeBase,
          type MixedRuntimeType,
        } from './mixed-runtime-base';
        import type { ErasedHeritage } from './erased-heritage';
        export class MixedRuntimeDerived
          extends MixedRuntimeBase
          implements MixedRuntimeType, ErasedHeritage {}
        export const mixedRuntimeMarker = true;
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import { mixedRuntimeMarker } from './helpers/mixed-runtime-derived';
        void mixedRuntimeMarker;
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'mixed-runtime-base-scenario',
    ]);
  });

  it('preserves side-effect imports owned by a re-export barrel', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/barrel-register.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 'barrel-register-scenario' });
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/barrel-leaf.ts',
      `
        import { seedScenario } from './test-seed';
        export async function barrelWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/barrel-with-side-effect.ts',
      `
        import './barrel-register';
        export { barrelWrapper } from './barrel-leaf';
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import { barrelWrapper } from './helpers/barrel-with-side-effect';
        void barrelWrapper({ scenario: 'barrel-selected-call-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'barrel-register-scenario',
      'barrel-selected-call-scenario',
    ]);
  });

  it('resolves namespace member calls and local export aliases', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/namespace-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function namespaceWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/local-export-alias.ts',
      `
        import { seedScenario } from './test-seed';
        async function internalWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
        export { internalWrapper as publicWrapper };
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import * as namespaceHelpers from './helpers/namespace-wrapper';
        import { publicWrapper } from './helpers/local-export-alias';
        void namespaceHelpers.namespaceWrapper({ scenario: 'namespace-scenario' });
        void publicWrapper({ scenario: 'local-export-alias-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'local-export-alias-scenario',
      'namespace-scenario',
    ]);
  });

  it('resolves bracket and destructured namespace member aliases', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/static-namespace-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function staticNamespaceWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import * as namespaceHelpers from './helpers/static-namespace-wrapper';
        const { staticNamespaceWrapper: selectedWrapper } = namespaceHelpers;
        void namespaceHelpers['staticNamespaceWrapper']({
          scenario: 'namespace-bracket-scenario',
        });
        void selectedWrapper({ scenario: 'namespace-destructured-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'namespace-bracket-scenario',
      'namespace-destructured-scenario',
    ]);
  });

  it('keeps execution and own-property alias boundaries explicit', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/alias-boundaries.ts',
      `
        import { seedScenario } from './test-seed';
        export function wrapper(input: { scenario: string }) {
          const neverCalled = () => seedScenario({ scenario: 'nested-never-called' });
          return seedScenario(input);
        }
        export function own(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import { own, wrapper } from './helpers/alias-boundaries';
        const aliases = { wrapper, own };
        const source = { run: wrapper };
        const spread = { ...source };
        void aliases.own({ scenario: 'shorthand-own-scenario' });
        void spread.run({ scenario: 'spread-out-scenario' });
        void aliases.wrapper({ scenario: 'called-wrapper-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'called-wrapper-scenario',
      'shorthand-own-scenario',
    ]);
  });

  it('excludes computed static class keys while retaining static initializers', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/computed-static.ts',
      `
        import { seedScenario } from './test-seed';
        export class Computed {
          static [seedScenario({ scenario: 'computed-key-out' })] = seedScenario({ scenario: 'computed-value-in' });
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `import { Computed } from './helpers/computed-static'; void Computed;`,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual(['computed-value-in']);
  });

  it('resolves bracket and destructured members of an exported namespace', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/exported-namespace-leaf.ts',
      `
        import { seedScenario } from './test-seed';
        export async function exportedNamespaceWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/exported-namespace-barrel.ts',
      `export * as seedNamespace from './exported-namespace-leaf';`,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import { seedNamespace } from './helpers/exported-namespace-barrel';
        const { exportedNamespaceWrapper: selectedWrapper } = seedNamespace;
        void seedNamespace['exportedNamespaceWrapper']({
          scenario: 'exported-namespace-bracket-scenario',
        });
        void selectedWrapper({
          scenario: 'exported-namespace-destructured-scenario',
        });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'exported-namespace-bracket-scenario',
      'exported-namespace-destructured-scenario',
    ]);
  });

  it('resolves named, aliased, default, and star barrel re-exports', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/named-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function namedWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/default-barrel-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export default async function defaultBarrelWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/default-through-barrel.ts',
      `
        import { seedScenario } from './test-seed';
        const defaultThroughBarrel = async (input: { scenario: string }) =>
          seedScenario(input);
        export default defaultThroughBarrel;
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/star-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function starWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/index.ts',
      `
        export { namedWrapper } from './named-wrapper';
        export { namedWrapper as aliasedWrapper } from './named-wrapper';
        export { default as defaultAliasedWrapper } from './default-barrel-wrapper';
        export { default } from './default-through-barrel';
        export * from './star-wrapper';
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import defaultThroughBarrel, {
          aliasedWrapper,
          defaultAliasedWrapper,
          namedWrapper,
          starWrapper,
        } from './helpers';
        void namedWrapper({ scenario: 'barrel-named-scenario' });
        void aliasedWrapper({ scenario: 'barrel-aliased-scenario' });
        void defaultAliasedWrapper({ scenario: 'barrel-default-alias-scenario' });
        void defaultThroughBarrel({ scenario: 'barrel-default-scenario' });
        void starWrapper({ scenario: 'barrel-star-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'barrel-aliased-scenario',
      'barrel-default-alias-scenario',
      'barrel-default-scenario',
      'barrel-named-scenario',
      'barrel-star-scenario',
    ]);
  });

  it('resolves multi-hop aliased wrapper and re-export chains', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/leaf-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function leafWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/middle-wrapper.ts',
      `
        import { leafWrapper as callLeaf } from './leaf-wrapper';
        export async function middleWrapper(input: { scenario: string }) {
          return callLeaf(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/first-barrel.ts',
      `export { middleWrapper as firstHop } from './middle-wrapper';`,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/index.ts',
      `export { firstHop as chainedWrapper } from './first-barrel';`,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import { chainedWrapper as selectedWrapper } from './helpers';
        void selectedWrapper({ scenario: 'multi-hop-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual(['multi-hop-scenario']);
  });

  it('resolves local callable aliases and parenthesized default identifier exports', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/local-import-alias-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function importedAliasWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/local-seed-alias-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        const localSeedAlias = seedScenario;
        export async function localSeedAliasWrapper(input: { scenario: string }) {
          return localSeedAlias(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/local-namespace-alias-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function namespaceAliasWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/parenthesized-default-identifier.ts',
      `
        import { seedScenario } from './test-seed';
        const defaultIdentifierWrapper = async (input: { scenario: string }) =>
          seedScenario(input);
        export default (defaultIdentifierWrapper);
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import { importedAliasWrapper } from './helpers/local-import-alias-wrapper';
        import { localSeedAliasWrapper } from './helpers/local-seed-alias-wrapper';
        import * as namespaceHelpers from './helpers/local-namespace-alias-wrapper';
        import defaultIdentifierWrapper from './helpers/parenthesized-default-identifier';
        const localImportedAlias = importedAliasWrapper;
        const localNamespaceAlias = namespaceHelpers['namespaceAliasWrapper'];
        void localImportedAlias({ scenario: 'local-import-alias-scenario' });
        void localSeedAliasWrapper({ scenario: 'local-seed-alias-scenario' });
        void localNamespaceAlias({ scenario: 'local-namespace-alias-scenario' });
        void defaultIdentifierWrapper({
          scenario: 'parenthesized-default-identifier-scenario',
        });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'local-import-alias-scenario',
      'local-namespace-alias-scenario',
      'local-seed-alias-scenario',
      'parenthesized-default-identifier-scenario',
    ]);
  });

  it('resolves callable members through local namespace alias chains', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/namespace-alias-chain-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function namespaceAliasChainWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import * as namespaceHelpers from './helpers/namespace-alias-chain-wrapper';
        const dotNamespaceAlias = namespaceHelpers;
        const dotWrapper = dotNamespaceAlias.namespaceAliasChainWrapper;
        const bracketNamespaceAlias = namespaceHelpers;
        const bracketWrapper =
          bracketNamespaceAlias['namespaceAliasChainWrapper'];
        void dotWrapper({ scenario: 'namespace-alias-dot-scenario' });
        void bracketWrapper({ scenario: 'namespace-alias-bracket-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'namespace-alias-bracket-scenario',
      'namespace-alias-dot-scenario',
    ]);
  });

  it('resolves local object-property seed aliases for dot and bracket calls', () => {
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import { seedScenario } from './helpers/test-seed';
        const seedAliases = {
          dot: seedScenario,
          bracket: seedScenario,
        };
        void seedAliases.dot({ scenario: 'object-alias-dot-scenario' });
        void seedAliases['bracket']({
          scenario: 'object-alias-bracket-scenario',
        });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'object-alias-bracket-scenario',
      'object-alias-dot-scenario',
    ]);
  });
});

describe('[WI-2571] deployed seed-catalog assertion', () => {
  const apiBaseUrl = 'https://api-stg.example.test';
  const headers = { 'X-Test-Secret': 'do-not-log-this-secret' };

  it('permits execution when the deployed catalog covers every selected scenario', async () => {
    const { assertDeployedSeedScenarioCoverage } = loadGuard();

    await expect(
      assertDeployedSeedScenarioCoverage({
        requiredScenarios: ['onboarding-complete', 'parent-multi-child'],
        apiBaseUrl,
        headers,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              scenarios: ['parent-multi-child', 'onboarding-complete'],
            }),
            { status: 200 },
          ),
      }),
    ).resolves.toBeUndefined();
  });

  it('fails before execution with sorted named mismatches and no credential disclosure', async () => {
    const { assertDeployedSeedScenarioCoverage } = loadGuard();

    const promise = assertDeployedSeedScenarioCoverage({
      requiredScenarios: [
        'v2-returning-learner',
        'v2-account-non-owner-child',
        'v2-journal-paper-trail',
      ],
      apiBaseUrl,
      headers,
      fetchImpl: async () =>
        new Response(JSON.stringify({ scenarios: [] }), { status: 200 }),
    });

    await expect(promise).rejects.toThrow(
      `${apiBaseUrl}: missing scenarios: v2-account-non-owner-child, v2-journal-paper-trail, v2-returning-learner`,
    );
    await expect(promise).rejects.not.toThrow(headers['X-Test-Secret']);
  });

  it.each([
    [
      'unavailable endpoint',
      async () => {
        throw new Error('socket details that must stay private');
      },
      'catalog request failed',
    ],
    [
      'malformed catalog',
      async () => new Response(JSON.stringify({ scenarios: [42] })),
      'catalog response was malformed',
    ],
  ])('fails safely for an %s', async (_case, fetchImpl, expected) => {
    const { assertDeployedSeedScenarioCoverage } = loadGuard();

    const promise = assertDeployedSeedScenarioCoverage({
      requiredScenarios: ['onboarding-complete'],
      apiBaseUrl,
      headers,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(promise).rejects.toThrow(`${apiBaseUrl}: ${expected}`);
    await expect(promise).rejects.not.toThrow(headers['X-Test-Secret']);
    await expect(promise).rejects.not.toThrow('socket details');
  });
});

describe('[WI-2571] E2E workflow seed-catalog guard', () => {
  it('runs one union guard before the first selected suite in the required smoke job', () => {
    const workflow = parseYaml(
      require('node:fs').readFileSync(
        join(repoRoot, '.github', 'workflows', 'e2e-web.yml'),
        'utf8',
      ),
    ) as {
      jobs: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
    };
    const runSmoke = workflow.jobs['run-smoke'];
    const scripts = (runSmoke?.steps ?? [])
      .map((step) => String(step.run ?? ''))
      .join('\n');
    const guardIndex = scripts.indexOf('playwright-seed-scenario-guard.ts');

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(
      scripts.indexOf('pnpm run test:e2e:web:v2'),
    );
    for (const project of [
      'v2-release',
      'smoke-auth',
      'smoke-learner',
      'smoke-parent',
      'smoke-accessibility',
      'smoke-transport-recovery',
    ]) {
      expect(scripts).toContain(`--project=${project}`);
    }
  });
});
