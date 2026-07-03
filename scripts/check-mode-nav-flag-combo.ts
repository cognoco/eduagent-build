// R9 forward-only ratchet (WI-1304, WS-37 M1 "Seam Hardening"): pins the
// build-time MODE_NAV_V0/V1/V2 flag triple to exactly the 3 sanctioned rows
// from the fable audit (_quartet/working/program/fable-audit-prep-2026-07-02/
// 08-convergence-spine.md:118-126):
//   Config T  — V0=off, V1=on,  V2=on  (sanctioned target)
//   Config F  — V0=off, V1=on,  V2=off (sanctioned fallback)
//   Legacy    — V0=on,  V1=off, V2=off (sanctioned only until M5)
// Any other triple is banned — especially V2=on/V1=off: use-navigation-
// contract.ts gates the subscription *fetch* on V1_ENABLED only, so that
// combo renders V2 tabs backed by a subscription hook that was never
// enabled (the R9 dead-zone, confirmed in code).
//
// Two layers:
//   1. classifyCombo() — a pure allowlist check against exactly 3 sanctioned
//      triples. This is the AC's core deliverable; unit-tested directly.
//   2. A scanner over real declared build-time config (apps/mobile/eas.json
//      build profiles + literal env values in .github/workflows/ci.yml) so
//      the ratchet has teeth against actual mis-builds, not just synthetic
//      inputs.
//
// Ratchet model (mirrors scripts/check-no-gemini-runtime.ts): existing
// non-sanctioned sites are grandfathered in
// scripts/mode-nav-flag-combo-baseline.json, keyed on {site, v0, v1, v2} —
// an EXACT combo pin, not just the site. Flipping a baselined site to a
// *different* combo (sanctioned or a different banned one) drops out of the
// baseline match, so drift toward the dead zone still fails CI. This guard
// does not edit eas.json/ci.yml itself — the 3 grandfathered sites are a
// separate, routed finding (nav-owning workstream, mentor-is-the-app §13 /
// V0-retirement ruling); this ratchet only stops new regressions.
//
// CLI usage:
//   pnpm exec tsx scripts/check-mode-nav-flag-combo.ts          # check
//   pnpm exec tsx scripts/check-mode-nav-flag-combo.ts --accept # rewrite baseline
//
// Exit codes: 0 clean, 1 new/unbaselined violations, 2 no scan targets found.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';

const REPO_ROOT = path.resolve(__dirname, '..');
const EAS_JSON_PATH = path.resolve(REPO_ROOT, 'apps/mobile/eas.json');
const CI_YML_PATH = path.resolve(REPO_ROOT, '.github/workflows/ci.yml');
const BASELINE_PATH = path.resolve(
  __dirname,
  'mode-nav-flag-combo-baseline.json',
);

export interface FlagCombo {
  v0: boolean;
  v1: boolean;
  v2: boolean;
}

export type ComboClass = 'config-t' | 'config-f' | 'legacy' | 'banned';

const SANCTIONED: Record<Exclude<ComboClass, 'banned'>, FlagCombo> = {
  'config-t': { v0: false, v1: true, v2: true },
  'config-f': { v0: false, v1: true, v2: false },
  legacy: { v0: true, v1: false, v2: false },
};

function comboKey(c: FlagCombo): string {
  return `${c.v0}:${c.v1}:${c.v2}`;
}

const SANCTIONED_BY_KEY = new Map<string, Exclude<ComboClass, 'banned'>>(
  (
    Object.entries(SANCTIONED) as [Exclude<ComboClass, 'banned'>, FlagCombo][]
  ).map(([cls, combo]) => [comboKey(combo), cls]),
);

/** Pure allowlist check — exactly the 3 sanctioned rows, nothing else. */
export function classifyCombo(combo: FlagCombo): ComboClass {
  return SANCTIONED_BY_KEY.get(comboKey(combo)) ?? 'banned';
}

export interface Occurrence {
  site: string;
  combo: FlagCombo;
  cls: ComboClass;
}

export interface BaselineEntry extends FlagCombo {
  site: string;
}

function toBool(value: unknown): boolean {
  return value === 'true' || value === true;
}

function readCombo(env: Record<string, unknown>): FlagCombo {
  return {
    v0: toBool(env.EXPO_PUBLIC_ENABLE_MODE_NAV),
    v1: toBool(env.EXPO_PUBLIC_ENABLE_MODE_NAV_V1),
    v2: toBool(env.EXPO_PUBLIC_ENABLE_MODE_NAV_V2),
  };
}

function scanEasJson(): Occurrence[] {
  if (!fs.existsSync(EAS_JSON_PATH)) return [];
  const eas = JSON.parse(fs.readFileSync(EAS_JSON_PATH, 'utf8')) as {
    build?: Record<string, { env?: Record<string, unknown> }>;
  };
  const out: Occurrence[] = [];
  for (const [profile, config] of Object.entries(eas.build ?? {})) {
    const combo = readCombo(config.env ?? {});
    const site = `apps/mobile/eas.json:build.${profile}`;
    out.push({ site, combo, cls: classifyCombo(combo) });
  }
  return out;
}

const MODE_NAV_KEYS = [
  'EXPO_PUBLIC_ENABLE_MODE_NAV',
  'EXPO_PUBLIC_ENABLE_MODE_NAV_V1',
  'EXPO_PUBLIC_ENABLE_MODE_NAV_V2',
] as const;

function hasAnyModeNavKey(env: Record<string, unknown> | undefined): boolean {
  return env != null && MODE_NAV_KEYS.some((key) => key in env);
}

function scanCiYml(): Occurrence[] {
  if (!fs.existsSync(CI_YML_PATH)) return [];
  const doc = parseYaml(fs.readFileSync(CI_YML_PATH, 'utf8')) as {
    jobs?: Record<
      string,
      { steps?: { name?: string; env?: Record<string, unknown> }[] }
    >;
  };
  const out: Occurrence[] = [];
  for (const [jobId, job] of Object.entries(doc.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (!hasAnyModeNavKey(step.env)) continue;
      const combo = readCombo(step.env ?? {});
      const site = `.github/workflows/ci.yml:${jobId}:${step.name ?? '(unnamed step)'}`;
      out.push({ site, combo, cls: classifyCombo(combo) });
    }
  }
  return out;
}

export function collectOccurrences(): Occurrence[] {
  return [...scanEasJson(), ...scanCiYml()];
}

function entryKey(e: { site: string } & FlagCombo): string {
  return `${e.site}::${comboKey(e)}`;
}

export interface DiffResult {
  newViolations: Occurrence[];
  staleBaselineEntries: BaselineEntry[];
}

/** Diff the banned occurrences among `current` against the baseline. */
export function diffAgainstBaseline(
  current: Occurrence[],
  baseline: BaselineEntry[],
): DiffResult {
  const banned = current.filter((o) => o.cls === 'banned');
  const baselineSet = new Set(baseline.map(entryKey));
  const newViolations = banned.filter(
    (o) => !baselineSet.has(entryKey({ site: o.site, ...o.combo })),
  );

  const currentBannedSet = new Set(
    banned.map((o) => entryKey({ site: o.site, ...o.combo })),
  );
  const staleBaselineEntries = baseline.filter(
    (b) => !currentBannedSet.has(entryKey(b)),
  );

  return { newViolations, staleBaselineEntries };
}

function loadBaseline(): BaselineEntry[] {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Baseline at ${BASELINE_PATH} must be a JSON array of {site,v0,v1,v2} entries`,
    );
  }
  return parsed as BaselineEntry[];
}

function writeBaseline(occurrences: Occurrence[]): void {
  const dedup: BaselineEntry[] = occurrences
    .filter((o) => o.cls === 'banned')
    .map((o) => ({ site: o.site, ...o.combo }));
  dedup.sort((a, b) => a.site.localeCompare(b.site));
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(dedup, null, 2)}\n`,
    'utf8',
  );
}

function comboLabel(c: FlagCombo): string {
  return `V0=${c.v0} V1=${c.v1} V2=${c.v2}`;
}

function main(): number {
  if (!fs.existsSync(EAS_JSON_PATH) && !fs.existsSync(CI_YML_PATH)) {
    process.stderr.write(
      `mode-nav-flag-combo: no scan targets found (${EAS_JSON_PATH}, ${CI_YML_PATH})\n`,
    );
    return 2;
  }

  const occurrences = collectOccurrences();

  if (process.argv.includes('--accept')) {
    writeBaseline(occurrences);
    const count = occurrences.filter((o) => o.cls === 'banned').length;
    process.stdout.write(
      `mode-nav-flag-combo: baseline written (${count} grandfathered site(s))\n`,
    );
    return 0;
  }

  const baseline = loadBaseline();
  const { newViolations, staleBaselineEntries } = diffAgainstBaseline(
    occurrences,
    baseline,
  );

  if (staleBaselineEntries.length > 0) {
    process.stdout.write(
      `mode-nav-flag-combo: ${staleBaselineEntries.length} baseline entries no longer present (shrink with --accept):\n`,
    );
    for (const e of staleBaselineEntries) {
      process.stdout.write(`  - ${e.site} (${comboLabel(e)})\n`);
    }
  }

  if (newViolations.length === 0) {
    process.stdout.write(
      `mode-nav-flag-combo: clean (${baseline.length} grandfathered, 0 new)\n`,
    );
    return 0;
  }

  process.stderr.write(
    `mode-nav-flag-combo: ${newViolations.length} unsanctioned MODE_NAV flag combo(s) — R9. Sanctioned rows: Config T (V0=off,V1=on,V2=on), Config F (V0=off,V1=on,V2=off), Legacy (V0=on,V1=off,V2=off, pre-M5 only).\n`,
  );
  for (const o of newViolations) {
    process.stderr.write(`  ${o.site}: ${comboLabel(o.combo)}\n`);
  }
  return 1;
}

if (require.main === module) {
  process.exit(main());
}
