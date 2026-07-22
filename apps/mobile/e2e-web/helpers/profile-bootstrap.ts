import type { Page } from '@playwright/test';
import type { ProfileListResponse } from '@eduagent/schemas';

import { readSeedData } from './seed-data';

export const PROFILE_BOOTSTRAP_GLOB = '**/v1/profiles**';

const PROFILE_FIXTURE_ISO = '2026-07-22T00:00:00.000Z';

export async function installSeededProfileBootstrap(
  page: Page,
  scenarioKey = 'solo-learner',
): Promise<void> {
  const seed = await readSeedData(scenarioKey);
  const response = {
    profiles: [
      {
        id: seed.profileId,
        displayName: 'Seeded E2E Profile',
        avatarUrl: null,
        birthYear: 1990,
        birthMonth: null,
        birthDay: null,
        location: null,
        isOwner: true,
        hasPremiumLlm: false,
        defaultAppContext: null,
        hasFamilyLinks: scenarioKey === 'owner-with-children',
        conversationLanguage: 'en',
        pronouns: null,
        consentStatus: null,
        linkCreatedAt: null,
        createdAt: PROFILE_FIXTURE_ISO,
        updatedAt: PROFILE_FIXTURE_ISO,
      },
    ],
    needsAdultConsent: false,
  } satisfies ProfileListResponse;

  await page.route(PROFILE_BOOTSTRAP_GLOB, async (route) => {
    const request = route.request();
    if (
      request.method() !== 'GET' ||
      new URL(request.url()).pathname !== '/v1/profiles'
    ) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}
