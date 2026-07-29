-- 0162_wi2850_us_provenance_cfr312 — WI-2850 rework, in response to
-- code-review finding: AC-2 requires the US row's source_provenance to cite
-- BOTH COPPA authorities — the statute (15 U.S.C. §§ 6501–6506) AND its
-- implementing FTC rule (16 CFR Part 312). 0161 shipped only the statute.
-- 0161 is an immutable applied migration, so this lands as a forward data
-- fix rather than an edit: it replaces the US row's source_provenance with
-- the same two entries (byte-identical, checkedAt unchanged at
-- 2026-07-28T00:00:00Z) plus a third entry for 16 CFR Part 312.
UPDATE "country_policy_registry"
SET "source_provenance" = '[{"title": "Children''s Online Privacy Protection Act, 15 U.S.C. §§ 6501–6506 — statutory under-13 line (verifiable parental consent below 13)", "url": "https://www.law.cornell.edu/uscode/text/15/chapter-91", "checkedAt": "2026-07-28T00:00:00Z"}, {"title": "US launch screen record 2026-07-26 (Route 2 admission, conditional on DPO concurrence + launch-day KOSA recheck)", "url": null, "checkedAt": "2026-07-28T00:00:00Z"}, {"title": "COPPA Rule, 16 CFR Part 312 — FTC rule implementing COPPA (verifiable parental consent below 13)", "url": "https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312", "checkedAt": "2026-07-29T00:00:00Z"}]'::jsonb
WHERE "country_code" = 'US' AND "effective_at" = '2026-07-28T00:00:00Z';
