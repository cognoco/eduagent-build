-- [Bug #872] Add GDPR/COPPA audit metadata to consent_states so consent
-- records remain re-derivable after Cloudflare access logs roll over.
-- policy_version: value of env.CONSENT_POLICY_VERSION at the moment of the
--   request/response.
-- request_ip: parent client IP (cf-connecting-ip, x-forwarded-for fallback).
-- user_agent: parent client User-Agent header.
-- All three are NULLable because historical rows pre-dating this migration
-- have no captured value, and tests/dev environments may not supply headers.
ALTER TABLE "consent_states" ADD COLUMN "policy_version" text;--> statement-breakpoint
ALTER TABLE "consent_states" ADD COLUMN "request_ip" text;--> statement-breakpoint
ALTER TABLE "consent_states" ADD COLUMN "user_agent" text;
