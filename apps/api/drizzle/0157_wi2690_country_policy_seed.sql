-- 0157_wi2690_country_policy_seed — WI-2690, seed data for the country policy
-- registry created by 0156_wi2690_country_policy_registry.sql.
--
-- Source: docs/compliance/2026-07-23-13-plus-eea-launch-country-ruling.md
--
-- Every row in this migration seeds launch_status = 'blocked' and
-- legal_verification_status = 'unverified' by design, so the registry fails
-- closed for every jurisdiction until counsel sign-off is recorded as a
-- later effective-dated row.

-- PART A — seed regimes (currently empty).
INSERT INTO "regimes" ("id", "code", "description")
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'US_COPPA', 'United States — COPPA'),
  ('a1000000-0000-4000-8000-000000000016', 'EU_GDPR_16', 'EEA — GDPR Article 8 threshold 16'),
  ('a1000000-0000-4000-8000-000000000015', 'EU_GDPR_15', 'EEA — GDPR Article 8 threshold 15'),
  ('a1000000-0000-4000-8000-000000000014', 'EU_GDPR_14', 'EEA — GDPR Article 8 threshold 14'),
  ('a1000000-0000-4000-8000-000000000013', 'EU_GDPR_13', 'EEA — GDPR Article 8 threshold 13'),
  ('a1000000-0000-4000-8000-000000000098', 'UK_AADC', 'United Kingdom — UK GDPR and Age Appropriate Design Code'),
  ('a1000000-0000-4000-8000-000000000099', 'ROW', 'Rest of world — no cleared regime')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint

-- PART B — seed country_policy_registry: the 30 countries[] entries plus the
-- unitedKingdom entry (31 rows total).
INSERT INTO "country_policy_registry" (
  "id", "country_code", "country_name", "regime_id", "article8_threshold",
  "authorization_form", "launch_status", "launch_block_reason",
  "legal_verification_status", "legal_reviewed_at", "legal_review_valid_until",
  "launch_day_review_required", "processing_location_class", "policy_version",
  "effective_at", "expires_at", "source_provenance", "controller_gates"
)
VALUES
  (
    'b2000000-0000-4000-8000-000000000001', 'BE', 'Belgium',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_13'), 13,
    'guardian', 'blocked', 'launch_gates_pending',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Belgian Data Protection Authority — consent", "url": "https://www.dataprotectionauthority.be/professioneel/avg/rechtsgronden/toestemming", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000002', 'EE', 'Estonia',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_13'), 13,
    'guardian', 'blocked', 'launch_gates_pending',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Personal Data Protection Act §8, current consolidated Riigi Teataja text", "url": "https://www.riigiteataja.ee/en/eli/507112023002/consolide", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000003', 'FI', 'Finland',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_13'), 13,
    'guardian', 'blocked', 'launch_gates_pending',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Data Protection Act §5, Finlex", "url": "https://www.finlex.fi/en/legislation/2018/1050", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000004', 'IS', 'Iceland',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_13'), 13,
    'guardian', 'blocked', 'launch_gates_pending',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Act 90/2018 Article 10, current Alþingi law collection", "url": "https://www.althingi.is/lagas/nuna/2018090.html#G10", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000005', 'LV', 'Latvia',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_13'), 13,
    'guardian', 'blocked', 'launch_gates_pending',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Personal Data Processing Law §33, Likumi", "url": "https://likumi.lv/ta/en/en/id/300099-personal-data-processing-law", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000006', 'MT', 'Malta',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_13'), 13,
    'guardian', 'blocked', 'launch_gates_pending',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Malta IDPC — national legislation, including S.L. 586.11", "url": "https://idpc.org.mt/our-office/legislation/", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000007', 'NO', 'Norway',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_13'), 13,
    'guardian', 'blocked', 'launch_gates_pending',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    true, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Personal Data Act §5, Lovdata", "url": "https://lovdata.no/dokument/NLE/lov/2018-06-15-38/%C2%A75", "checkedAt": "2026-07-24T00:00:00Z"}, {"title": "official proposal to raise the threshold to 15", "url": "https://www.regjeringen.no/no/dokumenter/horing-endringer-i-personopplysningsloven-aldersgrense-for-barns-samtykke-ved-bruk-av-informasjonssamfunnstjenester-sosiale-medier-mv/id3114264/", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000008', 'PT', 'Portugal',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_13'), 13,
    'guardian', 'blocked', 'launch_gates_pending',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    true, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Law 58/2019, Diário da República", "url": "https://diariodarepublica.pt/dr/detalhe/lei/58-2019-123815982", "checkedAt": "2026-07-24T00:00:00Z"}, {"title": "official education authority summary", "url": "https://www.dge.mec.pt/node/2941", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000009', 'SE', 'Sweden',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_13'), 13,
    'guardian', 'blocked', 'launch_gates_pending',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Swedish Authority for Privacy Protection — consent", "url": "https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/samtycke/", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000010', 'AT', 'Austria',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_14'), 14,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Austrian DPA decision applying DSG §4(4), RIS", "url": "https://www.ris.bka.gv.at/JudikaturEntscheidung.wxe?Abfrage=Dsk&Dokumentnummer=DSBT_20250211_2024_0_195_679_00", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000011', 'BG', 'Bulgaria',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_14'), 14,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Personal Data Protection Act Article 25c, CPDP", "url": "https://cpdp.bg/en/legislation/personal-data-protection-act/", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000012', 'CY', 'Cyprus',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_14'), 14,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Cyprus DPA — child registration guidance", "url": "https://www.dataprotection.gov.cy/dataprotection/dataprotection.nsf/page1g_gr/page1g_gr?OpenDocument", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000013', 'IT', 'Italy',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_14'), 14,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Privacy Code Article 2-quinquies, Garante", "url": "https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9536089", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000014', 'LT', 'Lithuania',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_14'), 14,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Law on Legal Protection of Personal Data Article 6, e-Seimas", "url": "https://e-seimas.lrs.lt/rs/legalact/TAD/3e1ba58238c711edbf47f0036855e731/", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000015', 'ES', 'Spain',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_14'), 14,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "AEPD FAQ applying Organic Law 3/2018 Article 7", "url": "https://www.aepd.es/preguntas-frecuentes/10-menores-y-educacion/FAQ-1001-cual-es-la-edad-para-que-los-menores-puedan-prestar-consentimiento-para-tratar-sus-datos-personales", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000016', 'CZ', 'Czechia',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_15'), 15,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Act 110/2019 §7, official e-Sbírka", "url": "https://e-sbirka.gov.cz/sb/2019/110?zalozka=text", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000017', 'DK', 'Denmark',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_15'), 15,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Data Protection Act, consolidated 2024 text", "url": "https://www.retsinformation.dk/eli/lta/2024/289", "checkedAt": "2026-07-24T00:00:00Z"}, {"title": "Danish DPA consent guidance", "url": "https://www.datatilsynet.dk/Media/0/C/Samtykke%20%283%29.pdf", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000018', 'FR', 'France',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_15'), 15,
    'joint_child_guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Data Protection Act Article 45, CNIL", "url": "https://www.cnil.fr/fr/le-cadre-national/la-loi-informatique-et-libertes", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000019', 'GR', 'Greece',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_15'), 15,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Law 4624/2019 Article 21, Hellenic DPA", "url": "https://www.dpa.gr/el/polites/prostasia", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000020', 'SI', 'Slovenia',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_15'), 15,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "ZVOP-2 Article 8, official PISRS gazette", "url": "https://pisrs.si/api/uradni-list/objava/u2022163.pdf", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000021', 'HR', 'Croatia',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_16'), 16,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Implementation Act Article 19, Croatian DPA", "url": "https://azop.hr/national-legislation/", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000022', 'DE', 'Germany',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_16'), 16,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "BfDI GDPR/BDSG guide, Article 8", "url": "https://www.bfdi.bund.de/SharedDocs/Downloads/DE/Broschueren/INFO1.pdf?__blob=publicationFile&v=27", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000023', 'HU', 'Hungary',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_16'), 16,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "NAIH GDPR handbook", "url": "https://naih.hu/files/handbook_the_gdpr_made_simpler_for%20smes_eng.pdf", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000024', 'IE', 'Ireland',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_16'), 16,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Irish DPC parental-consent guide", "url": "https://www.dataprotection.ie/sites/default/files/uploads/2023-04/DPC_ChildrensData_ParentalConsent.pdf", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000025', 'LI', 'Liechtenstein',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_16'), 16,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Consolidated Data Protection Act, official legislation portal", "url": "https://www.gesetze.li/konso/2018272000", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000026', 'LU', 'Luxembourg',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_16'), 16,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "CNPD — consent and children", "url": "https://cnpd.public.lu/en/professionnels/obligations/liceite/consentement.html", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000027', 'NL', 'Netherlands',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_16'), 16,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Dutch Government GDPR manual", "url": "https://open.overheid.nl/documenten/ronl-dd12795b-eaa8-4e23-b552-96ef285cb9ad/pdf", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000028', 'PL', 'Poland',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_16'), 16,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Polish UODO — child consent", "url": "https://uodo.gov.pl/pl/493/2261", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000029', 'RO', 'Romania',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_16'), 16,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Romanian DPA FAQ", "url": "https://www.dataprotection.ro/index.jsp?page=IntrebariFrecvente1", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000030', 'SK', 'Slovakia',
    (SELECT "id" FROM "regimes" WHERE "code" = 'EU_GDPR_16'), 16,
    'guardian', 'blocked', 'parental_authorization_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'eea_only', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "Act 18/2018 §15, Slov-Lex", "url": "https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2018/18/?ucinnost=21.05.2026", "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000031', 'GB', 'United Kingdom',
    (SELECT "id" FROM "regimes" WHERE "code" = 'UK_AADC'), 16,
    'guardian', 'blocked', 'uk_legal_review_required',
    'unverified', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z',
    false, 'blocked', '2026-07-24.1',
    '2026-07-24T00:00:00Z', NULL,
    '[{"title": "13+ EEA launch-country ruling 2026-07-23 — the United Kingdom is denylisted; this ruling does not analyse or clear any UK Article 8 threshold. The stored threshold is the most restrictive value and is not a statement of UK law.", "url": null, "checkedAt": "2026-07-24T00:00:00Z"}]'::jsonb,
    '{"externalPrivacyLegalReview": false, "aiActClassification": false, "reliableAgeAndResidence": false, "childTransparency": false, "adultCommercialRelationship": false, "countryAllowlist": false, "operationalRightsAndIncidents": false, "launchDayLegalRefresh": false}'::jsonb
  )
ON CONFLICT ("country_code", "effective_at") DO NOTHING;
