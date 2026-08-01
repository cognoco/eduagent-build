import { clerkSetup } from '@clerk/testing/playwright';
import dotenv from 'dotenv';
import path from 'node:path';

import { alignPlaywrightClerkSecret } from './clerk-secret-identity';
import { recordPreloadPhase } from './preload-phase';

type ClerkEnvironment = Record<string, string | undefined>;

export function resolveClerkPublishableKey(env: ClerkEnvironment): string {
  const explicitKey = env.CLERK_PUBLISHABLE_KEY?.trim();
  const expoPublicKey = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

  if (!explicitKey && !expoPublicKey) {
    throw new Error(
      'Clerk publishable key is required for Playwright global setup. ' +
        'Set CLERK_PUBLISHABLE_KEY or EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY.',
    );
  }

  if (explicitKey && expoPublicKey && explicitKey !== expoPublicKey) {
    throw new Error(
      'CLERK_PUBLISHABLE_KEY and EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY must match for Playwright global setup.',
    );
  }

  return explicitKey || expoPublicKey || '';
}

export default async function globalSetup() {
  recordPreloadPhase('global-setup-started');
  try {
    dotenv.config({
      path: path.join(process.cwd(), 'apps', 'mobile', '.env.local'),
    });
    alignPlaywrightClerkSecret(process.env);
    process.env.CLERK_PUBLISHABLE_KEY = resolveClerkPublishableKey(process.env);
    await clerkSetup();
    recordPreloadPhase('global-setup-completed');
  } catch (error) {
    recordPreloadPhase('global-setup-failed');
    throw error;
  }
}
