import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const navShellSource = readFileSync(
  join(__dirname, '..', 'flows', 'v2', 'nav-shell.spec.ts'),
  'utf8',
);
const selfLearningJourneySource = readFileSync(
  join(
    __dirname,
    '..',
    'flows',
    'journeys',
    'j32-supporter-self-learning-doorway.spec.ts',
  ),
  'utf8',
);

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

function expectTestIdAssertion(
  source: string,
  testId: string,
  matcher: 'toBeVisible' | 'not.toBeVisible' | 'toHaveCount',
  argument = '',
): void {
  const escapedTestId = testId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedArgument = argument.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  expect(source).toMatch(
    new RegExp(
      `expect\\(\\s*page\\.getByTestId\\('${escapedTestId}'\\)\\s*,?\\s*\\)\\.${matcher}\\(\\s*${escapedArgument}`,
    ),
  );
}

describe('[WI-2822] supporter doorway nav-shell contract', () => {
  it('keeps the doorway visible on the initial and returned no-Me Support Hub surfaces', () => {
    const initialSupportHub = section(
      navShellSource,
      'WI-2822 surface: support-hub/no-Me — initial',
      'One real cross-tab navigation away',
    );
    const returnedSupportHub = section(
      navShellSource,
      'Real browser Back — returns to the support-hub Mentor surface',
      'Second real path: switch into a person scope',
    );

    for (const supportHubSurface of [initialSupportHub, returnedSupportHub]) {
      expectTestIdAssertion(
        supportHubSurface,
        'support-hub-mentor-tab',
        'toBeVisible',
      );
      expectTestIdAssertion(
        supportHubSurface,
        'supporter-self-learning-doorway',
        'toBeVisible',
      );
      expectTestIdAssertion(
        supportHubSurface,
        'mentor-screen',
        'toHaveCount',
        '0',
      );
    }
  });

  it('keeps the doorway absent when Me is already an available Support Hub scope', () => {
    const meAvailableSupportHub = section(
      selfLearningJourneySource,
      'The doorway is a first-time entry point only',
      'Switch to Me: the ordinary learner Mentor screen renders',
    );

    expectTestIdAssertion(
      meAvailableSupportHub,
      'supporter-self-learning-doorway',
      'toHaveCount',
      '0',
    );
    expect(meAvailableSupportHub).toContain(
      "const meChipOption = page.getByTestId('scope-chip-option-me');",
    );
    expect(meAvailableSupportHub).toMatch(
      /expect\(meChipOption\)\.toBeVisible\(\)/,
    );
  });

  it('keeps the doorway absent on a person surface', () => {
    const personSurface = section(
      navShellSource,
      'WI-2822 surface: person',
      "await pressableClick(page.getByTestId('tab-journal'));",
    );

    expectTestIdAssertion(
      personSurface,
      'person-scope-mentor-tab',
      'toBeVisible',
    );
    expectTestIdAssertion(
      personSurface,
      'supporter-self-learning-doorway',
      'toHaveCount',
      '0',
    );
  });

  it('keeps the Support Hub and doorway absent after entering the Me learner surface', () => {
    const learnerSurface = section(
      navShellSource,
      'WI-2822 surface: Me/learner',
      'WI-2822 contract end',
    );

    expectTestIdAssertion(learnerSurface, 'mentor-screen', 'toBeVisible');
    expectTestIdAssertion(
      learnerSurface,
      'support-hub-mentor-tab',
      'not.toBeVisible',
    );
    expectTestIdAssertion(
      learnerSurface,
      'supporter-self-learning-doorway',
      'toHaveCount',
      '0',
    );
  });

  it('retains both Back actions and their positive and negative surface oracles', () => {
    const firstBack = section(
      navShellSource,
      'Real browser Back — returns to the support-hub Mentor surface',
      'Second real path: switch into a person scope',
    );
    const secondBack = section(
      navShellSource,
      'then Back. Same defined-behavior claim',
      'WI-2822 surface: Me/learner',
    );

    expect(navShellSource.match(/await page\.goBack\(\);/g)).toHaveLength(2);
    for (const backSurface of [firstBack, secondBack]) {
      expectTestIdAssertion(
        backSurface,
        'support-hub-mentor-tab',
        'toBeVisible',
      );
      expectTestIdAssertion(backSurface, 'mentor-screen', 'toHaveCount', '0');
    }
    expect(secondBack).toContain('person-scope-journal');
  });
});
