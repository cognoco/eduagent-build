import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { signIn, type SignInOptions } from './auth';
import { buildSeedEmail } from './runtime';
import { seedScenario, type SeedResponse } from './test-seed';
import type { OwnerJourneyPhaseDiagnostics } from './owner-journey-phase-diagnostics';

interface SeedAndSignInOptions extends Omit<
  SignInOptions,
  'email' | 'password'
> {
  scenario: string;
  alias: string;
  diagnostics?: OwnerJourneyPhaseDiagnostics;
}

export async function seedAndSignIn(
  page: Page,
  options: SeedAndSignInOptions,
): Promise<SeedResponse> {
  const suffix = randomBytes(2).toString('hex');
  const seeded = await seedScenario(
    {
      scenario: options.scenario,
      email: buildSeedEmail(`${options.alias}-${suffix}`),
    },
    options.diagnostics,
  );

  await signIn(page, {
    email: seeded.email,
    password: seeded.password,
    landingTestId: options.landingTestId,
    landingPath: options.landingPath,
    activeProfileId: seeded.profileId || undefined,
    diagnostics: options.diagnostics,
    diagnosticReadinessMarker: options.diagnosticReadinessMarker,
  });

  return seeded;
}
