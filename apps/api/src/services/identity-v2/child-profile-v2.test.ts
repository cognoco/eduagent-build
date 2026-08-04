// ---------------------------------------------------------------------------
// [WI-3019] createChildProfileV2 — the writer-level fail-closed minimum-age
// floor must stay wired, and must stay AHEAD of the first write.
//
// profileCreateSchema requires birthMonth/birthDay once birthYear reaches the
// floor year, so the ROUTE never hands a year-only floor-year payload to this
// writer. isBelowMinimumAgeAtCreation is wired in here as defence-in-depth for
// a caller that reaches the writer WITHOUT passing through zValidator, and the
// attack that layer exists to stop is "first layer bypassed".
//
// The behavioural break test for that bypass — calling createChildProfileV2
// directly with a year-only floor-year payload and asserting
// ProfileValidationError plus no rows — lives in
// child-profile-v2.integration.test.ts and needs a real database, because this
// writer evaluates the floor INSIDE its transaction, after the subscription and
// owner lookups. (Its twin in identity-graph.ts evaluates the floor before
// opening a transaction, which is why that one has a DB-free break test in
// identity-graph.test.ts.)
//
// This file is the DB-free half: a source-order guard in the same style as the
// [WI-2788] erasure-fence check in identity-graph.test.ts. It cannot prove the
// rejection behaviour, but it does fail the moment the guard is removed,
// renamed, or reordered behind the first write — which is the regression this
// defence-in-depth layer is most likely to suffer.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { join } from 'path';

function createChildSource(): string {
  const source = readFileSync(join(__dirname, 'child-profile-v2.ts'), 'utf8');
  const start = source.indexOf('export async function createChildProfileV2(');
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start);
}

describe('[WI-3019] createChildProfileV2 — minimum-age floor wiring', () => {
  it('[BREAK] checks the fail-closed age floor before inserting the child person', () => {
    const body = createChildSource();
    const floorAt = body.indexOf('isBelowMinimumAgeAtCreation(');
    const personInsertAt = body.indexOf('.insert(person)');

    // Guard present at all — reverting to consentCheck.belowMinimumAge makes
    // this -1, which is the red state.
    expect(floorAt).toBeGreaterThanOrEqual(0);
    expect(personInsertAt).toBeGreaterThanOrEqual(0);
    // ...and ahead of the first write, so a rejected child leaves no rows.
    expect(floorAt).toBeLessThan(personInsertAt);
  });

  it('does not gate the floor on the year-only consent fallback', () => {
    // consentCheck still drives consent-type selection and the ageAtGrant audit
    // value, so it legitimately remains in the function. What must NOT come
    // back is belowMinimumAge being the thing that decides the floor: that is
    // the calendar-year fallback which admits a not-yet-13 learner.
    expect(createChildSource()).not.toContain(
      'if (consentCheck.belowMinimumAge)',
    );
  });
});
