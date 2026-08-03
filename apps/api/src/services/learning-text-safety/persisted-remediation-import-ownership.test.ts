import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const safetyDir = __dirname;

function source(name: string): string {
  return readFileSync(resolve(safetyDir, name), 'utf8');
}

describe('persisted remediation import ownership [WI-3077]', () => {
  it('keeps shared field definitions outside the apply-to-surface dependency edge', () => {
    const memory = source('persisted-remediation-memory.ts');
    const profile = source('persisted-remediation-profile.ts');

    expect(memory).toContain('REDACTED_PLACEHOLDER,\n  type FieldText');
    expect(memory).toContain('type SurfaceRemediationReport,');
    expect(memory).not.toContain("from './persisted-remediation-apply'");
    expect(profile).toContain('SurfaceRemediationReport,');
    expect(profile).not.toContain("from './persisted-remediation-apply'");
  });
});
