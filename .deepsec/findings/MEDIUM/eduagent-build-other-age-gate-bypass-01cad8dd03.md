# [MEDIUM] Minimum-age enforcement uses birth year instead of full birth date

**File:** [`apps/mobile/src/app/create-profile.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/create-profile.tsx#L157-L163) (lines 157, 163)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-age-gate-bypass`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

The UI collects a full birth date but sends only birthYear to the API. The server-side consent check uses currentYear - birthYear, so a child who is still 10 but turns 11 later in the calendar year is treated as 11 and can avoid the parental-consent flow.

## Recommendation

Send and validate the full birth date on the server, and enforce the exact minimum age using month and day. Client-side validation can mirror this, but the API must be authoritative.

## Revalidation

**Verdict:** true-positive

The specific mechanism the finding describes ('UI collects a full birth date but sends only birthYear') is already remediated: the client now sends birthYear+birthMonth+birthDay (create-profile.tsx:261-263, WI-297), and the server computes exact age via checkConsentRequiredFromDate → calculateAgeFromParts (services/consent.ts:192-236), which subtracts 1 when the birthday hasn't occurred this year, correctly rejecting a still-10-year-old as belowMinimumAge. HOWEVER, the residual gap the finding's recommendation targets ('the API must be authoritative') is NOT closed: birthMonth/birthDay are .optional() in profileCreateSchema (packages/schemas/src/profiles.ts:63-64), and calculateAgeFromParts falls back to year-only (currentYear - birthYear) when they are absent. birthYearSchema's floor only requires birthYear ≤ currentYear-11, so a crafted POST /v1/profiles that omits month/day for a child born in currentYear-11 whose birthday is later this year is computed as age 11 and admitted, bypassing the 11+ minimum-age gate by up to ~1 year. The exploit requires a non-UI request and only affects the actor's own/child profile (a self-directed, narrow, boundary-only compliance bypass), so this sits at the low end of MEDIUM, but the server is genuinely not authoritative on exact age. Fix: require month/day (or reject the year-only path) at consent-boundary ages.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-28)
