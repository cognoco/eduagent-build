-- 0115_identity_cutover_reseed — CUT-A reseed extension (MMT-ADR-0020).
--
-- Extends the 0109 identity reseed to the CUT-A homes added by 0114:
--   (a) consent_states          -> consent_request          (id reuse, ALL statuses)
--   (b) profiles preference cols -> person                  (conversation_language,
--                                                             pronouns, avatar_url,
--                                                             default_app_context,
--                                                             archived_at)
--   (c) subscriptions store cols -> subscription            (Stripe/RevenueCat
--                                                             correlation + idempotency,
--                                                             trial_ends_at, cancelled_at)
--   (d) profiles.birth_year_set_by -> knowledge_assertions  (one 'age' assertion per
--                                                             person; + person.age_knowing
--                                                             cache)
--
-- The legacy tables are NOT modified — they remain the system of record until the
-- legacy-drop cutover. No runtime code reads the CUT-A homes at this commit
-- (IDENTITY_V2_ENABLED lands in CUT-B1, default off), so this is a pure
-- data-staging step.
--
-- Design properties (mirror 0109 exactly):
--   * SINGLE STATEMENT — one DO $$ block → neon-serverless applies it as one
--     atomic transaction.
--   * IDEMPOTENT + CONVERGENT — deterministic ids (consent_request.id =
--     consent_states.id; person/subscription keyed by id; knowledge_assertions.id
--     = person.id) with mirror-deletes FIRST, then ON CONFLICT (id) DO UPDATE ...
--     WHERE ... IS DISTINCT FROM ... so a re-run immediately before the drop tops
--     up new rows and converges changed rows.
--   * Lands once as a migration on dev/stg; the WI-586 convergence runbook
--     re-executes this DO block at the freeze, exactly as it re-runs 0109's.
--
-- Deterministic id map (extends 0109's):
--   consent_request.id    = consent_states.id   (every status; reuse preserves the
--                                                 1:1 forward/reverse verify check)
--   knowledge_assertions.id = person.id          (one backfill 'age' row per person;
--                                                 post-flip live writes append fresh
--                                                 UUIDs and are never touched here)
--
-- ## Rollback
-- This migration writes data only into the CUT-A homes (0114 objects) and the
-- backfill-owned knowledge_assertions rows (id = person.id). It does NOT touch
-- legacy tables or any pre-existing row. Reversal is by truncating the populated
-- CUT-A homes (or dropping them via 0114's rollback) — no legacy data is altered,
-- so there is nothing to restore. Re-running the forward block converges.

DO $$
BEGIN

  -- =========================================================================
  -- (a) consent_states -> consent_request (id reuse; ALL statuses, including the
  --     PENDING / PARENTAL_CONSENT_REQUESTED rows 0109 deliberately skips).
  --     Dual-row coexistence maps cleanly: a profile holding both a GDPR and a
  --     COPPA consent_states row yields two consent_request rows (id reuse, one
  --     per requested_basis) — collision-free under the basis-keyed unique.
  -- =========================================================================

  -- Mirror-delete FIRST: a consent_request whose source consent_states row no
  -- longer exists (or whose charge person is no longer reseeded) is removed, so
  -- a re-run converges on the legacy truth. Safe: no runtime writer of
  -- consent_request exists at this commit, so every row is reseed-sourced
  -- (id = consent_states.id).
  DELETE FROM consent_request cr
  WHERE NOT EXISTS (
    SELECT 1 FROM consent_states cs
    JOIN person per ON per.id = cs.profile_id
    WHERE cs.id = cr.id
  );

  -- charge_person_id FKs to person(id). Only consent_states rows whose profile
  -- was reseeded into person (person.id = profiles.id) can produce a request —
  -- the JOIN person guard prevents the 23503 FK violation for a consent_states
  -- row whose profile is not (yet) reseeded. At the convergence run 0109
  -- repopulates person for ALL live profiles immediately before this block, so
  -- every live consent_states row is covered there; the guard only excludes
  -- rows whose profile genuinely does not exist as a person (orphan/test data
  -- that 0109 itself does not reseed). The verify script's forward check is
  -- scoped identically (consent_states rows that HAVE a person).
  INSERT INTO consent_request (
    id, charge_person_id, organization_id, purpose, requested_basis,
    guardian_email, status, token, token_expires_at,
    resend_count, recipient_change_count, policy_version, request_ip, user_agent,
    requested_at, responded_at, consent_grant_id, created_at, updated_at
  )
  SELECT
    cs.id,
    cs.profile_id,
    p.account_id,
    'platform_use',
    CASE cs.consent_type::text
      WHEN 'COPPA' THEN 'coppa_parental_consent'
      ELSE 'gdpr_parental_consent'
    END,
    cs.parent_email,
    CASE cs.status::text
      WHEN 'PENDING'                    THEN 'pending'
      WHEN 'PARENTAL_CONSENT_REQUESTED' THEN 'requested'
      ELSE 'approved'  -- CONSENTED and WITHDRAWN (see 0114 / §1.2 rationale)
    END,
    CASE WHEN cs.status::text = 'PARENTAL_CONSENT_REQUESTED' THEN cs.consent_token END,
    CASE WHEN cs.status::text = 'PARENTAL_CONSENT_REQUESTED' THEN cs.expires_at END,
    cs.resend_count,
    cs.recipient_change_count,
    cs.policy_version,
    cs.request_ip,
    cs.user_agent,
    CASE WHEN cs.status::text <> 'PENDING' THEN cs.requested_at END,
    cs.responded_at,
    -- grant id = cs.id for the rows 0109 mapped into consent_grant (CONSENTED /
    -- WITHDRAWN). cg.id is LEFT-joined so the back-link is set only when the
    -- grant row actually exists (consent_grant_id FK target) — convergent and
    -- FK-safe even if 0109 has not yet (re)created the grant in a partial state.
    cg.id,
    cs.created_at,
    cs.updated_at
  FROM consent_states cs
  JOIN profiles p  ON p.id   = cs.profile_id
  JOIN person   per ON per.id = cs.profile_id  -- FK guard: charge_person_id must exist
  LEFT JOIN consent_grant cg
    ON cg.id = cs.id AND cs.status::text IN ('CONSENTED', 'WITHDRAWN')
  ON CONFLICT (id) DO UPDATE SET
    -- The legacy row mutates in place through status transitions, so every
    -- derived field must converge, not just status.
    charge_person_id   = excluded.charge_person_id,
    organization_id    = excluded.organization_id,
    requested_basis    = excluded.requested_basis,
    guardian_email     = excluded.guardian_email,
    status             = excluded.status,
    token              = excluded.token,
    token_expires_at   = excluded.token_expires_at,
    resend_count       = excluded.resend_count,
    recipient_change_count = excluded.recipient_change_count,
    policy_version     = excluded.policy_version,
    request_ip         = excluded.request_ip,
    user_agent         = excluded.user_agent,
    requested_at       = excluded.requested_at,
    responded_at       = excluded.responded_at,
    consent_grant_id   = excluded.consent_grant_id,
    updated_at         = excluded.updated_at
  WHERE (consent_request.charge_person_id, consent_request.organization_id,
         consent_request.requested_basis, consent_request.guardian_email,
         consent_request.status, consent_request.token,
         consent_request.token_expires_at, consent_request.resend_count,
         consent_request.recipient_change_count, consent_request.policy_version,
         consent_request.request_ip, consent_request.user_agent,
         consent_request.requested_at, consent_request.responded_at,
         consent_request.consent_grant_id, consent_request.updated_at)
    IS DISTINCT FROM
        (excluded.charge_person_id, excluded.organization_id,
         excluded.requested_basis, excluded.guardian_email,
         excluded.status, excluded.token,
         excluded.token_expires_at, excluded.resend_count,
         excluded.recipient_change_count, excluded.policy_version,
         excluded.request_ip, excluded.user_agent,
         excluded.requested_at, excluded.responded_at,
         excluded.consent_grant_id, excluded.updated_at);

  -- =========================================================================
  -- (b) profiles preference/lifecycle re-homes -> person (converges with legacy)
  -- =========================================================================
  UPDATE person per SET
    conversation_language = p.conversation_language,
    pronouns              = p.pronouns,
    avatar_url            = p.avatar_url,
    default_app_context   = p.default_app_context,
    archived_at           = p.archived_at
  FROM profiles p
  WHERE p.id = per.id
    AND (per.conversation_language, per.pronouns, per.avatar_url,
         per.default_app_context, per.archived_at)
        IS DISTINCT FROM
        (p.conversation_language, p.pronouns, p.avatar_url,
         p.default_app_context, p.archived_at);

  -- =========================================================================
  -- (c) subscriptions store-correlation columns -> subscription (converges;
  --     owned accounts only — the subscription rows 0109 created have
  --     subscription.id = subscriptions.id, so a plain id-join is owned-only).
  -- =========================================================================
  UPDATE subscription sn SET
    stripe_customer_id                 = s.stripe_customer_id,
    stripe_subscription_id             = s.stripe_subscription_id,
    last_stripe_event_id               = s.last_stripe_event_id,
    last_stripe_event_timestamp        = s.last_stripe_event_timestamp,
    revenuecat_original_app_user_id    = s.revenuecat_original_app_user_id,
    last_revenuecat_event_id           = s.last_revenuecat_event_id,
    last_revenuecat_event_timestamp_ms = s.last_revenuecat_event_timestamp_ms,
    trial_ends_at                      = s.trial_ends_at,
    cancelled_at                       = s.cancelled_at
  FROM subscriptions s
  WHERE s.id = sn.id
    AND (sn.stripe_customer_id, sn.stripe_subscription_id,
         sn.last_stripe_event_id, sn.last_stripe_event_timestamp,
         sn.revenuecat_original_app_user_id, sn.last_revenuecat_event_id,
         sn.last_revenuecat_event_timestamp_ms, sn.trial_ends_at, sn.cancelled_at)
        IS DISTINCT FROM
        (s.stripe_customer_id, s.stripe_subscription_id,
         s.last_stripe_event_id, s.last_stripe_event_timestamp,
         s.revenuecat_original_app_user_id, s.last_revenuecat_event_id,
         s.last_revenuecat_event_timestamp_ms, s.trial_ends_at, s.cancelled_at);

  -- =========================================================================
  -- (d) profiles.birth_year_set_by -> knowledge_assertions ('age' axis)
  --     Deterministic id = person.id; exactly one backfill row per person.
  --     v1.7: field-convergent DO UPDATE (NOT DO NOTHING) — birth_year_set_by
  --     can change between rehearsal and freeze. Safe to update: the backfill
  --     OWNS the id = person.id row; post-flip live writes append fresh UUIDs
  --     and are never touched by this upsert.
  -- =========================================================================
  INSERT INTO knowledge_assertions (
    id, person_id, axis, method, confidence, source, asserted_at, actor_id
  )
  SELECT
    p.id,
    p.id,
    'age',
    CASE WHEN p.birth_year_set_by IS NOT NULL AND p.birth_year_set_by <> p.id
         THEN 'parent_reported' ELSE 'self_report' END,
    CASE WHEN p.birth_year_set_by IS NOT NULL AND p.birth_year_set_by <> p.id
         THEN 1.00 ELSE 0.80 END,  -- provisional (OQ-9); DB-mastered thereafter
    'reseed_cutover_backfill',
    p.created_at,
    p.birth_year_set_by
  FROM profiles p
  -- Only persons reseeded by 0109 (person.id = profiles.id) can receive the
  -- assertion (person_id / actor_id FK to person).
  JOIN person per ON per.id = p.id
  ON CONFLICT (id) DO UPDATE SET
    method      = excluded.method,
    confidence  = excluded.confidence,
    asserted_at = excluded.asserted_at,
    actor_id    = excluded.actor_id
  WHERE (knowledge_assertions.method, knowledge_assertions.confidence,
         knowledge_assertions.asserted_at, knowledge_assertions.actor_id)
    IS DISTINCT FROM
        (excluded.method, excluded.confidence,
         excluded.asserted_at, excluded.actor_id);

  -- person.age_knowing cache — mirror the backfilled assertion's
  -- {method, confidence, last_updated} so the cached state matches the row.
  UPDATE person per SET
    age_knowing = jsonb_build_object(
      'method',       ka.method,
      'confidence',   ka.confidence::float8,
      'last_updated', to_char(ka.asserted_at AT TIME ZONE 'UTC',
                              'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  FROM knowledge_assertions ka
  WHERE ka.id = per.id
    AND ka.axis = 'age'
    AND per.age_knowing IS DISTINCT FROM jsonb_build_object(
      'method',       ka.method,
      'confidence',   ka.confidence::float8,
      'last_updated', to_char(ka.asserted_at AT TIME ZONE 'UTC',
                              'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );

END $$;
