-- 0161_wi2850_us_country_policy_seed — WI-2850, seed the United States into the
-- country policy registry created by 0157_wi2690_country_policy_registry.sql
-- and first populated by 0158_wi2690_country_policy_seed.sql.
--
-- Source: docs/compliance/2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md
-- (screen-based allowlist ruling, EEA-13 + US in) and the US launch screen
-- record 2026-07-26 (Route 2 admission, conditional on DPO concurrence).
-- Consent-age threshold ruled operator-side 2026-07-28: 13, the COPPA floor.
--
-- This row seeds launch_status = 'blocked' and legal_verification_status =
-- 'unverified' by design, matching 0158's fail-closed posture: the registry
-- fails closed for the United States until counsel sign-off is recorded as a
-- later effective-dated row. legal_review_valid_until deliberately equals
-- legal_reviewed_at (a zero-length review window): no counsel review has
-- actually been recorded yet, so the row is stale-by-construction and the
-- resolver reports LEGAL_REVIEW_STALE until a real review lands as a newer
-- effective-dated row with a genuine validity horizon. Unlike most 0158 rows,
-- launch_day_review_required is TRUE: the US launch screen record mandates a
-- launch-day KOSA recheck before the country can ever be enabled.
INSERT INTO "country_policy_registry" (
  "id", "country_code", "country_name", "regime_id", "article8_threshold",
  "authorization_form", "launch_status", "launch_block_reason",
  "legal_verification_status", "legal_reviewed_at", "legal_review_valid_until",
  "launch_day_review_required", "processing_location_class", "policy_version",
  "effective_at", "expires_at", "source_provenance", "controller_gates"
)
VALUES
  (
    'b2000000-0000-4000-8000-000000000032', 'US', 'United States',
    (SELECT "id" FROM "regimes" WHERE "code" = 'US_COPPA'), 13,
    'guardian', 'blocked', 'launch_gates_pending',
    'unverified', '2026-07-28T00:00:00Z', '2026-07-28T00:00:00Z',
    true, 'eea_only', '2026-07-28.1',
    '2026-07-28T00:00:00Z', NULL,
    '[{"title": "Children''s Online Privacy Protection Act, 15 U.S.C. §§ 6501–6506 — statutory under-13 line (verifiable parental consent below 13)", "url": "https://www.law.cornell.edu/uscode/text/15/chapter-91", "checkedAt": "2026-07-28T00:00:00Z"}, {"title": "US launch screen record 2026-07-26 (Route 2 admission, conditional on DPO concurrence + launch-day KOSA recheck)", "url": null, "checkedAt": "2026-07-28T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  )
ON CONFLICT ("country_code", "effective_at") DO NOTHING;
