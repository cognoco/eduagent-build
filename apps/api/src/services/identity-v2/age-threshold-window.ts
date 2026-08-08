/**
 * [WI-2745] Which birth dates can have crossed an age threshold inside a given
 * time window.
 *
 * This exists so the scheduled re-evaluation does NOT table-scan `person` daily.
 * A person with birth date B reaches age N at B + N years, so they cross N
 * inside the window `(start, end]` exactly when:
 *
 *     start < B + N <= end       ⟺       start - N < B <= end - N
 *
 * which is a bounded range per threshold, servable from `person_birth_date_idx`.
 */

/**
 * Every age at which a decision can change. The union of the global floors
 * (`PROFILE_MINIMUM_AGE` 13, `PARENT_ACCOUNT_MINIMUM_AGE` 18) and the
 * regime-configurable Article 8 threshold, which `countryPolicyDecisionSchema`
 * constrains to 13..16.
 *
 * Deliberately a UNION rather than a per-regime lookup: the scan must not need
 * to know a person's regime before deciding whether to look at them, or it
 * would have to resolve policy for everyone — which is the table scan this
 * exists to avoid. Over-selecting a few candidates is cheap; the classifier
 * decides whether anything actually changed.
 */
export const AGE_DECISION_THRESHOLDS: readonly number[] = [13, 14, 15, 16, 18];

export interface BirthDateWindow {
  /** The age reached inside the time window. */
  threshold: number;
  /** Exclusive lower bound on birth date. */
  after: Date;
  /** Inclusive upper bound on birth date. */
  throughInclusive: Date;
}

/**
 * Shift a UTC instant back by whole years.
 *
 * LEAP-DAY BEHAVIOUR IS DELIBERATE AND LOAD-BEARING. `setUTCFullYear` rolls
 * 29 February onto 1 March in a non-leap year, so a person born on a leap day
 * is treated as reaching their birthday on 1 March in common years. That is the
 * conservative direction: it never counts someone as OLDER a day early, which
 * on this axis is the direction that could relax a guardian requirement before
 * it is legally due. Pinned by test rather than left to the reader.
 */
function minusYearsUtc(instant: Date, years: number): Date {
  const shifted = new Date(instant.getTime());
  shifted.setUTCFullYear(shifted.getUTCFullYear() - years);
  return shifted;
}

/**
 * The birth-date ranges to query, one per threshold.
 *
 * `windowStart` is exclusive and `windowEnd` inclusive so that consecutive
 * windows tile without gap or overlap: a crossing lands in exactly one window
 * when the runs are contiguous. Callers that overlap their windows on purpose
 * (to survive a missed run) rely on event-level de-duplication rather than on
 * this function pretending the overlap did not happen.
 */
export function ageThresholdBirthDateWindows(
  windowStart: Date,
  windowEnd: Date,
): BirthDateWindow[] {
  if (windowEnd.getTime() <= windowStart.getTime()) {
    // An empty or inverted window selects nobody. Returning [] rather than
    // throwing keeps a clock skew or a duplicate trigger from failing the run:
    // the correct behaviour for "no time passed" is "nothing crossed".
    return [];
  }

  return AGE_DECISION_THRESHOLDS.map((threshold) => ({
    threshold,
    after: minusYearsUtc(windowStart, threshold),
    throughInclusive: minusYearsUtc(windowEnd, threshold),
  }));
}
